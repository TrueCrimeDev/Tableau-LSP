# Edge Case Testing Framework

This directory contains a comprehensive edge case testing framework for the Tableau LSP extension. The framework validates that the LSP handles malformed inputs, boundary conditions, and error scenarios gracefully without crashing.

## Overview

The edge case testing framework consists of several components:

- **Malformed Input Tests** (`malformedInputs.test.ts`): Tests for handling invalid syntax and corrupted input
- **Boundary Condition Tests** (`boundaryConditions.test.ts`): Tests for edge cases like empty inputs and extremely large documents
- **Error Recovery Tests** (`errorRecovery.test.ts`): Tests for graceful error recovery and continued functionality
- **Test Runner** (`edgeCaseTestRunner.ts`): Unified runner with comprehensive reporting
- **Custom Reporter** (`edgeCaseReporter.js`): Detailed error analysis and recovery statistics
- **Test Setup** (`setup.ts`): Edge case-specific Jest configuration and utilities

## Features

### 🛡️ Comprehensive Error Handling Validation
- Malformed syntax handling (unclosed strings, brackets, blocks)
- Invalid character and operator handling
- Unknown function and field reference handling
- Catastrophic syntax error recovery

### 🎯 Boundary Condition Testing
- Empty and whitespace-only documents
- Extremely large documents and expressions
- Unicode and special character handling
- Memory and performance boundary validation

### 🔄 Error Recovery Validation
- Partial expression recovery during typing
- Mixed error type recovery
- Incremental parsing error handling
- LSP feature functionality with errors present

### 📊 Advanced Reporting
- Error pattern analysis and categorization
- Recovery effectiveness measurement
- Performance impact assessment
- Detailed recommendations for improvements

## Quick Start

### Run All Edge Case Tests
```bash
npm run test:edge
```

### Run Specific Test Categories
```bash
# Malformed input tests only
npm run test:edge:malformed

# Boundary condition tests only
npm run test:edge:boundary

# Error recovery tests only
npm run test:edge:recovery

# Custom Jest configuration
npm run test:edge:suite
```

## Test Categories

### 1. Malformed Input Handling
Tests the LSP's ability to handle various types of malformed input gracefully:

#### **Unclosed String Literals**
- Unclosed double quotes in IF statements
- Unclosed single quotes in CASE statements
- Mixed quote types
- Strings with escaped quotes

#### **Unclosed Brackets and Parentheses**
- Unclosed field reference brackets: `SUM([Sales)`
- Unclosed function parentheses: `AVG([Profit) + COUNT([Orders)`
- Unclosed LOD expressions: `{FIXED [Customer] : SUM([Sales)`
- Nested unclosed brackets

#### **Invalid Characters and Syntax**
- Invalid operators: `@`, `%`, `#`
- Unicode characters in unexpected places
- Control characters
- Mixed valid and invalid syntax

#### **Malformed Function Calls**
- Functions with no parameters: `SUM()`
- Functions with too many parameters: `SUM([Sales], [Profit], [Orders])`
- Unknown functions: `UNKNOWN_FUNCTION([Sales])`
- Nested aggregations without LOD: `SUM(AVG([Sales]))`

#### **Malformed Block Structures**
- IF statements without END
- CASE statements without END
- Extra END statements
- Mismatched block keywords

### 2. Boundary Condition Testing
Tests the LSP's behavior at the limits of normal operation:

#### **Empty and Minimal Inputs**
- Empty documents
- Whitespace-only documents
- Single character inputs
- LSP feature behavior with empty documents

#### **Extremely Large Inputs**
- Very long single lines (10,000+ characters)
- Documents with many lines (1,000+ lines)
- Deeply nested expressions (20+ levels)
- Maximum function parameter nesting (50+ levels)

#### **Memory Boundary Conditions**
- Documents approaching the 50MB limit
- Multiple large documents triggering memory management
- Memory usage tracking and cleanup validation

#### **Position and Range Boundaries**
- Positions at document start/end
- Positions beyond document bounds
- Negative positions
- Multi-line document boundary positions

#### **Unicode and Special Characters**
- Unicode character handling
- Very long unicode strings
- Mathematical symbols and emojis
- Escape sequences

### 3. Error Recovery Testing
Tests the LSP's ability to recover from errors and continue providing functionality:

#### **Syntax Error Recovery**
- Recovery from unclosed IF statements
- Recovery from unclosed CASE statements
- Recovery from function syntax errors
- Continued parsing after errors

#### **Partial Expression Recovery**
- Incomplete expressions during typing
- Incomplete LOD expressions
- Helpful guidance for incomplete expressions
- Progressive completion during typing

#### **Mixed Error Recovery**
- Multiple error types in single expression
- LSP functionality maintenance with errors
- Error recovery performance impact
- Recovery rate validation

#### **Catastrophic Error Recovery**
- Completely malformed syntax
- Meaningful error messages for severe failures
- System stability under extreme conditions

## Custom Jest Matchers

The framework provides custom Jest matchers for edge case validation:

```typescript
// Error handling validation
expect(() => parseDocument(malformedInput)).toHandleErrorsGracefully();

// Error recovery validation
expect(recoveryResult).toRecoverFromErrors(0.7); // 70% recovery rate

// Diagnostic quality validation
expect(diagnostics).toProvideUsefulDiagnostics();

// Performance validation
expect({ duration: 150, threshold: 200 }).toMaintainPerformanceUnderLoad();
```

## Test Utilities

The `EdgeCaseUtils` provides helpful utilities for edge case testing:

```typescript
// Create test documents with automatic cleanup
const document = EdgeCaseUtils.createTestDocument(malformedContent);

// Generate test cases
const malformedInputs = EdgeCaseUtils.generateMalformedInputs();
const boundaryConditions = EdgeCaseUtils.generateBoundaryConditions();
const recoveryScenarios = EdgeCaseUtils.generateErrorRecoveryScenarios();

// Performance measurement
const { result, duration, withinThreshold } = await EdgeCaseUtils.measurePerformance(
  () => parseDocument(document),
  'parsing malformed input',
  1000 // 1 second threshold
);

// Error recovery validation
const validation = EdgeCaseUtils.validateErrorRecovery(result, 0.6);
```

## Reports and Output

### Generated Reports
- **JSON Report**: Machine-readable test results and error analysis
- **HTML Report**: Visual dashboard with error patterns and recovery statistics
- **CSV Summary**: Spreadsheet-compatible data export

### Report Locations
```
test-results/edge-cases/
├── edge-case-report.json     # Detailed JSON data
├── edge-case-report.html     # Visual HTML dashboard
└── edge-case-summary.csv     # CSV export for analysis
```

### Sample HTML Report Features
- Test suite results with success rates
- Error pattern analysis and categorization
- Performance analysis with slow test identification
- Error recovery effectiveness measurement
- Detailed recommendations for improvements

## Error Pattern Analysis

The framework automatically categorizes and analyzes error patterns:

### Common Error Types
- **Timeout**: Tests that exceed time limits
- **Memory**: Memory-related failures
- **Crash**: System crashes or exceptions
- **Null Reference**: Null pointer exceptions
- **Undefined Property**: Property access errors
- **Parsing Error**: Syntax parsing failures
- **Recovery Failure**: Error recovery mechanism failures

### Recovery Effectiveness Grades
- **Excellent**: 90%+ recovery rate
- **Good**: 75-89% recovery rate
- **Fair**: 60-74% recovery rate
- **Poor**: 40-59% recovery rate
- **Critical**: <40% recovery rate

## Performance Grades
- **Grade A**: <1s average, no slow tests
- **Grade B**: <2s average, ≤1 slow test
- **Grade C**: <5s average, ≤3 slow tests
- **Grade D**: <10s average, ≤5 slow tests
- **Grade F**: >10s average or >5 slow tests

## Configuration

### Test Timeouts
- Default timeout: 30 seconds per test
- Configurable in `jest.edge.config.js`
- Stress tests may require longer timeouts

### Memory Limits
- Test environment: 200MB limit
- Cleanup threshold: 150MB
- Per-document limit: 50MB (as per requirements)

### Performance Thresholds
- Parsing: 1000ms for complex malformed input
- LSP features: 500ms with errors present
- Recovery: 2000ms for large documents with errors

## CI/CD Integration

### Exit Codes
- `0`: All tests passed
- `1`: Some tests failed or critical issues found

### Environment Variables
```bash
# Disable HTML report generation in CI
export EDGE_NO_HTML_REPORTS=true

# Set custom output directory
export EDGE_OUTPUT_DIR=/tmp/edge-case-results

# Enable verbose error logging
export EDGE_VERBOSE_ERRORS=true
```

### GitHub Actions Example
```yaml
- name: Run Edge Case Tests
  run: npm run test:edge
  
- name: Upload Edge Case Reports
  uses: actions/upload-artifact@v3
  if: always()
  with:
    name: edge-case-reports
    path: test-results/edge-cases/
```

## Troubleshooting

### Common Issues

1. **Tests Timeout**: Increase timeout in Jest configuration
2. **Memory Errors**: Reduce concurrent test execution
3. **Inconsistent Results**: Ensure proper test isolation and cleanup
4. **Missing Reports**: Check output directory permissions

### Debug Mode
Enable verbose logging:
```bash
DEBUG=tableau-lsp:edge npm run test:edge
```

### Performance Profiling
For detailed profiling of edge case handling:
```bash
node --prof ./out/tests/edge/edgeCaseTestRunner.js
```

## Contributing

### Adding New Edge Case Tests

1. Identify the edge case category (malformed, boundary, recovery)
2. Add test cases to the appropriate test file
3. Use custom matchers for consistent validation
4. Include performance expectations
5. Update documentation

### Example Test Structure
```typescript
describe('New Edge Case Category', () => {
  test('should handle specific edge case', () => {
    const edgeCaseInput = 'malformed input here';
    const document = EdgeCaseUtils.createTestDocument(edgeCaseInput);
    
    expect(() => {
      const result = parseDocument(document);
      const diagnostics = getDiagnostics(document, result);
      
      // Validate error handling
      expect(result).toBeDefined();
      expect(diagnostics).toProvideUsefulDiagnostics();
      
    }).toHandleErrorsGracefully();
  });
});
```

## Future Enhancements

- [ ] Automated edge case generation based on grammar rules
- [ ] Machine learning-based error pattern detection
- [ ] Real-time edge case monitoring in production
- [ ] Integration with fuzzing tools for comprehensive testing
- [ ] Performance regression detection for edge cases
- [ ] Cross-platform edge case behavior validation

## Requirements Validation

This framework validates the following requirements:

- **R8.4**: Comprehensive edge case testing with malformed inputs
- **R8.3**: Boundary condition testing for system limits
- **R6.1-6.10**: Error recovery and graceful degradation
- **R1.2**: Continued functionality despite syntax errors
- **R7.4**: Memory usage limits under stress conditions

The edge case testing framework ensures the Tableau LSP maintains stability and provides meaningful functionality even when faced with invalid input, extreme conditions, and error scenarios.