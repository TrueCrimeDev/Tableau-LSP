import * as path from 'path';
import * as vscode from 'vscode';
import {
    WORKBOOK_FIELD_CONTEXT_NOTIFICATION,
    WorkbookFieldContext,
    buildWorkbookFieldContext,
} from './workbookFieldContext.js';
import JSZip from 'jszip';
import type { LanguageClient } from 'vscode-languageclient/node';
import { TextDecoder } from 'util';
import { setFieldCatalog } from './fieldCatalog.js';

function isWorkbookUri(uri: vscode.Uri | undefined): uri is vscode.Uri {
    if (!uri) {
        return false;
    }
    const lower = uri.path.toLowerCase();
    return lower.endsWith('.twb') || lower.endsWith('.twbx');
}

function tabUri(tab: vscode.Tab | undefined): vscode.Uri | undefined {
    const input = tab?.input as { uri?: vscode.Uri } | null | undefined;
    return input?.uri;
}

export interface WorkbookXmlSource {
    xml: string;
    workbookName: string;
}

/** Read either a plain workbook or the first workbook inside a packaged TWBX. */
export async function readWorkbookXml(uri: vscode.Uri): Promise<WorkbookXmlSource> {
    const lower = uri.path.toLowerCase();
    if (lower.endsWith('.twbx')) {
        const data = await vscode.workspace.fs.readFile(uri);
        const zip = await JSZip.loadAsync(Buffer.from(data));
        const entries = Object.entries(zip.files)
            .filter(([entryPath, entry]) => !entry.dir && entryPath.toLowerCase().endsWith('.twb'))
            .sort(([left], [right]) => left.localeCompare(right));
        if (entries.length === 0) {
            throw new Error('No .twb workbook was found inside the .twbx package.');
        }
        return {
            xml: await entries[0][1].async('string'),
            workbookName: path.basename(entries[0][0]),
        };
    }

    const openDocument = vscode.workspace.textDocuments.find(
        document => document.uri.toString() === uri.toString()
    );
    if (openDocument) {
        return { xml: openDocument.getText(), workbookName: path.basename(uri.fsPath) };
    }
    const data = await vscode.workspace.fs.readFile(uri);
    return {
        xml: new TextDecoder('utf-8').decode(data),
        workbookName: path.basename(uri.fsPath),
    };
}

/**
 * Keeps the active workbook's datasource metadata available to extension-host
 * features and mirrors it into the separate language-server process.
 */
export class WorkbookFieldContextManager implements vscode.Disposable {
    private readonly contexts = new Map<string, WorkbookFieldContext>();
    private readonly disposables: vscode.Disposable[] = [];
    private readonly refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly indexGenerations = new Map<string, number>();
    private activeWorkbookUri: string | undefined;
    private activationGeneration = 0;
    private disposed = false;

    public constructor(private readonly getClient: () => LanguageClient | undefined) {
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.{twb,twbx}');
        const definitionWatcher = vscode.workspace.createFileSystemWatcher('**/fields.d.twbl');
        this.disposables.push(
            watcher,
            definitionWatcher,
            watcher.onDidCreate(uri => { this.scheduleIndex(uri); }),
            watcher.onDidChange(uri => { this.scheduleIndex(uri); }),
            watcher.onDidDelete(uri => { this.removeWorkbook(uri); }),
            definitionWatcher.onDidCreate(() => { void this.publishActiveContext(); }),
            definitionWatcher.onDidChange(() => { void this.publishActiveContext(); }),
            definitionWatcher.onDidDelete(() => { void this.publishActiveContext(); }),
            vscode.workspace.onDidOpenTextDocument(document => {
                if (isWorkbookUri(document.uri)) {
                    void this.indexWorkbook(document.uri, this.shouldActivate(document.uri));
                }
            }),
            vscode.workspace.onDidSaveTextDocument(document => {
                if (isWorkbookUri(document.uri)) {
                    void this.indexWorkbook(document.uri, this.shouldActivate(document.uri));
                }
            }),
            vscode.workspace.onDidChangeTextDocument(event => {
                if (isWorkbookUri(event.document.uri)) {
                    this.scheduleIndex(event.document.uri, 400);
                }
            }),
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (isWorkbookUri(editor?.document.uri)) {
                    void this.indexWorkbook(editor.document.uri, true);
                } else if (!this.activeWorkbookUri) {
                    // With no live workbook selected, fields.d.twbl is scoped to
                    // the active calculation's workspace folder. Re-publish when
                    // the user crosses roots so the server never keeps another
                    // root's fallback declarations.
                    void this.publishActiveContext();
                }
            }),
            vscode.window.tabGroups.onDidChangeTabs(event => {
                const activeTab = event.changed.find(tab => tab.isActive);
                const uri = tabUri(activeTab);
                if (isWorkbookUri(uri)) {
                    void this.indexWorkbook(uri, true);
                } else if (activeTab && !this.activeWorkbookUri) {
                    void this.publishActiveContext();
                }
            })
        );
    }

    public async initialize(): Promise<void> {
        const activeUri = vscode.window.activeTextEditor?.document.uri;
        if (isWorkbookUri(activeUri)) {
            await this.indexWorkbook(activeUri, true);
            return;
        }

        const activeTabUri = tabUri(vscode.window.tabGroups.activeTabGroup.activeTab ?? undefined);
        if (isWorkbookUri(activeTabUri)) {
            await this.indexWorkbook(activeTabUri, true);
            return;
        }

        const openWorkbooks = vscode.workspace.textDocuments.filter(document => isWorkbookUri(document.uri));
        if (openWorkbooks.length === 1) {
            await this.indexWorkbook(openWorkbooks[0].uri, true);
            return;
        }
        if (openWorkbooks.length > 1) {
            await this.publishActiveContext();
            return;
        }

        // A calculation file is commonly opened without its workbook. Discover a
        // deterministic workspace workbook so IntelliSense still has field data.
        const candidates = await vscode.workspace.findFiles(
            '**/*.{twb,twbx}',
            '**/{node_modules,.git,.worktrees}/**',
            25
        );
        candidates.sort((left, right) => left.fsPath.localeCompare(right.fsPath));
        if (candidates.length === 1) {
            await this.indexWorkbook(candidates[0], true);
        } else {
            // Multiple workbooks are ambiguous. Wait until the user opens the
            // intended workbook instead of silently feeding the wrong schema
            // to completion, hover and diagnostics.
            await this.publishActiveContext();
        }
    }

    public async syncLanguageServer(): Promise<void> {
        await this.publishActiveContext();
    }

    public getActiveContext(): WorkbookFieldContext | undefined {
        return this.activeWorkbookUri ? this.contexts.get(this.activeWorkbookUri) : undefined;
    }

    /** Connect a workbook discovered outside the current VS Code workspace. */
    public async connectWorkbook(uri: vscode.Uri): Promise<void> {
        if (!isWorkbookUri(uri)) {
            throw new Error('Only .twb and .twbx workbooks can provide Tableau field context.');
        }
        await this.indexWorkbook(uri, true);
    }

    public getActiveWorkbookPath(): string | undefined {
        return this.activeWorkbookUri
            ? vscode.Uri.parse(this.activeWorkbookUri).fsPath
            : undefined;
    }

    private shouldActivate(uri: vscode.Uri): boolean {
        const key = uri.toString();
        const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
        if (activeEditorUri) {
            return isWorkbookUri(activeEditorUri) && activeEditorUri.toString() === key;
        }
        const activeTabUri = tabUri(vscode.window.tabGroups.activeTabGroup.activeTab ?? undefined);
        if (activeTabUri) {
            return isWorkbookUri(activeTabUri) && activeTabUri.toString() === key;
        }
        return !this.activeWorkbookUri || this.activeWorkbookUri === key;
    }

    private shouldRefreshActiveContext(uri: vscode.Uri): boolean {
        const key = uri.toString();
        const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
        if (isWorkbookUri(activeEditorUri)) {
            return activeEditorUri.toString() === key;
        }
        const activeTabUri = tabUri(vscode.window.tabGroups.activeTabGroup.activeTab ?? undefined);
        if (isWorkbookUri(activeTabUri)) {
            return activeTabUri.toString() === key;
        }
        return this.activeWorkbookUri === key;
    }

    private scheduleIndex(uri: vscode.Uri, delay = 150): void {
        const key = uri.toString();
        const existing = this.refreshTimers.get(key);
        if (existing) {
            clearTimeout(existing);
        }
        this.refreshTimers.set(key, setTimeout(() => {
            this.refreshTimers.delete(key);
            const activate = this.shouldRefreshActiveContext(uri);
            void this.indexWorkbook(uri, activate);
        }, delay));
    }

    private async indexWorkbook(uri: vscode.Uri, makeActive: boolean): Promise<void> {
        if (this.disposed || !isWorkbookUri(uri)) {
            return;
        }
        const key = uri.toString();
        const indexGeneration = (this.indexGenerations.get(key) ?? 0) + 1;
        this.indexGenerations.set(key, indexGeneration);
        const generation = makeActive ? ++this.activationGeneration : this.activationGeneration;
        try {
            const source = await readWorkbookXml(uri);
            if (this.indexGenerations.get(key) !== indexGeneration) {
                return;
            }
            const sourceUri = uri.path.toLowerCase().endsWith('.twb') ? uri.toString() : undefined;
            const context = buildWorkbookFieldContext(source.xml, source.workbookName, sourceUri);
            this.contexts.set(key, context);
            if (makeActive && generation === this.activationGeneration) {
                this.activeWorkbookUri = key;
                await this.publishActiveContext();
            }
        } catch (error) {
            if (this.indexGenerations.get(key) !== indexGeneration) {
                return;
            }
            console.warn(
                `Tableau LSP: Could not index datasource fields from ${uri.fsPath}:`,
                error
            );
            if (makeActive && generation === this.activationGeneration) {
                // Tableau and cloud-sync clients may briefly expose a partial or
                // locked file during an atomic save. Retain a successfully parsed
                // schema instead of clearing every completion/diagnostic on that
                // transient read failure. An empty authoritative context is only
                // appropriate when this workbook has never indexed successfully.
                if (!this.contexts.has(key)) {
                    this.contexts.set(key, {
                        workbook: path.basename(uri.fsPath),
                        sourceUri: uri.path.toLowerCase().endsWith('.twb') ? key : undefined,
                        fields: [],
                        definitions: [],
                    });
                }
                this.activeWorkbookUri = key;
                await this.publishActiveContext();
            }
        }
    }

    private removeWorkbook(uri: vscode.Uri): void {
        const key = uri.toString();
        const pendingRefresh = this.refreshTimers.get(key);
        if (pendingRefresh) {
            clearTimeout(pendingRefresh);
            this.refreshTimers.delete(key);
        }
        this.indexGenerations.set(key, (this.indexGenerations.get(key) ?? 0) + 1);
        this.contexts.delete(key);
        if (this.activeWorkbookUri !== key) {
            return;
        }
        const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
        const activeTabUri = tabUri(vscode.window.tabGroups.activeTabGroup.activeTab ?? undefined);
        const visibleWorkbookUri = isWorkbookUri(activeEditorUri)
            ? activeEditorUri
            : isWorkbookUri(activeTabUri)
                ? activeTabUri
                : undefined;
        const visibleKey = visibleWorkbookUri?.toString();
        if (visibleKey && this.contexts.has(visibleKey)) {
            this.activeWorkbookUri = visibleKey;
        } else if (this.contexts.size === 1) {
            this.activeWorkbookUri = this.contexts.keys().next().value;
        } else {
            this.activeWorkbookUri = undefined;
        }
        void this.publishActiveContext();
    }

    private async publishActiveContext(): Promise<void> {
        const context = this.getActiveContext();
        const plainFields = context?.fields.filter(field => field.kind === 'field') ?? [];
        setFieldCatalog(plainFields.map(field => ({
            name: field.name,
            datatype: field.datatype,
            role: field.role,
            datasource: field.datasource,
        })));

        const client = this.getClient();
        if (!client) {
            return;
        }
        try {
            await client.sendNotification(WORKBOOK_FIELD_CONTEXT_NOTIFICATION, {
                workbook: context?.workbook ?? '',
                sourceUri: context?.sourceUri,
                fields: context?.definitions ?? [],
                datasourceFields: context?.fields ?? [],
                definitionPath: this.activeDefinitionPath(),
            });
        } catch (error) {
            console.warn('Tableau LSP: Could not synchronize workbook fields with the language server:', error);
        }
    }

    private activeDefinitionPath(): string | null {
        let folder: vscode.WorkspaceFolder | undefined;
        if (this.activeWorkbookUri) {
            folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(this.activeWorkbookUri));
        } else {
            const activeResource = vscode.window.activeTextEditor?.document.uri ??
                tabUri(vscode.window.tabGroups.activeTabGroup.activeTab ?? undefined);
            if (activeResource) {
                folder = vscode.workspace.getWorkspaceFolder(activeResource);
            }
            if (!folder && vscode.workspace.workspaceFolders?.length === 1) {
                folder = vscode.workspace.workspaceFolders[0];
            }
        }
        return folder ? vscode.Uri.joinPath(folder.uri, 'fields.d.twbl').fsPath : null;
    }

    public dispose(): void {
        this.disposed = true;
        this.activationGeneration++;
        for (const timer of this.refreshTimers.values()) {
            clearTimeout(timer);
        }
        this.refreshTimers.clear();
        this.indexGenerations.clear();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
        this.contexts.clear();
        setFieldCatalog([]);
    }
}
