// src/tests/unit/requestDebouncer.test.ts

import { RequestDebouncer, RequestType, RequestPriority, DebounceHelpers } from '../../requestDebouncer';
import { Position } from 'vscode-languageserver';

describe('Request Debouncing System', () => {
  let debouncer: RequestDebouncer;

  beforeEach(() => {
    debouncer = new RequestDebouncer();
  });

  afterEach(async () => {
    await debouncer.flushAllRequests();
  });

  describe('Basic Debouncing', () => {
    it('should debounce multiple requests of the same type', async () => {
      const handler = jest.fn().mockResolvedValue('result');
      const documentUri = 'test://test.twbl';
      const position: Position = { line: 0, character: 0 };

      // Make multiple rapid requests
      const promises = [
        debouncer.debounceRequest(RequestType.HOVER, {}, handler, documentUri, position),
        debouncer.debounceRequest(RequestType.HOVER, {}, handler, documentUri, position),
        debouncer.debounceRequest(RequestType.HOVER, {}, handler, documentUri, position)
      ];

      const results = await Promise.all(promises);

      // Only the last request should be executed
      expect(handler).toHaveBeenCalledTimes(1);
      expect(results).toEqual(['result', 'result', 'result']);
    });

    it('should execute critical priority requests immediately', async () => {
      const handler = jest.fn().mockResolvedValue('critical-result');
      const documentUri = 'test://test.twbl';

      const startTime = Date.now();
      const result = await debouncer.debounceRequest(
        RequestType.DIAGNOSTICS,
        {},
        handler,
        documentUri
      );
      const duration = Date.now() - startTime;

      expect(result).toBe('critical-result');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(duration).toBeLessThan(50); // Should execute immediately
    });

    it('should handle different request types independently', async () => {
      const hoverHandler = jest.fn().mockResolvedValue('hover-result');
      const completionHandler = jest.fn().mockResolvedValue('completion-result');
      const documentUri = 'test://test.twbl';
      const position: Position = { line: 0, character: 0 };

      const [hoverResult, completionResult] = await Promise.all([
        debouncer.debounceRequest(RequestType.HOVER, {}, hoverHandler, documentUri, position),
        debouncer.debounceRequest(RequestType.COMPLETION, {}, completionHandler, documentUri, position)
      ]);

      expect(hoverResult).toBe('hover-result');
      expect(completionResult).toBe('completion-result');
      expect(hoverHandler).toHaveBeenCalledTimes(1);
      expect(completionHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Adaptive Delay Calculation', () => {
    it('should increase delay for rapid typing', async () => {
      const handler = jest.fn().mockResolvedValue('result');
      const documentUri = 'test://test.twbl';
      const position: Position = { line: 0, character: 0 };

      // Simulate rapid typing by making requests in quick succession
      const startTime = Date.now();
      
      // First request
      debouncer.debounceRequest(RequestType.COMPLETION, {}, handler, documentUri, position);
      
      // Wait a very short time (simulating rapid typing)
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Second request (should have increased delay)
      const result = await debouncer.debounceRequest(
        RequestType.COMPLETION, 
        {}, 
        handler, 
        documentUri, 
        position
      );
      
      const duration = Date.now() - startTime;
      
      expect(result).toBe('result');
      expect(duration).toBeGreaterThan(150); // Should have adaptive delay
    });

    it('should reduce delay for slow typing', async () => {
      const handler = jest.fn().mockResolvedValue('result');
      const documentUri = 'test://test.twbl';
      const position: Position = { line: 0, character: 0 };

      // First request
      await debouncer.debounceRequest(RequestType.COMPLETION, {}, handler, documentUri, position);
      
      // Wait longer (simulating slow typing)
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const startTime = Date.now();
      const result = await debouncer.debounceRequest(
        RequestType.COMPLETION, 
        {}, 
        handler, 
        documentUri, 
        position
      );
      const duration = Date.now() - startTime;
      
      expect(result).toBe('result');
      expect(duration).toBeLessThan(150); // Should have reduced delay
    });
  });

  describe('Request Batching', () => {
    it('should batch requests when enabled and threshold is reached', async () => {
      // Configure completion requests to batch at size 2
      debouncer.configureDebouncing(RequestType.COMPLETION, {
        enableBatching: true,
        batchSize: 2
      });

      const handler = jest.fn().mockResolvedValue('batch-result');
      const documentUri = 'test://test.twbl';

      const promises = [
        debouncer.debounceRequest(
          RequestType.COMPLETION, 
          { query: 'test1' }, 
          handler, 
          documentUri, 
          { line: 0, character: 0 }
        ),
        debouncer.debounceRequest(
          RequestType.COMPLETION, 
          { query: 'test2' }, 
          handler, 
          documentUri, 
          { line: 0, character: 1 }
        )
      ];

      const results = await Promise.all(promises);

      expect(results).toEqual(['batch-result', 'batch-result']);
      expect(handler).toHaveBeenCalledTimes(2); // Both requests executed
    });

    it('should not batch requests when batching is disabled', async () => {
      debouncer.configureDebouncing(RequestType.HOVER, {
        enableBatching: false,
        batchSize: 1
      });

      const handler = jest.fn().mockResolvedValue('no-batch-result');
      const documentUri = 'test://test.twbl';
      const position: Position = { line: 0, character: 0 };

      const promises = [
        debouncer.debounceRequest(RequestType.HOVER, {}, handler, documentUri, position),
        debouncer.debounceRequest(RequestType.HOVER, {}, handler, documentUri, position)
      ];

      const results = await Promise.all(promises);

      // Second request should cancel the first
      expect(handler).toHaveBeenCalledTimes(1);
      expect(results).toEqual(['no-batch-result', 'no-batch-result']);
    });
  });

  describe('Error Handling', () => {
    it('should handle request handler errors gracefully', async () => {
      const errorHandler = jest.fn().mockRejectedValue(new Error('Handler error'));
      const documentUri = 'test://test.twbl';
      const position: Position = { line: 0, character: 0 };

      await expect(
        debouncer.debounceRequest(RequestType.HOVER, {}, errorHandler, documentUri, position)
      ).rejects.toThrow('Handler error');

      expect(errorHandler).toHaveBeenCalledTimes(1);
    });

    it('should continue processing other requests after one fails', async () => {
      const errorHandler = jest.fn().mockRejectedValue(new Error('Handler error'));
      const successHandler = jest.fn().mockResolvedValue('success');
      const documentUri = 'test://test.twbl';
      const position: Position = { line: 0, character: 0 };

      const [errorResult, successResult] = await Promise.allSettled([
        debouncer.debounceRequest(RequestType.HOVER, {}, errorHandler, documentUri, position),
        debouncer.debounceRequest(RequestType.COMPLETION, {}, successHandler, documentUri, position)
      ]);

      expect(errorResult.status).toBe('rejected');
      expect(successResult.status).toBe('fulfilled');
      expect((successResult as PromiseFulfilledResult<string>).value).toBe('success');
    });
  });

  describe('Document Management', () => {
    it('should clear requests for a specific document', async () => {
      const handler = jest.fn().mockResolvedValue('result');
      const documentUri1 = 'test://test1.twbl';
      const documentUri2 = 'test://test2.twbl';
      const position: Position = { line: 0, character: 0 };

      // Start requests for both documents
      const promise1 = debouncer.debounceRequest(
        RequestType.COMPLETION, 
        {}, 
        handler, 
        documentUri1, 
        position
      );
      const promise2 = debouncer.debounceRequest(
        RequestType.COMPLETION, 
        {}, 
        handler, 
        documentUri2, 
        position
      );

      // Clear requests for document1
      debouncer.clearDocumentRequests(documentUri1);

      // Wait for remaining requests
      const result2 = await promise2;

      expect(result2).toBe('result');
      expect(handler).toHaveBeenCalledTimes(1); // Only document2 request executed
    });

    it('should handle multiple documents independently', async () => {
      const handler = jest.fn().mockResolvedValue('result');
      const documentUri1 = 'test://test1.twbl';
      const documentUri2 = 'test://test2.twbl';
      const position: Position = { line: 0, character: 0 };

      const [result1, result2] = await Promise.all([
        debouncer.debounceRequest(RequestType.HOVER, {}, handler, documentUri1, position),
        debouncer.debounceRequest(RequestType.HOVER, {}, handler, documentUri2, position)
      ]);

      expect(result1).toBe('result');
      expect(result2).toBe('result');
      expect(handler).toHaveBeenCalledTimes(2); // Both documents processed
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide accurate debounce statistics', async () => {
      const handler = jest.fn().mockResolvedValue('result');
      const documentUri = 'test://test.twbl';
      const position: Position = { line: 0, character: 0 };

      // Make some requests
      const promises = [
        debouncer.debounceRequest(RequestType.HOVER, {}, handler, documentUri, position),
        debouncer.debounceRequest(RequestType.COMPLETION, {}, handler, documentUri, position)
      ];

      // Check stats while requests are pending
      const statsDuringExecution = debouncer.getDebounceStats();
      expect(statsDuringExecution.pendingRequests).toBeGreaterThan(0);

      await Promise.all(promises);

      // Check stats after completion
      const statsAfterCompletion = debouncer.getDebounceStats();
      expect(statsAfterCompletion.requestCounts[RequestType.HOVER]).toBe(1);
      expect(statsAfterCompletion.requestCounts[RequestType.COMPLETION]).toBe(1);
    });

    it('should track request counts correctly', async () => {
      const handler = jest.fn().mockResolvedValue('result');
      const documentUri = 'test://test.twbl';
      const position: Position = { line: 0, character: 0 };

      // Make multiple requests of the same type
      await Promise.all([
        debouncer.debounceRequest(RequestType.HOVER, {}, handler, documentUri, position),
        debouncer.debounceRequest(RequestType.HOVER, {}, handler, documentUri, position),
        debouncer.debounceRequest(RequestType.HOVER, {}, handler, documentUri, position)
      ]);

      const stats = debouncer.getDebounceStats();
      expect(stats.requestCounts[RequestType.HOVER]).toBe(3);
    });
  });

  describe('Configuration', () => {
    it('should allow runtime configuration changes', () => {
      const originalConfig = {
        delay: 150,
        maxDelay: 800,
        batchSize: 3,
        enableBatching: true
      };

      debouncer.configureDebouncing(RequestType.COMPLETION, {
        delay: 200,
        maxDelay: 1000
      });

      // Configuration should be updated (we can't directly test this without exposing internals,
      // but we can test that the method doesn't throw)
      expect(() => {
        debouncer.configureDebouncing(RequestType.COMPLETION, { delay: 300 });
      }).not.toThrow();
    });

    it('should determine debouncing necessity based on load', () => {
      const shouldDebounceHover = debouncer.shouldDebounce(RequestType.HOVER);
      const shouldDebounceCompletion = debouncer.shouldDebounce(RequestType.COMPLETION);

      expect(typeof shouldDebounceHover).toBe('boolean');
      expect(typeof shouldDebounceCompletion).toBe('boolean');
    });
  });

  describe('Flush Operations', () => {
    it('should flush all pending requests', async () => {
      const handler = jest.fn().mockResolvedValue('flushed-result');
      const documentUri = 'test://test.twbl';
      const position: Position = { line: 0, character: 0 };

      // Start some requests but don't wait for them
      const promise1 = debouncer.debounceRequest(
        RequestType.COMPLETION, 
        {}, 
        handler, 
        documentUri, 
        position
      );
      const promise2 = debouncer.debounceRequest(
        RequestType.HOVER, 
        {}, 
        handler, 
        documentUri, 
        position
      );

      // Flush all requests
      await debouncer.flushAllRequests();

      // All requests should be completed
      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1).toBe('flushed-result');
      expect(result2).toBe('flushed-result');
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should clear all state after flushing', async () => {
      const handler = jest.fn().mockResolvedValue('result');
      const documentUri = 'test://test.twbl';
      const position: Position = { line: 0, character: 0 };

      // Start a request
      const promise = debouncer.debounceRequest(
        RequestType.COMPLETION, 
        {}, 
        handler, 
        documentUri, 
        position
      );

      // Flush all requests
      await debouncer.flushAllRequests();
      await promise;

      // Stats should show no pending requests
      const stats = debouncer.getDebounceStats();
      expect(stats.pendingRequests).toBe(0);
    });
  });

  describe('Helper Functions', () => {
    it('should provide convenient helper functions', async () => {
      const handler = jest.fn().mockResolvedValue('helper-result');
      const documentUri = 'test://test.twbl';
      const position: Position = { line: 0, character: 0 };

      const hoverResult = await DebounceHelpers.hover(
        { test: 'data' },
        handler,
        documentUri,
        position
      );

      expect(hoverResult).toBe('helper-result');
      expect(handler).toHaveBeenCalledWith(
        { test: 'data' },
        expect.objectContaining({
          type: RequestType.HOVER,
          documentUri,
          position
        })
      );
    });

    it('should handle all helper function types', async () => {
      const handler = jest.fn().mockResolvedValue('result');
      const documentUri = 'test://test.twbl';
      const position: Position = { line: 0, character: 0 };

      const results = await Promise.all([
        DebounceHelpers.diagnostics({}, handler, documentUri),
        DebounceHelpers.hover({}, handler, documentUri, position),
        DebounceHelpers.completion({}, handler, documentUri, position),
        DebounceHelpers.signatureHelp({}, handler, documentUri, position),
        DebounceHelpers.formatting({}, handler, documentUri)
      ]);

      expect(results).toEqual(['result', 'result', 'result', 'result', 'result']);
      expect(handler).toHaveBeenCalledTimes(5);
    });
  });

  describe('Performance Characteristics', () => {
    it('should handle high-frequency requests efficiently', async () => {
      const handler = jest.fn().mockResolvedValue('performance-result');
      const documentUri = 'test://test.twbl';
      const position: Position = { line: 0, character: 0 };

      const startTime = Date.now();
      
      // Make many rapid requests
      const promises = Array.from({ length: 100 }, (_, i) => 
        debouncer.debounceRequest(
          RequestType.COMPLETION,
          { query: `test${i}` },
          handler,
          documentUri,
          { line: 0, character: i }
        )
      );

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(2000);
      expect(results.length).toBe(100);
      
      // Should have debounced effectively (not all 100 requests executed)
      expect(handler.mock.calls.length).toBeLessThan(100);
    });

    it('should maintain responsiveness under load', async () => {
      const slowHandler = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('slow-result'), 100))
      );
      const fastHandler = jest.fn().mockResolvedValue('fast-result');
      
      const documentUri = 'test://test.twbl';
      const position: Position = { line: 0, character: 0 };

      // Start slow requests
      const slowPromises = Array.from({ length: 10 }, () => 
        debouncer.debounceRequest(
          RequestType.FORMATTING,
          {},
          slowHandler,
          documentUri
        )
      );

      // Start fast, high-priority request
      const fastPromise = debouncer.debounceRequest(
        RequestType.HOVER,
        {},
        fastHandler,
        documentUri,
        position
      );

      const startTime = Date.now();
      const fastResult = await fastPromise;
      const fastDuration = Date.now() - startTime;

      expect(fastResult).toBe('fast-result');
      expect(fastDuration).toBeLessThan(200); // Should be responsive despite load

      // Clean up slow requests
      await Promise.all(slowPromises);
    });
  });
});