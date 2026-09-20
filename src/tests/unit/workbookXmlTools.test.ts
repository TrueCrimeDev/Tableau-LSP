import * as vscode from 'vscode';
import { URI } from 'vscode-uri';
import { resolveWritableWorkbookUri } from '../../chat/activeWorkbook.js';
import { readCurrentWorkbookXml, applyWorkbookXmlMutation, launchEditedWorkbook } from '../../services/workbookMutationService.js';
import { WorkbookEditService } from '../../services/workbookEditService.js';
import { ReadWorkbookXmlTool, EditWorkbookXmlTool, SaveWorkbookCopyTool } from '../../chat/workbookXmlTools.js';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    LanguageModelTextPart: class { constructor(public value: string) {} },
    LanguageModelToolResult: class { constructor(public content: unknown[]) {} },
    MarkdownString: class {
        value = '';
        appendText(text: string) { this.value += text; return this; }
        appendCodeblock(text: string) { this.value += `\n${text}\n`; return this; }
    },
}));
jest.mock('../../chat/activeWorkbook.js', () => ({ resolveWritableWorkbookUri: jest.fn() }));
jest.mock('../../services/workbookMutationService.js', () => ({
    readCurrentWorkbookXml: jest.fn(), applyWorkbookXmlMutation: jest.fn(), launchEditedWorkbook: jest.fn(),
}));
jest.mock('../../services/workbookEditService.js', () => ({ WorkbookEditService: jest.fn() }));

const original = '<workbook><datasources/><worksheets><worksheet name="Sales"/></worksheets></workbook>';
const token = { isCancellationRequested: false } as vscode.CancellationToken;
const resultText = (result: vscode.LanguageModelToolResult) => result.content.map(part => (part as vscode.LanguageModelTextPart).value).join('');
const options = <T>(input: T) => ({ input, toolInvocationToken: undefined });

describe('agent XML tool transactions', () => {
    const source = URI.file('/workspace/Book.twb') as vscode.Uri;
    let xml: string;
    let copy: jest.Mock;
    beforeEach(() => {
        jest.clearAllMocks();
        xml = original;
        (vscode.workspace as unknown as { textDocuments: unknown[] }).textDocuments = [];
        jest.mocked(resolveWritableWorkbookUri).mockResolvedValue(source);
        jest.mocked(readCurrentWorkbookXml).mockImplementation(async () => xml);
        jest.mocked(applyWorkbookXmlMutation).mockImplementation(async (_uri, _before, after) => {
            xml = after;
            return { verified: true, backup: URI.file('/workspace/.tableau-lsp-backups/Book.twb') as vscode.Uri };
        });
        copy = jest.fn().mockImplementation(async (_source, destination) => destination);
        jest.mocked(WorkbookEditService).mockImplementation(() => ({ saveCopy: copy }) as unknown as WorkbookEditService);
    });

    async function input() {
        const read = JSON.parse(resultText(await new ReadWorkbookXmlTool().invoke(options({}), token)));
        return {
            workbookId: read.workbookId, expectedRevision: read.revision,
            summary: 'Rename the worksheet',
            replacements: [{ oldText: 'name="Sales"', newText: 'name="Revenue"' }],
        };
    }

    it('reads exact XML, prepares a review and persists the confirmed edit', async () => {
        const tool = new EditWorkbookXmlTool();
        const edit = await input();
        const prepared = await tool.prepareInvocation({ input: edit }, token);
        expect(prepared.confirmationMessages?.message).toMatchObject({ value: expect.stringContaining('name="Revenue"') });
        const result = JSON.parse(resultText(await tool.invoke(options(edit), token)));
        expect(result.saved).toBe(true);
        expect(result.backup).toContain('.tableau-lsp-backups');
        expect(result.tableauValidation).toBe('not_run');
        expect(xml).toContain('name="Revenue"');
    });

    it('does not write without a prepared confirmation', async () => {
        expect(resultText(await new EditWorkbookXmlTool().invoke(options(await input()), token))).toContain('TOOL ERROR');
        expect(applyWorkbookXmlMutation).not.toHaveBeenCalled();
    });

    it('rejects an editor switch even when the other workbook has identical XML', async () => {
        const tool = new EditWorkbookXmlTool();
        const edit = await input();
        await tool.prepareInvocation({ input: edit }, token);
        jest.mocked(resolveWritableWorkbookUri).mockResolvedValue(URI.file('/workspace/Other.twb') as vscode.Uri);
        expect(resultText(await tool.invoke(options(edit), token))).toContain('TOOL ERROR');
        expect(applyWorkbookXmlMutation).not.toHaveBeenCalled();
    });

    it('rejects content changed while the confirmation was open', async () => {
        const tool = new EditWorkbookXmlTool();
        const edit = await input();
        await tool.prepareInvocation({ input: edit }, token);
        xml = original.replace('Sales', 'Newer');
        expect(resultText(await tool.invoke(options(edit), token))).toContain('changed');
        expect(applyWorkbookXmlMutation).not.toHaveBeenCalled();
    });

    it('does not write after cancellation', async () => {
        const tool = new EditWorkbookXmlTool();
        const edit = await input();
        await tool.prepareInvocation({ input: edit }, token);
        expect(resultText(await tool.invoke(options(edit), { isCancellationRequested: true } as vscode.CancellationToken))).toContain('cancelled');
        expect(applyWorkbookXmlMutation).not.toHaveBeenCalled();
    });

    it('keeps a successful export result when Tableau launch fails', async () => {
        const edit = await input();
        const save = { workbookId: edit.workbookId, expectedRevision: edit.expectedRevision, fileName: 'Presentation.twb', openInTableau: true };
        const tool = new SaveWorkbookCopyTool();
        await tool.prepareInvocation({ input: save }, token);
        jest.mocked(launchEditedWorkbook).mockRejectedValue(new Error('Tableau Desktop not found'));
        const result = JSON.parse(resultText(await tool.invoke(options(save), token)));
        expect(result.saved).toBe(true);
        expect(result.launchRequested).toBe(false);
        expect(result.launchError).toContain('not found');
        expect(copy.mock.calls[0][2]).toEqual({ expectedXml: original });
    });

    it('includes the backup and rollback outcome after an interrupted write', async () => {
        const tool = new EditWorkbookXmlTool();
        const edit = await input();
        await tool.prepareInvocation({ input: edit }, token);
        jest.mocked(applyWorkbookXmlMutation).mockRejectedValue(Object.assign(new Error('Write verification failed'), {
            backup: URI.file('/workspace/.tableau-lsp-backups/recovery.twb'), rolledBack: false,
        }));
        const text = resultText(await tool.invoke(options(edit), token));
        expect(text).toContain('recovery.twb');
        expect(text).toContain('"rolledBack":false');
    });
});
