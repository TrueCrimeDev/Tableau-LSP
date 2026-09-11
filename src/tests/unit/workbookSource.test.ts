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
        zip.file('folder/Book.twb', '<workbook name="Book"><datasources /></workbook>');
        const bytes = await zip.generateAsync({ type: 'uint8array' });
        (vscode.workspace as unknown as { fs: { readFile: jest.Mock } }).fs = {
            readFile: jest.fn().mockResolvedValue(bytes),
        };

        const source = await readWorkbookXml(uri('/workspace/Book.twbx'));

        expect(source.workbookName).toBe('Book.twb');
        expect(source.entryPath).toBe('folder/Book.twb');
        expect(source.xml).toContain('name="Book"');
    });

    it('rejects ambiguity rather than indexing a different workbook from the one edited', async () => {
        const zip = new JSZip();
        zip.file('First.twb', '<workbook><datasources /></workbook>');
        zip.file('Second.twb', '<workbook><datasources /></workbook>');
        (vscode.workspace as unknown as { fs: { readFile: jest.Mock } }).fs = {
            readFile: jest.fn().mockResolvedValue(await zip.generateAsync({ type: 'uint8array' })),
        };
        await expect(readWorkbookXml(uri('/workspace/Book.twbx'))).rejects.toThrow(/multiple/i);
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
