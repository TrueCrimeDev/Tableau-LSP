# Performance Testing Framework

This directory contains a comprehensive performance testing framework for the Tableau LSP extension. The framework provides benchmarking, stress testing, and performance monitoring capabilities.

## Overview

The performance testing framework consists of several components:

- **Performance Test Suite** (`performanceTestSuite.ts`): Core benchmarking engine with comprehensive metrics
- **LSP Performance Tests** (`lspPerformance.test.ts`): Tests for all LSP features (hover, completion, etc.)
- **Stress Tests** (`stressTests.test.ts`): High-load scenarios and edge cases
- **Test Runner** (`runPerformanceTests.ts`): Unified runner with reporting and CI/CD integration
- **Custom Reporter** (`performanceReporter.js`): Detailed performance reporting with HTML/CSV output
- **Test Setup** (`setup.ts`): Performance-specific Jest configuration and utilities

## Features

### 🚀 Comprehensive Benchmarking
- Document parsing performance across complexity levels
- LSP feature response times (hover, completion, signature help, diagnostics)
- Incremental parsing and caching effectiveness
- Memory usage monitoring and cleanup validation

### 🔥 Stress Testing
- Large document handling (500+ lines)
- Concurrent request processing
- Memory pressure scenarios
- Sustained load testing
- Error recovery performance

### 📊 Advanced Reporting
- Real-time performance feedback
- HTML reports with charts and metrics
- CSV exports for spreadsheet analysis
- Baseline comparison and regression detection
- Performance recommendations and optimization suggestions

### 🎯 Performance Thresholds
- Configurable performance benchmarks
- Automatic pass/fail determination
- CI/CD integration with exit codes
- Custom matchers for Jest assertions

## Quick Start

### Run All Performance Tests
```bash
npm run test:performance
```

### Run Specific Test Suites
```bash
# LSP feature performance only
npm run test:performance:lsp

# Stress tests only
npm run test:performance:stress

# Custom Jest configuration
npm run test:performance:suite
```

### Compare with Baseline
```bash
# Set current results as baseline
cp test-results/performance/performance-report.json test-results/performance/baseline.json

# Compare future runs with baseline
npm run test:performance:baseline
```

## Test Categories

### 1. Document Parsing Performance
Tests parsing performance across different complexity levels:
- **Simple**: Basic expressions like `SUM([Sales])`
- **Medium**: IF/THEN statements with moderate complexity
- **Complex**: Nested LOD expressions, CASE statements, table calculations
- **Large**: Generated documents with 200+ lines

**Thresholds:**
- Max Duration: 100ms
- Max Memory Delta: 5MB
- Min Throughput: 10 ops/sec

### 2. LSP Feature Performance
Tests response times for core language server features:
- **Hover Provider**: Function and field information
- **Completion Provider**: Auto-completion suggestions
- **Signature Help**: Parameter hints for functions
- **Diagnostics**: Syntax validation and error reporting
- **Formatting**: Code formatting and indentation

**Thresholds:**
- Hover: 50ms max, 20 ops/sec min
- Completion: 100ms max, 10 ops/sec min
- Signature Help: 30ms max, 30 ops/sec min
- Diagnostics: 200ms max, 5 ops/sec min

### 3. Memory Management
Tests memory usage patterns and cleanup effectiveness:
- Multiple document handling
- Memory pressure scenarios
- Automatic cleanup validation
- Memory leak detection

**Thresholds:**
- Max Memory Delta: 50MB for bulk operations
- Memory recovery: >50% after cleanup

### 4. Concurrent Operations
Tests performance under concurrent load:
- Multiple parsing requests
- Mixed LSP feature requests
- Rapid sequential operations with debouncing
- Request prioritization

**Thresholds:**
- Max Duration: 500ms for concurrent operations
- Min Throughput: 2 ops/sec under load

### 5. Stress Testing
High-load scenarios and edge cases:
- Large document processing (500+ lines)
- Sustained load over 100+ iterations
- Error-prone document handling
- Cache effectiveness validation

## Performance Metrics

### Core Metrics
- **Duration**: Total and average operation time
- **Throughput**: Operations per second
- **Memory Delta**: Memory usage change during operations
- **Cache Hit Rate**: Effectiveness of caching mechanisms
- **Error Rate**: Percentage of failed operations

### Advanced Metrics
- **Performance Degradation**: Change over sustained load
- **Memory Recovery**: Cleanup effectiveness
- **Concurrency Efficiency**: Performance under concurrent load
- **Error Recovery Time**: Time to recover from errors

## Custom Jest Matchers

The framework provides custom Jest matchers for performance assertions:

```typescript
// Duration assertions
expect(measurement).toHaveAverageDurationBelow(100); // 100ms

// Memory assertions
expect(measurement).toHaveMemoryUsageBelow(5); // 5MB

// Throughput assertions
expect(measurement).toHaveThroughputAbove(10); // 10 ops/sec

// Promise timing
await expect(operation()).toCompleteWithin(50); // 50ms
```

## Configuration

### Performance Thresholds
Thresholds can be customized in `setup.ts`:

```typescript
const thresholds = {
  parsing: { maxDuration: 100, maxMemoryDelta: 5, minThroughput: 10 },
  hover: { maxDuration: 50, maxMemoryDelta: 2, minThroughput: 20 },
  // ... other thresholds
};
```

### Test Runner Configuration
Configure the test runner in `runPerformanceTests.ts`:

```typescript
const config = {
  testSuites: ['lspPerformance', 'stressTests'],
  outputDir: './test-results/performance',
  generateReports: true,
  compareBaseline: true,
  baselinePath: './test-results/performance/baseline.json',
  thresholds: {
    maxFailureRate: 10, // 10%
    maxAverageDuration: 200, // 200ms
    minThroughput: 5 // 5 ops/sec
  }
};
```

## Reports and Output

### Generated Reports
- **JSON Report**: Machine-readable performance data
- **HTML Report**: Visual dashboard with charts and metrics
- **CSV Summary**: Spreadsheet-compatible data export

### Report Locations
```
test-results/performance/
├── performance-report.json    # Detailed JSON data
├── performance-report.html    # Visual HTML dashboard
└── performance-summary.csv    # CSV export for analysis
```

### Sample HTML Report Features
- Executive summary with key metrics
- Detailed test results table
- Performance trend analysis
- Baseline comparison (if enabled)
- Optimization recommendations
- Environment information

## CI/CD Integration

### Exit Codes
- `0`: All tests passed
- `1`: Some tests failed or thresholds exceeded

### Environment Variables
```bash
# Disable report generation in CI
export PERF_NO_REPORTS=true

# Set custom output directory
export PERF_OUTPUT_DIR=/tmp/performance-results

# Enable baseline comparison
export PERF_BASELINE_PATH=./baseline.json
```

### GitHub Actions Example
```yaml
- name: Run Performance Tests
  run: npm run test:performance
  
- name: Upload Performance Reports
  uses: actions/upload-artifact@v3
  if: always()
  with:
    name: performance-reports
    path: test-results/performance/
```

## Performance Optimization Tips

### Based on Test Results

1. **High Parse Duration**: Consider optimizing lexer/parser algorithms
2. **Memory Leaks**: Review document cleanup and cache management
3. **Low Throughput**: Investigate caching opportunities
4. **Concurrent Issues**: Review request debouncing and prioritization

### Monitoring Recommendations

1. **Regular Baseline Updates**: Update baselines monthly or after major changes
2. **Trend Analysis**: Monitor performance trends over time
3. **Threshold Tuning**: Adjust thresholds based on real-world usage
4. **Environment Consistency**: Run tests in consistent environments

## Troubleshooting

### Common Issues

1. **Tests Timeout**: Increase Jest timeout in configuration
2. **Memory Errors**: Reduce concurrent test execution
3. **Inconsistent Results**: Ensure system stability and consistent environment
4. **Missing Reports**: Check output directory permissions

### Debug Mode
Enable verbose logging:
```bash
DEBUG=tableau-lsp:performance npm run test:performance
```

### Performance Profiling
For detailed profiling, use Node.js built-in profiler:
```bash
node --prof ./out/tests/performance/runPerformanceTests.js
```

## Contributing

### Adding New Performance Tests

1. Create test file in appropriate category
2. Use `PerformanceUtils` for consistent measurement
3. Define appropriate thresholds
4. Add performance logging for metrics extraction
5. Update test runner configuration

### Example Test Structure
```typescript
describe('New Performance Test', () => {
  test('should perform operation efficiently', async () => {
    const thresholds = PerformanceUtils.createThresholds('operation');
    
    const measurement = await PerformanceUtils.measureOperation(
      () => performOperation(),
      iterations
    );
    
    expect(measurement).toHaveAverageDurationBelow(thresholds.maxDuration);
    expect(measurement).toHaveThroughputAbove(thresholds.minThroughput);
    
    console.log(`Performance: ${JSON.stringify({
      operation: 'new_operation',
      averageDuration: measurement.duration / measurement.iterations,
      throughput: measurement.throughput,
      memoryDelta: measurement.memoryDelta
    })}`);
  });
});
```

## Future Enhancements

- [ ] Real-time performance monitoring dashboard
- [ ] Performance regression alerts
- [ ] Automated performance optimization suggestions
- [ ] Integration with APM tools
- [ ] Performance budgets and SLA monitoring
- [ ] Cross-platform performance comparison
- [ ] Performance impact analysis for code changes