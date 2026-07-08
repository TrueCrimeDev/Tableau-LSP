// src/tests/unit/signatureProvider.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, SignatureHelp } from 'vscode-languageserver';
import { buildSignatureHelp, SignaturePerformanceAPI } from '../../signatureProvider.js';
import { parsedDocumentCache } from '../../common.js';
import { IncrementalParser } from '../../incrementalParser.js';

describe('Signature Help Provider', () => {
    beforeEach(() => {
        // Clear cache. All test documents reuse the same URI/version, so the
        // signature provider's own URI-keyed caches must also be cleared to
        // avoid one test's symbol index leaking into the next.
        parsedDocumentCache.clear();
        SignaturePerformanceAPI.clearCaches();
    });
    
    describe('Function Signature Help', () => {
        it('should provide signature help for SUM function', async () => {
            const document = createTestDocument('SUM(');
            const position: Position = { line: 0, character: 4 }; // After opening parenthesis
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            expect(signatureHelp?.signatures).toBeDefined();
            expect(signatureHelp?.signatures.length).toBeGreaterThan(0);
            
            const signature = signatureHelp?.signatures[0];
            expect(signature?.label).toContain('SUM');
            expect(signature?.parameters).toBeDefined();
            expect(signature?.parameters?.length).toBeGreaterThan(0);
        });
        
        it('should provide signature help for AVG function', async () => {
            const document = createTestDocument('AVG([Sales]');
            const position: Position = { line: 0, character: 11 }; // After [Sales]
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            expect(signatureHelp?.signatures[0]?.label).toContain('AVG');
            expect(signatureHelp?.activeParameter).toBe(0); // First parameter
        });
        
        it('should provide signature help for string functions', async () => {
            const document = createTestDocument('LEFT([Customer Name], ');
            const position: Position = { line: 0, character: 22 }; // After comma
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            expect(signatureHelp?.signatures[0]?.label).toContain('LEFT');
            expect(signatureHelp?.activeParameter).toBe(1); // Second parameter
            
            const signature = signatureHelp?.signatures[0];
            expect(signature?.parameters?.length).toBe(2);
        });
        
        it('should provide signature help for date functions', async () => {
            const document = createTestDocument('DATEADD(\'month\', 1, ');
            // The second comma is at index 18; the cursor must sit *after* it
            // (end of the trailing ", ") to be inside the third parameter.
            const position: Position = { line: 0, character: 20 }; // After second comma
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            expect(signatureHelp?.signatures[0]?.label).toContain('DATEADD');
            expect(signatureHelp?.activeParameter).toBe(2); // Third parameter
        });
        
        it('should provide signature help for math functions', async () => {
            const document = createTestDocument('ROUND([Sales], ');
            const position: Position = { line: 0, character: 15 }; // After comma
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            expect(signatureHelp?.signatures[0]?.label).toContain('ROUND');
            expect(signatureHelp?.activeParameter).toBe(1); // Second parameter
        });
    });
    
    describe('Multi-Signature Functions', () => {
        it('should provide multiple signatures for MIN function', async () => {
            const document = createTestDocument('MIN(');
            const position: Position = { line: 0, character: 4 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            expect(signatureHelp?.signatures.length).toBeGreaterThanOrEqual(1);
            
            // MIN can be aggregate MIN([Field]) or row-level MIN(a, b)
            const signature = signatureHelp?.signatures[0];
            expect(signature?.label).toContain('MIN');
        });
        
        it('should provide multiple signatures for MAX function', async () => {
            const document = createTestDocument('MAX([Sales], ');
            const position: Position = { line: 0, character: 13 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            expect(signatureHelp?.activeParameter).toBe(1);
        });
        
        it('should handle IIF function with optional parameter', async () => {
            const document = createTestDocument('IIF([Sales] > 100, "High", ');
            const position: Position = { line: 0, character: 28 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            expect(signatureHelp?.signatures[0]?.label).toContain('IIF');
            expect(signatureHelp?.activeParameter).toBe(2); // Third parameter
        });
    });
    
    describe('Nested Function Calls', () => {
        it('should provide signature help for outer function', async () => {
            const document = createTestDocument('SUM(AVG([Sales]), ');
            const position: Position = { line: 0, character: 18 }; // After comma in SUM
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            expect(signatureHelp?.signatures[0]?.label).toContain('SUM');
            expect(signatureHelp?.activeParameter).toBe(1); // Second parameter of SUM
        });
        
        it('should provide signature help for inner function', async () => {
            const document = createTestDocument('SUM(AVG([Sales]');
            const position: Position = { line: 0, character: 15 }; // Inside AVG call
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            expect(signatureHelp?.signatures[0]?.label).toContain('AVG');
            expect(signatureHelp?.activeParameter).toBe(0); // First parameter of AVG
        });
        
        it('should handle deeply nested function calls', async () => {
            const document = createTestDocument('ROUND(SUM(AVG([Sales])), ');
            const position: Position = { line: 0, character: 25 }; // Second parameter of ROUND
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            expect(signatureHelp?.signatures[0]?.label).toContain('ROUND');
            expect(signatureHelp?.activeParameter).toBe(1);
        });
    });
    
    describe('Conditional Expression Signatures', () => {
        it('should provide signature help for IF expressions', async () => {
            const document = createTestDocument('IF [Sales] > 100 THEN ');
            const position: Position = { line: 0, character: 22 }; // After THEN
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            // Should provide context about IF structure
            expect(signatureHelp?.signatures[0]?.label).toContain('IF');
        });
        
        it('should provide signature help for CASE expressions', async () => {
            const document = createTestDocument('CASE [Category] WHEN ');
            const position: Position = { line: 0, character: 21 }; // After WHEN
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            expect(signatureHelp?.signatures[0]?.label).toContain('CASE');
        });
    });
    
    describe('LOD Expression Signatures', () => {
        it('should provide signature help for FIXED expressions', async () => {
            const document = createTestDocument('{ FIXED [Region] : ');
            const position: Position = { line: 0, character: 19 }; // After colon
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            expect(signatureHelp?.signatures[0]?.label).toContain('FIXED');
        });
        
        it('should provide signature help for INCLUDE expressions', async () => {
            const document = createTestDocument('{ INCLUDE [Category] : SUM(');
            const position: Position = { line: 0, character: 28 }; // Inside SUM in LOD
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            expect(signatureHelp?.signatures[0]?.label).toContain('SUM');
        });
        
        it('should provide signature help for EXCLUDE expressions', async () => {
            const document = createTestDocument('{ EXCLUDE [Sub-Category] : AVG([Profit]) }');
            const position: Position = { line: 0, character: 35 }; // Inside AVG
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            expect(signatureHelp?.signatures[0]?.label).toContain('AVG');
        });
    });
    
    describe('Parameter Highlighting', () => {
        it('should highlight correct parameter in multi-parameter function', async () => {
            const document = createTestDocument('DATEADD(\'month\', 1, [Order Date]');
            const position: Position = { line: 0, character: 30 }; // In third parameter
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            expect(signatureHelp?.activeParameter).toBe(2); // Third parameter (0-indexed)
            
            const signature = signatureHelp?.signatures[0];
            expect(signature?.parameters?.length).toBe(3);
        });
        
        it('should handle parameter highlighting with nested calls', async () => {
            const document = createTestDocument('LEFT(UPPER([Customer Name]), 5');
            const position: Position = { line: 0, character: 31 }; // Second parameter of LEFT
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            expect(signatureHelp?.signatures[0]?.label).toContain('LEFT');
            expect(signatureHelp?.activeParameter).toBe(1);
        });
        
        it('should handle parameter highlighting with string literals', async () => {
            const document = createTestDocument('REPLACE([Customer Name], "Corp", ');
            const position: Position = { line: 0, character: 34 }; // Third parameter
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            expect(signatureHelp?.activeParameter).toBe(2);
        });
    });
    
    describe('Edge Cases', () => {
        it('should handle signature help at function start', async () => {
            const document = createTestDocument('SUM');
            const position: Position = { line: 0, character: 3 }; // At end of function name
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            // May or may not provide signature help depending on implementation
            // Should not throw error
            expect(signatureHelp).toBeDefined();
        });
        
        it('should handle malformed function calls', async () => {
            const document = createTestDocument('SUM([Sales],, ');
            const position: Position = { line: 0, character: 14 }; // After double comma
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            // Should handle gracefully
            expect(signatureHelp).toBeDefined();
        });
        
        it('should handle unclosed function calls', async () => {
            const document = createTestDocument('SUM([Sales]');
            const position: Position = { line: 0, character: 11 }; // Missing closing parenthesis
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            expect(signatureHelp?.signatures[0]?.label).toContain('SUM');
        });
        
        it('should handle unknown functions', async () => {
            const document = createTestDocument('UNKNOWN_FUNCTION(');
            const position: Position = { line: 0, character: 17 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            // Should handle gracefully, may return null or empty
            expect(signatureHelp).toBeDefined();
        });
        
        it('should handle position outside function calls', async () => {
            const document = createTestDocument('SUM([Sales]) + AVG([Profit])');
            const position: Position = { line: 0, character: 13 }; // On the '+' operator
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            // Should return null or empty when not in function call
            expect(signatureHelp).toBeNull();
        });
        
        it('should handle empty documents', async () => {
            const document = createTestDocument('');
            const position: Position = { line: 0, character: 0 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeNull();
        });
    });
    
    describe('Performance', () => {
        it('should provide signature help quickly', async () => {
            const document = createTestDocument('SUM([Sales], AVG([Profit]), COUNT([Orders])');
            const position: Position = { line: 0, character: 25 }; // Second parameter
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const startTime = Date.now();
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            const duration = Date.now() - startTime;
            
            expect(signatureHelp).toBeDefined();
            expect(duration).toBeLessThan(50); // Should be very fast
        });
        
        it('should handle complex nested expressions efficiently', async () => {
            const complexExpression = `
                ROUND(
                    SUM(
                        IF [Category] = "Furniture" THEN
                            AVG([Sales]) * 1.1
                        ELSE
                            AVG([Sales])
                        END
                    ),
                    2
                )
            `;
            
            const document = createTestDocument(complexExpression);
            const position: Position = { line: 9, character: 20 }; // Second parameter of ROUND
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const startTime = Date.now();
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            const duration = Date.now() - startTime;
            
            expect(signatureHelp).toBeDefined();
            expect(duration).toBeLessThan(100);
        });
        
        it('should handle multiple rapid signature requests', async () => {
            const document = createTestDocument('DATEADD(\'month\', 1, [Order Date])');
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const positions = [
                { line: 0, character: 8 },  // First parameter
                { line: 0, character: 18 }, // Second parameter
                { line: 0, character: 25 }  // Third parameter
            ];
            
            const startTime = Date.now();
            const signatureHelps = positions.map(position => 
                buildSignatureHelp(document, position, parsedDoc)
            );
            const duration = Date.now() - startTime;
            
            expect(signatureHelps).toHaveLength(3);
            signatureHelps.forEach(help => expect(help).toBeDefined());
            expect(duration).toBeLessThan(100);
        });
    });
    
    describe('Signature Information Quality', () => {
        it('should provide detailed parameter information', async () => {
            const document = createTestDocument('DATEADD(');
            const position: Position = { line: 0, character: 8 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            
            const signature = signatureHelp?.signatures[0];
            expect(signature?.parameters).toBeDefined();
            expect(signature?.parameters?.length).toBe(3);
            
            // Parameters should have labels and documentation
            signature?.parameters?.forEach(param => {
                expect(param.label).toBeDefined();
                expect(typeof param.label).toBe('string');
            });
        });
        
        it('should provide function documentation', async () => {
            const document = createTestDocument('SUM(');
            const position: Position = { line: 0, character: 4 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            
            const signature = signatureHelp?.signatures[0];
            expect(signature?.documentation).toBeDefined();
            
            if (typeof signature?.documentation === 'object' && signature.documentation && 'value' in signature.documentation) {
                expect(signature.documentation.value).toContain('SUM');
            }
        });
        
        it('should indicate active signature for overloaded functions', async () => {
            const document = createTestDocument('MIN([Sales], [Profit]');
            const position: Position = { line: 0, character: 21 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const signatureHelp = buildSignatureHelp(document, position, parsedDoc);
            
            expect(signatureHelp).toBeDefined();
            expect(signatureHelp?.activeSignature).toBeDefined();
            expect(typeof signatureHelp?.activeSignature).toBe('number');
        });
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
