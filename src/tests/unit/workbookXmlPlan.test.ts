import { planWorkbookXmlEdit, readXmlPage, workbookRevision, copyFileName } from '../../chat/workbookXmlPlan.js';

const xml = '<workbook version="18.1"><datasources/><worksheets><worksheet name="Sales"><table><style><format attr="border-width" value="1" /></style></table></worksheet></worksheets></workbook>';

describe('agent workbook XML edits', () => {
    it('changes the requested XML while preserving all other bytes', () => {
        const updated = planWorkbookXmlEdit(xml, workbookRevision(xml), [
            { oldText: 'attr="border-width" value="1"', newText: 'attr="border-width" value="0"' },
        ]);
        expect(updated).toBe(xml.replace('value="1"', 'value="0"'));
    });

    it('rejects stale revisions before making changes', () => {
        expect(() => planWorkbookXmlEdit(xml, workbookRevision(xml + ' '), [
            { oldText: 'value="1"', newText: 'value="0"' },
        ])).toThrow(/changed/);
    });

    it.each([
        [{ oldText: 'missing', newText: 'replacement' }],
        [{ oldText: '', newText: 'replacement' }],
        [{ oldText: 'worksheet', newText: 'dashboard' }],
        [{ oldText: '</table>', newText: '' }],
        [{ oldText: 'value="1"', newText: 'value="1"' }],
    ])('rejects missing, ambiguous, malformed and no-op replacements', replacement => {
        expect(() => planWorkbookXmlEdit(xml, workbookRevision(xml), [replacement])).toThrow();
    });

    it('validates the complete batch before returning any edit', () => {
        expect(() => planWorkbookXmlEdit(xml, workbookRevision(xml), [
            { oldText: 'value="1"', newText: 'value="0"' },
            { oldText: '</workbook>', newText: '' },
        ])).toThrow();
    });

    it('pages large one-line XML without silently dropping text', () => {
        const first = readXmlPage(xml, { length: 50 });
        const second = readXmlPage(xml, { offset: first.nextOffset!, length: xml.length });
        expect(first.xml + second.xml).toBe(xml);
        expect(first.hasMore).toBe(true);
        expect(second.hasMore).toBe(false);
    });

    it('locates an exact XML fragment and reports its character offset', () => {
        const page = readXmlPage(xml, { search: '<style>', length: 60 });
        expect(page.offset).toBe(xml.indexOf('<style>'));
        expect(page.xml).toMatch(/^<style>/);
        expect(() => readXmlPage(xml, { search: 'missing' })).toThrow(/not found/);
    });

    it.each([-1, 0.5, NaN])('rejects invalid read offsets %s', offset => {
        expect(() => readXmlPage(xml, { offset })).toThrow();
    });

    it('keeps copies beside the source and in the same format', () => {
        expect(copyFileName('Book.twbx')).toBe('Book-edited.twbx');
        expect(copyFileName('Book.twb', 'Presentation.twb')).toBe('Presentation.twb');
        for (const name of ['../Other.twb', 'sub/Other.twb', 'sub\\Other.twb', 'C:Other.twb', 'Other.twbx', 'CON.twb', 'Book.twb']) {
            expect(() => copyFileName('Book.twb', name)).toThrow();
        }
    });
});
