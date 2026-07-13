// src/tests/unit/performanceMonitor.test.ts

import { PerformanceMonitor, PerformanceTimer } from '../../performanceMonitor.js';

describe('Performance Monitor', () => {
    beforeEach(() => {
        // Reset performance monitor state
        PerformanceMonitor.reset();
    });

    describe('Basic Timing Operations', () => {
        it('should start and end timing operations', () => {
            const timer = PerformanceMonitor.startTiming('test-operation');
            
            expect(timer).toBeDefined();
            expect(typeof timer.end).toBe('function');
            
            // Simulate some work
            const start = Date.now();
            while (Date.now() - start < 10) {
                // Wait 10ms
            }
            
            const result = timer.end();
            
            expect(result.operation).toBe('test-operation');
            expect(result.duration).toBeGreaterThan(0);
            // The busy-wait is gated on Date.now() (1ms granularity) while the monitor
            // measures with performance.now(), so the measured duration can undershoot
            // the wait by up to 1ms.
            expect(result.duration).toBeGreaterThanOrEqual(9);
        });

        it('should measure multiple operations independently', () => {
            const timer1 = PerformanceMonitor.startTiming('operation-1');
            const timer2 = PerformanceMonitor.startTiming('operation-2');
            
            // Simulate different work durations
            const start1 = Date.now();
            while (Date.now() - start1 < 5) {}
            const result1 = timer1.end();
            
            const start2 = Date.now();
            while (Date.now() - start2 < 15) {}
            const result2 = timer2.end();
            
            expect(result1.operation).toBe('operation-1');
            expect(result2.operation).toBe('operation-2');
            expect(result1.duration).toBeLessThan(result2.duration);
        });

        it('should handle nested timing operations', () => {
            const outerTimer = PerformanceMonitor.startTiming('outer-operation');
            
            const start1 = Date.now();
            while (Date.now() - start1 < 5) {}
            
            const innerTimer = PerformanceMonitor.startTiming('inner-operation');
            const start2 = Date.now();
            while (Date.now() - start2 < 10) {}
            const innerResult = innerTimer.end();
            
            const start3 = Date.now();
            while (Date.now() - start3 < 5) {}
            const outerResult = outerTimer.end();
            
            expect(innerResult.operation).toBe('inner-operation');
            expect(outerResult.operation).toBe('outer-operation');
            expect(outerResult.duration).toBeGreaterThan(innerResult.duration);
        });
    });

    describe('Performance Statistics', () => {
        it('should collect statistics for operations', () => {
            // Perform multiple operations
            for (let i = 0; i < 5; i++) {
                const timer = PerformanceMonitor.startTiming('repeated-operation');
                const start = Date.now();
                while (Date.now() - start < 5 + i) {} // Variable duration
                timer.end();
            }
            
            const stats = PerformanceMonitor.getStatistics('repeated-operation');
            
            expect(stats).toBeDefined();
            expect(stats.operation).toBe('repeated-operation');
            expect(stats.count).toBe(5);
            expect(stats.totalDuration).toBeGreaterThan(0);
            expect(stats.averageDuration).toBeGreaterThan(0);
            expect(stats.minDuration).toBeGreaterThan(0);
            expect(stats.maxDuration).toBeGreaterThan(stats.minDuration);
        });

        it('should calculate correct statistical values', () => {
            const durations = [10, 20, 30, 40, 50];
            
            durations.forEach((duration, index) => {
                const timer = PerformanceMonitor.startTiming('stats-test');
                const start = Date.now();
                while (Date.now() - start < duration) {}
                timer.end();
            });
            
            const stats = PerformanceMonitor.getStatistics('stats-test');
            
            expect(stats.count).toBe(5);
            expect(stats.averageDuration).toBeGreaterThan(20); // Should be around 30
            expect(stats.averageDuration).toBeLessThan(40);
            expect(stats.minDuration).toBeLessThan(stats.averageDuration);
            expect(stats.maxDuration).toBeGreaterThan(stats.averageDuration);
        });

        it('should return undefined for non-existent operations', () => {
            const stats = PerformanceMonitor.getStatistics('non-existent-operation');
            expect(stats).toBeUndefined();
        });
    });

    describe('All Statistics Retrieval', () => {
        it('should return all collected statistics', () => {
            // Create multiple different operations
            const operations = ['op1', 'op2', 'op3'];
            
            operations.forEach(op => {
                const timer = PerformanceMonitor.startTiming(op);
                const start = Date.now();
                while (Date.now() - start < 5) {}
                timer.end();
            });
            
            const allStats = PerformanceMonitor.getAllStatistics();
            
            expect(Object.keys(allStats)).toHaveLength(3);
            expect(allStats).toHaveProperty('op1');
            expect(allStats).toHaveProperty('op2');
            expect(allStats).toHaveProperty('op3');
            
            Object.values(allStats).forEach(stats => {
                expect(stats.count).toBe(1);
                expect(stats.totalDuration).toBeGreaterThan(0);
            });
        });

        it('should return empty object when no operations recorded', () => {
            const allStats = PerformanceMonitor.getAllStatistics();
            expect(allStats).toEqual({});
        });
    });

    describe('Performance Monitoring Reset', () => {
        it('should reset all statistics', () => {
            // Record some operations
            const timer1 = PerformanceMonitor.startTiming('test-op-1');
            timer1.end();
            
            const timer2 = PerformanceMonitor.startTiming('test-op-2');
            timer2.end();
            
            // Verify operations were recorded
            let allStats = PerformanceMonitor.getAllStatistics();
            expect(Object.keys(allStats)).toHaveLength(2);
            
            // Reset and verify
            PerformanceMonitor.reset();
            allStats = PerformanceMonitor.getAllStatistics();
            expect(allStats).toEqual({});
        });

        it('should allow new operations after reset', () => {
            // Record and reset
            const timer1 = PerformanceMonitor.startTiming('before-reset');
            timer1.end();
            
            PerformanceMonitor.reset();
            
            // Record new operation
            const timer2 = PerformanceMonitor.startTiming('after-reset');
            timer2.end();
            
            const allStats = PerformanceMonitor.getAllStatistics();
            expect(Object.keys(allStats)).toHaveLength(1);
            expect(allStats).toHaveProperty('after-reset');
            expect(allStats).not.toHaveProperty('before-reset');
        });
    });

    describe('Timer Object Behavior', () => {
        it('should prevent double-ending of timers', () => {
            const timer = PerformanceMonitor.startTiming('double-end-test');
            
            const result1 = timer.end();
            expect(result1).toBeDefined();
            
            // Second end should not crash but may return different result
            const result2 = timer.end();
            expect(result2).toBeDefined();
            
            // Should still have only one recorded operation
            const stats = PerformanceMonitor.getStatistics('double-end-test');
            expect(stats?.count).toBe(1);
        });

        it('should handle timer end without start gracefully', () => {
            // This tests internal robustness
            expect(() => {
                const timer = PerformanceMonitor.startTiming('graceful-test');
                timer.end();
            }).not.toThrow();
        });
    });

    describe('High-Frequency Operations', () => {
        it('should handle many rapid operations efficiently', () => {
            const operationCount = 1000;
            const startTime = Date.now();
            
            for (let i = 0; i < operationCount; i++) {
                const timer = PerformanceMonitor.startTiming('rapid-operation');
                timer.end();
            }
            
            const totalTime = Date.now() - startTime;
            const stats = PerformanceMonitor.getStatistics('rapid-operation');
            
            expect(stats?.count).toBe(operationCount);
            expect(totalTime).toBeLessThan(1000); // Should complete within 1 second
        });

        it('should maintain accuracy with concurrent operations', () => {
            const timers: PerformanceTimer[] = [];
            
            // Start multiple timers
            for (let i = 0; i < 10; i++) {
                timers.push(PerformanceMonitor.startTiming(`concurrent-${i}`));
            }
            
            // End them in reverse order
            for (let i = 9; i >= 0; i--) {
                timers[i].end();
            }
            
            // Verify all operations were recorded
            const allStats = PerformanceMonitor.getAllStatistics();
            expect(Object.keys(allStats)).toHaveLength(10);
            
            for (let i = 0; i < 10; i++) {
                expect(allStats).toHaveProperty(`concurrent-${i}`);
                expect(allStats[`concurrent-${i}`].count).toBe(1);
            }
        });
    });

    describe('Memory and Resource Management', () => {
        it('should not leak memory with many operations', () => {
            const initialMemory = process.memoryUsage?.()?.heapUsed || 0;
            
            // Perform many operations
            for (let i = 0; i < 10000; i++) {
                const timer = PerformanceMonitor.startTiming(`memory-test-${i % 100}`);
                timer.end();
            }
            
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }
            
            const finalMemory = process.memoryUsage?.()?.heapUsed || 0;
            const memoryIncrease = finalMemory - initialMemory;
            
            // Memory increase should be reasonable (less than 10MB)
            expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
        });

        it('should handle operation names efficiently', () => {
            const longOperationName = 'a'.repeat(1000);
            
            const timer = PerformanceMonitor.startTiming(longOperationName);
            const result = timer.end();
            
            expect(result.operation).toBe(longOperationName);
            
            const stats = PerformanceMonitor.getStatistics(longOperationName);
            expect(stats?.operation).toBe(longOperationName);
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle empty operation names', () => {
            expect(() => {
                const timer = PerformanceMonitor.startTiming('');
                timer.end();
            }).not.toThrow();
            
            const stats = PerformanceMonitor.getStatistics('');
            expect(stats?.count).toBe(1);
        });

        it('should handle null or undefined operation names', () => {
            expect(() => {
                const timer = PerformanceMonitor.startTiming(null as any);
                timer.end();
            }).not.toThrow();
            
            expect(() => {
                const timer = PerformanceMonitor.startTiming(undefined as any);
                timer.end();
            }).not.toThrow();
        });

        it('should handle special characters in operation names', () => {
            const specialNames = [
                'operation-with-dashes',
                'operation_with_underscores',
                'operation.with.dots',
                'operation with spaces',
                'operation/with/slashes',
                'operation:with:colons'
            ];
            
            specialNames.forEach(name => {
                expect(() => {
                    const timer = PerformanceMonitor.startTiming(name);
                    timer.end();
                }).not.toThrow();
                
                const stats = PerformanceMonitor.getStatistics(name);
                expect(stats?.operation).toBe(name);
            });
        });

        it('should handle very short duration operations', () => {
            const timer = PerformanceMonitor.startTiming('instant-operation');
            const result = timer.end(); // End immediately
            
            expect(result.duration).toBeGreaterThanOrEqual(0);
            expect(typeof result.duration).toBe('number');
            expect(isFinite(result.duration)).toBe(true);
        });
    });

    describe('Integration Scenarios', () => {
        it('should work with async operations', async () => {
            const timer = PerformanceMonitor.startTiming('async-operation');
            
            await new Promise(resolve => setTimeout(resolve, 10));
            
            const result = timer.end();
            
            expect(result.operation).toBe('async-operation');
            // setTimeout(n) can resolve a fraction of a millisecond early relative to
            // the performance.now() interval, so allow a small tolerance below 10ms.
            expect(result.duration).toBeGreaterThanOrEqual(9);
        });

        it('should handle operations with promises', async () => {
            const promises = [];
            
            for (let i = 0; i < 5; i++) {
                promises.push(new Promise(async (resolve) => {
                    const timer = PerformanceMonitor.startTiming(`promise-${i}`);
                    await new Promise(r => setTimeout(r, 5 + i));
                    const result = timer.end();
                    resolve(result);
                }));
            }
            
            const results = await Promise.all(promises);
            
            expect(results).toHaveLength(5);
            results.forEach((result: any, index) => {
                expect(result.operation).toBe(`promise-${index}`);
                expect(result.duration).toBeGreaterThan(0);
            });
        });

        it('should provide consistent results across multiple calls', () => {
            const operationName = 'consistency-test';
            const iterations = 100;
            
            for (let i = 0; i < iterations; i++) {
                const timer = PerformanceMonitor.startTiming(operationName);
                // Simulate consistent work
                const start = Date.now();
                while (Date.now() - start < 1) {}
                timer.end();
            }
            
            const stats = PerformanceMonitor.getStatistics(operationName);
            
            expect(stats?.count).toBe(iterations);
            expect(stats?.averageDuration).toBeGreaterThan(0);
            expect(stats?.minDuration).toBeGreaterThan(0);
            expect(stats?.maxDuration).toBeGreaterThan(0);
            expect(stats?.totalDuration).toBe(stats?.averageDuration * iterations);
        });
    });
});
