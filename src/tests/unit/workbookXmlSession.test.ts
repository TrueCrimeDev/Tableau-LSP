import { WorkbookXmlSession } from '../../services/workbookXmlSession.js';

describe('packaged XML editor session', () => {
    it('saves from the original baseline and advances it only after a successful transaction', async () => {
        let disk = '<workbook original="yes" />';
        const session = new WorkbookXmlSession(disk, async (before, after) => {
            if (disk !== before) { throw new Error('stale'); }
            disk = after;
        });
        await session.save('<workbook edited="first" />');
        await session.save('<workbook edited="second" />');
        expect(disk).toBe('<workbook edited="second" />');
        expect(session.text).toBe(disk);
    });

    it('retains the original baseline after a failed save so retry cannot overwrite external changes', async () => {
        let disk = 'original';
        const session = new WorkbookXmlSession(disk, async (before, after) => {
            if (disk !== before) { throw new Error('stale'); }
            disk = after;
        });
        disk = 'external change';
        await expect(session.save('user edit')).rejects.toThrow('stale');
        await expect(session.save('another edit')).rejects.toThrow('stale');
        expect(disk).toBe('external change');
        expect(session.text).toBe('original');
    });

    it('serializes saves so a second transaction uses the persisted baseline', async () => {
        let disk = 'original';
        const session = new WorkbookXmlSession(disk, async (before, after) => {
            await Promise.resolve();
            if (disk !== before) { throw new Error('stale'); }
            disk = after;
        });
        await Promise.all([session.save('first'), session.save('second')]);
        expect(disk).toBe('second');
    });

    it('does not create a transaction for unchanged XML', async () => {
        const session = new WorkbookXmlSession('original', async () => { throw new Error('unnecessary write'); });
        await expect(session.save('original')).resolves.toBeUndefined();
    });
});
