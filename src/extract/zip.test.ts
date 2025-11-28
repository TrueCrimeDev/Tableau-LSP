const readFileMock = jest.fn();
const openBufferMock = jest.fn();

jest.mock('vscode', () => ({
    workspace: {
        fs: {
            readFile: readFileMock
        }
    },
    Uri: class {
        constructor(public fsPath: string) {}
        static file(fsPath: string) {
            return new this(fsPath);
        }
    }
}), { virtual: true });

jest.mock('unzipper', () => ({
    Open: {
        buffer: openBufferMock
    }
}));

import type { Uri } from 'vscode';
import { extractFromFile, extractFromTwbx } from './zip';

const sampleXml = `
<workbook name="Archive Workbook">
    <datasources>
        <datasource caption="Orders">
            <column name="[Revenue]" caption="Revenue">
                <calculation formula="SUM([Sales])" />
            </column>
        </datasource>
    </datasources>
</workbook>
`;

const textEncoder = new TextEncoder();

describe('extractFromFile', () => {
    beforeEach(() => {
        readFileMock.mockReset();
        openBufferMock.mockReset();
    });

    it('extracts from .twb files using workspace fs', async () => {
        readFileMock.mockResolvedValueOnce(textEncoder.encode(sampleXml));
        const uri = { fsPath: 'C:/workbooks/example.twb' } as unknown as Uri;

        const results = await extractFromFile(uri);

        expect(readFileMock).toHaveBeenCalledWith(uri);
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            workbook: 'Archive Workbook',
            datasource: 'Orders',
            title: 'Revenue',
            formula: 'SUM([Sales])'
        });
    });

    it('delegates .twbx files to extractFromTwbx', async () => {
        const entryBufferMock = jest.fn().mockResolvedValue(Buffer.from(sampleXml));
        readFileMock.mockResolvedValueOnce(Buffer.from('zip-data'));
        openBufferMock.mockResolvedValueOnce({
            files: [
                { path: 'inner/workbook.twb', buffer: entryBufferMock }
            ]
        });

        const uri = { fsPath: 'C:/workbooks/archive.twbx' } as unknown as Uri;
        const results = await extractFromFile(uri);

        expect(openBufferMock).toHaveBeenCalledTimes(1);
        expect(entryBufferMock).toHaveBeenCalledTimes(1);
        expect(results).toHaveLength(1);
        expect(results[0].workbook).toBe('Archive Workbook');
    });
});

describe('extractFromTwbx', () => {
    beforeEach(() => {
        readFileMock.mockReset();
        openBufferMock.mockReset();
    });

    it('throws when archive has no .twb entries', async () => {
        readFileMock.mockResolvedValueOnce(Buffer.from('zip-data'));
        openBufferMock.mockResolvedValueOnce({ files: [] });

        const uri = { fsPath: 'C:/workbooks/empty.twbx' } as unknown as Uri;
        await expect(extractFromTwbx(uri)).rejects.toThrow('Extraction failed: No .twb file found in the .twbx archive');
    });

    it('continues extraction when individual entries fail', async () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        readFileMock.mockResolvedValueOnce(Buffer.from('zip-data'));

        const goodBuffer = jest.fn().mockResolvedValue(Buffer.from(sampleXml));
        const badBuffer = jest.fn().mockRejectedValue(new Error('corrupt entry'));

        openBufferMock.mockResolvedValueOnce({
            files: [
                { path: 'good.twb', buffer: goodBuffer },
                { path: 'bad.twb', buffer: badBuffer }
            ]
        });

        const uri = { fsPath: 'C:/workbooks/mixed.twbx' } as unknown as Uri;
        const results = await extractFromTwbx(uri);

        expect(results).toHaveLength(1);
        expect(results[0].title).toBe('Revenue');
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});
