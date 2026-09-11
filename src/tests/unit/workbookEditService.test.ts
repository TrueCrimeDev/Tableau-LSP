import {
    WorkbookEditService,
    WorkbookEditTransactionError,
    runWorkbookEditTransaction,
} from '../../services/workbookEditService.js';
import * as vscode from 'vscode';
import JSZip from 'jszip';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { bindWorkbookSource, unbindWorkbookSource } from '../../services/workbookUri.js';

const ORIGINAL = `<workbook><datasources><datasource name='A' /></datasources></workbook>`;
const UPDATED = `<workbook><datasources><datasource name='B' /></datasources></workbook>`;

describe('transactional workbook edits', () => {
    it('backs up, writes, rereads, and verifies an edit in order', async () => {
        let persisted = ORIGINAL;
        const calls: string[] = [];
        const receipt = await runWorkbookEditTransaction(ORIGINAL, UPDATED, {
            createBackup: async content => {
                calls.push(`backup:${content}`);
                return 'backup.twb';
            },
            write: async content => {
                calls.push(`write:${content}`);
                persisted = content;
            },
            read: async () => {
                calls.push('read');
                return persisted;
            },
        });

        expect(receipt).toEqual({ backup: 'backup.twb', verified: true });
        expect(calls).toEqual([
            `backup:${ORIGINAL}`,
            `write:${UPDATED}`,
            'read',
        ]);
    });

    it('rejects malformed output before backup or write', async () => {
        const createBackup = jest.fn();
        const write = jest.fn();
        await expect(runWorkbookEditTransaction(ORIGINAL, '<workbook>', {
            createBackup,
            write,
            read: async () => ORIGINAL,
        })).rejects.toThrow(/not well formed/i);
        expect(createBackup).not.toHaveBeenCalled();
        expect(write).not.toHaveBeenCalled();
    });

    it('does not write when backup creation fails', async () => {
        const write = jest.fn();
        await expect(runWorkbookEditTransaction(ORIGINAL, UPDATED, {
            createBackup: async () => { throw new Error('disk full'); },
            write,
            read: async () => ORIGINAL,
        })).rejects.toMatchObject({
            message: expect.stringContaining('Could not create a workbook backup'),
            rolledBack: false,
        });
        expect(write).not.toHaveBeenCalled();
    });

    it('rolls back the original bytes when a write fails after changing storage', async () => {
        let persisted = ORIGINAL;
        let firstWrite = true;
        try {
            await runWorkbookEditTransaction(ORIGINAL, UPDATED, {
                createBackup: async () => 'backup.twb',
                write: async content => {
                    persisted = content;
                    if (firstWrite) {
                        firstWrite = false;
                        throw new Error('simulated interrupted write');
                    }
                },
                read: async () => persisted,
            });
            throw new Error('Expected transaction to fail');
        } catch (error) {
            expect(error).toBeInstanceOf(WorkbookEditTransactionError);
            expect(error).toMatchObject({ backup: 'backup.twb', rolledBack: true });
            expect(persisted).toBe(ORIGINAL);
        }
    });

    it('rolls back when persisted content differs from the validated edit', async () => {
        let persisted = ORIGINAL;
        let corruptFirstRead = true;
        await expect(runWorkbookEditTransaction(ORIGINAL, UPDATED, {
            createBackup: async () => 'backup.twb',
            write: async content => { persisted = content; },
            read: async () => {
                if (corruptFirstRead) {
                    corruptFirstRead = false;
                    return `${persisted} `;
                }
                return persisted;
            },
        })).rejects.toMatchObject({ rolledBack: true });
        expect(persisted).toBe(ORIGINAL);
    });
});

describe('workbook file transactions', () => {
    let directory: string;
    const encoder = new TextEncoder();
    const fileUri = (name: string) => {
        const filePath = path.join(directory, name);
        return { path: filePath, fsPath: filePath, toString: () => `file://${filePath}` } as vscode.Uri;
    };
    let fileSystem: {
        readFile: (uri: vscode.Uri) => Promise<Uint8Array>;
        writeFile: (uri: vscode.Uri, bytes: Uint8Array) => Promise<void>;
        createDirectory: (uri: vscode.Uri) => Promise<unknown>;
        stat: (uri: vscode.Uri) => Promise<unknown>;
        copy: (source: vscode.Uri, destination: vscode.Uri, options: { overwrite: boolean }) => Promise<void>;
        delete: (uri: vscode.Uri) => Promise<void>;
    };

    beforeEach(async () => {
        directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tableau-roundtrip-'));
        fileSystem = {
            readFile: uri => fs.readFile(uri.fsPath),
            writeFile: (uri, bytes) => fs.writeFile(uri.fsPath, bytes),
            createDirectory: uri => fs.mkdir(uri.fsPath, { recursive: true }),
            stat: uri => fs.stat(uri.fsPath),
            copy: (source, destination, options) => fs.copyFile(source.fsPath, destination.fsPath, options.overwrite ? 0 : fs.constants.COPYFILE_EXCL),
            delete: uri => fs.unlink(uri.fsPath),
        };
        Object.assign(vscode.workspace, { fs: fileSystem, textDocuments: [] });
    });

    afterEach(async () => {
        await fs.rm(directory, { recursive: true, force: true });
    });

    it('backs up the complete original package and preserves its extract after an edit', async () => {
        const zip = new JSZip();
        zip.file('Book.twb', ORIGINAL);
        zip.file('Data/data.hyper', new Uint8Array([0, 255, 5, 128]));
        const originalBytes = await zip.generateAsync({ type: 'uint8array' });
        const workbook = fileUri('Book.twbx');
        await fs.writeFile(workbook.fsPath, originalBytes);

        const receipt = await new WorkbookEditService().apply(workbook, ORIGINAL, UPDATED);

        expect(await fs.readFile(receipt.backup.fsPath)).toEqual(Buffer.from(originalBytes));
        const output = await JSZip.loadAsync(await fs.readFile(workbook.fsPath));
        expect(await output.file('Book.twb')!.async('string')).toBe(UPDATED);
        expect(await output.file('Data/data.hyper')!.async('uint8array')).toEqual(new Uint8Array([0, 255, 5, 128]));
        expect(receipt.verified).toBe(true);
    });

    it('refuses a stale edit without modifying the newer workbook', async () => {
        const workbook = fileUri('Book.twb');
        const newer = ORIGINAL.replace("name='A'", "name='C'");
        await fs.writeFile(workbook.fsPath, newer);
        await expect(new WorkbookEditService().apply(workbook, ORIGINAL, UPDATED)).rejects.toThrow(/changed|stale/i);
        expect(await fs.readFile(workbook.fsPath, 'utf8')).toBe(newer);
        expect(await fs.readdir(directory)).toEqual(['Book.twb']);
    });

    it('does not overwrite a concurrent edit made while the backup is being saved', async () => {
        const workbook = fileUri('Book.twb');
        const concurrent = ORIGINAL.replace("name='A'", "name='Concurrent'");
        await fs.writeFile(workbook.fsPath, ORIGINAL);
        fileSystem.writeFile = async (target, bytes) => {
            await fs.writeFile(target.fsPath, bytes);
            if (target.fsPath.includes('.tableau-lsp-backups')) {
                await fs.writeFile(workbook.fsPath, concurrent);
            }
        };
        await expect(new WorkbookEditService().apply(workbook, ORIGINAL, UPDATED)).rejects.toThrow(/changed|stale/i);
        expect(await fs.readFile(workbook.fsPath, 'utf8')).toBe(concurrent);
    });

    it('restores exact package bytes when the written archive is corrupted', async () => {
        const zip = new JSZip();
        zip.file('Book.twb', ORIGINAL);
        zip.file('Data/data.hyper', new Uint8Array([0, 255, 5, 128]));
        const originalBytes = await zip.generateAsync({ type: 'uint8array' });
        const workbook = fileUri('Book.twbx');
        await fs.writeFile(workbook.fsPath, originalBytes);
        let corrupt = true;
        fileSystem.writeFile = async (target, bytes) => {
            if (target.fsPath === workbook.fsPath && corrupt) {
                corrupt = false;
                await fs.writeFile(target.fsPath, new Uint8Array([80, 75, 0]));
            } else {
                await fs.writeFile(target.fsPath, bytes);
            }
        };
        await expect(new WorkbookEditService().apply(workbook, ORIGINAL, UPDATED)).rejects.toMatchObject({ rolledBack: true });
        expect(await fs.readFile(workbook.fsPath)).toEqual(Buffer.from(originalBytes));
    });

    it('preserves a newer valid external workbook observed during verification', async () => {
        const workbook = fileUri('Book.twb');
        const external = ORIGINAL.replace("name='A'", "name='Externally saved'");
        await fs.writeFile(workbook.fsPath, ORIGINAL);
        let externalWritePending = true;
        fileSystem.writeFile = async (target, bytes) => {
            await fs.writeFile(target.fsPath, bytes);
            if (target.fsPath === workbook.fsPath && externalWritePending) {
                externalWritePending = false;
                await fs.writeFile(target.fsPath, external);
            }
        };
        await expect(new WorkbookEditService().apply(workbook, ORIGINAL, UPDATED)).rejects.toMatchObject({ rolledBack: false });
        expect(await fs.readFile(workbook.fsPath, 'utf8')).toBe(external);
        const backups = await fs.readdir(path.join(directory, '.tableau-lsp-backups'));
        expect(backups).toHaveLength(1);
        expect(await fs.readFile(path.join(directory, '.tableau-lsp-backups', backups[0]), 'utf8')).toBe(ORIGINAL);
    });

    it('preserves an externally replaced Save Copy destination even when verification fails', async () => {
        const workbook = fileUri('Book.twb');
        const destination = fileUri('Book copy.twb');
        await fs.writeFile(workbook.fsPath, ORIGINAL);
        fileSystem.copy = async (source, target) => {
            await fs.copyFile(source.fsPath, target.fsPath, fs.constants.COPYFILE_EXCL);
            await fs.writeFile(target.fsPath, 'external replacement still being written');
        };
        await expect(new WorkbookEditService().saveCopy(workbook, destination)).rejects.toThrow();
        expect(await fs.readFile(destination.fsPath, 'utf8')).toBe('external replacement still being written');
        expect((await fs.readdir(directory)).sort()).toEqual(['Book copy.twb', 'Book.twb']);
    });

    it('rejects a corrupt backup before modifying the original workbook', async () => {
        const workbook = fileUri('Book.twb');
        await fs.writeFile(workbook.fsPath, ORIGINAL);
        fileSystem.writeFile = async (target, bytes) => {
            await fs.writeFile(target.fsPath, target.fsPath.includes('.tableau-lsp-backups') ? encoder.encode('truncated') : bytes);
        };
        await expect(new WorkbookEditService().apply(workbook, ORIGINAL, UPDATED)).rejects.toThrow(/backup/i);
        expect(await fs.readFile(workbook.fsPath, 'utf8')).toBe(ORIGINAL);
    });

    it('saves current unsaved editor text to a new copy without changing the source', async () => {
        const workbook = fileUri('Book.twb');
        const destination = fileUri('Book copy.twb');
        await fs.writeFile(workbook.fsPath, ORIGINAL);
        Object.assign(vscode.workspace, { textDocuments: [{ uri: workbook, getText: () => UPDATED }] });
        const copy = await new WorkbookEditService().saveCopy(workbook, destination);
        expect(copy).toBe(destination);
        expect(await fs.readFile(destination.fsPath, 'utf8')).toBe(UPDATED);
        expect(await fs.readFile(workbook.fsPath, 'utf8')).toBe(ORIGINAL);
    });

    it('refuses to overwrite the source or an existing copy and rejects format conversion', async () => {
        const workbook = fileUri('Book.twb');
        const destination = fileUri('Book copy.twb');
        await fs.writeFile(workbook.fsPath, ORIGINAL);
        await fs.writeFile(destination.fsPath, 'existing file');
        const service = new WorkbookEditService();
        await expect(service.saveCopy(workbook, workbook)).rejects.toThrow(/source|same/i);
        await expect(service.saveCopy(workbook, destination)).rejects.toThrow(/exists|overwrite/i);
        await expect(service.saveCopy(workbook, fileUri('Book.twbx'))).rejects.toThrow(/extension|format/i);
        expect(await fs.readFile(destination.fsPath, 'utf8')).toBe('existing file');
    });

    it('restores a valid backup over damaged XML and backs up the damaged file', async () => {
        const workbook = fileUri('Book.twb');
        const backup = fileUri('Earlier.twb');
        await fs.writeFile(workbook.fsPath, '<workbook>damaged');
        await fs.writeFile(backup.fsPath, ORIGINAL);
        const receipt = await new WorkbookEditService().restore(workbook, backup);
        expect(await fs.readFile(workbook.fsPath, 'utf8')).toBe(ORIGINAL);
        expect(await fs.readFile(receipt.backup.fsPath, 'utf8')).toBe('<workbook>damaged');
    });

    it('blocks side-panel writes to a package with unsaved XML while allowing the XML editor to save', async () => {
        const workbook = fileUri('Book.twbx');
        const virtual = { ...fileUri('Book.twb'), toString: () => 'tableau-workbook:/Book.twb' } as vscode.Uri;
        const zip = new JSZip();
        zip.file('Book.twb', ORIGINAL);
        const bytes = await zip.generateAsync({ type: 'uint8array' });
        await fs.writeFile(workbook.fsPath, bytes);
        bindWorkbookSource(virtual, workbook);
        Object.assign(vscode.workspace, { textDocuments: [{ uri: virtual, isDirty: true, getText: () => UPDATED }] });
        try {
            const service = new WorkbookEditService();
            await expect(service.apply(virtual, ORIGINAL, UPDATED)).rejects.toThrow(/unsaved/i);
            expect(await fs.readFile(workbook.fsPath)).toEqual(Buffer.from(bytes));
            await service.apply(virtual, ORIGINAL, UPDATED, { fromXmlEditor: true });
            const output = await JSZip.loadAsync(await fs.readFile(workbook.fsPath));
            expect(await output.file('Book.twb')!.async('string')).toBe(UPDATED);
        } finally {
            unbindWorkbookSource(virtual);
        }
    });

    it('includes unsaved packaged XML in Save Copy and refuses restore over those unsaved edits', async () => {
        const workbook = fileUri('Book.twbx');
        const destination = fileUri('Book copy.twbx');
        const virtual = { ...fileUri('Book.twb'), toString: () => 'tableau-workbook:/Book.twb' } as vscode.Uri;
        const zip = new JSZip();
        zip.file('nested/Book.twb', ORIGINAL);
        zip.file('Data/data.hyper', new Uint8Array([0, 255, 5, 128]));
        const bytes = await zip.generateAsync({ type: 'uint8array' });
        await fs.writeFile(workbook.fsPath, bytes);
        bindWorkbookSource(virtual, workbook);
        Object.assign(vscode.workspace, { textDocuments: [{ uri: virtual, isDirty: true, getText: () => UPDATED }] });
        try {
            const service = new WorkbookEditService();
            await service.saveCopy(virtual, destination);
            const copy = await JSZip.loadAsync(await fs.readFile(destination.fsPath));
            expect(await copy.file('nested/Book.twb')!.async('string')).toBe(UPDATED);
            expect(await copy.file('Data/data.hyper')!.async('uint8array')).toEqual(new Uint8Array([0, 255, 5, 128]));
            expect(await fs.readFile(workbook.fsPath)).toEqual(Buffer.from(bytes));
            await expect(service.restore(virtual, destination)).rejects.toThrow(/unsaved/i);
            expect(await fs.readFile(workbook.fsPath)).toEqual(Buffer.from(bytes));
        } finally {
            unbindWorkbookSource(virtual);
        }
    });

    it('serializes simultaneous edits and rejects the stale second proposal', async () => {
        const workbook = fileUri('Book.twb');
        await fs.writeFile(workbook.fsPath, ORIGINAL);
        const [first, second] = await Promise.allSettled([
            new WorkbookEditService().apply(workbook, ORIGINAL, UPDATED),
            new WorkbookEditService().apply(workbook, ORIGINAL, ORIGINAL.replace("name='A'", "name='Other'")),
        ]);
        expect(first.status).toBe('fulfilled');
        expect(second.status).toBe('rejected');
        expect(await fs.readFile(workbook.fsPath, 'utf8')).toBe(UPDATED);
    });
});
