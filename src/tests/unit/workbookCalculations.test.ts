import { XMLValidator } from 'fast-xml-parser';
import {
    WorkbookCalculationError,
    addOrUpdateWorkbookCalculation,
    listWorkbookDatasources,
    validateCalculationFormula,
} from '../../parsers/workbookCalculations.js';

const LF = '\n';
const XML = [
    `<workbook version='18.1'>`,
    `  <datasources>`,
    `    <datasource caption='Orders' inline='true' name='orders' version='18.1'>`,
    `      <connection class='textscan'>`,
    `        <relation name='Orders'><columns><column datatype='real' name='Sales' /></columns></relation>`,
    `      </connection>`,
    `      <aliases enabled='yes' />`,
    `      <column datatype='real' name='[Sales]' role='measure' type='quantitative' />`,
    `      <extract enabled='true' />`,
    `    </datasource>`,
    `    <datasource caption='Targets' inline='true' name='targets' version='18.1'>`,
    `      <aliases enabled='yes' />`,
    `      <column datatype='real' name='[Target]' role='measure' type='quantitative' />`,
    `    </datasource>`,
    `  </datasources>`,
    `  <worksheets />`,
    `</workbook>`,
].join(LF);

describe('workbook calculated-field mutation', () => {
    it('lists only top-level workbook datasources', () => {
        expect(listWorkbookDatasources(XML)).toEqual([
            { caption: 'Orders', name: 'orders', calculations: [] },
            { caption: 'Targets', name: 'targets', calculations: [] },
        ]);
    });

    it('adds a native Tableau calculation before existing datasource columns', () => {
        const result = addOrUpdateWorkbookCalculation(XML, {
            datasource: 'Orders',
            caption: 'High Sales',
            formula: 'IF [Sales] > 100 THEN "High" ELSE "Low" END',
            datatype: 'string',
        });

        expect(result.action).toBe('added');
        expect(result.internalName).toMatch(/^\[Calculation_\d{16}\]$/);
        expect(result.updatedXml.indexOf(`caption='High Sales'`))
            .toBeLessThan(result.updatedXml.indexOf(`name='[Sales]'`));
        expect(result.updatedXml).toContain(`datatype='string'`);
        expect(result.updatedXml).toContain(`role='dimension' type='nominal'`);
        expect(result.updatedXml).toContain(
            `formula='IF [Sales] &gt; 100 THEN &quot;High&quot; ELSE &quot;Low&quot; END'`
        );
        expect(XMLValidator.validate(result.updatedXml)).toBe(true);
        expect(listWorkbookDatasources(result.updatedXml)[0].calculations).toEqual(['High Sales']);
    });

    it('generates a stable internal name and preserves CRLF line endings', () => {
        const input = {
            datasource: 'orders',
            caption: 'Profit Ratio',
            formula: 'SUM([Profit]) / SUM([Sales])',
            datatype: 'real' as const,
        };
        const first = addOrUpdateWorkbookCalculation(XML.replace(/\n/g, '\r\n'), input);
        const second = addOrUpdateWorkbookCalculation(XML.replace(/\n/g, '\r\n'), input);

        expect(first.internalName).toBe(second.internalName);
        expect(first.updatedXml.replace(/\r\n/g, '')).not.toContain('\n');
        expect(first.updatedXml).toContain(`role='measure' type='quantitative'`);
    });

    it('targets the requested datasource without touching another datasource', () => {
        const result = addOrUpdateWorkbookCalculation(XML, {
            datasource: 'Targets',
            caption: 'Target Met',
            formula: '[Target] >= 1',
            datatype: 'boolean',
        });
        const datasources = listWorkbookDatasources(result.updatedXml);

        expect(datasources[0].calculations).toEqual([]);
        expect(datasources[1].calculations).toEqual(['Target Met']);
    });

    it('rejects duplicates unless replacement is explicit', () => {
        const added = addOrUpdateWorkbookCalculation(XML, {
            datasource: 'Orders',
            caption: 'High Sales',
            formula: '[Sales] > 100',
            datatype: 'boolean',
        });
        expect(() => addOrUpdateWorkbookCalculation(added.updatedXml, {
            datasource: 'Orders',
            caption: 'High Sales',
            formula: '[Sales] > 200',
            datatype: 'boolean',
        })).toThrow(WorkbookCalculationError);

        const replaced = addOrUpdateWorkbookCalculation(added.updatedXml, {
            datasource: 'Orders',
            caption: 'High Sales',
            formula: '[Sales] > 200',
            datatype: 'boolean',
            replaceExisting: true,
        });
        expect(replaced.action).toBe('updated');
        expect(replaced.internalName).toBe(added.internalName);
        expect(replaced.updatedXml).toContain(`formula='[Sales] &gt; 200'`);
        expect(listWorkbookDatasources(replaced.updatedXml)[0].calculations).toEqual(['High Sales']);
    });

    it('refuses to replace a physical field with the same caption', () => {
        expect(() => addOrUpdateWorkbookCalculation(XML, {
            datasource: 'Orders',
            caption: 'Sales',
            formula: '[Sales] * 2',
            datatype: 'real',
            replaceExisting: true,
        })).toThrow(/non-calculated field/i);
    });

    it('rejects malformed formulas before changing XML', () => {
        expect(validateCalculationFormula('IF [Sales] > 100 THEN "High"')).toContain('IF or CASE is missing END.');
        expect(validateCalculationFormula('SUM([Sales]')).toContain('Unbalanced parentheses.');
        expect(validateCalculationFormula('"unterminated')).toEqual(expect.arrayContaining([
            expect.stringContaining('Unexpected or unterminated token'),
        ]));
        expect(() => addOrUpdateWorkbookCalculation(XML, {
            datasource: 'Orders',
            caption: 'Broken',
            formula: 'SUM([Sales]',
            datatype: 'real',
        })).toThrow(/Unbalanced parentheses/);
    });

    it('rejects malformed or non-workbook XML', () => {
        expect(() => listWorkbookDatasources('<workbook><datasources>'))
            .toThrow(/not well formed/i);
        expect(() => listWorkbookDatasources('<root />'))
            .toThrow(/not a Tableau workbook/i);
    });
});
