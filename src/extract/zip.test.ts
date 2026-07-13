const readFileMock = jest.fn();
const loadAsyncMock = jest.fn();

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

jest.mock('jszip', () => ({
    __esModule: true,
    default: {
        loadAsync: loadAsyncMock
    }
}));

import type { Uri } from 'vscode';
import { extractFromFile, extractFromTwbx } from './zip.js';

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
        loadAsyncMock.mockReset();
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
        const entryAsyncMock = jest.fn().mockResolvedValue(sampleXml);
        readFileMock.mockResolvedValueOnce(Buffer.from('zip-data'));
        loadAsyncMock.mockResolvedValueOnce({
            files: {
                'inner/workbook.twb': { dir: false, async: entryAsyncMock }
            }
        });

        const uri = { fsPath: 'C:/workbooks/archive.twbx' } as unknown as Uri;
        const results = await extractFromFile(uri);

        expect(loadAsyncMock).toHaveBeenCalledTimes(1);
        expect(entryAsyncMock).toHaveBeenCalledWith('string');
        expect(results).toHaveLength(1);
        expect(results[0].workbook).toBe('Archive Workbook');
    });
});

describe('extractFromTwbx', () => {
    beforeEach(() => {
        readFileMock.mockReset();
        loadAsyncMock.mockReset();
    });

    it('throws when archive has no .twb entries', async () => {
        readFileMock.mockResolvedValueOnce(Buffer.from('zip-data'));
        loadAsyncMock.mockResolvedValueOnce({ files: {} });

        const uri = { fsPath: 'C:/workbooks/empty.twbx' } as unknown as Uri;
        await expect(extractFromTwbx(uri)).rejects.toThrow('Extraction failed: No .twb file found in the .twbx archive');
    });

    it('continues extraction when individual entries fail', async () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        readFileMock.mockResolvedValueOnce(Buffer.from('zip-data'));

        const goodAsync = jest.fn().mockResolvedValue(sampleXml);
        const badAsync = jest.fn().mockRejectedValue(new Error('corrupt entry'));

        loadAsyncMock.mockResolvedValueOnce({
            files: {
                'good.twb': { dir: false, async: goodAsync },
                'bad.twb': { dir: false, async: badAsync }
            }
        });

        const uri = { fsPath: 'C:/workbooks/mixed.twbx' } as unknown as Uri;
        const results = await extractFromTwbx(uri);

        expect(results).toHaveLength(1);
        expect(results[0].title).toBe('Revenue');
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});
