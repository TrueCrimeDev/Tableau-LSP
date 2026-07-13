// src/tests/edge/edgeCaseTestRunner.ts

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * R8.4: Edge case test runner with comprehensive reporting
 * 
 * This module provides a unified runner for all edge case tests with detailed
 * reporting, error analysis, and CI/CD integration.
 */

interface EdgeCaseTestResult {
    testSuite: string;
    testName: string;
    status: 'passed' | 'failed' | 'skipped';
    duration: number;
    errorMessage?: string;
    errorStack?: string;
    category: 'malformed-inputs' | 'boundary-conditions' | 'error-recovery';
}

interface EdgeCaseTestSummary {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    duration: number;
    successRate: number;
    categories: {
        [key: string]: {
            total: number;
            passed: number;
            failed: number;
            successRate: number;
        };
    };
}

interface EdgeCaseTestReport {
    timestamp: string;
    environment: {
        nodeVersion: string;
        platform: string;
        arch: string;
    };
    summary: EdgeCaseTestSummary;
    results: EdgeCaseTestResult[];
    recommendations: string[];
    criticalFailures: string[];
}

/**
 * Edge case test runner class
 */
export class EdgeCaseTestRunner {
    private results: EdgeCaseTestResult[] = [];
    private startTime: number = 0;

    /**
     * Run all edge case tests
     */
    async runAllTests(): Promise<EdgeCaseTestReport> {
        console.log('🧪 Starting Edge Case Test Suite');
        console.log('=' .repeat(60));
        
        this.startTime = Date.now();
        this.results = [];

        const testSuites = [
            {
                name: 'Malformed Inputs',
                file: 'malformedInputs.test.ts',
                category: 'malformed-inputs' as const
            },
            {
                name: 'Boundary Conditions',
                file: 'boundaryConditions.test.ts',
                category: 'boundary-conditions' as const
            },
            {
                name: 'Error Recovery',
                file: 'errorRecovery.test.ts',
                category: 'error-recovery' as const
            }
        ];

        // Run each test suite
        for (const suite of testSuites) {
            console.log(`\\n📋 Running ${suite.name}...`);
            
            try {
                await this.runTestSuite(suite.name, suite.file, suite.category);
                console.log(`✅ ${suite.name} completed`);
            } catch (error) {
                console.error(`❌ ${suite.name} failed:`, error);
                this.results.push({
                    testSuite: suite.name,
                    testName: 'Suite Execution',
                    status: 'failed',
                    duration: 0,
                    errorMessage: error instanceof Error ? error.message : String(error),
                    category: suite.category
                });
            }
        }

        // Generate comprehensive report
        const report = this.generateReport();
        
        // Save report
        await this.saveReport(report);
        
        // Print summary
        this.printSummary(report);
        
        return report;
    }

    /**
     * Run a specific test suite
     */
    private async runTestSuite(
        suiteName: string, 
        fileName: string, 
        category: EdgeCaseTestResult['category']
    ): Promise<void> {
        const testFile = path.join(__dirname, fileName);
        
        if (!fs.existsSync(testFile)) {
            throw new Error(`Test file not found: ${testFile}`);
        }

        const startTime = Date.now();
        
        try {
            // Run Jest with specific test file
            const jestConfig = path.join(__dirname, '../jest.config.js');
            const command = `npx jest --config="${jestConfig}" --testPathPattern="${testFile}" --verbose --json`;
            
            const output = execSync(command, {
                cwd: path.join(__dirname, '../../..'),
                encoding: 'utf8',
                stdio: 'pipe'
            });
            
            // Parse Jest JSON output
            const jestResult = JSON.parse(output);
            
            // Process test results
            this.processJestResults(jestResult, suiteName, category);
            
        } catch (error) {
            const duration = Date.now() - startTime;
            
            // Try to parse Jest output even if command failed
            if (error instanceof Error && 'stdout' in error) {
                try {
                    const jestResult = JSON.parse(String(error.stdout));
                    this.processJestResults(jestResult, suiteName, category);
                } catch (parseError) {
                    // If we can't parse Jest output, record the failure
                    this.results.push({
                        testSuite: suiteName,
                        testName: 'Test Suite Execution',
                        status: 'failed',
                        duration,
                        errorMessage: error.message,
                        errorStack: error.stack,
                        category
                    });
                }
            } else {
                throw error;
            }
        }
    }

    /**
     * Process Jest test results
     */
    private processJestResults(
        jestResult: any, 
        suiteName: string, 
        category: EdgeCaseTestResult['category']
    ): void {
        if (!jestResult.testResults || !Array.isArray(jestResult.testResults)) {
            return;
        }

        jestResult.testResults.forEach((testFile: any) => {
            if (!testFile.assertionResults) return;

            testFile.assertionResults.forEach((test: any) => {
                const result: EdgeCaseTestResult = {
                    testSuite: suiteName,
                    testName: test.title || test.fullName || 'Unknown Test',
                    status: test.status === 'passed' ? 'passed' : 
                           test.status === 'skipped' ? 'skipped' : 'failed',
                    duration: test.duration || 0,
                    category
                };

                if (test.failureMessages && test.failureMessages.length > 0) {
                    result.errorMessage = test.failureMessages[0];
                }

                this.results.push(result);
            });
        });
    }

    /**
     * Generate comprehensive test report
     */
    private generateReport(): EdgeCaseTestReport {
        const totalDuration = Date.now() - this.startTime;
        
        const summary = this.calculateSummary();
        const recommendations = this.generateRecommendations();
        const criticalFailures = this.identifyCriticalFailures();

        return {
            timestamp: new Date().toISOString(),
            environment: {
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch
            },
            summary,
            results: this.results,
            recommendations,
            criticalFailures
        };
    }

    /**
     * Calculate test summary statistics
     */
    private calculateSummary(): EdgeCaseTestSummary {
        const totalTests = this.results.length;
        const passedTests = this.results.filter(r => r.status === 'passed').length;
        const failedTests = this.results.filter(r => r.status === 'failed').length;
        const skippedTests = this.results.filter(r => r.status === 'skipped').length;
        const duration = Date.now() - this.startTime;
        const successRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

        // Calculate category statistics
        const categories: EdgeCaseTestSummary['categories'] = {};
        const categoryNames = ['malformed-inputs', 'boundary-conditions', 'error-recovery'];
        
        categoryNames.forEach(category => {
            const categoryResults = this.results.filter(r => r.category === category);
            const categoryPassed = categoryResults.filter(r => r.status === 'passed').length;
            const categoryFailed = categoryResults.filter(r => r.status === 'failed').length;
            
            categories[category] = {
                total: categoryResults.length,
                passed: categoryPassed,
                failed: categoryFailed,
                successRate: categoryResults.length > 0 ? (categoryPassed / categoryResults.length) * 100 : 0
            };
        });

        return {
            totalTests,
            passedTests,
            failedTests,
            skippedTests,
            duration,
            successRate,
            categories
        };
    }

    /**
     * Generate recommendations based on test results
     */
    private generateRecommendations(): string[] {
        const recommendations: string[] = [];
        const summary = this.calculateSummary();

        // Overall success rate recommendations
        if (summary.successRate < 90) {
            recommendations.push(
                `Overall success rate is ${summary.successRate.toFixed(1)}%. Consider reviewing failed tests and improving error handling.`
            );
        }

        // Category-specific recommendations
        Object.entries(summary.categories).forEach(([category, stats]) => {
            if (stats.successRate < 85) {
                const categoryName = category.replace('-', ' ');
                recommendations.push(
                    `${categoryName} tests have ${stats.successRate.toFixed(1)}% success rate. Focus on improving ${categoryName} handling.`
                );
            }
        });

        // Performance recommendations
        if (summary.duration > 30000) { // 30 seconds
            recommendations.push(
                `Edge case tests took ${(summary.duration / 1000).toFixed(1)}s. Consider optimizing test performance.`
            );
        }

        // Specific failure pattern recommendations
        const malformedInputFailures = this.results.filter(r => 
            r.category === 'malformed-inputs' && r.status === 'failed'
        ).length;
        
        if (malformedInputFailures > 5) {
            recommendations.push(
                'Multiple malformed input tests failed. Review input validation and error recovery mechanisms.'
            );
        }

        const boundaryFailures = this.results.filter(r => 
            r.category === 'boundary-conditions' && r.status === 'failed'
        ).length;
        
        if (boundaryFailures > 3) {
            recommendations.push(
                'Multiple boundary condition tests failed. Review edge case handling for empty inputs and large documents.'
            );
        }

        return recommendations;
    }

    /**
     * Identify critical failures that need immediate attention
     */
    private identifyCriticalFailures(): string[] {
        const criticalFailures: string[] = [];

        // Tests that should never fail
        const criticalTests = [
            'empty document should be handled gracefully',
            'LSP features should work with unclosed strings',
            'should not crash on partial input',
            'error recovery should not significantly impact performance'
        ];

        this.results.forEach(result => {
            if (result.status === 'failed') {
                const isCritical = criticalTests.some(critical => 
                    result.testName.toLowerCase().includes(critical.toLowerCase())
                );
                
                if (isCritical) {
                    criticalFailures.push(
                        `CRITICAL: ${result.testSuite} - ${result.testName}: ${result.errorMessage || 'Unknown error'}`
                    );
                }
            }
        });

        // Check for systematic failures
        const failuresByCategory = this.results.reduce((acc, result) => {
            if (result.status === 'failed') {
                acc[result.category] = (acc[result.category] || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>);

        Object.entries(failuresByCategory).forEach(([category, count]) => {
            if (count > 10) {
                criticalFailures.push(
                    `SYSTEMATIC FAILURE: ${category} has ${count} failed tests - indicates fundamental issue`
                );
            }
        });

        return criticalFailures;
    }

    /**
     * Save test report to files
     */
    private async saveReport(report: EdgeCaseTestReport): Promise<void> {
        const reportsDir = path.join(__dirname, '../../../test-results/edge-cases');
        
        // Ensure directory exists
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        try {
            // Save JSON report
            const jsonPath = path.join(reportsDir, 'edge-case-report.json');
            fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

            // Save HTML report
            const htmlPath = path.join(reportsDir, 'edge-case-report.html');
            const htmlContent = this.generateHtmlReport(report);
            fs.writeFileSync(htmlPath, htmlContent);

            // Save CSV summary
            const csvPath = path.join(reportsDir, 'edge-case-summary.csv');
            const csvContent = this.generateCsvReport(report);
            fs.writeFileSync(csvPath, csvContent);

            console.log(`\\n📊 Edge case test reports saved:`);
            console.log(`  JSON: ${jsonPath}`);
            console.log(`  HTML: ${htmlPath}`);
            console.log(`  CSV:  ${csvPath}`);

        } catch (error) {
            console.error('Failed to save edge case test reports:', error);
        }
    }

    /**
     * Generate HTML report
     */
    private generateHtmlReport(report: EdgeCaseTestReport): string {
        const categoryRows = Object.entries(report.summary.categories)
            .map(([category, stats]) => `
                <tr>
                    <td>${category.replace('-', ' ')}</td>
                    <td>${stats.total}</td>
                    <td class="passed">${stats.passed}</td>
                    <td class="failed">${stats.failed}</td>
                    <td>${stats.successRate.toFixed(1)}%</td>
                </tr>
            `).join('');

        const failedTestRows = report.results
            .filter(r => r.status === 'failed')
            .map(result => `
                <tr>
                    <td>${result.testSuite}</td>
                    <td>${result.testName}</td>
                    <td>${result.duration}ms</td>
                    <td class="error-message">${result.errorMessage || 'Unknown error'}</td>
                </tr>
            `).join('');

        return `
<!DOCTYPE html>
<html>
<head>
    <title>Edge Case Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .metric { background: #e9e9e9; padding: 15px; border-radius: 5px; text-align: center; }
        .passed { color: #4caf50; font-weight: bold; }
        .failed { color: #f44336; font-weight: bold; }
        .skipped { color: #ff9800; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; }
        .error-message { font-family: monospace; font-size: 0.9em; max-width: 300px; word-wrap: break-word; }
        .recommendation { margin: 10px 0; padding: 15px; border-left: 4px solid #2196f3; background: #e3f2fd; }
        .critical { border-left-color: #f44336; background: #ffebee; }
        h1, h2, h3 { color: #333; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Edge Case Test Report</h1>
        <p><strong>Generated:</strong> ${report.timestamp}</p>
        <p><strong>Environment:</strong> ${report.environment.platform} ${report.environment.arch}, Node ${report.environment.nodeVersion}</p>
        <p><strong>Duration:</strong> ${(report.summary.duration / 1000).toFixed(2)}s</p>
    </div>

    <div class="summary">
        <div class="metric">
            <h3>Total Tests</h3>
            <div style="font-size: 2em;">${report.summary.totalTests}</div>
        </div>
        <div class="metric">
            <h3>Passed</h3>
            <div style="font-size: 2em;" class="passed">${report.summary.passedTests}</div>
        </div>
        <div class="metric">
            <h3>Failed</h3>
            <div style="font-size: 2em;" class="failed">${report.summary.failedTests}</div>
        </div>
        <div class="metric">
            <h3>Success Rate</h3>
            <div style="font-size: 2em;">${report.summary.successRate.toFixed(1)}%</div>
        </div>
    </div>

    <h2>Category Breakdown</h2>
    <table>
        <tr>
            <th>Category</th>
            <th>Total</th>
            <th>Passed</th>
            <th>Failed</th>
            <th>Success Rate</th>
        </tr>
        ${categoryRows}
    </table>

    ${report.criticalFailures.length > 0 ? `
    <h2>Critical Failures</h2>
    ${report.criticalFailures.map(failure => `
        <div class="recommendation critical">
            <strong>CRITICAL:</strong> ${failure}
        </div>
    `).join('')}
    ` : ''}

    ${report.summary.failedTests > 0 ? `
    <h2>Failed Tests</h2>
    <table>
        <tr>
            <th>Test Suite</th>
            <th>Test Name</th>
            <th>Duration</th>
            <th>Error Message</th>
        </tr>
        ${failedTestRows}
    </table>
    ` : ''}

    ${report.recommendations.length > 0 ? `
    <h2>Recommendations</h2>
    ${report.recommendations.map(rec => `
        <div class="recommendation">
            ${rec}
        </div>
    `).join('')}
    ` : ''}

    <h2>All Test Results</h2>
    <table>
        <tr>
            <th>Suite</th>
            <th>Test</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Category</th>
        </tr>
        ${report.results.map(result => `
            <tr>
                <td>${result.testSuite}</td>
                <td>${result.testName}</td>
                <td class="${result.status}">${result.status.toUpperCase()}</td>
                <td>${result.duration}ms</td>
                <td>${result.category}</td>
            </tr>
        `).join('')}
    </table>
</body>
</html>
        `;
    }

    /**
     * Generate CSV report
     */
    private generateCsvReport(report: EdgeCaseTestReport): string {
        const headers = [
            'Test Suite',
            'Test Name',
            'Status',
            'Duration (ms)',
            'Category',
            'Error Message'
        ];

        const rows = report.results.map(result => [
            result.testSuite,
            result.testName,
            result.status,
            result.duration.toString(),
            result.category,
            result.errorMessage || ''
        ]);

        return [headers.join(','), ...rows.map(row => row.join(','))].join('\\n');
    }

    /**
     * Print test summary to console
     */
    private printSummary(report: EdgeCaseTestReport): void {
        console.log('\\n' + '='.repeat(60));
        console.log('🧪 EDGE CASE TEST SUMMARY');
        console.log('='.repeat(60));

        const status = report.summary.failedTests === 0 ? '✅ PASSED' : '❌ FAILED';
        console.log(`Overall Result: ${status}`);
        console.log(`Total Duration: ${(report.summary.duration / 1000).toFixed(2)}s`);
        console.log(`Success Rate: ${report.summary.successRate.toFixed(1)}%`);

        console.log(`\\nTest Results:`);
        console.log(`  Total Tests: ${report.summary.totalTests}`);
        console.log(`  Passed: ${report.summary.passedTests} ✅`);
        console.log(`  Failed: ${report.summary.failedTests} ❌`);
        console.log(`  Skipped: ${report.summary.skippedTests} ⏭️`);

        console.log(`\\nCategory Breakdown:`);
        Object.entries(report.summary.categories).forEach(([category, stats]) => {
            const categoryName = category.replace('-', ' ');
            console.log(`  ${categoryName}: ${stats.passed}/${stats.total} (${stats.successRate.toFixed(1)}%)`);
        });

        if (report.criticalFailures.length > 0) {
            console.log(`\\n🚨 Critical Failures:`);
            report.criticalFailures.forEach(failure => {
                console.log(`  • ${failure}`);
            });
        }

        if (report.recommendations.length > 0) {
            console.log(`\\n💡 Recommendations:`);
            report.recommendations.slice(0, 5).forEach(rec => {
                console.log(`  • ${rec}`);
            });
            
            if (report.recommendations.length > 5) {
                console.log(`  ... and ${report.recommendations.length - 5} more (see full report)`);
            }
        }

        if (report.summary.failedTests === 0) {
            console.log(`\\n🎉 All edge case tests passed!`);
        } else {
            console.log(`\\n⚠️  Some edge case tests failed. Review detailed results for improvements.`);
        }
    }
}

/**
 * CLI interface for running edge case tests
 */
export async function runEdgeCaseTests(): Promise<EdgeCaseTestReport> {
    const runner = new EdgeCaseTestRunner();
    
    try {
        const report = await runner.runAllTests();
        
        // Exit with error code if tests failed
        if (report.summary.failedTests > 0) {
            process.exit(1);
        }
        
        return report;
        
    } catch (error) {
        console.error('Edge case test runner failed:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    runEdgeCaseTests().catch(console.error);
}