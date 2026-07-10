import * as path from 'path';
import * as vscode from 'vscode';
import {
    LocalTableauConnectorHub,
    LocalTableauSnapshot,
    TableauLocalArtifact,
} from '../services/localTableauConnectors.js';
import type { WorkbookFieldContextManager } from '../services/workbookFieldContextManager.js';

interface WorkbookPick extends vscode.QuickPickItem {
    filePath: string;
}

function createConnectorHub(): LocalTableauConnectorHub {
    const config = vscode.workspace.getConfiguration('tableau-language-support');
    const repositoryRoots = config.get<string[]>('local.repositoryPaths', []);
    const executablePath = config.get<string>('local.executablePath', '').trim();
    return new LocalTableauConnectorHub({
        repositoryRoots: repositoryRoots.length ? repositoryRoots : undefined,
        executablePath: executablePath || undefined,
        maxArtifactsPerKind: config.get<number>('local.maxArtifactsPerKind', 50),
    });
}

function isWorkbookPath(filePath: string | undefined): filePath is string {
    return Boolean(filePath && /\.(?:twb|twbx)$/i.test(filePath));
}

function activeWorkbookPath(): string | undefined {
    const editorPath = vscode.window.activeTextEditor?.document.uri.fsPath;
    if (isWorkbookPath(editorPath)) {
        return editorPath;
    }
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input as { uri?: vscode.Uri } | undefined;
    return isWorkbookPath(input?.uri?.fsPath) ? input.uri.fsPath : undefined;
}

function workbookArtifacts(snapshot: LocalTableauSnapshot): TableauLocalArtifact[] {
    return snapshot.artifacts.filter(
        artifact => artifact.kind === 'workbook' || artifact.kind === 'packaged-workbook'
    );
}

async function workspaceWorkbookPaths(): Promise<string[]> {
    const uris = await vscode.workspace.findFiles(
        '**/*.{twb,twbx}',
        '**/{node_modules,.git,.worktrees}/**',
        100
    );
    return uris.map(uri => uri.fsPath);
}

async function pickWorkbook(snapshot: LocalTableauSnapshot, placeHolder: string): Promise<string | undefined> {
    const repositoryItems = workbookArtifacts(snapshot).map<WorkbookPick>(artifact => ({
        label: `$(book) ${path.basename(artifact.filePath)}`,
        description: path.dirname(artifact.filePath),
        detail: `Tableau repository • modified ${new Date(artifact.modifiedAt).toLocaleString()}`,
        filePath: artifact.filePath,
    }));
    const repositoryPaths = new Set(repositoryItems.map(item => path.resolve(item.filePath).toLowerCase()));
    const workspaceItems = (await workspaceWorkbookPaths())
        .filter(filePath => !repositoryPaths.has(path.resolve(filePath).toLowerCase()))
        .map<WorkbookPick>(filePath => ({
            label: `$(file) ${path.basename(filePath)}`,
            description: path.dirname(filePath),
            detail: 'VS Code workspace',
            filePath,
        }));
    const items = [...workspaceItems, ...repositoryItems];
    if (!items.length) {
        void vscode.window.showWarningMessage('No local Tableau workbooks were found. Configure a repository path in Tableau settings.');
        return undefined;
    }
    return (await vscode.window.showQuickPick(items, { placeHolder, matchOnDescription: true, matchOnDetail: true }))?.filePath;
}

function formatSnapshot(snapshot: LocalTableauSnapshot, activeContext: string | undefined): string[] {
    const count = (kind: TableauLocalArtifact['kind']): number =>
        snapshot.artifacts.filter(artifact => artifact.kind === kind).length;
    const lines = [
        `Tableau Desktop: ${snapshot.desktopRunning ? 'running' : 'not running'}`,
        `Active LSP workbook: ${activeContext ?? 'none'}`,
        '',
        `Installations (${String(snapshot.installations.length)})`,
        ...snapshot.installations.map(installation =>
            `  • ${installation.displayName} — ${installation.executablePath}`
        ),
        '',
        `Repositories (${String(snapshot.repositories.length)})`,
        ...snapshot.repositories.map(repository => `  • ${repository.rootPath}`),
        '',
        'Discovered local artifacts',
        `  • Workbooks: ${String(count('workbook') + count('packaged-workbook'))}`,
        `  • Datasources: ${String(count('datasource') + count('packaged-datasource'))}`,
        `  • Connector packages: ${String(count('connector'))}`,
        `  • Hyper extracts: ${String(count('extract'))}`,
        `  • Logs: ${String(count('log'))}`,
        '',
        'Recent workbooks',
        ...workbookArtifacts(snapshot).slice(0, 10).map(artifact => `  • ${artifact.filePath}`),
    ];
    return lines;
}

export function registerLocalTableauCommands(
    context: vscode.ExtensionContext,
    getFieldContextManager: () => WorkbookFieldContextManager | undefined
): void {
    const output = vscode.window.createOutputChannel('Tableau Local Connectors');

    const connectWorkbook = vscode.commands.registerCommand(
        'tableau-language-support.local.connectWorkbook',
        async () => {
            const manager = getFieldContextManager();
            if (!manager) {
                void vscode.window.showErrorMessage('The Tableau workbook field connector is not ready yet. Restart the language server and try again.');
                return;
            }
            const hub = createConnectorHub();
            const workbookPath = await pickWorkbook(await hub.discover(), 'Connect a local workbook to IntelliSense and @tableau chat');
            if (!workbookPath) {
                return;
            }
            await manager.connectWorkbook(vscode.Uri.file(workbookPath));
            if (workbookPath.toLowerCase().endsWith('.twb')) {
                const document = await vscode.workspace.openTextDocument(vscode.Uri.file(workbookPath));
                await vscode.window.showTextDocument(document, { preview: false });
            }
            void vscode.window.showInformationMessage(`Connected Tableau field context: ${path.basename(workbookPath)}`);
        }
    );

    const openInDesktop = vscode.commands.registerCommand(
        'tableau-language-support.local.openInDesktop',
        async () => {
            const hub = createConnectorHub();
            const snapshot = await hub.discover();
            const workbookPath = activeWorkbookPath() ??
                await pickWorkbook(snapshot, 'Open a local workbook in Tableau Desktop');
            if (!workbookPath) {
                return;
            }
            try {
                const executable = await hub.launchWorkbook(workbookPath);
                void vscode.window.showInformationMessage(
                    `Opened ${path.basename(workbookPath)} with ${path.basename(path.dirname(path.dirname(executable)))}`
                );
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                void vscode.window.showErrorMessage(`Could not open Tableau Desktop: ${message}`);
            }
        }
    );

    const showStatus = vscode.commands.registerCommand(
        'tableau-language-support.local.showStatus',
        async () => {
            const snapshot = await createConnectorHub().discover();
            output.clear();
            output.appendLine(`Tableau Local Connector Status — ${new Date(snapshot.discoveredAt).toLocaleString()}`);
            output.appendLine('='.repeat(72));
            for (const line of formatSnapshot(snapshot, getFieldContextManager()?.getActiveWorkbookPath())) {
                output.appendLine(line);
            }
            output.show(true);
        }
    );

    const openRepository = vscode.commands.registerCommand(
        'tableau-language-support.local.openRepository',
        async () => {
            const snapshot = await createConnectorHub().discover();
            const repositories = snapshot.repositories.map(repository => ({
                label: `$(folder) ${path.basename(repository.rootPath)}`,
                description: repository.rootPath,
                repository,
            }));
            const selected = repositories.length === 1
                ? repositories[0]
                : await vscode.window.showQuickPick(repositories, { placeHolder: 'Choose a Tableau repository' });
            if (!selected) {
                void vscode.window.showWarningMessage('No local Tableau repository was found.');
                return;
            }
            await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(selected.repository.rootPath));
        }
    );

    context.subscriptions.push(output, connectWorkbook, openInDesktop, showStatus, openRepository);
}
