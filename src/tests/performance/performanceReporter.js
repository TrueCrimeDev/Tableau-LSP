// src/tests/performance/performanceReporter.js

const fs = require('fs');
const path = require('path');

/**
 * R8.3: Custom Jest reporter for performance tests
 * 
 * This reporter generates detailed performance reports with metrics,
 * benchmarks, and recommendations for optimization.
 */

class PerformanceReporter {
  constructor(globalConfig, options) {
    this.globalConfig = globalConfig;
    this.options = options;
    this.results = [];
    this.startTime = Date.now();
  }

  onRunStart(results, options) {
    console.log('🚀 Starting Performance Test Suite');
    console.log('=' .repeat(60));
    this.startTime = Date.now();
  }

  onTestResult(test, testResult, aggregatedResult) {
    // Collect performance metrics from test results
    const performanceData = {
      testPath: test.path,
      testName: testResult.testResults.map(t => t.title).join(' > '),
      duration: testResult.perfStats.end - testResult.perfStats.start,
      status: testResult.numFailingTests === 0 ? 'passed' : 'failed',
      failureMessages: testResult.failureMessage ? [testResult.failureMessage] : [],
      metrics: this.extractPerformanceMetrics(testResult),
      timestamp: Date.now()
    };

    this.results.push(performanceData);

    // Real-time feedback
    const status = performanceData.status === 'passed' ? '✅' : '❌';
    const duration = (performanceData.duration / 1000).toFixed(2);
    console.log(`${status} ${path.basename(test.path)}: ${duration}s`);
  }

  onRunComplete(contexts, results) {
    const totalDuration = Date.now() - this.startTime;
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 PERFORMANCE TEST RESULTS');
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

  extractPerformanceMetrics(testResult) {
    const metrics = {
      averageDuration: 0,
      throughput: 0,
      memoryDelta: 0,
      cacheHitRate: 0,
      errorRate: 0
    };

    // Extract metrics from console output or test context
    if (testResult.console) {
      testResult.console.forEach(log => {
        if (log.message.includes('Performance:')) {
          try {
            const data = JSON.parse(log.message.split('Performance:')[1]);
            Object.assign(metrics, data);
          } catch (e) {
            // Ignore parsing errors
          }
        }
      });
    }

    return metrics;
  }

  generateReport(results, totalDuration) {
    const passedTests = this.results.filter(r => r.status === 'passed').length;
    const failedTests = this.results.filter(r => r.status === 'failed').length;
    
    const performanceMetrics = this.calculateAggregateMetrics();
    const benchmarkResults = this.categorizeBenchmarks();
    const recommendations = this.analyzePerformance();

    return {
      summary: {
        totalTests: this.results.length,
        passedTests,
        failedTests,
        totalDuration,
        successRate: (passedTests / this.results.length) * 100,
        timestamp: new Date().toISOString()
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        cpuCount: require('os').cpus().length,
        totalMemory: Math.round(require('os').totalmem() / 1024 / 1024) // MB
      },
      metrics: performanceMetrics,
      benchmarks: benchmarkResults,
      recommendations,
      detailedResults: this.results
    };
  }

  calculateAggregateMetrics() {
    if (this.results.length === 0) {
      return {
        averageDuration: 0,
        totalThroughput: 0,
        averageMemoryUsage: 0,
        peakMemoryUsage: 0
      };
    }

    const durations = this.results.map(r => r.duration);
    const throughputs = this.results.map(r => r.metrics.throughput || 0);
    const memoryDeltas = this.results.map(r => r.metrics.memoryDelta || 0);

    return {
      averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      totalThroughput: throughputs.reduce((sum, t) => sum + t, 0),
      averageMemoryUsage: memoryDeltas.reduce((sum, m) => sum + m, 0) / memoryDeltas.length,
      peakMemoryUsage: Math.max(...memoryDeltas),
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations)
    };
  }

  categorizeBenchmarks() {
    const categories = {
      parsing: [],
      lspFeatures: [],
      memory: [],
      concurrent: [],
      large: [],
      cache: [],
      error: []
    };

    this.results.forEach(result => {
      const testName = result.testName.toLowerCase();
      
      if (testName.includes('parsing')) {
        categories.parsing.push(result);
      } else if (testName.includes('hover') || testName.includes('completion') || testName.includes('signature')) {
        categories.lspFeatures.push(result);
      } else if (testName.includes('memory')) {
        categories.memory.push(result);
      } else if (testName.includes('concurrent')) {
        categories.concurrent.push(result);
      } else if (testName.includes('large')) {
        categories.large.push(result);
      } else if (testName.includes('cache')) {
        categories.cache.push(result);
      } else if (testName.includes('error')) {
        categories.error.push(result);
      }
    });

    return categories;
  }

  analyzePerformance() {
    const recommendations = [];
    const metrics = this.calculateAggregateMetrics();

    // Duration analysis
    if (metrics.averageDuration > 1000) {
      recommendations.push({
        type: 'performance',
        severity: 'high',
        message: 'Average test duration is high (>1s). Consider optimizing parsing algorithms.',
        metric: 'duration',
        value: metrics.averageDuration
      });
    }

    // Memory analysis
    if (metrics.peakMemoryUsage > 100) {
      recommendations.push({
        type: 'memory',
        severity: 'medium',
        message: 'Peak memory usage is high (>100MB). Review memory management strategies.',
        metric: 'memory',
        value: metrics.peakMemoryUsage
      });
    }

    // Throughput analysis
    if (metrics.totalThroughput < 50) {
      recommendations.push({
        type: 'throughput',
        severity: 'medium',
        message: 'Overall throughput is low (<50 ops/sec). Consider caching improvements.',
        metric: 'throughput',
        value: metrics.totalThroughput
      });
    }

    // Failure analysis
    const failureRate = (this.results.filter(r => r.status === 'failed').length / this.results.length) * 100;
    if (failureRate > 10) {
      recommendations.push({
        type: 'reliability',
        severity: 'high',
        message: `High failure rate (${failureRate.toFixed(1)}%). Review test stability and error handling.`,
        metric: 'failures',
        value: failureRate
      });
    }

    return recommendations;
  }

  printSummary(report) {
    console.log(`Overall Result: ${report.summary.failedTests === 0 ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Total Duration: ${(report.summary.totalDuration / 1000).toFixed(2)}s`);
    console.log(`Success Rate: ${report.summary.successRate.toFixed(1)}%`);
    console.log(`Environment: ${report.environment.platform} ${report.environment.arch}, Node ${report.environment.nodeVersion}`);

    console.log(`\nPerformance Metrics:`);
    console.log(`  Average Duration: ${report.metrics.averageDuration.toFixed(2)}ms`);
    console.log(`  Total Throughput: ${report.metrics.totalThroughput.toFixed(1)} ops/sec`);
    console.log(`  Average Memory Usage: ${report.metrics.averageMemoryUsage.toFixed(1)}MB`);
    console.log(`  Peak Memory Usage: ${report.metrics.peakMemoryUsage.toFixed(1)}MB`);

    console.log(`\nTest Results:`);
    console.log(`  Total Tests: ${report.summary.totalTests}`);
    console.log(`  Passed: ${report.summary.passedTests} ✅`);
    console.log(`  Failed: ${report.summary.failedTests} ❌`);

    if (report.recommendations.length > 0) {
      console.log(`\n⚠️  Performance Recommendations:`);
      report.recommendations.forEach(rec => {
        const severity = rec.severity === 'high' ? '🔴' : rec.severity === 'medium' ? '🟡' : '🟢';
        console.log(`  ${severity} ${rec.message}`);
      });
    }

    if (report.summary.failedTests === 0) {
      console.log(`\n🎉 All performance tests passed!`);
    } else {
      console.log(`\n⚠️  Some performance tests failed. Review detailed results for optimization opportunities.`);
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

      console.log(`\n📊 Performance reports saved:`);
      console.log(`  JSON: ${this.options.outputFile}`);
      console.log(`  HTML: ${htmlPath}`);
      
    } catch (error) {
      console.error('Failed to save performance report:', error.message);
    }
  }

  generateHtmlReport(report) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Performance Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .metric { display: inline-block; margin: 10px; padding: 10px; background: #e9e9e9; border-radius: 3px; }
        .passed { color: green; }
        .failed { color: red; }
        .recommendation { margin: 10px 0; padding: 10px; border-left: 4px solid #ff9800; background: #fff3e0; }
        .high { border-left-color: #f44336; }
        .medium { border-left-color: #ff9800; }
        .low { border-left-color: #4caf50; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Performance Test Report</h1>
        <p>Generated: ${report.summary.timestamp}</p>
        <p>Environment: ${report.environment.platform} ${report.environment.arch}, Node ${report.environment.nodeVersion}</p>
    </div>

    <h2>Summary</h2>
    <div class="metric">Total Tests: ${report.summary.totalTests}</div>
    <div class="metric passed">Passed: ${report.summary.passedTests}</div>
    <div class="metric failed">Failed: ${report.summary.failedTests}</div>
    <div class="metric">Success Rate: ${report.summary.successRate.toFixed(1)}%</div>
    <div class="metric">Duration: ${(report.summary.totalDuration / 1000).toFixed(2)}s</div>

    <h2>Performance Metrics</h2>
    <div class="metric">Avg Duration: ${report.metrics.averageDuration.toFixed(2)}ms</div>
    <div class="metric">Throughput: ${report.metrics.totalThroughput.toFixed(1)} ops/sec</div>
    <div class="metric">Avg Memory: ${report.metrics.averageMemoryUsage.toFixed(1)}MB</div>
    <div class="metric">Peak Memory: ${report.metrics.peakMemoryUsage.toFixed(1)}MB</div>

    ${report.recommendations.length > 0 ? `
    <h2>Recommendations</h2>
    ${report.recommendations.map(rec => `
        <div class="recommendation ${rec.severity}">
            <strong>${rec.type.toUpperCase()}:</strong> ${rec.message}
            <br><small>Value: ${rec.value} ${rec.metric}</small>
        </div>
    `).join('')}
    ` : ''}

    <h2>Detailed Results</h2>
    <table>
        <tr>
            <th>Test</th>
            <th>Status</th>
            <th>Duration (ms)</th>
            <th>Throughput (ops/sec)</th>
            <th>Memory (MB)</th>
        </tr>
        ${report.detailedResults.map(result => `
            <tr>
                <td>${path.basename(result.testPath)}</td>
                <td class="${result.status}">${result.status.toUpperCase()}</td>
                <td>${result.duration.toFixed(2)}</td>
                <td>${(result.metrics.throughput || 0).toFixed(1)}</td>
                <td>${(result.metrics.memoryDelta || 0).toFixed(1)}</td>
            </tr>
        `).join('')}
    </table>
</body>
</html>
    `;
  }

  generateRecommendations(report) {
    if (report.recommendations.length === 0) {
      return;
    }

    console.log('\n🔧 OPTIMIZATION RECOMMENDATIONS');
    console.log('='.repeat(60));

    const highPriority = report.recommendations.filter(r => r.severity === 'high');
    const mediumPriority = report.recommendations.filter(r => r.severity === 'medium');
    const lowPriority = report.recommendations.filter(r => r.severity === 'low');

    if (highPriority.length > 0) {
      console.log('\n🔴 HIGH PRIORITY:');
      highPriority.forEach(rec => {
        console.log(`  • ${rec.message}`);
      });
    }

    if (mediumPriority.length > 0) {
      console.log('\n🟡 MEDIUM PRIORITY:');
      mediumPriority.forEach(rec => {
        console.log(`  • ${rec.message}`);
      });
    }

    if (lowPriority.length > 0) {
      console.log('\n🟢 LOW PRIORITY:');
      lowPriority.forEach(rec => {
        console.log(`  • ${rec.message}`);
      });
    }
  }
}

module.exports = PerformanceReporter;