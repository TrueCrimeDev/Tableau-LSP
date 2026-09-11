import * as vscode from 'vscode';
import { createHash } from 'crypto';
import { WorkbookXmlEditor, registerWorkbookXmlEditor } from '../../services/workbookXmlEditor.js';
import { readWorkbookXml } from '../../services/workbookFieldContextManager.js';
import { WorkbookEditService } from '../../services/workbookEditService.js';
import { resolveWorkbookSourceUri } from '../../services/workbookUri.js';

jest.mock('vscode', () => {
    const { URI } = require('vscode-uri');
    class Disposable { constructor(private readonly action: () => void = () => undefined) {} dispose() { this.action(); } }
    class EventEmitter {
        private listeners: ((value: unknown) => void)[] = [];
        event = (listener: (value: unknown) => void) => { this.listeners.push(listener); return new Disposable(); };
        fire(value: unknown) { this.listeners.forEach(listener => listener(value)); }
        dispose() { this.listeners = []; }
    }
    return {
        Uri: URI, Disposable, EventEmitter,
        FileType: { File: 1 }, FileChangeType: { Changed: 1 },
        FileSystemError: { FileNotFound: () => new Error('FileNotFound'), NoPermissions: (message: string) => new Error(message) },
        RelativePattern: class { constructor(public base: string, public pattern: string) {} },
        workspace: { textDocuments: [], openTextDocument: jest.fn(), createFileSystemWatcher: jest.fn(), registerFileSystemProvider: jest.fn() },
        window: { showTextDocument: jest.fn(), showInformationMessage: jest.fn() },
        languages: { setTextDocumentLanguage: jest.fn() },
    };
});
// Package reading/writing are already covered by their real ZIP transaction tests.
// Here the boundary represents persisted package XML across extension lifetimes.
jest.mock('../../services/workbookFieldContextManager.js', () => ({ readWorkbookXml: jest.fn() }));
jest.mock('../../services/workbookEditService.js', () => ({ WorkbookEditService: jest.fn() }));

const original = '<workbook original="yes" />';
const updated = '<workbook updated="yes" />';
const external = '<workbook external="yes" />';
const source = vscode.Uri.file('/workspace/Book.twbx');
const editorUri = vscode.Uri.from({ scheme: 'tableau-workbook', path: '/workspace/Book.twbx/Book.twb' });
const hash = (xml: string) => createHash('sha256').update(xml, 'utf8').digest('hex');

describe('packaged XML editor recovery', () => {
    let disk: string;
    let state: Map<string, unknown>;
    let providers: WorkbookXmlEditor[];
    let changed: (() => void)[];
    const apply = jest.fn();

    const context = () => ({
        subscriptions: [],
        workspaceState: {
            get: (key: string, fallback: unknown) => state.get(key) ?? fallback,
            update: async (key: string, value: unknown) => { state.set(key, JSON.parse(JSON.stringify(value))); },
        },
    } as unknown as vscode.ExtensionContext);
    const create = () => {
        const provider = registerWorkbookXmlEditor(context());
        providers.push(provider);
        return provider;
    };
    const doc = (isDirty: boolean, text = original) => ({ uri: editorUri, isDirty, getText: () => text });

    beforeEach(() => {
        jest.clearAllMocks();
        disk = original;
        state = new Map();
        providers = [];
        changed = [];
        (vscode.workspace as any).textDocuments = [];
        (vscode.workspace.registerFileSystemProvider as jest.Mock).mockImplementation(() => new vscode.Disposable(() => undefined));
        (vscode.workspace.openTextDocument as jest.Mock).mockImplementation(async (uri: vscode.Uri) => ({ uri, isDirty: false, getText: () => disk }));
        (vscode.workspace.createFileSystemWatcher as jest.Mock).mockImplementation(() => ({
            onDidChange: (listener: () => void) => { changed.push(listener); return new vscode.Disposable(() => undefined); },
            dispose: jest.fn(),
        }));
        (readWorkbookXml as jest.Mock).mockImplementation(async () => ({ xml: disk, workbookName: 'Book.twb', entryPath: 'Book.twb' }));
        apply.mockImplementation(async (_uri: vscode.Uri, before: string, after: string) => {
            if (disk !== before) throw new Error('Workbook changed');
            disk = after;
            return { backup: vscode.Uri.file('/workspace/backup.twbx'), verified: true };
        });
        (WorkbookEditService as jest.Mock).mockImplementation(() => ({ apply }));
    });
    afterEach(() => { providers.reverse().forEach(provider => provider.dispose()); });

    it('restores trusted bindings before filesystem registration and reads after a new extension lifetime', async () => {
        const first = create();
        await first.open(source);
        first.dispose();
        const registration = vscode.workspace.registerFileSystemProvider as jest.Mock;
        registration.mockImplementation(() => {
            expect(resolveWorkbookSourceUri(editorUri).toString()).toBe(source.toString());
            return new vscode.Disposable(() => undefined);
        });
        const second = create();
        expect(Buffer.from(await second.readFile(editorUri)).toString()).toBe(original);
        expect((await second.stat(editorUri)).size).toBe(Buffer.byteLength(original));
        const persisted = JSON.stringify([...state.values()]);
        expect(persisted).toContain(hash(original));
        expect(persisted).not.toContain('<workbook');
    });

    it('saves a recovered dirty buffer against the last saved baseline and persists the new hash', async () => {
        const first = create();
        await first.open(source);
        first.dispose();
        (vscode.workspace as any).textDocuments = [doc(true, updated)];
        const second = create();
        await second.writeFile(editorUri, Buffer.from(updated));
        expect(disk).toBe(updated);
        expect(apply).toHaveBeenCalledWith(expect.objectContaining({ scheme: 'file', path: source.path }), original, updated, { fromXmlEditor: true });
        expect(apply.mock.calls[0][0].toString()).toBe(source.toString());
        expect(JSON.stringify([...state.values()])).toContain(hash(updated));
    });

    it('allows viewing externally changed disk content after reload but refuses to overwrite it', async () => {
        const first = create();
        await first.open(source);
        first.dispose();
        disk = external;
        const second = create();
        expect(Buffer.from(await second.readFile(editorUri)).toString()).toBe(external);
        await expect(second.writeFile(editorUri, Buffer.from(updated))).rejects.toThrow(/Edit Workbook XML/i);
        expect(disk).toBe(external);
        expect(apply).not.toHaveBeenCalled();
        expect(JSON.stringify([...state.values()])).toContain(hash(original));
    });

    it('requires preserving or reverting a dirty restored draft before explicitly reopening the new disk version', async () => {
        const first = create();
        await first.open(source);
        first.dispose();
        disk = external;
        (vscode.workspace as any).textDocuments = [doc(true, updated)];
        const second = create();
        await expect(second.open(source)).rejects.toThrow(/revert|close/i);
        await expect(second.writeFile(editorUri, Buffer.from(updated))).rejects.toThrow(/Edit Workbook XML/i);
        (vscode.workspace as any).textDocuments = [doc(false, external)];
        await second.open(source);
        await second.writeFile(editorUri, Buffer.from(updated));
        expect(disk).toBe(updated);
        expect(apply).toHaveBeenCalledWith(source, external, updated, { fromXmlEditor: true });
    });

    it('does not refresh a conflicting restored baseline merely because a filesystem event arrives', async () => {
        const first = create();
        await first.open(source);
        first.dispose();
        disk = external;
        const second = create();
        await second.readFile(editorUri);
        changed[changed.length - 1]();
        await new Promise<void>(resolve => setImmediate(resolve));
        await expect(second.writeFile(editorUri, Buffer.from(updated))).rejects.toThrow(/Edit Workbook XML/i);
        expect(disk).toBe(external);
    });

    it('refreshes a clean editor and persists the new baseline after an external change', async () => {
        const provider = create();
        await provider.open(source);
        (vscode.workspace as any).textDocuments = [doc(false)];
        disk = external;
        changed[changed.length - 1]();
        await new Promise<void>(resolve => setImmediate(resolve));
        expect(Buffer.from(await provider.readFile(editorUri)).toString()).toBe(external);
        expect(JSON.stringify([...state.values()])).toContain(hash(external));
    });

    it('does not refresh over dirty edits or persist a new baseline after a failed save', async () => {
        const provider = create();
        await provider.open(source);
        (vscode.workspace as any).textDocuments = [doc(true, updated)];
        disk = external;
        changed[changed.length - 1]();
        await new Promise<void>(resolve => setImmediate(resolve));
        expect(Buffer.from(await provider.readFile(editorUri)).toString()).toBe(original);
        await expect(provider.writeFile(editorUri, Buffer.from(updated))).rejects.toThrow('Workbook changed');
        expect(JSON.stringify([...state.values()])).toContain(hash(original));
        expect(disk).toBe(external);
    });

    it('hydrates one shared save session when stat and read are requested together', async () => {
        const first = create();
        await first.open(source);
        first.dispose();
        (vscode.workspace.createFileSystemWatcher as jest.Mock).mockClear();
        const second = create();
        await Promise.all([second.readFile(editorUri), second.stat(editorUri)]);
        expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(1);
        await second.writeFile(editorUri, Buffer.from(updated));
        expect(disk).toBe(updated);
    });

    it('refuses an unregistered virtual URI instead of inferring a writable source from its path', async () => {
        const provider = create();
        const unknown = vscode.Uri.from({ scheme: 'tableau-workbook', path: '/elsewhere/Other.twbx/Other.twb' });
        await expect(Promise.resolve().then(() => provider.readFile(unknown))).rejects.toThrow('FileNotFound');
        await expect(provider.writeFile(unknown, Buffer.from(updated))).rejects.toThrow('FileNotFound');
        expect(readWorkbookXml).not.toHaveBeenCalled();
    });
});
