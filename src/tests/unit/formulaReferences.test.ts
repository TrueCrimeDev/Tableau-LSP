import {
    describeUnknownReferences,
    extractFieldReferences,
    findUnknownReferences,
    knownReferenceNames,
} from '../../chat/formulaReferences.js';
import { CalculationPlanError, normalizeCalculationInput } from '../../chat/calculationPlan.js';
import { WorkbookDataField } from '../../services/workbookFieldContext.js';

const KNOWN = ['Sales', 'Profit', 'Order Date', 'Customer ID', 'Top N'];

function check(formula: string, extra: Partial<Parameters<typeof findUnknownReferences>[0]> = {}) {
    return findUnknownReferences({
        formula,
        knownNames: KNOWN,
        datasourceAliases: ['Superstore', 'federated.abc'],
        ...extra,
    });
}

describe('extractFieldReferences', () => {
    it('finds plain and qualified references', () => {
        expect(extractFieldReferences('SUM([Sales]) / [Superstore].[Profit]')).toEqual([
            { name: 'Sales' },
            { name: 'Profit', qualifier: 'Superstore' },
        ]);
    });

    it('ignores brackets inside string literals and comments', () => {
        const formula = '// uses [Ghost]\nIF [Sales] > 0 THEN "[Fake]" ELSE \'[Also Fake]\' END /* [Nope] */';
        expect(extractFieldReferences(formula).map(reference => reference.name)).toEqual(['Sales']);
    });

    it('unescapes ]] inside a field name', () => {
        expect(extractFieldReferences('[Weird]]Name] + 1')).toEqual([{ name: 'Weird]Name' }]);
    });

    it('reads LOD dimension declarations as references', () => {
        expect(extractFieldReferences('{FIXED [Customer ID] : SUM([Sales])}').map(r => r.name))
            .toEqual(['Customer ID', 'Sales']);
    });

    it('tolerates whitespace around the datasource dot', () => {
        expect(extractFieldReferences('[Superstore] . [Sales]'))
            .toEqual([{ name: 'Sales', qualifier: 'Superstore' }]);
    });

    it('does not run away on an unterminated bracket', () => {
        expect(extractFieldReferences('SUM([Sales]) + [Unclosed').map(r => r.name)).toEqual(['Sales']);
    });
});

describe('findUnknownReferences', () => {
    it('accepts a formula whose fields all exist', () => {
        expect(check('SUM([Profit]) / SUM([Sales])')).toEqual([]);
        expect(check('{FIXED [Customer ID] : MIN([Order Date])}')).toEqual([]);
    });

    it('catches a transposed letter and offers the real name', () => {
        const problems = check('SUM([Salez])');
        expect(problems).toHaveLength(1);
        expect(problems[0].name).toBe('Salez');
        expect(problems[0].suggestions).toContain('Sales');
    });

    it('suggests across punctuation and spacing differences', () => {
        expect(check('[order_date]')[0].suggestions).toContain('Order Date');
    });

    it('accepts a qualifier naming the target datasource, by caption or name', () => {
        expect(check('[Superstore].[Sales]')).toEqual([]);
        expect(check('[federated.abc].[Sales]')).toEqual([]);
    });

    it('rejects a field borrowed from another datasource', () => {
        const problems = check('[Returns].[Sales]');
        expect(problems).toHaveLength(1);
        expect(problems[0].qualifier).toBe('Returns');
    });

    it('allows the [Parameters] qualifier', () => {
        expect(check('[Parameters].[Top N]')).toEqual([]);
    });

    it('allows a calculation to reference itself when being replaced', () => {
        expect(check('[Profit Ratio] * 2', { selfName: 'Profit Ratio' })).toEqual([]);
        expect(check('[Profit Ratio] * 2')).toHaveLength(1);
    });

    it('reports each unknown name once', () => {
        expect(check('[Ghost] + [Ghost] + [Ghost]')).toHaveLength(1);
    });

    it('skips the check when the catalogue is empty rather than blocking everything', () => {
        // An empty list means extraction failed, not that the workbook has no
        // fields — refusing every write on that would be worse than not checking.
        expect(findUnknownReferences({
            formula: '[Anything]',
            knownNames: [],
            datasourceAliases: ['DS'],
        })).toEqual([]);
    });
});

describe('knownReferenceNames', () => {
    const fields = [
        { name: 'Sales', datasource: 'Orders', kind: 'field' },
        { name: 'Refund', datasource: 'Returns', kind: 'field' },
        { name: 'Profit Ratio', datasource: 'Orders', kind: 'calculation' },
        { name: 'Top N', datasource: 'Parameters', kind: 'parameter' },
    ] as WorkbookDataField[];

    it('takes the target datasource plus every parameter', () => {
        const names = knownReferenceNames(fields, 'Orders');
        expect(names).toContain('Sales');
        expect(names).toContain('Profit Ratio');
        // Parameters live in their own pseudo-datasource but are referencable
        // from a calculation in any datasource.
        expect(names).toContain('Top N');
        expect(names).not.toContain('Refund');
    });
});

describe('describeUnknownReferences', () => {
    it('names the datasource, the bad field, and what to do next', () => {
        const message = describeUnknownReferences(check('SUM([Salez])'), 'Superstore');
        expect(message).toContain('"Superstore" does not have');
        expect(message).toContain('[Salez]');
        expect(message).toContain('did you mean [Sales]');
        expect(message).toContain('tableau_listFields');
        expect(message).toContain('Nothing was written.');
    });
});

describe('normalizeCalculationInput — reference checking', () => {
    const XML = `<workbook><datasources><datasource caption='Superstore' name='ds'>
      <column caption='Sales' datatype='real' name='[Sales]' role='measure' />
      <column caption='Profit' datatype='real' name='[Profit]' role='measure' />
    </datasource></datasources></workbook>`;

    it('lets a correct formula through', () => {
        const plan = normalizeCalculationInput(
            { caption: 'Profit Ratio', formula: 'SUM([Profit]) / SUM([Sales])', datatype: 'real' },
            XML
        );
        expect(plan.caption).toBe('Profit Ratio');
    });

    it('blocks a misspelled field before the confirmation card', () => {
        expect(() => normalizeCalculationInput(
            { caption: 'Bad', formula: 'SUM([Salez])', datatype: 'real' },
            XML
        )).toThrow(CalculationPlanError);
        expect(() => normalizeCalculationInput(
            { caption: 'Bad', formula: 'SUM([Salez])', datatype: 'real' },
            XML
        )).toThrow(/did you mean \[Sales\]/);
    });

    it('does not mistake bracketed text in a string literal for a field', () => {
        const plan = normalizeCalculationInput(
            { caption: 'Label', formula: 'IF [Sales] > 0 THEN "[High]" ELSE "[Low]" END', datatype: 'string' },
            XML
        );
        expect(plan.formula).toContain('[High]');
    });
});
