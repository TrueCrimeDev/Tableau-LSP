import {
    WorkbookEditTransactionError,
    runWorkbookEditTransaction,
} from '../../services/workbookEditService.js';

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
