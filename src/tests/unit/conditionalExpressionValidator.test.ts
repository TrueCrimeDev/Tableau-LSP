// src/tests/unit/conditionalExpressionValidator.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { validateConditionalExpression } from '../../conditionalExpressionValidator.js';
import { parseDocument } from '../../documentModel.js';

describe('Conditional Expression Validator', () => {
    function createTestDocument(content: string): TextDocument {
        return TextDocument.create('test://test.twbl', 'tableau', 1, content);
    }

    describe('IF Statement Validation', () => {
        it('should validate simple IF statements', () => {
            const document = createTestDocument('IF [Sales] > 100 THEN "High" ELSE "Low" END');
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.isValid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });

        it('should detect missing THEN keyword', () => {
            const document = createTestDocument('IF [Sales] > 100 "High" ELSE "Low" END');
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.isValid).toBe(false);
            expect(validation.errors.some(e => e.message.includes('THEN'))).toBe(true);
        });

        it('should detect missing ELSE keyword', () => {
            const document = createTestDocument('IF [Sales] > 100 THEN "High" "Low" END');
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.isValid).toBe(false);
            expect(validation.errors.some(e => e.message.includes('ELSE'))).toBe(true);
        });

        it('should detect missing END keyword', () => {
            const document = createTestDocument('IF [Sales] > 100 THEN "High" ELSE "Low"');
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.isValid).toBe(false);
            expect(validation.errors.some(e => e.message.includes('END'))).toBe(true);
        });

        it('should validate nested IF statements', () => {
            const document = createTestDocument(`
                IF [Sales] > 100 THEN
                    IF [Profit] > 50 THEN "High Profit" ELSE "Low Profit" END
                ELSE
                    "Low Sales"
                END
            `);
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.isValid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });

        it('should detect unbalanced nested IF statements', () => {
            const document = createTestDocument(`
                IF [Sales] > 100 THEN
                    IF [Profit] > 50 THEN "High Profit" ELSE "Low Profit"
                ELSE
                    "Low Sales"
                END
            `);
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.isValid).toBe(false);
            expect(validation.errors.some(e => e.message.includes('END'))).toBe(true);
        });
    });

    describe('CASE Statement Validation', () => {
        it('should validate simple CASE statements', () => {
            const document = createTestDocument(`
                CASE [Category]
                    WHEN 'Furniture' THEN 'F'
                    WHEN 'Technology' THEN 'T'
                    ELSE 'O'
                END
            `);
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.isValid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });

        it('should detect missing WHEN clauses', () => {
            const document = createTestDocument(`
                CASE [Category]
                    'Furniture' THEN 'F'
                    ELSE 'O'
                END
            `);
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.isValid).toBe(false);
            expect(validation.errors.some(e => e.message.includes('WHEN'))).toBe(true);
        });

        it('should detect missing THEN in WHEN clauses', () => {
            const document = createTestDocument(`
                CASE [Category]
                    WHEN 'Furniture' 'F'
                    ELSE 'O'
                END
            `);
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.isValid).toBe(false);
            expect(validation.errors.some(e => e.message.includes('THEN'))).toBe(true);
        });

        it('should validate CASE without ELSE clause', () => {
            const document = createTestDocument(`
                CASE [Category]
                    WHEN 'Furniture' THEN 'F'
                    WHEN 'Technology' THEN 'T'
                END
            `);
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.isValid).toBe(true);
            expect(validation.warnings.some(w => w.message.includes('ELSE'))).toBe(true);
        });

        it('should validate nested CASE statements', () => {
            const document = createTestDocument(`
                CASE [Category]
                    WHEN 'Furniture' THEN
                        CASE [Sub-Category]
                            WHEN 'Chairs' THEN 'C'
                            ELSE 'F'
                        END
                    ELSE 'O'
                END
            `);
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.isValid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });
    });

    describe('ELSEIF Statement Validation', () => {
        it('should validate IF with ELSEIF statements', () => {
            const document = createTestDocument(`
                IF [Sales] > 1000 THEN "Excellent"
                ELSEIF [Sales] > 500 THEN "Good"
                ELSEIF [Sales] > 100 THEN "Average"
                ELSE "Poor"
                END
            `);
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.isValid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });

        it('should detect missing THEN in ELSEIF', () => {
            const document = createTestDocument(`
                IF [Sales] > 1000 THEN "Excellent"
                ELSEIF [Sales] > 500 "Good"
                ELSE "Poor"
                END
            `);
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.isValid).toBe(false);
            expect(validation.errors.some(e => e.message.includes('THEN'))).toBe(true);
        });

        it('should validate complex nested ELSEIF', () => {
            const document = createTestDocument(`
                IF [Region] = 'North' THEN
                    IF [Sales] > 100 THEN "High North"
                    ELSEIF [Sales] > 50 THEN "Medium North"
                    ELSE "Low North"
                    END
                ELSEIF [Region] = 'South' THEN "South"
                ELSE "Other"
                END
            `);
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.isValid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });
    });

    describe('Expression Context Validation', () => {
        it('should validate boolean expressions in conditions', () => {
            const document = createTestDocument('IF [Sales] > 100 AND [Profit] > 50 THEN "Good" ELSE "Bad" END');
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.isValid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });

        it('should detect invalid condition expressions', () => {
            const document = createTestDocument('IF [Sales] THEN "Good" ELSE "Bad" END');
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.isValid).toBe(false);
            expect(validation.errors.some(e => e.message.includes('boolean'))).toBe(true);
        });

        it('should validate field references in conditions', () => {
            const document = createTestDocument('IF [Unknown Field] > 100 THEN "High" ELSE "Low" END');
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.warnings.some(w => w.message.includes('Unknown Field'))).toBe(true);
        });

        it('should validate function calls in conditions', () => {
            const document = createTestDocument('IF SUM([Sales]) > 1000 THEN "High" ELSE "Low" END');
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.isValid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });
    });

    describe('Error Recovery and Suggestions', () => {
        it('should provide helpful error messages', () => {
            const document = createTestDocument('IF [Sales] > 100 "High" ELSE "Low" END');
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.isValid).toBe(false);
            const thenError = validation.errors.find(e => e.message.includes('THEN'));
            expect(thenError).toBeDefined();
            expect(thenError?.suggestion).toContain('Add THEN keyword');
        });

        it('should suggest fixes for common mistakes', () => {
            const document = createTestDocument('IF [Sales] > 100 THEN "High" "Low" END');
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.isValid).toBe(false);
            const elseError = validation.errors.find(e => e.message.includes('ELSE'));
            expect(elseError?.suggestion).toContain('Add ELSE keyword');
        });

        it('should provide context-aware suggestions', () => {
            const document = createTestDocument(`
                CASE [Category]
                    WHEN 'Furniture' THEN 'F'
                    'Technology' THEN 'T'
                END
            `);
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.isValid).toBe(false);
            const whenError = validation.errors.find(e => e.message.includes('WHEN'));
            expect(whenError?.suggestion).toContain('Add WHEN keyword');
        });

        it('should handle incomplete expressions gracefully', () => {
            const document = createTestDocument('IF [Sales] > 100 THEN');
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.isValid).toBe(false);
            expect(validation.errors.some(e => e.message.includes('incomplete'))).toBe(true);
        });
    });

    describe('Performance and Edge Cases', () => {
        it('should handle very deeply nested expressions', () => {
            let deepExpression = 'IF [A] > 1 THEN ';
            for (let i = 0; i < 20; i++) {
                deepExpression += `IF [B${i}] > ${i} THEN `;
            }
            deepExpression += '"Deep" ';
            for (let i = 0; i < 20; i++) {
                deepExpression += 'ELSE "Shallow" END ';
            }
            deepExpression += 'ELSE "Top" END';
            
            const document = createTestDocument(deepExpression);
            const parsed = parseDocument(document);
            
            const startTime = Date.now();
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            const duration = Date.now() - startTime;
            
            expect(duration).toBeLessThan(1000); // Should complete within 1 second
            expect(validation.isValid).toBe(true);
        });

        it('should handle malformed expressions without crashing', () => {
            const malformedExpressions = [
                'IF THEN ELSE END',
                'CASE WHEN THEN END',
                'IF [Sales] THEN THEN ELSE END',
                'CASE [Category] WHEN WHEN THEN END',
                'IF [Sales] > THEN "High" ELSE "Low" END'
            ];
            
            malformedExpressions.forEach(expr => {
                const document = createTestDocument(expr);
                const parsed = parseDocument(document);
                
                expect(() => {
                    const validation = validateConditionalExpression(parsed.symbols[0], document);
                    expect(validation.isValid).toBe(false);
                }).not.toThrow();
            });
        });

        it('should handle empty or null expressions', () => {
            const document = createTestDocument('');
            const parsed = parseDocument(document);
            
            expect(() => {
                const validation = validateConditionalExpression(null as any, document);
                expect(validation.isValid).toBe(false);
            }).not.toThrow();
        });

        it('should validate expressions with comments', () => {
            const document = createTestDocument(`
                // Check sales performance
                IF [Sales] > 100 THEN // High sales
                    "High"
                ELSE // Low sales
                    "Low"
                END
            `);
            const parsed = parseDocument(document);
            
            const validation = validateConditionalExpression(parsed.symbols[0], document);
            
            expect(validation.isValid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });
    });
});
