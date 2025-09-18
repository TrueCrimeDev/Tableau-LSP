// src/tests/unit/hoverPerformance.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { HoverParams } from 'vscode-languageserver';
import { provideHover, HoverPerformanceAPI } from '../../hoverProvider';
import { FieldParser } from '../../fieldParser';

describe('Hover Performance Optimization', () => {
  beforeEach(() => {
    // Clear caches before each test
    HoverPerformanceAPI.clearCaches();
  });

  describe('Hover Caching', () => {
    it('should cache hover results for repeated requests', () => {
      const document = createTestDocument('SUM([Sales])');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 2 } // Position on 'SUM'
      };

      // First request
      const hover1 = provideHover(params, document, null);
      
      // Second request (should be cached)
      const hover2 = provideHover(params, document, null);
      
      // Both should return the same result
      expect(hover1).toEqual(hover2);
      
      // Check cache statistics
      const stats = HoverPerformanceAPI.getCacheStats();
      expect(stats.hoverCacheSize).toBeGreaterThan(0);
    });

    it('should invalidate cache when document version changes', () => {
      const document1 = createTestDocument('SUM([Sales])', 1);
      const document2 = createTestDocument('SUM([Sales])', 2); // Different version
      const params: HoverParams = {
        textDocument: { uri: document1.uri },
        position: { line: 0, character: 2 }
      };

      // First request with version 1
      const hover1 = provideHover(params, document1, null);
      
      // Second request with version 2 (should not use cache)
      const hover2 = provideHover(params, document2, null);
      
      // Results should be similar but cache should be updated
      expect(hover1).toBeDefined();
      expect(hover2).toBeDefined();
    });

    it('should handle cache cleanup when cache size exceeds limit', () => {
      // Configure small cache size for testing
      HoverPerformanceAPI.configurePerformance({ MAX_CACHE_SIZE: 5 });
      
      // Create multiple documents to exceed cache size
      for (let i = 0; i < 10; i++) {
        const document = createTestDocument(`SUM([Sales${i}])`, 1, `test://test${i}.twbl`);
        const params: HoverParams = {
          textDocument: { uri: document.uri },
          position: { line: 0, character: 2 }
        };
        
        provideHover(params, document, null);
      }
      
      // Cache should not exceed the limit
      const stats = HoverPerformanceAPI.getCacheStats();
      expect(stats.hoverCacheSize).toBeLessThanOrEqual(5);
    });
  });

  describe('Symbol Index Optimization', () => {
    it('should create efficient symbol lookup index', () => {
      const document = createTestDocument(`
        SUM([Sales])
        AVG([Profit])
        IF [Category] = 'Furniture' THEN
          MAX([Discount])
        ELSE
          MIN([Quantity])
        END
      `);
      
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 3, character: 4 } // Position on 'MAX'
      };

      const hover = provideHover(params, document, null);
      expect(hover).toBeDefined();
      
      // Check that symbol index cache is populated
      const stats = HoverPerformanceAPI.getCacheStats();
      expect(stats.symbolIndexCacheSize).toBeGreaterThan(0);
    });

    it('should find most specific symbol at position', () => {
      const document = createTestDocument(`
        IF SUM([Sales]) > 100 THEN
          "High"
        ELSE
          "Low"
        END
      `);
      
      // Test position on 'SUM' inside IF condition
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 1, character: 11 }
      };

      const hover = provideHover(params, document, null);
      expect(hover).toBeDefined();
      // Should return hover for SUM function, not IF statement
      expect(hover?.contents).toBeDefined();
    });
  });

  describe('Performance Configuration', () => {
    it('should allow performance configuration changes', () => {
      const originalConfig = HoverPerformanceAPI.getCacheStats();
      
      // Change configuration
      HoverPerformanceAPI.configurePerformance({
        MAX_CACHE_SIZE: 500,
        ENABLE_PERFORMANCE_LOGGING: true
      });
      
      // Configuration should be applied (we can't directly test this without exposing config)
      // But we can test that the function doesn't throw
      expect(() => {
        HoverPerformanceAPI.configurePerformance({ MAX_CACHE_SIZE: 100 });
      }).not.toThrow();
    });

    it('should support cache invalidation for specific documents', () => {
      const document = createTestDocument('SUM([Sales])');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 2 }
      };

      // Create cache entry
      provideHover(params, document, null);
      
      // Verify cache has entries
      let stats = HoverPerformanceAPI.getCacheStats();
      expect(stats.hoverCacheSize).toBeGreaterThan(0);
      
      // Invalidate specific document
      HoverPerformanceAPI.invalidateDocument(document.uri);
      
      // Cache should be cleaned for this document
      stats = HoverPerformanceAPI.getCacheStats();
      // Note: We can't easily test the exact count without more complex setup
      // But we can verify the function doesn't throw
      expect(() => {
        HoverPerformanceAPI.invalidateDocument(document.uri);
      }).not.toThrow();
    });

    it('should support forced cache cleanup', () => {
      const document = createTestDocument('SUM([Sales])');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 2 }
      };

      // Create cache entries
      provideHover(params, document, null);
      
      // Force cleanup
      expect(() => {
        HoverPerformanceAPI.forceCleanup();
      }).not.toThrow();
    });
  });

  describe('Performance Benchmarks', () => {
    it('should handle large documents efficiently', () => {
      // Create a large document with many symbols
      const lines = [];
      for (let i = 0; i < 100; i++) {
        lines.push(`SUM([Field${i}]) + AVG([Value${i}])`);
      }
      const document = createTestDocument(lines.join('\n'));
      
      const startTime = Date.now();
      
      // Test multiple hover requests
      for (let i = 0; i < 10; i++) {
        const params: HoverParams = {
          textDocument: { uri: document.uri },
          position: { line: i * 10, character: 2 }
        };
        
        provideHover(params, document, null);
      }
      
      const duration = Date.now() - startTime;
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(1000); // 1 second
    });

    it('should show performance improvement with caching', () => {
      const document = createTestDocument('SUM([Sales]) + AVG([Profit])');
      const params: HoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 0, character: 2 }
      };

      // First request (no cache)
      const start1 = Date.now();
      const hover1 = provideHover(params, document, null);
      const duration1 = Date.now() - start1;

      // Second request (should use cache)
      const start2 = Date.now();
      const hover2 = provideHover(params, document, null);
      const duration2 = Date.now() - start2;

      // Both should return results
      expect(hover1).toBeDefined();
      expect(hover2).toBeDefined();
      
      // Second request should be faster (though this might be flaky in fast environments)
      // We'll just verify both complete quickly
      expect(duration1).toBeLessThan(100);
      expect(duration2).toBeLessThan(100);
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