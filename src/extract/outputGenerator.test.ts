import { generateContent } from './outputGenerator';
import { ExtractedCalculation } from './types';

/**
 * Note: Tests for generateNotesFile() that write to filesystem are omitted
 * as they would require mocking workspace.fs and window APIs. The core logic
 * is tested through generateContent() which has the same formatting logic.
 */

describe('outputGenerator', () => {
    describe('generateContent', () => {
        describe('summary generation', () => {
            it('should generate summary with correct statistics', () => {
                const calculations: ExtractedCalculation[] = [
                    {
                        workbook: 'Sales.twb',
                        datasource: 'Main Data',
                        title: 'Profit',
                        formula: 'SUM([Sales]) - SUM([Costs])'
                    },
                    {
                        workbook: 'Sales.twb',
                        datasource: 'Main Data',
                        title: 'Revenue',
                        formula: 'SUM([Sales])'
                    }
                ];

                const content = generateContent(calculations);
                expect(content).toContain('Total workbooks with calculations: 1');
                expect(content).toContain('Total calculations: 2');
            });

            it('should count unique workbooks correctly', () => {
                const calculations: ExtractedCalculation[] = [
                    { workbook: 'Sales.twb', datasource: 'Data', title: 'Calc1', formula: 'A' },
                    { workbook: 'Sales.twb', datasource: 'Data', title: 'Calc2', formula: 'B' },
                    { workbook: 'Marketing.twb', datasource: 'Data', title: 'Calc3', formula: 'C' },
                    { workbook: 'HR.twb', datasource: 'Data', title: 'Calc4', formula: 'D' }
                ];

                const content = generateContent(calculations);
                expect(content).toContain('Total workbooks with calculations: 3');
                expect(content).toContain('Total calculations: 4');
            });

            it('should handle single calculation', () => {
                const calculations: ExtractedCalculation[] = [
                    { workbook: 'Test.twb', datasource: 'Data', title: 'Calc', formula: 'X' }
                ];

                const content = generateContent(calculations);
                expect(content).toContain('Total workbooks with calculations: 1');
                expect(content).toContain('Total calculations: 1');
            });

            it('should handle empty calculation list', () => {
                const content = generateContent([]);
                expect(content).toContain('Total workbooks with calculations: 0');
                expect(content).toContain('Total calculations: 0');
            });
        });

        describe('calculation block formatting', () => {
            it('should format calculation blocks correctly', () => {
                const calculations: ExtractedCalculation[] = [
                    {
                        workbook: 'Sales.twb',
                        datasource: 'Superstore',
                        title: 'Profit Margin',
                        formula: 'IF [Sales] > 0 THEN [Profit] / [Sales] ELSE 0 END'
                    }
                ];

                const content = generateContent(calculations);
                const lines = content.split('\n');

                // Find the calculation block (after the summary)
                const blockStart = lines.findIndex(line => line.startsWith('// Profit Margin'));
                expect(blockStart).toBeGreaterThan(-1);

                // Check comment line format: // caption | datasource_underscored | workbook.twb
                expect(lines[blockStart]).toBe('// Profit Margin | Superstore | Sales.twb');

                // Check formula on next line
                expect(lines[blockStart + 1]).toBe('IF [Sales] > 0 THEN [Profit] / [Sales] ELSE 0 END');
            });

            it('should replace spaces with underscores in datasource names', () => {
                const calculations: ExtractedCalculation[] = [
                    {
                        workbook: 'Test.twb',
                        datasource: 'Sample Superstore',
                        title: 'Calc',
                        formula: 'SUM([Sales])'
                    }
                ];

                const content = generateContent(calculations);
                expect(content).toContain('// Calc | Sample_Superstore | Test.twb');
            });

            it('should handle multiple spaces in datasource names', () => {
                const calculations: ExtractedCalculation[] = [
                    {
                        workbook: 'Test.twb',
                        datasource: 'My   Data   Source',
                        title: 'Calc',
                        formula: 'X'
                    }
                ];

                const content = generateContent(calculations);
                expect(content).toContain('// Calc | My___Data___Source | Test.twb');
            });

            it('should normalize formulas before output', () => {
                const calculations: ExtractedCalculation[] = [
                    {
                        workbook: 'Test.twb',
                        datasource: 'Data',
                        title: 'Calc',
                        formula: '   IF   [A]   \n\n\n  THEN   "yes"   \n  ELSE   "no"   \n  END   '
                    }
                ];

                const content = generateContent(calculations);
                // Formula should be normalized: whitespace stripped per line, blank lines removed
                expect(content).toContain('IF [A]\nTHEN "yes"\nELSE "no"\nEND');
            });

            it('should uppercase keywords in formulas', () => {
                const calculations: ExtractedCalculation[] = [
                    {
                        workbook: 'Test.twb',
                        datasource: 'Data',
                        title: 'Calc',
                        formula: 'if [field] > 0 then sum([sales]) else 0 end'
                    }
                ];

                const content = generateContent(calculations);
                expect(content).toContain('IF [field] > 0 THEN SUM([sales]) ELSE 0 END');
            });
        });

        describe('multiple calculations', () => {
            it('should separate calculations with blank lines', () => {
                const calculations: ExtractedCalculation[] = [
                    { workbook: 'Test.twb', datasource: 'Data', title: 'First', formula: 'A' },
                    { workbook: 'Test.twb', datasource: 'Data', title: 'Second', formula: 'B' },
                    { workbook: 'Test.twb', datasource: 'Data', title: 'Third', formula: 'C' }
                ];

                const content = generateContent(calculations);
                const lines = content.split('\n');

                // Each block should be:
                // // comment
                // formula
                // (blank line between blocks)

                // Find first calculation
                const first = lines.findIndex(line => line.includes('// First'));
                expect(lines[first]).toContain('// First');
                expect(lines[first + 1]).toBe('A');
                expect(lines[first + 2]).toBe(''); // Blank line

                // Find second calculation
                const second = lines.findIndex(line => line.includes('// Second'));
                expect(lines[second]).toContain('// Second');
                expect(lines[second + 1]).toBe('B');
                expect(lines[second + 2]).toBe(''); // Blank line

                // Find third calculation
                const third = lines.findIndex(line => line.includes('// Third'));
                expect(lines[third]).toContain('// Third');
                expect(lines[third + 1]).toBe('C');
            });

            it('should maintain calculation order', () => {
                const calculations: ExtractedCalculation[] = [
                    { workbook: 'Test.twb', datasource: 'Data', title: 'First', formula: 'A' },
                    { workbook: 'Test.twb', datasource: 'Data', title: 'Second', formula: 'B' },
                    { workbook: 'Test.twb', datasource: 'Data', title: 'Third', formula: 'C' }
                ];

                const content = generateContent(calculations);
                const firstIndex = content.indexOf('// First');
                const secondIndex = content.indexOf('// Second');
                const thirdIndex = content.indexOf('// Third');

                expect(firstIndex).toBeLessThan(secondIndex);
                expect(secondIndex).toBeLessThan(thirdIndex);
            });
        });

        describe('complex formulas', () => {
            it('should handle multi-line formulas', () => {
                const calculations: ExtractedCalculation[] = [
                    {
                        workbook: 'Test.twb',
                        datasource: 'Data',
                        title: 'Multi-line',
                        formula: 'CASE\nWHEN [Value] > 100 THEN "High"\nWHEN [Value] > 50 THEN "Medium"\nELSE "Low"\nEND'
                    }
                ];

                const content = generateContent(calculations);
                expect(content).toContain('CASE\nWHEN [Value] > 100 THEN "High"\nWHEN [Value] > 50 THEN "Medium"\nELSE "Low"\nEND');
            });

            it('should handle formulas with special characters', () => {
                const calculations: ExtractedCalculation[] = [
                    {
                        workbook: 'Test.twb',
                        datasource: 'Data',
                        title: 'Special Chars',
                        formula: '[Field] + [Other Field] * 100 / ([Sales] - [Costs])'
                    }
                ];

                const content = generateContent(calculations);
                expect(content).toContain('[Field] + [Other Field] * 100 / ([Sales] - [Costs])');
            });

            it('should handle formulas with quoted strings', () => {
                const calculations: ExtractedCalculation[] = [
                    {
                        workbook: 'Test.twb',
                        datasource: 'Data',
                        title: 'Quoted',
                        formula: 'IF [Status] = "Active" THEN "Yes" ELSE "No" END'
                    }
                ];

                const content = generateContent(calculations);
                expect(content).toContain('IF [Status] = "Active" THEN "Yes" ELSE "No" END');
            });
        });

        describe('edge cases', () => {
            it('should handle calculation with empty formula', () => {
                const calculations: ExtractedCalculation[] = [
                    {
                        workbook: 'Test.twb',
                        datasource: 'Data',
                        title: 'Empty',
                        formula: ''
                    }
                ];

                const content = generateContent(calculations);
                expect(content).toContain('// Empty | Data | Test.twb');
                // Formula line will be empty but present
            });

            it('should handle calculation with whitespace-only formula', () => {
                const calculations: ExtractedCalculation[] = [
                    {
                        workbook: 'Test.twb',
                        datasource: 'Data',
                        title: 'Whitespace',
                        formula: '   \n\t  '
                    }
                ];

                const content = generateContent(calculations);
                // After normalization, whitespace-only becomes empty
                const lines = content.split('\n');
                const index = lines.findIndex(line => line.includes('// Whitespace'));
                expect(lines[index + 1]).toBe('');
            });

            it('should handle special characters in titles', () => {
                const calculations: ExtractedCalculation[] = [
                    {
                        workbook: 'Test.twb',
                        datasource: 'Data',
                        title: 'Sales & Profit (2024)',
                        formula: 'X'
                    }
                ];

                const content = generateContent(calculations);
                expect(content).toContain('// Sales & Profit (2024) | Data | Test.twb');
            });

            it('should handle special characters in workbook names', () => {
                const calculations: ExtractedCalculation[] = [
                    {
                        workbook: 'Sales (Q1 2024).twb',
                        datasource: 'Data',
                        title: 'Calc',
                        formula: 'X'
                    }
                ];

                const content = generateContent(calculations);
                expect(content).toContain('Sales (Q1 2024).twb');
            });

            it('should handle datasource names with no spaces', () => {
                const calculations: ExtractedCalculation[] = [
                    {
                        workbook: 'Test.twb',
                        datasource: 'SingleWordDatasource',
                        title: 'Calc',
                        formula: 'X'
                    }
                ];

                const content = generateContent(calculations);
                expect(content).toContain('// Calc | SingleWordDatasource | Test.twb');
            });
        });

        describe('real-world scenarios', () => {
            it('should handle typical extraction output', () => {
                const calculations: ExtractedCalculation[] = [
                    {
                        workbook: 'Sales Dashboard.twb',
                        datasource: 'Sample Superstore',
                        title: 'Profit Margin',
                        formula: 'IF SUM([Sales]) > 0 THEN SUM([Profit]) / SUM([Sales]) ELSE 0 END'
                    },
                    {
                        workbook: 'Sales Dashboard.twb',
                        datasource: 'Sample Superstore',
                        title: 'Profit Category',
                        formula: 'CASE\nWHEN [Profit Margin] > 0.3 THEN "High"\nWHEN [Profit Margin] > 0.1 THEN "Medium"\nELSE "Low"\nEND'
                    },
                    {
                        workbook: 'HR Analytics.twb',
                        datasource: 'Employee Data',
                        title: 'Years Employed',
                        formula: 'DATEDIFF("year", [Hire Date], TODAY())'
                    }
                ];

                const content = generateContent(calculations);

                // Check summary
                expect(content).toContain('Total workbooks with calculations: 2');
                expect(content).toContain('Total calculations: 3');

                // Check first calculation
                expect(content).toContain('// Profit Margin | Sample_Superstore | Sales Dashboard.twb');
                expect(content).toContain('IF SUM([Sales]) > 0 THEN SUM([Profit]) / SUM([Sales]) ELSE 0 END');

                // Check second calculation
                expect(content).toContain('// Profit Category | Sample_Superstore | Sales Dashboard.twb');

                // Check third calculation
                expect(content).toContain('// Years Employed | Employee_Data | HR Analytics.twb');
                expect(content).toContain('DATEDIFF("year", [Hire Date], TODAY())');
            });

            it('should match Python script output format exactly', () => {
                const calculations: ExtractedCalculation[] = [
                    {
                        workbook: 'Test.twb',
                        datasource: 'Main Data',
                        title: 'Test Calc',
                        formula: 'SUM([Sales])'
                    }
                ];

                const content = generateContent(calculations);
                const lines = content.split('\n');

                // Python format:
                // Total workbooks with calculations: X
                // Total calculations: Y
                // (blank line)
                // // Caption | Datasource_Name | workbook.twb
                // FORMULA
                // (blank line before next or EOF)

                expect(lines[0]).toBe('Total workbooks with calculations: 1');
                expect(lines[1]).toBe('Total calculations: 1');
                expect(lines[2]).toBe('');
                expect(lines[3]).toBe('// Test Calc | Main_Data | Test.twb');
                expect(lines[4]).toBe('SUM([Sales])');
            });
        });
    });
});
