// src/tests/edge/setup.ts

import { globalMemoryManager } from '../../memoryManager';
import { globalDebouncer } from '../../requestDebouncer';
import { IncrementalParser } from '../../incrementalParser';
import { parsedDocumentCache } from '../../common';

/**
 * R8.4: Edge case test setup and utilities
 * 
 * This module provides setup and utilities specifically for edge case testing,
 * including error handling validation and boundary condition testing.
 */

// Extend Jest matchers for edge case tests
declare global {
  namespace jest {
    interface Matchers<R> {
      toHandleErrorsGracefully(): R;
      toRecoverFromErrors(minRecoveryRate?: number): R;
      toProvideUsefulDiagnostics(): R;
      toMaintainPerformanceUnderLoad(): R;
    }
  }
}

// Custom Jest matchers for edge case tests
expect.extend({
  toHandleErrorsGracefully(received: () => any) {
    let pass = true;
    let message = '';
    
    try {
      const result = received();
      
      // Should not throw an error
      pass = true;
      message = 'Function handled errors gracefully';
      
      // If it returns a result, it should be defined
      if (result !== undefined) {
        pass = result !== null;
        message = pass ? 'Function returned valid result' : 'Function returned null result';
      }
      
    } catch (error) {
      pass = false;
      message = `Function threw an error: ${error instanceof Error ? error.message : String(error)}`;
    }
    
    return {
      message: () => message,
      pass
    };
  },
  
  toRecoverFromErrors(received: any, minRecoveryRate: number = 0.5) {
    const hasRecoveryInfo = received && received.recoveryInfo;
    
    if (!hasRecoveryInfo) {
      return {
        message: () => 'Expected result to have recovery information',
        pass: false
      };
    }
    
    const { totalErrors, recoveredErrors } = received.recoveryInfo;
    const recoveryRate = totalErrors > 0 ? recoveredErrors / totalErrors : 1;
    const pass = recoveryRate >= minRecoveryRate;
    
    return {
      message: () => pass 
        ? `Recovery rate ${(recoveryRate * 100).toFixed(1)}% meets minimum ${(minRecoveryRate * 100).toFixed(1)}%`
        : `Recovery rate ${(recoveryRate * 100).toFixed(1)}% below minimum ${(minRecoveryRate * 100).toFixed(1)}%`,
      pass
    };
  },
  
  toProvideUsefulDiagnostics(received: any[]) {
    if (!Array.isArray(received)) {
      return {
        message: () => 'Expected diagnostics to be an array',
        pass: false
      };
    }
    
    if (received.length === 0) {
      return {
        message: () => 'Expected at least one diagnostic message',
        pass: false
      };
    }
    
    // Check if diagnostics have meaningful messages
    const hasUsefulMessages = received.some(diagnostic => 
      diagnostic.message && 
      diagnostic.message.length > 5 && // More than just a few characters
      (diagnostic.message.includes('expected') ||
       diagnostic.message.includes('missing') ||
       diagnostic.message.includes('invalid') ||
       diagnostic.message.includes('unexpected'))
    );
    
    return {
      message: () => hasUsefulMessages 
        ? 'Diagnostics contain useful error messages'
        : 'Diagnostics lack meaningful error messages',
      pass: hasUsefulMessages
    };
  },
  
  toMaintainPerformanceUnderLoad(received: { duration: number; threshold: number }) {
    const { duration, threshold } = received;
    const pass = duration <= threshold;
    
    return {
      message: () => pass
        ? `Performance ${duration}ms within threshold ${threshold}ms`
        : `Performance ${duration}ms exceeds threshold ${threshold}ms`,
      pass
    };
  }
});

// Global setup for edge case tests
beforeAll(async () => {
  console.log('🧪 Setting up edge case test environment...');
  
  // Configure memory manager for edge case testing
  globalMemoryManager.configure({
    maxMemoryMB: 200, // Higher limit for edge case tests
    cleanupThresholdMB: 150,
    monitoringIntervalMs: 5000, // More frequent monitoring
    enableAutoCleanup: true,
    enableMemoryLogging: false // Reduce noise during tests
  });
  
  // Configure request debouncer for edge case testing
  globalDebouncer.configureDebouncing('DIAGNOSTICS', {
    delay: 5, // Minimal delay for edge case tests
    maxDelay: 25
  });
  
  globalDebouncer.configureDebouncing('HOVER', {
    delay: 5,
    maxDelay: 25
  });
  
  globalDebouncer.configureDebouncing('COMPLETION', {
    delay: 5,
    maxDelay: 25
  });
  
  console.log('✅ Edge case test environment ready');
});

// Global teardown for edge case tests
afterAll(async () => {
  console.log('🧹 Cleaning up edge case test environment...');
  
  // Flush all pending requests
  await globalDebouncer.flushAllRequests();
  
  // Clear all caches
  IncrementalParser.clearAllCache();
  parsedDocumentCache.clear();
  
  // Force memory cleanup
  await globalMemoryManager.forceCleanup('aggressive');
  
  // Shutdown memory manager
  globalMemoryManager.shutdown();
  
  console.log('✅ Edge case test cleanup complete');
});

// Setup for each test
beforeEach(async () => {
  // Clear caches before each test for consistent results
  parsedDocumentCache.clear();
  IncrementalParser.clearAllCache();
  
  // Flush any pending requests
  await globalDebouncer.flushAllRequests();
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  // Wait for system to stabilize
  await new Promise(resolve => setTimeout(resolve, 50));
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
 * Edge case test utilities
 */
export const EdgeCaseUtils = {
  /**
   * Create a test document with automatic cleanup
   */
  createTestDocument(
    content: string,
    version: number = 1,
    uri?: string
  ): any {
    const { TextDocument } = require('vscode-languageserver-textdocument');
    
    const testUri = uri || `test://edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.twbl`;
    const document = TextDocument.create(testUri, 'tableau', version, content);
    
    // Mark as active for memory management
    globalMemoryManager.markDocumentActive(testUri);
    
    return document;
  },
  
  /**
   * Generate malformed input test cases
   */
  generateMalformedInputs(): Array<{ input: string; description: string; expectedErrors: number }> {
    return [
      {
        input: 'IF [Sales] > 100 THEN "High ELSE "Low" END',
        description: 'unclosed string in THEN clause',
        expectedErrors: 1
      },
      {
        input: 'SUM([Sales) + AVG([Profit])',
        description: 'unclosed bracket in function parameter',
        expectedErrors: 1
      },
      {
        input: 'CASE [Region] WHEN "North" THEN "Northern"',
        description: 'incomplete CASE statement missing ELSE and END',
        expectedErrors: 1
      },
      {
        input: 'UNKNOWN_FUNCTION([Sales]) + COUNT([Orders])',
        description: 'unknown function call',
        expectedErrors: 1
      },
      {
        input: '{FIXED [Customer] : SUM([Sales)',
        description: 'incomplete LOD expression',
        expectedErrors: 1
      }
    ];
  },
  
  /**
   * Generate boundary condition test cases
   */
  generateBoundaryConditions(): Array<{ input: string; description: string; expectedBehavior: string }> {
    return [
      {
        input: '',
        description: 'empty document',
        expectedBehavior: 'should parse without errors'
      },
      {
        input: ' ',
        description: 'whitespace only',
        expectedBehavior: 'should parse without errors'
      },
      {
        input: 'A'.repeat(10000),
        description: 'very long single token',
        expectedBehavior: 'should handle gracefully'
      },
      {
        input: 'SUM([Sales])\\n'.repeat(1000),
        description: 'many repeated lines',
        expectedBehavior: 'should parse efficiently'
      },
      {
        input: 'SUM([Sales]) + AVG([Profit])'.repeat(500),
        description: 'very long expression',
        expectedBehavior: 'should handle within performance limits'
      }
    ];
  },
  
  /**
   * Generate error recovery test scenarios
   */
  generateErrorRecoveryScenarios(): Array<{ input: string; description: string; minRecoveryRate: number }> {
    return [
      {
        input: 'SUM([Sales) + AVG([Profit]) + COUNT([Orders])',
        description: 'single syntax error with valid functions',
        minRecoveryRate: 0.8
      },
      {
        input: 'IF [Sales] > 100 THEN "High" ELSE IF [Profit] > 50 THEN "Good"',
        description: 'nested IF with missing END',
        minRecoveryRate: 0.6
      },
      {
        input: 'CASE [Region] WHEN "North" THEN {FIXED [Customer] : COUNT([Orders] ELSE "Other"',
        description: 'mixed CASE and LOD errors',
        minRecoveryRate: 0.5
      },
      {
        input: 'SUM([Sales]) + UNKNOWN_FUNC([Profit]) + MAX([Orders]) + INVALID_SYNTAX',
        description: 'multiple error types',
        minRecoveryRate: 0.4
      }
    ];
  },
  
  /**
   * Measure operation performance
   */
  async measurePerformance<T>(
    operation: () => Promise<T> | T,
    description: string,
    maxDurationMs: number = 1000
  ): Promise<{ result: T; duration: number; withinThreshold: boolean }> {
    const startTime = performance.now();
    const result = await operation();
    const endTime = performance.now();
    
    const duration = endTime - startTime;
    const withinThreshold = duration <= maxDurationMs;
    
    if (!withinThreshold) {
      console.warn(`⚠️ Performance warning: ${description} took ${duration.toFixed(2)}ms (threshold: ${maxDurationMs}ms)`);
    }
    
    return {
      result,
      duration,
      withinThreshold
    };
  },
  
  /**
   * Validate error recovery information
   */
  validateErrorRecovery(
    result: any,
    minRecoveryRate: number = 0.5
  ): {
    isValid: boolean;
    recoveryRate: number;
    message: string;
  } {
    if (!result || !result.recoveryInfo) {
      return {
        isValid: false,
        recoveryRate: 0,
        message: 'No recovery information provided'
      };
    }
    
    const { totalErrors, recoveredErrors } = result.recoveryInfo;
    const recoveryRate = totalErrors > 0 ? recoveredErrors / totalErrors : 1;
    const isValid = recoveryRate >= minRecoveryRate;
    
    return {
      isValid,
      recoveryRate,
      message: isValid 
        ? `Recovery rate ${(recoveryRate * 100).toFixed(1)}% meets requirements`
        : `Recovery rate ${(recoveryRate * 100).toFixed(1)}% below minimum ${(minRecoveryRate * 100).toFixed(1)}%`
    };
  },
  
  /**
   * Create stress test scenarios
   */
  createStressTestScenarios(): Array<{ name: string; generator: () => string; expectedDuration: number }> {
    return [
      {
        name: 'deeply nested expressions',
        generator: () => {
          let expr = 'SUM([Sales])';
          for (let i = 0; i < 20; i++) {
            expr = `IF [Sales${i}] > ${i * 100} THEN ${expr} ELSE AVG([Profit${i}]) END`;
          }
          return expr;
        },
        expectedDuration: 500
      },
      {
        name: 'many function calls',
        generator: () => {
          const functions = ['SUM', 'AVG', 'COUNT', 'MAX', 'MIN'];
          return Array(100).fill(0).map((_, i) => {
            const func = functions[i % functions.length];
            return `${func}([Field${i}])`;
          }).join(' + ');
        },
        expectedDuration: 300
      },
      {
        name: 'complex LOD expressions',
        generator: () => {
          return Array(50).fill(0).map((_, i) => 
            `{FIXED [Customer${i}] : SUM([Sales${i}])}`
          ).join(' + ');
        },
        expectedDuration: 400
      }
    ];
  }
};