import JSZip from 'jszip';
import { readWorkbookPackage, replaceWorkbookXml } from '../../services/workbookPackage.js';

const ORIGINAL = `<?xml version="1.0" encoding="utf-8"?><workbook version="18.1"><datasources><datasource name="A" /></datasources><!-- untouched --></workbook>`;
const UPDATED = ORIGINAL.replace('name="A"', 'name="B"');
const encoder = new TextEncoder();

describe('workbook package round trips', () => {
    it('replaces only the nested workbook and retains every other entry byte and path', async () => {
        const zip = new JSZip();
        zip.comment = 'Packaged workbook';
        zip.file('nested/Book.twb', ORIGINAL);
        zip.file('Data/Extracts/data.hyper', new Uint8Array([0, 255, 42, 13, 10, 0, 128]));
        zip.file('Images/icon.bin', new Uint8Array([137, 80, 78, 71, 0, 255]));
        zip.file('unknown-extension.dat', new Uint8Array([1, 2, 3]));
        const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });

        const output = await replaceWorkbookXml(bytes, 'Book.twbx', UPDATED);
        const reopened = await JSZip.loadAsync(output, { checkCRC32: true });
        expect(Object.keys(reopened.files).sort()).toEqual(Object.keys(zip.files).sort());
        expect(await reopened.file('nested/Book.twb')!.async('string')).toBe(UPDATED);
        expect(await reopened.file('Data/Extracts/data.hyper')!.async('uint8array')).toEqual(new Uint8Array([0, 255, 42, 13, 10, 0, 128]));
        expect(await reopened.file('Images/icon.bin')!.async('uint8array')).toEqual(new Uint8Array([137, 80, 78, 71, 0, 255]));
        expect(await reopened.file('unknown-extension.dat')!.async('uint8array')).toEqual(new Uint8Array([1, 2, 3]));
        expect(reopened.comment).toBe('Packaged workbook');
        expect(await readWorkbookPackage(output, 'Book.twbx')).toEqual({
            xml: UPDATED, workbookName: 'Book.twb', entryPath: 'nested/Book.twb',
        });
    });

    it('does not choose an arbitrary workbook from a multi-workbook package', async () => {
        const zip = new JSZip();
        zip.file('A.twb', ORIGINAL);
        zip.file('B.twb', ORIGINAL);
        const bytes = await zip.generateAsync({ type: 'uint8array' });
        await expect(readWorkbookPackage(bytes, 'Ambiguous.twbx')).rejects.toThrow(/multiple|more than one/i);
        await expect(replaceWorkbookXml(bytes, 'Ambiguous.twbx', UPDATED)).rejects.toThrow(/multiple|more than one/i);
    });

    it('rejects a package with no workbook and malformed replacement XML', async () => {
        const zip = new JSZip();
        zip.file('Data/data.csv', 'id\n1');
        await expect(readWorkbookPackage(await zip.generateAsync({ type: 'uint8array' }), 'Empty.twbx')).rejects.toThrow(/No .twb workbook/i);
        await expect(replaceWorkbookXml(encoder.encode(ORIGINAL), 'Book.twb', '<workbook>')).rejects.toThrow(/not well formed/i);
    });

    it('preserves a UTF-8 byte order mark when editing a plain workbook', async () => {
        const bytes = encoder.encode('\uFEFF' + ORIGINAL);
        const output = await replaceWorkbookXml(bytes, 'Book.twb', UPDATED);
        expect(Array.from(output.slice(0, 3))).toEqual([239, 187, 191]);
        expect(new TextDecoder().decode(output)).toBe(UPDATED);
    });

    it('rejects invalid archives without changing input bytes', async () => {
        const bytes = new Uint8Array([80, 75, 3, 4, 255]);
        await expect(replaceWorkbookXml(bytes, 'Broken.twbx', UPDATED)).rejects.toThrow();
        expect(bytes).toEqual(new Uint8Array([80, 75, 3, 4, 255]));
    });

    it('rejects duplicate entries instead of silently dropping a workbook during repackaging', async () => {
        const zip = new JSZip();
        zip.file('One.twb', ORIGINAL);
        zip.file('Two.twb', UPDATED);
        const bytes = Buffer.from(await zip.generateAsync({ type: 'uint8array', compression: 'STORE' }));
        let offset = bytes.indexOf('Two.twb');
        while (offset !== -1) {
            bytes.write('One.twb', offset);
            offset = bytes.indexOf('Two.twb', offset + 7);
        }
        await expect(replaceWorkbookXml(bytes, 'Duplicate.twbx', UPDATED)).rejects.toThrow(/duplicate|entries/i);
    });

    it('rejects paths that the ZIP library would silently rename', async () => {
        const zip = new JSZip();
        zip.file('../Book.twb', ORIGINAL, { createFolders: false });
        await expect(replaceWorkbookXml(await zip.generateAsync({ type: 'uint8array' }), 'Unsafe.twbx', UPDATED))
            .rejects.toThrow(/unsafe archive paths/i);
    });

    it('rejects directory paths before the ZIP library normalizes them', async () => {
        const zip = new JSZip();
        zip.file('Book.twb', ORIGINAL);
        zip.file('../Assets/', null, { dir: true, createFolders: false });
        await expect(replaceWorkbookXml(await zip.generateAsync({ type: 'uint8array' }), 'Unsafe directory.twbx', UPDATED))
            .rejects.toThrow(/unsafe archive paths/i);
    });
});
