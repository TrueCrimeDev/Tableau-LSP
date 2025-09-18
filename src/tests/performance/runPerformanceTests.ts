// src/tests/performance/runPerformanceTests.ts

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * R8.3: Performance Test Runner
 * 
 * Unified runner for all performance tests with comprehensive reporting,
 * benchmark comparison, and CI/CD integration.
 */

interface PerformanceTestConfig {
  testSuites: string[];
  outputDir: string;
  generateReports: boolean;
  compareBaseline: boolean;
  baselinePath?: string;
  thresholds: {
    maxFailureRate: number;
    maxAverageDuration: number;
    minThroughput: number;
  };
}

interface TestResult {
  suite: string;
  passed: boolean;
  duration: number;
  metrics: {
    averageDuration: number;
    throughput: number;
    memoryDelta: number;
  };
  errors: string[];
}

interface PerformanceReport {
  timestamp: string;
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
    cpuCount: number;
    totalMemory: number;
  };
  configuration: PerformanceTestConfig;
  results: TestResult[];
  summary: {
    totalSuites: number;
    passedSuites: number;
    failedSuites: number;
    totalDuration: number;
    overallThroughput: number;
    averageMemoryUsage: number;
  };
  recommendations: string[];
  comparison?: {
    baselineFile: string;
    improvements: string[];
    regressions: string[];
    overallChange: number;
  };
}

class PerformanceTestRunner {
  private config: PerformanceTestConfig;
  private startTime: number = 0;
  private results: TestResult[] = [];

  constructor(config: PerformanceTestConfig) {
    this.config = config;
  }

  /**
   * Run all performance test suites
   */
  async runAllTests(): Promise<PerformanceReport> {
    console.log('🚀 Starting Tableau LSP Performance Test Suite');
    console.log('=' .repeat(60));
    
    this.startTime = Date.now();
    this.results = [];

    // Ensure output directory exists
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }

    // Run each test suite
    for (const suite of this.config.testSuites) {
      console.log(`\\n📊 Running ${suite}...`);
      
      try {
        const result = await this.runTestSuite(suite);
        this.results.push(result);
        
        const status = result.passed ? '✅' : '❌';
        const duration = (result.duration / 1000).toFixed(2);
        const throughput = result.metrics.throughput.toFixed(1);
        
        console.log(`${status} ${suite}: ${duration}s, ${throughput} ops/sec`);
        
      } catch (error) {
        console.error(`❌ ${suite} failed:`, error);
        
        this.results.push({
          suite,
          passed: false,
          duration: 0,
          metrics: { averageDuration: 0, throughput: 0, memoryDelta: 0 },
          errors: [error instanceof Error ? error.message : String(error)]
        });
      }
    }

    // Generate comprehensive report
    const report = await this.generateReport();
    
    // Save reports if configured
    if (this.config.generateReports) {
      await this.saveReports(report);
    }
    
    // Compare with baseline if configured
    if (this.config.compareBaseline && this.config.baselinePath) {
      report.comparison = await this.compareWithBaseline(report);
    }
    
    // Print summary
    this.printSummary(report);
    
    return report;
  }

  /**
   * Run a single test suite
   */
  private async runTestSuite(suiteName: string): Promise<TestResult> {
    const testFile = path.join(__dirname, `${suiteName}.test.ts`);
    
    if (!fs.existsSync(testFile)) {
      throw new Error(`Test file not found: ${testFile}`);
    }

    const startTime = Date.now();
    
    try {
      // Run Jest with performance configuration
      const jestConfig = path.join(__dirname, 'jest.performance.config.js');
      const command = `npx jest --config="${jestConfig}" --testPathPattern="${testFile}" --verbose --no-cache`;
      
      const output = execSync(command, {
        cwd: path.join(__dirname, '../../..'),
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      const duration = Date.now() - startTime;
      const metrics = this.extractMetricsFromOutput(output);
      
      return {
        suite: suiteName,
        passed: true,
        duration,
        metrics,
        errors: []
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorOutput = error instanceof Error && 'stdout' in error ? error.stdout : '';
      const metrics = this.extractMetricsFromOutput(String(errorOutput));
      
      return {
        suite: suiteName,
        passed: false,
        duration,
        metrics,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * Extract performance metrics from Jest output
   */
  private extractMetricsFromOutput(output: string): TestResult['metrics'] {
    const metrics = {
      averageDuration: 0,
      throughput: 0,
      memoryDelta: 0
    };

    // Parse performance logs from test output
    const performanceLines = output.split('\\n').filter(line => 
      line.includes('Performance:')
    );

    if (performanceLines.length > 0) {
      const durations: number[] = [];
      const throughputs: number[] = [];
      const memoryDeltas: number[] = [];

      performanceLines.forEach(line => {
        try {
          const jsonStr = line.split('Performance:')[1];
          const data = JSON.parse(jsonStr);
          
          if (data.averageDuration) durations.push(data.averageDuration);
          if (data.throughput) throughputs.push(data.throughput);
          if (data.memoryDelta) memoryDeltas.push(data.memoryDelta);
        } catch (e) {
          // Ignore parsing errors
        }
      });

      if (durations.length > 0) {
        metrics.averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
      }
      if (throughputs.length > 0) {
        metrics.throughput = throughputs.reduce((sum, t) => sum + t, 0) / throughputs.length;
      }
      if (memoryDeltas.length > 0) {
        metrics.memoryDelta = memoryDeltas.reduce((sum, m) => sum + m, 0) / memoryDeltas.length;
      }
    }

    return metrics;
  }

  /**
   * Generate comprehensive performance report
   */
  private async generateReport(): Promise<PerformanceReport> {
    const totalDuration = Date.now() - this.startTime;
    const passedSuites = this.results.filter(r => r.passed).length;
    const failedSuites = this.results.filter(r => !r.passed).length;
    
    const overallThroughput = this.results.length > 0 
      ? this.results.reduce((sum, r) => sum + r.metrics.throughput, 0) / this.results.length
      : 0;
    
    const averageMemoryUsage = this.results.length > 0
      ? this.results.reduce((sum, r) => sum + r.metrics.memoryDelta, 0) / this.results.length
      : 0;

    const recommendations = this.generateRecommendations();

    return {
      timestamp: new Date().toISOString(),
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        cpuCount: require('os').cpus().length,
        totalMemory: Math.round(require('os').totalmem() / 1024 / 1024) // MB
      },
      configuration: this.config,
      results: this.results,
      summary: {
        totalSuites: this.results.length,
        passedSuites,
        failedSuites,
        totalDuration,
        overallThroughput,
        averageMemoryUsage
      },
      recommendations
    };
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    
    // Analyze failure rate
    const failureRate = (this.results.filter(r => !r.passed).length / this.results.length) * 100;
    if (failureRate > this.config.thresholds.maxFailureRate) {
      recommendations.push(
        `High failure rate (${failureRate.toFixed(1)}%). Review test stability and error handling.`
      );
    }

    // Analyze average duration
    const avgDuration = this.results.length > 0
      ? this.results.reduce((sum, r) => sum + r.metrics.averageDuration, 0) / this.results.length
      : 0;
    
    if (avgDuration > this.config.thresholds.maxAverageDuration) {
      recommendations.push(
        `Average operation duration is high (${avgDuration.toFixed(2)}ms). Consider optimizing parsing algorithms.`
      );
    }

    // Analyze throughput
    const avgThroughput = this.results.length > 0
      ? this.results.reduce((sum, r) => sum + r.metrics.throughput, 0) / this.results.length
      : 0;
    
    if (avgThroughput < this.config.thresholds.minThroughput) {
      recommendations.push(
        `Overall throughput is low (${avgThroughput.toFixed(1)} ops/sec). Consider caching improvements.`
      );
    }

    // Analyze memory usage
    const avgMemory = this.results.length > 0
      ? this.results.reduce((sum, r) => sum + r.metrics.memoryDelta, 0) / this.results.length
      : 0;
    
    if (avgMemory > 10) {
      recommendations.push(
        `Average memory usage is high (${avgMemory.toFixed(1)}MB). Review memory management strategies.`
      );
    }

    // Suite-specific recommendations
    this.results.forEach(result => {
      if (!result.passed) {
        recommendations.push(`${result.suite}: Failed - ${result.errors.join(', ')}`);
      } else if (result.metrics.averageDuration > this.config.thresholds.maxAverageDuration * 2) {
        recommendations.push(`${result.suite}: Very slow performance - consider optimization`);
      }
    });

    return recommendations;
  }

  /**
   * Compare with baseline performance
   */
  private async compareWithBaseline(report: PerformanceReport): Promise<PerformanceReport['comparison']> {
    if (!this.config.baselinePath || !fs.existsSync(this.config.baselinePath)) {
      return undefined;
    }

    try {
      const baselineData = JSON.parse(fs.readFileSync(this.config.baselinePath, 'utf8'));
      const improvements: string[] = [];
      const regressions: string[] = [];
      
      let totalChange = 0;
      let comparisons = 0;

      // Compare suite by suite
      report.results.forEach(currentResult => {
        const baselineResult = baselineData.results?.find((r: any) => r.suite === currentResult.suite);
        
        if (baselineResult) {
          const throughputChange = ((currentResult.metrics.throughput - baselineResult.metrics.throughput) / baselineResult.metrics.throughput) * 100;
          const durationChange = ((currentResult.metrics.averageDuration - baselineResult.metrics.averageDuration) / baselineResult.metrics.averageDuration) * 100;
          
          totalChange += throughputChange - durationChange; // Higher throughput and lower duration are good
          comparisons++;
          
          if (throughputChange > 10) {
            improvements.push(`${currentResult.suite}: Throughput improved by ${throughputChange.toFixed(1)}%`);
          } else if (throughputChange < -10) {
            regressions.push(`${currentResult.suite}: Throughput decreased by ${Math.abs(throughputChange).toFixed(1)}%`);
          }
          
          if (durationChange < -10) {
            improvements.push(`${currentResult.suite}: Duration improved by ${Math.abs(durationChange).toFixed(1)}%`);
          } else if (durationChange > 10) {
            regressions.push(`${currentResult.suite}: Duration increased by ${durationChange.toFixed(1)}%`);
          }
        }
      });

      const overallChange = comparisons > 0 ? totalChange / comparisons : 0;

      return {
        baselineFile: this.config.baselinePath,
        improvements,
        regressions,
        overallChange
      };
      
    } catch (error) {
      console.warn('Failed to compare with baseline:', error);
      return undefined;
    }
  }

  /**
   * Save performance reports
   */
  private async saveReports(report: PerformanceReport): Promise<void> {
    try {
      // Save JSON report
      const jsonPath = path.join(this.config.outputDir, 'performance-report.json');
      fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
      
      // Save HTML report
      const htmlPath = path.join(this.config.outputDir, 'performance-report.html');
      const htmlContent = this.generateHtmlReport(report);
      fs.writeFileSync(htmlPath, htmlContent);
      
      // Save CSV summary for spreadsheet analysis
      const csvPath = path.join(this.config.outputDir, 'performance-summary.csv');
      const csvContent = this.generateCsvReport(report);
      fs.writeFileSync(csvPath, csvContent);
      
      console.log(`\\n📊 Performance reports saved:`);
      console.log(`  JSON: ${jsonPath}`);
      console.log(`  HTML: ${htmlPath}`);
      console.log(`  CSV:  ${csvPath}`);
      
    } catch (error) {
      console.error('Failed to save performance reports:', error);
    }
  }

  /**
   * Generate HTML report
   */
  private generateHtmlReport(report: PerformanceReport): string {
    const comparisonSection = report.comparison ? `
      <h2>Baseline Comparison</h2>
      <div class="comparison">
        <p><strong>Baseline:</strong> ${path.basename(report.comparison.baselineFile)}</p>
        <p><strong>Overall Change:</strong> ${report.comparison.overallChange.toFixed(1)}%</p>
        
        ${report.comparison.improvements.length > 0 ? `
          <h3>Improvements ✅</h3>
          <ul>
            ${report.comparison.improvements.map(imp => `<li>${imp}</li>`).join('')}
          </ul>
        ` : ''}
        
        ${report.comparison.regressions.length > 0 ? `
          <h3>Regressions ❌</h3>
          <ul>
            ${report.comparison.regressions.map(reg => `<li>${reg}</li>`).join('')}
          </ul>
        ` : ''}
      </div>
    ` : '';

    return `
<!DOCTYPE html>
<html>
<head>
    <title>Tableau LSP Performance Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .metric { display: inline-block; margin: 10px; padding: 15px; background: #e9e9e9; border-radius: 5px; }
        .passed { color: #4caf50; font-weight: bold; }
        .failed { color: #f44336; font-weight: bold; }
        .recommendation { margin: 10px 0; padding: 15px; border-left: 4px solid #ff9800; background: #fff3e0; }
        .comparison { background: #f0f8ff; padding: 15px; border-radius: 5px; margin: 10px 0; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; }
        .chart { margin: 20px 0; }
        h1, h2, h3 { color: #333; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Tableau LSP Performance Report</h1>
        <p><strong>Generated:</strong> ${report.timestamp}</p>
        <p><strong>Environment:</strong> ${report.environment.platform} ${report.environment.arch}, Node ${report.environment.nodeVersion}</p>
        <p><strong>CPU Cores:</strong> ${report.environment.cpuCount}, <strong>Memory:</strong> ${(report.environment.totalMemory / 1024).toFixed(1)}GB</p>
    </div>

    <h2>Summary</h2>
    <div class="metric">Total Suites: ${report.summary.totalSuites}</div>
    <div class="metric passed">Passed: ${report.summary.passedSuites}</div>
    <div class="metric failed">Failed: ${report.summary.failedSuites}</div>
    <div class="metric">Duration: ${(report.summary.totalDuration / 1000).toFixed(2)}s</div>
    <div class="metric">Avg Throughput: ${report.summary.overallThroughput.toFixed(1)} ops/sec</div>
    <div class="metric">Avg Memory: ${report.summary.averageMemoryUsage.toFixed(1)}MB</div>

    ${comparisonSection}

    <h2>Test Results</h2>
    <table>
        <tr>
            <th>Test Suite</th>
            <th>Status</th>
            <th>Duration (s)</th>
            <th>Avg Duration (ms)</th>
            <th>Throughput (ops/sec)</th>
            <th>Memory (MB)</th>
            <th>Errors</th>
        </tr>
        ${report.results.map(result => `
            <tr>
                <td>${result.suite}</td>
                <td class="${result.passed ? 'passed' : 'failed'}">${result.passed ? 'PASSED' : 'FAILED'}</td>
                <td>${(result.duration / 1000).toFixed(2)}</td>
                <td>${result.metrics.averageDuration.toFixed(2)}</td>
                <td>${result.metrics.throughput.toFixed(1)}</td>
                <td>${result.metrics.memoryDelta.toFixed(1)}</td>
                <td>${result.errors.join(', ') || 'None'}</td>
            </tr>
        `).join('')}
    </table>

    ${report.recommendations.length > 0 ? `
    <h2>Recommendations</h2>
    ${report.recommendations.map(rec => `
        <div class="recommendation">
            ${rec}
        </div>
    `).join('')}
    ` : ''}

    <h2>Configuration</h2>
    <pre>${JSON.stringify(report.configuration, null, 2)}</pre>
</body>
</html>
    `;
  }

  /**
   * Generate CSV report for analysis
   */
  private generateCsvReport(report: PerformanceReport): string {
    const headers = [
      'Suite',
      'Status',
      'Duration (ms)',
      'Avg Duration (ms)',
      'Throughput (ops/sec)',
      'Memory Delta (MB)',
      'Errors'
    ];

    const rows = report.results.map(result => [
      result.suite,
      result.passed ? 'PASSED' : 'FAILED',
      result.duration.toString(),
      result.metrics.averageDuration.toFixed(2),
      result.metrics.throughput.toFixed(1),
      result.metrics.memoryDelta.toFixed(1),
      result.errors.join('; ')
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\\n');
  }

  /**
   * Print performance summary
   */
  private printSummary(report: PerformanceReport): void {
    console.log('\\n' + '='.repeat(60));
    console.log('📊 PERFORMANCE TEST SUMMARY');
    console.log('='.repeat(60));

    const status = report.summary.failedSuites === 0 ? '✅ PASSED' : '❌ FAILED';
    console.log(`Overall Result: ${status}`);
    console.log(`Total Duration: ${(report.summary.totalDuration / 1000).toFixed(2)}s`);
    console.log(`Success Rate: ${((report.summary.passedSuites / report.summary.totalSuites) * 100).toFixed(1)}%`);

    console.log(`\\nPerformance Metrics:`);
    console.log(`  Average Throughput: ${report.summary.overallThroughput.toFixed(1)} ops/sec`);
    console.log(`  Average Memory Usage: ${report.summary.averageMemoryUsage.toFixed(1)}MB`);

    console.log(`\\nTest Results:`);
    console.log(`  Total Suites: ${report.summary.totalSuites}`);
    console.log(`  Passed: ${report.summary.passedSuites} ✅`);
    console.log(`  Failed: ${report.summary.failedSuites} ❌`);

    if (report.comparison) {
      console.log(`\\nBaseline Comparison:`);
      console.log(`  Overall Change: ${report.comparison.overallChange.toFixed(1)}%`);
      console.log(`  Improvements: ${report.comparison.improvements.length}`);
      console.log(`  Regressions: ${report.comparison.regressions.length}`);
    }

    if (report.recommendations.length > 0) {
      console.log(`\\n⚠️  Recommendations:`);
      report.recommendations.slice(0, 5).forEach(rec => {
        console.log(`  • ${rec}`);
      });
      
      if (report.recommendations.length > 5) {
        console.log(`  ... and ${report.recommendations.length - 5} more (see full report)`);
      }
    }

    if (report.summary.failedSuites === 0) {
      console.log(`\\n🎉 All performance tests passed!`);
    } else {
      console.log(`\\n⚠️  Some performance tests failed. Review detailed results for optimization opportunities.`);
    }
  }
}

/**
 * Default configuration for performance tests
 */
const defaultConfig: PerformanceTestConfig = {
  testSuites: [
    'lspPerformance',
    'stressTests'
  ],
  outputDir: path.join(__dirname, '../../../test-results/performance'),
  generateReports: true,
  compareBaseline: false,
  thresholds: {
    maxFailureRate: 10, // 10%
    maxAverageDuration: 200, // 200ms
    minThroughput: 5 // 5 ops/sec
  }
};

/**
 * CLI interface for running performance tests
 */
export async function runPerformanceTests(config: Partial<PerformanceTestConfig> = {}): Promise<PerformanceReport> {
  const finalConfig = { ...defaultConfig, ...config };
  const runner = new PerformanceTestRunner(finalConfig);
  
  try {
    const report = await runner.runAllTests();
    
    // Exit with error code if tests failed
    if (report.summary.failedSuites > 0) {
      process.exit(1);
    }
    
    return report;
    
  } catch (error) {
    console.error('Performance test runner failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const config: Partial<PerformanceTestConfig> = {};
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    
    switch (key) {
      case '--output-dir':
        config.outputDir = value;
        break;
      case '--baseline':
        config.compareBaseline = true;
        config.baselinePath = value;
        break;
      case '--no-reports':
        config.generateReports = false;
        break;
      case '--suites':
        config.testSuites = value.split(',');
        break;
    }
  }
  
  runPerformanceTests(config).catch(console.error);
}