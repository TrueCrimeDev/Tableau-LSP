// src/tests/unit/hoverProvider.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Hover } from 'vscode-languageserver';
import { provideHover, HoverPerformanceAPI } from '../../hoverProvider.js';
import { FieldParser } from '../../fieldParser.js';
import { parsedDocumentCache } from '../../common.js';
import { IncrementalParser } from '../../incrementalParser.js';

describe('Hover Provider', () => {
    let fieldParser: FieldParser | null;
    
    beforeEach(() => {
        // Clear cache
        parsedDocumentCache.clear();
        // Clear the hover provider's internal caches so tests are isolated.
        // All test docs share the same URI/version, so without this later tests
        // would receive stale cached hovers from earlier tests.
        HoverPerformanceAPI.clearCaches();

        // Mock field parser. The provider resolves fields via getField (the
        // current FieldParser API), not the old getFieldInfo method.
        fieldParser = {
            getField: jest.fn().mockReturnValue({
                name: 'Sales',
                type: 'Number',
                description: 'Sales amount in USD'
            }),
            getAllFields: jest.fn(),
            findDefinitionFile: jest.fn()
        } as any;
    });
    
    describe('Function Hover', () => {
        it('should provide hover information for SUM function', async () => {
            const document = createTestDocument('SUM([Sales])');
            const position: Position = { line: 0, character: 1 }; // On 'SUM'
            
            // Parse document
            IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position
            };
            
            const hover = await provideHover(params, document, fieldParser);
            
            expect(hover).toBeDefined();
            expect(hover?.contents).toBeDefined();
            
            const contents = Array.isArray(hover?.contents) ? hover?.contents[0] : hover?.contents;
            if (typeof contents === 'object' && 'value' in contents) {
                expect(contents.value).toContain('SUM');
                expect(contents.value).toContain('aggregate');
            }
        });
        
        it('should provide hover information for AVG function', async () => {
            const document = createTestDocument('AVG([Profit])');
            const position: Position = { line: 0, character: 1 }; // On 'AVG'
            
            IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position
            };
            
            const hover = await provideHover(params, document, fieldParser);
            
            expect(hover).toBeDefined();
            const contents = Array.isArray(hover?.contents) ? hover?.contents[0] : hover?.contents;
            if (typeof contents === 'object' && 'value' in contents) {
                expect(contents.value).toContain('AVG');
                expect(contents.value).toContain('average');
            }
        });
        
        it('should provide hover information for string functions', async () => {
            const document = createTestDocument('LEFT([Customer Name], 5)');
            const position: Position = { line: 0, character: 1 }; // On 'LEFT'
            
            IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position
            };
            
            const hover = await provideHover(params, document, fieldParser);
            
            expect(hover).toBeDefined();
            const contents = Array.isArray(hover?.contents) ? hover?.contents[0] : hover?.contents;
            if (typeof contents === 'object' && 'value' in contents) {
                expect(contents.value).toContain('LEFT');
                expect(contents.value).toContain('string');
            }
        });
        
        it('should provide hover information for date functions', async () => {
            const document = createTestDocument('DATEADD(\'month\', 1, [Order Date])');
            const position: Position = { line: 0, character: 3 }; // On 'DATEADD'
            
            IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position
            };
            
            const hover = await provideHover(params, document, fieldParser);
            
            expect(hover).toBeDefined();
            const contents = Array.isArray(hover?.contents) ? hover?.contents[0] : hover?.contents;
            if (typeof contents === 'object' && 'value' in contents) {
                expect(contents.value).toContain('DATEADD');
                expect(contents.value).toContain('date');
            }
        });
    });
    
    describe('Field Reference Hover', () => {
        it('should provide hover information for field references', async () => {
            const document = createTestDocument('[Sales]');
            const position: Position = { line: 0, character: 2 }; // Inside [Sales]
            
            IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position
            };
            
            const hover = await provideHover(params, document, fieldParser);
            
            expect(hover).toBeDefined();
            expect(fieldParser?.getField).toHaveBeenCalledWith('Sales');
            
            const contents = Array.isArray(hover?.contents) ? hover?.contents[0] : hover?.contents;
            if (typeof contents === 'object' && 'value' in contents) {
                expect(contents.value).toContain('Sales');
                expect(contents.value).toContain('Number');
            }
        });
        
        it('should handle field references with spaces', async () => {
            const document = createTestDocument('[Customer Name]');
            const position: Position = { line: 0, character: 5 }; // Inside [Customer Name]
            
            (fieldParser?.getField as jest.Mock).mockReturnValue({
                name: 'Customer Name',
                type: 'String',
                description: 'Name of the customer'
            });
            
            IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position
            };
            
            const hover = await provideHover(params, document, fieldParser);
            
            expect(hover).toBeDefined();
            expect(fieldParser?.getField).toHaveBeenCalledWith('Customer Name');
        });
        
        it('should handle unknown field references', async () => {
            const document = createTestDocument('[Unknown Field]');
            const position: Position = { line: 0, character: 5 };
            
            (fieldParser?.getField as jest.Mock).mockReturnValue(null);
            
            IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position
            };
            
            const hover = await provideHover(params, document, fieldParser);
            
            // Should still provide some hover information
            expect(hover).toBeDefined();
        });
    });
    
    describe('Keyword Hover', () => {
        it('should provide hover information for IF keyword', async () => {
            const document = createTestDocument('IF [Sales] > 100 THEN "High" ELSE "Low" END');
            const position: Position = { line: 0, character: 1 }; // On 'IF'
            
            IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position
            };
            
            const hover = await provideHover(params, document, fieldParser);
            
            expect(hover).toBeDefined();
            const contents = Array.isArray(hover?.contents) ? hover?.contents[0] : hover?.contents;
            if (typeof contents === 'object' && 'value' in contents) {
                expect(contents.value).toContain('IF');
                expect(contents.value).toContain('conditional');
            }
        });
        
        it('should provide hover information for CASE keyword', async () => {
            const document = createTestDocument('CASE [Category] WHEN "Furniture" THEN 1 ELSE 0 END');
            const position: Position = { line: 0, character: 2 }; // On 'CASE'
            
            IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position
            };
            
            const hover = await provideHover(params, document, fieldParser);
            
            expect(hover).toBeDefined();
            const contents = Array.isArray(hover?.contents) ? hover?.contents[0] : hover?.contents;
            if (typeof contents === 'object' && 'value' in contents) {
                expect(contents.value).toContain('CASE');
                expect(contents.value).toContain('multiple');
            }
        });
        
        it('should provide hover information for LOD keywords', async () => {
            const document = createTestDocument('{ FIXED [Region] : SUM([Sales]) }');
            const position: Position = { line: 0, character: 3 }; // On 'FIXED'
            
            IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position
            };
            
            const hover = await provideHover(params, document, fieldParser);
            
            expect(hover).toBeDefined();
            const contents = Array.isArray(hover?.contents) ? hover?.contents[0] : hover?.contents;
            if (typeof contents === 'object' && 'value' in contents) {
                expect(contents.value).toContain('FIXED');
                expect(contents.value).toContain('Level of Detail');
            }
        });
    });
    
    describe('Complex Expression Hover', () => {
        it('should provide hover for nested function calls', async () => {
            const document = createTestDocument('SUM(AVG([Sales]))');
            const position: Position = { line: 0, character: 5 }; // On inner 'AVG'
            
            IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position
            };
            
            const hover = await provideHover(params, document, fieldParser);
            
            expect(hover).toBeDefined();
            const contents = Array.isArray(hover?.contents) ? hover?.contents[0] : hover?.contents;
            if (typeof contents === 'object' && 'value' in contents) {
                expect(contents.value).toContain('AVG');
            }
        });
        
        it('should provide hover for complex IF expressions', async () => {
            const document = createTestDocument(`
                IF [Sales] > 1000 THEN
                    "High Sales"
                ELSEIF [Sales] > 500 THEN
                    "Medium Sales"
                ELSE
                    "Low Sales"
                END
            `);
            const position: Position = { line: 1, character: 16 }; // On 'IF' (col 16; char 19 is the '[' of [Sales])
            
            IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position
            };
            
            const hover = await provideHover(params, document, fieldParser);
            
            expect(hover).toBeDefined();
        });
        
        it('should provide hover for LOD expressions', async () => {
            const document = createTestDocument('{ INCLUDE [Category] : AVG([Profit]) }');
            const position: Position = { line: 0, character: 25 }; // On 'AVG' inside LOD
            
            IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position
            };
            
            const hover = await provideHover(params, document, fieldParser);
            
            expect(hover).toBeDefined();
        });
    });
    
    describe('Edge Cases', () => {
        it('should handle hover at document boundaries', async () => {
            const document = createTestDocument('SUM([Sales])');
            const position: Position = { line: 0, character: 0 }; // At start
            
            IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position
            };
            
            const hover = await provideHover(params, document, fieldParser);
            
            // Should handle gracefully
            expect(hover).toBeDefined();
        });
        
        it('should handle hover beyond document end', async () => {
            const document = createTestDocument('SUM([Sales])');
            const position: Position = { line: 0, character: 100 }; // Beyond end
            
            IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position
            };
            
            const hover = await provideHover(params, document, fieldParser);

            // Should handle gracefully: no token beyond the end, so no hover is returned.
            expect(hover).toBeUndefined();
        });

        it('should handle empty documents', async () => {
            const document = createTestDocument('');
            const position: Position = { line: 0, character: 0 };
            
            IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position
            };
            
            const hover = await provideHover(params, document, fieldParser);

            // provideHover returns undefined (not null) when there is nothing to show.
            expect(hover).toBeUndefined();
        });
        
        it('should handle malformed expressions', async () => {
            const document = createTestDocument('SUM([Sales] +');
            const position: Position = { line: 0, character: 1 }; // On 'SUM'
            
            IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position
            };
            
            const hover = await provideHover(params, document, fieldParser);
            
            // Should still provide hover for the function
            expect(hover).toBeDefined();
        });
        
        it('should handle hover without field parser', async () => {
            const document = createTestDocument('[Sales]');
            const position: Position = { line: 0, character: 2 };
            
            IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position
            };
            
            const hover = await provideHover(params, document, null);
            
            // Should handle gracefully without field parser
            expect(hover).toBeDefined();
        });
    });
    
    describe('Performance', () => {
        it('should provide hover quickly for large documents', async () => {
            const largeContent = Array.from({ length: 100 }, (_, i) => 
                `SUM([Field${i}]) + AVG([Other${i}])`
            ).join('\n');
            
            const document = createTestDocument(largeContent);
            const position: Position = { line: 50, character: 1 }; // Middle of document
            
            IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position
            };
            
            const startTime = Date.now();
            const hover = await provideHover(params, document, fieldParser);
            const duration = Date.now() - startTime;
            
            expect(hover).toBeDefined();
            expect(duration).toBeLessThan(100); // Should be fast
        });
        
        it('should handle multiple rapid hover requests', async () => {
            const document = createTestDocument('SUM([Sales]) + AVG([Profit]) + COUNT([Orders])');
            
            IncrementalParser.parseDocumentIncremental(document);
            
            const positions = [
                { line: 0, character: 1 },  // SUM
                { line: 0, character: 16 }, // AVG
                { line: 0, character: 32 }  // COUNT
            ];
            
            const startTime = Date.now();
            const hovers = await Promise.all(
                positions.map(position => 
                    provideHover(
                        { textDocument: { uri: document.uri }, position },
                        document,
                        fieldParser
                    )
                )
            );
            const duration = Date.now() - startTime;
            
            expect(hovers).toHaveLength(3);
            hovers.forEach(hover => expect(hover).toBeDefined());
            expect(duration).toBeLessThan(200); // Should handle multiple requests quickly
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
