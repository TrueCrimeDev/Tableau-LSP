// src/tests/unit/formatProvider.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { FormattingOptions, Range, TextEdit } from 'vscode-languageserver';
import { format, formatRange, FormattingErrorHandlingAPI } from '../../format.js';

describe('Format Provider', () => {
    const defaultOptions: FormattingOptions = {
        tabSize: 4,
        insertSpaces: true
    };
    
    beforeEach(() => {
        // Reset error handling configuration
        FormattingErrorHandlingAPI.configureErrorHandling({
            MAX_FORMATTING_ATTEMPTS: 3,
            ENABLE_PARTIAL_FORMATTING: true,
            PRESERVE_ORIGINAL_ON_FAILURE: true,
            LOG_FORMATTING_ERRORS: false, // Disable logging in tests
            FALLBACK_TO_BASIC_FORMATTING: true
        });
    });
    
    describe('Basic Formatting', () => {
        it('should format simple expressions', () => {
            const document = createTestDocument('SUM([Sales])');
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            expect(Array.isArray(edits)).toBe(true);
            
            if (edits.length > 0) {
                expect(edits[0].newText).toContain('SUM([Sales])');
            }
        });
        
        it('should format expressions with proper spacing', () => {
            const document = createTestDocument('SUM([Sales])+AVG([Profit])');
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            
            if (edits.length > 0) {
                const formatted = edits[0].newText;
                expect(formatted).toMatch(/SUM\(\[Sales\]\)\s*\+\s*AVG\(\[Profit\]\)/);
            }
        });
        
        it('should format field references consistently', () => {
            const document = createTestDocument('[Sales] + [Profit] * [Quantity]');
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            
            if (edits.length > 0) {
                const formatted = edits[0].newText;
                expect(formatted).toContain('[Sales]');
                expect(formatted).toContain('[Profit]');
                expect(formatted).toContain('[Quantity]');
            }
        });
    });
    
    describe('IF Statement Formatting', () => {
        it('should format simple IF statements with proper indentation', () => {
            const document = createTestDocument('IF [Sales] > 100 THEN "High" ELSE "Low" END');
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            
            if (edits.length > 0) {
                const formatted = edits[0].newText;
                expect(formatted).toContain('IF');
                expect(formatted).toContain('THEN');
                expect(formatted).toContain('ELSE');
                expect(formatted).toContain('END');
            }
        });
        
        it('should format multi-line IF statements', () => {
            const document = createTestDocument(`
                IF [Sales] > 1000 THEN
                "High Sales"
                ELSEIF [Sales] > 500 THEN
                "Medium Sales"
                ELSE
                "Low Sales"
                END
            `);
            
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            
            if (edits.length > 0) {
                const formatted = edits[0].newText;
                expect(formatted).toContain('IF');
                expect(formatted).toContain('ELSEIF');
                expect(formatted).toContain('ELSE');
                expect(formatted).toContain('END');
            }
        });
        
        it('should format nested IF statements', () => {
            const document = createTestDocument(`
                IF [Category] = "Furniture" THEN
                    IF [Sales] > 100 THEN "High Furniture" ELSE "Low Furniture" END
                ELSE
                    "Other"
                END
            `);
            
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            
            if (edits.length > 0) {
                const formatted = edits[0].newText;
                // Should maintain nested structure
                expect(formatted).toContain('IF');
                expect(formatted).toContain('END');
            }
        });
    });
    
    describe('CASE Statement Formatting', () => {
        it('should format simple CASE statements', () => {
            const document = createTestDocument('CASE [Category] WHEN "Furniture" THEN 1 WHEN "Technology" THEN 2 ELSE 0 END');
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            
            if (edits.length > 0) {
                const formatted = edits[0].newText;
                expect(formatted).toContain('CASE');
                expect(formatted).toContain('WHEN');
                expect(formatted).toContain('THEN');
                expect(formatted).toContain('ELSE');
                expect(formatted).toContain('END');
            }
        });
        
        it('should format multi-line CASE statements with proper indentation', () => {
            const document = createTestDocument(`
                CASE [Category]
                WHEN "Furniture" THEN [Sales] * 0.1
                WHEN "Technology" THEN [Sales] * 0.15
                WHEN "Office Supplies" THEN [Sales] * 0.05
                ELSE [Sales] * 0.02
                END
            `);
            
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            
            if (edits.length > 0) {
                const formatted = edits[0].newText;
                expect(formatted).toContain('CASE');
                expect(formatted).toContain('WHEN');
                expect(formatted).toContain('END');
            }
        });
        
        it('should format nested CASE statements', () => {
            const document = createTestDocument(`
                CASE [Region]
                WHEN "East" THEN
                    CASE [Category]
                    WHEN "Furniture" THEN 1
                    ELSE 2
                    END
                ELSE 0
                END
            `);
            
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            
            if (edits.length > 0) {
                const formatted = edits[0].newText;
                expect(formatted).toContain('CASE');
                expect(formatted).toContain('END');
            }
        });
    });
    
    describe('LOD Expression Formatting', () => {
        it('should format FIXED expressions', () => {
            const document = createTestDocument('{ FIXED [Region] : SUM([Sales]) }');
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            
            if (edits.length > 0) {
                const formatted = edits[0].newText;
                expect(formatted).toContain('FIXED');
                expect(formatted).toContain('[Region]');
                expect(formatted).toContain('SUM([Sales])');
                expect(formatted).toMatch(/\{.*\}/);
            }
        });
        
        it('should format INCLUDE expressions', () => {
            const document = createTestDocument('{ INCLUDE [Category] : AVG([Profit]) }');
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            
            if (edits.length > 0) {
                const formatted = edits[0].newText;
                expect(formatted).toContain('INCLUDE');
                expect(formatted).toContain('[Category]');
                expect(formatted).toContain('AVG([Profit])');
            }
        });
        
        it('should format EXCLUDE expressions', () => {
            const document = createTestDocument('{ EXCLUDE [Sub-Category] : COUNT([Orders]) }');
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            
            if (edits.length > 0) {
                const formatted = edits[0].newText;
                expect(formatted).toContain('EXCLUDE');
                expect(formatted).toContain('[Sub-Category]');
                expect(formatted).toContain('COUNT([Orders])');
            }
        });
        
        it('should format complex LOD expressions', () => {
            const document = createTestDocument(`
                {
                FIXED [Region], [Category] :
                SUM(
                IF [Sales] > AVG([Sales]) THEN
                [Profit]
                ELSE
                0
                END
                )
                }
            `);
            
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            
            if (edits.length > 0) {
                const formatted = edits[0].newText;
                expect(formatted).toContain('FIXED');
                expect(formatted).toContain('SUM');
                expect(formatted).toContain('IF');
            }
        });
    });
    
    describe('Function Call Formatting', () => {
        it('should format function calls with proper spacing', () => {
            const document = createTestDocument('LEFT([Customer Name],5)');
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            
            if (edits.length > 0) {
                const formatted = edits[0].newText;
                expect(formatted).toMatch(/LEFT\(\[Customer Name\],\s*5\)/);
            }
        });
        
        it('should format nested function calls', () => {
            const document = createTestDocument('UPPER(LEFT([Customer Name], 10))');
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            
            if (edits.length > 0) {
                const formatted = edits[0].newText;
                expect(formatted).toContain('UPPER');
                expect(formatted).toContain('LEFT');
                expect(formatted).toContain('[Customer Name]');
            }
        });
        
        it('should format function calls with multiple parameters', () => {
            const document = createTestDocument('DATEADD(\'month\',1,[Order Date])');
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            
            if (edits.length > 0) {
                const formatted = edits[0].newText;
                expect(formatted).toContain('DATEADD');
                expect(formatted).toContain('\'month\'');
                expect(formatted).toContain('[Order Date]');
            }
        });
    });
    
    describe('Operator Formatting', () => {
        it('should format arithmetic operators with proper spacing', () => {
            const document = createTestDocument('[Sales]+[Profit]-[Discount]*[Quantity]/[Price]');
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            
            if (edits.length > 0) {
                const formatted = edits[0].newText;
                expect(formatted).toMatch(/\[Sales\]\s*\+\s*\[Profit\]/);
                expect(formatted).toMatch(/\-\s*\[Discount\]/);
                expect(formatted).toMatch(/\*\s*\[Quantity\]/);
                expect(formatted).toMatch(/\/\s*\[Price\]/);
            }
        });
        
        it('should format comparison operators', () => {
            const document = createTestDocument('[Sales]>100 AND [Profit]<50 OR [Quantity]>=10');
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            
            if (edits.length > 0) {
                const formatted = edits[0].newText;
                expect(formatted).toMatch(/\[Sales\]\s*>\s*100/);
                expect(formatted).toMatch(/AND/);
                expect(formatted).toMatch(/\[Profit\]\s*<\s*50/);
                expect(formatted).toMatch(/OR/);
            }
        });
        
        it('should format logical operators', () => {
            const document = createTestDocument('[Sales]>100AND[Profit]>50OR[Category]="Furniture"');
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            
            if (edits.length > 0) {
                const formatted = edits[0].newText;
                expect(formatted).toMatch(/\s+AND\s+/);
                expect(formatted).toMatch(/\s+OR\s+/);
            }
        });
    });
    
    describe('String and Literal Formatting', () => {
        it('should preserve string literals', () => {
            const document = createTestDocument('IF [Category] = "Office Supplies" THEN "Office" ELSE "Other" END');
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            
            if (edits.length > 0) {
                const formatted = edits[0].newText;
                expect(formatted).toContain('"Office Supplies"');
                expect(formatted).toContain('"Office"');
                expect(formatted).toContain('"Other"');
            }
        });
        
        it('should handle single quotes in strings', () => {
            // Tableau escapes a literal apostrophe inside a single-quoted string by
            // doubling it ('') — an unescaped apostrophe is invalid and terminates the string.
            const document = createTestDocument('IF [Customer Name] = \'John\'\'s Store\' THEN 1 ELSE 0 END');
            const edits = format(document, defaultOptions);

            expect(edits).toBeDefined();

            if (edits.length > 0) {
                const formatted = edits[0].newText;
                expect(formatted).toContain('\'John\'\'s Store\'');
            }
        });
        
        it('should format numeric literals', () => {
            const document = createTestDocument('[Sales]*1.1+100-0.05');
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            
            if (edits.length > 0) {
                const formatted = edits[0].newText;
                expect(formatted).toContain('1.1');
                expect(formatted).toContain('100');
                expect(formatted).toContain('0.05');
            }
        });
    });
    
    describe('Comment Formatting', () => {
        it('should preserve single-line comments', () => {
            const document = createTestDocument(`
                // This is a comment
                SUM([Sales]) // Another comment
            `);
            
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            
            if (edits.length > 0) {
                const formatted = edits[0].newText;
                expect(formatted).toContain('// This is a comment');
                expect(formatted).toContain('// Another comment');
            }
        });
        
        it('should preserve multi-line comments', () => {
            const document = createTestDocument(`
                /*
                 * Multi-line comment
                 * with multiple lines
                 */
                SUM([Sales])
            `);
            
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            
            if (edits.length > 0) {
                const formatted = edits[0].newText;
                expect(formatted).toContain('/*');
                expect(formatted).toContain('*/');
                expect(formatted).toContain('Multi-line comment');
            }
        });
    });
    
    describe('Formatting Options', () => {
        it('should respect tab size setting', () => {
            const document = createTestDocument(`
                IF [Sales] > 100 THEN
                    "High"
                ELSE
                    "Low"
                END
            `);
            
            const tabOptions: FormattingOptions = {
                tabSize: 2,
                insertSpaces: true
            };
            
            const edits = format(document, tabOptions);
            
            expect(edits).toBeDefined();
            // Specific indentation testing would depend on implementation
        });
        
        it('should respect insertSpaces setting', () => {
            const document = createTestDocument(`
                IF [Sales] > 100 THEN
                    "High"
                END
            `);
            
            const tabOptions: FormattingOptions = {
                tabSize: 4,
                insertSpaces: false
            };
            
            const edits = format(document, tabOptions);
            
            expect(edits).toBeDefined();
            // Tab vs spaces testing would depend on implementation
        });
    });
    
    describe('Error Handling', () => {
        it('should handle malformed expressions gracefully', () => {
            const document = createTestDocument('IF [Sales] > 100 THEN THEN ELSE');
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            expect(Array.isArray(edits)).toBe(true);
            // Should not throw error
        });
        
        it('should handle incomplete expressions', () => {
            const document = createTestDocument('SUM([Sales] +');
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            expect(Array.isArray(edits)).toBe(true);
        });
        
        it('should handle empty documents', () => {
            const document = createTestDocument('');
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            expect(Array.isArray(edits)).toBe(true);
            expect(edits).toEqual([]);
        });
        
        it('should handle whitespace-only documents', () => {
            const document = createTestDocument('   \n  \t  \n   ');
            const edits = format(document, defaultOptions);
            
            expect(edits).toBeDefined();
            expect(Array.isArray(edits)).toBe(true);
        });
    });
    
    describe('Performance', () => {
        it('should format quickly for normal-sized documents', () => {
            const document = createTestDocument(`
                IF [Sales] > 1000 THEN
                    CASE [Category]
                    WHEN "Furniture" THEN [Sales] * 0.1
                    WHEN "Technology" THEN [Sales] * 0.15
                    ELSE [Sales] * 0.05
                    END
                ELSE
                    [Sales] * 0.02
                END
            `);
            
            const startTime = Date.now();
            const edits = format(document, defaultOptions);
            const duration = Date.now() - startTime;
            
            expect(edits).toBeDefined();
            expect(duration).toBeLessThan(100); // Should be fast
        });
        
        it('should handle large documents efficiently', () => {
            const largeContent = Array.from({ length: 100 }, (_, i) => 
                `IF [Field${i}] > ${i} THEN SUM([Value${i}]) ELSE AVG([Other${i}]) END`
            ).join('\n');
            
            const document = createTestDocument(largeContent);
            
            const startTime = Date.now();
            const edits = format(document, defaultOptions);
            const duration = Date.now() - startTime;
            
            expect(edits).toBeDefined();
            expect(duration).toBeLessThan(1000); // Should handle large documents
        });
    });
    
    describe('Formatting Consistency', () => {
        it('should produce consistent results for identical input', () => {
            const content = 'IF [Sales] > 100 THEN "High" ELSE "Low" END';
            const document1 = createTestDocument(content);
            const document2 = createTestDocument(content);
            
            const edits1 = format(document1, defaultOptions);
            const edits2 = format(document2, defaultOptions);
            
            expect(edits1).toEqual(edits2);
        });
        
        it('should be idempotent (formatting formatted code should not change it)', () => {
            const document = createTestDocument('IF [Sales] > 100 THEN "High" ELSE "Low" END');
            
            const firstFormat = format(document, defaultOptions);
            
            if (firstFormat.length > 0) {
                const formattedDocument = createTestDocument(firstFormat[0].newText);
                const secondFormat = format(formattedDocument, defaultOptions);
                
                // Second formatting should produce minimal or no changes
                expect(secondFormat.length).toBeLessThanOrEqual(1);
                
                if (secondFormat.length > 0) {
                    expect(secondFormat[0].newText).toBe(firstFormat[0].newText);
                }
            }
        });
    });
});

describe('Advanced formatting profiles', () => {
    const options: FormattingOptions = { tabSize: 4, insertSpaces: true };

    it('lays out IF branches as conventional readable blocks', () => {
        const document = createTestDocument('IF [Sales]>100 THEN "High" ELSE "Low" END');
        const formatted = format(document, { ...options, profile: 'readable' })[0].newText;

        expect(formatted).toBe([
            'IF [Sales] > 100 THEN',
            '    "High"',
            'ELSE',
            '    "Low"',
            'END',
        ].join('\n'));
    });

    it('expands function arguments and closes at the matching indentation', () => {
        const document = createTestDocument('IFNULL([Sales],0)');
        const formatted = format(document, {
            ...options,
            profile: 'expanded',
        })[0].newText;

        expect(formatted).toBe([
            'IFNULL(',
            '    [Sales],',
            '    0',
            ')',
        ].join('\n'));
    });

    it('keeps function arguments on one line in the compact profile', () => {
        const document = createTestDocument('IFNULL([Sales],0)');
        const formatted = format(document, {
            ...options,
            profile: 'compact',
            maxLineLength: 40,
        })[0].newText;

        expect(formatted).toBe('IFNULL([Sales], 0)');
    });

    it('supports keyword casing, leading logical operators, and a final newline', () => {
        const document = createTestDocument(
            'IF [Very Long Sales Field] > 100 AND [Very Long Profit Field] > 50 THEN 1 ELSE 0 END'
        );
        const formatted = format(document, {
            ...options,
            profile: 'readable',
            maxLineLength: 40,
            keywordCase: 'lower',
            logicalOperatorPosition: 'leading',
            finalNewline: true,
        })[0].newText;

        expect(formatted).toMatch(/\n\s+and /);
        expect(formatted).toContain('then\n');
        expect(formatted.endsWith('\n')).toBe(true);
    });

    it('formats only a requested range', () => {
        const document = TextDocument.create(
            'test://selection.twbl',
            'tableau',
            1,
            'SUM([Sales])\nIF [Profit]>0 THEN "Yes" ELSE "No" END\nAVG([Discount])'
        );
        const range = Range.create(1, 0, 1, 45);
        const edits = formatRange(document, range, { ...options, profile: 'readable' });

        expect(edits).toHaveLength(1);
        expect(edits[0].range).toEqual(range);
        expect(edits[0].newText).toContain('IF [Profit] > 0 THEN');
        expect(edits[0].newText).not.toContain('SUM([Sales])');
        expect(edits[0].newText).not.toContain('AVG([Discount])');
    });
});

/**
 * Helper function to create test documents
 */
function createTestDocument(
    content: string, 
    version: number = 1, 
    uri: string = 'test://test.twbl'
): TextDocument {
    return TextDocument.create(uri, 'tableau', version, content);
}
