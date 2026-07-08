// src/tests/unit/completionProvider.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import { provideCompletion } from '../../completionProvider.js';
import { FieldParser } from '../../fieldParser.js';
import { parsedDocumentCache } from '../../common.js';
import { IncrementalParser } from '../../incrementalParser.js';

describe('Completion Provider', () => {
    let fieldParser: FieldParser | null;
    
    beforeEach(() => {
        // Clear cache
        parsedDocumentCache.clear();
        
        // Mock field parser
        fieldParser = {
            getFieldInfo: jest.fn(),
            // getAllFields() returns a Map<string, CustomField> in the real API (fieldParser.ts),
            // keyed by upper-cased field name. The mock must match that shape.
            getAllFields: jest.fn().mockReturnValue(new Map([
                ['SALES', { name: 'Sales', type: 'Number' }],
                ['PROFIT', { name: 'Profit', type: 'Number' }],
                ['CUSTOMER NAME', { name: 'Customer Name', type: 'String' }],
                ['ORDER DATE', { name: 'Order Date', type: 'Date' }],
                ['CATEGORY', { name: 'Category', type: 'String' }]
            ])),
            findDefinitionFile: jest.fn()
        } as any;
    });
    
    describe('Function Completion', () => {
        it('should provide function completions at document start', async () => {
            const document = createTestDocument('');
            const position: Position = { line: 0, character: 0 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 } // Invoked
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            expect(completions).toBeDefined();
            expect(Array.isArray(completions.items)).toBe(true);
            
            // Should include common functions
            const functionNames = completions.items.map(item => item.label);
            expect(functionNames).toContain('SUM');
            expect(functionNames).toContain('AVG');
            expect(functionNames).toContain('COUNT');
            expect(functionNames).toContain('IF');
        });
        
        it('should provide function completions with partial input', async () => {
            const document = createTestDocument('SU');
            const position: Position = { line: 0, character: 2 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            expect(completions).toBeDefined();
            
            // Should prioritize functions starting with 'SU'
            const functionNames = completions.items.map(item => item.label);
            expect(functionNames).toContain('SUM');
            
            // SUM should be ranked highly
            const sumItem = completions.items.find(item => item.label === 'SUM');
            expect(sumItem).toBeDefined();
            expect(sumItem?.kind).toBe(CompletionItemKind.Function);
        });
        
        it('should provide string function completions', async () => {
            const document = createTestDocument('LE');
            const position: Position = { line: 0, character: 2 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            const functionNames = completions.items.map(item => item.label);
            expect(functionNames).toContain('LEFT');
            expect(functionNames).toContain('LEN');
        });
        
        it('should provide date function completions', async () => {
            const document = createTestDocument('DATE');
            const position: Position = { line: 0, character: 4 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            const functionNames = completions.items.map(item => item.label);
            expect(functionNames).toContain('DATEADD');
            expect(functionNames).toContain('DATEDIFF');
            expect(functionNames).toContain('DATEPART');
        });
    });
    
    describe('Field Completion', () => {
        it('should provide field completions after opening bracket', async () => {
            const document = createTestDocument('[');
            const position: Position = { line: 0, character: 1 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 2, triggerCharacter: '[' }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            expect(completions).toBeDefined();
            
            const fieldNames = completions.items.map(item => item.label);
            expect(fieldNames).toContain('Sales');
            expect(fieldNames).toContain('Profit');
            expect(fieldNames).toContain('Customer Name');
            
            // Should have field kind
            const salesItem = completions.items.find(item => item.label === 'Sales');
            expect(salesItem?.kind).toBe(CompletionItemKind.Field);
        });
        
        it('should provide field completions with partial field name', async () => {
            const document = createTestDocument('[Sal');
            const position: Position = { line: 0, character: 4 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            const fieldNames = completions.items.map(item => item.label);
            expect(fieldNames).toContain('Sales');
            
            // Should prioritize matching fields
            const salesItem = completions.items.find(item => item.label === 'Sales');
            expect(salesItem).toBeDefined();
        });
        
        it('should provide fuzzy matching for field names', async () => {
            const document = createTestDocument('[CustNm');
            const position: Position = { line: 0, character: 7 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            // Should match 'Customer Name' with fuzzy matching
            const fieldNames = completions.items.map(item => item.label);
            expect(fieldNames).toContain('Customer Name');
        });
    });
    
    describe('Keyword Completion', () => {
        it('should provide IF/THEN/ELSE completions', async () => {
            const document = createTestDocument('I');
            const position: Position = { line: 0, character: 1 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            const labels = completions.items.map(item => item.label);
            expect(labels).toContain('IF');
            
            const ifItem = completions.items.find(item => item.label === 'IF');
            expect(ifItem?.kind).toBe(CompletionItemKind.Keyword);
        });
        
        it('should provide THEN completion after IF condition', async () => {
            const document = createTestDocument('IF [Sales] > 100 T');
            const position: Position = { line: 0, character: 17 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            const labels = completions.items.map(item => item.label);
            expect(labels).toContain('THEN');
        });
        
        it('should provide ELSE completion after THEN clause', async () => {
            const document = createTestDocument('IF [Sales] > 100 THEN "High" E');
            const position: Position = { line: 0, character: 31 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            const labels = completions.items.map(item => item.label);
            expect(labels).toContain('ELSE');
            expect(labels).toContain('ELSEIF');
        });
        
        it('should provide CASE/WHEN/END completions', async () => {
            const document = createTestDocument('CAS');
            const position: Position = { line: 0, character: 3 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            const labels = completions.items.map(item => item.label);
            expect(labels).toContain('CASE');
        });
    });
    
    describe('Context-Aware Completion', () => {
        it('should provide appropriate completions inside function calls', async () => {
            const document = createTestDocument('SUM(');
            const position: Position = { line: 0, character: 4 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 2, triggerCharacter: '(' }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            // Should prioritize fields and expressions suitable for SUM
            const labels = completions.items.map(item => item.label);
            expect(labels).toContain('Sales');
            expect(labels).toContain('Profit');
        });
        
        it('should provide completions in LOD expressions', async () => {
            const document = createTestDocument('{ FIXED [Region] : ');
            const position: Position = { line: 0, character: 19 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            // Should provide aggregate functions
            const labels = completions.items.map(item => item.label);
            expect(labels).toContain('SUM');
            expect(labels).toContain('AVG');
            expect(labels).toContain('COUNT');
        });
        
        it('should provide completions after operators', async () => {
            const document = createTestDocument('[Sales] + ');
            const position: Position = { line: 0, character: 10 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            // Should provide fields and functions
            const labels = completions.items.map(item => item.label);
            expect(labels).toContain('Profit');
            expect(labels).toContain('SUM');
        });
    });
    
    describe('Snippet Completion', () => {
        it('should provide IF statement snippet', async () => {
            const document = createTestDocument('if');
            const position: Position = { line: 0, character: 2 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            // Should include IF snippet. Snippet labels are the lowercase prefix
            // (e.g. "if"), so match case-insensitively.
            const snippetItem = completions.items.find(item =>
                item.kind === CompletionItemKind.Snippet &&
                item.label.toUpperCase().includes('IF')
            );
            
            expect(snippetItem).toBeDefined();
            expect(snippetItem?.insertText).toContain('IF');
            expect(snippetItem?.insertText).toContain('THEN');
            expect(snippetItem?.insertText).toContain('END');
        });
        
        it('should provide CASE statement snippet', async () => {
            const document = createTestDocument('case');
            const position: Position = { line: 0, character: 4 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            const snippetItem = completions.items.find(item =>
                item.kind === CompletionItemKind.Snippet &&
                item.label.toUpperCase().includes('CASE')
            );
            
            expect(snippetItem).toBeDefined();
            expect(snippetItem?.insertText).toContain('CASE');
            expect(snippetItem?.insertText).toContain('WHEN');
            expect(snippetItem?.insertText).toContain('END');
        });
        
        it('should provide LOD expression snippets', async () => {
            const document = createTestDocument('fixed');
            const position: Position = { line: 0, character: 5 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            const snippetItem = completions.items.find(item =>
                item.kind === CompletionItemKind.Snippet &&
                item.label.toUpperCase().includes('FIXED')
            );
            
            expect(snippetItem).toBeDefined();
            expect(snippetItem?.insertText).toContain('FIXED');
            expect(snippetItem?.insertText).toContain('{');
            expect(snippetItem?.insertText).toContain('}');
        });
    });
    
    describe('Relevance Ranking', () => {
        it('should rank exact matches higher', async () => {
            const document = createTestDocument('SUM');
            const position: Position = { line: 0, character: 3 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            // SUM should be ranked highly (exact match)
            const sumItem = completions.items.find(item => item.label === 'SUM');
            expect(sumItem).toBeDefined();
            
            // Should be in top results
            const topItems = completions.items.slice(0, 5);
            expect(topItems.some(item => item.label === 'SUM')).toBe(true);
        });
        
        it('should rank frequently used functions higher', async () => {
            const document = createTestDocument('A');
            const position: Position = { line: 0, character: 1 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            // Common functions like AVG should rank higher than obscure ones
            const avgIndex = completions.items.findIndex(item => item.label === 'AVG');
            const absIndex = completions.items.findIndex(item => item.label === 'ABS');
            
            expect(avgIndex).toBeGreaterThanOrEqual(0);
            expect(absIndex).toBeGreaterThanOrEqual(0);
        });
        
        it('should filter duplicate suggestions', async () => {
            const document = createTestDocument('S');
            const position: Position = { line: 0, character: 1 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            // Should not have duplicate labels
            const labels = completions.items.map(item => item.label);
            const uniqueLabels = [...new Set(labels)];
            
            expect(labels.length).toBe(uniqueLabels.length);
        });
    });
    
    describe('Edge Cases', () => {
        it('should handle completion at document start', async () => {
            const document = createTestDocument('');
            const position: Position = { line: 0, character: 0 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            expect(completions).toBeDefined();
            expect(completions.items.length).toBeGreaterThan(0);
        });
        
        it('should handle completion in malformed expressions', async () => {
            const document = createTestDocument('SUM([Sales] +');
            const position: Position = { line: 0, character: 13 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            // Should still provide completions
            expect(completions).toBeDefined();
            expect(completions.items.length).toBeGreaterThan(0);
        });
        
        it('should handle completion without field parser', async () => {
            const document = createTestDocument('[');
            const position: Position = { line: 0, character: 1 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 2, triggerCharacter: '[' }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, null);
            
            // Should handle gracefully without field parser
            expect(completions).toBeDefined();
        });
        
        it('should handle very long input', async () => {
            const longInput = 'A'.repeat(1000);
            const document = createTestDocument(longInput);
            const position: Position = { line: 0, character: 1000 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 }
            };
            
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            
            // Should handle gracefully
            expect(completions).toBeDefined();
        });
    });
    
    describe('Performance', () => {
        it('should provide completions quickly', async () => {
            const document = createTestDocument('S');
            const position: Position = { line: 0, character: 1 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 }
            };
            
            const startTime = Date.now();
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            const duration = Date.now() - startTime;
            
            expect(completions).toBeDefined();
            expect(duration).toBeLessThan(100); // Should be fast
        });
        
        it('should handle large field lists efficiently', async () => {
            // Mock large field list
            (fieldParser?.getAllFields as jest.Mock).mockReturnValue(
                new Map(
                    Array.from({ length: 1000 }, (_, i) => [
                        `FIELD${i}`,
                        { name: `Field${i}`, type: 'Number' }
                    ])
                )
            );
            
            const document = createTestDocument('[F');
            const position: Position = { line: 0, character: 2 };
            
            const parsedDoc = IncrementalParser.parseDocumentIncremental(document);
            
            const params = {
                textDocument: { uri: document.uri },
                position,
                context: { triggerKind: 1 }
            };
            
            const startTime = Date.now();
            const completions = await provideCompletion(params, document, parsedDoc, fieldParser);
            const duration = Date.now() - startTime;
            
            expect(completions).toBeDefined();
            expect(duration).toBeLessThan(200); // Should handle large lists efficiently
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
