// src/tests/integration/setup.ts

import { globalMemoryManager } from '../../memoryManager';
import { globalDebouncer } from '../../requestDebouncer';
import { IncrementalParser } from '../../incrementalParser';
import { parsedDocumentCache } from '../../common';

/**
 * R8.2: Integration test setup and teardown
 * 
 * This module provides setup and teardown functionality for integration tests,
 * ensuring clean test environments and proper resource management.
 */

// Extend Jest matchers for integration tests
declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveValidTableauSyntax(): R;
      toHaveSymbolCount(count: number): R;
      toCompleteWithinTime(maxMs: number): R;
      toHaveMemoryUsageBelow(maxMB: number): R;
    }
  }
}

// Custom Jest matchers for integration tests
expect.extend({
  toHaveValidTableauSyntax(received: any) {
    const pass = received && received.symbols && received.symbols.length > 0;
    
    if (pass) {
      return {
        message: () => `Expected document to not have valid Tableau syntax`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected document to have valid Tableau syntax`,
        pass: false,
      };
    }
  },
  
  toHaveSymbolCount(received: any, expectedCount: number) {
    const actualCount = received && received.symbols ? received.symbols.length : 0;
    const pass = actualCount === expectedCount;
    
    if (pass) {
      return {
        message: () => `Expected symbol count not to be ${expectedCount}`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected ${expectedCount} symbols, but got ${actualCount}`,
        pass: false,
      };
    }
  },
  
  toCompleteWithinTime(received: Promise<any>, maxMs: number) {
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
  
  toHaveMemoryUsageBelow(received: any, maxMB: number) {
    const memoryStats = globalMemoryManager.getMemoryStats();
    const actualUsage = memoryStats.usedMemoryMB;
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
  }
});

// Global setup for all integration tests
beforeAll(async () => {
  console.log('🔧 Setting up integration test environment...');
  
  // Configure memory manager for testing
  globalMemoryManager.configure({
    maxMemoryMB: 200, // Higher limit for integration tests
    cleanupThresholdMB: 150,
    monitoringIntervalMs: 5000, // More frequent monitoring
    enableAutoCleanup: true,
    enableMemoryLogging: false // Reduce noise in tests
  });
  
  // Configure request debouncer for testing
  globalDebouncer.configureDebouncing('DIAGNOSTICS', {
    delay: 50, // Faster for tests
    maxDelay: 200
  });
  
  globalDebouncer.configureDebouncing('HOVER', {
    delay: 25,
    maxDelay: 100
  });
  
  globalDebouncer.configureDebouncing('COMPLETION', {
    delay: 50,
    maxDelay: 200
  });
  
  console.log('✅ Integration test environment ready');
});

// Global teardown for all integration tests
afterAll(async () => {
  console.log('🧹 Cleaning up integration test environment...');
  
  // Flush all pending requests
  await globalDebouncer.flushAllRequests();
  
  // Clear all caches
  IncrementalParser.clearAllCache();
  parsedDocumentCache.clear();
  
  // Force memory cleanup
  if (!globalMemoryManager.isMemoryUsageHealthy()) {
    await globalMemoryManager.forceCleanup('aggressive');
  }
  
  // Shutdown memory manager
  globalMemoryManager.shutdown();
  
  console.log('✅ Integration test cleanup complete');
});

// Setup for each test
beforeEach(() => {
  // Clear document cache before each test
  parsedDocumentCache.clear();
  
  // Reset memory manager state
  globalMemoryManager.configure({
    enableMemoryLogging: false
  });
});

// Cleanup after each test
afterEach(async () => {
  // Flush any pending requests
  await globalDebouncer.flushAllRequests();
  
  // Mark all test documents as inactive
  const testUris = Array.from(parsedDocumentCache.keys()).filter(uri => 
    uri.startsWith('test://')
  );
  
  testUris.forEach(uri => {
    globalMemoryManager.markDocumentInactive(uri);
  });
  
  // Clear test document cache
  testUris.forEach(uri => {
    parsedDocumentCache.delete(uri);
  });
});

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in tests, just log the error
});

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit the process in tests, just log the error
});

// Performance monitoring utilities for tests
export const TestPerformanceMonitor = {
  /**
   * Measure execution time of an async function
   */
  async measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    return { result, duration };
  },
  
  /**
   * Measure memory usage before and after an operation
   */
  async measureMemory<T>(fn: () => Promise<T>): Promise<{ result: T; memoryDelta: number }> {
    const beforeStats = globalMemoryManager.getMemoryStats();
    const result = await fn();
    const afterStats = globalMemoryManager.getMemoryStats();
    const memoryDelta = afterStats.usedMemoryMB - beforeStats.usedMemoryMB;
    return { result, memoryDelta };
  },
  
  /**
   * Wait for memory to stabilize after operations
   */
  async waitForMemoryStabilization(maxWaitMs: number = 1000): Promise<void> {
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
  }
};

// Test utilities
export const IntegrationTestUtils = {
  /**
   * Create a test document with automatic cleanup
   */
  createTestDocument(content: string, version: number = 1, uri?: string): any {
    const testUri = uri || `test://integration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.twbl`;
    
    // Import TextDocument here to avoid circular dependencies
    const { TextDocument } = require('vscode-languageserver-textdocument');
    const document = TextDocument.create(testUri, 'tableau', version, content);
    
    // Mark as active for memory management
    globalMemoryManager.markDocumentActive(testUri);
    
    return document;
  },
  
  /**
   * Generate realistic Tableau calculation content
   */
  generateTableauCalculation(type: 'simple' | 'complex' | 'lod' | 'error'): string {
    switch (type) {
      case 'simple':
        return 'SUM([Sales]) + AVG([Profit])';
      
      case 'complex':
        return `
IF ATTR([Region]) = "North" THEN
    CASE [Category]
    WHEN "Furniture" THEN SUM([Sales]) * 1.1
    WHEN "Technology" THEN SUM([Sales]) * 1.2
    ELSE SUM([Sales])
    END
ELSEIF ATTR([Region]) = "South" THEN
    AVG([Profit]) * COUNT([Orders])
ELSE
    MAX([Sales])
END
        `.trim();
      
      case 'lod':
        return `
{FIXED [Customer] : 
    IF SUM([Sales]) > AVG({FIXED [Region] : SUM([Sales])}) THEN
        "High Value"
    ELSE
        "Standard"
    END
}
        `.trim();
      
      case 'error':
        return `
IF SUM([Sales] > 1000 THEN
    UNKNOWN_FUNCTION([Profit])
ELSE
    COUNT([Orders]
END
        `.trim();
      
      default:
        return 'SUM([Sales])';
    }
  },
  
  /**
   * Wait for async operations to complete
   */
  async waitForAsyncOperations(maxWaitMs: number = 1000): Promise<void> {
    // Wait for any pending debounced requests
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Flush any remaining requests
    await globalDebouncer.flushAllRequests();
    
    // Wait a bit more for cleanup
    await new Promise(resolve => setTimeout(resolve, 50));
  }
};

console.log('📋 Integration test setup loaded');