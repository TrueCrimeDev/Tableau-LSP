import { extractCalcsFromXml } from './xml.js';

describe('extractCalcsFromXml', () => {
    it('extracts calculations from datasource columns', () => {
        const xml = `
            <workbook name="Sales Insights">
                <datasources>
                    <datasource name="[Extract]" caption="Sales Extract">
                        <column name="[Sales Growth]" caption="Sales Growth">
                            <calculation class="tableau" formula="(SUM([Sales]) - SUM([Sales LY])) / SUM([Sales LY])" />
                        </column>
                        <column name="[Profit Flag]">
                            <calculation formula="IF [Profit] > 0 THEN 'Positive' ELSE 'Negative' END" />
                        </column>
                    </datasource>
                </datasources>
            </workbook>
        `;

        const results = extractCalcsFromXml(xml, 'fallback.twb');

        expect(results).toHaveLength(2);
        expect(results[0]).toMatchObject({
            workbook: 'Sales Insights',
            datasource: 'Sales Extract',
            title: 'Sales Growth',
            formula: '(SUM([Sales]) - SUM([Sales LY])) / SUM([Sales LY])'
        });
        expect(results[0]?.raw).toContain('(SUM([Sales]) - SUM([Sales LY]))');
        expect(results[1]).toMatchObject({
            workbook: 'Sales Insights',
            datasource: 'Sales Extract',
            title: 'Profit Flag',
            formula: "IF [Profit] > 0 THEN 'Positive' ELSE 'Negative' END"
        });
    });

    it('uses fallback workbook name when metadata missing', () => {
        const xml = `
            <workbook>
                <datasources>
                    <datasource name="[DS]">
                        <column name="[Calc]">
                            <calculation>
                                <formula>SUM([Metric])</formula>
                            </calculation>
                        </column>
                    </datasource>
                </datasources>
            </workbook>
        `;

        const results = extractCalcsFromXml(xml, 'Workbook.twb');

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            workbook: 'Workbook.twb',
            datasource: 'DS',
            title: 'Calc',
            formula: 'SUM([Metric])'
        });
    });

    it('returns empty array for blank XML input', () => {
        expect(extractCalcsFromXml('', 'Empty.twb')).toEqual([]);
    });

    it('throws helpful error for invalid XML', () => {
        expect(() => extractCalcsFromXml('<', 'Invalid.twb')).toThrow('Failed to parse Tableau workbook XML');
    });
});
