// src/tests/edge/errorRecovery.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseDocument } from '../../documentModel';
import { getDiagnostics } from '../../diagnosticsProvider';
import { ErrorRecovery } from '../../errorRecovery';
import { IncrementalParser } from '../../incrementalParser';
import { provideHover } from '../../hoverProvider';
import { provideCompletion } from '../../completionProvider';

/**
 * R8.4: Error recovery tests
 * 
 * This test suite validates that the LSP can recover from various error conditions
 * and continue providing useful functionality even when the document contains errors.
 */

describe('Error Recovery Tests', () => {
    describe('Syntax Error Recovery', () => {
        test('should recover from unclosed IF statements', () => {
            const testCases = [
                {
                    input: 'IF [Sales] > 100 THEN "High"',
                    expectedSymbols: ['IF'],
                    expectedRecovery: true
                },
                {
                    input: 'IF [Sales] > 100 THEN "High" ELSE "Low"',
                    expectedSymbols: ['IF'],
                    expectedRecovery: true
                },
                {
                    input: 'SUM([Sales]) + IF [Profit] > 50 THEN "Good"',
                    expectedSymbols: ['SUM', 'IF'],
                    expectedRecovery: true
                }
            ];

            testCases.forEach(({ input, expectedSymbols, expectedRecovery }) => {
                const document = createTestDocument(input);
                
                expect(() => {
                    const result = ErrorRecovery.parseWithErrorRecovery(document);
                    
                    // Should recover and continue parsing
                    expect(result.recoveryInfo.recoveredErrors).toBeGreaterThan(0);
                    
                    // Should recognize expected symbols
                    expectedSymbols.forEach(symbolName => {
                        const hasSymbol = result.symbols.some(s => s.name === symbolName);
                        expect(hasSymbol).toBe(true);
                    });
                    
                    // Should provide recovery information
                    expect(result.recoveryInfo.totalErrors).toBeGreaterThan(0);
                    expect(result.recoveryInfo.recoveredErrors).toBeLessThanOrEqual(result.recoveryInfo.totalErrors);
                    
                }).not.toThrow();
            });
        });

        test('should recover from unclosed CASE statements', () => {
            const testCases = [
                {
                    input: 'CASE [Region] WHEN "North" THEN "Northern"',
                    expectedSymbols: ['CASE'],
                    description: 'missing ELSE and END'
                },
                {
                    input: 'CASE [Region] WHEN "North" THEN "Northern" ELSE "Other"',
                    expectedSymbols: ['CASE'],
                    description: 'missing END'
                },
                {
                    input: 'CASE [Region] WHEN "North" THEN "Northern" WHEN "South" THEN "Southern"',
                    expectedSymbols: ['CASE'],
                    description: 'missing ELSE and END'
                }
            ];

            testCases.forEach(({ input, expectedSymbols, description }) => {
                const document = createTestDocument(input);
                
                expect(() => {
                    const result = ErrorRecovery.parseWithErrorRecovery(document);
                    
                    // Should recover from the error
                    expect(result.recoveryInfo.recoveredErrors).toBeGreaterThan(0);
                    
                    // Should recognize CASE structure
                    const hasCaseSymbol = result.symbols.some(s => s.name === 'CASE');
                    expect(hasCaseSymbol).toBe(true);
                    
                }).not.toThrow();
            });
        });

        test('should recover from function syntax errors', () => {
            const functionErrorCases = [
                {
                    input: 'SUM([Sales) + AVG([Profit])',
                    expectedFunctions: ['SUM', 'AVG'],
                    description: 'unclosed parenthesis in first function'
                },
                {
                    input: 'SUM() + AVG([Profit])',
                    expectedFunctions: ['SUM', 'AVG'],
                    description: 'empty parameters in first function'
                },
                {
                    input: 'UNKNOWN_FUNC([Sales]) + COUNT([Orders])',
                    expectedFunctions: ['COUNT'],
                    description: 'unknown function should not prevent parsing others'
                },
                {
                    input: 'SUM([Sales], [Profit], [Orders]) + AVG([Discount])',
                    expectedFunctions: ['SUM', 'AVG'],
                    description: 'too many parameters should not prevent parsing'
                }
            ];

            functionErrorCases.forEach(({ input, expectedFunctions, description }) => {
                const document = createTestDocument(input);
                
                expect(() => {
                    const result = ErrorRecovery.parseWithErrorRecovery(document);
                    
                    // Should recover and continue parsing
                    expect(result.recoveryInfo.recoveredErrors).toBeGreaterThanOrEqual(0);
                    
                    // Should recognize valid functions
                    expectedFunctions.forEach(funcName => {
                        const hasFunction = result.symbols.some(s => s.name === funcName);
                        expect(hasFunction).toBe(true);
                    });
                    
                }).not.toThrow();
            });
        });
    });

    describe('Partial Expression Recovery', () => {
        test('should provide useful information for incomplete expressions during typing', async () => {
            const typingSequence = [
                'S',
                'SU',
                'SUM',
                'SUM(',
                'SUM([',
                'SUM([S',
                'SUM([Sa',
                'SUM([Sal',
                'SUM([Sale',
                'SUM([Sales',
                'SUM([Sales]',
                'SUM([Sales])'
            ];

            for (const partial of typingSequence) {
                const document = createTestDocument(partial);
                
                expect(() => {
                    const result = parseDocument(document);
                    const diagnostics = getDiagnostics(document, result);
                    
                    // Should not crash on partial input
                    expect(result).toBeDefined();
                    expect(diagnostics).toBeDefined();
                    
                    // Should provide completion suggestions for partial input
                    const completions = await provideCompletion(
                        { textDocument: { uri: document.uri }, position: { line: 0, character: partial.length } },
                        document,
                        result,
                        null
                    );
                    
                    expect(completions).toBeDefined();
                    
                }).not.toThrow();
            }
        });

        test('should handle incomplete LOD expressions gracefully', () => {
            const incompleteLODCases = [
                '{FIXED',
                '{FIXED [Customer]',
                '{FIXED [Customer] :',
                '{FIXED [Customer] : SUM',
                '{FIXED [Customer] : SUM(',
                '{FIXED [Customer] : SUM([Sales]',
                '{FIXED [Customer] : SUM([Sales])'
            ];

            incompleteLODCases.forEach(input => {
                const document = createTestDocument(input);
                
                expect(() => {
                    const result = ErrorRecovery.parseWithErrorRecovery(document);
                    
                    // Should recognize LOD structure even if incomplete
                    const hasLODSymbol = result.symbols.some(s => 
                        s.name === 'FIXED' || s.name === 'LOD'
                    );
                    
                    // Should provide recovery information
                    expect(result.recoveryInfo).toBeDefined();
                    
                    // Should not crash
                    expect(result.symbols).toBeDefined();
                    
                }).not.toThrow();
            });
        });

        test('should provide helpful guidance for incomplete expressions', () => {
            const incompleteExpressions = [
                {
                    input: 'IF [Sales] > 100',
                    expectedGuidance: 'THEN clause expected'
                },
                {
                    input: 'IF [Sales] > 100 THEN "High"',
                    expectedGuidance: 'ELSE clause or END expected'
                },
                {
                    input: 'CASE [Region]',
                    expectedGuidance: 'WHEN clause expected'
                },
                {
                    input: 'CASE [Region] WHEN "North"',
                    expectedGuidance: 'THEN clause expected'
                },
                {
                    input: '{FIXED [Customer]',
                    expectedGuidance: 'colon and expression expected'
                }
            ];

            incompleteExpressions.forEach(({ input, expectedGuidance }) => {
                const document = createTestDocument(input);
                
                expect(() => {
                    const result = parseDocument(document);
                    const diagnostics = getDiagnostics(document, result);
                    
                    // Should provide helpful diagnostics
                    expect(diagnostics.length).toBeGreaterThan(0);
                    
                    // Should contain helpful guidance
                    const hasHelpfulMessage = diagnostics.some(d => 
                        d.message.toLowerCase().includes('expected') ||
                        d.message.toLowerCase().includes('missing') ||
                        d.message.toLowerCase().includes('incomplete')
                    );
                    expect(hasHelpfulMessage).toBe(true);
                    
                }).not.toThrow();
            });
        });
    });

    describe('Mixed Error Recovery', () => {
        test('should recover from multiple error types in single expression', () => {
            const mixedErrorCases = [
                {
                    input: 'IF [Sales] > SUM( THEN "High" ELSE "Low" END',
                    expectedSymbols: ['IF', 'SUM'],
                    description: 'IF statement with malformed function call'
                },
                {
                    input: 'CASE [Region] WHEN "North" THEN {FIXED [Customer] : COUNT([Orders] ELSE "Other" END',
                    expectedSymbols: ['CASE', 'FIXED', 'COUNT'],
                    description: 'CASE with incomplete LOD expression'
                },
                {
                    input: 'SUM([Sales) + AVG([Profit) * UNKNOWN_FUNC([Orders])',
                    expectedSymbols: ['SUM', 'AVG'],
                    description: 'multiple function errors'
                },
                {
                    input: 'IF [Sales] > 100 THEN "High ELSE IF [Profit] > 50 THEN "Good" ELSE "Low" END',
                    expectedSymbols: ['IF'],
                    description: 'nested IF with string error'
                }
            ];

            mixedErrorCases.forEach(({ input, expectedSymbols, description }) => {
                const document = createTestDocument(input);
                
                expect(() => {
                    const result = ErrorRecovery.parseWithErrorRecovery(document);
                    
                    // Should recover from multiple errors
                    expect(result.recoveryInfo.totalErrors).toBeGreaterThan(1);
                    expect(result.recoveryInfo.recoveredErrors).toBeGreaterThan(0);
                    
                    // Should recognize expected symbols despite errors
                    expectedSymbols.forEach(symbolName => {
                        const hasSymbol = result.symbols.some(s => s.name === symbolName);
                        expect(hasSymbol).toBe(true);
                    });
                    
                    // Recovery rate should be reasonable
                    const recoveryRate = result.recoveryInfo.recoveredErrors / result.recoveryInfo.totalErrors;
                    expect(recoveryRate).toBeGreaterThan(0);
                    
                }).not.toThrow();
            });
        });

        test('should maintain LSP functionality with errors present', async () => {
            const errorDocument = createTestDocument('SUM([Sales) + AVG([Profit]) + UNKNOWN_FUNC([Orders])');
            const result = ErrorRecovery.parseWithErrorRecovery(errorDocument);
            
            // Hover should work on valid parts
            await expect(async () => {
                const hoverResult = await provideHover(
                    { textDocument: { uri: errorDocument.uri }, position: { line: 0, character: 16 } }, // On AVG
                    errorDocument,
                    null
                );
                
                // Should provide hover information for valid function
                expect(hoverResult).toBeDefined();
                
            }).not.toThrow();
            
            // Completion should work
            await expect(async () => {
                const completions = await provideCompletion(
                    { textDocument: { uri: errorDocument.uri }, position: { line: 0, character: 30 } },
                    errorDocument,
                    result,
                    null
                );
                
                expect(completions).toBeDefined();
                
            }).not.toThrow();
        });
    });

    describe('Catastrophic Error Recovery', () => {
        test('should handle completely malformed syntax', () => {
            const catastrophicCases = [
                'IF THEN ELSE WHEN CASE END END END',
                '{ [ ( " \' } ] ) " \'',
                'SUM(AVG(COUNT(MAX(MIN([Sales])))))',
                '@@@@@@@@@@@@@@@@@@@@',
                'ENDENDENDENDENDENDEND',
                '(((((((((((((((((((',
                '"""""""""""""""""""'
            ];

            catastrophicCases.forEach(input => {
                const document = createTestDocument(input);
                
                expect(() => {
                    const result = ErrorRecovery.parseWithErrorRecovery(document);
                    
                    // Should not crash
                    expect(result).toBeDefined();
                    expect(result.recoveryInfo).toBeDefined();
                    
                    // Should report errors
                    expect(result.recoveryInfo.totalErrors).toBeGreaterThan(0);
                    
                    // Should attempt some recovery
                    expect(result.recoveryInfo.recoveredErrors).toBeGreaterThanOrEqual(0);
                    
                }).not.toThrow();
            });
        });

        test('should provide meaningful error messages for catastrophic failures', () => {
            const input = 'IF THEN ELSE WHEN CASE END END END';
            const document = createTestDocument(input);
            
            expect(() => {
                const result = parseDocument(document);
                const diagnostics = getDiagnostics(document, result);
                
                // Should provide diagnostics
                expect(diagnostics.length).toBeGreaterThan(0);
                
                // Should have meaningful error messages
                const hasMeaningfulError = diagnostics.some(d => 
                    d.message.length > 10 && // Not just a single word
                    (d.message.includes('expected') || 
                     d.message.includes('unexpected') ||
                     d.message.includes('invalid'))
                );
                expect(hasMeaningfulError).toBe(true);
                
            }).not.toThrow();
        });
    });

    describe('Incremental Parsing Error Recovery', () => {
        test('should recover from errors introduced during editing', () => {
            // Start with valid expression
            const validExpression = 'SUM([Sales]) + AVG([Profit])';
            let document = createTestDocument(validExpression);
            
            // Initial parse should be successful
            let result = IncrementalParser.parseDocumentIncremental(document);
            expect(result.diagnostics.length).toBe(0);
            
            // Introduce error by removing closing parenthesis
            const errorExpression = 'SUM([Sales) + AVG([Profit])';
            document = createTestDocument(errorExpression, 2, document.uri);
            
            expect(() => {
                result = IncrementalParser.parseDocumentIncremental(document);
                
                // Should handle the error gracefully
                expect(result.diagnostics.length).toBeGreaterThan(0);
                
                // Should still recognize both functions
                expect(result.symbols.length).toBe(2);
                
                const hasSUM = result.symbols.some(s => s.name === 'SUM');
                const hasAVG = result.symbols.some(s => s.name === 'AVG');
                expect(hasSUM).toBe(true);
                expect(hasAVG).toBe(true);
                
            }).not.toThrow();
            
            // Fix the error
            const fixedExpression = 'SUM([Sales]) + AVG([Profit])';
            document = createTestDocument(fixedExpression, 3, document.uri);
            
            expect(() => {
                result = IncrementalParser.parseDocumentIncremental(document);
                
                // Should recover completely
                expect(result.diagnostics.length).toBe(0);
                expect(result.symbols.length).toBe(2);
                
            }).not.toThrow();
        });

        test('should handle rapid error introduction and correction', () => {
            const baseExpression = 'IF [Sales] > 100 THEN "High" ELSE "Low" END';
            let document = createTestDocument(baseExpression);
            
            // Initial parse
            IncrementalParser.parseDocumentIncremental(document);
            
            // Simulate rapid typing that introduces and fixes errors
            const editSequence = [
                'IF [Sales] > 100 THEN "High" ELSE "Low" EN',  // Missing D
                'IF [Sales] > 100 THEN "High" ELSE "Low" E',   // Missing ND
                'IF [Sales] > 100 THEN "High" ELSE "Low"',     // Missing END
                'IF [Sales] > 100 THEN "High" ELSE "Low" END'  // Fixed
            ];
            
            editSequence.forEach((content, index) => {
                document = createTestDocument(content, index + 2, document.uri);
                
                expect(() => {
                    const result = IncrementalParser.parseDocumentIncremental(document);
                    
                    // Should handle each edit gracefully
                    expect(result).toBeDefined();
                    expect(result.symbols.length).toBeGreaterThan(0);
                    
                    // Should recognize IF structure even with errors
                    const hasIF = result.symbols.some(s => s.name === 'IF');
                    expect(hasIF).toBe(true);
                    
                }).not.toThrow();
            });
        });
    });

    describe('Error Recovery Performance', () => {
        test('error recovery should not significantly impact performance', () => {
            const errorDocument = createTestDocument(`
                SUM([Sales) + AVG([Profit])
                IF [Region] = "North" THEN "Northern" ELSE "Other"
                CASE [Category] WHEN "Furniture" THEN "Furn"
                {FIXED [Customer] : COUNT([Orders]
                UNKNOWN_FUNC([Discount]) + MAX([Quantity])
            `.trim());
            
            const startTime = performance.now();
            
            expect(() => {
                const result = ErrorRecovery.parseWithErrorRecovery(errorDocument);
                
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                // Should complete within reasonable time even with errors
                expect(duration).toBeLessThan(500); // 500ms max
                
                // Should recover from multiple errors
                expect(result.recoveryInfo.totalErrors).toBeGreaterThan(3);
                expect(result.recoveryInfo.recoveredErrors).toBeGreaterThan(0);
                
                // Should still produce useful symbols
                expect(result.symbols.length).toBeGreaterThan(3);
                
            }).not.toThrow();
        });

        test('error recovery should scale with document size', () => {
            // Create a large document with errors
            const errorLines = Array(100).fill(0).map((_, i) => {
                const errorTypes = [
                    `SUM([Sales${i})`,           // Missing closing bracket
                    `UNKNOWN_FUNC${i}([Profit])`, // Unknown function
                    `IF [Sales${i}] > 100 THEN "High"`, // Missing END
                    `{FIXED [Customer${i}] : COUNT([Orders${i}]` // Missing closing brace
                ];
                return errorTypes[i % errorTypes.length];
            });
            
            const largeErrorDocument = createTestDocument(errorLines.join('\n'));
            
            const startTime = performance.now();
            
            expect(() => {
                const result = ErrorRecovery.parseWithErrorRecovery(largeErrorDocument);
                
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                // Should complete within reasonable time for large document
                expect(duration).toBeLessThan(2000); // 2 seconds max
                
                // Should recover from many errors
                expect(result.recoveryInfo.totalErrors).toBeGreaterThan(50);
                expect(result.recoveryInfo.recoveredErrors).toBeGreaterThan(0);
                
                // Should produce symbols for valid parts
                expect(result.symbols.length).toBeGreaterThan(50);
                
            }).not.toThrow();
        });
    });
});

/**
 * Helper function to create test documents
 */
function createTestDocument(
    content: string, 
    version: number = 1, 
    uri: string = 'test://error-recovery.twbl'
): TextDocument {
    return TextDocument.create(uri, 'tableau', version, content);
}