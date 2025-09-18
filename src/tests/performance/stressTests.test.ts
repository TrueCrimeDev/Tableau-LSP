// src/tests/performance/stressTests.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseDocument } from '../../documentModel';
import { provideHover } from '../../hoverProvider';
import { provideCompletion } from '../../completionProvider';
import { getDiagnostics } from '../../diagnosticsProvider';
import { globalMemoryManager } from '../../memoryManager';
import { globalDebouncer } from '../../requestDebouncer';
import { PerformanceUtils } from './setup';

/**
 * R8.3: Stress Tests for Tableau LSP
 * 
 * High-load testing scenarios including large documents, concurrent requests,
 * memory pressure, and sustained operations.
 */

describe('Stress Tests', () => {
  describe('Large Document Performance', () => {
    test('should handle large documents within acceptable limits', async () => {
      const content = PerformanceUtils.generateTestContent('large');
      const thresholds = PerformanceUtils.createThresholds('large');

      const measurement = await PerformanceUtils.measureOperation(
        () => {
          const document = PerformanceUtils.createTestDocument(content);
          return parseDocument(document);
        },
        3 // Fewer iterations for large documents
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration);
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput);

      console.log(`Performance: ${JSON.stringify({
        operation: 'large_document',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta,
        documentSize: content.length
      })}`);
    });

    test('should provide LSP features on large documents efficiently', async () => {
      const content = PerformanceUtils.generateTestContent('large');
      const document = PerformanceUtils.createTestDocument(content);
      const parsedDocument = parseDocument(document);
      const thresholds = PerformanceUtils.createThresholds('large');

      const measurement = await PerformanceUtils.measureOperation(
        async () => {
          const results = await Promise.all([
            provideHover(
              { textDocument: { uri: document.uri }, position: { line: 10, character: 4 } },
              document,
              null
            ),
            provideCompletion(
              { textDocument: { uri: document.uri }, position: { line: 20, character: 8 } },
              document,
              parsedDocument,
              null
            ),
            getDiagnostics(document, parsedDocument)
          ]);
          return results.length;
        },
        2
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration * 2);
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput / 2);

      console.log(`Performance: ${JSON.stringify({
        operation: 'large_document_lsp',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta
      })}`);
    });
  });

  describe('Concurrent Request Handling', () => {
    test('should handle multiple concurrent parsing requests', async () => {
      const contents = [
        PerformanceUtils.generateTestContent('simple'),
        PerformanceUtils.generateTestContent('medium'),
        PerformanceUtils.generateTestContent('complex')
      ];
      const thresholds = PerformanceUtils.createThresholds('concurrent');

      const measurement = await PerformanceUtils.measureOperation(
        async () => {
          const promises = contents.map((content, index) => {
            const document = PerformanceUtils.createTestDocument(content, 1, `test://concurrent${index}.twbl`);
            return parseDocument(document);
          });
          
          const results = await Promise.all(promises);
          return results.length;
        },
        10
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration);
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput);

      console.log(`Performance: ${JSON.stringify({
        operation: 'concurrent_parsing',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta
      })}`);
    });

    test('should handle mixed concurrent LSP requests', async () => {
      const content = PerformanceUtils.generateTestContent('medium');
      const document = PerformanceUtils.createTestDocument(content);
      const parsedDocument = parseDocument(document);
      const thresholds = PerformanceUtils.createThresholds('concurrent');

      const measurement = await PerformanceUtils.measureOperation(
        async () => {
          const promises = [
            provideHover(
              { textDocument: { uri: document.uri }, position: { line: 1, character: 4 } },
              document,
              null
            ),
            provideCompletion(
              { textDocument: { uri: document.uri }, position: { line: 1, character: 8 } },
              document,
              parsedDocument,
              null
            ),
            getDiagnostics(document, parsedDocument),
            provideHover(
              { textDocument: { uri: document.uri }, position: { line: 2, character: 6 } },
              document,
              null
            ),
            provideCompletion(
              { textDocument: { uri: document.uri }, position: { line: 3, character: 10 } },
              document,
              parsedDocument,
              null
            )
          ];
          
          const results = await Promise.all(promises);
          return results.length;
        },
        8
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration);
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput);

      console.log(`Performance: ${JSON.stringify({
        operation: 'concurrent_lsp',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta
      })}`);
    });

    test('should handle rapid sequential requests with debouncing', async () => {
      const content = 'SUM([Sales]) + AVG([Profit])';
      const document = PerformanceUtils.createTestDocument(content);
      const thresholds = PerformanceUtils.createThresholds('concurrent');

      const measurement = await PerformanceUtils.measureOperation(
        async () => {
          // Simulate rapid typing with multiple hover requests
          const promises = [];
          for (let i = 0; i < 10; i++) {
            promises.push(
              provideHover(
                { textDocument: { uri: document.uri }, position: { line: 0, character: i + 1 } },
                document,
                null
              )
            );
          }
          
          const results = await Promise.all(promises);
          return results.length;
        },
        5
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration);
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput);

      console.log(`Performance: ${JSON.stringify({
        operation: 'rapid_requests',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta
      })}`);
    });
  });

  describe('Memory Pressure Tests', () => {
    test('should handle multiple documents without excessive memory usage', async () => {
      const thresholds = PerformanceUtils.createThresholds('memory');
      const documentCount = 20;

      const measurement = await PerformanceUtils.measureOperation(
        async () => {
          const documents = [];
          
          // Create and parse multiple documents
          for (let i = 0; i < documentCount; i++) {
            const content = `
// Document ${i}
IF SUM([Sales${i}]) > ${i * 1000} THEN
    AVG([Profit${i}]) * ${i + 1}
ELSE
    COUNT([Orders${i}])
END
            `.trim();
            
            const document = PerformanceUtils.createTestDocument(content, 1, `test://memory${i}.twbl`);
            documents.push(document);
            
            globalMemoryManager.markDocumentActive(document.uri);
            parseDocument(document);
          }
          
          // Clean up
          documents.forEach(doc => {
            globalMemoryManager.markDocumentInactive(doc.uri);
          });
          
          return documents.length;
        },
        3
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration);
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput);

      console.log(`Performance: ${JSON.stringify({
        operation: 'memory_pressure',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta,
        documentCount
      })}`);
    });

    test('should recover from memory pressure through cleanup', async () => {
      const thresholds = PerformanceUtils.createThresholds('memory');

      // Create memory pressure
      const documents = [];
      for (let i = 0; i < 30; i++) {
        const content = PerformanceUtils.generateLargeContent(50);
        const document = PerformanceUtils.createTestDocument(content, 1, `test://pressure${i}.twbl`);
        documents.push(document);
        
        globalMemoryManager.markDocumentActive(document.uri);
        parseDocument(document);
      }

      const beforeCleanup = globalMemoryManager.getMemoryStats();

      const measurement = await PerformanceUtils.measureOperation(
        async () => {
          // Mark documents as inactive
          documents.forEach(doc => {
            globalMemoryManager.markDocumentInactive(doc.uri);
          });
          
          // Force cleanup
          return await globalMemoryManager.forceCleanup('normal');
        },
        3
      );

      const afterCleanup = globalMemoryManager.getMemoryStats();
      const memoryRecovered = beforeCleanup.usedMemoryMB - afterCleanup.usedMemoryMB;

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration);
      expect(memoryRecovered).toBeGreaterThan(0); // Should recover some memory

      console.log(`Performance: ${JSON.stringify({
        operation: 'memory_cleanup',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryRecovered,
        cleanupEfficiency: (memoryRecovered / beforeCleanup.usedMemoryMB) * 100
      })}`);
    });
  });

  describe('Sustained Load Tests', () => {
    test('should maintain performance under sustained parsing load', async () => {
      const thresholds = PerformanceUtils.createThresholds('parsing');
      const iterations = 100;
      const durations: number[] = [];

      // Measure performance over sustained load
      for (let i = 0; i < iterations; i++) {
        const content = PerformanceUtils.generateTestContent(i % 4 === 0 ? 'complex' : 'medium');
        const document = PerformanceUtils.createTestDocument(content);
        
        const start = performance.now();
        parseDocument(document);
        const end = performance.now();
        
        durations.push(end - start);
        
        // Cleanup every 10 iterations
        if (i % 10 === 0) {
          globalMemoryManager.markDocumentInactive(document.uri);
        }
      }

      const averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
      const firstQuarter = durations.slice(0, 25).reduce((sum, d) => sum + d, 0) / 25;
      const lastQuarter = durations.slice(-25).reduce((sum, d) => sum + d, 0) / 25;
      const performanceDegradation = ((lastQuarter - firstQuarter) / firstQuarter) * 100;

      expect(averageDuration).toBeLessThan(thresholds.maxDuration);
      expect(performanceDegradation).toBeLessThan(50); // Less than 50% degradation

      console.log(`Performance: ${JSON.stringify({
        operation: 'sustained_load',
        averageDuration,
        firstQuarterAvg: firstQuarter,
        lastQuarterAvg: lastQuarter,
        performanceDegradation,
        iterations
      })}`);
    });

    test('should handle sustained LSP feature requests', async () => {
      const content = PerformanceUtils.generateTestContent('medium');
      const document = PerformanceUtils.createTestDocument(content);
      const parsedDocument = parseDocument(document);
      const thresholds = PerformanceUtils.createThresholds('hover');
      
      const iterations = 50;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        
        await Promise.all([
          provideHover(
            { textDocument: { uri: document.uri }, position: { line: 0, character: i % 10 } },
            document,
            null
          ),
          provideCompletion(
            { textDocument: { uri: document.uri }, position: { line: 1, character: (i + 5) % 15 } },
            document,
            parsedDocument,
            null
          )
        ]);
        
        const end = performance.now();
        durations.push(end - start);
      }

      const averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
      const firstHalf = durations.slice(0, 25).reduce((sum, d) => sum + d, 0) / 25;
      const secondHalf = durations.slice(-25).reduce((sum, d) => sum + d, 0) / 25;
      const performanceDegradation = ((secondHalf - firstHalf) / firstHalf) * 100;

      expect(averageDuration).toBeLessThan(thresholds.maxDuration * 2); // Allow 2x for combined operations
      expect(performanceDegradation).toBeLessThan(30); // Less than 30% degradation

      console.log(`Performance: ${JSON.stringify({
        operation: 'sustained_lsp',
        averageDuration,
        firstHalfAvg: firstHalf,
        secondHalfAvg: secondHalf,
        performanceDegradation,
        iterations
      })}`);
    });
  });

  describe('Error Recovery Performance', () => {
    test('should handle malformed documents efficiently', async () => {
      const errorContent = `
IF SUM([Sales] > 1000 THEN
    UNKNOWN_FUNCTION([Profit])
ELSEIF AVG([Sales]) > 500 THEN
    COUNT([Orders]
ELSE
    "Low"
END
      `.trim();
      
      const thresholds = PerformanceUtils.createThresholds('error');

      const measurement = await PerformanceUtils.measureOperation(
        () => {
          const document = PerformanceUtils.createTestDocument(errorContent);
          return parseDocument(document);
        },
        15
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration);
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput);

      console.log(`Performance: ${JSON.stringify({
        operation: 'error_recovery',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta
      })}`);
    });

    test('should provide diagnostics for error-prone documents efficiently', async () => {
      const errorContent = `
IF SUM([Sales] > 1000 THEN
    UNKNOWN_FUNCTION([Profit])
ELSEIF AVG([Sales]) > 500 THEN
    COUNT([Orders]
ELSE
    "Low"
END
      `.trim();
      
      const document = PerformanceUtils.createTestDocument(errorContent);
      const parsedDocument = parseDocument(document);
      const thresholds = PerformanceUtils.createThresholds('error');

      const measurement = await PerformanceUtils.measureOperation(
        () => {
          return getDiagnostics(document, parsedDocument);
        },
        15
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration);
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput);

      console.log(`Performance: ${JSON.stringify({
        operation: 'error_diagnostics',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta
      })}`);
    });
  });

  describe('Cache Performance Tests', () => {
    test('should demonstrate cache effectiveness', async () => {
      const content = 'SUM([Sales]) + AVG([Profit])';
      const document = PerformanceUtils.createTestDocument(content);
      const thresholds = PerformanceUtils.createThresholds('cache');

      // First parse (cache miss)
      const cacheMissMeasurement = await PerformanceUtils.measureOperation(
        () => {
          return parseDocument(document);
        },
        1
      );

      // Subsequent parses (cache hits)
      const cacheHitMeasurement = await PerformanceUtils.measureOperation(
        () => {
          return parseDocument(document);
        },
        20
      );

      const speedupRatio = cacheMissMeasurement.duration / (cacheHitMeasurement.duration / cacheHitMeasurement.iterations);

      expect(cacheHitMeasurement).toHaveAverageDurationBelow(thresholds.maxDuration);
      expect(cacheHitMeasurement).toHaveThroughputAbove(thresholds.minThroughput);
      expect(speedupRatio).toBeGreaterThan(2); // Cache should provide at least 2x speedup

      console.log(`Performance: ${JSON.stringify({
        operation: 'cache_effectiveness',
        cacheMissDuration: cacheMissMeasurement.duration,
        cacheHitAvgDuration: cacheHitMeasurement.duration / cacheHitMeasurement.iterations,
        speedupRatio,
        cacheHitThroughput: cacheHitMeasurement.throughput
      })}`);
    });
  });
});