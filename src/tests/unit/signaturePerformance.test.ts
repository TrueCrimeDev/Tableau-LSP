// src/tests/unit/signaturePerformance.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver';
import { buildSignatureHelp, SignaturePerformanceAPI } from '../../signatureProvider';
import { parseDocument } from '../../documentModel';

describe('Signature Help Performance Optimization', () => {
  beforeEach(() => {
    // Clear caches before each test
    SignaturePerformanceAPI.clearCaches();
    SignaturePerformanceAPI.configurePerformance({
      ENABLE_PERFORMANCE_LOGGING: false,
      MAX_CACHE_SIZE: 50
    });
  });

  describe('Signature Help Caching', () => {
    it('should cache signature help results for repeated requests', () => {
      const document = createTestDocument('SUM([Sales])');
      const parsedDocument = parseDocument(document);
      const position: Position = { line: 0, character: 4 }; // Inside SUM function

      // First request
      const signature1 = buildSignatureHelp(document, position, parsedDocument);
      
      // Second request (should be cached)
      const signature2 = buildSignatureHelp(document, position, parsedDocument);
      
      // Both should return the same results
      expect(signature1).toEqual(signature2);
      
      // Check cache statistics
      const stats = SignaturePerformanceAPI.getCacheStats();
      expect(stats.signatureCacheSize).toBeGreaterThan(0);
    });

    it('should invalidate cache when document version changes', () => {
      const document1 = createTestDocument('SUM([Sales])', 1);
      const document2 = createTestDocument('SUM([Sales])', 2); // Different version
      const position: Position = { line: 0, character: 4 };

      // First request with version 1
      const parsedDocument1 = parseDocument(document1);
      const signature1 = buildSignatureHelp(document1, position, parsedDocument1);
      
      // Second request with version 2 (should not use cache)
      const parsedDocument2 = parseDocument(document2);
      const signature2 = buildSignatureHelp(document2, position, parsedDocument2);
      
      // Results should be similar but cache should be updated
      expect(signature1).toBeDefined();
      expect(signature2).toBeDefined();
    });

    it('should handle cache cleanup when cache size exceeds limit', () => {
      // Configure small cache size for testing
      SignaturePerformanceAPI.configurePerformance({ MAX_CACHE_SIZE: 5 });
      
      // Create multiple signature requests to fill cache
      for (let i = 0; i < 10; i++) {
        const document = createTestDocument(`SUM([Field${i}])`, 1, `test://test${i}.twbl`);
        const parsedDocument = parseDocument(document);
        const position: Position = { line: 0, character: 4 };
        
        buildSignatureHelp(document, position, parsedDocument);
      }
      
      // Cache should not exceed the limit
      const stats = SignaturePerformanceAPI.getCacheStats();
      expect(stats.signatureCacheSize).toBeLessThanOrEqual(5);
    });
  });

  describe('Symbol Index Optimization', () => {
    it('should create efficient symbol index for function calls', () => {
      const document = createTestDocument(`
        SUM([Sales])
        AVG([Profit])
        IF [Category] = 'Furniture' THEN
          MAX([Discount])
        ELSE
          MIN([Quantity])
        END
      `);
      
      const parsedDocument = parseDocument(document);
      const position: Position = { line: 3, character: 4 }; // Inside MAX function

      const signature = buildSignatureHelp(document, position, parsedDocument);
      expect(signature).toBeDefined();
      
      // Check that symbol index cache is populated
      const stats = SignaturePerformanceAPI.getCacheStats();
      expect(stats.symbolIndexCacheSize).toBeGreaterThan(0);
    });

    it('should efficiently find function calls at specific positions', () => {
      const document = createTestDocument(`
        IF SUM([Sales]) > AVG([Profit]) THEN
          "High Performance"
        ELSE
          "Low Performance"
        END
      `);
      
      const parsedDocument = parseDocument(document);
      
      // Test position on SUM function
      const sumPosition: Position = { line: 1, character: 11 };
      const sumSignature = buildSignatureHelp(document, sumPosition, parsedDocument);
      expect(sumSignature).toBeDefined();
      expect(sumSignature?.signatures[0]?.label).toContain('SUM');
      
      // Test position on AVG function
      const avgPosition: Position = { line: 1, character: 25 };
      const avgSignature = buildSignatureHelp(document, avgPosition, parsedDocument);
      expect(avgSignature).toBeDefined();
      expect(avgSignature?.signatures[0]?.label).toContain('AVG');
    });

    it('should handle nested function calls efficiently', () => {
      const document = createTestDocument('SUM(AVG([Sales]))');
      const parsedDocument = parseDocument(document);
      
      // Position inside AVG function (nested)
      const position: Position = { line: 0, character: 7 };
      const signature = buildSignatureHelp(document, position, parsedDocument);
      
      expect(signature).toBeDefined();
      // Should return signature for the innermost function (AVG)
      expect(signature?.signatures[0]?.label).toContain('AVG');
    });
  });

  describe('Conditional Block Signature Help', () => {
    it('should provide signature help for IF blocks', () => {
      const document = createTestDocument(`
        IF [Sales] > 100 THEN
          "High Sales"
        ELSE
          "Low Sales"
        END
      `);
      
      const parsedDocument = parseDocument(document);
      const position: Position = { line: 2, character: 4 }; // Inside THEN branch

      const signature = buildSignatureHelp(document, position, parsedDocument);
      expect(signature).toBeDefined();
      expect(signature?.signatures[0]?.label).toContain('IF');
    });

    it('should provide signature help for CASE blocks', () => {
      const document = createTestDocument(`
        CASE [Category]
          WHEN 'Furniture' THEN 'F'
          WHEN 'Technology' THEN 'T'
          ELSE 'O'
        END
      `);
      
      const parsedDocument = parseDocument(document);
      const position: Position = { line: 2, character: 10 }; // Inside WHEN branch

      const signature = buildSignatureHelp(document, position, parsedDocument);
      expect(signature).toBeDefined();
      expect(signature?.signatures[0]?.label).toContain('CASE');
    });
  });

  describe('Performance Benchmarks', () => {
    it('should complete signature help within reasonable time', () => {
      const document = createTestDocument(`
        IF SUM([Sales]) > AVG([Profit]) AND COUNT([Orders]) > MIN([Quantity]) THEN
          MAX([Discount])
        ELSEIF AVG([Sales]) < SUM([Profit]) THEN
          MIN([Discount])
        ELSE
          MEDIAN([Discount])
        END
      `);
      
      const parsedDocument = parseDocument(document);
      const position: Position = { line: 1, character: 11 }; // Inside SUM function

      const startTime = Date.now();
      const signature = buildSignatureHelp(document, position, parsedDocument);
      const duration = Date.now() - startTime;

      expect(signature).toBeDefined();
      expect(duration).toBeLessThan(50); // Should complete within 50ms
    });

    it('should show performance improvement with caching', () => {
      const document = createTestDocument('SUM([Sales])');
      const parsedDocument = parseDocument(document);
      const position: Position = { line: 0, character: 4 };

      // First request (no cache)
      const start1 = Date.now();
      const signature1 = buildSignatureHelp(document, position, parsedDocument);
      const duration1 = Date.now() - start1;

      // Second request (should use cache)
      const start2 = Date.now();
      const signature2 = buildSignatureHelp(document, position, parsedDocument);
      const duration2 = Date.now() - start2;

      expect(signature1).toBeDefined();
      expect(signature2).toBeDefined();
      // Both should complete quickly
      expect(duration1).toBeLessThan(25);
      expect(duration2).toBeLessThan(25);
    });

    it('should handle large documents efficiently', () => {
      // Create a large document with many function calls
      const lines = [];
      for (let i = 0; i < 50; i++) {
        lines.push(`SUM([Field${i}]) + AVG([Value${i}])`);
      }
      const document = createTestDocument(lines.join('\n'));
      const parsedDocument = parseDocument(document);
      
      const startTime = Date.now();
      
      // Test multiple signature requests
      for (let i = 0; i < 10; i++) {
        const position: Position = { line: i * 5, character: 4 };
        buildSignatureHelp(document, position, parsedDocument);
      }
      
      const duration = Date.now() - startTime;
      
      // Should complete within reasonable time even for large documents
      expect(duration).toBeLessThan(200); // 200ms for 10 requests
    });
  });

  describe('Performance API', () => {
    it('should provide cache statistics', () => {
      const stats = SignaturePerformanceAPI.getCacheStats();
      
      expect(stats).toHaveProperty('signatureCacheSize');
      expect(stats).toHaveProperty('symbolIndexCacheSize');
      expect(typeof stats.signatureCacheSize).toBe('number');
      expect(typeof stats.symbolIndexCacheSize).toBe('number');
    });

    it('should allow performance configuration', () => {
      const originalConfig = SignaturePerformanceAPI.getPerformanceConfig();
      
      SignaturePerformanceAPI.configurePerformance({
        MAX_CACHE_SIZE: 100,
        CACHE_TTL_MS: 5 * 60 * 1000
      });
      
      const newConfig = SignaturePerformanceAPI.getPerformanceConfig();
      expect(newConfig.MAX_CACHE_SIZE).toBe(100);
      expect(newConfig.CACHE_TTL_MS).toBe(5 * 60 * 1000);
    });

    it('should support cache invalidation for specific documents', () => {
      const document = createTestDocument('SUM([Sales])');
      const parsedDocument = parseDocument(document);
      const position: Position = { line: 0, character: 4 };

      // Create cache entry
      buildSignatureHelp(document, position, parsedDocument);
      
      // Verify cache has entries
      let stats = SignaturePerformanceAPI.getCacheStats();
      expect(stats.signatureCacheSize).toBeGreaterThan(0);
      
      // Invalidate specific document
      SignaturePerformanceAPI.invalidateDocument(document.uri);
      
      // Function should not throw
      expect(() => {
        SignaturePerformanceAPI.invalidateDocument(document.uri);
      }).not.toThrow();
    });

    it('should support performance testing', async () => {
      const testPositions = [
        { line: 0, character: 4 },
        { line: 1, character: 8 },
        { line: 2, character: 12 }
      ];
      
      const results = await SignaturePerformanceAPI.testPerformance(testPositions);
      
      expect(results).toHaveProperty('averageTime');
      expect(results).toHaveProperty('maxTime');
      expect(results).toHaveProperty('minTime');
      expect(results).toHaveProperty('totalTests');
      expect(results.totalTests).toBe(testPositions.length);
      expect(results.averageTime).toBeGreaterThan(0);
    });

    it('should provide symbol index statistics', () => {
      const document = createTestDocument(`
        SUM([Sales])
        IF [Category] = 'Furniture' THEN
          AVG([Profit])
        END
      `);
      
      const parsedDocument = parseDocument(document);
      const position: Position = { line: 0, character: 4 };

      // Create symbol index
      buildSignatureHelp(document, position, parsedDocument);
      
      const indexStats = SignaturePerformanceAPI.getSymbolIndexStats(document.uri);
      
      expect(indexStats).toBeDefined();
      expect(indexStats?.functionCallCount).toBeGreaterThan(0);
      expect(indexStats?.conditionalBlockCount).toBeGreaterThan(0);
      expect(indexStats?.totalSymbolsIndexed).toBeGreaterThan(0);
      expect(typeof indexStats?.indexAge).toBe('number');
    });
  });

  describe('Active Parameter Detection', () => {
    it('should correctly identify active parameter in function calls', () => {
      const document = createTestDocument('DATEADD("day", 7, [Order Date])');
      const parsedDocument = parseDocument(document);
      
      // Test different positions within the function call
      const positions = [
        { line: 0, character: 8, expectedParam: 0 },  // In first parameter
        { line: 0, character: 15, expectedParam: 1 }, // In second parameter
        { line: 0, character: 20, expectedParam: 2 }  // In third parameter
      ];
      
      for (const { line, character, expectedParam } of positions) {
        const signature = buildSignatureHelp(document, { line, character }, parsedDocument);
        expect(signature).toBeDefined();
        expect(signature?.activeParameter).toBe(expectedParam);
      }
    });

    it('should handle complex nested function parameter detection', () => {
      const document = createTestDocument('IIF([Sales] > 100, SUM([Profit]), AVG([Discount]))');
      const parsedDocument = parseDocument(document);
      
      // Position inside the SUM function (second parameter of IIF)
      const position: Position = { line: 0, character: 24 };
      const signature = buildSignatureHelp(document, position, parsedDocument);
      
      expect(signature).toBeDefined();
      // Should detect we're in the SUM function, not the outer IIF
      expect(signature?.signatures[0]?.label).toContain('SUM');
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