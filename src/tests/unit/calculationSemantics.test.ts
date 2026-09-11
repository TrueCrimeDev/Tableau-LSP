import { TextDocument } from 'vscode-languageserver-textdocument';
import { getDiagnostics } from '../../diagnosticsProvider.js';
import { parseDocument } from '../../documentModel.js';
import { FieldParser } from '../../fieldParser.js';
import { addOrUpdateWorkbookCalculation, validateCalculationFormula } from '../../parsers/workbookCalculations.js';
import { normalizeCalculationInput } from '../../chat/calculationPlan.js';

const xml = `<workbook><datasources>
<datasource name='Parameters'><column name='[Rate]' datatype='real' param-domain-type='any'/></datasource>
<datasource name='orders' caption='Orders'>
<column name='[Sales]' datatype='real'/><column name='[Profit]' datatype='real'/>
<column name='[Category]' datatype='string'/>
<column name='[Existing]' datatype='real'><calculation formula='SUM([Sales])'/></column>
</datasource></datasources></workbook>`;

function write(formula: string): unknown {
    return addOrUpdateWorkbookCalculation(xml, { datasource: 'Orders', caption: 'New calculation', formula, datatype: 'real' });
}

describe('conservative calculation semantic validation', () => {
    it.each([
        'SUM([Sales]) - [Profit]',
        'IF SUM([Sales]) > 0 THEN [Profit] ELSE 0 END',
        'SUM([Sales]) + MIN([Profit], 0)',
    ])('blocks known row/aggregate mixtures before writing: %s', formula => {
        expect(() => write(formula)).toThrow(/aggregate.*row-level/i);
    });

    it.each([
        '"Revenue" * 2',
        'IF TRUE THEN 1 ELSE "none" END',
        'CASE 1 WHEN 1 THEN "one" WHEN 2 THEN 2 ELSE NULL END',
        'IIF(TRUE, 1, "none")',
        '[Category] * 2',
        'IF 1 THEN "yes" ELSE "no" END',
    ])('blocks definite incompatible types before writing: %s', formula => {
        expect(() => write(formula)).toThrow(/type|boolean/i);
    });

    it.each([
        'SUM([Sales]) - SUM([Profit])',
        'SUM([Sales]) * [Rate]',
        'SUM([Sales]) * [Parameters].[Rate]',
        '[Sales] / { FIXED [Category] : SUM([Sales]) }',
        'SUM([Sales]) / SUM({ INCLUDE [Category] : SUM([Sales]) })',
        'WINDOW_SUM(SUM([Sales])) / TOTAL(SUM([Profit]))',
        'IF SUM([Sales]) > 0 THEN SUM([Profit]) ELSE NULL END',
        'CASE [Category] WHEN "A" THEN 1 ELSE 2 END',
        'MIN([Sales], [Profit]) + 1',
        'IF TRUE THEN #2026-01-01# ELSE DATE("2026-02-01") END',
        '"A" + "B"',
        '#2026-01-01# + 1',
        '[Existing] / SUM([Sales])',
        'MYSTERY_FUNCTION([Sales]) + SUM([Profit])',
        'WINDOW_CUSTOM([Sales]) + [Profit]',
    ])('preserves valid or uninferred constructs: %s', formula => {
        expect(() => write(formula)).not.toThrow();
    });

    it('shares literal type checks with the formula planning entrypoint', () => {
        expect(validateCalculationFormula('IF TRUE THEN 1 ELSE "none" END').join(' ')).toMatch(/type/i);
    });

    it('rejects known mixed aggregation before showing the calculation plan', () => {
        expect(() => normalizeCalculationInput({
            caption: 'Mixed', formula: 'SUM([Sales]) - [Profit]', datasource: 'Orders', datatype: 'real',
        }, xml)).toThrow(/aggregate.*row-level/i);
    });

    it('resolves field datatypes in their own datasource', () => {
        const withOtherSource = xml.replace('</datasources>', `<datasource caption='Other' name='other'><column name='[Category]' datatype='real'/></datasource></datasources>`);
        expect(() => addOrUpdateWorkbookCalculation(withOtherSource, {
            datasource: 'Orders', caption: 'Scoped', formula: '[Other].[Category] * 2', datatype: 'real',
        })).not.toThrow();
    });

    it('reports a narrow operator range in editor diagnostics using workbook metadata', () => {
        const formula = 'SUM([Sales]) - [Profit]';
        const document = TextDocument.create('file:///calculation.twbl', 'tableau', 1, formula);
        const fields = new FieldParser(null);
        fields.setRuntimeFields(['Sales', 'Profit'].map(name => ({ name, type: 'Number', datatype: 'real', kind: 'field', description: '' })));
        const diagnostics = getDiagnostics(document, parseDocument(document), fields);
        const diagnostic = diagnostics.find(item => item.code === 'MIXED_AGGREGATION');
        expect(diagnostic).toBeDefined();
        expect(document.getText(diagnostic!.range)).toBe('-');
    });

    it('does not guess missing field types or parameter aggregation', () => {
        const document = TextDocument.create('file:///calculation.twbl', 'tableau', 1, 'SUM([Sales]) * [Unknown]');
        const diagnostics = getDiagnostics(document, parseDocument(document));
        expect(diagnostics.filter(item => item.code === 'MIXED_AGGREGATION')).toEqual([]);
    });
});
