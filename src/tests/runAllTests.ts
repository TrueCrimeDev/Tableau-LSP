#!/usr/bin/env node
// src/tests/runAllTests.ts

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { generateTestCoverageReport } from './testCoverageReport.js';

/**
 * R8.1: Comprehensive test runner for all test suites
 * 
 * This script orchestrates the execution of all test types (unit, integration,
 * performance, edge case) and generates comprehensive reports.
 */

interface TestSuiteResult {
    name: string;
    passed: boolean;
    duration: number;
    testCount: number;
    passedCount: number;
    failedCount: number;
    skippedCount: number;
    coverage?: {
        lines: number;
        functions: number;
        branches: number;
        statements: number;
    };
    errors: string[];
}

interface TestRunSummary {
    totalDuration: number;
    totalTests: number;
    totalPassed: number;
    totalFailed: number;
    totalSkipped: number;
    suites: TestSuiteResult[];
    overallCoverage: {
        lines: number;
        functions: number;
        branches: number;
        statements: number;
    };
    success: boolean;
}

class TestRunner {
    private results: TestSuiteResult[] = [];
    private startTime: number = 0;
    
    constructor() {
        this.startTime = Date.now();
    }
    
    /**
     * Run all test suites
     */
    async runAllTests(): Promise<TestRunSummary> {
        console.log('🚀 Starting comprehensive test execution...');
        console.log('=' .repeat(60));
        
        // Ensure test results directory exists
        this.ensureTestResultsDirectory();
        
        // Run test suites in order
        await this.runTestSuite('Unit Tests', 'unit');
        await this.runTestSuite('Integration Tests', 'integration');
        await this.runTestSuite('Performance Tests', 'performance');
        await this.runTestSuite('Edge Case Tests', 'edge');
        
        // Generate coverage report
        await this.generateCoverageReport();
        
        // Generate summary
        const summary = this.generateSummary();
        
        // Generate reports
        await this.generateReports(summary);
        
        // Display results
        this.displayResults(summary);
        
        return summary;
    }
    
    /**
     * Run a specific test suite
     */
    private async runTestSuite(name: string, type: string): Promise<void> {
        console.log(`\n📋 Running ${name}...`);
        
        const startTime = Date.now();
        let result: TestSuiteResult;
        
        try {
            const testPattern = `src/tests/${type}/**/*.test.ts`;
            const jestConfig = path.join(__dirname, 'jest.config.js');
            
            // Build Jest command
            const jestCommand = [
                'npx jest',
                `--testPathPattern="${testPattern}"`,
                `--config="${jestConfig}"`,
                '--verbose',
                '--coverage',
                '--json',
                '--outputFile=test-results/jest-results.json'
            ].join(' ');
            
            console.log(`   Command: ${jestCommand}`);
            
            // Execute tests
            const output = execSync(jestCommand, {
                encoding: 'utf8',
                stdio: 'pipe',
                timeout: 300000 // 5 minutes timeout
            });
            
            // Parse Jest results
            result = this.parseJestResults(name, output, Date.now() - startTime);
            
        } catch (error: any) {
            // Handle test failures
            result = {
                name,
                passed: false,
                duration: Date.now() - startTime,
                testCount: 0,
                passedCount: 0,
                failedCount: 0,
                skippedCount: 0,
                errors: [error.message || 'Unknown error']
            };
            
            console.error(`   ❌ ${name} failed:`, error.message);
        }
        
        this.results.push(result);
        
        // Display suite results
        this.displaySuiteResult(result);
    }
    
    /**
     * Parse Jest results from JSON output
     */
    private parseJestResults(suiteName: string, output: string, duration: number): TestSuiteResult {
        try {
            // Try to read Jest JSON results
            const resultsPath = path.join('test-results', 'jest-results.json');
            let jestResults: any = {};
            
            if (fs.existsSync(resultsPath)) {
                const resultsContent = fs.readFileSync(resultsPath, 'utf8');
                jestResults = JSON.parse(resultsContent);
            }
            
            return {
                name: suiteName,
                passed: jestResults.success || false,
                duration,
                testCount: jestResults.numTotalTests || 0,
                passedCount: jestResults.numPassedTests || 0,
                failedCount: jestResults.numFailedTests || 0,
                skippedCount: jestResults.numPendingTests || 0,
                coverage: this.extractCoverage(jestResults),
                errors: this.extractErrors(jestResults)
            };
        } catch (error) {
            return {
                name: suiteName,
                passed: false,
                duration,
                testCount: 0,
                passedCount: 0,
                failedCount: 0,
                skippedCount: 0,
                errors: ['Failed to parse test results']
            };
        }
    }
    
    /**
     * Extract coverage information from Jest results
     */
    private extractCoverage(jestResults: any): TestSuiteResult['coverage'] {
        if (jestResults.coverageMap) {
            const summary = jestResults.coverageMap.getCoverageSummary?.();
            if (summary) {
                return {
                    lines: summary.lines?.pct || 0,
                    functions: summary.functions?.pct || 0,
                    branches: summary.branches?.pct || 0,
                    statements: summary.statements?.pct || 0
                };
            }
        }
        return undefined;
    }
    
    /**
     * Extract error messages from Jest results
     */
    private extractErrors(jestResults: any): string[] {
        const errors: string[] = [];
        
        if (jestResults.testResults) {
            jestResults.testResults.forEach((testResult: any) => {
                if (testResult.message) {
                    errors.push(testResult.message);
                }
            });
        }
        
        return errors;
    }
    
    /**
     * Generate test coverage report
     */
    private async generateCoverageReport(): Promise<void> {
        console.log('\n📊 Generating coverage report...');
        
        try {
            await generateTestCoverageReport();
            console.log('   ✅ Coverage report generated successfully');
        } catch (error) {
            console.error('   ❌ Failed to generate coverage report:', error);
        }
    }
    
    /**
     * Generate test run summary
     */
    private generateSummary(): TestRunSummary {
        const totalDuration = Date.now() - this.startTime;
        const totalTests = this.results.reduce((sum, r) => sum + r.testCount, 0);
        const totalPassed = this.results.reduce((sum, r) => sum + r.passedCount, 0);
        const totalFailed = this.results.reduce((sum, r) => sum + r.failedCount, 0);
        const totalSkipped = this.results.reduce((sum, r) => sum + r.skippedCount, 0);
        
        // Calculate overall coverage
        const coverageResults = this.results.filter(r => r.coverage);
        const overallCoverage = {
            lines: coverageResults.length > 0 
                ? Math.round(coverageResults.reduce((sum, r) => sum + (r.coverage?.lines || 0), 0) / coverageResults.length)
                : 0,
            functions: coverageResults.length > 0
                ? Math.round(coverageResults.reduce((sum, r) => sum + (r.coverage?.functions || 0), 0) / coverageResults.length)
                : 0,
            branches: coverageResults.length > 0
                ? Math.round(coverageResults.reduce((sum, r) => sum + (r.coverage?.branches || 0), 0) / coverageResults.length)
                : 0,
            statements: coverageResults.length > 0
                ? Math.round(coverageResults.reduce((sum, r) => sum + (r.coverage?.statements || 0), 0) / coverageResults.length)
                : 0
        };
        
        const success = this.results.every(r => r.passed) && totalFailed === 0;
        
        return {
            totalDuration,
            totalTests,
            totalPassed,
            totalFailed,
            totalSkipped,
            suites: this.results,
            overallCoverage,
            success
        };
    }
    
    /**
     * Generate comprehensive reports
     */
    private async generateReports(summary: TestRunSummary): Promise<void> {
        console.log('\n📄 Generating reports...');
        
        // Generate JSON report
        const jsonReportPath = path.join('test-results', 'test-run-summary.json');
        fs.writeFileSync(jsonReportPath, JSON.stringify(summary, null, 2));
        console.log(`   📋 JSON report: ${jsonReportPath}`);
        
        // Generate HTML report
        const htmlReport = this.generateHTMLReport(summary);
        const htmlReportPath = path.join('test-results', 'test-run-report.html');
        fs.writeFileSync(htmlReportPath, htmlReport);
        console.log(`   🌐 HTML report: ${htmlReportPath}`);
        
        // Generate markdown summary
        const markdownSummary = this.generateMarkdownSummary(summary);
        const markdownPath = path.join('test-results', 'test-run-summary.md');
        fs.writeFileSync(markdownPath, markdownSummary);
        console.log(`   📝 Markdown summary: ${markdownPath}`);
    }
    
    /**
     * Display suite result
     */
    private displaySuiteResult(result: TestSuiteResult): void {
        const status = result.passed ? '✅' : '❌';
        const duration = (result.duration / 1000).toFixed(2);
        
        console.log(`   ${status} ${result.name}`);
        console.log(`      Tests: ${result.testCount} total, ${result.passedCount} passed, ${result.failedCount} failed`);
        console.log(`      Duration: ${duration}s`);
        
        if (result.coverage) {
            console.log(`      Coverage: ${result.coverage.lines}% lines, ${result.coverage.functions}% functions`);
        }
        
        if (result.errors.length > 0) {
            console.log(`      Errors: ${result.errors.length}`);
            result.errors.slice(0, 3).forEach(error => {
                console.log(`        - ${error.substring(0, 100)}...`);
            });
        }
    }
    
    /**
     * Display final results
     */
    private displayResults(summary: TestRunSummary): void {
        console.log('\n' + '='.repeat(60));
        console.log('📊 TEST RUN SUMMARY');
        console.log('='.repeat(60));
        
        const status = summary.success ? '✅ PASSED' : '❌ FAILED';
        const duration = (summary.totalDuration / 1000).toFixed(2);
        const successRate = summary.totalTests > 0 
            ? ((summary.totalPassed / summary.totalTests) * 100).toFixed(1)
            : '0';
        
        console.log(`Status: ${status}`);
        console.log(`Total Duration: ${duration}s`);
        console.log(`Tests: ${summary.totalTests} total, ${summary.totalPassed} passed, ${summary.totalFailed} failed, ${summary.totalSkipped} skipped`);
        console.log(`Success Rate: ${successRate}%`);
        console.log(`Overall Coverage: ${summary.overallCoverage.lines}% lines, ${summary.overallCoverage.functions}% functions`);
        
        console.log('\nSuite Results:');
        summary.suites.forEach(suite => {
            const suiteStatus = suite.passed ? '✅' : '❌';
            const suiteDuration = (suite.duration / 1000).toFixed(2);
            console.log(`  ${suiteStatus} ${suite.name} (${suite.testCount} tests, ${suiteDuration}s)`);
        });
        
        if (!summary.success) {
            console.log('\n❌ Some tests failed. Check the detailed reports for more information.');
            process.exit(1);
        } else {
            console.log('\n🎉 All tests passed successfully!');
        }
    }
    
    /**
     * Generate HTML report
     */
    private generateHTMLReport(summary: TestRunSummary): string {
        return `
<!DOCTYPE html>
<html>
<head>
    <title>Test Run Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .success { color: #4caf50; }
        .failure { color: #f44336; }
        .suite { border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 5px; }
        .suite.passed { border-left: 5px solid #4caf50; }
        .suite.failed { border-left: 5px solid #f44336; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
        .coverage-bar { background: #e0e0e0; height: 20px; border-radius: 10px; overflow: hidden; }
        .coverage-fill { height: 100%; background: #4caf50; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Test Run Report</h1>
        <p><strong>Status:</strong> <span class="${summary.success ? 'success' : 'failure'}">${summary.success ? 'PASSED' : 'FAILED'}</span></p>
        <p><strong>Duration:</strong> ${(summary.totalDuration / 1000).toFixed(2)}s</p>
        <p><strong>Tests:</strong> ${summary.totalTests} total, ${summary.totalPassed} passed, ${summary.totalFailed} failed</p>
        <p><strong>Success Rate:</strong> ${summary.totalTests > 0 ? ((summary.totalPassed / summary.totalTests) * 100).toFixed(1) : '0'}%</p>
    </div>
    
    <h2>Coverage Summary</h2>
    <table>
        <tr><th>Metric</th><th>Coverage</th><th>Visual</th></tr>
        <tr>
            <td>Lines</td>
            <td>${summary.overallCoverage.lines}%</td>
            <td><div class="coverage-bar"><div class="coverage-fill" style="width: ${summary.overallCoverage.lines}%"></div></div></td>
        </tr>
        <tr>
            <td>Functions</td>
            <td>${summary.overallCoverage.functions}%</td>
            <td><div class="coverage-bar"><div class="coverage-fill" style="width: ${summary.overallCoverage.functions}%"></div></div></td>
        </tr>
        <tr>
            <td>Branches</td>
            <td>${summary.overallCoverage.branches}%</td>
            <td><div class="coverage-bar"><div class="coverage-fill" style="width: ${summary.overallCoverage.branches}%"></div></div></td>
        </tr>
    </table>
    
    <h2>Test Suites</h2>
    ${summary.suites.map(suite => `
        <div class="suite ${suite.passed ? 'passed' : 'failed'}">
            <h3>${suite.name} ${suite.passed ? '✅' : '❌'}</h3>
            <p><strong>Tests:</strong> ${suite.testCount} total, ${suite.passedCount} passed, ${suite.failedCount} failed, ${suite.skippedCount} skipped</p>
            <p><strong>Duration:</strong> ${(suite.duration / 1000).toFixed(2)}s</p>
            ${suite.coverage ? `
                <p><strong>Coverage:</strong> ${suite.coverage.lines}% lines, ${suite.coverage.functions}% functions, ${suite.coverage.branches}% branches</p>
            ` : ''}
            ${suite.errors.length > 0 ? `
                <details>
                    <summary>Errors (${suite.errors.length})</summary>
                    <ul>
                        ${suite.errors.map(error => `<li><pre>${error}</pre></li>`).join('')}
                    </ul>
                </details>
            ` : ''}
        </div>
    `).join('')}
    
    <footer>
        <p><em>Generated on ${new Date().toLocaleString()}</em></p>
    </footer>
</body>
</html>
        `;
    }
    
    /**
     * Generate markdown summary
     */
    private generateMarkdownSummary(summary: TestRunSummary): string {
        const status = summary.success ? '✅ PASSED' : '❌ FAILED';
        const duration = (summary.totalDuration / 1000).toFixed(2);
        const successRate = summary.totalTests > 0 
            ? ((summary.totalPassed / summary.totalTests) * 100).toFixed(1)
            : '0';
        
        return `# Test Run Summary

**Status:** ${status}  
**Duration:** ${duration}s  
**Tests:** ${summary.totalTests} total, ${summary.totalPassed} passed, ${summary.totalFailed} failed, ${summary.totalSkipped} skipped  
**Success Rate:** ${successRate}%  

## Coverage

- **Lines:** ${summary.overallCoverage.lines}%
- **Functions:** ${summary.overallCoverage.functions}%
- **Branches:** ${summary.overallCoverage.branches}%
- **Statements:** ${summary.overallCoverage.statements}%

## Test Suites

${summary.suites.map(suite => {
    const suiteStatus = suite.passed ? '✅' : '❌';
    const suiteDuration = (suite.duration / 1000).toFixed(2);
    return `### ${suite.name} ${suiteStatus}

- **Tests:** ${suite.testCount} total, ${suite.passedCount} passed, ${suite.failedCount} failed, ${suite.skippedCount} skipped
- **Duration:** ${suiteDuration}s
${suite.coverage ? `- **Coverage:** ${suite.coverage.lines}% lines, ${suite.coverage.functions}% functions\n` : ''}
${suite.errors.length > 0 ? `- **Errors:** ${suite.errors.length}\n` : ''}`;
}).join('\n\n')}

---

*Generated on ${new Date().toLocaleString()}*
`;
    }
    
    /**
     * Ensure test results directory exists
     */
    private ensureTestResultsDirectory(): void {
        const testResultsDir = 'test-results';
        if (!fs.existsSync(testResultsDir)) {
            fs.mkdirSync(testResultsDir, { recursive: true });
        }
    }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
    const runner = new TestRunner();
    
    try {
        const summary = await runner.runAllTests();
        
        // Exit with appropriate code
        process.exit(summary.success ? 0 : 1);
    } catch (error) {
        console.error('❌ Test runner failed:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

export { TestRunner, TestRunSummary, TestSuiteResult };
