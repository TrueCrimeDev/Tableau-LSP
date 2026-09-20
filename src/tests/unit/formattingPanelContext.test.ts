import * as vscode from 'vscode';
import { registerFormattingPanel } from '../../views/formattingPanel.js';
import { TWBParser } from '../../parsers/twbParser.js';
import { applyWorkbookXmlMutation, readCurrentWorkbookXml } from '../../services/workbookMutationService.js';
import { bindWorkbookPreview, unbindWorkbookSource } from '../../services/workbookUri.js';

jest.mock('vscode', () => {
    const { URI, Utils } = require('vscode-uri');
    URI.joinPath = Utils.joinPath;
    return {
    Uri: URI,
    ViewColumn: { One: 1 },
    commands: { registerCommand: jest.fn() },
    window: { onDidChangeActiveTextEditor: jest.fn(), createWebviewPanel: jest.fn(), activeTextEditor: undefined,
        tabGroups: { activeTabGroup: {} } },
    };
});
jest.mock('../../parsers/twbParser.js', () => ({ TWBParser: jest.fn() }));
jest.mock('../../services/workbookMutationService.js', () => ({ readCurrentWorkbookXml: jest.fn(), applyWorkbookXmlMutation: jest.fn() }));

const source = vscode.Uri.file('/workspace/Source.twbx');
const other = vscode.Uri.file('/workspace/Other.twbx');
const preview = vscode.Uri.from({ scheme: 'tableau-preview', path: '/compare/current.twb' });
const xml = '<workbook><style><style-rule element="worksheet"><format attr="font-size" value="10"/></style-rule></style></workbook>';
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

describe('formatting panel workbook identity', () => {
    let open: () => void;
    let changeEditor: (editor: unknown) => void;
    let receive: (message: unknown) => Promise<void>;
    let dispose: () => void;
    let postMessage: jest.Mock;
    let parseWorkbook: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        postMessage = jest.fn().mockResolvedValue(true);
        parseWorkbook = jest.fn().mockResolvedValue({ xml });
        (TWBParser as jest.Mock).mockImplementation(() => ({ parseWorkbook }));
        (vscode.commands.registerCommand as jest.Mock).mockImplementation((_id, callback) => { open = callback; return { dispose() {} }; });
        (vscode.window.onDidChangeActiveTextEditor as jest.Mock).mockImplementation(callback => { changeEditor = callback; return { dispose() {} }; });
        (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue({
            webview: { asWebviewUri: (uri: vscode.Uri) => uri, postMessage, onDidReceiveMessage: (callback: typeof receive) => { receive = callback; } },
            onDidDispose: (callback: () => void) => { dispose = callback; },
        });
        (readCurrentWorkbookXml as jest.Mock).mockResolvedValue(xml);
        (applyWorkbookXmlMutation as jest.Mock).mockResolvedValue({ backup: vscode.Uri.file('/workspace/backup.twbx') });
        bindWorkbookPreview(preview, source);
        (vscode.window as any).activeTextEditor = { document: { uri: preview } };
        registerFormattingPanel({ subscriptions: [], extensionUri: vscode.Uri.file('/extension') } as unknown as vscode.ExtensionContext);
    });
    afterEach(() => { dispose?.(); unbindWorkbookSource(preview); });

    it('shows and edits the source workbook when opened from a backup comparison', async () => {
        open();
        await flush();
        expect(parseWorkbook).toHaveBeenCalledWith(source);
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'formattingLoaded', workbookName: 'Source.twbx' }));
        await receive({ type: 'applyEdits', edits: { worksheet: { 'font-size': '12' } } });
        expect(readCurrentWorkbookXml).toHaveBeenCalledWith(source);
        expect(applyWorkbookXmlMutation).toHaveBeenCalledWith(source, xml, expect.any(String), { relaunch: false });
    });

    it('keeps edits attached to the displayed workbook while another workbook is still loading', async () => {
        open();
        await flush();
        let finish!: (value: { xml: string }) => void;
        parseWorkbook.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
        (vscode.window as any).activeTextEditor = { document: { uri: other } };
        changeEditor(vscode.window.activeTextEditor);
        await receive({ type: 'applyEdits', edits: { worksheet: { 'font-size': '12' } } });
        expect(readCurrentWorkbookXml).toHaveBeenLastCalledWith(source);
        finish({ xml });
        await flush();
        await receive({ type: 'applyEdits', edits: { worksheet: { 'font-size': '12' } } });
        expect(readCurrentWorkbookXml).toHaveBeenLastCalledWith(other);
    });
});
