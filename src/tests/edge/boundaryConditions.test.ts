// src/tests/edge/boundaryConditions.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseDocument } from '../../documentModel';
import { getDiagnostics } from '../../diagnosticsProvider';
import { provideHover } from '../../hoverProvider';
import { provideCompletion } from '../../completionProvider';
import { buildSignatureHelp } from '../../signatureProvider';
import { format } from '../../format';
import { globalMemoryManager } from '../../memoryManager';
import { IncrementalParser } from '../../incrementalParser';

/**
 * R8.4: Boundary condition tests
 * 
 * This test suite validates that the LSP handles boundary conditions correctly,
 * including empty inputs, extremely large inputs, and edge cases in data sizes.
 */

describe('Boundary Condition Tests', () => {
    describe('Empty and Minimal Inputs', () => {
        test('empty document should be handled gracefully', () => {
            const document = createTestDocument('');
            
            expect(() => {
                const result = parseDocument(document);
                const diagnostics = getDiagnostics(document, result);
                
                // Should not crash
                expect(result).toBeDefined();
                expect(result.symbols).toBeDefined();
                expect(result.symbols.length).toBe(0);
                
                // Should not produce diagnostics for empty document
                expect(diagnostics.length).toBe(0);
                
            }).not.toThrow();
        });

        test('whitespace-only document should be handled gracefully', () => {
            const whitespaceInputs = [
                ' ',
                '   ',
                '\t',
                '\n',
                '\r\n',
                '   \t  \n  \r\n  ',
                '\u00A0\u2000\u2001\u2002\u2003' // Various Unicode spaces
            ];

            whitespaceInputs.forEach(input => {
                const document = createTestDocument(input);
                
                expect(() => {
                    const result = parseDocument(document);
                    const diagnostics = getDiagnostics(document, result);
                    
                    expect(result.symbols.length).toBe(0);
                    expect(diagnostics.length).toBe(0);
                    
                }).not.toThrow();
            });
        });

        test('single character inputs should be handled', () => {
            const singleCharInputs = [
                'A', 'Z', '1', '9', '(', ')', '[', ']', '{', '}', 
                '"', "'", '+', '-', '*', '/', '=', '<', '>', '!',
                '@', '#', '$', '%', '^', '&', '|', '\\', '?'
            ];

            singleCharInputs.forEach(input => {
                const document = createTestDocument(input);
                
                expect(() => {
                    const result = parseDocument(document);
                    const diagnostics = getDiagnostics(document, result);
                    
                    // Should not crash
                    expect(result).toBeDefined();
                    expect(diagnostics).toBeDefined();
                    
                }).not.toThrow();
            });
        });

        test('LSP features should handle empty documents', async () => {
            const document = createTestDocument('');
            const parsedDocument = parseDocument(document);

            // Hover on empty document
            await expect(async () => {
                await provideHover(
                    { textDocument: { uri: document.uri }, position: { line: 0, character: 0 } },
                    document,
                    null
                );
            }).not.toThrow();

            // Completion on empty document
            await expect(async () => {
                await provideCompletion(
                    { textDocument: { uri: document.uri }, position: { line: 0, character: 0 } },
                    document,
                    parsedDocument,
                    null
                );
            }).not.toThrow();

            // Signature help on empty document
            expect(() => {
                buildSignatureHelp(document, { line: 0, character: 0 }, parsedDocument);
            }).not.toThrow();

            // Formatting empty document
            expect(() => {
                format(document, { tabSize: 2, insertSpaces: true });
            }).not.toThrow();
        });
    });

    describe('Extremely Large Inputs', () => {
        test('very long single line should be handled', () => {
            // Create a line with 10,000 characters
            const longExpression = 'SUM([Sales])' + ' + AVG([Profit])'.repeat(1000);
            const document = createTestDocument(longExpression);
            
            expect(() => {
                const startTime = performance.now();
                const result = parseDocument(document);
                const endTime = performance.now();
                
                // Should complete within reasonable time (< 1 second)
                expect(endTime - startTime).toBeLessThan(1000);
                
                // Should produce symbols
                expect(result.symbols.length).toBeGreaterThan(0);
                
                // Should handle the long line
                expect(result.symbols.length).toBeGreaterThan(100);
                
            }).not.toThrow();
        });

        test('document with many lines should be handled', () => {
            // Create a document with 1000 lines
            const lines = Array(1000).fill(0).map((_, i) => `SUM([Sales${i}])`);
            const document = createTestDocument(lines.join('\n'));
            
            expect(() => {
                const startTime = performance.now();
                const result = parseDocument(document);
                const endTime = performance.now();
                
                // Should complete within reasonable time (< 2 seconds)
                expect(endTime - startTime).toBeLessThan(2000);
                
                // Should produce symbols for each line
                expect(result.symbols.length).toBe(1000);
                
                // Should have correct line count
                expect(document.lineCount).toBe(1000);
                
            }).not.toThrow();
        });

        test('deeply nested expressions should be handled', () => {
            // Create deeply nested IF statements (20 levels)
            let nestedExpression = 'SUM([Sales])';
            for (let i = 0; i < 20; i++) {
                nestedExpression = `IF [Sales${i}] > ${i * 100} THEN ${nestedExpression} ELSE AVG([Profit${i}]) END`;
            }
            
            const document = createTestDocument(nestedExpression);
            
            expect(() => {
                const result = parseDocument(document);
                const diagnostics = getDiagnostics(document, result);
                
                // Should parse without crashing
                expect(result.symbols.length).toBeGreaterThan(20);
                
                // Should warn about excessive nesting
                const hasNestingWarning = diagnostics.some(d => 
                    d.message.toLowerCase().includes('nesting') ||
                    d.message.toLowerCase().includes('depth')
                );
                expect(hasNestingWarning).toBe(true);
                
            }).not.toThrow();
        });

        test('maximum function parameter nesting should be handled', () => {
            // Create deeply nested function calls
            let nestedFunctions = '[Sales]';
            for (let i = 0; i < 50; i++) {
                const functions = ['SUM', 'AVG', 'MAX', 'MIN', 'COUNT'];
                const func = functions[i % functions.length];
                nestedFunctions = `${func}(${nestedFunctions})`;
            }
            
            const document = createTestDocument(nestedFunctions);
            
            expect(() => {
                const result = parseDocument(document);
                const diagnostics = getDiagnostics(document, result);
                
                // Should parse without crashing
                expect(result.symbols.length).toBeGreaterThan(10);
                
                // Should warn about excessive function nesting
                const hasNestingWarning = diagnostics.some(d => 
                    d.message.toLowerCase().includes('nesting') ||
                    d.message.toLowerCase().includes('function')
                );
                expect(hasNestingWarning).toBe(true);
                
            }).not.toThrow();
        });
    });

    describe('Memory Boundary Conditions', () => {
        test('document approaching memory limit should be handled', () => {
            // Create a document that approaches but doesn't exceed the 50MB limit
            const largeContent = 'A'.repeat(45 * 1024 * 1024); // 45MB
            const expression = `IF LEN("${largeContent}") > 0 THEN "Large" ELSE "Small" END`;
            const document = createTestDocument(expression);
            
            expect(() => {
                const memoryBefore = globalMemoryManager.getMemoryStats().usedMemoryMB;
                const result = parseDocument(document);
                const memoryAfter = globalMemoryManager.getMemoryStats().usedMemoryMB;
                
                // Should parse successfully
                expect(result.symbols.length).toBeGreaterThan(0);
                
                // Memory usage should be tracked
                const memoryDelta = memoryAfter - memoryBefore;
                expect(memoryDelta).toBeGreaterThan(0);
                
                // Should not exceed the per-document limit significantly
                expect(memoryDelta).toBeLessThan(60); // Allow some overhead
                
            }).not.toThrow();
        });

        test('multiple large documents should trigger memory management', () => {
            const documents: TextDocument[] = [];
            
            expect(() => {
                // Create multiple moderately large documents
                for (let i = 0; i < 10; i++) {
                    const content = `SUM([Sales${i}])`.repeat(10000);
                    const doc = createTestDocument(content, 1, `test://large${i}.twbl`);
                    documents.push(doc);
                    
                    globalMemoryManager.markDocumentActive(doc.uri);
                    parseDocument(doc);
                }
                
                const memoryStats = globalMemoryManager.getMemoryStats();
                
                // Should track all documents
                expect(memoryStats.documentsInCache).toBe(10);
                
                // Should have reasonable memory usage
                expect(memoryStats.cacheMemoryMB).toBeGreaterThan(0);
                
                // Clean up
                documents.forEach(doc => {
                    globalMemoryManager.markDocumentInactive(doc.uri);
                });
                
            }).not.toThrow();
        });
    });

    describe('Position and Range Boundary Conditions', () => {
        test('positions at document boundaries should be handled', async () => {
            const content = 'SUM([Sales])';
            const document = createTestDocument(content);
            const parsedDocument = parseDocument(document);
            
            const boundaryPositions = [
                { line: 0, character: 0 }, // Start of document
                { line: 0, character: content.length }, // End of document
                { line: 0, character: content.length + 1 }, // Beyond end
                { line: 1, character: 0 }, // Next line (doesn't exist)
                { line: -1, character: 0 }, // Negative line
                { line: 0, character: -1 } // Negative character
            ];
            
            for (const position of boundaryPositions) {
                // Hover should handle boundary positions
                await expect(async () => {
                    await provideHover(
                        { textDocument: { uri: document.uri }, position },
                        document,
                        null
                    );
                }).not.toThrow();
                
                // Completion should handle boundary positions
                await expect(async () => {
                    await provideCompletion(
                        { textDocument: { uri: document.uri }, position },
                        document,
                        parsedDocument,
                        null
                    );
                }).not.toThrow();
                
                // Signature help should handle boundary positions
                expect(() => {
                    buildSignatureHelp(document, position, parsedDocument);
                }).not.toThrow();
            }
        });

        test('multi-line document boundary positions should be handled', async () => {
            const content = `SUM([Sales])
AVG([Profit])
COUNT([Orders])`;
            const document = createTestDocument(content);
            const parsedDocument = parseDocument(document);
            
            const boundaryPositions = [
                { line: 0, character: 0 }, // Start of first line
                { line: 0, character: 12 }, // End of first line
                { line: 1, character: 0 }, // Start of second line
                { line: 2, character: 14 }, // End of last line
                { line: 3, character: 0 }, // Beyond last line
                { line: 1, character: 100 } // Beyond line end
            ];
            
            for (const position of boundaryPositions) {
                await expect(async () => {
                    await provideHover(
                        { textDocument: { uri: document.uri }, position },
                        document,
                        null
                    );
                }).not.toThrow();
            }
        });
    });

    describe('Unicode and Special Character Boundaries', () => {
        test('unicode characters should be handled correctly', () => {
            const unicodeInputs = [
                'SUM([Sales]) + "Hello 世界"', // Chinese characters
                'IF [Region] = "Café" THEN "French" ELSE "Other" END', // Accented characters
                'COUNT([Orders]) /* Comment with émojis 🚀📊 */', // Emojis
                'AVG([Profit]) // Comment with Ω∑∏∆', // Mathematical symbols
                '"String with \\u0041\\u0042\\u0043"', // Unicode escapes
                'MAX([Sales]) + "Text with \\n\\t\\r"' // Escape sequences
            ];
            
            unicodeInputs.forEach(input => {
                const document = createTestDocument(input);
                
                expect(() => {
                    const result = parseDocument(document);
                    const diagnostics = getDiagnostics(document, result);
                    
                    // Should parse without issues
                    expect(result.symbols.length).toBeGreaterThan(0);
                    
                    // Should handle unicode correctly
                    expect(result).toBeDefined();
                    
                }).not.toThrow();
            });
        });

        test('very long unicode strings should be handled', () => {
            // Create a string with 1000 unicode characters
            const unicodeString = '世界'.repeat(1000);
            const expression = `IF LEN("${unicodeString}") > 0 THEN "Unicode" ELSE "ASCII" END`;
            const document = createTestDocument(expression);
            
            expect(() => {
                const result = parseDocument(document);
                
                // Should parse successfully
                expect(result.symbols.length).toBeGreaterThan(0);
                
                // Should handle the long unicode string
                expect(result).toBeDefined();
                
            }).not.toThrow();
        });
    });

    describe('Incremental Parsing Boundary Conditions', () => {
        test('incremental parsing with minimal changes should be efficient', () => {
            const originalContent = 'SUM([Sales]) + AVG([Profit])';
            let document = createTestDocument(originalContent);
            
            // Initial parse
            IncrementalParser.parseDocumentIncremental(document);
            
            // Make minimal change
            const newContent = 'SUM([Sales]) + AVG([Profit]) + COUNT([Orders])';
            document = createTestDocument(newContent, 2, document.uri);
            
            expect(() => {
                const startTime = performance.now();
                const result = IncrementalParser.parseDocumentIncremental(document);
                const endTime = performance.now();
                
                // Should be very fast for incremental parsing
                expect(endTime - startTime).toBeLessThan(50);
                
                // Should produce correct symbols
                expect(result.symbols.length).toBe(3); // SUM, AVG, COUNT
                
            }).not.toThrow();
        });

        test('incremental parsing with complete document replacement should work', () => {
            const originalContent = 'SUM([Sales])';
            let document = createTestDocument(originalContent);
            
            // Initial parse
            IncrementalParser.parseDocumentIncremental(document);
            
            // Complete replacement
            const newContent = 'IF [Region] = "North" THEN AVG([Profit]) ELSE MAX([Discount]) END';
            document = createTestDocument(newContent, 2, document.uri);
            
            expect(() => {
                const result = IncrementalParser.parseDocumentIncremental(document);
                
                // Should handle complete replacement
                expect(result.symbols.length).toBeGreaterThan(2);
                
                // Should recognize new structure
                const hasIfStatement = result.symbols.some(s => s.name === 'IF');
                expect(hasIfStatement).toBe(true);
                
            }).not.toThrow();
        });
    });

    describe('Performance Boundary Conditions', () => {
        test('response time should meet requirements for small documents', async () => {
            const smallDocument = createTestDocument('SUM([Sales]) + AVG([Profit])');
            
            // Test parsing performance
            const parseStart = performance.now();
            const result = parseDocument(smallDocument);
            const parseEnd = performance.now();
            
            // Should meet 200ms requirement for small documents
            expect(parseEnd - parseStart).toBeLessThan(200);
            
            // Test LSP feature performance
            const hoverStart = performance.now();
            await provideHover(
                { textDocument: { uri: smallDocument.uri }, position: { line: 0, character: 1 } },
                smallDocument,
                null
            );
            const hoverEnd = performance.now();
            
            // Hover should be fast
            expect(hoverEnd - hoverStart).toBeLessThan(50);
        });

        test('documents under 10KB should meet performance requirements', async () => {
            // Create a document just under 10KB
            const content = 'SUM([Sales]) + AVG([Profit])'.repeat(300); // ~8.4KB
            const document = createTestDocument(content);
            
            expect(document.getText().length).toBeLessThan(10 * 1024);
            
            const startTime = performance.now();
            const result = parseDocument(document);
            const endTime = performance.now();
            
            // Should meet 200ms requirement
            expect(endTime - startTime).toBeLessThan(200);
            
            // Should produce correct number of symbols
            expect(result.symbols.length).toBe(600); // 300 SUM + 300 AVG
        });
    });
});

/**
 * Helper function to create test documents
 */
function createTestDocument(
    content: string, 
    version: number = 1, 
    uri: string = 'test://boundary.twbl'
): TextDocument {
    return TextDocument.create(uri, 'tableau', version, content);
}