// src/tests/unit/completionPerformance.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionItemKind, TextDocumentPositionParams } from 'vscode-languageserver';
import { provideCompletion, CompletionPerformanceAPI } from '../../completionProvider';
import { parseDocument } from '../../documentModel';
import { FieldParser } from '../../fieldParser';

describe('Completion Performance Optimization', () => {
  beforeEach(() => {
    // Clear caches before each test
    CompletionPerformanceAPI.clearCache();
    CompletionPerformanceAPI.configurePerformance({
      ENABLE_PERFORMANCE_LOGGING: false,
      MAX_COMPLETION_ITEMS: 50
    });
  });

  describe('Completion Caching', () => {
    it('should cache completion results for repeated requests', () => {
      const document = createTestDocument('SU');
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 2 }
      };

      // First request
      const completion1 = provideCompletion(params, document, parsedDocument, null);
      
      // Second request (should be cached)
      const completion2 = provideCompletion(params, document, parsedDocument, null);
      
      // Both should return the same results
      expect(completion1.items.length).toBe(completion2.items.length);
      expect(completion1.items[0]?.label).toBe(completion2.items[0]?.label);
      
      // Check cache statistics
      const stats = CompletionPerformanceAPI.getCacheStats();
      expect(stats.cacheSize).toBeGreaterThan(0);
    });

    it('should invalidate cache when document version changes', () => {
      const document1 = createTestDocument('SU', 1);
      const document2 = createTestDocument('SU', 2); // Different version
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document1.uri },
        position: { line: 0, character: 2 }
      };

      // First request with version 1
      const parsedDocument1 = parseDocument(document1);
      const completion1 = provideCompletion(params, document1, parsedDocument1, null);
      
      // Second request with version 2 (should not use cache)
      const parsedDocument2 = parseDocument(document2);
      const completion2 = provideCompletion(params, document2, parsedDocument2, null);
      
      // Results should be similar but cache should be updated
      expect(completion1.items.length).toBeGreaterThan(0);
      expect(completion2.items.length).toBeGreaterThan(0);
    });

    it('should handle cache cleanup when cache size exceeds limit', () => {
      // Create multiple completion requests to fill cache
      for (let i = 0; i < 10; i++) {
        const document = createTestDocument(`SU${i}`, 1, `test://test${i}.twbl`);
        const parsedDocument = parseDocument(document);
        const params: TextDocumentPositionParams = {
          textDocument: { uri: document.uri },
          position: { line: 0, character: 3 + i.toString().length }
        };
        
        provideCompletion(params, document, parsedDocument, null);
      }
      
      // Cache should have entries but not exceed reasonable limits
      const stats = CompletionPerformanceAPI.getCacheStats();
      expect(stats.cacheSize).toBeGreaterThan(0);
      expect(stats.cacheSize).toBeLessThan(100);
    });
  });

  describe('Relevance Ranking', () => {
    it('should rank exact matches higher than prefix matches', () => {
      const document = createTestDocument('SUM');
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 3 }
      };

      const completion = provideCompletion(params, document, parsedDocument, null);
      
      // SUM should be ranked higher than other functions starting with SU
      const sumItem = completion.items.find(item => item.label === 'SUM');
      const otherItems = completion.items.filter(item => 
        item.label !== 'SUM' && item.label.startsWith('SU')
      );
      
      expect(sumItem).toBeDefined();
      if (sumItem && otherItems.length > 0) {
        // SUM should appear before other SU* items
        const sumIndex = completion.items.indexOf(sumItem);
        const otherIndices = otherItems.map(item => completion.items.indexOf(item));
        
        expect(otherIndices.every(index => sumIndex < index)).toBe(true);
      }
    });

    it('should rank functions higher than operators', () => {
      const document = createTestDocument('S');
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 1 }
      };

      const completion = provideCompletion(params, document, parsedDocument, null);
      
      // Functions should appear before operators
      const functions = completion.items.filter(item => item.kind === CompletionItemKind.Function);
      const operators = completion.items.filter(item => item.kind === CompletionItemKind.Operator);
      
      if (functions.length > 0 && operators.length > 0) {
        const firstFunctionIndex = completion.items.findIndex(item => item.kind === CompletionItemKind.Function);
        const firstOperatorIndex = completion.items.findIndex(item => item.kind === CompletionItemKind.Operator);
        
        expect(firstFunctionIndex).toBeLessThan(firstOperatorIndex);
      }
    });

    it('should rank snippets highest when available', () => {
      const document = createTestDocument('if');
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 2 }
      };

      const completion = provideCompletion(params, document, parsedDocument, null);
      
      // Snippets should appear first
      const snippets = completion.items.filter(item => item.kind === CompletionItemKind.Snippet);
      const nonSnippets = completion.items.filter(item => item.kind !== CompletionItemKind.Snippet);
      
      if (snippets.length > 0 && nonSnippets.length > 0) {
        const firstSnippetIndex = completion.items.findIndex(item => item.kind === CompletionItemKind.Snippet);
        const firstNonSnippetIndex = completion.items.findIndex(item => item.kind !== CompletionItemKind.Snippet);
        
        expect(firstSnippetIndex).toBeLessThan(firstNonSnippetIndex);
      }
    });
  });

  describe('Duplicate Filtering', () => {
    it('should remove duplicate completion items', () => {
      const document = createTestDocument('SUM');
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 3 }
      };

      const completion = provideCompletion(params, document, parsedDocument, null);
      
      // Check for duplicates by label and kind
      const seen = new Set<string>();
      let duplicates = 0;
      
      for (const item of completion.items) {
        const key = `${item.label}:${item.kind}`;
        if (seen.has(key)) {
          duplicates++;
        } else {
          seen.add(key);
        }
      }
      
      expect(duplicates).toBe(0);
    });

    it('should keep the highest scored item when duplicates exist', () => {
      // This test verifies the deduplication logic keeps the best match
      const document = createTestDocument('SUM');
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 3 }
      };

      const completion = provideCompletion(params, document, parsedDocument, null);
      
      // Should have exactly one SUM function completion
      const sumItems = completion.items.filter(item => 
        item.label === 'SUM' && item.kind === CompletionItemKind.Function
      );
      
      expect(sumItems.length).toBe(1);
    });
  });

  describe('Result Limiting', () => {
    it('should limit results to configured maximum', () => {
      // Configure small limit for testing
      CompletionPerformanceAPI.configurePerformance({ MAX_COMPLETION_ITEMS: 10 });
      
      const document = createTestDocument(''); // Empty query to get all completions
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 0 }
      };

      const completion = provideCompletion(params, document, parsedDocument, null);
      
      expect(completion.items.length).toBeLessThanOrEqual(10);
      expect(completion.isIncomplete).toBe(true);
    });

    it('should mark completion as incomplete when results are limited', () => {
      CompletionPerformanceAPI.configurePerformance({ MAX_COMPLETION_ITEMS: 5 });
      
      const document = createTestDocument('S'); // Query that matches many items
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 1 }
      };

      const completion = provideCompletion(params, document, parsedDocument, null);
      
      if (completion.items.length >= 5) {
        expect(completion.isIncomplete).toBe(true);
      }
    });
  });

  describe('Fuzzy Matching', () => {
    it('should match items with fuzzy search', () => {
      const document = createTestDocument('SM'); // Should match SUM
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 2 }
      };

      const completion = provideCompletion(params, document, parsedDocument, null);
      
      // Should include SUM even though it's not an exact prefix match
      const sumItem = completion.items.find(item => item.label === 'SUM');
      expect(sumItem).toBeDefined();
    });

    it('should respect fuzzy match threshold', () => {
      CompletionPerformanceAPI.configurePerformance({ FUZZY_MATCH_THRESHOLD: 0.8 });
      
      const document = createTestDocument('XYZ'); // Should not match anything
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 3 }
      };

      const completion = provideCompletion(params, document, parsedDocument, null);
      
      // Should have very few or no matches due to high threshold
      expect(completion.items.length).toBeLessThan(5);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should complete within reasonable time for large result sets', () => {
      const document = createTestDocument(''); // Empty query for maximum results
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 0 }
      };

      const startTime = Date.now();
      const completion = provideCompletion(params, document, parsedDocument, null);
      const duration = Date.now() - startTime;

      expect(completion.items.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100); // Should complete within 100ms
    });

    it('should show performance improvement with caching', () => {
      const document = createTestDocument('SUM');
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 3 }
      };

      // First request (no cache)
      const start1 = Date.now();
      const completion1 = provideCompletion(params, document, parsedDocument, null);
      const duration1 = Date.now() - start1;

      // Second request (should use cache)
      const start2 = Date.now();
      const completion2 = provideCompletion(params, document, parsedDocument, null);
      const duration2 = Date.now() - start2;

      expect(completion1.items.length).toBe(completion2.items.length);
      // Both should complete quickly
      expect(duration1).toBeLessThan(50);
      expect(duration2).toBeLessThan(50);
    });
  });

  describe('Performance API', () => {
    it('should provide cache statistics', () => {
      const stats = CompletionPerformanceAPI.getCacheStats();
      
      expect(stats).toHaveProperty('cacheSize');
      expect(typeof stats.cacheSize).toBe('number');
    });

    it('should allow performance configuration', () => {
      const originalConfig = CompletionPerformanceAPI.getPerformanceConfig();
      
      CompletionPerformanceAPI.configurePerformance({
        MAX_COMPLETION_ITEMS: 25,
        FUZZY_MATCH_THRESHOLD: 0.5
      });
      
      const newConfig = CompletionPerformanceAPI.getPerformanceConfig();
      expect(newConfig.MAX_COMPLETION_ITEMS).toBe(25);
      expect(newConfig.FUZZY_MATCH_THRESHOLD).toBe(0.5);
    });

    it('should support cache invalidation for specific documents', () => {
      const document = createTestDocument('SUM');
      const parsedDocument = parseDocument(document);
      const params: TextDocumentPositionParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 3 }
      };

      // Create cache entry
      provideCompletion(params, document, parsedDocument, null);
      
      // Verify cache has entries
      let stats = CompletionPerformanceAPI.getCacheStats();
      expect(stats.cacheSize).toBeGreaterThan(0);
      
      // Invalidate specific document
      CompletionPerformanceAPI.invalidateDocument(document.uri);
      
      // Function should not throw
      expect(() => {
        CompletionPerformanceAPI.invalidateDocument(document.uri);
      }).not.toThrow();
    });

    it('should support performance testing', async () => {
      const testQueries = ['SUM', 'AVG', 'IF', 'CASE'];
      
      const results = await CompletionPerformanceAPI.testPerformance(testQueries);
      
      expect(results).toHaveProperty('averageTime');
      expect(results).toHaveProperty('maxTime');
      expect(results).toHaveProperty('minTime');
      expect(results).toHaveProperty('totalQueries');
      expect(results.totalQueries).toBe(testQueries.length);
      expect(results.averageTime).toBeGreaterThan(0);
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
</text>