import * as vscode from 'vscode';
import { WorkbookFieldContextManager } from '../../services/workbookFieldContextManager.js';

const XML_A = `<workbook><datasources><datasource caption='A'><column datatype='string' name='A Field' /></datasource></datasources></workbook>`;
const XML_B = `<workbook><datasources><datasource caption='B'><column datatype='integer' name='B Field' /></datasource></datasources></workbook>`;
const XML_C = `<workbook><datasources><datasource caption='C'><column datatype='date' name='C Field' /></datasource></datasources></workbook>`;

function uri(filePath: string): vscode.Uri {
    return {
        scheme: 'file',
        path: filePath.replace(/\\/g, '/'),
        fsPath: filePath,
        toString: () => `file:///${filePath.replace(/\\/g, '/')}`,
    } as vscode.Uri;
}

function document(filePath: string, xml: string): vscode.TextDocument {
    return {
        uri: uri(filePath),
        getText: () => xml,
    } as vscode.TextDocument;
}

describe('WorkbookFieldContextManager lifecycle', () => {
    let workbookChanged: (uri: vscode.Uri) => void;
    let workbookDeleted: (uri: vscode.Uri) => void;
    let documentChanged: (event: vscode.TextDocumentChangeEvent) => void;
    let activeEditorChanged: (editor: vscode.TextEditor | undefined) => void;
    let workspaceState: any;
    let windowState: any;
    let client: { sendNotification: jest.Mock };

    beforeEach(() => {
        jest.useFakeTimers();
        workspaceState = vscode.workspace as any;
        windowState = vscode.window as any;

        workspaceState.workspaceFolders = [];
        workspaceState.textDocuments = [];
        workspaceState.findFiles = jest.fn().mockResolvedValue([]);
        workspaceState.getWorkspaceFolder = jest.fn().mockReturnValue(undefined);
        workspaceState.fs = { readFile: jest.fn().mockRejectedValue(new Error('not found')) };
        workspaceState.createFileSystemWatcher = jest.fn((pattern: string) => {
            const workbookWatcher = pattern.includes('{twb,twbx}');
            return {
                onDidCreate: (callback: (value: vscode.Uri) => void) => {
                    void callback;
                    return { dispose: jest.fn() };
                },
                onDidChange: (callback: (value: vscode.Uri) => void) => {
                    if (workbookWatcher) { workbookChanged = callback; }
                    return { dispose: jest.fn() };
                },
                onDidDelete: (callback: (value: vscode.Uri) => void) => {
                    if (workbookWatcher) { workbookDeleted = callback; }
                    return { dispose: jest.fn() };
                },
                dispose: jest.fn(),
            };
        });
        workspaceState.onDidOpenTextDocument = jest.fn(() => ({ dispose: jest.fn() }));
        workspaceState.onDidSaveTextDocument = jest.fn(() => ({ dispose: jest.fn() }));
        workspaceState.onDidChangeTextDocument = jest.fn((callback: typeof documentChanged) => {
            documentChanged = callback;
            return { dispose: jest.fn() };
        });

        windowState.activeTextEditor = undefined;
        windowState.onDidChangeActiveTextEditor = jest.fn((callback: typeof activeEditorChanged) => {
            activeEditorChanged = callback;
            return { dispose: jest.fn() };
        });
        windowState.tabGroups = {
            activeTabGroup: { activeTab: undefined },
            onDidChangeTabs: jest.fn(() => ({ dispose: jest.fn() })),
        };
        (vscode.Uri as any).parse = jest.fn((value: string) => uri(value.replace(/^file:\/\/\//, '')));

        client = { sendNotification: jest.fn().mockResolvedValue(undefined) };
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('does not silently choose the first of multiple open workbooks', async () => {
        const calculation = document('C:/workspace/calc.twbl', '[A Field]');
        windowState.activeTextEditor = { document: calculation };
        windowState.tabGroups.activeTabGroup.activeTab = { input: { uri: calculation.uri } };
        workspaceState.textDocuments = [document('C:/workspace/A.twb', XML_A), document('C:/workspace/B.twb', XML_B)];
        const manager = new WorkbookFieldContextManager(() => client as any);

        await manager.initialize();

        expect(workspaceState.findFiles).not.toHaveBeenCalled();
        expect(client.sendNotification).toHaveBeenLastCalledWith(
            'tableau/workbookFieldContext',
            expect.objectContaining({ workbook: '', fields: [] })
        );
        manager.dispose();
    });

    it('keeps the active workbook when a background workbook changes', async () => {
        const workbookA = document('C:/workspace/A.twb', XML_A);
        const workbookB = document('C:/workspace/B.twb', XML_B);
        workspaceState.textDocuments = [workbookA, workbookB];
        windowState.activeTextEditor = { document: workbookA };
        const manager = new WorkbookFieldContextManager(() => client as any);
        await manager.initialize();
        expect(client.sendNotification).toHaveBeenLastCalledWith(
            'tableau/workbookFieldContext',
            expect.objectContaining({ workbook: 'A.twb' })
        );

        const calculation = document('C:/workspace/calc.twbl', '[A Field]');
        windowState.activeTextEditor = { document: calculation };
        windowState.tabGroups.activeTabGroup.activeTab = { input: { uri: calculation.uri } };
        documentChanged({ document: workbookB } as vscode.TextDocumentChangeEvent);
        await jest.runOnlyPendingTimersAsync();

        expect(client.sendNotification).toHaveBeenCalledTimes(1);
        manager.dispose();
    });

    it('cancels a pending refresh when the workbook is deleted', async () => {
        const workbookA = document('C:/workspace/A.twb', XML_A);
        workspaceState.textDocuments = [workbookA];
        windowState.activeTextEditor = { document: workbookA };
        const manager = new WorkbookFieldContextManager(() => client as any);
        await manager.initialize();

        workbookChanged(workbookA.uri);
        workspaceState.textDocuments = [];
        workbookDeleted(workbookA.uri);
        await Promise.resolve();
        await jest.runOnlyPendingTimersAsync();

        expect(client.sendNotification).toHaveBeenLastCalledWith(
            'tableau/workbookFieldContext',
            expect.objectContaining({ workbook: '', fields: [] })
        );
        expect(client.sendNotification).toHaveBeenCalledTimes(2);
        manager.dispose();
    });

    it('does not let a delayed edit switch back from a newer active workbook', async () => {
        const workbookA = document('C:/workspace/A.twb', XML_A);
        const workbookB = document('C:/workspace/B.twb', XML_B);
        workspaceState.textDocuments = [workbookA, workbookB];
        windowState.activeTextEditor = { document: workbookA };
        const manager = new WorkbookFieldContextManager(() => client as any);
        await manager.initialize();

        documentChanged({ document: workbookA } as vscode.TextDocumentChangeEvent);
        windowState.activeTextEditor = { document: workbookB };
        activeEditorChanged(windowState.activeTextEditor);
        await Promise.resolve();
        await Promise.resolve();
        expect(client.sendNotification).toHaveBeenLastCalledWith(
            'tableau/workbookFieldContext',
            expect.objectContaining({ workbook: 'B.twb' })
        );

        await jest.runOnlyPendingTimersAsync();
        expect(client.sendNotification).toHaveBeenLastCalledWith(
            'tableau/workbookFieldContext',
            expect.objectContaining({ workbook: 'B.twb' })
        );
        manager.dispose();
    });

    it('ignores an older workbook read that resolves after a newer selection', async () => {
        const workbookA = document('C:/workspace/A.twb', XML_A);
        const workbookB = document('C:/workspace/B.twb', XML_B);
        workspaceState.textDocuments = [];
        const pending = new Map<string, (value: Uint8Array) => void>();
        workspaceState.fs.readFile = jest.fn((requested: vscode.Uri) => new Promise<Uint8Array>(resolve => {
            pending.set(requested.toString(), resolve);
        }));
        const manager = new WorkbookFieldContextManager(() => client as any);

        windowState.activeTextEditor = { document: workbookA };
        activeEditorChanged(windowState.activeTextEditor);
        windowState.activeTextEditor = { document: workbookB };
        activeEditorChanged(windowState.activeTextEditor);

        pending.get(workbookB.uri.toString())!(Buffer.from(XML_B));
        await Promise.resolve();
        await Promise.resolve();
        pending.get(workbookA.uri.toString())!(Buffer.from(XML_A));
        await Promise.resolve();
        await Promise.resolve();

        expect(client.sendNotification).toHaveBeenCalledTimes(1);
        expect(client.sendNotification).toHaveBeenLastCalledWith(
            'tableau/workbookFieldContext',
            expect.objectContaining({ workbook: 'B.twb' })
        );
        manager.dispose();
    });

    it('gives a visible workbook priority while its read is still pending', async () => {
        const workbookA = document('C:/workspace/A.twb', XML_A);
        const workbookB = document('C:/workspace/B.twb', XML_B);
        workspaceState.textDocuments = [workbookA];
        windowState.activeTextEditor = { document: workbookA };
        const manager = new WorkbookFieldContextManager(() => client as any);
        await manager.initialize();

        documentChanged({ document: workbookA } as vscode.TextDocumentChangeEvent);
        workspaceState.textDocuments = [workbookA];
        let resolveB!: (value: Uint8Array) => void;
        workspaceState.fs.readFile = jest.fn(() => new Promise<Uint8Array>(resolve => {
            resolveB = resolve;
        }));
        windowState.activeTextEditor = { document: workbookB };
        activeEditorChanged(windowState.activeTextEditor);

        await jest.runOnlyPendingTimersAsync();
        resolveB(Buffer.from(XML_B));
        await Promise.resolve();
        await Promise.resolve();

        expect(client.sendNotification).toHaveBeenLastCalledWith(
            'tableau/workbookFieldContext',
            expect.objectContaining({ workbook: 'B.twb' })
        );
        manager.dispose();
    });

    it('clears an ambiguous schema instead of choosing a background workbook after deletion', async () => {
        const workbookA = document('C:/workspace/A.twb', XML_A);
        const workbookB = document('C:/workspace/B.twb', XML_B);
        const workbookC = document('C:/workspace/C.twb', XML_C);
        workspaceState.textDocuments = [workbookA, workbookB, workbookC];
        windowState.activeTextEditor = { document: workbookA };
        const manager = new WorkbookFieldContextManager(() => client as any);
        await manager.initialize();

        workbookChanged(workbookB.uri);
        workbookChanged(workbookC.uri);
        await jest.runOnlyPendingTimersAsync();
        workspaceState.textDocuments = [workbookB, workbookC];
        workbookDeleted(workbookA.uri);
        await Promise.resolve();

        expect(client.sendNotification).toHaveBeenLastCalledWith(
            'tableau/workbookFieldContext',
            expect.objectContaining({ workbook: '', fields: [] })
        );
        manager.dispose();
    });

    it('retains the last good schema when an active workbook refresh fails', async () => {
        const getText = jest.fn()
            .mockReturnValueOnce(XML_A)
            .mockImplementation(() => { throw new Error('workbook temporarily locked'); });
        const workbookA = {
            uri: uri('C:/workspace/A.twb'),
            getText,
        } as unknown as vscode.TextDocument;
        workspaceState.textDocuments = [workbookA];
        windowState.activeTextEditor = { document: workbookA };
        const manager = new WorkbookFieldContextManager(() => client as any);
        await manager.initialize();

        documentChanged({ document: workbookA } as vscode.TextDocumentChangeEvent);
        await jest.runOnlyPendingTimersAsync();

        const payload = client.sendNotification.mock.calls.at(-1)?.[1];
        expect(payload).toMatchObject({ workbook: 'A.twb' });
        expect(payload.fields).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'A Field' }),
        ]));
        expect(payload.datasourceFields).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'A Field', datasource: 'A' }),
        ]));
        manager.dispose();
    });

    it('switches fallback definition files when a calculation crosses workspace roots', async () => {
        const folderA = { uri: uri('C:/workspace/A'), name: 'A', index: 0 } as vscode.WorkspaceFolder;
        const folderB = { uri: uri('C:/workspace/B'), name: 'B', index: 1 } as vscode.WorkspaceFolder;
        const calculationA = document('C:/workspace/A/calc.twbl', '[A Field]');
        const calculationB = document('C:/workspace/B/calc.twbl', '[B Field]');
        workspaceState.workspaceFolders = [folderA, folderB];
        workspaceState.textDocuments = [calculationA, calculationB];
        workspaceState.findFiles = jest.fn().mockResolvedValue([
            uri('C:/workspace/A/A.twb'),
            uri('C:/workspace/B/B.twb'),
        ]);
        workspaceState.getWorkspaceFolder = jest.fn((resource: vscode.Uri) =>
            resource.fsPath.includes('/B/') ? folderB : folderA
        );
        windowState.activeTextEditor = { document: calculationA };
        const manager = new WorkbookFieldContextManager(() => client as any);
        await manager.initialize();

        expect(client.sendNotification.mock.calls.at(-1)?.[1].definitionPath)
            .toContain('workspace/A/fields.d.twbl');

        windowState.activeTextEditor = { document: calculationB };
        activeEditorChanged(windowState.activeTextEditor);
        await Promise.resolve();
        await Promise.resolve();

        expect(client.sendNotification.mock.calls.at(-1)?.[1].definitionPath)
            .toContain('workspace/B/fields.d.twbl');
        manager.dispose();
    });

    it('connects a repository workbook outside the VS Code workspace on demand', async () => {
        workspaceState.fs.readFile = jest.fn().mockResolvedValue(Buffer.from(XML_C));
        const manager = new WorkbookFieldContextManager(() => client as any);
        await manager.initialize();

        await manager.connectWorkbook(uri('C:/external/My Tableau Repository/Workbooks/Local.twb'));

        expect(manager.getActiveWorkbookPath()).toContain('Local.twb');
        expect(client.sendNotification).toHaveBeenLastCalledWith(
            'tableau/workbookFieldContext',
            expect.objectContaining({
                workbook: 'Local.twb',
                datasourceFields: expect.arrayContaining([
                    expect.objectContaining({ name: 'C Field', datasource: 'C' }),
                ]),
            })
        );
        await expect(manager.connectWorkbook(uri('C:/external/source.tds')))
            .rejects.toThrow('Only .twb and .twbx');
        manager.dispose();
    });
});
