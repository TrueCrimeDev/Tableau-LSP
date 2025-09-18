# Tableau LSP Automated Testing System

This directory contains a comprehensive automated testing system for the Tableau LSP enhancement project. The testing system is designed to validate all aspects of the LSP functionality, including parsing, diagnostics, hover, completion, formatting, and more.

## Test Categories

The testing system is organized into the following categories:

### 1. Unit Tests

Located in `src/tests/unit/`, these tests focus on individual components of the LSP:
- Document model parsing
- Diagnostics provider
- Hover provider
- Completion provider
- Signature help provider
- Formatting provider

### 2. Performance Tests

Located in `src/tests/performance/`, these tests validate the performance requirements:
- Response time for various document sizes
- Memory usage
- Caching effectiveness
- Incremental parsing performance

### 3. Edge Case Tests

Located in `src/tests/edge/`, these tests focus on error handling and boundary conditions:
- Syntax error handling
- Malformed input handling
- Boundary conditions
- Recovery scenarios
- Extreme cases

### 4. Integration Tests

Located in `src/tests/integration/`, these tests validate the end-to-end functionality:
- Full LSP feature pipeline
- Real-world Tableau calculation scenarios
- Feature interactions
- Document lifecycle

## Running Tests

You can run the tests using the following methods:

### From VS Code

1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac)
2. Type "Tableau: Run Tableau LSP Tests"
3. Select which tests to run from the dropdown

### From Command Line

Run all tests:
```
npm run test:all
```

Run specific test categories:
```
npm run test:unit
npm run test:incremental
npm run test:error
npm run test:performance
npm run test:edge
npm run test:integration
```

View the test report:
```
npm run test:report
```

## Test Reports

After running the tests, a comprehensive HTML report is generated in the `test-results` directory. The report includes:

- Overall test statistics
- Detailed results for each test suite
- Performance metrics
- Error logs for failed tests

## Adding New Tests

To add new tests:

1. Create a new test file in the appropriate category directory
2. Import the necessary components
3. Write your test cases
4. Update the main test runner if needed

## Test Configuration

The testing system is configured to:

- Run tests in isolation to prevent interference
- Capture console output for analysis
- Measure performance metrics
- Generate detailed reports
- Validate against requirements

## Requirements Validation

The tests are designed to validate the following requirements:

- Response time requirements (200ms for documents under 10KB)
- Memory usage requirements (50MB per document)
- Error handling requirements
- Feature completeness requirements
- Integration requirements

## Continuous Integration

The testing system is designed to be run in a CI environment. The tests will exit with a non-zero code if any tests fail, allowing CI systems to detect failures.

## Troubleshooting

If tests are failing:

1. Check the test report for detailed error messages
2. Look for console output in the VS Code output panel
3. Run individual test categories to isolate the issue
4. Check for environment-specific issues