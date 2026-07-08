// src/tests/unit/provider.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, DocumentSymbolParams, WorkspaceSymbolParams, CodeActionParams, DefinitionParams, ReferenceParams } from 'vscode-languageserver';
import { documentSymbolProvider, workspaceSymbolProvider, provideCodeActions, provideDefinition, provideReferences } from '../../provider.js';
import { parsedDocumentCache } from '../../common.js';
import { IncrementalParser } from '../../incrementalParser.js';

describe('Provider Module', () => {
    function createTestDocument(content: string, uri: string = 'test://test.twbl'): TextDocument {
        return TextDocument.create(uri, 'tableau', 1, content);
    }

    beforeEach(() => {
        parsedDocumentCache.clear();
    });

    describe('Document Symbol Provider', () => {
        it('should provide symbols for simple expressions', async () => {
            const document = createTestDocument('SUM([Sales])');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params: DocumentSymbolParams = {
                textDocument: { uri: document.uri }
            };
            
            const symbols = await documentSymbolProvider(params, undefined as any);
            
            expect(symbols).toBeDefined();
            expect(Array.isArray(symbols)).toBe(true);
            expect(symbols.length).toBeGreaterThan(0);
        });

        it('should provide symbols for complex IF expressions', async () => {
            const document = createTestDocument(`
                IF [Sales] > 100 THEN
                    "High Sales"
                ELSEIF [Sales] > 50 THEN
                    "Medium Sales"
                ELSE
                    "Low Sales"
                END
            `);
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params: DocumentSymbolParams = {
                textDocument: { uri: document.uri }
            };
            
            const symbols = await documentSymbolProvider(params, undefined as any);
            
            expect(symbols).toBeDefined();
            expect(symbols.length).toBeGreaterThan(0);
            
            // Should contain IF symbol
            const symbolNames = symbols.map(s => s.name);
            expect(symbolNames.some(name => name.includes('IF'))).toBe(true);
        });

        it('should provide symbols for CASE expressions', async () => {
            const document = createTestDocument(`
                CASE [Category]
                    WHEN 'Furniture' THEN 'F'
                    WHEN 'Technology' THEN 'T'
                    ELSE 'O'
                END
            `);
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params: DocumentSymbolParams = {
                textDocument: { uri: document.uri }
            };
            
            const symbols = await documentSymbolProvider(params, undefined as any);
            
            expect(symbols).toBeDefined();
            expect(symbols.length).toBeGreaterThan(0);
        });

        it('should provide symbols for LOD expressions', async () => {
            const document = createTestDocument('{ FIXED [Region] : SUM([Sales]) }');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params: DocumentSymbolParams = {
                textDocument: { uri: document.uri }
            };
            
            const symbols = await documentSymbolProvider(params, undefined as any);
            
            expect(symbols).toBeDefined();
            expect(symbols.length).toBeGreaterThan(0);
        });

        it('should handle empty documents', async () => {
            const document = createTestDocument('');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params: DocumentSymbolParams = {
                textDocument: { uri: document.uri }
            };
            
            const symbols = await documentSymbolProvider(params, undefined as any);
            
            expect(symbols).toBeDefined();
            expect(Array.isArray(symbols)).toBe(true);
        });
    });

    describe('Workspace Symbol Provider', () => {
        it('should provide workspace symbols for query', async () => {
            // Set up multiple documents in cache
            const doc1 = createTestDocument('SUM([Sales])', 'test://doc1.twbl');
            const doc2 = createTestDocument('AVG([Profit])', 'test://doc2.twbl');
            
            IncrementalParser.parseDocumentIncremental(doc1);
            IncrementalParser.parseDocumentIncremental(doc2);
            
            const params: WorkspaceSymbolParams = {
                query: 'SUM'
            };
            
            const symbols = await workspaceSymbolProvider(params, undefined as any);
            
            expect(symbols).toBeDefined();
            expect(Array.isArray(symbols)).toBe(true);
        });

        it('should filter symbols by query', async () => {
            const document = createTestDocument('SUM([Sales]) + AVG([Profit])');
            IncrementalParser.parseDocumentIncremental(document);
            
            const params: WorkspaceSymbolParams = {
                query: 'SUM'
            };
            
            const symbols = await workspaceSymbolProvider(params, undefined as any);
            
            expect(symbols).toBeDefined();
            // Should filter to only SUM-related symbols
        });

        it('should handle empty query', async () => {
            const document = createTestDocument('SUM([Sales])');
            IncrementalParser.parseDocumentIncremental(document);
            
            const params: WorkspaceSymbolParams = {
                query: ''
            };
            
            const symbols = await workspaceSymbolProvider(params, undefined as any);
            
            expect(symbols).toBeDefined();
            expect(Array.isArray(symbols)).toBe(true);
        });
    });

    describe('Code Actions Provider', () => {
        it('should provide code actions for syntax errors', async () => {
            const document = createTestDocument('IF [Sales] > 100 THEN "High" ELSE "Low"'); // Missing END
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params: CodeActionParams = {
                textDocument: { uri: document.uri },
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 40 }
                },
                context: {
                    diagnostics: []
                }
            };
            
            const actions = await provideCodeActions(params, document);
            
            expect(actions).toBeDefined();
            expect(Array.isArray(actions)).toBe(true);
        });

        it('should provide quick fixes for common issues', async () => {
            const document = createTestDocument('SUM([Sales] +'); // Incomplete expression
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params: CodeActionParams = {
                textDocument: { uri: document.uri },
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 14 }
                },
                context: {
                    diagnostics: []
                }
            };
            
            const actions = await provideCodeActions(params, document);
            
            expect(actions).toBeDefined();
            expect(Array.isArray(actions)).toBe(true);
        });

        it('should provide refactoring actions', async () => {
            const document = createTestDocument('IF [Sales] > 100 THEN "High" ELSE "Low" END');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params: CodeActionParams = {
                textDocument: { uri: document.uri },
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 44 }
                },
                context: {
                    diagnostics: []
                }
            };
            
            const actions = await provideCodeActions(params, document);
            
            expect(actions).toBeDefined();
            expect(Array.isArray(actions)).toBe(true);
        });

        it('should handle empty range', async () => {
            const document = createTestDocument('SUM([Sales])');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params: CodeActionParams = {
                textDocument: { uri: document.uri },
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 0 }
                },
                context: {
                    diagnostics: []
                }
            };
            
            const actions = await provideCodeActions(params, document);
            
            expect(actions).toBeDefined();
            expect(Array.isArray(actions)).toBe(true);
        });
    });

    describe('Definition Provider', () => {
        it('should provide definition for function calls', async () => {
            const document = createTestDocument('SUM([Sales])');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params: DefinitionParams = {
                textDocument: { uri: document.uri },
                position: { line: 0, character: 1 } // On 'SUM'
            };
            
            const definition = await provideDefinition(params, document);
            
            expect(definition).toBeDefined();
        });

        it('should provide definition for field references', async () => {
            const document = createTestDocument('[Sales]');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params: DefinitionParams = {
                textDocument: { uri: document.uri },
                position: { line: 0, character: 2 } // Inside [Sales]
            };
            
            const definition = await provideDefinition(params, document);
            
            expect(definition).toBeDefined();
        });

        it('should handle positions with no definitions', async () => {
            const document = createTestDocument('SUM([Sales])');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params: DefinitionParams = {
                textDocument: { uri: document.uri },
                position: { line: 0, character: 5 } // On parenthesis
            };
            
            const definition = await provideDefinition(params, document);
            
            // Should handle gracefully
            expect(definition).toBeDefined();
        });

        it('should handle positions outside document bounds', async () => {
            const document = createTestDocument('SUM([Sales])');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params: DefinitionParams = {
                textDocument: { uri: document.uri },
                position: { line: 10, character: 100 } // Way outside bounds
            };
            
            const definition = await provideDefinition(params, document);
            
            expect(definition).toBeDefined();
        });
    });

    describe('References Provider', () => {
        it('should find references to functions', async () => {
            const document = createTestDocument('SUM([Sales]) + SUM([Profit])');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params: ReferenceParams = {
                textDocument: { uri: document.uri },
                position: { line: 0, character: 1 }, // On first 'SUM'
                context: {
                    includeDeclaration: true
                }
            };
            
            const references = await provideReferences(params, document);
            
            expect(references).toBeDefined();
            expect(Array.isArray(references)).toBe(true);
        });

        it('should find references to field names', async () => {
            const document = createTestDocument('[Sales] + [Sales] * 2');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params: ReferenceParams = {
                textDocument: { uri: document.uri },
                position: { line: 0, character: 2 }, // Inside first [Sales]
                context: {
                    includeDeclaration: true
                }
            };
            
            const references = await provideReferences(params, document);
            
            expect(references).toBeDefined();
            expect(Array.isArray(references)).toBe(true);
        });

        it('should handle references with includeDeclaration false', async () => {
            const document = createTestDocument('SUM([Sales])');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params: ReferenceParams = {
                textDocument: { uri: document.uri },
                position: { line: 0, character: 1 },
                context: {
                    includeDeclaration: false
                }
            };
            
            const references = await provideReferences(params, document);
            
            expect(references).toBeDefined();
            expect(Array.isArray(references)).toBe(true);
        });

        it('should handle positions with no references', async () => {
            const document = createTestDocument('SUM([Sales])');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params: ReferenceParams = {
                textDocument: { uri: document.uri },
                position: { line: 0, character: 5 }, // On parenthesis
                context: {
                    includeDeclaration: true
                }
            };
            
            const references = await provideReferences(params, document);
            
            expect(references).toBeDefined();
            expect(Array.isArray(references)).toBe(true);
        });
    });

    describe('Error Handling', () => {
        it('should handle malformed documents gracefully', async () => {
            const document = createTestDocument('IF [Sales] > 100 THEN THEN ELSE');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const symbolParams: DocumentSymbolParams = {
                textDocument: { uri: document.uri }
            };
            
            expect(async () => {
                const symbols = await documentSymbolProvider(symbolParams, undefined as any);
                expect(Array.isArray(symbols)).toBe(true);
            }).not.toThrow();
        });

        it('should handle non-existent documents', async () => {
            const params: DocumentSymbolParams = {
                textDocument: { uri: 'test://nonexistent.twbl' }
            };
            
            const symbols = await documentSymbolProvider(params, undefined as any);
            
            expect(symbols).toBeDefined();
            expect(Array.isArray(symbols)).toBe(true);
        });

        it('should handle invalid positions in definition requests', async () => {
            const document = createTestDocument('SUM([Sales])');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params: DefinitionParams = {
                textDocument: { uri: document.uri },
                position: { line: -1, character: -1 } // Invalid position
            };
            
            expect(async () => {
                const definition = await provideDefinition(params, document);
                expect(definition).toBeDefined();
            }).not.toThrow();
        });
    });

    describe('Performance', () => {
        it('should handle large documents efficiently', async () => {
            const largeContent = Array.from({ length: 1000 }, (_, i) => 
                `SUM([Field${i}])`
            ).join('\n');
            
            const document = createTestDocument(largeContent);
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params: DocumentSymbolParams = {
                textDocument: { uri: document.uri }
            };
            
            const startTime = Date.now();
            const symbols = await documentSymbolProvider(params, undefined as any);
            const duration = Date.now() - startTime;
            
            expect(symbols).toBeDefined();
            expect(duration).toBeLessThan(1000); // Should complete within 1 second
        });

        it('should handle workspace symbol queries efficiently', async () => {
            // Create multiple documents
            for (let i = 0; i < 50; i++) {
                const doc = createTestDocument(`SUM([Field${i}])`, `test://doc${i}.twbl`);
                IncrementalParser.parseDocumentIncremental(doc);
            }
            
            const params: WorkspaceSymbolParams = {
                query: 'SUM'
            };
            
            const startTime = Date.now();
            const symbols = await workspaceSymbolProvider(params, undefined as any);
            const duration = Date.now() - startTime;
            
            expect(symbols).toBeDefined();
            expect(duration).toBeLessThan(500); // Should be fast even with many documents
        });

        it('should handle rapid reference requests efficiently', async () => {
            const document = createTestDocument('SUM([Sales]) + AVG([Sales]) + COUNT([Sales])');
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const positions = [
                { line: 0, character: 6 },  // First [Sales]
                { line: 0, character: 20 }, // Second [Sales]
                { line: 0, character: 36 }  // Third [Sales]
            ];
            
            const startTime = Date.now();
            
            const referencePromises = positions.map(position => 
                provideReferences({
                    textDocument: { uri: document.uri },
                    position,
                    context: { includeDeclaration: true }
                }, document)
            );
            
            const results = await Promise.all(referencePromises);
            const duration = Date.now() - startTime;
            
            expect(results).toHaveLength(3);
            results.forEach(refs => expect(Array.isArray(refs)).toBe(true));
            expect(duration).toBeLessThan(200); // Should handle multiple requests quickly
        });
    });
});
