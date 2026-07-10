import * as os from 'os';
import * as path from 'path';
import { execFile, spawn } from 'child_process';
import { promises as fs } from 'fs';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface TableauInstallation {
    displayName: string;
    version: string;
    installRoot: string;
    executablePath: string;
}

export interface TableauRepository {
    rootPath: string;
    workbooksPath: string;
    datasourcesPath: string;
    connectorsPath: string;
    logsPath: string;
}

export type TableauArtifactKind =
    | 'workbook'
    | 'packaged-workbook'
    | 'datasource'
    | 'packaged-datasource'
    | 'connector'
    | 'extract'
    | 'log';

export interface TableauLocalArtifact {
    kind: TableauArtifactKind;
    filePath: string;
    repositoryPath: string;
    size: number;
    modifiedAt: number;
}

export interface LocalTableauSnapshot {
    installations: TableauInstallation[];
    repositories: TableauRepository[];
    artifacts: TableauLocalArtifact[];
    desktopRunning: boolean;
    discoveredAt: number;
}

export interface LocalTableauConnectorOptions {
    environment?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    homeDirectory?: string;
    installationRoots?: string[];
    repositoryRoots?: string[];
    executablePath?: string;
    maxArtifactsPerKind?: number;
    maxScanDepth?: number;
    processProbe?: () => Promise<boolean>;
    now?: () => number;
}

function uniquePaths(values: (string | undefined)[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        if (!value) {
            continue;
        }
        const resolved = path.resolve(value);
        const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
        if (!seen.has(key)) {
            seen.add(key);
            result.push(resolved);
        }
    }
    return result;
}

async function exists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

function versionFromInstallationName(name: string): string {
    const match = /Tableau\s+(.+)$/i.exec(name);
    return match?.[1]?.trim() ?? name;
}

function compareVersionsDescending(left: TableauInstallation, right: TableauInstallation): number {
    return right.version.localeCompare(left.version, undefined, { numeric: true, sensitivity: 'base' });
}

export class TableauInstallationConnector {
    public constructor(private readonly options: LocalTableauConnectorOptions = {}) {}

    public async discover(): Promise<TableauInstallation[]> {
        const env = this.options.environment ?? process.env;
        const roots = uniquePaths(this.options.installationRoots ?? [
            env.ProgramFiles ? path.join(env.ProgramFiles, 'Tableau') : undefined,
            env['ProgramFiles(x86)'] ? path.join(env['ProgramFiles(x86)'], 'Tableau') : undefined,
        ]);
        const installations: TableauInstallation[] = [];

        if (this.options.executablePath && await exists(this.options.executablePath)) {
            const installRoot = path.dirname(path.dirname(this.options.executablePath));
            installations.push({
                displayName: path.basename(installRoot),
                version: versionFromInstallationName(path.basename(installRoot)),
                installRoot,
                executablePath: path.resolve(this.options.executablePath),
            });
        }

        for (const root of roots) {
            if (!await exists(root)) {
                continue;
            }
            const directExecutable = path.join(root, 'bin', 'tableau.exe');
            if (await exists(directExecutable)) {
                installations.push({
                    displayName: path.basename(root),
                    version: versionFromInstallationName(path.basename(root)),
                    installRoot: root,
                    executablePath: directExecutable,
                });
            }
            const entries = await fs.readdir(root, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory() || !/^Tableau(?:\s|$)/i.test(entry.name)) {
                    continue;
                }
                const installRoot = path.join(root, entry.name);
                const executablePath = path.join(installRoot, 'bin', 'tableau.exe');
                if (!await exists(executablePath)) {
                    continue;
                }
                installations.push({
                    displayName: entry.name,
                    version: versionFromInstallationName(entry.name),
                    installRoot,
                    executablePath,
                });
            }
        }

        const deduplicated = new Map<string, TableauInstallation>();
        for (const installation of installations) {
            deduplicated.set(path.resolve(installation.executablePath).toLowerCase(), installation);
        }
        return [...deduplicated.values()].sort(compareVersionsDescending);
    }
}

export class TableauRepositoryConnector {
    public constructor(private readonly options: LocalTableauConnectorOptions = {}) {}

    public candidateRoots(): string[] {
        const env = this.options.environment ?? process.env;
        const home = this.options.homeDirectory ?? os.homedir();
        if (this.options.repositoryRoots?.length) {
            return uniquePaths(this.options.repositoryRoots);
        }
        return uniquePaths([
            env.TABLEAU_REPOSITORY,
            env.OneDrive ? path.join(env.OneDrive, 'Documents', 'My Tableau Repository') : undefined,
            env.USERPROFILE ? path.join(env.USERPROFILE, 'Documents', 'My Tableau Repository') : undefined,
            path.join(home, 'Documents', 'My Tableau Repository'),
        ]);
    }

    public async discover(): Promise<TableauRepository[]> {
        const repositories: TableauRepository[] = [];
        for (const rootPath of this.candidateRoots()) {
            if (!await exists(rootPath)) {
                continue;
            }
            repositories.push({
                rootPath,
                workbooksPath: path.join(rootPath, 'Workbooks'),
                datasourcesPath: path.join(rootPath, 'Datasources'),
                connectorsPath: path.join(rootPath, 'Connectors'),
                logsPath: path.join(rootPath, 'Logs'),
            });
        }
        return repositories;
    }
}

interface ArtifactScanSpec {
    rootPath: string;
    extensions: Map<string, TableauArtifactKind>;
}

export class TableauArtifactConnector {
    private readonly maxArtifactsPerKind: number;
    private readonly maxScanDepth: number;

    public constructor(private readonly options: LocalTableauConnectorOptions = {}) {
        this.maxArtifactsPerKind = Math.max(1, options.maxArtifactsPerKind ?? 50);
        this.maxScanDepth = Math.max(1, options.maxScanDepth ?? 5);
    }

    public async discover(repositories: TableauRepository[]): Promise<TableauLocalArtifact[]> {
        const artifacts: TableauLocalArtifact[] = [];
        for (const repository of repositories) {
            const specs: ArtifactScanSpec[] = [
                {
                    rootPath: repository.workbooksPath,
                    extensions: new Map([
                        ['.twb', 'workbook'],
                        ['.twbx', 'packaged-workbook'],
                        ['.hyper', 'extract'],
                    ]),
                },
                {
                    rootPath: repository.datasourcesPath,
                    extensions: new Map([
                        ['.tds', 'datasource'],
                        ['.tdsx', 'packaged-datasource'],
                        ['.hyper', 'extract'],
                    ]),
                },
                {
                    rootPath: repository.connectorsPath,
                    extensions: new Map([['.taco', 'connector']]),
                },
                {
                    rootPath: repository.logsPath,
                    extensions: new Map([
                        ['.log', 'log'],
                        ['.txt', 'log'],
                    ]),
                },
            ];
            for (const spec of specs) {
                await this.scanDirectory(spec, repository.rootPath, artifacts, 0);
            }
        }
        return artifacts
            .sort((left, right) =>
                right.modifiedAt - left.modifiedAt || left.filePath.localeCompare(right.filePath)
            )
            .filter((artifact, index, all) => {
                const earlierOfKind = all.slice(0, index).filter(item => item.kind === artifact.kind).length;
                return earlierOfKind < this.maxArtifactsPerKind;
            });
    }

    private async scanDirectory(
        spec: ArtifactScanSpec,
        repositoryPath: string,
        artifacts: TableauLocalArtifact[],
        depth: number
    ): Promise<void> {
        if (depth > this.maxScanDepth || !await exists(spec.rootPath)) {
            return;
        }
        const entries = await fs.readdir(spec.rootPath, { withFileTypes: true });
        for (const entry of entries) {
            const filePath = path.join(spec.rootPath, entry.name);
            if (entry.isDirectory()) {
                await this.scanDirectory(
                    { ...spec, rootPath: filePath },
                    repositoryPath,
                    artifacts,
                    depth + 1
                );
                continue;
            }
            if (!entry.isFile()) {
                continue;
            }
            const kind = spec.extensions.get(path.extname(entry.name).toLowerCase());
            if (!kind) {
                continue;
            }
            const stats = await fs.stat(filePath);
            artifacts.push({
                kind,
                filePath,
                repositoryPath,
                size: stats.size,
                modifiedAt: stats.mtimeMs,
            });
        }
    }
}

export function taskListContainsTableau(stdout: string): boolean {
    return stdout.split(/\r?\n/).some(line => /^"?tableau\.exe"?[,\s]/i.test(line.trim()));
}

export class TableauDesktopProcessConnector {
    public constructor(private readonly options: LocalTableauConnectorOptions = {}) {}

    public async discover(): Promise<boolean> {
        if (this.options.processProbe) {
            return this.options.processProbe();
        }
        if ((this.options.platform ?? process.platform) !== 'win32') {
            return false;
        }
        try {
            const { stdout } = await execFileAsync(
                'tasklist',
                ['/fo', 'csv', '/nh', '/fi', 'imagename eq tableau.exe'],
                { windowsHide: true, timeout: 3000 }
            );
            return taskListContainsTableau(stdout);
        } catch {
            return false;
        }
    }
}

export class LocalTableauConnectorHub {
    private readonly installationConnector: TableauInstallationConnector;
    private readonly repositoryConnector: TableauRepositoryConnector;
    private readonly artifactConnector: TableauArtifactConnector;
    private readonly processConnector: TableauDesktopProcessConnector;

    public constructor(private readonly options: LocalTableauConnectorOptions = {}) {
        this.installationConnector = new TableauInstallationConnector(options);
        this.repositoryConnector = new TableauRepositoryConnector(options);
        this.artifactConnector = new TableauArtifactConnector(options);
        this.processConnector = new TableauDesktopProcessConnector(options);
    }

    public async discover(): Promise<LocalTableauSnapshot> {
        const [installations, repositories, desktopRunning] = await Promise.all([
            this.installationConnector.discover(),
            this.repositoryConnector.discover(),
            this.processConnector.discover(),
        ]);
        const artifacts = await this.artifactConnector.discover(repositories);
        return {
            installations,
            repositories,
            artifacts,
            desktopRunning,
            discoveredAt: this.options.now?.() ?? Date.now(),
        };
    }

    public async launchWorkbook(workbookPath: string, executablePath?: string): Promise<string> {
        if (!/\.(?:twb|twbx)$/i.test(workbookPath)) {
            throw new Error('Only .twb and .twbx files can be opened in Tableau Desktop.');
        }
        if (!await exists(workbookPath)) {
            throw new Error(`Workbook not found: ${workbookPath}`);
        }
        let selectedExecutable = executablePath ?? this.options.executablePath;
        selectedExecutable ??= (await this.installationConnector.discover())[0]?.executablePath;
        if (!selectedExecutable || !await exists(selectedExecutable)) {
            throw new Error('No Tableau Desktop executable was found. Configure tableau-language-support.local.executablePath.');
        }
        const child = spawn(selectedExecutable, [workbookPath], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
        });
        child.unref();
        return selectedExecutable;
    }
}
