// src/tests/integration/lspFeatureIntegration.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range, CompletionItem, Hover, SignatureHelp, Diagnostic } from 'vscode-languageserver';
import { parseDocument } from '../../documentModel';
import { getDiagnostics } from '../../diagnosticsProvider';
import { provideHover } from '../../hoverProvider';
import { provideCompletion } from '../../completionProvider';
import { buildSignatureHelp } from '../../signatureProvider';
import { format } from '../../format';
import { provideSemanticTokens } from '../../semanticTokensProvider';
import { IncrementalParser } from '../../incrementalParser';
import { FieldParser } from '../../fieldParser';
import { globalMemoryManager } from '../../memoryManager';
import { globalDebouncer } from '../../requestDebouncer';

/**
 * R8.2: Comprehensive LSP feature integration tests
 * 
 * These tests verify that all LSP features work together correctly in real-world scenarios,
 * including error handling, performance, and feature interactions.
 */

describe('LSP Feature Integration Tests', () => {
    let fieldParser: FieldParser | null = null;
    
    beforeAll(() => {
        // Initialize field parser if available
        const fieldDefinitionPath = FieldParser.findDefinitionFile(__dirname);
        if (fieldDefinitionPath) {
            fieldParser = new FieldParser(fieldDefinitionPath);
        }
    });
    
    beforeEach(() => {
        // Clear caches before each test
        IncrementalParser.clearAllCache();
        globalMemoryManager.markDocumentInactive('test://integration.twbl');
    });
    
    afterEach(async () => {
        // Clean up after each test
        await globalDebouncer.flushAllRequests();
    });
    
    describe('End-to-End LSP Feature Pipeline', () => {
        it('should handle complete LSP workflow for simple calculation', async () => {
            const content = `
// Simple sales calculation
IF SUM([Sales]) > 1000 THEN
    "High Sales"
ELSE
    "Low Sales"
END
            `.trim();
            
            const document = createTestDocument(content);
            
            // Step 1: Parse document
            const parsedDocument = parseDocument(document);
            expect(parsedDocument.symbols.length).toBeGreaterThan(0);
            
            // Step 2: Get diagnostics
            const diagnostics = getDiagnostics(document, parsedDocument);
            expect(Array.isArray(diagnostics)).toBe(true);
            
            // Step 3: Test hover at function position
            const hoverPosition: Position = { line: 1, character: 3 }; // Over "SUM"
            const hoverResult = await provideHover(
                { textDocument: { uri: document.uri }, position: hoverPosition },
                document,
                fieldParser
            );
            expect(hoverResult).toBeDefined();
            
            // Step 4: Test completion
            const completionPosition: Position = { line: 1, character: 7 }; // After "SUM("
            const completionResult = await provideCompletion(
                { textDocument: { uri: document.uri }, position: completionPosition },
                document,
                parsedDocument,
                fieldParser
            );
            expect(completionResult).toBeDefined();
            expect(completionResult?.items).toBeDefined();
            
            // Step 5: Test signature help
            const signaturePosition: Position = { line: 1, character: 8 }; // Inside SUM()
            const signatureResult = buildSignatureHelp(document, signaturePosition, parsedDocument);
            expect(signatureResult).toBeDefined();
            
            // Step 6: Test formatting
            const formatResult = format(document, { tabSize: 2, insertSpaces: true });
            expect(Array.isArray(formatResult)).toBe(true);
            
            // Step 7: Test semantic tokens
            const semanticTokens = provideSemanticTokens(document, parsedDocument);
            expect(semanticTokens).toBeDefined();
            expect(semanticTokens.data).toBeDefined();
        });
        
        it('should handle complex nested calculation with LOD expressions', async () => {
            const content = `
// Complex calculation with LOD
{FIXED [Customer] : 
    IF SUM([Sales]) > AVG({FIXED [Region] : SUM([Sales])}) THEN
        CASE [Category]
        WHEN "Furniture" THEN SUM([Profit]) * 1.1
        WHEN "Technology" THEN SUM([Profit]) * 1.2
        ELSE SUM([Profit])
        END
    ELSE
        0
    END
}
            `.trim();
            
            const document = createTestDocument(content);
            
            // Parse and validate structure
            const parsedDocument = parseDocument(document);
            expect(parsedDocument.symbols.length).toBeGreaterThan(5);
            
            // Check for LOD expression symbols
            const lodSymbols = parsedDocument.symbols.filter(s => s.name === 'FIXED');
            expect(lodSymbols.length).toBeGreaterThan(0);
            
            // Test diagnostics for complex expression
            const diagnostics = getDiagnostics(document, parsedDocument);
            const errors = diagnostics.filter(d => d.severity === 1); // Error severity
            expect(errors.length).toBe(0); // Should have no errors
            
            // Test hover on nested functions
            const positions = [
                { line: 2, character: 7 }, // SUM in IF condition
                { line: 2, character: 20 }, // AVG function
                { line: 4, character: 30 }, // SUM in CASE branch
            ];
            
            for (const position of positions) {
                const hoverResult = await provideHover(
                    { textDocument: { uri: document.uri }, position },
                    document,
                    fieldParser
                );
                expect(hoverResult).toBeDefined();
            }
        });
        
        it('should handle error recovery and still provide LSP features', async () => {
            const content = `
// Calculation with intentional errors
IF SUM([Sales] > 1000 THEN
    UNKNOWN_FUNCTION([Profit])
ELSEIF AVG([Sales]) > 500 THEN
    COUNT([Orders]
ELSE
    "Low"
END
            `.trim();
            
            const document = createTestDocument(content);
            
            // Parse with error recovery
            const parsedDocument = parseDocument(document);
            expect(parsedDocument.symbols.length).toBeGreaterThan(0);
            
            // Should still find valid symbols despite errors
            const validSymbols = ['IF', 'SUM', 'AVG', 'COUNT', 'ELSEIF', 'ELSE', 'END'];
            const foundSymbols = validSymbols.filter(symbol =>
                parsedDocument.symbols.some(s => s.name === symbol)
            );
            expect(foundSymbols.length).toBeGreaterThan(4);
            
            // Diagnostics should report errors
            const diagnostics = getDiagnostics(document, parsedDocument);
            const errors = diagnostics.filter(d => d.severity === 1);
            expect(errors.length).toBeGreaterThan(0);
            
            // Hover should still work on valid functions
            const hoverPosition: Position = { line: 1, character: 3 }; // Over "SUM"
            const hoverResult = await provideHover(
                { textDocument: { uri: document.uri }, position: hoverPosition },
                document,
                fieldParser
            );
            expect(hoverResult).toBeDefined();
            
            // Completion should still work
            const completionPosition: Position = { line: 3, character: 10 }; // After "COUNT("
            const completionResult = await provideCompletion(
                { textDocument: { uri: document.uri }, position: completionPosition },
                document,
                parsedDocument,
                fieldParser
            );
            expect(completionResult).toBeDefined();
        });
    });
    
    describe('Feature Interaction Tests', () => {
        it('should handle incremental parsing with LSP features', async () => {
            const initialContent = `SUM([Sales])`;
            const document1 = createTestDocument(initialContent, 1);
            
            // Initial parse
            const result1 = IncrementalParser.parseDocumentIncremental(document1);
            expect(result1.symbols.length).toBe(1);
            
            // Test hover on initial content
            const hoverResult1 = await provideHover(
                { textDocument: { uri: document1.uri }, position: { line: 0, character: 1 } },
                document1,
                fieldParser
            );
            expect(hoverResult1).toBeDefined();
            
            // Modify document
            const modifiedContent = `SUM([Sales]) + AVG([Profit])`;
            const document2 = createTestDocument(modifiedContent, 2);
            
            // Incremental parse
            const result2 = IncrementalParser.parseDocumentIncremental(document2);
            expect(result2.symbols.length).toBe(2);
            
            // Test hover on new content
            const hoverResult2 = await provideHover(
                { textDocument: { uri: document2.uri }, position: { line: 0, character: 17 } },
                document2,
                fieldParser
            );
            expect(hoverResult2).toBeDefined();
            
            // Test completion after modification
            const completionResult = await provideCompletion(
                { textDocument: { uri: document2.uri }, position: { line: 0, character: 25 } },
                document2,
                result2,
                fieldParser
            );
            expect(completionResult).toBeDefined();
        });
        
        it('should handle formatting with subsequent LSP features', async () => {
            const unformattedContent = `IF[Sales]>1000THEN"High"ELSE"Low"END`;
            const document = createTestDocument(unformattedContent);
            
            // Format document
            const formatEdits = format(document, { tabSize: 2, insertSpaces: true });
            expect(formatEdits.length).toBeGreaterThan(0);
            
            // Simulate applying format edits
            const formattedContent = `IF [Sales] > 1000 THEN "High" ELSE "Low" END`;
            const formattedDocument = createTestDocument(formattedContent);
            
            // Parse formatted document
            const parsedDocument = parseDocument(formattedDocument);
            expect(parsedDocument.symbols.length).toBeGreaterThan(0);
            
            // Test LSP features on formatted document
            const hoverResult = await provideHover(
                { textDocument: { uri: formattedDocument.uri }, position: { line: 0, character: 3 } },
                formattedDocument,
                fieldParser
            );
            expect(hoverResult).toBeDefined();
            
            const completionResult = await provideCompletion(
                { textDocument: { uri: formattedDocument.uri }, position: { line: 0, character: 10 } },
                formattedDocument,
                parsedDocument,
                fieldParser
            );
            expect(completionResult).toBeDefined();
        });
        
        it('should handle memory management during intensive LSP operations', async () => {
            const documents: TextDocument[] = [];
            
            // Create multiple documents
            for (let i = 0; i < 20; i++) {
                const content = `
// Document ${i}
IF SUM([Sales${i}]) > ${i * 1000} THEN
    AVG([Profit${i}]) * ${i + 1}
ELSE
    COUNT([Orders${i}])
END
                `.trim();
                
                const document = createTestDocument(content, 1, `test://doc${i}.twbl`);
                documents.push(document);
                
                // Mark as active for memory management
                globalMemoryManager.markDocumentActive(document.uri);
                
                // Parse document
                const parsedDocument = parseDocument(document);
                expect(parsedDocument.symbols.length).toBeGreaterThan(0);
                
                // Test LSP features
                await provideHover(
                    { textDocument: { uri: document.uri }, position: { line: 1, character: 3 } },
                    document,
                    fieldParser
                );
                
                await provideCompletion(
                    { textDocument: { uri: document.uri }, position: { line: 1, character: 10 } },
                    document,
                    parsedDocument,
                    fieldParser
                );
            }
            
            // Check memory usage
            const memoryStats = globalMemoryManager.getMemoryStats();
            expect(memoryStats.documentsInCache).toBeGreaterThan(0);
            
            // Mark documents as inactive
            documents.forEach(doc => {
                globalMemoryManager.markDocumentInactive(doc.uri);
            });
            
            // Force cleanup if needed
            if (!globalMemoryManager.isMemoryUsageHealthy()) {
                const cleanupStats = await globalMemoryManager.forceCleanup('normal');
                expect(cleanupStats.documentsRemoved).toBeGreaterThan(0);
            }
        });
    });
    
    describe('Real-World Tableau Scenarios', () => {
        it('should handle sales performance dashboard calculation', async () => {
            const content = `
// Sales Performance Dashboard
IF ATTR([Region]) = "North" THEN
    // North region specific logic
    CASE [Product Category]
    WHEN "Electronics" THEN
        IF SUM([Sales]) > 100000 THEN
            (SUM([Profit]) / SUM([Sales])) * 100
        ELSE
            0
        END
    WHEN "Clothing" THEN
        {FIXED [Customer] : SUM([Sales])} / 
        {FIXED [Region] : SUM([Sales])}
    ELSE
        AVG([Profit Ratio])
    END
ELSEIF ATTR([Region]) = "South" THEN
    // South region calculation
    WINDOW_SUM(SUM([Sales])) / WINDOW_SUM(SUM([Sales]), FIRST(), LAST())
ELSE
    // Default calculation
    RANK(SUM([Sales]), 'desc')
END
            `.trim();
            
            const document = createTestDocument(content);
            
            // Parse complex calculation
            const parsedDocument = parseDocument(document);
            expect(parsedDocument.symbols.length).toBeGreaterThan(10);
            
            // Verify key Tableau functions are recognized
            const tableauFunctions = ['ATTR', 'SUM', 'FIXED', 'WINDOW_SUM', 'RANK'];
            const foundFunctions = tableauFunctions.filter(func =>
                parsedDocument.symbols.some(s => s.name === func)
            );
            expect(foundFunctions.length).toBeGreaterThan(3);
            
            // Test diagnostics
            const diagnostics = getDiagnostics(document, parsedDocument);
            const errors = diagnostics.filter(d => d.severity === 1);
            expect(errors.length).toBe(0); // Should be error-free
            
            // Test hover on various functions
            const testPositions = [
                { line: 1, character: 3 }, // ATTR
                { line: 6, character: 12 }, // SUM
                { line: 11, character: 9 }, // FIXED
                { line: 16, character: 4 }, // WINDOW_SUM
                { line: 19, character: 4 }, // RANK
            ];
            
            for (const position of testPositions) {
                const hoverResult = await provideHover(
                    { textDocument: { uri: document.uri }, position },
                    document,
                    fieldParser
                );
                expect(hoverResult).toBeDefined();
            }
        });
        
        it('should handle customer segmentation with LOD expressions', async () => {
            const content = `
// Customer Segmentation Analysis
{FIXED [Customer ID] : 
    IF SUM([Sales]) > {FIXED : AVG({FIXED [Customer ID] : SUM([Sales])})} * 2 THEN
        "High Value"
    ELSEIF SUM([Sales]) > {FIXED : AVG({FIXED [Customer ID] : SUM([Sales])})} THEN
        "Medium Value"
    ELSE
        "Low Value"
    END
}
            `.trim();
            
            const document = createTestDocument(content);
            
            // Parse nested LOD expressions
            const parsedDocument = parseDocument(document);
            expect(parsedDocument.symbols.length).toBeGreaterThan(5);
            
            // Verify LOD expressions are parsed correctly
            const lodSymbols = parsedDocument.symbols.filter(s => s.name === 'FIXED');
            expect(lodSymbols.length).toBeGreaterThan(2);
            
            // Test signature help in nested context
            const signaturePosition: Position = { line: 2, character: 15 }; // Inside nested SUM
            const signatureResult = buildSignatureHelp(document, signaturePosition, parsedDocument);
            expect(signatureResult).toBeDefined();
            
            // Test completion in LOD context
            const completionPosition: Position = { line: 2, character: 20 }; // After SUM(
            const completionResult = await provideCompletion(
                { textDocument: { uri: document.uri }, position: completionPosition },
                document,
                parsedDocument,
                fieldParser
            );
            expect(completionResult).toBeDefined();
        });
        
        it('should handle time series calculation with table calculations', async () => {
            const content = `
// Year-over-Year Growth Analysis
(SUM([Sales]) - LOOKUP(SUM([Sales]), -12)) / LOOKUP(SUM([Sales]), -12) * 100
            `.trim();
            
            const document = createTestDocument(content);
            
            // Parse table calculation
            const parsedDocument = parseDocument(document);
            expect(parsedDocument.symbols.length).toBeGreaterThan(2);
            
            // Verify table calculation functions
            const tableCalcFunctions = ['LOOKUP'];
            const foundTableCalcs = tableCalcFunctions.filter(func =>
                parsedDocument.symbols.some(s => s.name === func)
            );
            expect(foundTableCalcs.length).toBeGreaterThan(0);
            
            // Test hover on LOOKUP function
            const hoverResult = await provideHover(
                { textDocument: { uri: document.uri }, position: { line: 0, character: 15 } },
                document,
                fieldParser
            );
            expect(hoverResult).toBeDefined();
            
            // Test signature help for LOOKUP
            const signatureResult = buildSignatureHelp(document, { line: 0, character: 22 }, parsedDocument);
            expect(signatureResult).toBeDefined();
        });
    });
    
    describe('Performance Integration Tests', () => {
        it('should maintain performance with large documents', async () => {
            const largeContent = generateLargeTableauCalculation(100);
            const document = createTestDocument(largeContent);
            
            // Measure parsing performance
            const parseStart = performance.now();
            const parsedDocument = parseDocument(document);
            const parseEnd = performance.now();
            
            expect(parseEnd - parseStart).toBeLessThan(1000); // Should parse within 1 second
            expect(parsedDocument.symbols.length).toBeGreaterThan(50);
            
            // Measure diagnostics performance
            const diagStart = performance.now();
            const diagnostics = getDiagnostics(document, parsedDocument);
            const diagEnd = performance.now();
            
            expect(diagEnd - diagStart).toBeLessThan(500); // Should complete within 500ms
            
            // Measure hover performance
            const hoverStart = performance.now();
            await provideHover(
                { textDocument: { uri: document.uri }, position: { line: 10, character: 5 } },
                document,
                fieldParser
            );
            const hoverEnd = performance.now();
            
            expect(hoverEnd - hoverStart).toBeLessThan(100); // Should respond within 100ms
        });
        
        it('should handle concurrent LSP requests efficiently', async () => {
            const content = `
IF SUM([Sales]) > 1000 THEN
    AVG([Profit])
ELSE
    COUNT([Orders])
END
            `.trim();
            
            const document = createTestDocument(content);
            const parsedDocument = parseDocument(document);
            
            // Create multiple concurrent requests
            const promises = [
                provideHover(
                    { textDocument: { uri: document.uri }, position: { line: 1, character: 3 } },
                    document,
                    fieldParser
                ),
                provideCompletion(
                    { textDocument: { uri: document.uri }, position: { line: 1, character: 10 } },
                    document,
                    parsedDocument,
                    fieldParser
                ),
                buildSignatureHelp(document, { line: 1, character: 8 }, parsedDocument),
                getDiagnostics(document, parsedDocument),
                format(document, { tabSize: 2, insertSpaces: true })
            ];
            
            // Execute all requests concurrently
            const start = performance.now();
            const results = await Promise.all(promises);
            const end = performance.now();
            
            // All requests should complete
            expect(results.length).toBe(5);
            expect(end - start).toBeLessThan(500); // Should complete within 500ms
            
            // Verify results
            expect(results[0]).toBeDefined(); // Hover
            expect(results[1]).toBeDefined(); // Completion
            expect(results[2]).toBeDefined(); // Signature help
            expect(Array.isArray(results[3])).toBe(true); // Diagnostics
            expect(Array.isArray(results[4])).toBe(true); // Format edits
        });
    });
});

/**
 * Helper function to create test documents
 */
function createTestDocument(
    content: string,
    version: number = 1,
    uri: string = 'test://integration.twbl'
): TextDocument {
    return TextDocument.create(uri, 'tableau', version, content);
}

/**
 * Generate a large Tableau calculation for performance testing
 */
function generateLargeTableauCalculation(lines: number): string {
    const calculations: string[] = [];
    
    for (let i = 0; i < lines; i++) {
        if (i % 10 === 0) {
            calculations.push(`// Section ${Math.floor(i / 10) + 1}`);
        }
        
        const functions = ['SUM', 'AVG', 'COUNT', 'MAX', 'MIN'];
        const fields = ['Sales', 'Profit', 'Orders', 'Quantity', 'Discount'];
        const operators = ['>', '<', '>=', '<=', '='];
        
        const func = functions[i % functions.length];
        const field = fields[i % fields.length];
        const operator = operators[i % operators.length];
        const value = (i + 1) * 100;
        
        if (i % 5 === 0) {
            calculations.push(`IF ${func}([${field}]) ${operator} ${value} THEN`);
            calculations.push(`    "High ${field}"`);
            calculations.push(`ELSE`);
            calculations.push(`    "Low ${field}"`);
            calculations.push(`END`);
        } else {
            calculations.push(`${func}([${field}${i}])`);
        }
    }
    
    return calculations.join('\n');
}