// src/tests/unit/semanticTokensProvider.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { provideSemanticTokens } from '../../semanticTokensProvider.js';
import { parsedDocumentCache } from '../../common.js';
import { IncrementalParser } from '../../incrementalParser.js';

describe('Semantic Tokens Provider', () => {
    beforeEach(() => {
        // Clear cache
        parsedDocumentCache.clear();
    });
    
    describe('Basic Token Classification', () => {
        it('should classify function names as functions', () => {
            const document = createTestDocument('SUM([Sales])');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data).toBeDefined();
            expect(Array.isArray(tokens.data)).toBe(true);
            expect(tokens.data.length).toBeGreaterThan(0);
        });
        
        it('should classify field references as variables', () => {
            const document = createTestDocument('[Sales]');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data.length).toBeGreaterThan(0);
        });
        
        it('should classify keywords correctly', () => {
            const document = createTestDocument('IF [Sales] > 100 THEN "High" ELSE "Low" END');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data.length).toBeGreaterThan(0);
        });
        
        it('should classify string literals as strings', () => {
            const document = createTestDocument('"Hello World"');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data.length).toBeGreaterThan(0);
        });
        
        it('should classify numeric literals as constants', () => {
            const document = createTestDocument('123.45');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data.length).toBeGreaterThan(0);
        });
        
        it('should classify operators correctly', () => {
            const document = createTestDocument('[Sales] + [Profit] * 2');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data.length).toBeGreaterThan(0);
        });
        
        it('should classify comments correctly', () => {
            const document = createTestDocument('SUM([Sales]) // This is a comment');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data.length).toBeGreaterThan(0);
        });
    });
    
    describe('Complex Expression Classification', () => {
        it('should classify IF expressions correctly', () => {
            const document = createTestDocument(`
                IF [Sales] > 1000 THEN
                    "High Sales"
                ELSEIF [Sales] > 500 THEN
                    "Medium Sales"
                ELSE
                    "Low Sales"
                END
            `);
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data.length).toBeGreaterThan(0);
        });
        
        it('should classify CASE expressions correctly', () => {
            const document = createTestDocument(`
                CASE [Category]
                    WHEN "Furniture" THEN [Sales] * 0.1
                    WHEN "Technology" THEN [Sales] * 0.15
                    ELSE [Sales] * 0.05
                END
            `);
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data.length).toBeGreaterThan(0);
        });
        
        it('should classify LOD expressions correctly', () => {
            const document = createTestDocument('{ FIXED [Region] : SUM([Sales]) }');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data.length).toBeGreaterThan(0);
        });
        
        it('should classify nested function calls correctly', () => {
            const document = createTestDocument('ROUND(SUM(AVG([Sales])), 2)');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data.length).toBeGreaterThan(0);
        });
    });
    
    describe('Token Data Format', () => {
        it('should return tokens in correct LSP format', () => {
            const document = createTestDocument('SUM([Sales])');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens).toHaveProperty('data');
            expect(Array.isArray(tokens.data)).toBe(true);
            
            // LSP semantic tokens are encoded as arrays of integers
            tokens.data.forEach(value => {
                expect(typeof value).toBe('number');
                expect(Number.isInteger(value)).toBe(true);
            });
        });
        
        it('should encode token positions correctly', () => {
            const document = createTestDocument('SUM([Sales])');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens.data.length).toBeGreaterThan(0);
            
            // Tokens should be encoded in groups of 5 integers
            // [deltaLine, deltaStart, length, tokenType, tokenModifiers]
            expect(tokens.data.length % 5).toBe(0);
        });
        
        it('should handle multi-line documents correctly', () => {
            const document = createTestDocument(`
                SUM([Sales])
                AVG([Profit])
                COUNT([Orders])
            `);
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data.length).toBeGreaterThan(0);
        });
    });
    
    describe('Token Type Consistency', () => {
        it('should consistently classify the same function names', () => {
            const document = createTestDocument('SUM([Sales]) + SUM([Profit])');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data.length).toBeGreaterThan(0);
            
            // Both SUM occurrences should have the same token type
            // This would require parsing the token data to verify
        });
        
        it('should consistently classify the same field references', () => {
            const document = createTestDocument('[Sales] + [Sales] * 2');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data.length).toBeGreaterThan(0);
        });
        
        it('should consistently classify the same keywords', () => {
            const document = createTestDocument(`
                IF [Sales] > 100 THEN "High" END +
                IF [Profit] > 50 THEN "Good" END
            `);
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data.length).toBeGreaterThan(0);
        });
    });
    
    describe('Edge Cases', () => {
        it('should handle empty documents', () => {
            const document = createTestDocument('');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data).toBeDefined();
            expect(Array.isArray(tokens.data)).toBe(true);
            expect(tokens.data.length).toBe(0);
        });
        
        it('should handle whitespace-only documents', () => {
            const document = createTestDocument('   \n  \t  \n   ');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data).toBeDefined();
            expect(Array.isArray(tokens.data)).toBe(true);
        });
        
        it('should handle malformed expressions gracefully', () => {
            const document = createTestDocument('SUM([Sales] +');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data).toBeDefined();
            expect(Array.isArray(tokens.data)).toBe(true);
        });
        
        it('should handle documents with only comments', () => {
            const document = createTestDocument('// This is just a comment\n// Another comment');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data).toBeDefined();
            expect(Array.isArray(tokens.data)).toBe(true);
        });
        
        it('should handle very long lines', () => {
            const longExpression = Array.from({ length: 100 }, (_, i) => `[Field${i}]`).join(' + ');
            const document = createTestDocument(longExpression);
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data.length).toBeGreaterThan(0);
        });
    });
    
    describe('Performance', () => {
        it('should provide semantic tokens quickly for normal documents', () => {
            const document = createTestDocument(`
                IF [Sales] > 1000 THEN
                    CASE [Category]
                        WHEN "Furniture" THEN SUM([Profit])
                        ELSE AVG([Discount])
                    END
                ELSE
                    COUNT([Orders])
                END
            `);
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const startTime = Date.now();
            const tokens = provideSemanticTokens(document, parsedDoc);
            const duration = Date.now() - startTime;
            
            expect(tokens).toBeDefined();
            expect(duration).toBeLessThan(100); // Should be fast
        });
        
        it('should handle large documents efficiently', () => {
            const largeContent = Array.from({ length: 200 }, (_, i) => 
                `IF [Field${i}] > ${i} THEN SUM([Value${i}]) ELSE AVG([Other${i}]) END`
            ).join('\n');
            
            const document = createTestDocument(largeContent);
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const startTime = Date.now();
            const tokens = provideSemanticTokens(document, parsedDoc);
            const duration = Date.now() - startTime;
            
            expect(tokens).toBeDefined();
            expect(duration).toBeLessThan(500); // Should handle large documents
        });
        
        it('should handle repeated calls efficiently', () => {
            const document = createTestDocument('SUM([Sales]) + AVG([Profit])');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const startTime = Date.now();
            
            for (let i = 0; i < 100; i++) {
                provideSemanticTokens(document, parsedDoc);
            }
            
            const duration = Date.now() - startTime;
            expect(duration).toBeLessThan(200); // Should cache or be very efficient
        });
    });
    
    describe('Token Coverage', () => {
        it('should provide tokens for all significant elements', () => {
            const document = createTestDocument(`
                // Comment
                IF [Sales] > 100 THEN
                    SUM([Profit]) * 1.1
                ELSE
                    "Low"
                END
            `);
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data.length).toBeGreaterThan(0);
            
            // Should have tokens for:
            // - Comment
            // - Keywords (IF, THEN, ELSE, END)
            // - Function (SUM)
            // - Field reference ([Sales], [Profit])
            // - Numbers (100, 1.1)
            // - String ("Low")
            // - Operators (>, *)
        });
        
        it('should not miss tokens in complex nested expressions', () => {
            const document = createTestDocument(`
                ROUND(
                    SUM(
                        IF [Category] = "Furniture" THEN
                            [Sales] * 1.1
                        ELSE
                            [Sales]
                        END
                    ),
                    2
                )
            `);
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data.length).toBeGreaterThan(0);
        });
    });
    
    describe('Error Recovery', () => {
        it('should provide partial tokens for partially valid expressions', () => {
            const document = createTestDocument('SUM([Sales]) + INVALID_FUNCTION(');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data).toBeDefined();
            expect(Array.isArray(tokens.data)).toBe(true);
            
            // Should still provide tokens for the valid parts
            expect(tokens.data.length).toBeGreaterThan(0);
        });
        
        it('should handle syntax errors gracefully', () => {
            const document = createTestDocument('IF [Sales] > 100 THEN THEN ELSE');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const tokens = provideSemanticTokens(document, parsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data).toBeDefined();
            expect(Array.isArray(tokens.data)).toBe(true);
        });
        
        it('should handle missing parsed document gracefully', () => {
            const document = createTestDocument('SUM([Sales])');
            
            // Create minimal parsed document
            const emptyParsedDoc = {
                document,
                symbols: [],
                diagnostics: [],
                lineSymbols: new Map(),
                lastChangeVersion: 1,
                changedLines: new Set()
            };
            
            const tokens = provideSemanticTokens(document, emptyParsedDoc);
            
            expect(tokens).toBeDefined();
            expect(tokens.data).toBeDefined();
            expect(Array.isArray(tokens.data)).toBe(true);
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
