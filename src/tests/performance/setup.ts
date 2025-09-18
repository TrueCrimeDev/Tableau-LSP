// src/tests/performance/setup.ts

import { globalMemoryManager } from '../../memoryManager';
import { globalDebouncer } from '../../requestDebouncer';
import { IncrementalParser } from '../../incrementalParser';
import { parsedDocumentCache } from '../../common';

/**
 * R8.3: Performance test setup and utilities
 * 
 * This module provides setup and utilities specifically for performance testing,
 * including performance measurement helpers and environment configuration.
 */

// Extend Jest matchers for performance tests
declare global {
  namespace jest {
    interface Matchers<R> {
      toCompleteWithin(maxMs: number): R;
      toHaveMemoryUsageBelow(maxMB: number): R;
      toHaveThroughputAbove(minOpsPerSec: number): R;
      toHaveAverageDurationBelow(maxMs: number): R;
    }
  }
}

// Performance measurement utilities
interface PerformanceMeasurement {
  duration: number;
  memoryBefore: number;
  memoryAfter: number;
  memoryDelta: number;
  throughput: number;
  iterations: number;
}

// Custom Jest matchers for performance tests
expect.extend({
  toCompleteWithin(received: Promise<any>, maxMs: number) {
    const startTime = Date.now();
    
    return received.then(() => {
      const duration = Date.now() - startTime;
      const pass = duration <= maxMs;
      
      if (pass) {
        return {
          message: () => `Expected operation to take more than ${maxMs}ms, but completed in ${duration}ms`,
          pass: true,
        };
      } else {
        return {
          message: () => `Expected operation to complete within ${maxMs}ms, but took ${duration}ms`,
          pass: false,
        };
      }
    });
  },
  
  toHaveMemoryUsageBelow(received: PerformanceMeasurement, maxMB: number) {
    const actualUsage = received.memoryDelta;
    const pass = actualUsage <= maxMB;
    
    if (pass) {
      return {
        message: () => `Expected memory usage to be above ${maxMB}MB, but was ${actualUsage.toFixed(1)}MB`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected memory usage to be below ${maxMB}MB, but was ${actualUsage.toFixed(1)}MB`,
        pass: false,
      };
    }
  },
  
  toHaveThroughputAbove(received: PerformanceMeasurement, minOpsPerSec: number) {
    const actualThroughput = received.throughput;
    const pass = actualThroughput >= minOpsPerSec;
    
    if (pass) {
      return {
        message: () => `Expected throughput to be below ${minOpsPerSec} ops/sec, but was ${actualThroughput.toFixed(1)} ops/sec`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected throughput to be above ${minOpsPerSec} ops/sec, but was ${actualThroughput.toFixed(1)} ops/sec`,
        pass: false,
      };
    }
  },
  
  toHaveAverageDurationBelow(received: PerformanceMeasurement, maxMs: number) {
    const avgDuration = received.duration / received.iterations;
    const pass = avgDuration <= maxMs;
    
    if (pass) {
      return {
        message: () => `Expected average duration to be above ${maxMs}ms, but was ${avgDuration.toFixed(2)}ms`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected average duration to be below ${maxMs}ms, but was ${avgDuration.toFixed(2)}ms`,
        pass: false,
      };
    }
  }
});

// Global setup for performance tests
beforeAll(async () => {
  console.log('⚡ Setting up performance test environment...');
  
  // Configure memory manager for performance testing
  globalMemoryManager.configure({
    maxMemoryMB: 500, // Higher limit for performance tests
    cleanupThresholdMB: 400,
    monitoringIntervalMs: 10000, // Less frequent monitoring
    enableAutoCleanup: true,
    enableMemoryLogging: false // Reduce noise
  });
  
  // Configure request debouncer for performance testing
  globalDebouncer.configureDebouncing('DIAGNOSTICS', {
    delay: 10, // Minimal delay for performance tests
    maxDelay: 50
  });
  
  globalDebouncer.configureDebouncing('HOVER', {
    delay: 5,
    maxDelay: 25
  });
  
  globalDebouncer.configureDebouncing('COMPLETION', {
    delay: 10,
    maxDelay: 50
  });
  
  // Warm up the system
  console.log('🔥 Warming up system...');
  await warmUpSystem();
  
  console.log('✅ Performance test environment ready');
});

// Global teardown for performance tests
afterAll(async () => {
  console.log('🧹 Cleaning up performance test environment...');
  
  // Flush all pending requests
  await globalDebouncer.flushAllRequests();
  
  // Clear all caches
  IncrementalParser.clearAllCache();
  parsedDocumentCache.clear();
  
  // Force aggressive memory cleanup
  await globalMemoryManager.forceCleanup('aggressive');
  
  // Shutdown memory manager
  globalMemoryManager.shutdown();
  
  console.log('✅ Performance test cleanup complete');
});

// Setup for each test
beforeEach(async () => {
  // Clear caches before each test for consistent measurements
  parsedDocumentCache.clear();
  IncrementalParser.clearAllCache();
  
  // Flush any pending requests
  await globalDebouncer.flushAllRequests();
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  // Wait for system to stabilize
  await new Promise(resolve => setTimeout(resolve, 100));
});

// Cleanup after each test
afterEach(async () => {
  // Clean up test documents
  const testUris = Array.from(parsedDocumentCache.keys()).filter(uri => 
    uri.startsWith('test://')
  );
  
  testUris.forEach(uri => {
    globalMemoryManager.markDocumentInactive(uri);
    parsedDocumentCache.delete(uri);
  });
  
  // Flush any remaining requests
  await globalDebouncer.flushAllRequests();
});

/**
 * Warm up the system by running some operations
 */
async function warmUpSystem(): Promise<void> {
  const { TextDocument } = require('vscode-languageserver-textdocument');
  const { parseDocument } = require('../../documentModel');
  const { provideHover } = require('../../hoverProvider');
  
  // Create a simple test document
  const document = TextDocument.create(
    'test://warmup.twbl',
    'tableau',
    1,
    'SUM([Sales]) + AVG([Profit])'
  );
  
  // Warm up parsing
  for (let i = 0; i < 5; i++) {
    parseDocument(document);
  }
  
  // Warm up LSP features
  const parsedDocument = parseDocument(document);
  for (let i = 0; i < 3; i++) {
    await provideHover(
      { textDocument: { uri: document.uri }, position: { line: 0, character: 1 } },
      document,
      null
    );
  }
  
  // Clear warmup data
  parsedDocumentCache.clear();
}

/**
 * Performance measurement utilities
 */
export const PerformanceUtils = {
  /**
   * Measure the performance of an operation
   */
  async measureOperation<T>(
    operation: () => Promise<T> | T,
    iterations: number = 10
  ): Promise<PerformanceMeasurement> {
    const durations: number[] = [];
    const memoryBefore = globalMemoryManager.getMemoryStats().usedMemoryMB;
    
    // Warm up (not counted in measurements)
    await operation();
    
    // Measure iterations
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await operation();
      const end = performance.now();
      durations.push(end - start);
    }
    
    const memoryAfter = globalMemoryManager.getMemoryStats().usedMemoryMB;
    const memoryDelta = memoryAfter - memoryBefore;
    
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    const averageDuration = totalDuration / iterations;
    const throughput = 1000 / averageDuration; // operations per second
    
    return {
      duration: totalDuration,
      memoryBefore,
      memoryAfter,
      memoryDelta,
      throughput,
      iterations
    };
  },
  
  /**
   * Measure memory usage of an operation
   */
  async measureMemory<T>(operation: () => Promise<T> | T): Promise<{
    result: T;
    memoryDelta: number;
    peakMemory: number;
  }> {
    const beforeStats = globalMemoryManager.getMemoryStats();
    
    const result = await operation();
    
    const afterStats = globalMemoryManager.getMemoryStats();
    const memoryDelta = afterStats.usedMemoryMB - beforeStats.usedMemoryMB;
    const peakMemory = Math.max(beforeStats.usedMemoryMB, afterStats.usedMemoryMB);
    
    return {
      result,
      memoryDelta,
      peakMemory
    };
  },
  
  /**
   * Create a test document with automatic cleanup
   */
  createTestDocument(
    content: string,
    version: number = 1,
    uri?: string
  ): any {
    const { TextDocument } = require('vscode-languageserver-textdocument');
    
    const testUri = uri || `test://perf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.twbl`;
    const document = TextDocument.create(testUri, 'tableau', version, content);
    
    // Mark as active for memory management
    globalMemoryManager.markDocumentActive(testUri);
    
    return document;
  },
  
  /**
   * Generate test content of various complexities
   */
  generateTestContent(type: 'simple' | 'medium' | 'complex' | 'large'): string {
    switch (type) {
      case 'simple':
        return 'SUM([Sales])';
      
      case 'medium':
        return `
IF SUM([Sales]) > 1000 THEN
    AVG([Profit])
ELSE
    COUNT([Orders])
END
        `.trim();
      
      case 'complex':
        return `
IF ATTR([Region]) = "North" THEN
    CASE [Category]
    WHEN "Furniture" THEN
        IF SUM([Sales]) > 10000 THEN
            (SUM([Profit]) / SUM([Sales])) * 100
        ELSE
            0
        END
    WHEN "Technology" THEN
        {FIXED [Customer] : SUM([Sales])} / 
        {FIXED [Region] : SUM([Sales])}
    ELSE
        AVG([Profit Ratio])
    END
ELSEIF ATTR([Region]) = "South" THEN
    WINDOW_SUM(SUM([Sales])) / WINDOW_SUM(SUM([Sales]), FIRST(), LAST())
ELSE
    RANK(SUM([Sales]), 'desc')
END
        `.trim();
      
      case 'large':
        return this.generateLargeContent(200);
      
      default:
        return 'SUM([Sales])';
    }
  },
  
  /**
   * Generate large content for stress testing
   */
  generateLargeContent(lines: number): string {
    const content: string[] = [];
    
    for (let i = 0; i < lines; i++) {
      if (i % 20 === 0) {
        content.push(`// Section ${Math.floor(i / 20) + 1}`);
      }
      
      const functions = ['SUM', 'AVG', 'COUNT', 'MAX', 'MIN'];
      const fields = ['Sales', 'Profit', 'Orders', 'Quantity', 'Discount'];
      
      const func = functions[i % functions.length];
      const field = fields[i % fields.length];
      
      if (i % 10 === 0) {
        content.push(`IF ${func}([${field}]) > ${i * 100} THEN`);
        content.push(`    "High ${field}"`);
        content.push(`ELSE`);
        content.push(`    "Low ${field}"`);
        content.push(`END`);
      } else {
        content.push(`${func}([${field}${i}])`);
      }
    }
    
    return content.join('\n');
  },
  
  /**
   * Wait for system to stabilize
   */
  async waitForStabilization(maxWaitMs: number = 1000): Promise<void> {
    const startTime = Date.now();
    let lastMemoryUsage = globalMemoryManager.getMemoryStats().usedMemoryMB;
    
    while (Date.now() - startTime < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const currentMemoryUsage = globalMemoryManager.getMemoryStats().usedMemoryMB;
      const memoryChange = Math.abs(currentMemoryUsage - lastMemoryUsage);
      
      if (memoryChange < 0.1) { // Memory usage stabilized
        break;
      }
      
      lastMemoryUsage = currentMemoryUsage;
    }
  },
  
  /**
   * Create performance benchmark thresholds
   */
  createThresholds(operation: string): {
    maxDuration: number;
    maxMemoryDelta: number;
    minThroughput: number;
  } {
    const thresholds = {
      parsing: { maxDuration: 100, maxMemoryDelta: 5, minThroughput: 10 },
      hover: { maxDuration: 50, maxMemoryDelta: 2, minThroughput: 20 },
      completion: { maxDuration: 100, maxMemoryDelta: 3, minThroughput: 10 },
      signature: { maxDuration: 30, maxMemoryDelta: 1, minThroughput: 30 },
      diagnostics: { maxDuration: 200, maxMemoryDelta: 5, minThroughput: 5 },
      formatting: { maxDuration: 150, maxMemoryDelta: 2, minThroughput: 7 },
      incremental: { maxDuration: 30, maxMemoryDelta: 1, minThroughput: 30 },
      memory: { maxDuration: 500, maxMemoryDelta: 50, minThroughput: 2 },
      concurrent: { maxDuration: 500, maxMemoryDelta: 10, minThroughput: 2 },
      large: { maxDuration: 1000, maxMemoryDelta: 20, minThroughput: 1 },
      cache: { maxDuration: 10, maxMemoryDelta: 1, minThroughput: 100 },
      error: { maxDuration: 150, maxMemoryDelta: 5, minThroughput: 10 }
    };
    
    return thresholds[operation as keyof typeof thresholds] || thresholds.parsing;
  }
};