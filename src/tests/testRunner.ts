// src/tests/testRunner.ts

import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as path from 'path';
import { runIncrementalTests } from './runIncrementalTests';
import { testErrorRecovery } from './testErrorRecovery';
import { runIntegrationTest } from './integrationTest';
import { runPerformanceTests } from './performance/performanceTests';
import { runEdgeCaseTests } from './edge/edgeCaseTests';
import { runIntegrationTests } from './integration/integrationTests';

/**
 * Main test runner for Tableau LSP automated testing
 */
async function runAllTests() {
    console.log('🚀 Starting Tableau LSP Automated Test Suite\n');
    
    const startTime = performance.now();
    const results: TestSuiteResult = {
        startTime: new Date(),
        endTime: new Date(),
        duration: 0,
        suites: [],
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0
    };
    
    try {
        // Create test results directory if it doesn't exist
        const resultsDir = path.join(__dirname, '../../test-results');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }
        
        // Run all test suites
        await runTestSuite('Incremental Parsing Tests', runIncrementalTests, results);
        await runTestSuite('Error Recovery Tests', testErrorRecovery, results);
        await runTestSuite('Basic Integration Tests', runIntegrationTest, results);
        await runTestSuite('Performance Tests', runPerformanceTests, results);
        await runTestSuite('Edge Case Tests', runEdgeCaseTests, results);
        await runTestSuite('Comprehensive Integration Tests', runIntegrationTests, results);
        
        // Calculate final statistics
        results.endTime = new Date();
        results.duration = performance.now() - startTime;
        
        // Generate test report
        generateTestReport(results);
        
        // Print summary
        console.log('\n📊 Test Suite Summary:');
        console.log(`Total Test Suites: ${results.suites.length}`);
        console.log(`Total Tests: ${results.totalTests}`);
        console.log(`Passed: ${results.passedTests}`);
        console.log(`Failed: ${results.failedTests}`);
        console.log(`Skipped: ${results.skippedTests}`);
        console.log(`Duration: ${(results.duration / 1000).toFixed(2)}s`);
        
        if (results.failedTests === 0) {
            console.log('\n✅ All tests passed successfully!');
        } else {
            console.log(`\n❌ ${results.failedTests} tests failed. Check the test report for details.`);
            process.exit(1);
        }
        
    } catch (error) {
        console.error('\n❌ Test runner encountered an error:', error);
        process.exit(1);
    }
}

/**
 * Run a single test suite and capture results
 */
async function runTestSuite(name: string, testFn: Function, results: TestSuiteResult): Promise<void> {
    console.log(`\n📋 Running Test Suite: ${name}`);
    console.log('------------------------------------------------');
    
    const suiteStartTime = performance.now();
    const suiteResult: TestSuite = {
        name,
        startTime: new Date(),
        endTime: new Date(),
        duration: 0,
        tests: [],
        passed: true
    };
    
    try {
        // Capture console output
        const originalConsoleLog = console.log;
        const originalConsoleError = console.error;
        const logs: string[] = [];
        
        console.log = (...args) => {
            logs.push(args.join(' '));
            originalConsoleLog(...args);
        };
        
        console.error = (...args) => {
            logs.push(`ERROR: ${args.join(' ')}`);
            originalConsoleError(...args);
        };
        
        // Run the test suite
        await testFn();
        
        // Restore console
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
        
        // Parse logs to extract test results
        const testResults = parseTestResults(logs);
        suiteResult.tests = testResults;
        
        // Update suite statistics
        suiteResult.passed = testResults.every(test => test.status === 'passed');
        suiteResult.endTime = new Date();
        suiteResult.duration = performance.now() - suiteStartTime;
        
        // Update overall results
        results.suites.push(suiteResult);
        results.totalTests += testResults.length;
        results.passedTests += testResults.filter(t => t.status === 'passed').length;
        results.failedTests += testResults.filter(t => t.status === 'failed').length;
        results.skippedTests += testResults.filter(t => t.status === 'skipped').length;
        
        console.log('------------------------------------------------');
        console.log(`✅ Suite ${name} completed in ${(suiteResult.duration / 1000).toFixed(2)}s`);
        
    } catch (error) {
        suiteResult.passed = false;
        suiteResult.endTime = new Date();
        suiteResult.duration = performance.now() - suiteStartTime;
        suiteResult.error = error instanceof Error ? error.message : String(error);
        
        results.suites.push(suiteResult);
        results.failedTests++;
        
        console.log('------------------------------------------------');
        console.error(`❌ Suite ${name} failed: ${suiteResult.error}`);
    }
}

/**
 * Parse console logs to extract test results
 */
function parseTestResults(logs: string[]): TestResult[] {
    const results: TestResult[] = [];
    let currentTest: Partial<TestResult> | null = null;
    
    for (const log of logs) {
        // Test start detection
        const testStartMatch = log.match(/Test \d+: (.+)/);
        if (testStartMatch) {
            if (currentTest) {
                results.push(currentTest as TestResult);
            }
            currentTest = {
                name: testStartMatch[1],
                status: 'unknown',
                logs: [log]
            };
            continue;
        }
        
        // Test result detection
        if (currentTest) {
            currentTest.logs!.push(log);
            
            if (log.includes('✓') && !log.includes('✗')) {
                currentTest.status = 'passed';
            } else if (log.includes('✗')) {
                currentTest.status = 'failed';
                currentTest.error = log;
            }
        }
    }
    
    // Add the last test if any
    if (currentTest) {
        if (currentTest.status === 'unknown') {
            currentTest.status = 'passed'; // Default to passed if no explicit failure
        }
        results.push(currentTest as TestResult);
    }
    
    return results;
}

/**
 * Generate HTML test report
 */
function generateTestReport(results: TestSuiteResult): void {
    const reportPath = path.join(__dirname, '../../test-results/test-report.html');
    const jsonPath = path.join(__dirname, '../../test-results/test-results.json');
    
    // Save JSON results
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
    
    // Generate HTML report
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tableau LSP Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; }
        h1 { color: #2c3e50; }
        .summary { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        .suite { margin-bottom: 30px; border: 1px solid #ddd; border-radius: 5px; overflow: hidden; }
        .suite-header { background-color: #f1f1f1; padding: 10px 15px; border-bottom: 1px solid #ddd; }
        .suite-header.passed { background-color: #d4edda; }
        .suite-header.failed { background-color: #f8d7da; }
        .suite-body { padding: 0 15px; }
        .test { margin: 10px 0; padding: 10px; border-radius: 5px; }
        .test.passed { background-color: #d4edda; }
        .test.failed { background-color: #f8d7da; }
        .test.skipped { background-color: #fff3cd; }
        .test-logs { font-family: monospace; white-space: pre-wrap; background-color: #f8f9fa; padding: 10px; border-radius: 3px; max-height: 200px; overflow-y: auto; margin-top: 10px; }
        .toggle-logs { cursor: pointer; color: #007bff; }
        .stats { display: flex; gap: 20px; margin-bottom: 20px; }
        .stat-box { flex: 1; padding: 15px; border-radius: 5px; text-align: center; }
        .total { background-color: #e9ecef; }
        .passed { background-color: #d4edda; }
        .failed { background-color: #f8d7da; }
        .skipped { background-color: #fff3cd; }
        .stat-value { font-size: 24px; font-weight: bold; }
    </style>
</head>
<body>
    <h1>Tableau LSP Test Report</h1>
    
    <div class="summary">
        <p><strong>Date:</strong> ${results.startTime.toLocaleString()}</p>
        <p><strong>Duration:</strong> ${(results.duration / 1000).toFixed(2)} seconds</p>
        
        <div class="stats">
            <div class="stat-box total">
                <div>Total Tests</div>
                <div class="stat-value">${results.totalTests}</div>
            </div>
            <div class="stat-box passed">
                <div>Passed</div>
                <div class="stat-value">${results.passedTests}</div>
            </div>
            <div class="stat-box failed">
                <div>Failed</div>
                <div class="stat-value">${results.failedTests}</div>
            </div>
            <div class="stat-box skipped">
                <div>Skipped</div>
                <div class="stat-value">${results.skippedTests}</div>
            </div>
        </div>
    </div>
    
    ${results.suites.map(suite => `
        <div class="suite">
            <div class="suite-header ${suite.passed ? 'passed' : 'failed'}">
                <h2>${suite.name}</h2>
                <p><strong>Duration:</strong> ${(suite.duration / 1000).toFixed(2)} seconds</p>
                ${suite.error ? `<p><strong>Error:</strong> ${suite.error}</p>` : ''}
            </div>
            <div class="suite-body">
                ${suite.tests.map(test => `
                    <div class="test ${test.status}">
                        <h3>${test.name}</h3>
                        <p><strong>Status:</strong> ${test.status.toUpperCase()}</p>
                        ${test.error ? `<p><strong>Error:</strong> ${test.error}</p>` : ''}
                        <div>
                            <span class="toggle-logs" onclick="toggleLogs(this)">Show logs</span>
                            <div class="test-logs" style="display: none;">
                                ${test.logs.join('\n')}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('')}
    
    <script>
        function toggleLogs(element) {
            const logs = element.nextElementSibling;
            if (logs.style.display === 'none') {
                logs.style.display = 'block';
                element.textContent = 'Hide logs';
            } else {
                logs.style.display = 'none';
                element.textContent = 'Show logs';
            }
        }
    </script>
</body>
</html>
    `;
    
    fs.writeFileSync(reportPath, html);
    console.log(`\n📄 Test report generated: ${reportPath}`);
}

// Run all tests if this file is executed directly
if (require.main === module) {
    runAllTests().catch(console.error);
}

export { runAllTests };

// Types
interface TestSuiteResult {
    startTime: Date;
    endTime: Date;
    duration: number;
    suites: TestSuite[];
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
}

interface TestSuite {
    name: string;
    startTime: Date;
    endTime: Date;
    duration: number;
    tests: TestResult[];
    passed: boolean;
    error?: string;
}

interface TestResult {
    name: string;
    status: 'passed' | 'failed' | 'skipped' | 'unknown';
    logs: string[];
    error?: string;
}