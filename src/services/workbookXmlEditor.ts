import * as vscode from 'vscode';
import { basename, dirname } from 'path';
import { createHash } from 'crypto';
import { readWorkbookXml } from './workbookFieldContextManager.js';
import { WorkbookEditService } from './workbookEditService.js';
import { WorkbookXmlSession } from './workbookXmlSession.js';
import { bindWorkbookSource, resolveWorkbookSourceUri, unbindWorkbookSource } from './workbookUri.js';

const scheme = 'tableau-workbook';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const bindingsStateKey = 'tableau.workbookXmlEditors.v1';
const xmlHash = (xml: string) => createHash('sha256').update(xml, 'utf8').digest('hex');
const conflictMessage = 'The package changed outside this XML editor. Preserve your draft with Save a Workbook Copy, then revert or close the XML tab and run Edit Workbook XML to reload the current package before saving.';

interface StoredBinding {
    editorUri: string;
    sourceUri: string;
    xmlHash: string;
}

interface EditorSession {
    uri: vscode.Uri;
    session: WorkbookXmlSession;
    mtime: number;
    watcher: vscode.FileSystemWatcher;
    conflict: boolean;
    saving: number;
}

/** A native VS Code XML editor whose Save writes back into the original TWBX. */
export class WorkbookXmlEditor implements vscode.FileSystemProvider, vscode.Disposable {
    private readonly changes = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    public readonly onDidChangeFile = this.changes.event;
    private readonly sessions = new Map<string, EditorSession>();
    private readonly bindings = new Map<string, StoredBinding>();
    private readonly loading = new Map<string, Promise<EditorSession>>();
    private pendingStateWrite: Promise<void> = Promise.resolve();
    private disposed = false;

    public constructor(private readonly workspaceState?: vscode.Memento) {
        // Hydrate source identities before the filesystem provider is registered;
        // VS Code may immediately request stat/readFile for restored editor tabs.
        const stored: unknown = workspaceState?.get(bindingsStateKey, []);
        if (!Array.isArray(stored)) { return; }
        for (const binding of stored) {
            if (!binding || typeof binding.editorUri !== 'string' || typeof binding.sourceUri !== 'string' ||
                typeof binding.xmlHash !== 'string' || !/^[a-f0-9]{64}$/.test(binding.xmlHash)) { continue; }
            try {
                const editor = vscode.Uri.parse(binding.editorUri);
                const source = vscode.Uri.parse(binding.sourceUri);
                if (source.scheme !== 'file' || !source.path.toLowerCase().endsWith('.twbx') ||
                    editor.scheme !== scheme || editor.query || editor.fragment ||
                    editor.path !== `${source.path}/${basename(editor.path)}` ||
                    !editor.path.toLowerCase().endsWith('.twb')) { continue; }
                const value: StoredBinding = {
                    editorUri: editor.toString(), sourceUri: source.toString(), xmlHash: binding.xmlHash,
                };
                this.bindings.set(value.editorUri, value);
                bindWorkbookSource(editor, source);
            } catch { /* Invalid stored records cannot authorize a writable URI. */ }
        }
    }

    private async persistBinding(uri: vscode.Uri, source: vscode.Uri, xml: string): Promise<void> {
        this.bindings.set(uri.toString(), { editorUri: uri.toString(), sourceUri: source.toString(), xmlHash: xmlHash(xml) });
        bindWorkbookSource(uri, source);
        if (!this.workspaceState) { return; }
        const snapshot = [...this.bindings.values()];
        const write = this.pendingStateWrite.catch(() => undefined)
            .then(() => this.workspaceState!.update(bindingsStateKey, snapshot));
        this.pendingStateWrite = write;
        await write;
    }

    private createSession(uri: vscode.Uri, source: vscode.Uri, xml: string, conflict: boolean): EditorSession {
        if (this.disposed) { throw vscode.FileSystemError.FileNotFound(uri); }
        const session = new WorkbookXmlSession(xml, async (original, updated) => {
            const receipt = await new WorkbookEditService().apply(source, original, updated, { fromXmlEditor: true });
            void vscode.window.showInformationMessage(`Saved package and checked its contents. Backup: ${receipt.backup.fsPath}`);
        });
        this.sessions.get(uri.toString())?.watcher.dispose();
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(dirname(source.fsPath), basename(source.fsPath)));
        watcher.onDidChange(() => { void this.refresh(uri, source); });
        const entry = { uri, session, mtime: Date.now(), watcher, conflict, saving: 0 };
        this.sessions.set(uri.toString(), entry);
        return entry;
    }

    public async open(source: vscode.Uri): Promise<vscode.Uri> {
        source = resolveWorkbookSourceUri(source);
        if (source.scheme !== 'file') { throw new Error('Choose a workbook on the local filesystem.'); }
        if (source.path.toLowerCase().endsWith('.twb')) {
            await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(source), { preview: false });
            return source;
        }
        const workbook = await readWorkbookXml(source);
        const uri = vscode.Uri.from({ scheme, path: `${source.path}/${workbook.workbookName}` });
        const existing = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
        if (existing?.isDirty) {
            const entry = await this.entry(uri);
            if (entry.conflict || xmlHash(workbook.xml) !== xmlHash(entry.session.text)) {
                entry.conflict = true;
                throw new Error(conflictMessage);
            }
        } else {
            this.createSession(uri, source, workbook.xml, false);
            await this.persistBinding(uri, source, workbook.xml);
            if (existing) { this.changes.fire([{ type: vscode.FileChangeType.Changed, uri }]); }
        }
        const document = existing ?? await vscode.workspace.openTextDocument(uri);
        await vscode.languages.setTextDocumentLanguage(document, 'twb');
        await vscode.window.showTextDocument(document, { preview: false });
        return uri;
    }

    private async refresh(uri: vscode.Uri, source: vscode.Uri): Promise<void> {
        const entry = this.sessions.get(uri.toString());
        if (!entry || entry.conflict || entry.saving > 0) { return; }
        const dirty = () => vscode.workspace.textDocuments.some(doc => doc.uri.toString() === uri.toString() && doc.isDirty);
        if (dirty()) { return; }
        try {
            const xml = (await readWorkbookXml(source)).xml;
            if (dirty() || entry.saving > 0 || this.sessions.get(uri.toString()) !== entry || xml === entry.session.text) { return; }
            entry.session = new WorkbookXmlSession(xml, async (original, updated) => {
                const receipt = await new WorkbookEditService().apply(source, original, updated, { fromXmlEditor: true });
                void vscode.window.showInformationMessage(`Saved package and checked its contents. Backup: ${receipt.backup.fsPath}`);
            });
            entry.mtime = Date.now();
            await this.persistBinding(uri, source, xml);
            this.changes.fire([{ type: vscode.FileChangeType.Changed, uri }]);
        } catch { /* A later save still checks the original baseline and reports a conflict. */ }
    }

    private async entry(uri: vscode.Uri): Promise<EditorSession> {
        if (this.disposed) { throw vscode.FileSystemError.FileNotFound(uri); }
        const key = uri.toString();
        const existing = this.sessions.get(key);
        if (existing) { return existing; }
        const binding = this.bindings.get(key);
        if (!binding) { throw vscode.FileSystemError.FileNotFound(uri); }
        let pending = this.loading.get(key);
        if (!pending) {
            pending = (async () => {
                const source = vscode.Uri.parse(binding.sourceUri);
                const workbook = await readWorkbookXml(source);
                // The current XML can be displayed, but a recovered draft may only
                // save against the hash recorded when this editor last saved/opened.
                return this.createSession(uri, source, workbook.xml, binding.xmlHash !== xmlHash(workbook.xml));
            })();
            this.loading.set(key, pending);
        }
        try { return await pending; }
        finally { if (this.loading.get(key) === pending) { this.loading.delete(key); } }
    }

    public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        const entry = await this.entry(uri);
        return { type: vscode.FileType.File, ctime: 0, mtime: entry.mtime, size: encoder.encode(entry.session.text).length };
    }
    public async readFile(uri: vscode.Uri): Promise<Uint8Array> { return encoder.encode((await this.entry(uri)).session.text); }
    public async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
        const entry = await this.entry(uri);
        if (entry.conflict) { throw new Error(conflictMessage); }
        entry.saving++;
        try {
            await entry.session.save(decoder.decode(content));
            await this.persistBinding(uri, resolveWorkbookSourceUri(uri), entry.session.text);
            entry.mtime = Date.now();
            this.changes.fire([{ type: vscode.FileChangeType.Changed, uri }]);
        } finally { entry.saving--; }
    }
    public watch(): vscode.Disposable { return new vscode.Disposable(() => undefined); }
    public readDirectory(): [string, vscode.FileType][] { return []; }
    public createDirectory(): void { throw vscode.FileSystemError.NoPermissions('Workbook entries cannot be created here.'); }
    public delete(): void { throw vscode.FileSystemError.NoPermissions('Workbook entries cannot be deleted here.'); }
    public rename(): void { throw vscode.FileSystemError.NoPermissions('Use Save a Workbook Copy to rename a package.'); }
    public dispose(): void {
        if (this.disposed) { return; }
        this.disposed = true;
        for (const entry of this.sessions.values()) { entry.watcher.dispose(); }
        for (const binding of this.bindings.values()) { unbindWorkbookSource(vscode.Uri.parse(binding.editorUri)); }
        this.sessions.clear();
        this.bindings.clear();
        this.changes.dispose();
    }
}

export function registerWorkbookXmlEditor(context: vscode.ExtensionContext): WorkbookXmlEditor {
    const provider = new WorkbookXmlEditor(context.workspaceState);
    context.subscriptions.push(provider, vscode.workspace.registerFileSystemProvider(scheme, provider, { isCaseSensitive: true }));
    return provider;
}
