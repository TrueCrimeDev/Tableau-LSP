// src/tests/edge/edgeCaseReporter.js

const fs = require('fs');
const path = require('path');

/**
 * R8.4: Custom Jest reporter for edge case tests
 * 
 * This reporter generates detailed edge case test reports with error analysis,
 * recovery statistics, and recommendations for improving error handling.
 */

class EdgeCaseReporter {
  constructor(globalConfig, options) {
    this.globalConfig = globalConfig;
    this.options = options;
    this.results = [];
    this.startTime = Date.now();
    this.errorPatterns = new Map();
    this.recoveryStats = {
      totalRecoveryAttempts: 0,
      successfulRecoveries: 0,
      partialRecoveries: 0,
      failedRecoveries: 0
    };
  }

  onRunStart(results, options) {
    console.log('🧪 Starting Edge Case Test Analysis');
    console.log('=' .repeat(60));
    this.startTime = Date.now();
  }

  onTestResult(test, testResult, aggregatedResult) {
    const testData = {
      testPath: test.path,
      testName: path.basename(test.path, '.test.ts'),
      duration: testResult.perfStats.end - testResult.perfStats.start,
      status: testResult.numFailingTests === 0 ? 'passed' : 'failed',
      numTests: testResult.numPassingTests + testResult.numFailingTests,
      numPassing: testResult.numPassingTests,
      numFailing: testResult.numFailingTests,
      failureMessages: testResult.failureMessage ? [testResult.failureMessage] : [],
      testResults: testResult.testResults || [],
      timestamp: Date.now()
    };

    this.results.push(testData);
    this.analyzeErrorPatterns(testData);
    this.extractRecoveryStats(testData);

    // Real-time feedback
    const status = testData.status === 'passed' ? '✅' : '❌';
    const duration = (testData.duration / 1000).toFixed(2);
    const testCount = `${testData.numPassing}/${testData.numTests}`;
    
    console.log(`${status} ${testData.testName}: ${testCount} tests passed (${duration}s)`);
  }

  onRunComplete(contexts, results) {
    const totalDuration = Date.now() - this.startTime;
    
    console.log('\\n' + '='.repeat(60));
    console.log('🧪 EDGE CASE TEST ANALYSIS COMPLETE');
    console.log('='.repeat(60));

    // Generate comprehensive report
    const report = this.generateReport(results, totalDuration);
    
    // Print summary
    this.printSummary(report);
    
    // Save detailed report
    this.saveReport(report);
    
    // Generate recommendations
    this.generateRecommendations(report);
  }

  analyzeErrorPatterns(testData) {
    testData.testResults.forEach(test => {
      if (test.status === 'failed' && test.failureMessages) {
        test.failureMessages.forEach(message => {
          // Extract error patterns
          const patterns = this.extractErrorPatterns(message);
          patterns.forEach(pattern => {
            const count = this.errorPatterns.get(pattern) || 0;
            this.errorPatterns.set(pattern, count + 1);
          });
        });
      }
    });
  }

  extractErrorPatterns(errorMessage) {
    const patterns = [];
    
    // Common error patterns in edge case tests
    const errorTypes = [
      { pattern: /timeout/i, type: 'timeout' },
      { pattern: /memory/i, type: 'memory' },
      { pattern: /crash/i, type: 'crash' },
      { pattern: /null.*reference/i, type: 'null_reference' },
      { pattern: /undefined.*property/i, type: 'undefined_property' },
      { pattern: /cannot.*read/i, type: 'read_error' },
      { pattern: /stack.*overflow/i, type: 'stack_overflow' },
      { pattern: /maximum.*call.*stack/i, type: 'call_stack' },
      { pattern: /out.*of.*bounds/i, type: 'bounds_error' },
      { pattern: /invalid.*input/i, type: 'invalid_input' },
      { pattern: /malformed/i, type: 'malformed_input' },
      { pattern: /recovery.*failed/i, type: 'recovery_failure' },
      { pattern: /parsing.*error/i, type: 'parsing_error' }
    ];
    
    errorTypes.forEach(({ pattern, type }) => {
      if (pattern.test(errorMessage)) {
        patterns.push(type);
      }
    });
    
    return patterns.length > 0 ? patterns : ['unknown_error'];
  }

  extractRecoveryStats(testData) {
    testData.testResults.forEach(test => {
      // Look for recovery-related test names
      const testName = test.title || test.fullName || '';
      
      if (testName.toLowerCase().includes('recover')) {
        this.recoveryStats.totalRecoveryAttempts++;
        
        if (test.status === 'passed') {
          this.recoveryStats.successfulRecoveries++;
        } else {
          this.recoveryStats.failedRecoveries++;
        }
      }
      
      // Look for partial recovery indicators in test output
      if (test.status === 'passed' && testName.toLowerCase().includes('partial')) {
        this.recoveryStats.partialRecoveries++;
      }
    });
  }

  generateReport(results, totalDuration) {
    const totalTests = this.results.reduce((sum, r) => sum + r.numTests, 0);
    const totalPassing = this.results.reduce((sum, r) => sum + r.numPassing, 0);
    const totalFailing = this.results.reduce((sum, r) => sum + r.numFailing, 0);
    
    const errorAnalysis = this.analyzeErrorPatterns();
    const performanceAnalysis = this.analyzePerformance();
    const recoveryAnalysis = this.analyzeRecoveryEffectiveness();

    return {
      timestamp: new Date().toISOString(),
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        cpuCount: require('os').cpus().length,
        totalMemory: Math.round(require('os').totalmem() / 1024 / 1024) // MB
      },
      summary: {
        totalTestSuites: this.results.length,
        totalTests,
        totalPassing,
        totalFailing,
        totalDuration,
        successRate: (totalPassing / totalTests) * 100,
        averageDuration: totalDuration / this.results.length
      },
      errorAnalysis,
      performanceAnalysis,
      recoveryAnalysis,
      testSuites: this.results,
      recommendations: []
    };
  }

  analyzeErrorPatterns() {
    const sortedPatterns = Array.from(this.errorPatterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10); // Top 10 error patterns

    const totalErrors = Array.from(this.errorPatterns.values())
      .reduce((sum, count) => sum + count, 0);

    return {
      totalUniquePatterns: this.errorPatterns.size,
      totalErrors,
      topPatterns: sortedPatterns.map(([pattern, count]) => ({
        pattern,
        count,
        percentage: (count / totalErrors) * 100
      })),
      patternDistribution: Object.fromEntries(this.errorPatterns)
    };
  }

  analyzePerformance() {
    const durations = this.results.map(r => r.duration);
    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const maxDuration = Math.max(...durations);
    const minDuration = Math.min(...durations);
    
    // Performance thresholds for edge case tests
    const slowTests = this.results.filter(r => r.duration > 5000); // 5 seconds
    const verySlowTests = this.results.filter(r => r.duration > 10000); // 10 seconds

    return {
      averageDuration: avgDuration,
      maxDuration,
      minDuration,
      slowTestCount: slowTests.length,
      verySlowTestCount: verySlowTests.length,
      slowTests: slowTests.map(t => ({
        name: t.testName,
        duration: t.duration,
        path: t.testPath
      })),
      performanceGrade: this.calculatePerformanceGrade(avgDuration, slowTests.length)
    };
  }

  calculatePerformanceGrade(avgDuration, slowTestCount) {
    if (avgDuration < 1000 && slowTestCount === 0) return 'A';
    if (avgDuration < 2000 && slowTestCount <= 1) return 'B';
    if (avgDuration < 5000 && slowTestCount <= 3) return 'C';
    if (avgDuration < 10000 && slowTestCount <= 5) return 'D';
    return 'F';
  }

  analyzeRecoveryEffectiveness() {
    const { totalRecoveryAttempts, successfulRecoveries, partialRecoveries, failedRecoveries } = this.recoveryStats;
    
    const successRate = totalRecoveryAttempts > 0 
      ? (successfulRecoveries / totalRecoveryAttempts) * 100 
      : 0;
    
    const partialSuccessRate = totalRecoveryAttempts > 0 
      ? (partialRecoveries / totalRecoveryAttempts) * 100 
      : 0;

    return {
      totalRecoveryAttempts,
      successfulRecoveries,
      partialRecoveries,
      failedRecoveries,
      successRate,
      partialSuccessRate,
      overallEffectiveness: this.calculateRecoveryGrade(successRate, partialSuccessRate)
    };
  }

  calculateRecoveryGrade(successRate, partialSuccessRate) {
    const combinedRate = successRate + (partialSuccessRate * 0.5);
    
    if (combinedRate >= 90) return 'Excellent';
    if (combinedRate >= 75) return 'Good';
    if (combinedRate >= 60) return 'Fair';
    if (combinedRate >= 40) return 'Poor';
    return 'Critical';
  }

  printSummary(report) {
    console.log(`Overall Result: ${report.summary.totalFailing === 0 ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Total Duration: ${(report.summary.totalDuration / 1000).toFixed(2)}s`);
    console.log(`Success Rate: ${report.summary.successRate.toFixed(1)}%`);
    console.log(`Performance Grade: ${report.performanceAnalysis.performanceGrade}`);
    console.log(`Recovery Effectiveness: ${report.recoveryAnalysis.overallEffectiveness}`);

    console.log(`\\nTest Results:`);
    console.log(`  Total Test Suites: ${report.summary.totalTestSuites}`);
    console.log(`  Total Tests: ${report.summary.totalTests}`);
    console.log(`  Passed: ${report.summary.totalPassing} ✅`);
    console.log(`  Failed: ${report.summary.totalFailing} ❌`);

    if (report.errorAnalysis.topPatterns.length > 0) {
      console.log(`\\nTop Error Patterns:`);
      report.errorAnalysis.topPatterns.slice(0, 5).forEach(pattern => {
        console.log(`  • ${pattern.pattern}: ${pattern.count} occurrences (${pattern.percentage.toFixed(1)}%)`);
      });
    }

    if (report.performanceAnalysis.slowTests.length > 0) {
      console.log(`\\nSlow Tests (>5s):`);
      report.performanceAnalysis.slowTests.slice(0, 3).forEach(test => {
        console.log(`  • ${test.name}: ${(test.duration / 1000).toFixed(2)}s`);
      });
    }

    if (report.recoveryAnalysis.totalRecoveryAttempts > 0) {
      console.log(`\\nError Recovery:`);
      console.log(`  Success Rate: ${report.recoveryAnalysis.successRate.toFixed(1)}%`);
      console.log(`  Partial Success Rate: ${report.recoveryAnalysis.partialSuccessRate.toFixed(1)}%`);
    }
  }

  saveReport(report) {
    if (!this.options.outputFile) {
      return;
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(this.options.outputFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Save JSON report
      fs.writeFileSync(this.options.outputFile, JSON.stringify(report, null, 2));
      
      // Save HTML report
      const htmlReport = this.generateHtmlReport(report);
      const htmlPath = this.options.outputFile.replace('.json', '.html');
      fs.writeFileSync(htmlPath, htmlReport);

      console.log(`\\n📊 Edge case test reports saved:`);
      console.log(`  JSON: ${this.options.outputFile}`);
      console.log(`  HTML: ${htmlPath}`);
      
    } catch (error) {
      console.error('Failed to save edge case test report:', error.message);
    }
  }

  generateHtmlReport(report) {
    const errorPatternsTable = report.errorAnalysis.topPatterns
      .map(pattern => `
        <tr>
          <td>${pattern.pattern}</td>
          <td>${pattern.count}</td>
          <td>${pattern.percentage.toFixed(1)}%</td>
        </tr>
      `).join('');

    const slowTestsTable = report.performanceAnalysis.slowTests
      .map(test => `
        <tr>
          <td>${test.name}</td>
          <td>${(test.duration / 1000).toFixed(2)}s</td>
          <td>${path.basename(test.path)}</td>
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
        .metric { background: #e9e9e9; padding: 15px; border-radius: 5px; text-align: center; flex: 1; }
        .grade-A, .grade-B { color: #4caf50; font-weight: bold; }
        .grade-C { color: #ff9800; font-weight: bold; }
        .grade-D, .grade-F { color: #f44336; font-weight: bold; }
        .excellent, .good { color: #4caf50; font-weight: bold; }
        .fair { color: #ff9800; font-weight: bold; }
        .poor, .critical { color: #f44336; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; }
        .chart { margin: 20px 0; }
        h1, h2, h3 { color: #333; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Edge Case Test Report</h1>
        <p><strong>Generated:</strong> ${report.timestamp}</p>
        <p><strong>Environment:</strong> ${report.environment.platform} ${report.environment.arch}, Node ${report.environment.nodeVersion}</p>
        <p><strong>Duration:</strong> ${(report.summary.totalDuration / 1000).toFixed(2)}s</p>
    </div>

    <div class="summary">
        <div class="metric">
            <h3>Total Tests</h3>
            <div style="font-size: 2em;">${report.summary.totalTests}</div>
        </div>
        <div class="metric">
            <h3>Success Rate</h3>
            <div style="font-size: 2em;">${report.summary.successRate.toFixed(1)}%</div>
        </div>
        <div class="metric">
            <h3>Performance</h3>
            <div style="font-size: 2em;" class="grade-${report.performanceAnalysis.performanceGrade}">${report.performanceAnalysis.performanceGrade}</div>
        </div>
        <div class="metric">
            <h3>Recovery</h3>
            <div style="font-size: 1.5em;" class="${report.recoveryAnalysis.overallEffectiveness.toLowerCase()}">${report.recoveryAnalysis.overallEffectiveness}</div>
        </div>
    </div>

    <h2>Test Suite Results</h2>
    <table>
        <tr>
            <th>Test Suite</th>
            <th>Total Tests</th>
            <th>Passed</th>
            <th>Failed</th>
            <th>Duration</th>
            <th>Success Rate</th>
        </tr>
        ${report.testSuites.map(suite => `
            <tr>
                <td>${suite.testName}</td>
                <td>${suite.numTests}</td>
                <td style="color: #4caf50;">${suite.numPassing}</td>
                <td style="color: #f44336;">${suite.numFailing}</td>
                <td>${(suite.duration / 1000).toFixed(2)}s</td>
                <td>${((suite.numPassing / suite.numTests) * 100).toFixed(1)}%</td>
            </tr>
        `).join('')}
    </table>

    ${report.errorAnalysis.topPatterns.length > 0 ? `
    <h2>Error Pattern Analysis</h2>
    <p>Total unique error patterns: ${report.errorAnalysis.totalUniquePatterns}</p>
    <table>
        <tr>
            <th>Error Pattern</th>
            <th>Occurrences</th>
            <th>Percentage</th>
        </tr>
        ${errorPatternsTable}
    </table>
    ` : ''}

    <h2>Performance Analysis</h2>
    <p><strong>Average Duration:</strong> ${(report.performanceAnalysis.averageDuration / 1000).toFixed(2)}s</p>
    <p><strong>Performance Grade:</strong> <span class="grade-${report.performanceAnalysis.performanceGrade}">${report.performanceAnalysis.performanceGrade}</span></p>
    <p><strong>Slow Tests:</strong> ${report.performanceAnalysis.slowTestCount} (>${5}s)</p>

    ${report.performanceAnalysis.slowTests.length > 0 ? `
    <h3>Slow Tests</h3>
    <table>
        <tr>
            <th>Test Name</th>
            <th>Duration</th>
            <th>File</th>
        </tr>
        ${slowTestsTable}
    </table>
    ` : ''}

    ${report.recoveryAnalysis.totalRecoveryAttempts > 0 ? `
    <h2>Error Recovery Analysis</h2>
    <p><strong>Overall Effectiveness:</strong> <span class="${report.recoveryAnalysis.overallEffectiveness.toLowerCase()}">${report.recoveryAnalysis.overallEffectiveness}</span></p>
    <p><strong>Success Rate:</strong> ${report.recoveryAnalysis.successRate.toFixed(1)}%</p>
    <p><strong>Partial Success Rate:</strong> ${report.recoveryAnalysis.partialSuccessRate.toFixed(1)}%</p>
    <p><strong>Total Recovery Attempts:</strong> ${report.recoveryAnalysis.totalRecoveryAttempts}</p>
    ` : ''}
</body>
</html>
    `;
  }

  generateRecommendations(report) {
    const recommendations = [];

    // Performance recommendations
    if (report.performanceAnalysis.performanceGrade === 'D' || report.performanceAnalysis.performanceGrade === 'F') {
      recommendations.push('PERFORMANCE: Consider optimizing slow edge case tests or increasing timeout thresholds');
    }

    // Error pattern recommendations
    if (report.errorAnalysis.topPatterns.length > 0) {
      const topPattern = report.errorAnalysis.topPatterns[0];
      if (topPattern.percentage > 30) {
        recommendations.push(`ERROR HANDLING: ${topPattern.pattern} accounts for ${topPattern.percentage.toFixed(1)}% of errors - focus optimization here`);
      }
    }

    // Recovery recommendations
    if (report.recoveryAnalysis.successRate < 70) {
      recommendations.push(`RECOVERY: Error recovery success rate is ${report.recoveryAnalysis.successRate.toFixed(1)}% - improve error recovery mechanisms`);
    }

    if (recommendations.length > 0) {
      console.log('\\n💡 RECOMMENDATIONS:');
      recommendations.forEach(rec => console.log(`  • ${rec}`));
    }
  }
}

module.exports = EdgeCaseReporter;