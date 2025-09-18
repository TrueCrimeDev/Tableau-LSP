// src/tests/edge/malformedInputs.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseDocument } from '../../documentModel';
import { getDiagnostics } from '../../diagnosticsProvider';
import { provideHover } from '../../hoverProvider';
import { provideCompletion } from '../../completionProvider';
import { buildSignatureHelp } from '../../signatureProvider';
import { format } from '../../format';
import { ErrorRecovery } from '../../errorRecovery';

/**
 * R8.4: Edge case tests for malformed inputs
 * 
 * This test suite validates that the LSP handles malformed inputs gracefully
 * without crashing and provides meaningful error recovery.
 */

describe('Malformed Input Handling', () => {
    describe('Unclosed String Literals', () => {
        const unclosedStringCases = [
            {
                name: 'unclosed double quote in IF statement',
                input: 'IF [Sales] > 100 THEN "High ELSE "Low" END',
                expectedBehavior: 'should parse and provide diagnostics'
            },
            {
                name: 'unclosed single quote in CASE statement',
                input: 'CASE [Region] WHEN \'North THEN "Northern" ELSE "Other" END',
                expectedBehavior: 'should parse and provide diagnostics'
            },
            {
                name: 'mixed quote types',
                input: 'IF [Sales] > 100 THEN "High\' ELSE \'Low" END',
                expectedBehavior: 'should handle mixed quotes gracefully'
            },
            {
                name: 'string with escaped quotes',
                input: 'IF [Sales] > 100 THEN "Say \\"Hello\\" ELSE "Goodbye" END',
                expectedBehavior: 'should handle escaped quotes correctly'
            }
        ];

        test.each(unclosedStringCases)('$name', async ({ input, expectedBehavior }) => {
            const document = createTestDocument(input);
            
            // Should not throw an error
            expect(() => {
                const result = parseDocument(document);
                const diagnostics = getDiagnostics(document, result);
                
                // Should produce some symbols even with errors
                expect(result.symbols).toBeDefined();
                expect(Array.isArray(result.symbols)).toBe(true);
                
                // Should produce diagnostics for the error
                expect(diagnostics).toBeDefined();
                expect(Array.isArray(diagnostics)).toBe(true);
                
                // Should have at least one diagnostic for the unclosed string
                if (input.includes('THEN "High ELSE') || input.includes('WHEN \'North THEN')) {
                    expect(diagnostics.length).toBeGreaterThan(0);
                }
                
            }).not.toThrow();
        });

        test('LSP features should work with unclosed strings', async () => {
            const input = 'IF [Sales] > 100 THEN "High ELSE "Low" END';
            const document = createTestDocument(input);
            const parsedDocument = parseDocument(document);

            // Hover should not crash
            await expect(async () => {
                await provideHover(
                    { textDocument: { uri: document.uri }, position: { line: 0, character: 3 } },
                    document,
                    null
                );
            }).not.toThrow();

            // Completion should not crash
            await expect(async () => {
                await provideCompletion(
                    { textDocument: { uri: document.uri }, position: { line: 0, character: 10 } },
                    document,
                    parsedDocument,
                    null
                );
            }).not.toThrow();

            // Signature help should not crash
            expect(() => {
                buildSignatureHelp(document, { line: 0, character: 15 }, parsedDocument);
            }).not.toThrow();
        });
    });

    describe('Unclosed Brackets and Parentheses', () => {
        const unclosedBracketCases = [
            {
                name: 'unclosed field reference bracket',
                input: 'SUM([Sales)',
                expectedSymbols: 1 // Should still recognize SUM function
            },
            {
                name: 'unclosed function parenthesis',
                input: 'AVG([Profit) + COUNT([Orders)',
                expectedSymbols: 2 // Should recognize both functions
            },
            {
                name: 'unclosed LOD expression',
                input: '{FIXED [Customer] : SUM([Sales)',
                expectedSymbols: 1 // Should recognize the LOD structure
            },
            {
                name: 'nested unclosed brackets',
                input: 'IF SUM([Sales) > AVG([Profit) THEN "High" ELSE "Low" END',
                expectedSymbols: 3 // IF, SUM, AVG
            },
            {
                name: 'mixed bracket types',
                input: 'SUM([Sales]) + {FIXED [Customer] : AVG([Profit)',
                expectedSymbols: 2 // SUM and LOD expression
            }
        ];

        test.each(unclosedBracketCases)('$name', ({ input, expectedSymbols }) => {
            const document = createTestDocument(input);
            
            expect(() => {
                const result = parseDocument(document);
                const diagnostics = getDiagnostics(document, result);
                
                // Should parse without throwing
                expect(result.symbols).toBeDefined();
                expect(result.symbols.length).toBeGreaterThanOrEqual(expectedSymbols);
                
                // Should produce diagnostics for unclosed brackets
                expect(diagnostics.length).toBeGreaterThan(0);
                
                // Should identify the specific error type
                const hasUnclosedBracketError = diagnostics.some(d => 
                    d.message.toLowerCase().includes('unclosed') ||
                    d.message.toLowerCase().includes('bracket') ||
                    d.message.toLowerCase().includes('parenthesis')
                );
                expect(hasUnclosedBracketError).toBe(true);
                
            }).not.toThrow();
        });
    });

    describe('Invalid Characters and Syntax', () => {
        const invalidCharacterCases = [
            {
                name: 'invalid operator @',
                input: 'SUM([Sales]) @ AVG([Profit])',
                expectedError: 'invalid operator'
            },
            {
                name: 'invalid comment syntax #',
                input: 'IF [Sales] > 100 # THEN "High" ELSE "Low" END',
                expectedError: 'unexpected character'
            },
            {
                name: 'invalid modulo operator %',
                input: 'CASE [Region] % WHEN "North" THEN "Northern" ELSE "Other" END',
                expectedError: 'unexpected character'
            },
            {
                name: 'unicode characters',
                input: 'SUM([Sales]) + AVG([Profit]) × COUNT([Orders])',
                expectedError: 'unexpected character'
            },
            {
                name: 'control characters',
                input: 'SUM([Sales])\x00 + AVG([Profit])',
                expectedError: 'unexpected character'
            }
        ];

        test.each(invalidCharacterCases)('$name', ({ input, expectedError }) => {
            const document = createTestDocument(input);
            
            expect(() => {
                const result = parseDocument(document);
                const diagnostics = getDiagnostics(document, result);
                
                // Should not crash
                expect(result).toBeDefined();
                expect(diagnostics).toBeDefined();
                
                // Should produce diagnostics
                expect(diagnostics.length).toBeGreaterThan(0);
                
                // Should identify the error appropriately
                const hasExpectedError = diagnostics.some(d => 
                    d.message.toLowerCase().includes(expectedError.toLowerCase()) ||
                    d.message.toLowerCase().includes('invalid') ||
                    d.message.toLowerCase().includes('unexpected')
                );
                expect(hasExpectedError).toBe(true);
                
            }).not.toThrow();
        });
    });

    describe('Malformed Function Calls', () => {
        const malformedFunctionCases = [
            {
                name: 'function with no parameters',
                input: 'SUM()',
                expectedDiagnostics: 1
            },
            {
                name: 'function with too many parameters',
                input: 'SUM([Sales], [Profit], [Orders])',
                expectedDiagnostics: 1
            },
            {
                name: 'unknown function',
                input: 'UNKNOWN_FUNCTION([Sales])',
                expectedDiagnostics: 1
            },
            {
                name: 'nested aggregation without LOD',
                input: 'SUM(AVG([Sales]))',
                expectedDiagnostics: 1
            },
            {
                name: 'function with invalid parameter types',
                input: 'DATEPART("year", [Sales])',
                expectedDiagnostics: 1 // Sales is not a date field
            }
        ];

        test.each(malformedFunctionCases)('$name', ({ input, expectedDiagnostics }) => {
            const document = createTestDocument(input);
            
            expect(() => {
                const result = parseDocument(document);
                const diagnostics = getDiagnostics(document, result);
                
                // Should parse without crashing
                expect(result.symbols).toBeDefined();
                
                // Should produce expected number of diagnostics
                expect(diagnostics.length).toBeGreaterThanOrEqual(expectedDiagnostics);
                
                // Should still recognize function structure
                const hasFunctionSymbol = result.symbols.some(s => s.kind === 12); // Function kind
                expect(hasFunctionSymbol).toBe(true);
                
            }).not.toThrow();
        });
    });

    describe('Malformed Block Structures', () => {
        const malformedBlockCases = [
            {
                name: 'IF without END',
                input: 'IF [Sales] > 100 THEN "High" ELSE "Low"',
                expectedError: 'missing END'
            },
            {
                name: 'CASE without END',
                input: 'CASE [Region] WHEN "North" THEN "Northern" ELSE "Other"',
                expectedError: 'missing END'
            },
            {
                name: 'nested IF without proper END',
                input: 'IF [Sales] > 100 THEN IF [Profit] > 50 THEN "High" ELSE "Low" END',
                expectedError: 'missing END'
            },
            {
                name: 'extra END statements',
                input: 'IF [Sales] > 100 THEN "High" ELSE "Low" END END',
                expectedError: 'unexpected END'
            },
            {
                name: 'mismatched block keywords',
                input: 'IF [Sales] > 100 THEN "High" WHEN "North" THEN "Northern" END',
                expectedError: 'unexpected WHEN'
            }
        ];

        test.each(malformedBlockCases)('$name', ({ input, expectedError }) => {
            const document = createTestDocument(input);
            
            expect(() => {
                const result = parseDocument(document);
                const diagnostics = getDiagnostics(document, result);
                
                // Should not crash
                expect(result).toBeDefined();
                expect(diagnostics).toBeDefined();
                
                // Should produce diagnostics
                expect(diagnostics.length).toBeGreaterThan(0);
                
                // Should identify block structure issues
                const hasBlockError = diagnostics.some(d => 
                    d.message.toLowerCase().includes('end') ||
                    d.message.toLowerCase().includes('block') ||
                    d.message.toLowerCase().includes('missing') ||
                    d.message.toLowerCase().includes('unexpected')
                );
                expect(hasBlockError).toBe(true);
                
            }).not.toThrow();
        });
    });

    describe('Error Recovery with LSP Features', () => {
        test('formatting should handle malformed input gracefully', () => {
            const malformedInputs = [
                'IF [Sales] > 100 THEN "High ELSE "Low" END',
                'SUM([Sales) + AVG([Profit)',
                'UNKNOWN_FUNC([Sales]) @ [Profit]'
            ];

            malformedInputs.forEach(input => {
                const document = createTestDocument(input);
                
                expect(() => {
                    const formatted = format(document, { tabSize: 2, insertSpaces: true });
                    
                    // Should return some result (either formatted or original)
                    expect(formatted).toBeDefined();
                    expect(Array.isArray(formatted)).toBe(true);
                    
                }).not.toThrow();
            });
        });

        test('error recovery should provide meaningful information', () => {
            const complexMalformedInput = `
                IF [Sales] > SUM( THEN "High" ELSE "Low" END
                CASE [Region] WHEN "North" THEN {FIXED [Customer] : COUNT([Orders] ELSE "Other" END
                SUM([Sales) + AVG([Profit) * UNKNOWN_FUNC([Orders])
            `.trim();

            const document = createTestDocument(complexMalformedInput);
            
            expect(() => {
                const result = ErrorRecovery.parseWithErrorRecovery(document);
                
                // Should provide recovery information
                expect(result.recoveryInfo).toBeDefined();
                expect(result.recoveryInfo.totalErrors).toBeGreaterThan(0);
                expect(result.recoveryInfo.recoveredErrors).toBeGreaterThanOrEqual(0);
                
                // Should still produce some symbols
                expect(result.symbols.length).toBeGreaterThan(0);
                
                // Recovery rate should be reasonable
                const recoveryRate = result.recoveryInfo.recoveredErrors / result.recoveryInfo.totalErrors;
                expect(recoveryRate).toBeGreaterThanOrEqual(0);
                expect(recoveryRate).toBeLessThanOrEqual(1);
                
            }).not.toThrow();
        });
    });

    describe('Extreme Malformed Cases', () => {
        test('completely invalid syntax should not crash', () => {
            const extremeCases = [
                'IF THEN ELSE WHEN CASE END END END',
                '{ [ ( " \' } ] ) " \'',
                '@@@@@@@@@@@@@@@@@@@@',
                'NULL NULL NULL NULL NULL',
                '"""""""""""""""""""',
                '(((((((((((((((((((',
                'ENDENDENDENDENDENDEND'
            ];

            extremeCases.forEach(input => {
                const document = createTestDocument(input);
                
                expect(() => {
                    const result = parseDocument(document);
                    const diagnostics = getDiagnostics(document, result);
                    
                    // Should not crash
                    expect(result).toBeDefined();
                    expect(diagnostics).toBeDefined();
                    
                    // Should produce diagnostics
                    expect(diagnostics.length).toBeGreaterThan(0);
                    
                }).not.toThrow();
            });
        });

        test('mixed valid and invalid syntax should recover partially', () => {
            const mixedInput = `
                SUM([Sales]) + AVG([Profit])
                INVALID_SYNTAX_HERE @#$%^&*
                COUNT([Orders]) * 2
                IF [Region] = "North" THEN "Northern" ELSE "Other" END
                MORE_INVALID_STUFF ))))(((
                MAX([Discount])
            `.trim();

            const document = createTestDocument(mixedInput);
            
            expect(() => {
                const result = parseDocument(document);
                const diagnostics = getDiagnostics(document, result);
                
                // Should recognize valid parts
                expect(result.symbols.length).toBeGreaterThan(3); // At least SUM, AVG, COUNT, MAX
                
                // Should report errors for invalid parts
                expect(diagnostics.length).toBeGreaterThan(0);
                
                // Should have both valid symbols and error diagnostics
                const hasValidSymbols = result.symbols.some(s => 
                    s.name === 'SUM' || s.name === 'AVG' || s.name === 'COUNT' || s.name === 'MAX'
                );
                expect(hasValidSymbols).toBe(true);
                
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
    uri: string = 'test://malformed.twbl'
): TextDocument {
    return TextDocument.create(uri, 'tableau', version, content);
}