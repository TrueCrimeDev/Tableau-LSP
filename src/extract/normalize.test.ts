import { normalize, filterAndDedupe } from './normalize';
import { ExtractedCalculation } from './types';

describe('Normalization Functions', () => {
    describe('normalize', () => {
        it('should uppercase keywords', () => {
            const input: ExtractedCalculation[] = [{
                workbook: 'test',
                datasource: 'test',
                title: 'Test Calc',
                formula: 'if [Field] = "value" then "yes" else "no" end'
            }];

            const result = normalize(input);
            expect(result[0].formula).toBe('IF [Field] = "value" THEN "yes" ELSE "no" END');
        });

        it('should condense whitespace', () => {
            const input: ExtractedCalculation[] = [{
                workbook: 'test',
                datasource: 'test',
                title: 'Test Calc',
                formula: 'IF    [Field]   =   "value"\n\n\nTHEN\t\t"yes"\nELSE "no" END'
            }];

            const result = normalize(input);
            expect(result[0].formula).toBe('IF [Field] = "value"\n\nTHEN "yes"\nELSE "no" END');
        });

        it('should handle empty formulas', () => {
            const input: ExtractedCalculation[] = [{
                workbook: 'test',
                datasource: 'test',
                title: 'Empty Calc',
                formula: '   \n\t  '
            }];

            const result = normalize(input);
            expect(result[0].formula).toBe('');
        });

        it('should preserve non-keyword words', () => {
            const input: ExtractedCalculation[] = [{
                workbook: 'test',
                datasource: 'test',
                title: 'Test Calc',
                formula: 'if [CustomField] = "customValue" then SUM([Sales]) else 0 end'
            }];

            const result = normalize(input);
            expect(result[0].formula).toBe('IF [CustomField] = "customValue" THEN SUM([Sales]) ELSE 0 END');
        });

        it('should handle multiple calculations', () => {
            const input: ExtractedCalculation[] = [
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Calc 1',
                    formula: 'if [A] then "yes" else "no" end'
                },
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Calc 2',
                    formula: 'case when [B] = 1 then "one" else "other" end'
                }
            ];

            const result = normalize(input);
            expect(result).toHaveLength(2);
            expect(result[0].formula).toBe('IF [A] THEN "yes" ELSE "no" END');
            expect(result[1].formula).toBe('CASE WHEN [B] = 1 THEN "one" ELSE "other" END');
        });
    });

    describe('filterAndDedupe', () => {
        it('should remove trivial calculations', () => {
            const input: ExtractedCalculation[] = [
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'String Literal',
                    formula: '"Hello World"'
                },
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Number Literal',
                    formula: '42'
                },
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Field Reference',
                    formula: '[Sales]'
                },
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Complex Calc',
                    formula: 'SUM([Sales]) / COUNT([Orders])'
                }
            ];

            const result = filterAndDedupe(input);
            expect(result).toHaveLength(1);
            expect(result[0].title).toBe('Complex Calc');
        });

        it('should deduplicate identical formulas', () => {
            const input: ExtractedCalculation[] = [
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Calc 1',
                    formula: 'SUM([Sales])'
                },
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Calc 2',
                    formula: 'sum([sales])'  // Different case
                },
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Calc 3',
                    formula: 'AVG([Profit])'
                }
            ];

            const result = filterAndDedupe(input);
            expect(result).toHaveLength(2);
            expect(result.map(c => c.title)).toContain('Calc 1');
            expect(result.map(c => c.title)).toContain('Calc 3');
        });

        it('should handle empty input', () => {
            const result = filterAndDedupe([]);
            expect(result).toEqual([]);
        });

        it('should preserve first occurrence in duplicates', () => {
            const input: ExtractedCalculation[] = [
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'First',
                    formula: 'SUM([Sales])'
                },
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Second',
                    formula: 'SUM([Sales])'
                }
            ];

            const result = filterAndDedupe(input);
            expect(result).toHaveLength(1);
            expect(result[0].title).toBe('First');
        });

        it('should handle whitespace differences in deduplication', () => {
            const input: ExtractedCalculation[] = [
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Calc 1',
                    formula: 'SUM([Sales])'
                },
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Calc 2',
                    formula: '  SUM([Sales])  '  // Extra whitespace
                }
            ];

            const result = filterAndDedupe(input);
            expect(result).toHaveLength(1);
            expect(result[0].title).toBe('Calc 1');
        });
    });

    describe('isTrivial helper function behavior', () => {
        const testCases = [
            { formula: '', expected: true, description: 'empty string' },
            { formula: '   ', expected: true, description: 'whitespace only' },
            { formula: '"Hello"', expected: true, description: 'quoted string' },
            { formula: '"Multi word string"', expected: true, description: 'multi-word quoted string' },
            { formula: '42', expected: true, description: 'integer' },
            { formula: '123456', expected: true, description: 'large integer' },
            { formula: '[Field]', expected: true, description: 'field reference' },
            { formula: '[Complex Field Name]', expected: true, description: 'complex field reference' },
            { formula: 'SUM([Field])', expected: false, description: 'function call' },
            { formula: '[Field1] + [Field2]', expected: false, description: 'expression' },
            { formula: 'IF [A] THEN 1 ELSE 0 END', expected: false, description: 'conditional' },
            { formula: '"string" + [Field]', expected: false, description: 'mixed expression' },
            { formula: '42 + 1', expected: false, description: 'arithmetic' },
            { formula: '[Field] > 0', expected: false, description: 'comparison' }
        ];

        testCases.forEach(({ formula, expected, description }) => {
            it(`should return ${expected} for ${description}`, () => {
                const input: ExtractedCalculation[] = [{
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Test',
                    formula
                }];
                
                const result = filterAndDedupe(input);
                const wasFiltered = result.length === 0;
                expect(wasFiltered).toBe(expected);
            });
        });
    });

    describe('condenseWhitespace behavior', () => {
        it('should normalize line endings', () => {
            const input: ExtractedCalculation[] = [{
                workbook: 'test',
                datasource: 'test',
                title: 'Test',
                formula: 'IF [A]\r\nTHEN "yes"\rELSE "no"\nEND'
            }];

            const result = normalize(input);
            expect(result[0].formula).toBe('IF [A]\nTHEN "yes"\nELSE "no"\nEND');
        });

        it('should condense multiple consecutive newlines', () => {
            const input: ExtractedCalculation[] = [{
                workbook: 'test',
                datasource: 'test',
                title: 'Test',
                formula: 'IF [A]\n\n\n\nTHEN "yes"\nEND'
            }];

            const result = normalize(input);
            expect(result[0].formula).toBe('IF [A]\n\nTHEN "yes"\nEND');
        });

        it('should condense multiple spaces and tabs', () => {
            const input: ExtractedCalculation[] = [{
                workbook: 'test',
                datasource: 'test',
                title: 'Test',
                formula: 'IF    [A]  \t\t  THEN     "yes"'
            }];

            const result = normalize(input);
            expect(result[0].formula).toBe('IF [A] THEN "yes"');
        });

        it('should trim leading and trailing whitespace', () => {
            const input: ExtractedCalculation[] = [{
                workbook: 'test',
                datasource: 'test',
                title: 'Test',
                formula: '   IF [A] THEN "yes"   '
            }];

            const result = normalize(input);
            expect(result[0].formula).toBe('IF [A] THEN "yes"');
        });
    });

    describe('uppercaseKeywords behavior', () => {
        it('should uppercase all defined keywords', () => {
            const keywords = ['if', 'then', 'else', 'elseif', 'end', 'case', 'when', 'date', 'and', 'or', 'not', 'null'];
            const formula = keywords.join(' ');
            
            const input: ExtractedCalculation[] = [{
                workbook: 'test',
                datasource: 'test',
                title: 'Test',
                formula
            }];

            const result = normalize(input);
            expect(result[0].formula).toBe(keywords.map(k => k.toUpperCase()).join(' '));
        });

        it('should preserve case of non-keywords', () => {
            const input: ExtractedCalculation[] = [{
                workbook: 'test',
                datasource: 'test',
                title: 'Test',
                formula: 'if CustomFunction([MyField]) then "result" else null end'
            }];

            const result = normalize(input);
            expect(result[0].formula).toBe('IF CustomFunction([MyField]) THEN "result" ELSE NULL END');
        });

        it('should handle keywords in different cases', () => {
            const input: ExtractedCalculation[] = [{
                workbook: 'test',
                datasource: 'test',
                title: 'Test',
                formula: 'If [A] Then "yes" ElseIf [B] Then "maybe" Else "no" End'
            }];

            const result = normalize(input);
            expect(result[0].formula).toBe('IF [A] THEN "yes" ELSEIF [B] THEN "maybe" ELSE "no" END');
        });

        it('should not affect keywords within strings', () => {
            const input: ExtractedCalculation[] = [{
                workbook: 'test',
                datasource: 'test',
                title: 'Test',
                formula: 'if [A] then "if this then that" else "end result" end'
            }];

            const result = normalize(input);
            expect(result[0].formula).toBe('IF [A] THEN "if this then that" ELSE "end result" END');
        });
    });

    describe('integration tests', () => {
        it('should handle complex real-world calculation', () => {
            const input: ExtractedCalculation[] = [{
                workbook: 'Sales Dashboard',
                datasource: 'Sales Data',
                title: 'Profit Margin Category',
                formula: `case
                    when [Profit] / [Sales] > 0.3 then "High"
                    when [Profit] / [Sales] > 0.1 then "Medium"
                    else "Low"
                end`
            }];

            const result = normalize(input);
            expect(result[0].formula).toBe('CASE\nWHEN [Profit] / [Sales] > 0.3 THEN "High"\nWHEN [Profit] / [Sales] > 0.1 THEN "Medium"\nELSE "Low"\nEND');
        });

        it('should handle full normalization and filtering pipeline', () => {
            const input: ExtractedCalculation[] = [
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Trivial String',
                    formula: '"Hello"'
                },
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Complex Calc 1',
                    formula: 'if    [sales]   >   100\n\n\nthen   "high"\nelse "low" end'
                },
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Complex Calc 2',
                    formula: 'IF [SALES] > 100 THEN "HIGH" ELSE "LOW" END'  // Duplicate after normalization
                },
                {
                    workbook: 'test',
                    datasource: 'test',
                    title: 'Unique Calc',
                    formula: 'sum([profit]) / count([orders])'
                }
            ];

            const normalized = normalize(input);
            const result = filterAndDedupe(normalized);
            
            expect(result).toHaveLength(2);
            expect(result[0].title).toBe('Complex Calc 1');
            expect(result[0].formula).toBe('IF [sales] > 100\n\nTHEN "high"\nELSE "low" END');
            expect(result[1].title).toBe('Unique Calc');
            expect(result[1].formula).toBe('SUM([profit]) / COUNT([orders])');
        });
    });
});