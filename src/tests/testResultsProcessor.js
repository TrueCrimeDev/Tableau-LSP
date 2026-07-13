// src/tests/testResultsProcessor.js

const fs = require('fs');
const path = require('path');

/**
 * Custom test results processor for Jest
 * Processes test results and generates additional reports
 */
module.exports = function(results) {
    // Process and enhance test results
    const processedResults = processTestResults(results);
    
    // Generate custom reports
    generateCustomReports(processedResults);
    
    // Generate performance metrics
    generatePerformanceMetrics(processedResults);
    
    // Generate component coverage summary
    generateComponentCoverageSummary(processedResults);
    
    return results;
};

/**
 * Process raw test results into a more useful format
 */
function processTestResults(results) {
    const processed = {
        summary: {
            total: results.numTotalTests,
            passed: results.numPassedTests,
            failed: results.numFailedTests,
            skipped: results.numPendingTests,
            duration: results.testResults.reduce((sum, result) => sum + (result.perfStats?.end - result.perfStats?.start || 0), 0),
            success: results.success
        },
        suites: [],
        coverage: results.coverageMap ? processCoverageData(results.coverageMap) : null,
        performance: {
            slowestTests: [],
            averageTestTime: 0,
            totalTestTime: 0
        }
    };
    
    // Process individual test suites
    results.testResults.forEach(testResult => {
        const suite = {
            name: testResult.testFilePath,
            duration: testResult.perfStats?.end - testResult.perfStats?.start || 0,
            tests: testResult.testResults.map(test => ({
                name: test.fullName,
                status: test.status,
                duration: test.duration || 0,
                errors: test.failureMessages
            })),
            coverage: testResult.coverage || null
        };
        
        processed.suites.push(suite);
        
        // Track slow tests
        testResult.testResults.forEach(test => {
            if (test.duration && test.duration > 1000) { // Tests slower than 1 second
                processed.performance.slowestTests.push({
                    name: test.fullName,
                    suite: testResult.testFilePath,
                    duration: test.duration
                });
            }
        });
    });
    
    // Sort slowest tests
    processed.performance.slowestTests.sort((a, b) => b.duration - a.duration);
    processed.performance.slowestTests = processed.performance.slowestTests.slice(0, 10);
    
    // Calculate performance metrics
    const allTestDurations = processed.suites.flatMap(suite => 
        suite.tests.map(test => test.duration).filter(d => d > 0)
    );
    
    processed.performance.totalTestTime = allTestDurations.reduce((sum, duration) => sum + duration, 0);
    processed.performance.averageTestTime = allTestDurations.length > 0 
        ? processed.performance.totalTestTime / allTestDurations.length 
        : 0;
    
    return processed;
}

/**
 * Process coverage data into a more readable format
 */
function processCoverageData(coverageMap) {
    if (!coverageMap || typeof coverageMap.getCoverageSummary !== 'function') {
        return null;
    }
    
    const summary = coverageMap.getCoverageSummary();
    
    return {
        lines: {
            total: summary.lines.total,
            covered: summary.lines.covered,
            percentage: summary.lines.pct
        },
        functions: {
            total: summary.functions.total,
            covered: summary.functions.covered,
            percentage: summary.functions.pct
        },
        branches: {
            total: summary.branches.total,
            covered: summary.branches.covered,
            percentage: summary.branches.pct
        },
        statements: {
            total: summary.statements.total,
            covered: summary.statements.covered,
            percentage: summary.statements.pct
        }
    };
}

/**
 * Generate custom test reports
 */
function generateCustomReports(results) {
    const reportsDir = path.join(__dirname, '../test-results');
    
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    // Generate detailed JSON report
    const detailedReportPath = path.join(reportsDir, 'detailed-results.json');
    fs.writeFileSync(detailedReportPath, JSON.stringify(results, null, 2));
    
    // Generate markdown summary
    const markdownSummary = generateMarkdownSummary(results);
    const markdownPath = path.join(reportsDir, 'test-summary.md');
    fs.writeFileSync(markdownPath, markdownSummary);
    
    console.log('📄 Custom reports generated:');
    console.log(`  - Detailed JSON: ${detailedReportPath}`);
    console.log(`  - Markdown Summary: ${markdownPath}`);
}

/**
 * Generate performance metrics report
 */
function generatePerformanceMetrics(results) {
    const performanceReport = {
        summary: {
            totalTestTime: results.performance.totalTestTime,
            averageTestTime: Math.round(results.performance.averageTestTime),
            slowestTests: results.performance.slowestTests
        },
        suitePerformance: results.suites.map(suite => ({
            name: path.basename(suite.name),
            duration: suite.duration,
            testCount: suite.tests.length,
            averageTestTime: suite.tests.length > 0 
                ? Math.round(suite.tests.reduce((sum, test) => sum + test.duration, 0) / suite.tests.length)
                : 0
        })).sort((a, b) => b.duration - a.duration),
        recommendations: generatePerformanceRecommendations(results)
    };
    
    const performancePath = path.join(__dirname, '../test-results/performance-metrics.json');
    fs.writeFileSync(performancePath, JSON.stringify(performanceReport, null, 2));
    
    console.log(`⚡ Performance metrics: ${performancePath}`);
}

/**
 * Generate component coverage summary
 */
function generateComponentCoverageSummary(results) {
    if (!results.coverage) {
        return;
    }
    
    const componentCoverage = {
        overall: results.coverage,
        components: {
            'Document Model': results.coverage, // Would need actual per-file coverage
            'Diagnostics Provider': results.coverage,
            'Hover Provider': results.coverage,
            'Completion Provider': results.coverage,
            'Signature Provider': results.coverage,
            'Format Provider': results.coverage,
            'Lexer': results.coverage,
            'Field Parser': results.coverage,
            'Memory Manager': results.coverage,
            'Request Debouncer': results.coverage
        },
        recommendations: generateCoverageRecommendations(results.coverage)
    };
    
    const coveragePath = path.join(__dirname, '../test-results/component-coverage.json');
    fs.writeFileSync(coveragePath, JSON.stringify(componentCoverage, null, 2));
    
    console.log(`📊 Component coverage: ${coveragePath}`);
}

/**
 * Generate markdown summary report
 */
function generateMarkdownSummary(results) {
    const { summary, performance, coverage } = results;
    
    return `# Tableau LSP Test Results

## Summary

- **Total Tests:** ${summary.total}
- **Passed:** ${summary.passed} ✅
- **Failed:** ${summary.failed} ❌
- **Skipped:** ${summary.skipped} ⏭️
- **Success Rate:** ${((summary.passed / summary.total) * 100).toFixed(1)}%
- **Total Duration:** ${(summary.duration / 1000).toFixed(2)}s

## Performance Metrics

- **Total Test Time:** ${(performance.totalTestTime / 1000).toFixed(2)}s
- **Average Test Time:** ${performance.averageTestTime.toFixed(0)}ms

### Slowest Tests

${performance.slowestTests.map((test, index) => 
    `${index + 1}. **${test.name}** - ${test.duration}ms`
).join('\n')}

${coverage ? `## Coverage Summary

- **Lines:** ${coverage.lines.percentage.toFixed(1)}% (${coverage.lines.covered}/${coverage.lines.total})
- **Functions:** ${coverage.functions.percentage.toFixed(1)}% (${coverage.functions.covered}/${coverage.functions.total})
- **Branches:** ${coverage.branches.percentage.toFixed(1)}% (${coverage.branches.covered}/${coverage.branches.total})
- **Statements:** ${coverage.statements.percentage.toFixed(1)}% (${coverage.statements.covered}/${coverage.statements.total})` : ''}

## Test Suites

${results.suites.map(suite => 
    `### ${path.basename(suite.name)}\n\n- **Duration:** ${suite.duration}ms\n- **Tests:** ${suite.tests.length}\n- **Status:** ${suite.tests.every(t => t.status === 'passed') ? '✅ All Passed' : '❌ Some Failed'}`
).join('\n\n')}

---

*Generated on ${new Date().toISOString()}*
`;
}

/**
 * Generate performance recommendations
 */
function generatePerformanceRecommendations(results) {
    const recommendations = [];
    
    if (results.performance.averageTestTime > 500) {
        recommendations.push('Consider optimizing test setup/teardown - average test time is high');
    }
    
    if (results.performance.slowestTests.length > 5) {
        recommendations.push('Multiple slow tests detected - consider performance optimization');
    }
    
    if (results.summary.duration > 60000) {
        recommendations.push('Total test suite duration is high - consider parallel execution');
    }
    
    return recommendations;
}

/**
 * Generate coverage recommendations
 */
function generateCoverageRecommendations(coverage) {
    const recommendations = [];
    
    if (coverage.lines.percentage < 80) {
        recommendations.push('Line coverage is below 80% - add more unit tests');
    }
    
    if (coverage.branches.percentage < 75) {
        recommendations.push('Branch coverage is low - test more conditional logic paths');
    }
    
    if (coverage.functions.percentage < 85) {
        recommendations.push('Function coverage could be improved - ensure all functions are tested');
    }
    
    return recommendations;
}
