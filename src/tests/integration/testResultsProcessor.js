// src/tests/integration/testResultsProcessor.js

const fs = require('fs');
const path = require('path');

/**
 * R8.2: Integration test results processor
 * 
 * This module processes Jest test results for integration tests,
 * generating detailed reports and performance metrics.
 */

module.exports = (results) => {
  const timestamp = new Date().toISOString();
  const outputDir = path.join(__dirname, '../../../test-results/integration');
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Process test results
  const processedResults = {
    timestamp,
    summary: {
      totalTests: results.numTotalTests,
      passedTests: results.numPassedTests,
      failedTests: results.numFailedTests,
      skippedTests: results.numPendingTests,
      totalTime: results.testResults.reduce((sum, result) => sum + (result.perfStats?.end - result.perfStats?.start || 0), 0),
      successRate: results.numTotalTests > 0 ? Math.round((results.numPassedTests / results.numTotalTests) * 100) : 0
    },
    testSuites: results.testResults.map(testResult => ({
      name: path.basename(testResult.testFilePath),
      filePath: testResult.testFilePath,
      status: testResult.numFailingTests === 0 ? 'passed' : 'failed',
      duration: testResult.perfStats ? testResult.perfStats.end - testResult.perfStats.start : 0,
      tests: {
        total: testResult.numPassingTests + testResult.numFailingTests + testResult.numPendingTests,
        passed: testResult.numPassingTests,
        failed: testResult.numFailingTests,
        skipped: testResult.numPendingTests
      },
      testResults: testResult.testResults.map(test => ({
        title: test.title,
        fullName: test.fullName,
        status: test.status,
        duration: test.duration || 0,
        error: test.failureMessages.length > 0 ? test.failureMessages[0] : null,
        location: test.location
      }))
    })),
    coverage: results.coverageMap ? {
      summary: results.coverageMap.getCoverageSummary(),
      details: Object.keys(results.coverageMap.data).map(filePath => ({
        filePath,
        coverage: results.coverageMap.fileCoverageFor(filePath).toSummary()
      }))
    } : null,
    performance: {
      slowestTests: results.testResults
        .flatMap(suite => suite.testResults.map(test => ({
          name: test.fullName,
          suite: path.basename(suite.testFilePath),
          duration: test.duration || 0
        })))
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 10),
      averageTestDuration: results.testResults.length > 0 
        ? results.testResults.reduce((sum, suite) => {
            const suiteDuration = suite.testResults.reduce((testSum, test) => testSum + (test.duration || 0), 0);
            return sum + suiteDuration;
          }, 0) / results.numTotalTests
        : 0
    },
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memory: process.memoryUsage(),
      timestamp
    }
  };
  
  // Save JSON report
  const jsonPath = path.join(outputDir, 'integration-test-results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(processedResults, null, 2));
  
  // Generate and save HTML report
  const htmlPath = path.join(outputDir, 'integration-test-report.html');
  const htmlContent = generateHTMLReport(processedResults);
  fs.writeFileSync(htmlPath, htmlContent);
  
  // Generate performance report
  const perfPath = path.join(outputDir, 'performance-report.json');
  const performanceReport = {
    timestamp,
    summary: {
      totalDuration: processedResults.summary.totalTime,
      averageTestDuration: processedResults.performance.averageTestDuration,
      slowestTests: processedResults.performance.slowestTests
    },
    suitePerformance: processedResults.testSuites.map(suite => ({
      name: suite.name,
      duration: suite.duration,
      testsPerSecond: suite.tests.total > 0 ? (suite.tests.total / (suite.duration / 1000)) : 0,
      averageTestDuration: suite.tests.total > 0 ? suite.duration / suite.tests.total : 0
    }))
  };
  fs.writeFileSync(perfPath, JSON.stringify(performanceReport, null, 2));
  
  // Log summary to console
  console.log('\n📊 Integration Test Results Summary:');
  console.log(`   Total Tests: ${processedResults.summary.totalTests}`);
  console.log(`   Passed: ${processedResults.summary.passedTests} ✅`);
  console.log(`   Failed: ${processedResults.summary.failedTests} ❌`);
  console.log(`   Skipped: ${processedResults.summary.skippedTests} ⏭️`);
  console.log(`   Success Rate: ${processedResults.summary.successRate}%`);
  console.log(`   Total Time: ${(processedResults.summary.totalTime / 1000).toFixed(2)}s`);
  console.log(`   Average Test Duration: ${processedResults.performance.averageTestDuration.toFixed(2)}ms`);
  console.log(`\n📁 Reports saved to: ${outputDir}`);
  
  return results;
};

/**
 * Generate HTML report
 */
function generateHTMLReport(results) {
  const successRate = results.summary.successRate;
  const statusColor = successRate === 100 ? '#4caf50' : successRate >= 80 ? '#ff9800' : '#f44336';
  
  return `
<!DOCTYPE html>
<html>
<head>
    <title>Integration Test Results - Tableau LSP</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .summary-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
        .summary-card h3 { margin: 0 0 10px 0; color: #333; }
        .summary-card .value { font-size: 2em; font-weight: bold; color: ${statusColor}; }
        .suite { border: 1px solid #ddd; margin: 15px 0; border-radius: 8px; overflow: hidden; }
        .suite-header { background: #f8f9fa; padding: 15px; border-bottom: 1px solid #ddd; }
        .suite-passed { border-left: 4px solid #4caf50; }
        .suite-failed { border-left: 4px solid #f44336; }
        .test-list { padding: 0; margin: 0; list-style: none; }
        .test-item { padding: 10px 15px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
        .test-item:last-child { border-bottom: none; }
        .test-passed { background: #f1f8e9; }
        .test-failed { background: #ffebee; }
        .test-skipped { background: #fff3e0; }
        .test-name { flex: 1; }
        .test-duration { color: #666; font-size: 0.9em; }
        .error-details { background: #ffebee; border: 1px solid #f44336; padding: 10px; margin: 10px 0; border-radius: 4px; font-family: monospace; font-size: 0.9em; white-space: pre-wrap; }
        .performance-section { margin-top: 30px; }
        .performance-table { width: 100%; border-collapse: collapse; }
        .performance-table th, .performance-table td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        .performance-table th { background: #f8f9fa; }
        .coverage-section { margin-top: 30px; }
        .coverage-bar { background: #e0e0e0; height: 20px; border-radius: 10px; overflow: hidden; margin: 5px 0; }
        .coverage-fill { height: 100%; transition: width 0.3s ease; }
        .coverage-good { background: #4caf50; }
        .coverage-warning { background: #ff9800; }
        .coverage-poor { background: #f44336; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Integration Test Results</h1>
            <p>Tableau Language Server Protocol</p>
            <p>Generated: ${new Date(results.timestamp).toLocaleString()}</p>
        </div>
        
        <div class="summary">
            <div class="summary-card">
                <h3>Success Rate</h3>
                <div class="value">${successRate}%</div>
            </div>
            <div class="summary-card">
                <h3>Total Tests</h3>
                <div class="value">${results.summary.totalTests}</div>
            </div>
            <div class="summary-card">
                <h3>Passed</h3>
                <div class="value" style="color: #4caf50;">${results.summary.passedTests}</div>
            </div>
            <div class="summary-card">
                <h3>Failed</h3>
                <div class="value" style="color: #f44336;">${results.summary.failedTests}</div>
            </div>
            <div class="summary-card">
                <h3>Total Time</h3>
                <div class="value">${(results.summary.totalTime / 1000).toFixed(2)}s</div>
            </div>
            <div class="summary-card">
                <h3>Avg Duration</h3>
                <div class="value">${results.performance.averageTestDuration.toFixed(0)}ms</div>
            </div>
        </div>
        
        <h2>Test Suites</h2>
        ${results.testSuites.map(suite => `
            <div class="suite ${suite.status === 'passed' ? 'suite-passed' : 'suite-failed'}">
                <div class="suite-header">
                    <h3>${suite.name} ${suite.status === 'passed' ? '✅' : '❌'}</h3>
                    <p>Duration: ${(suite.duration / 1000).toFixed(2)}s | Tests: ${suite.tests.passed}/${suite.tests.total} passed</p>
                </div>
                <ul class="test-list">
                    ${suite.testResults.map(test => `
                        <li class="test-item test-${test.status}">
                            <span class="test-name">
                                ${test.status === 'passed' ? '✅' : test.status === 'failed' ? '❌' : '⏭️'} 
                                ${test.title}
                            </span>
                            <span class="test-duration">${test.duration}ms</span>
                            ${test.error ? `<div class="error-details">${test.error}</div>` : ''}
                        </li>
                    `).join('')}
                </ul>
            </div>
        `).join('')}
        
        <div class="performance-section">
            <h2>Performance Analysis</h2>
            <h3>Slowest Tests</h3>
            <table class="performance-table">
                <thead>
                    <tr>
                        <th>Test Name</th>
                        <th>Suite</th>
                        <th>Duration</th>
                    </tr>
                </thead>
                <tbody>
                    ${results.performance.slowestTests.map(test => `
                        <tr>
                            <td>${test.name}</td>
                            <td>${test.suite}</td>
                            <td>${test.duration}ms</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        ${results.coverage ? `
            <div class="coverage-section">
                <h2>Code Coverage</h2>
                <div class="coverage-summary">
                    <p><strong>Lines:</strong> ${results.coverage.summary.lines.pct}%</p>
                    <div class="coverage-bar">
                        <div class="coverage-fill ${getCoverageClass(results.coverage.summary.lines.pct)}" 
                             style="width: ${results.coverage.summary.lines.pct}%"></div>
                    </div>
                    
                    <p><strong>Functions:</strong> ${results.coverage.summary.functions.pct}%</p>
                    <div class="coverage-bar">
                        <div class="coverage-fill ${getCoverageClass(results.coverage.summary.functions.pct)}" 
                             style="width: ${results.coverage.summary.functions.pct}%"></div>
                    </div>
                    
                    <p><strong>Branches:</strong> ${results.coverage.summary.branches.pct}%</p>
                    <div class="coverage-bar">
                        <div class="coverage-fill ${getCoverageClass(results.coverage.summary.branches.pct)}" 
                             style="width: ${results.coverage.summary.branches.pct}%"></div>
                    </div>
                </div>
            </div>
        ` : ''}
        
        <div class="environment-section">
            <h2>Environment</h2>
            <table class="performance-table">
                <tr><td>Node Version</td><td>${results.environment.nodeVersion}</td></tr>
                <tr><td>Platform</td><td>${results.environment.platform}</td></tr>
                <tr><td>Architecture</td><td>${results.environment.arch}</td></tr>
                <tr><td>Memory Usage</td><td>${(results.environment.memory.heapUsed / 1024 / 1024).toFixed(2)} MB</td></tr>
            </table>
        </div>
    </div>
</body>
</html>
  `;
}

function getCoverageClass(percentage) {
  if (percentage >= 80) return 'coverage-good';
  if (percentage >= 60) return 'coverage-warning';
  return 'coverage-poor';
}