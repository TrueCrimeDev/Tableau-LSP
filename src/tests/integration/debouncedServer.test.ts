// src/tests/integration/debouncedServer.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, CompletionParams, HoverParams } from 'vscode-languageserver';
import { globalDebouncer, RequestType } from '../../requestDebouncer.js';

describe('Debounced Server Integration', () => {
  beforeEach(() => {
    // Reset debouncer state
    globalDebouncer.flushAllRequests();
  });

  afterEach(async () => {
    await globalDebouncer.flushAllRequests();
  });

  describe('Rapid Typing Scenarios', () => {
    it('should handle rapid completion requests efficiently', async () => {
      const document = createTestDocument(`
        IF [Sales] > 100 THEN
          SUM(
      `);

      const mockCompletionHandler = jest.fn().mockResolvedValue({
        items: [
          { label: 'SUM', kind: 3 },
          { label: 'AVG', kind: 3 },
          { label: 'COUNT', kind: 3 }
        ]
      });

      // Simulate rapid typing by making multiple completion requests
      const positions = [
        { line: 2, character: 14 }, // After 'SUM('
        { line: 2, character: 15 },
        { line: 2, character: 16 },
        { line: 2, character: 17 },
        { line: 2, character: 18 }
      ];

      const startTime = Date.now();
      const promises = positions.map(position => 
        globalDebouncer.debounceRequest(
          RequestType.COMPLETION,
          { document, position },
          mockCompletionHandler,
          document.uri,
          position
        )
      );

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(1000);
      
      // Should have debounced effectively (not all requests executed)
      expect(mockCompletionHandler.mock.calls.length).toBeLessThan(positions.length);
      
      // All promises should resolve to the same result
      results.forEach(result => {
        expect(result.items).toHaveLength(3);
      });
    });

    it('should prioritize hover requests over completion requests', async () => {
      const document = createTestDocument('SUM([Sales])');
      
      const completionHandler = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ items: [] }), 200))
      );
      const hoverHandler = jest.fn().mockResolvedValue({
        contents: 'SUM function documentation'
      });

      const completionPosition: Position = { line: 0, character: 4 };
      const hoverPosition: Position = { line: 0, character: 0 };

      // Start completion request first (lower priority)
      const completionPromise = globalDebouncer.debounceRequest(
        RequestType.COMPLETION,
        { document, position: completionPosition },
        completionHandler,
        document.uri,
        completionPosition
      );

      // Start hover request shortly after (higher priority)
      await new Promise(resolve => setTimeout(resolve, 50));
      const hoverPromise = globalDebouncer.debounceRequest(
        RequestType.HOVER,
        { document, position: hoverPosition },
        hoverHandler,
        document.uri,
        hoverPosition
      );

      const startTime = Date.now();
      const hoverResult = await hoverPromise;
      const hoverDuration = Date.now() - startTime;

      expect(hoverResult.contents).toBe('SUM function documentation');
      expect(hoverDuration).toBeLessThan(150); // Hover should complete quickly

      // Complete the completion request
      await completionPromise;
    });

    it('should handle mixed request types during rapid editing', async () => {
      const document = createTestDocument(`
        IF [Sales] > 100 THEN
          "High Sales"
        ELSE
          "Low Sales"
        END
      `);

      const handlers = {
        completion: jest.fn().mockResolvedValue({ items: [] }),
        hover: jest.fn().mockResolvedValue({ contents: 'Hover info' }),
        signatureHelp: jest.fn().mockResolvedValue({ signatures: [] }),
        diagnostics: jest.fn().mockResolvedValue([])
      };

      // Simulate rapid editing with mixed request types
      const requests = [
        { type: RequestType.COMPLETION, position: { line: 1, character: 10 } },
        { type: RequestType.HOVER, position: { line: 1, character: 11 } },
        { type: RequestType.COMPLETION, position: { line: 1, character: 12 } },
        { type: RequestType.SIGNATURE_HELP, position: { line: 1, character: 13 } },
        { type: RequestType.DIAGNOSTICS, position: undefined },
        { type: RequestType.HOVER, position: { line: 1, character: 14 } }
      ];

      const promises = requests.map(req => {
        const handler = req.type === RequestType.COMPLETION ? handlers.completion :
                       req.type === RequestType.HOVER ? handlers.hover :
                       req.type === RequestType.SIGNATURE_HELP ? handlers.signatureHelp :
                       handlers.diagnostics;

        return globalDebouncer.debounceRequest(
          req.type,
          { document, position: req.position },
          handler,
          document.uri,
          req.position
        );
      });

      const results = await Promise.all(promises);

      // All requests should complete
      expect(results).toHaveLength(6);
      
      // Diagnostics should execute immediately (critical priority)
      expect(handlers.diagnostics).toHaveBeenCalled();
      
      // Other handlers should be called but potentially debounced
      expect(handlers.hover).toHaveBeenCalled();
      expect(handlers.completion).toHaveBeenCalled();
      expect(handlers.signatureHelp).toHaveBeenCalled();
    });
  });

  describe('Document Lifecycle Integration', () => {
    it('should clear requests when document is closed', async () => {
      const document = createTestDocument('SUM([Sales])');
      
      const handler = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('result'), 500))
      );

      // Start a long-running request
      const requestPromise = globalDebouncer.debounceRequest(
        RequestType.FORMATTING,
        { document },
        handler,
        document.uri
      );

      // Simulate document close
      globalDebouncer.clearDocumentRequests(document.uri);

      // The request should be cancelled (won't resolve)
      const stats = globalDebouncer.getDebounceStats();
      expect(stats.pendingRequests).toBe(0);
    });

    it('should handle multiple documents independently', async () => {
      const document1 = createTestDocument('SUM([Sales])', 1, 'test://doc1.twbl');
      const document2 = createTestDocument('AVG([Profit])', 1, 'test://doc2.twbl');
      
      const handler1 = jest.fn().mockResolvedValue('doc1-result');
      const handler2 = jest.fn().mockResolvedValue('doc2-result');

      const [result1, result2] = await Promise.all([
        globalDebouncer.debounceRequest(
          RequestType.HOVER,
          { document: document1 },
          handler1,
          document1.uri,
          { line: 0, character: 0 }
        ),
        globalDebouncer.debounceRequest(
          RequestType.HOVER,
          { document: document2 },
          handler2,
          document2.uri,
          { line: 0, character: 0 }
        )
      ]);

      expect(result1).toBe('doc1-result');
      expect(result2).toBe('doc2-result');
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('Performance Under Load', () => {
    it('should maintain responsiveness with many concurrent requests', async () => {
      const documents = Array.from({ length: 10 }, (_, i) => 
        createTestDocument(`SUM([Sales${i}])`, 1, `test://doc${i}.twbl`)
      );

      const handler = jest.fn().mockResolvedValue('load-test-result');

      const startTime = Date.now();
      
      // Create many concurrent requests across different documents
      const promises = documents.flatMap(doc => 
        Array.from({ length: 5 }, (_, i) => 
          globalDebouncer.debounceRequest(
            RequestType.COMPLETION,
            { document: doc, query: `test${i}` },
            handler,
            doc.uri,
            { line: 0, character: i }
          )
        )
      );

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(50);
      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
      
      // Should have debounced effectively
      expect(handler.mock.calls.length).toBeLessThan(50);
    });

    it('should handle error recovery during high load', async () => {
      const document = createTestDocument('SUM([Sales])');
      
      const errorHandler = jest.fn().mockRejectedValue(new Error('Handler error'));
      const successHandler = jest.fn().mockResolvedValue('success');

      // Mix error and success requests
      const promises = [
        ...Array.from({ length: 5 }, (_, i) => 
          globalDebouncer.debounceRequest(
            RequestType.COMPLETION,
            { document, query: `error${i}` },
            errorHandler,
            document.uri,
            { line: 0, character: i }
          ).catch(err => ({ error: err.message }))
        ),
        ...Array.from({ length: 5 }, (_, i) => 
          globalDebouncer.debounceRequest(
            RequestType.HOVER,
            { document, query: `success${i}` },
            successHandler,
            document.uri,
            { line: 0, character: i + 10 }
          )
        )
      ];

      const results = await Promise.all(promises);

      // Should have both error and success results
      const errors = results.filter(r => r && typeof r === 'object' && 'error' in r);
      const successes = results.filter(r => r === 'success');

      expect(errors.length).toBeGreaterThan(0);
      expect(successes.length).toBeGreaterThan(0);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide accurate statistics during operation', async () => {
      const document = createTestDocument('SUM([Sales])');
      const handler = jest.fn().mockResolvedValue('stats-result');

      // Start multiple requests
      const promises = [
        globalDebouncer.debounceRequest(
          RequestType.HOVER,
          { document },
          handler,
          document.uri,
          { line: 0, character: 0 }
        ),
        globalDebouncer.debounceRequest(
          RequestType.COMPLETION,
          { document },
          handler,
          document.uri,
          { line: 0, character: 1 }
        ),
        globalDebouncer.debounceRequest(
          RequestType.COMPLETION,
          { document },
          handler,
          document.uri,
          { line: 0, character: 2 }
        )
      ];

      // Check stats while requests are pending
      const statsDuringExecution = globalDebouncer.getDebounceStats();
      expect(statsDuringExecution.pendingRequests).toBeGreaterThan(0);

      await Promise.all(promises);

      // Check final stats
      const finalStats = globalDebouncer.getDebounceStats();
      expect(finalStats.requestCounts[RequestType.HOVER]).toBeGreaterThan(0);
      expect(finalStats.requestCounts[RequestType.COMPLETION]).toBeGreaterThan(0);
    });

    it('should track queue sizes accurately', async () => {
      // Configure completion to batch at size 3
      globalDebouncer.configureDebouncing(RequestType.COMPLETION, {
        enableBatching: true,
        batchSize: 3
      });

      const document = createTestDocument('SUM([Sales])');
      const handler = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('batch-result'), 100))
      );

      // Start requests that will be queued
      const promises = Array.from({ length: 5 }, (_, i) => 
        globalDebouncer.debounceRequest(
          RequestType.COMPLETION,
          { document, query: `batch${i}` },
          handler,
          document.uri,
          { line: 0, character: i }
        )
      );

      // Check queue size
      const stats = globalDebouncer.getDebounceStats();
      expect(stats.queueSizes[RequestType.COMPLETION]).toBeGreaterThan(0);

      await Promise.all(promises);
    });
  });

  describe('Configuration Integration', () => {
    it('should respect runtime configuration changes', async () => {
      const document = createTestDocument('SUM([Sales])');
      const handler = jest.fn().mockResolvedValue('config-result');

      // Configure very short delay for testing
      globalDebouncer.configureDebouncing(RequestType.HOVER, {
        delay: 10,
        maxDelay: 50
      });

      const startTime = Date.now();
      const result = await globalDebouncer.debounceRequest(
        RequestType.HOVER,
        { document },
        handler,
        document.uri,
        { line: 0, character: 0 }
      );
      const duration = Date.now() - startTime;

      expect(result).toBe('config-result');
      expect(duration).toBeLessThan(100); // Should respect short delay
    });

    it('should handle debouncing decisions based on load', () => {
      const shouldDebounceHover = globalDebouncer.shouldDebounce(RequestType.HOVER);
      const shouldDebounceCompletion = globalDebouncer.shouldDebounce(RequestType.COMPLETION);

      expect(typeof shouldDebounceHover).toBe('boolean');
      expect(typeof shouldDebounceCompletion).toBe('boolean');
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
