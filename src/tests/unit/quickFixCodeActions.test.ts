import { CodeAction, Diagnostic, Range, TextEdit } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { provideCodeActions } from '../../provider.js';
import { getDiagnostics } from '../../diagnosticsProvider.js';
import { parseDocument } from '../../documentModel.js';
import { FieldParser } from '../../fieldParser.js';

describe('Quick Fix replacements', () => {
    const document = (text: string) => TextDocument.create('file:///work/Calc.twbl', 'twbl', 1, text);
    const diagnostic = (text: string, message: string, extra: Partial<Diagnostic> = {}): Diagnostic => ({
        range: Range.create(0, 0, 0, text.length), message, ...extra,
    });
    const actionsFor = (doc: TextDocument, diag: Diagnostic): CodeAction[] => provideCodeActions({
        textDocument: { uri: doc.uri }, range: diag.range, context: { diagnostics: [diag] },
    }, doc);
    const editsFor = (action: CodeAction, doc: TextDocument): TextEdit[] => action.edit!.changes![doc.uri];

    it('ranks SUM ahead of unrelated similar-length functions for a legacy diagnostic', () => {
        const doc = document('SUMM([Sales])');
        const actions = actionsFor(doc, diagnostic('SUMM', 'Unknown function: SUMM'));
        expect(editsFor(actions[0], doc)[0].newText).toBe('SUM');
        expect(actions[0].isPreferred).toBe(true);
    });

    it('recognizes an extended diagnostic and replaces only the identifier in a broad call range', () => {
        const doc = document('SUMM  ([Sales]) + SUM([Profit])');
        const actions = actionsFor(doc, diagnostic('SUMM  ([Sales])',
            'Unknown function: SUMM. Verify function name or check if this should be a field reference.'));
        expect(actions.length).toBeGreaterThan(0);
        expect(TextDocument.applyEdits(doc, editsFor(actions[0], doc)))
            .toBe('SUM  ([Sales]) + SUM([Profit])');
    });

    it.each(['UNKNOWN_FUNCTION', 'Invalid Function'])
        ('uses diagnostic code %s and data independently of the message wording', code => {
        const doc = document('SMU([Sales])');
        const actions = actionsFor(doc, diagnostic('SMU', 'Unrecognized callable.', {
            code, data: { functionName: 'SMU' },
        }));
        expect(actions.length).toBeGreaterThan(0);
        expect(editsFor(actions[0], doc)[0].newText).toBe('SUM');
    });

    it('does not invent a function fix based only on name length', () => {
        const doc = document('ZQX([Sales])');
        expect(actionsFor(doc, diagnostic('ZQX', 'Unknown function: ZQX'))).toEqual([]);
    });

    it('does not change a name that is already present in the current catalog', () => {
        const doc = document('COUNT([Sales])');
        expect(actionsFor(doc, diagnostic('COUNT', 'Unknown function: COUNT'))).toEqual([]);
        const fieldDoc = document('[Cats]');
        expect(actionsFor(fieldDoc, diagnostic('[Cats]', 'Unknown field.', {
            code: 'UNKNOWN_FIELD', data: { fieldName: 'Cats', suggestions: ['Cats', 'Rats'] },
        }))).toEqual([]);
    });

    it('ranks known field names by edits and breaks ties consistently across candidate order', () => {
        const doc = document('[Catz]');
        const candidates = ['Rats', 'Carts', 'Cats', 'Bat', 'Cans', 'Cats'];
        const getReplacements = (suggestions: string[]) => actionsFor(doc, diagnostic('[Catz]', 'Unknown field.', {
            code: 'UNKNOWN_FIELD', data: { fieldName: 'Catz', suggestions },
        })).map(action => editsFor(action, doc)[0].newText);
        expect(getReplacements(candidates)).toEqual(['[Cats]']);
        expect(getReplacements([...candidates].reverse())).toEqual(['[Cats]']);

        const tiedDoc = document('[Bats]');
        for (const suggestions of [['Rats', 'Hats', 'Cats', 'Mats'], ['Mats', 'Cats', 'Hats', 'Rats']]) {
            const tied = actionsFor(tiedDoc, diagnostic('[Bats]', 'Unknown field.', {
                code: 'UNKNOWN_FIELD', data: { fieldName: 'Bats', suggestions },
            }));
            expect(tied.map(action => editsFor(action, tiedDoc)[0].newText)).toEqual(['[Cats]', '[Hats]', '[Mats]']);
            expect(tied.every(action => !action.isPreferred)).toBe(true);
        }
    });

    it('preserves a datasource qualifier and surrounding calculation when fixing a field', () => {
        const doc = document('SUM([Orders].[Slaes]) + [Tax]');
        const diag = diagnostic('[Slaes]', 'Unknown field [Slaes] in datasource [Orders].', {
            range: Range.create(0, 13, 0, 20), code: 'UNKNOWN_FIELD',
            data: { fieldName: 'Slaes', datasource: 'Orders', suggestions: ['Sales', 'Profit'] },
        });
        const actions = actionsFor(doc, diag);
        expect(actions.length).toBeGreaterThan(0);
        expect(TextDocument.applyEdits(doc, editsFor(actions[0], doc))).toBe('SUM([Orders].[Sales]) + [Tax]');
    });

    it('preserves the temporary field marker when correcting its name', () => {
        const doc = document('[#Slaes]');
        const actions = actionsFor(doc, diagnostic('[#Slaes]', 'Unknown field.', {
            code: 'UNKNOWN_FIELD', data: { fieldName: '#Slaes', suggestions: ['Sales'] },
        }));
        expect(actions.length).toBeGreaterThan(0);
        expect(editsFor(actions[0], doc)[0].newText).toBe('[#Sales]');
    });

    it.each([
        ['SUM([Sales])', 0], ['SUMMER([Sales])', 0], ['"SUMM([Sales])"', 1],
        ['// SUMM([Sales])', 3], ['[A SUMM(field)]', 3],
    ] as const)('ignores stale or non-code function diagnostics in %s', (text, start) => {
            const doc = document(text);
            expect(actionsFor(doc, diagnostic('SUMM', 'Unknown function: SUMM', {
                range: Range.create(0, start, 0, start + 4),
            }))).toEqual([]);
        });

    it('does not replace a datasource qualifier as though it were a field', () => {
        const doc = document('[Slaes].[Amount]');
        expect(actionsFor(doc, diagnostic('[Slaes]', 'Unknown field.', {
            code: 'UNKNOWN_FIELD', data: { fieldName: 'Slaes', suggestions: ['Sales'] },
        }))).toEqual([]);
    });

    it('keeps the existing header insertion Quick Fix', () => {
        const doc = document('SUM([Sales])');
        const actions = actionsFor(doc, diagnostic('SUM', 'Missing header.', {
            code: 'MISSING_HEADER_COMMENT', data: { insertLine: 0, header: '// !Sales - Total sales' },
        }));
        expect(TextDocument.applyEdits(doc, editsFor(actions[0], doc)))
            .toBe('// !Sales - Total sales\nSUM([Sales])');
    });

    it('fixes the function diagnostic emitted by the real parser and validator', () => {
        const doc = document('SUMM([Sales])');
        const diagnostics = getDiagnostics(doc, parseDocument(doc));
        expect(diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'UNKNOWN_FUNCTION' })]));
        const diag = diagnostics.find(item => item.code === 'UNKNOWN_FUNCTION');
        const actions = actionsFor(doc, diag!);
        expect(actions.length).toBeGreaterThan(0);
        expect(TextDocument.applyEdits(doc, editsFor(actions[0], doc))).toBe('SUM([Sales])');
    });

    it('only offers field replacements from the datasource that emitted the diagnostic', () => {
        const doc = document('SUM([Orders].[Amont])');
        const fields = new FieldParser(null);
        fields.setRuntimeFields([
            { name: 'Amount', type: 'Number', description: '', datasource: 'Orders' },
            { name: 'Amort', type: 'Number', description: '', datasource: 'Returns' },
        ]);
        const diag = getDiagnostics(doc, parseDocument(doc), fields).find(item => item.code === 'UNKNOWN_FIELD');
        expect(diag).toBeDefined();
        const actions = actionsFor(doc, diag!);
        expect(actions).toHaveLength(1);
        expect(TextDocument.applyEdits(doc, editsFor(actions[0], doc))).toBe('SUM([Orders].[Amount])');
    });
});
