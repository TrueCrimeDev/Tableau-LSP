import { buildNameMappings, applyNameResolution, resolveNames, resolveNamesWithStats } from './nameResolver.js';

describe('nameResolver', () => {
    describe('buildNameMappings', () => {
        describe('datasource mappings', () => {
            it('should map datasource names to captions', () => {
                const xml = `
                    <workbook>
                        <datasources>
                            <datasource name="Sample - Superstore" caption="Superstore Data" />
                        </datasources>
                    </workbook>
                `;

                const mappings = buildNameMappings(xml);
                expect(mappings.datasources.get('Sample - Superstore')).toBe('Superstore Data');
            });

            it('should handle multiple datasources', () => {
                const xml = `
                    <workbook>
                        <datasources>
                            <datasource name="ds1" caption="First Datasource" />
                            <datasource name="ds2" caption="Second Datasource" />
                            <datasource name="ds3" caption="Third Datasource" />
                        </datasources>
                    </workbook>
                `;

                const mappings = buildNameMappings(xml);
                expect(mappings.datasources.size).toBe(3);
                expect(mappings.datasources.get('ds1')).toBe('First Datasource');
                expect(mappings.datasources.get('ds2')).toBe('Second Datasource');
                expect(mappings.datasources.get('ds3')).toBe('Third Datasource');
            });

            it('should escape HTML entities in datasource captions', () => {
                const xml = `
                    <workbook>
                        <datasources>
                            <datasource name="ds1" caption="Sales & Marketing" />
                            <datasource name="ds2" caption="Value < 100" />
                            <datasource name="ds3" caption="Test \"quoted\"" />
                        </datasources>
                    </workbook>
                `;

                const mappings = buildNameMappings(xml);
                expect(mappings.datasources.get('ds1')).toBe('Sales &amp; Marketing');
                expect(mappings.datasources.get('ds2')).toBe('Value &lt; 100');
                expect(mappings.datasources.get('ds3')).toBe('Test &quot;quoted&quot;');
            });

            it('should ignore datasources without caption', () => {
                const xml = `
                    <workbook>
                        <datasources>
                            <datasource name="ds1" />
                            <datasource name="ds2" caption="Has Caption" />
                        </datasources>
                    </workbook>
                `;

                const mappings = buildNameMappings(xml);
                expect(mappings.datasources.size).toBe(1);
                expect(mappings.datasources.has('ds1')).toBe(false);
                expect(mappings.datasources.get('ds2')).toBe('Has Caption');
            });
        });

        describe('calculation mappings', () => {
            it('should map calculation names to captions', () => {
                const xml = `
                    <workbook>
                        <datasources>
                            <datasource>
                                <column name="[Calculation_123]" caption="Profit Margin" />
                            </datasource>
                        </datasources>
                    </workbook>
                `;

                const mappings = buildNameMappings(xml);
                expect(mappings.calculations.get('[Calculation_123]')).toBe('[Profit Margin]');
            });

            it('should handle multiple calculations', () => {
                const xml = `
                    <workbook>
                        <datasources>
                            <datasource>
                                <column name="[Calc_1]" caption="First" />
                                <column name="[Calc_2]" caption="Second" />
                            </datasource>
                        </datasources>
                    </workbook>
                `;

                const mappings = buildNameMappings(xml);
                expect(mappings.calculations.size).toBe(2);
                expect(mappings.calculations.get('[Calc_1]')).toBe('[First]');
                expect(mappings.calculations.get('[Calc_2]')).toBe('[Second]');
            });

            it('should escape HTML entities in calculation captions', () => {
                const xml = `
                    <workbook>
                        <datasources>
                            <datasource>
                                <column name="[Calc_1]" caption="Sales & Profit" />
                            </datasource>
                        </datasources>
                    </workbook>
                `;

                const mappings = buildNameMappings(xml);
                expect(mappings.calculations.get('[Calc_1]')).toBe('[Sales &amp; Profit]');
            });

            it('should only map columns with bracket notation names', () => {
                const xml = `
                    <workbook>
                        <datasources>
                            <datasource>
                                <column name="[BracketName]" caption="Bracketed" />
                                <column name="NoBrackets" caption="Not Bracketed" />
                            </datasource>
                        </datasources>
                    </workbook>
                `;

                const mappings = buildNameMappings(xml);
                expect(mappings.calculations.get('[BracketName]')).toBe('[Bracketed]');
                expect(mappings.calculations.has('NoBrackets')).toBe(false);
            });
        });

        describe('reference mappings', () => {
            it('should create Calculation_ID patterns', () => {
                const xml = `
                    <workbook>
                        <datasources>
                            <datasource>
                                <column name="Calculation_123" caption="Test Calc" />
                            </datasource>
                        </datasources>
                    </workbook>
                `;

                const mappings = buildNameMappings(xml);
                expect(mappings.references.get('Calculation_123')).toBe('Test Calc');
                expect(mappings.references.get('[Calculation_123]')).toBe('[Test Calc]');
                expect(mappings.references.get('[none:Calculation_123:nk]')).toBe('[none:Test Calc:nk]');
            });

            it('should handle negative calculation IDs', () => {
                const xml = `
                    <workbook>
                        <datasources>
                            <datasource>
                                <column name="Calculation_-456" caption="Negative ID" />
                            </datasource>
                        </datasources>
                    </workbook>
                `;

                const mappings = buildNameMappings(xml);
                expect(mappings.references.get('Calculation_-456')).toBe('Negative ID');
            });

            it('should extract ID from complex names', () => {
                const xml = `
                    <workbook>
                        <datasources>
                            <datasource>
                                <column name="Complex_Name_With_Multiple_Parts_789" caption="Complex" />
                            </datasource>
                        </datasources>
                    </workbook>
                `;

                const mappings = buildNameMappings(xml);
                expect(mappings.references.get('Calculation_789')).toBe('Complex');
            });

            it('should not create references for non-numeric IDs', () => {
                const xml = `
                    <workbook>
                        <datasources>
                            <datasource>
                                <column name="Calculation_ABC" caption="Not Numeric" />
                            </datasource>
                        </datasources>
                    </workbook>
                `;

                const mappings = buildNameMappings(xml);
                expect(mappings.references.size).toBe(0);
            });
        });

        describe('nested structures', () => {
            it('should find columns at any depth', () => {
                const xml = `
                    <workbook>
                        <datasources>
                            <datasource>
                                <connection>
                                    <metadata>
                                        <column name="[Deep]" caption="Deep Column" />
                                    </metadata>
                                </connection>
                            </datasource>
                        </datasources>
                        <worksheets>
                            <worksheet>
                                <column name="[Worksheet_Col]" caption="Worksheet Column" />
                            </worksheet>
                        </worksheets>
                    </workbook>
                `;

                const mappings = buildNameMappings(xml);
                expect(mappings.calculations.get('[Deep]')).toBe('[Deep Column]');
                expect(mappings.calculations.get('[Worksheet_Col]')).toBe('[Worksheet Column]');
            });

            it('should handle arrays of columns', () => {
                const xml = `
                    <workbook>
                        <datasources>
                            <datasource>
                                <column name="[Col1]" caption="First" />
                                <column name="[Col2]" caption="Second" />
                                <column name="[Col3]" caption="Third" />
                            </datasource>
                        </datasources>
                    </workbook>
                `;

                const mappings = buildNameMappings(xml);
                expect(mappings.calculations.size).toBe(3);
            });
        });

        describe('edge cases', () => {
            it('should handle empty XML', () => {
                const mappings = buildNameMappings('');
                expect(mappings.datasources.size).toBe(0);
                expect(mappings.calculations.size).toBe(0);
                expect(mappings.references.size).toBe(0);
            });

            it('should handle malformed XML gracefully', () => {
                const xml = '<invalid><xml>';
                const mappings = buildNameMappings(xml);
                // Should return empty mappings without throwing
                expect(mappings).toBeDefined();
            });

            it('should handle XML without workbook node', () => {
                const xml = '<root><data /></root>';
                const mappings = buildNameMappings(xml);
                expect(mappings.datasources.size).toBe(0);
            });

            it('should handle missing datasources node', () => {
                const xml = '<workbook></workbook>';
                const mappings = buildNameMappings(xml);
                expect(mappings.datasources.size).toBe(0);
            });
        });
    });

    describe('applyNameResolution', () => {
        describe('datasource resolution', () => {
            it('should replace datasource attribute references', () => {
                const xml = `<column datasource='federated.123abc' />`;
                const mappings = {
                    datasources: new Map([['federated.123abc', 'My Data Source']]),
                    calculations: new Map(),
                    references: new Map()
                };

                const result = applyNameResolution(xml, mappings);
                expect(result).toBe(`<column datasource='My Data Source' />`);
            });

            it('should replace field reference patterns', () => {
                const xml = `SUM([federated.123abc].[Sales])`;
                const mappings = {
                    datasources: new Map([['federated.123abc', 'Superstore']]),
                    calculations: new Map(),
                    references: new Map()
                };

                const result = applyNameResolution(xml, mappings);
                expect(result).toBe(`SUM([Superstore].[Sales])`);
            });

            it('should replace quoted datasource references', () => {
                const xml = `FROM 'federated.123abc'`;
                const mappings = {
                    datasources: new Map([['federated.123abc', 'Main Data']]),
                    calculations: new Map(),
                    references: new Map()
                };

                const result = applyNameResolution(xml, mappings);
                expect(result).toBe(`FROM 'Main Data'`);
            });

            it('should replace all occurrences of a datasource', () => {
                const xml = `datasource='ds1' [ds1].[Field] 'ds1'`;
                const mappings = {
                    datasources: new Map([['ds1', 'Data']]),
                    calculations: new Map(),
                    references: new Map()
                };

                const result = applyNameResolution(xml, mappings);
                expect(result).toBe(`datasource='Data' [Data].[Field] 'Data'`);
            });
        });

        describe('calculation resolution', () => {
            it('should replace calculation name references', () => {
                const xml = `IF [Calculation_123] > 0 THEN "positive" END`;
                const mappings = {
                    datasources: new Map(),
                    calculations: new Map([['[Calculation_123]', '[Profit Margin]']]),
                    references: new Map()
                };

                const result = applyNameResolution(xml, mappings);
                expect(result).toBe(`IF [Profit Margin] > 0 THEN "positive" END`);
            });

            it('should handle multiple calculation replacements', () => {
                const xml = `[Calc1] + [Calc2]`;
                const mappings = {
                    datasources: new Map(),
                    calculations: new Map([
                        ['[Calc1]', '[First]'],
                        ['[Calc2]', '[Second]']
                    ]),
                    references: new Map()
                };

                const result = applyNameResolution(xml, mappings);
                expect(result).toBe(`[First] + [Second]`);
            });
        });

        describe('reference pattern resolution', () => {
            it('should replace Calculation_ID patterns', () => {
                const xml = `SUM(Calculation_456)`;
                const mappings = {
                    datasources: new Map(),
                    calculations: new Map(),
                    references: new Map([['Calculation_456', 'Total Sales']])
                };

                const result = applyNameResolution(xml, mappings);
                expect(result).toBe(`SUM(Total Sales)`);
            });

            it('should replace bracketed Calculation_ID patterns', () => {
                const xml = `[Calculation_789]`;
                const mappings = {
                    datasources: new Map(),
                    calculations: new Map(),
                    references: new Map([['[Calculation_789]', '[Revenue]']])
                };

                const result = applyNameResolution(xml, mappings);
                expect(result).toBe(`[Revenue]`);
            });

            it('should replace complex reference patterns', () => {
                const xml = `[none:Calculation_123:nk]`;
                const mappings = {
                    datasources: new Map(),
                    calculations: new Map(),
                    references: new Map([['[none:Calculation_123:nk]', '[none:Profit:nk]']])
                };

                const result = applyNameResolution(xml, mappings);
                expect(result).toBe(`[none:Profit:nk]`);
            });
        });

        describe('sqlproxy removal', () => {
            it('should remove sqlproxy patterns', () => {
                const xml = `[sqlproxy.1abc2def].[Field]`;
                const mappings = {
                    datasources: new Map(),
                    calculations: new Map(),
                    references: new Map()
                };

                const result = applyNameResolution(xml, mappings);
                expect(result).toBe(`[Field]`);
            });

            it('should remove multiple sqlproxy patterns', () => {
                const xml = `[sqlproxy.abc].[Field1] + [sqlproxy.def].[Field2]`;
                const mappings = {
                    datasources: new Map(),
                    calculations: new Map(),
                    references: new Map()
                };

                const result = applyNameResolution(xml, mappings);
                expect(result).toBe(`[Field1] + [Field2]`);
            });

            it('should handle complex sqlproxy identifiers', () => {
                const xml = `[sqlproxy.1a2b3c4d5e6f].[Sales]`;
                const mappings = {
                    datasources: new Map(),
                    calculations: new Map(),
                    references: new Map()
                };

                const result = applyNameResolution(xml, mappings);
                expect(result).toBe(`[Sales]`);
            });
        });

        describe('combined operations', () => {
            it('should apply all resolution types together', () => {
                const xml = `
                    datasource='ds1'
                    [ds1].[sqlproxy.abc].[Calc1]
                    IF Calculation_123 > 0 THEN [Calc2] END
                `;
                const mappings = {
                    datasources: new Map([['ds1', 'Main Data']]),
                    calculations: new Map([
                        ['[Calc1]', '[First Calc]'],
                        ['[Calc2]', '[Second Calc]']
                    ]),
                    references: new Map([['Calculation_123', 'Revenue']])
                };

                const result = applyNameResolution(xml, mappings);
                expect(result).toContain(`datasource='Main Data'`);
                expect(result).toContain(`[Main Data].[First Calc]`);
                expect(result).toContain(`IF Revenue > 0 THEN [Second Calc] END`);
                expect(result).not.toContain('sqlproxy');
            });

            it('should handle real-world Tableau formulas', () => {
                const xml = `IF [Calculation_456] > AVG([federated.abc].[Sales]) THEN "High" ELSE "Low" END`;
                const mappings = {
                    datasources: new Map([['federated.abc', 'Superstore']]),
                    calculations: new Map(),
                    references: new Map([['[Calculation_456]', '[Profit Margin]']])
                };

                const result = applyNameResolution(xml, mappings);
                expect(result).toBe(`IF [Profit Margin] > AVG([Superstore].[Sales]) THEN "High" ELSE "Low" END`);
            });
        });

        describe('special character handling', () => {
            it('should handle regex special characters in names', () => {
                const xml = `[Calc$1] + [Calc.2]`;
                const mappings = {
                    datasources: new Map(),
                    calculations: new Map([
                        ['[Calc$1]', '[First]'],
                        ['[Calc.2]', '[Second]']
                    ]),
                    references: new Map()
                };

                const result = applyNameResolution(xml, mappings);
                expect(result).toBe(`[First] + [Second]`);
            });

            it('should handle parentheses in names', () => {
                const xml = `[Calc(1)] + [Calc(2)]`;
                const mappings = {
                    datasources: new Map(),
                    calculations: new Map([
                        ['[Calc(1)]', '[First]'],
                        ['[Calc(2)]', '[Second]']
                    ]),
                    references: new Map()
                };

                const result = applyNameResolution(xml, mappings);
                expect(result).toBe(`[First] + [Second]`);
            });
        });

        describe('edge cases', () => {
            it('should handle empty mappings', () => {
                const xml = `<formula>Original content</formula>`;
                const mappings = {
                    datasources: new Map(),
                    calculations: new Map(),
                    references: new Map()
                };

                const result = applyNameResolution(xml, mappings);
                expect(result).toBe(xml);
            });

            it('should handle empty XML string', () => {
                const mappings = {
                    datasources: new Map([['ds1', 'Data']]),
                    calculations: new Map(),
                    references: new Map()
                };

                const result = applyNameResolution('', mappings);
                expect(result).toBe('');
            });

            it('should not affect names that are not in mappings', () => {
                const xml = `[Unknown1] + [Unknown2]`;
                const mappings = {
                    datasources: new Map(),
                    calculations: new Map([['[Known]', '[Mapped]']]),
                    references: new Map()
                };

                const result = applyNameResolution(xml, mappings);
                expect(result).toBe(xml);
            });
        });
    });

    describe('resolveNames', () => {
        it('should perform complete name resolution pipeline', () => {
            const xml = `
                <workbook>
                    <datasources>
                        <datasource name="ds1" caption="Main Data">
                            <column name="[Calc_123]" caption="Profit" />
                        </datasource>
                    </datasources>
                    <formula>IF [Calc_123] > 0 THEN datasource='ds1' END</formula>
                </workbook>
            `;

            const result = resolveNames(xml);
            expect(result).toContain('[Profit]');
            expect(result).toContain(`datasource='Main Data'`);
        });

        it('should build mappings and apply them in one step', () => {
            const xml = `
                <workbook>
                    <datasources>
                        <datasource name="federated.abc" caption="Superstore" />
                    </datasources>
                    <column datasource='federated.abc' />
                </workbook>
            `;

            const result = resolveNames(xml);
            expect(result).toContain(`datasource='Superstore'`);
            expect(result).not.toContain('federated.abc');
        });
    });

    describe('resolveNamesWithStats', () => {
        it('should return resolved XML and statistics', () => {
            const xml = `
                <workbook>
                    <datasources>
                        <datasource name="ds1" caption="Data 1" />
                        <datasource name="ds2" caption="Data 2">
                            <column name="[Calc1]" caption="First" />
                            <column name="[Calc2]" caption="Second" />
                            <column name="Calculation_123" caption="Ref" />
                        </datasource>
                    </datasources>
                </workbook>
            `;

            const { resolved, stats } = resolveNamesWithStats(xml);

            expect(resolved).toBeDefined();
            expect(stats.datasourceMappings).toBe(2);
            expect(stats.calculationMappings).toBe(2);
            expect(stats.referenceMappings).toBe(3); // 3 patterns for Calculation_123
        });

        it('should provide statistics for empty mappings', () => {
            const xml = '<workbook></workbook>';
            const { resolved, stats } = resolveNamesWithStats(xml);

            expect(resolved).toBeDefined();
            expect(stats.datasourceMappings).toBe(0);
            expect(stats.calculationMappings).toBe(0);
            expect(stats.referenceMappings).toBe(0);
        });

        it('should include all mapping types in statistics', () => {
            const xml = `
                <workbook>
                    <datasources>
                        <datasource name="ds1" caption="Data Source">
                            <column name="[NamedCalc]" caption="Named" />
                            <column name="Ref_456" caption="Referenced" />
                        </datasource>
                    </datasources>
                </workbook>
            `;

            const { stats } = resolveNamesWithStats(xml);

            expect(stats.datasourceMappings).toBeGreaterThan(0);
            expect(stats.calculationMappings).toBeGreaterThan(0);
            expect(stats.referenceMappings).toBeGreaterThan(0);
        });
    });
});
