import { XMLValidator } from 'fast-xml-parser';
import {
    HealthFinding,
    WorkbookHealthInput,
    computeWorkbookHealth,
    removeCalculationsFromXml,
} from '../../services/workbookInsights.js';

const LF = '\n';

function calcColumnLines(caption: string, name: string, formula: string): string[] {
    return [
        `      <column caption='${caption}' datatype='real' name='${name}' role='measure' type='quantitative'>`,
        `        <calculation class='tableau' formula='${formula}' />`,
        `      </column>`,
    ];
}

const PROFIT_RATIO = calcColumnLines('Profit Ratio', '[Calculation_100]', 'SUM([Profit]) / SUM([Sales])');
const HIGH_SALES = calcColumnLines('High Sales', '[Calculation_200]', '[Sales] &gt; 100');
const SALES_BUCKET = calcColumnLines(
    'Sales Bucket',
    '[Calculation_300]',
    'IF [Sales] &gt; 100 THEN &quot;High&quot; ELSE &quot;Low&quot; END'
);
const USED_CALC = calcColumnLines('Used Calc', '[Calculation_400]', 'SUM([Salary]) * 2');
const FOLDER_ITEM_LINE = `        <folder-item name='[Calculation_100]' type='field' />`;
const SORT_ORDER_LINE = `      <field-sort-custom-order field='[Calculation_100]' />`;

// BorderTest.twb-style fixture: federated clipboard datasource, worksheet with
// datasource-dependencies, folders, and a custom sort order.
function workbookLines(): string[] {
    return [
        `<?xml version='1.0' encoding='utf-8' ?>`,
        `<!-- build 20261.26.0226.1626 -->`,
        `<workbook original-version='18.1' source-platform='win' version='18.1' xmlns:user='http://www.tableausoftware.com/xml/user'>`,
        `  <preferences>`,
        `    <preference name='ui.encoding.shelf.height' value='24' />`,
        `  </preferences>`,
        `  <datasources>`,
        `    <datasource caption='TestData' inline='true' name='Clipboard_20260204T115049' version='18.1'>`,
        `      <connection class='textscan' cleaning='yes' validate='no' />`,
        ...PROFIT_RATIO,
        ...HIGH_SALES,
        ...SALES_BUCKET,
        ...USED_CALC,
        `      <column datatype='integer' name='[Salary]' role='measure' type='quantitative' />`,
        `      <folder name='Calcs' role='measures'>`,
        FOLDER_ITEM_LINE,
        `        <folder-item name='[Salary]' type='field' />`,
        `      </folder>`,
        SORT_ORDER_LINE,
        `    </datasource>`,
        `    <datasource caption='Targets' inline='true' name='targets' version='18.1'>`,
        ...calcColumnLines('Target Met', '[Calculation_500]', '[Target] &gt;= 1'),
        `    </datasource>`,
        `  </datasources>`,
        `  <worksheets>`,
        `    <worksheet name='Border'>`,
        `      <table>`,
        `        <view>`,
        `          <datasource-dependencies datasource='Clipboard_20260204T115049'>`,
        `            <column caption='Used Calc' datatype='real' name='[Calculation_400]' role='measure' type='quantitative' />`,
        `            <column datatype='integer' name='[Salary]' role='measure' type='quantitative' />`,
        `          </datasource-dependencies>`,
        `        </view>`,
        `      </table>`,
        `    </worksheet>`,
        `  </worksheets>`,
        `</workbook>`,
    ];
}

const XML = workbookLines().join(LF);

function withoutLines(lines: string[], remove: string[]): string {
    const pending = [...remove];
    return lines
        .filter(line => {
            const index = pending.indexOf(line);
            if (index >= 0) {
                pending.splice(index, 1);
                return false;
            }
            return true;
        })
        .join(LF);
}

describe('removeCalculationsFromXml', () => {
    it('returns the input untouched for an empty target list', () => {
        expect(removeCalculationsFromXml(XML, [])).toEqual({ updatedXml: XML, removed: [], skipped: [] });
    });

    it('removes a single calculated field', () => {
        const result = removeCalculationsFromXml(XML, [{ caption: 'High Sales', datasource: 'TestData' }]);

        expect(result.removed).toEqual([{ caption: 'High Sales', datasource: 'TestData' }]);
        expect(result.skipped).toEqual([]);
        expect(result.updatedXml).not.toContain(`caption='High Sales'`);
        expect(result.updatedXml).not.toContain('[Calculation_200]');
        expect(result.updatedXml).toContain(`caption='Profit Ratio'`);
        expect(result.updatedXml).toContain(`caption='Sales Bucket'`);
        expect(result.updatedXml).toContain(`caption='Target Met'`);
        expect(XMLValidator.validate(result.updatedXml)).toBe(true);
        expect(result.updatedXml).toBe(withoutLines(workbookLines(), HIGH_SALES));
    });

    it('matches datasources by internal name as well as caption', () => {
        const result = removeCalculationsFromXml(XML, [
            { caption: 'High Sales', datasource: 'Clipboard_20260204T115049' },
        ]);
        expect(result.removed).toHaveLength(1);
        expect(result.updatedXml).not.toContain('[Calculation_200]');
    });

    it('removes three targets and keeps every surrounding byte identical', () => {
        const result = removeCalculationsFromXml(XML, [
            { caption: 'Profit Ratio', datasource: 'TestData' },
            { caption: 'High Sales', datasource: 'TestData' },
            { caption: 'Sales Bucket', datasource: 'TestData' },
        ]);

        expect(result.removed).toHaveLength(3);
        expect(result.skipped).toEqual([]);
        // Profit Ratio's folder-item and sort-order entries go with it; every
        // other byte of the document must be untouched.
        const expected = withoutLines(workbookLines(), [
            ...PROFIT_RATIO,
            ...HIGH_SALES,
            ...SALES_BUCKET,
            FOLDER_ITEM_LINE,
            SORT_ORDER_LINE,
        ]);
        expect(result.updatedXml).toBe(expected);
        expect(XMLValidator.validate(result.updatedXml)).toBe(true);
    });

    it('drops the calculation count by exactly the number of removals', () => {
        const result = removeCalculationsFromXml(XML, [
            { caption: 'Profit Ratio', datasource: 'TestData' },
            { caption: 'Sales Bucket', datasource: 'TestData' },
        ]);
        const count = (xml: string): number => (xml.match(/<calculation\b/g) ?? []).length;
        expect(count(XML) - count(result.updatedXml)).toBe(2);
    });

    it('cleans up folder-item and field-sort-custom-order entries without touching parents', () => {
        const result = removeCalculationsFromXml(XML, [{ caption: 'Profit Ratio', datasource: 'TestData' }]);

        expect(result.removed).toHaveLength(1);
        expect(result.updatedXml).not.toContain(`<folder-item name='[Calculation_100]'`);
        expect(result.updatedXml).not.toContain('<field-sort-custom-order');
        expect(result.updatedXml).toContain(`<folder name='Calcs' role='measures'>`);
        expect(result.updatedXml).toContain('</folder>');
        expect(result.updatedXml).toContain(`<folder-item name='[Salary]' type='field' />`);
        expect(XMLValidator.validate(result.updatedXml)).toBe(true);
    });

    it('skips ambiguous captions within a datasource', () => {
        const lines = workbookLines();
        const insertAt = lines.indexOf(`    </datasource>`);
        lines.splice(insertAt, 0, ...calcColumnLines('Profit Ratio', '[Calculation_900]', '1 + 1'));
        const ambiguousXml = lines.join(LF);

        const result = removeCalculationsFromXml(ambiguousXml, [
            { caption: 'Profit Ratio', datasource: 'TestData' },
        ]);
        expect(result.removed).toEqual([]);
        expect(result.skipped).toEqual([
            { caption: 'Profit Ratio', datasource: 'TestData', reason: 'ambiguous' },
        ]);
        expect(result.updatedXml).toBe(ambiguousXml);
    });

    it('refuses to remove calculations referenced by datasource-dependencies', () => {
        const result = removeCalculationsFromXml(XML, [{ caption: 'Used Calc', datasource: 'TestData' }]);
        expect(result.removed).toEqual([]);
        expect(result.skipped).toEqual([
            { caption: 'Used Calc', datasource: 'TestData', reason: 'in use' },
        ]);
        expect(result.updatedXml).toBe(XML);
    });

    it('skips targets whose datasource or caption cannot be found', () => {
        const result = removeCalculationsFromXml(XML, [
            { caption: 'High Sales', datasource: 'Nope' },
            { caption: 'Missing', datasource: 'TestData' },
        ]);
        expect(result.removed).toEqual([]);
        expect(result.skipped).toEqual([
            { caption: 'High Sales', datasource: 'Nope', reason: 'datasource not found' },
            { caption: 'Missing', datasource: 'TestData', reason: 'not found' },
        ]);
        expect(result.updatedXml).toBe(XML);
    });

    it('skips columns with multiple calculation children as unsupported', () => {
        const lines = workbookLines();
        const insertAt = lines.indexOf(`    </datasource>`);
        lines.splice(insertAt, 0,
            `      <column caption='Weird' datatype='real' name='[Calculation_910]' role='measure' type='quantitative'>`,
            `        <calculation class='tableau' formula='1' />`,
            `        <calculation class='tableau' formula='2' />`,
            `      </column>`);
        const xml = lines.join(LF);

        const result = removeCalculationsFromXml(xml, [{ caption: 'Weird', datasource: 'TestData' }]);
        expect(result.skipped).toEqual([
            { caption: 'Weird', datasource: 'TestData', reason: 'unsupported' },
        ]);
        expect(result.updatedXml).toBe(xml);
    });

    it('skips duplicate targets that resolve to the same column', () => {
        const result = removeCalculationsFromXml(XML, [
            { caption: 'High Sales', datasource: 'TestData' },
            { caption: 'high sales', datasource: 'testdata' },
        ]);
        expect(result.removed).toEqual([{ caption: 'High Sales', datasource: 'TestData' }]);
        expect(result.skipped).toEqual([
            { caption: 'high sales', datasource: 'testdata', reason: 'duplicate target' },
        ]);
    });

    it('skips everything when the input is not well-formed XML', () => {
        const result = removeCalculationsFromXml('<workbook><datasources>', [
            { caption: 'High Sales', datasource: 'TestData' },
        ]);
        expect(result.updatedXml).toBe('<workbook><datasources>');
        expect(result.removed).toEqual([]);
        expect(result.skipped).toEqual([
            { caption: 'High Sales', datasource: 'TestData', reason: 'invalid workbook xml' },
        ]);
    });

    it('ignores commented-out columns and dependencies', () => {
        const lines = workbookLines();
        const insertAt = lines.indexOf(`    </datasource>`);
        lines.splice(insertAt, 0, `      <!-- <column caption='Ghost'><calculation formula='1' /></column> -->`);
        const xml = lines.join(LF);

        const result = removeCalculationsFromXml(xml, [{ caption: 'Ghost', datasource: 'TestData' }]);
        expect(result.skipped).toEqual([
            { caption: 'Ghost', datasource: 'TestData', reason: 'not found' },
        ]);
    });
});

describe('removeCalculationsFromXml verification failure fallback', () => {
    it('returns the original xml with everything skipped when self-verification fails', () => {
        jest.isolateModules(() => {
            const actual = jest.requireActual('fast-xml-parser');
            let validateCalls = 0;
            jest.doMock('fast-xml-parser', () => ({
                ...actual,
                XMLValidator: {
                    validate: (xml: string): boolean | object => {
                        validateCalls += 1;
                        // First call checks the original document; every later
                        // call sees the transformed document and reports failure.
                        return validateCalls === 1
                            ? actual.XMLValidator.validate(xml)
                            : { err: { msg: 'forced failure', line: 1, col: 1 } };
                    },
                },
            }));
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const insights = require('../../services/workbookInsights.js') as
                typeof import('../../services/workbookInsights.js');

            const result = insights.removeCalculationsFromXml(XML, [
                { caption: 'High Sales', datasource: 'TestData' },
                { caption: 'Missing', datasource: 'TestData' },
            ]);

            expect(result.updatedXml).toBe(XML);
            expect(result.removed).toEqual([]);
            expect(result.skipped).toEqual([
                { caption: 'Missing', datasource: 'TestData', reason: 'not found' },
                { caption: 'High Sales', datasource: 'TestData', reason: 'verification failed' },
            ]);
        });
        jest.dontMock('fast-xml-parser');
    });
});

describe('computeWorkbookHealth', () => {
    function baseInput(overrides: Partial<WorkbookHealthInput> = {}): WorkbookHealthInput {
        return {
            calculations: [],
            datasourceCount: 1,
            worksheetCount: 1,
            filters: [],
            dashboards: [],
            xml: '',
            ...overrides,
        };
    }

    function findingFor(findings: HealthFinding[], rule: string): HealthFinding | undefined {
        return findings.find(finding => finding.rule === rule);
    }

    it('returns no findings for a healthy workbook', () => {
        expect(computeWorkbookHealth(baseInput())).toEqual([]);
    });

    it('flags formulas longer than 600 characters', () => {
        const findings = computeWorkbookHealth(baseInput({
            calculations: [
                { title: 'Long One', datasource: 'Orders', formula: 'A'.repeat(601) },
                { title: 'Fine', datasource: 'Orders', formula: 'A'.repeat(600) },
            ],
        }));
        const finding = findingFor(findings, 'long-calc');
        expect(finding?.severity).toBe('warn');
        expect(finding?.items).toEqual(['Long One']);
    });

    it('flags calc-to-calc reference chains four levels deep', () => {
        const findings = computeWorkbookHealth(baseInput({
            calculations: [
                { title: 'A', datasource: 'Orders', formula: '[B]', uses: ['B'] },
                { title: 'B', datasource: 'Orders', formula: '[C]', uses: ['C'] },
                { title: 'C', datasource: 'Orders', formula: '[D]', uses: ['D'] },
                { title: 'D', datasource: 'Orders', formula: '1' },
            ],
        }));
        const finding = findingFor(findings, 'deep-nesting');
        expect(finding?.severity).toBe('warn');
        expect(finding?.items).toEqual(['A (depth 4)']);
    });

    it('does not flag three-level chains', () => {
        const findings = computeWorkbookHealth(baseInput({
            calculations: [
                { title: 'A', datasource: 'Orders', formula: '[B]', uses: ['B'] },
                { title: 'B', datasource: 'Orders', formula: '[C]', uses: ['C'] },
                { title: 'C', datasource: 'Orders', formula: '1' },
            ],
        }));
        expect(findingFor(findings, 'deep-nesting')).toBeUndefined();
    });

    it('survives reference cycles without hanging or overflowing', () => {
        const findings = computeWorkbookHealth(baseInput({
            calculations: [
                { title: 'A', datasource: 'Orders', formula: '[B]', uses: ['B'] },
                { title: 'B', datasource: 'Orders', formula: '[A]', uses: ['A'] },
            ],
        }));
        expect(findingFor(findings, 'deep-nesting')).toBeUndefined();
    });

    it('flags calculations with three or more LOD expressions', () => {
        const lodFormula = '{FIXED [a]: SUM([x])} + { include [b]: MIN([y])} + {EXCLUDE : AVG([z])}';
        const findings = computeWorkbookHealth(baseInput({
            calculations: [
                { title: 'LOD Heavy', datasource: 'Orders', formula: lodFormula },
                { title: 'Two LODs', datasource: 'Orders', formula: '{FIXED : 1} + {FIXED : 2}' },
            ],
        }));
        const finding = findingFor(findings, 'lod-heavy');
        expect(finding?.severity).toBe('info');
        expect(finding?.items).toEqual(['LOD Heavy']);
    });

    it('flags Only Relevant Values quick filters found in the xml', () => {
        const xml = [
            `<workbook>`,
            `  <filter class='categorical' column='[ds].[Name]'>`,
            `    <groupfilter function='level-members' level='[Name]' ui-domain='relevant' user:ui-enumeration='inclusive' />`,
            `  </filter>`,
            `  <filter class='categorical' column='[ds].[City]'>`,
            `    <groupfilter function="level-members" level="[City]" ui-domain="relevant" />`,
            `  </filter>`,
            `  <groupfilter function='level-members' level='[Age]' ui-domain='database' />`,
            `</workbook>`,
        ].join(LF);
        const findings = computeWorkbookHealth(baseInput({ xml }));
        const finding = findingFor(findings, 'relevant-values-filters');
        expect(finding?.severity).toBe('warn');
        expect(finding?.items).toEqual(['2 filters use Only Relevant Values']);
    });

    it('does not count relevant filters inside comments', () => {
        const xml = `<workbook><!-- <groupfilter ui-domain='relevant' /> --></workbook>`;
        expect(findingFor(computeWorkbookHealth(baseInput({ xml })), 'relevant-values-filters'))
            .toBeUndefined();
    });

    it('flags dashboards without a fixed size', () => {
        const findings = computeWorkbookHealth(baseInput({
            dashboards: [
                { name: 'Fixed', width: 1200, height: 800 },
                { name: 'Auto' },
                { name: 'Half Fixed', width: 1200 },
            ],
        }));
        const finding = findingFor(findings, 'auto-sized-dashboard');
        expect(finding?.severity).toBe('warn');
        expect(finding?.items).toEqual(['Auto', 'Half Fixed']);
    });

    it('lists at most ten unused calculations and summarizes the rest', () => {
        const calculations = Array.from({ length: 12 }, (_, index) => ({
            title: `Unused ${index + 1}`,
            datasource: 'Orders',
            formula: '1',
            unused: true,
        }));
        const finding = findingFor(computeWorkbookHealth(baseInput({ calculations })), 'unused-calcs');
        expect(finding?.severity).toBe('info');
        expect(finding?.items).toHaveLength(11);
        expect(finding?.items[10]).toBe('… and 2 more');
    });

    it('flags worksheets with more than seven filters', () => {
        const filters = [
            ...Array.from({ length: 8 }, () => ({ worksheet: 'Busy Sheet' })),
            ...Array.from({ length: 7 }, () => ({ worksheet: 'Calm Sheet' })),
        ];
        const finding = findingFor(computeWorkbookHealth(baseInput({ filters })), 'many-filters-per-sheet');
        expect(finding?.severity).toBe('info');
        expect(finding?.items).toEqual(['Busy Sheet (8 filters)']);
    });

    it('flags workbooks with more than five datasources', () => {
        expect(findingFor(computeWorkbookHealth(baseInput({ datasourceCount: 5 })), 'many-datasources'))
            .toBeUndefined();
        const finding = findingFor(computeWorkbookHealth(baseInput({ datasourceCount: 6 })), 'many-datasources');
        expect(finding?.severity).toBe('info');
        expect(finding?.items).toEqual(['6 data sources']);
    });
});
