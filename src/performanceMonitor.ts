// src/performanceMonitor.ts

/**
 * Performance monitoring utility for incremental parsing
 */
export class PerformanceMonitor {
    private static metrics: Map<string, PerformanceMetric> = new Map();
    private static enabled = true;
    
    /**
     * Start timing an operation
     */
    static startTiming(operation: string): PerformanceTimer {
        if (!this.enabled) {
            return { end: () => {} };
        }
        
        const startTime = performance.now();
        const startMemory = this.getMemoryUsage();
        
        return {
            end: () => {
                const endTime = performance.now();
                const endMemory = this.getMemoryUsage();
                
                this.recordMetric(operation, {
                    duration: endTime - startTime,
                    memoryDelta: endMemory - startMemory,
                    timestamp: Date.now()
                });
            }
        };
    }
    
    /**
     * Record a performance metric
     */
    private static recordMetric(operation: string, data: { duration: number; memoryDelta: number; timestamp: number }) {
        if (!this.metrics.has(operation)) {
            this.metrics.set(operation, {
                operation,
                totalCalls: 0,
                totalDuration: 0,
                averageDuration: 0,
                minDuration: Infinity,
                maxDuration: 0,
                totalMemoryDelta: 0,
                averageMemoryDelta: 0,
                lastCall: 0
            });
        }
        
        const metric = this.metrics.get(operation)!;
        metric.totalCalls++;
        metric.totalDuration += data.duration;
        metric.averageDuration = metric.totalDuration / metric.totalCalls;
        metric.minDuration = Math.min(metric.minDuration, data.duration);
        metric.maxDuration = Math.max(metric.maxDuration, data.duration);
        metric.totalMemoryDelta += data.memoryDelta;
        metric.averageMemoryDelta = metric.totalMemoryDelta / metric.totalCalls;
        metric.lastCall = data.timestamp;
    }
    
    /**
     * Get current memory usage (approximation)
     */
    private static getMemoryUsage(): number {
        if (typeof process !== 'undefined' && process.memoryUsage) {
            return process.memoryUsage().heapUsed;
        }
        return 0;
    }
    
    /**
     * Get performance metrics for an operation
     */
    static getMetrics(operation: string): PerformanceMetric | undefined {
        return this.metrics.get(operation);
    }
    
    /**
     * Get all performance metrics
     */
    static getAllMetrics(): PerformanceMetric[] {
        return Array.from(this.metrics.values());
    }
    
    /**
     * Clear all metrics
     */
    static clearMetrics(): void {
        this.metrics.clear();
    }
    
    /**
     * Enable or disable performance monitoring
     */
    static setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }
    
    /**
     * Get a performance report
     */
    static getReport(): PerformanceReport {
        const metrics = this.getAllMetrics();
        const totalOperations = metrics.reduce((sum, m) => sum + m.totalCalls, 0);
        const totalDuration = metrics.reduce((sum, m) => sum + m.totalDuration, 0);
        
        return {
            totalOperations,
            totalDuration,
            averageDuration: totalOperations > 0 ? totalDuration / totalOperations : 0,
            operations: metrics.sort((a, b) => b.totalDuration - a.totalDuration),
            generatedAt: Date.now()
        };
    }
    
    /**
     * Log performance report to console
     */
    static logReport(): void {
        const report = this.getReport();
        
        console.log('\n=== Performance Report ===');
        console.log(`Total Operations: ${report.totalOperations}`);
        console.log(`Total Duration: ${report.totalDuration.toFixed(2)}ms`);
        console.log(`Average Duration: ${report.averageDuration.toFixed(2)}ms`);
        console.log('\nTop Operations by Total Duration:');
        
        report.operations.slice(0, 10).forEach((metric, index) => {
            console.log(`${index + 1}. ${metric.operation}`);
            console.log(`   Calls: ${metric.totalCalls}, Avg: ${metric.averageDuration.toFixed(2)}ms, Max: ${metric.maxDuration.toFixed(2)}ms`);
            if (metric.averageMemoryDelta !== 0) {
                console.log(`   Memory: ${(metric.averageMemoryDelta / 1024 / 1024).toFixed(2)}MB avg`);
            }
        });
        
        console.log('========================\n');
    }
}

export interface PerformanceTimer {
    end(): void;
}

export interface PerformanceMetric {
    operation: string;
    totalCalls: number;
    totalDuration: number;
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    totalMemoryDelta: number;
    averageMemoryDelta: number;
    lastCall: number;
}

export interface PerformanceReport {
    totalOperations: number;
    totalDuration: number;
    averageDuration: number;
    operations: PerformanceMetric[];
    generatedAt: number;
}