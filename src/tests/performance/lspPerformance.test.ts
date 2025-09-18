// src/tests/performance/lspPerformance.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseDocument } from '../../documentModel';
import { provideHover } from '../../hoverProvider';
import { provideCompletion } from '../../completionProvider';
import { buildSignatureHelp } from '../../signatureProvider';
import { getDiagnostics } from '../../diagnosticsProvider';
import { format } from '../../format';
import { IncrementalParser } from '../../incrementalParser';
import { FieldParser } from '../../fieldParser';
import { PerformanceUtils } from './setup';

/**
 * R8.3: LSP Feature Performance Tests
 * 
 * Comprehensive performance testing for all LSP features including
 * parsing, hover, completion, signature help, diagnostics, and formatting.
 */

describe('LSP Feature Performance Tests', () => {
  let fieldParser: FieldParser | null = null;

  beforeAll(() => {
    // Initialize field parser if available
    const fieldDefinitionPath = FieldParser.findDefinitionFile(__dirname);
    if (fieldDefinitionPath) {
      fieldParser = new FieldParser(fieldDefinitionPath);
    }
  });

  describe('Document Parsing Performance', () => {
    test('should parse simple expressions efficiently', async () => {
      const content = PerformanceUtils.generateTestContent('simple');
      const thresholds = PerformanceUtils.createThresholds('parsing');

      const measurement = await PerformanceUtils.measureOperation(
        () => {
          const document = PerformanceUtils.createTestDocument(content);
          return parseDocument(document);
        },
        20
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration);
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput);

      console.log(`Performance: ${JSON.stringify({
        operation: 'simple_parsing',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta
      })}`);
    });

    test('should parse medium complexity expressions efficiently', async () => {
      const content = PerformanceUtils.generateTestContent('medium');
      const thresholds = PerformanceUtils.createThresholds('parsing');

      const measurement = await PerformanceUtils.measureOperation(
        () => {
          const document = PerformanceUtils.createTestDocument(content);
          return parseDocument(document);
        },
        15
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration);
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput);

      console.log(`Performance: ${JSON.stringify({
        operation: 'medium_parsing',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta
      })}`);
    });

    test('should parse complex expressions within acceptable limits', async () => {
      const content = PerformanceUtils.generateTestContent('complex');
      const thresholds = PerformanceUtils.createThresholds('parsing');

      const measurement = await PerformanceUtils.measureOperation(
        () => {
          const document = PerformanceUtils.createTestDocument(content);
          return parseDocument(document);
        },
        10
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration * 2); // Allow 2x for complex
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta * 2);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput / 2);

      console.log(`Performance: ${JSON.stringify({
        operation: 'complex_parsing',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta
      })}`);
    });
  });

  describe('Hover Provider Performance', () => {
    test('should provide hover information quickly', async () => {
      const content = 'SUM([Sales]) + AVG([Profit])';
      const document = PerformanceUtils.createTestDocument(content);
      const thresholds = PerformanceUtils.createThresholds('hover');

      const measurement = await PerformanceUtils.measureOperation(
        async () => {
          return await provideHover(
            { textDocument: { uri: document.uri }, position: { line: 0, character: 1 } },
            document,
            fieldParser
          );
        },
        30
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration);
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput);

      console.log(`Performance: ${JSON.stringify({
        operation: 'hover',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta
      })}`);
    });

    test('should handle hover on complex expressions efficiently', async () => {
      const content = PerformanceUtils.generateTestContent('complex');
      const document = PerformanceUtils.createTestDocument(content);
      const thresholds = PerformanceUtils.createThresholds('hover');

      const measurement = await PerformanceUtils.measureOperation(
        async () => {
          return await provideHover(
            { textDocument: { uri: document.uri }, position: { line: 5, character: 10 } },
            document,
            fieldParser
          );
        },
        20
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration * 1.5);
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput / 1.5);

      console.log(`Performance: ${JSON.stringify({
        operation: 'hover_complex',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta
      })}`);
    });
  });

  describe('Completion Provider Performance', () => {
    test('should provide completions quickly', async () => {
      const content = 'SUM([Sales]) + A';
      const document = PerformanceUtils.createTestDocument(content);
      const parsedDocument = parseDocument(document);
      const thresholds = PerformanceUtils.createThresholds('completion');

      const measurement = await PerformanceUtils.measureOperation(
        async () => {
          return await provideCompletion(
            { textDocument: { uri: document.uri }, position: { line: 0, character: 15 } },
            document,
            parsedDocument,
            fieldParser
          );
        },
        25
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration);
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput);

      console.log(`Performance: ${JSON.stringify({
        operation: 'completion',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta
      })}`);
    });

    test('should handle completion in complex contexts efficiently', async () => {
      const content = PerformanceUtils.generateTestContent('complex') + '\\nSU';
      const document = PerformanceUtils.createTestDocument(content);
      const parsedDocument = parseDocument(document);
      const thresholds = PerformanceUtils.createThresholds('completion');

      const measurement = await PerformanceUtils.measureOperation(
        async () => {
          const lines = content.split('\\n');
          return await provideCompletion(
            { textDocument: { uri: document.uri }, position: { line: lines.length - 1, character: 2 } },
            document,
            parsedDocument,
            fieldParser
          );
        },
        15
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration * 1.5);
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput / 1.5);

      console.log(`Performance: ${JSON.stringify({
        operation: 'completion_complex',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta
      })}`);
    });
  });

  describe('Signature Help Performance', () => {
    test('should provide signature help quickly', async () => {
      const content = 'SUM([Sales';
      const document = PerformanceUtils.createTestDocument(content);
      const parsedDocument = parseDocument(document);
      const thresholds = PerformanceUtils.createThresholds('signature');

      const measurement = await PerformanceUtils.measureOperation(
        () => {
          return buildSignatureHelp(document, { line: 0, character: 10 }, parsedDocument);
        },
        30
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration);
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput);

      console.log(`Performance: ${JSON.stringify({
        operation: 'signature',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta
      })}`);
    });

    test('should handle nested function signatures efficiently', async () => {
      const content = 'IF(SUM([Sales]) > AVG([Profit';
      const document = PerformanceUtils.createTestDocument(content);
      const parsedDocument = parseDocument(document);
      const thresholds = PerformanceUtils.createThresholds('signature');

      const measurement = await PerformanceUtils.measureOperation(
        () => {
          return buildSignatureHelp(document, { line: 0, character: 30 }, parsedDocument);
        },
        25
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration);
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput);

      console.log(`Performance: ${JSON.stringify({
        operation: 'signature_nested',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta
      })}`);
    });
  });

  describe('Diagnostics Performance', () => {
    test('should validate documents quickly', async () => {
      const content = PerformanceUtils.generateTestContent('medium');
      const document = PerformanceUtils.createTestDocument(content);
      const parsedDocument = parseDocument(document);
      const thresholds = PerformanceUtils.createThresholds('diagnostics');

      const measurement = await PerformanceUtils.measureOperation(
        () => {
          return getDiagnostics(document, parsedDocument);
        },
        20
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration);
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput);

      console.log(`Performance: ${JSON.stringify({
        operation: 'diagnostics',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta
      })}`);
    });

    test('should handle error-prone documents efficiently', async () => {
      const content = `
IF SUM([Sales] > 1000 THEN
    UNKNOWN_FUNCTION([Profit])
ELSEIF AVG([Sales]) > 500 THEN
    COUNT([Orders]
ELSE
    "Low"
END
      `.trim();
      
      const document = PerformanceUtils.createTestDocument(content);
      const parsedDocument = parseDocument(document);
      const thresholds = PerformanceUtils.createThresholds('diagnostics');

      const measurement = await PerformanceUtils.measureOperation(
        () => {
          return getDiagnostics(document, parsedDocument);
        },
        15
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration * 1.5);
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput / 1.5);

      console.log(`Performance: ${JSON.stringify({
        operation: 'diagnostics_errors',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta
      })}`);
    });
  });

  describe('Formatting Performance', () => {
    test('should format documents quickly', async () => {
      const content = PerformanceUtils.generateTestContent('medium');
      const document = PerformanceUtils.createTestDocument(content);
      const thresholds = PerformanceUtils.createThresholds('formatting');

      const measurement = await PerformanceUtils.measureOperation(
        () => {
          return format(document, { tabSize: 2, insertSpaces: true });
        },
        20
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration);
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput);

      console.log(`Performance: ${JSON.stringify({
        operation: 'formatting',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta
      })}`);
    });

    test('should handle complex formatting efficiently', async () => {
      const content = PerformanceUtils.generateTestContent('complex');
      const document = PerformanceUtils.createTestDocument(content);
      const thresholds = PerformanceUtils.createThresholds('formatting');

      const measurement = await PerformanceUtils.measureOperation(
        () => {
          return format(document, { tabSize: 4, insertSpaces: true });
        },
        15
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration * 1.5);
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput / 1.5);

      console.log(`Performance: ${JSON.stringify({
        operation: 'formatting_complex',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta
      })}`);
    });
  });

  describe('Incremental Parsing Performance', () => {
    test('should handle incremental updates efficiently', async () => {
      const initialContent = 'SUM([Sales])';
      let document = PerformanceUtils.createTestDocument(initialContent, 1);
      const thresholds = PerformanceUtils.createThresholds('incremental');

      // Initial parse
      IncrementalParser.parseDocumentIncremental(document);

      const measurement = await PerformanceUtils.measureOperation(
        () => {
          // Simulate document change
          const newContent = 'SUM([Sales]) + AVG([Profit])';
          document = PerformanceUtils.createTestDocument(newContent, document.version + 1, document.uri);
          return IncrementalParser.parseDocumentIncremental(document);
        },
        25
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration);
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput);

      console.log(`Performance: ${JSON.stringify({
        operation: 'incremental_parsing',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta
      })}`);
    });

    test('should benefit from caching', async () => {
      const content = 'SUM([Sales]) + AVG([Profit])';
      const document = PerformanceUtils.createTestDocument(content);
      const thresholds = PerformanceUtils.createThresholds('cache');

      // Prime the cache
      IncrementalParser.parseDocumentIncremental(document);

      const measurement = await PerformanceUtils.measureOperation(
        () => {
          return IncrementalParser.parseDocumentIncremental(document);
        },
        50
      );

      expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration);
      expect(measurement).toHaveMemoryUsageBelow(thresholds.maxMemoryDelta);
      expect(measurement).toHaveThroughputAbove(thresholds.minThroughput);

      console.log(`Performance: ${JSON.stringify({
        operation: 'cache_hit',
        averageDuration: measurement.duration / measurement.iterations,
        throughput: measurement.throughput,
        memoryDelta: measurement.memoryDelta
      })}`);
    });
  });
});