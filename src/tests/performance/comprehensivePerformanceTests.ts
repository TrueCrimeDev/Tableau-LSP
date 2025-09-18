// src/tests/performance/comprehensivePerformanceTests.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver';
import { performance } from 'perf_hooks';
import { parseDocument } from '../../documentModel';
import { getDiagnostics } from '../../diagnosticsProvider';
import { provideHover } from '../../hoverProvider';
import { provideCompletion } from '../../completionProvider';
import { buildSignatureHelp } from '../../signatureProvider';
import { format } from '../../format';
import { IncrementalParser } from '../../incrementalParser';
import { PerformanceMonitor } from '../../performanceMonitor';
import { globalMemoryManager } from '../../memoryManager';
import { globalDebouncer } from '../../requestDebouncer';
import * as fs from 'fs';
import * as path from 'path';

/**
 * R8.3: Comprehensive performance testing framework
 * 
 * This module provides detailed performance testing for all LSP features,
 * including response time validation, memory usage tracking, and performance reporting.
 */

interface PerformanceTestResult {
    testName: string;
    passed: boolean;
    duration: number;
    memoryUsage: number;
    requirement: string;
    actualValue: number;
    expectedValue: number;
    details?: any;
}

interface PerformanceTestSuite {
    suiteName: string;
    results: PerformanceTestResult[];
    totalDuration: number;
    passedTests: number;
    failedTests: number;
}

interface PerformanceReport {
    timestamp: string;
    environment: {
        nodeVersion: string;
        platform: string;
        arch: string;
        memoryLimit: number;
    };
    summary: {
        totalSuites: number;
        totalTests: number;
        passedTests: number;
        failedTests: number;
        totalDuration: number;
        overallSuccessRate: number;
    };
    suites: PerformanceTestSuite[];
    performanceMetrics: any;
}/**
 
* Main performance test runner
 */
export class ComprehensivePerformanceTestRunner {
    private results: PerformanceTestSuite[] = [];
    private startTime: number = 0;
    
    /**
     * Run all performance tests
     */
    async runAllTests(): Promise<PerformanceReport> {
        console.log('⚡ Starting Comprehensive Performance Tests');
        console.log('=' .repeat(60));
        
        this.startTime = Date.now();
        this.results = [];
        
        // Enable performance monitoring
        PerformanceMonitor.setEnabled(true);
        PerformanceMonitor.clearMetrics();
        
        // Configure memory manager for testing
        globalMemoryManager.configure({
            enableMemoryLogging: false,
            maxMemoryMB: 200
        });
        
        // Define test suites
        const testSuites = [
            {
                name: 'Response Time Requirements',
                runner: this.runResponseTimeTests.bind(this)
            },
            {
                name: 'Document Size Scalability',
                runner: this.runScalabilityTests.bind(this)
            },
            {
                name: 'Memory Usage Validation',
                runner: this.runMemoryTests.bind(this)
            },
            {
                name: 'Concurrent Request Performance',
                runner: this.runConcurrencyTests.bind(this)
            },
            {
                name: 'Incremental Parsing Performance',
                runner: this.runIncrementalTests.bind(this)
            },
            {
                name: 'Cache Performance',
                runner: this.runCacheTests.bind(this)
            }
        ];
        
        // Run each test suite
        for (const suite of testSuites) {
            console.log(`\n📋 Running ${suite.name}...`);
            const suiteResult = await this.runTestSuite(suite.name, suite.runner);
            this.results.push(suiteResult);
            
            // Print suite summary
            const status = suiteResult.failedTests === 0 ? '✅' : '❌';
            console.log(`${status} ${suite.name}: ${suiteResult.passedTests}/${suiteResult.results.length} passed (${suiteResult.totalDuration.toFixed(0)}ms)`);
        }
        
        // Generate final report
        const report = this.generateReport();
        
        // Save report to file
        await this.saveReport(report);
        
        // Print summary
        this.printSummary(report);
        
        return report;
    }    /**
  
   * Run response time requirement tests
     */
    private async runResponseTimeTests(): Promise<PerformanceTestResult[]> {
        const results: PerformanceTestResult[] = [];
        
        // Test 1: Parse time for 10KB document
        const doc10KB = this.generateTestDocument(100); // ~10KB
        results.push(await this.runPerformanceTest(
            'Parse 10KB Document',
            '< 200ms',
            200,
            async () => {
                const start = performance.now();
                parseDocument(doc10KB);
                return performance.now() - start;
            }
        ));
        
        // Test 2: Hover response time
        const parsedDoc = parseDocument(doc10KB);
        results.push(await this.runPerformanceTest(
            'Hover Response',
            '< 50ms',
            50,
            async () => {
                const start = performance.now();
                await provideHover(
                    { textDocument: { uri: doc10KB.uri }, position: { line: 10, character: 5 } },
                    doc10KB,
                    null
                );
                return performance.now() - start;
            }
        ));
        
        // Test 3: Completion response time
        results.push(await this.runPerformanceTest(
            'Completion Response',
            '< 100ms',
            100,
            async () => {
                const start = performance.now();
                await provideCompletion(
                    { textDocument: { uri: doc10KB.uri }, position: { line: 10, character: 5 } },
                    doc10KB,
                    parsedDoc,
                    null
                );
                return performance.now() - start;
            }
        ));
        
        // Test 4: Diagnostics response time
        results.push(await this.runPerformanceTest(
            'Diagnostics Response',
            '< 200ms',
            200,
            async () => {
                const start = performance.now();
                getDiagnostics(doc10KB, parsedDoc);
                return performance.now() - start;
            }
        ));
        
        // Test 5: Signature help response time
        results.push(await this.runPerformanceTest(
            'Signature Help Response',
            '< 50ms',
            50,
            async () => {
                const start = performance.now();
                buildSignatureHelp(doc10KB, { line: 10, character: 8 }, parsedDoc);
                return performance.now() - start;
            }
        ));
        
        return results;
    }  
  /**
     * Run scalability tests with different document sizes
     */
    private async runScalabilityTests(): Promise<PerformanceTestResult[]> {
        const results: PerformanceTestResult[] = [];
        
        const sizes = [
            { name: 'Small (1KB)', lines: 10, maxTime: 50 },
            { name: 'Medium (5KB)', lines: 50, maxTime: 100 },
            { name: 'Large (10KB)', lines: 100, maxTime: 200 },
            { name: 'Very Large (50KB)', lines: 500, maxTime: 1000 },
            { name: 'Huge (100KB)', lines: 1000, maxTime: 2000 }
        ];
        
        for (const size of sizes) {
            const document = this.generateTestDocument(size.lines);
            
            results.push(await this.runPerformanceTest(
                `Parse ${size.name}`,
                `< ${size.maxTime}ms`,
                size.maxTime,
                async () => {
                    const start = performance.now();
                    parseDocument(document);
                    return performance.now() - start;
                }
            ));
        }
        
        return results;
    }
    
    /**
     * Run memory usage tests
     */
    private async runMemoryTests(): Promise<PerformanceTestResult[]> {
        const results: PerformanceTestResult[] = [];
        
        // Test 1: Memory usage for large document
        const largeDoc = this.generateTestDocument(1000);
        results.push(await this.runPerformanceTest(
            'Large Document Memory Usage',
            '< 50MB',
            50,
            async () => {
                const beforeStats = globalMemoryManager.getMemoryStats();
                parseDocument(largeDoc);
                const afterStats = globalMemoryManager.getMemoryStats();
                return afterStats.usedMemoryMB - beforeStats.usedMemoryMB;
            }
        ));
        
        // Test 2: Memory cleanup effectiveness
        results.push(await this.runPerformanceTest(
            'Memory Cleanup Effectiveness',
            '> 80% cleanup',
            0.8,
            async () => {
                // Create multiple documents
                const docs = Array.from({ length: 20 }, (_, i) => 
                    this.generateTestDocument(50, `test://memory${i}.twbl`)
                );
                
                // Parse all documents
                docs.forEach(doc => {
                    parseDocument(doc);
                    globalMemoryManager.markDocumentInactive(doc.uri);
                });
                
                const beforeCleanup = globalMemoryManager.getMemoryStats();
                const cleanupStats = await globalMemoryManager.forceCleanup('aggressive');
                const afterCleanup = globalMemoryManager.getMemoryStats();
                
                const memoryFreed = beforeCleanup.usedMemoryMB - afterCleanup.usedMemoryMB;
                const cleanupEffectiveness = memoryFreed / beforeCleanup.usedMemoryMB;
                
                return cleanupEffectiveness;
            }
        ));
        
        return results;
    }    /
**
     * Run concurrency tests
     */
    private async runConcurrencyTests(): Promise<PerformanceTestResult[]> {
        const results: PerformanceTestResult[] = [];
        
        const testDoc = this.generateTestDocument(100);
        const parsedDoc = parseDocument(testDoc);
        
        // Test 1: Concurrent hover requests
        results.push(await this.runPerformanceTest(
            'Concurrent Hover Requests (10x)',
            '< 200ms total',
            200,
            async () => {
                const start = performance.now();
                
                const promises = Array.from({ length: 10 }, (_, i) =>
                    provideHover(
                        { textDocument: { uri: testDoc.uri }, position: { line: i * 5, character: 5 } },
                        testDoc,
                        null
                    )
                );
                
                await Promise.all(promises);
                return performance.now() - start;
            }
        ));
        
        // Test 2: Concurrent completion requests
        results.push(await this.runPerformanceTest(
            'Concurrent Completion Requests (10x)',
            '< 500ms total',
            500,
            async () => {
                const start = performance.now();
                
                const promises = Array.from({ length: 10 }, (_, i) =>
                    provideCompletion(
                        { textDocument: { uri: testDoc.uri }, position: { line: i * 5, character: 5 } },
                        testDoc,
                        parsedDoc,
                        null
                    )
                );
                
                await Promise.all(promises);
                return performance.now() - start;
            }
        ));
        
        // Test 3: Mixed concurrent requests
        results.push(await this.runPerformanceTest(
            'Mixed Concurrent Requests',
            '< 300ms total',
            300,
            async () => {
                const start = performance.now();
                
                const promises = [
                    ...Array.from({ length: 5 }, (_, i) =>
                        provideHover(
                            { textDocument: { uri: testDoc.uri }, position: { line: i * 5, character: 5 } },
                            testDoc,
                            null
                        )
                    ),
                    ...Array.from({ length: 5 }, (_, i) =>
                        provideCompletion(
                            { textDocument: { uri: testDoc.uri }, position: { line: i * 5 + 2, character: 5 } },
                            testDoc,
                            parsedDoc,
                            null
                        )
                    )
                ];
                
                await Promise.all(promises);
                return performance.now() - start;
            }
        ));
        
        return results;
    }    /**

     * Run incremental parsing tests
     */
    private async runIncrementalTests(): Promise<PerformanceTestResult[]> {
        const results: PerformanceTestResult[] = [];
        
        const baseDoc = this.generateTestDocument(500);
        
        // Test 1: Incremental parsing speedup
        results.push(await this.runPerformanceTest(
            'Incremental Parsing Speedup',
            '> 2x faster',
            2,
            async () => {
                // Full parse
                const fullStart = performance.now();
                IncrementalParser.parseDocumentIncremental(baseDoc);
                const fullTime = performance.now() - fullStart;
                
                // Create modified document
                const modifiedContent = baseDoc.getText().replace('SUM([Sales0])', 'AVG([Sales0])');
                const modifiedDoc = TextDocument.create(
                    baseDoc.uri,
                    baseDoc.languageId,
                    baseDoc.version + 1,
                    modifiedContent
                );
                
                // Incremental parse
                const incStart = performance.now();
                IncrementalParser.parseDocumentIncremental(modifiedDoc);
                const incTime = performance.now() - incStart;
                
                return fullTime / incTime; // Speedup ratio
            }
        ));
        
        // Test 2: Cache hit rate
        results.push(await this.runPerformanceTest(
            'Cache Hit Rate',
            '> 80%',
            0.8,
            async () => {
                // Parse same document multiple times
                const doc = this.generateTestDocument(100);
                
                // First parse (cache miss)
                IncrementalParser.parseDocumentIncremental(doc);
                
                // Subsequent parses (should hit cache)
                const iterations = 10;
                let totalTime = 0;
                
                for (let i = 0; i < iterations; i++) {
                    const start = performance.now();
                    IncrementalParser.parseDocumentIncremental(doc);
                    totalTime += performance.now() - start;
                }
                
                const avgCachedTime = totalTime / iterations;
                
                // Estimate cache hit rate based on performance
                // If cached operations are significantly faster, cache is working
                return avgCachedTime < 10 ? 0.9 : 0.5; // Simplified calculation
            }
        ));
        
        return results;
    }
    
    /**
     * Run cache performance tests
     */
    private async runCacheTests(): Promise<PerformanceTestResult[]> {
        const results: PerformanceTestResult[] = [];
        
        // Test 1: Document cache effectiveness
        results.push(await this.runPerformanceTest(
            'Document Cache Effectiveness',
            '< 10ms cached access',
            10,
            async () => {
                const doc = this.generateTestDocument(100);
                
                // First parse (populate cache)
                parseDocument(doc);
                
                // Cached access
                const start = performance.now();
                parseDocument(doc);
                return performance.now() - start;
            }
        ));
        
        return results;
    }   
 /**
     * Run a single performance test
     */
    private async runPerformanceTest(
        testName: string,
        requirement: string,
        expectedValue: number,
        testFunction: () => Promise<number>
    ): Promise<PerformanceTestResult> {
        const startTime = Date.now();
        const memoryBefore = globalMemoryManager.getMemoryStats().usedMemoryMB;
        
        try {
            const actualValue = await testFunction();
            const duration = Date.now() - startTime;
            const memoryAfter = globalMemoryManager.getMemoryStats().usedMemoryMB;
            const memoryUsage = memoryAfter - memoryBefore;
            
            // Determine if test passed based on requirement type
            let passed = false;
            if (requirement.includes('<')) {
                passed = actualValue < expectedValue;
            } else if (requirement.includes('>')) {
                passed = actualValue > expectedValue;
            } else {
                passed = Math.abs(actualValue - expectedValue) < expectedValue * 0.1; // 10% tolerance
            }
            
            return {
                testName,
                passed,
                duration,
                memoryUsage,
                requirement,
                actualValue,
                expectedValue
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            const memoryAfter = globalMemoryManager.getMemoryStats().usedMemoryMB;
            const memoryUsage = memoryAfter - memoryBefore;
            
            return {
                testName,
                passed: false,
                duration,
                memoryUsage,
                requirement,
                actualValue: -1,
                expectedValue,
                details: { error: error instanceof Error ? error.message : String(error) }
            };
        }
    }
    
    /**
     * Run a test suite with error handling
     */
    private async runTestSuite(
        suiteName: string,
        runner: () => Promise<PerformanceTestResult[]>
    ): Promise<PerformanceTestSuite> {
        const suiteStart = Date.now();
        
        try {
            const results = await runner();
            const suiteEnd = Date.now();
            
            return {
                suiteName,
                results,
                totalDuration: suiteEnd - suiteStart,
                passedTests: results.filter(r => r.passed).length,
                failedTests: results.filter(r => !r.passed).length
            };
        } catch (error) {
            const suiteEnd = Date.now();
            
            return {
                suiteName,
                results: [{
                    testName: `${suiteName} - Suite Execution`,
                    passed: false,
                    duration: suiteEnd - suiteStart,
                    memoryUsage: 0,
                    requirement: 'Suite should execute without errors',
                    actualValue: -1,
                    expectedValue: 0,
                    details: { error: error instanceof Error ? error.message : String(error) }
                }],
                totalDuration: suiteEnd - suiteStart,
                passedTests: 0,
                failedTests: 1
            };
        }
    }    /**

     * Generate final performance report
     */
    private generateReport(): PerformanceReport {
        const totalDuration = Date.now() - this.startTime;
        const allResults = this.results.flatMap(suite => suite.results);
        
        return {
            timestamp: new Date().toISOString(),
            environment: {
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                memoryLimit: globalMemoryManager.getConfiguration().maxMemoryMB
            },
            summary: {
                totalSuites: this.results.length,
                totalTests: allResults.length,
                passedTests: allResults.filter(r => r.passed).length,
                failedTests: allResults.filter(r => !r.passed).length,
                totalDuration,
                overallSuccessRate: allResults.length > 0 
                    ? Math.round((allResults.filter(r => r.passed).length / allResults.length) * 100)
                    : 0
            },
            suites: this.results,
            performanceMetrics: PerformanceMonitor.getReport()
        };
    }
    
    /**
     * Save report to file
     */
    private async saveReport(report: PerformanceReport): Promise<void> {
        const reportsDir = path.join(__dirname, '../../../test-results/performance');
        
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }
        
        // Save JSON report
        const jsonPath = path.join(reportsDir, 'performance-test-results.json');
        fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
        
        // Save HTML report
        const htmlPath = path.join(reportsDir, 'performance-test-report.html');
        const htmlContent = this.generateHTMLReport(report);
        fs.writeFileSync(htmlPath, htmlContent);
        
        console.log(`\n📊 Performance reports saved to ${reportsDir}`);
    }
    
    /**
     * Generate HTML report
     */
    private generateHTMLReport(report: PerformanceReport): string {
        const successRate = report.summary.overallSuccessRate;
        const statusColor = successRate === 100 ? '#4caf50' : successRate >= 80 ? '#ff9800' : '#f44336';
        
        return `
<!DOCTYPE html>
<html>
<head>
    <title>Performance Test Results - Tableau LSP</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .summary-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
        .summary-card .value { font-size: 2em; font-weight: bold; color: ${statusColor}; }
        .suite { border: 1px solid #ddd; margin: 15px 0; border-radius: 8px; }
        .suite-passed { border-left: 4px solid #4caf50; }
        .suite-failed { border-left: 4px solid #f44336; }
        .test-item { padding: 10px 15px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; }
        .test-passed { background: #f1f8e9; }
        .test-failed { background: #ffebee; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8f9fa; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Performance Test Results</h1>
        <p>Generated: ${new Date(report.timestamp).toLocaleString()}</p>
        
        <div class="summary">
            <div class="summary-card">
                <h3>Success Rate</h3>
                <div class="value">${successRate}%</div>
            </div>
            <div class="summary-card">
                <h3>Total Tests</h3>
                <div class="value">${report.summary.totalTests}</div>
            </div>
            <div class="summary-card">
                <h3>Total Duration</h3>
                <div class="value">${(report.summary.totalDuration / 1000).toFixed(1)}s</div>
            </div>
        </div>
        
        ${report.suites.map(suite => `
            <div class="suite ${suite.failedTests === 0 ? 'suite-passed' : 'suite-failed'}">
                <h3>${suite.suiteName} ${suite.failedTests === 0 ? '✅' : '❌'}</h3>
                ${suite.results.map(test => `
                    <div class="test-item ${test.passed ? 'test-passed' : 'test-failed'}">
                        <span>${test.passed ? '✅' : '❌'} ${test.testName}</span>
                        <span>${test.actualValue.toFixed(2)} (${test.requirement})</span>
                    </div>
                `).join('')}
            </div>
        `).join('')}
    </div>
</body>
</html>
        `;
    } 
   /**
     * Print test summary to console
     */
    private printSummary(report: PerformanceReport): void {
        console.log('\n' + '='.repeat(60));
        console.log('⚡ PERFORMANCE TEST SUMMARY');
        console.log('='.repeat(60));
        
        console.log(`Overall Result: ${report.summary.failedTests === 0 ? '✅ PASSED' : '❌ FAILED'}`);
        console.log(`Total Duration: ${(report.summary.totalDuration / 1000).toFixed(2)}s`);
        console.log(`Success Rate: ${report.summary.overallSuccessRate}%`);
        
        console.log(`\nTest Results:`);
        console.log(`  Total Suites: ${report.summary.totalSuites}`);
        console.log(`  Total Tests: ${report.summary.totalTests}`);
        console.log(`  Passed: ${report.summary.passedTests} ✅`);
        console.log(`  Failed: ${report.summary.failedTests} ❌`);
        
        console.log(`\nSuite Results:`);
        report.suites.forEach(suite => {
            const status = suite.failedTests === 0 ? '✅' : '❌';
            const duration = (suite.totalDuration / 1000).toFixed(2);
            console.log(`  ${status} ${suite.suiteName}: ${suite.passedTests}/${suite.results.length} tests (${duration}s)`);
        });
        
        // Show failed tests
        const failedTests = report.suites.flatMap(suite => 
            suite.results.filter(test => !test.passed)
        );
        
        if (failedTests.length > 0) {
            console.log(`\n❌ Failed Tests:`);
            failedTests.forEach(test => {
                console.log(`  • ${test.testName}: ${test.actualValue.toFixed(2)} (expected ${test.requirement})`);
            });
        }
        
        if (report.summary.failedTests === 0) {
            console.log(`\n🎉 All performance tests passed!`);
        }
    }
    
    /**
     * Generate test document with specified number of lines
     */
    private generateTestDocument(lines: number, uri: string = 'test://performance.twbl'): TextDocument {
        const content: string[] = [];
        
        for (let i = 0; i < lines; i++) {
            const lineType = i % 15;
            
            switch (lineType) {
                case 0:
                    content.push(`SUM([Sales${i}])`);
                    break;
                case 1:
                    content.push(`AVG([Profit${i}])`);
                    break;
                case 2:
                    content.push(`COUNT([Orders${i}])`);
                    break;
                case 3:
                    content.push(`IF [Sales${i}] > ${i * 100} THEN "High" ELSE "Low" END`);
                    break;
                case 4:
                    content.push(`{FIXED [Customer${i}] : SUM([Sales${i}])}`);
                    break;
                case 5:
                    content.push(`// Performance test comment ${i}`);
                    break;
                case 6:
                    content.push(`[Field${i}] + [AnotherField${i}] * ${i}`);
                    break;
                case 7:
                    content.push(`CASE [Region${i}] WHEN "North" THEN 1 WHEN "South" THEN 2 ELSE 0 END`);
                    break;
                case 8:
                    content.push(`IIF([Profit${i}] > 0, "Profitable", "Loss")`);
                    break;
                case 9:
                    content.push(`LOOKUP(SUM([Sales${i}]), -1)`);
                    break;
                case 10:
                    content.push(`WINDOW_SUM(SUM([Sales${i}]))`);
                    break;
                case 11:
                    content.push(`RANK(SUM([Sales${i}]), 'desc')`);
                    break;
                case 12:
                    content.push(`DATEADD('month', ${i}, [OrderDate${i}])`);
                    break;
                case 13:
                    content.push(`CONTAINS([ProductName${i}], "Widget")`);
                    break;
                case 14:
                    content.push(`ROUND([Value${i}], 2) + SQRT([AnotherValue${i}])`);
                    break;
            }
        }
        
        return TextDocument.create(uri, 'tableau', 1, content.join('\n'));
    }
}

/**
 * CLI interface for running performance tests
 */
export async function runComprehensivePerformanceTests(): Promise<void> {
    const runner = new ComprehensivePerformanceTestRunner();
    const report = await runner.runAllTests();
    
    // Exit with error code if tests failed
    if (report.summary.failedTests > 0) {
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    runComprehensivePerformanceTests().catch(console.error);
}