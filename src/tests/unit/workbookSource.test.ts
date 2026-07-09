import * as vscode from 'vscode';
import JSZip from 'jszip';
import { readWorkbookXml } from '../../services/workbookFieldContextManager.js';

function uri(path: string): vscode.Uri {
    return {
        path,
        fsPath: path,
        toString: () => `file://${path}`,
    } as vscode.Uri;
}

describe('readWorkbookXml', () => {
    it('reads the workbook inside a TWBX package', async () => {
        const zip = new JSZip();
        zip.file('z-last.twb', '<workbook name="last" />');
        zip.file('folder/a-first.twb', '<workbook name="first" />');
        const bytes = await zip.generateAsync({ type: 'uint8array' });
        (vscode.workspace as unknown as { fs: { readFile: jest.Mock } }).fs = {
            readFile: jest.fn().mockResolvedValue(bytes),
        };

        const source = await readWorkbookXml(uri('/workspace/Book.twbx'));

        expect(source.workbookName).toBe('a-first.twb');
        expect(source.xml).toContain('name="first"');
    });

    it('rejects a TWBX package without a workbook', async () => {
        const zip = new JSZip();
        zip.file('data.csv', 'id,name\n1,A');
        const bytes = await zip.generateAsync({ type: 'uint8array' });
        (vscode.workspace as unknown as { fs: { readFile: jest.Mock } }).fs = {
            readFile: jest.fn().mockResolvedValue(bytes),
        };

        await expect(readWorkbookXml(uri('/workspace/NoWorkbook.twbx')))
            .rejects.toThrow('No .twb workbook');
    });
});
