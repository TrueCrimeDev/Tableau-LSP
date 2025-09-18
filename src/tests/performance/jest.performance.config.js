// src/tests/performance/jest.performance.config.js

module.exports = {
  displayName: 'Performance Tests',
  testMatch: ['<rootDir>/src/tests/performance/**/*.test.ts'],
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/tests/performance/setup.ts'],
  testTimeout: 60000, // 60 seconds for performance tests
  collectCoverage: false, // Performance tests don't need coverage
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  roots: ['<rootDir>/src'],
  testResultsProcessor: '<rootDir>/src/tests/performance/testResultsProcessor.js',
  reporters: [
    'default',
    ['jest-html-reporters', {
      publicPath: '<rootDir>/test-results/performance',
      filename: 'performance-test-report.html',
      expand: true
    }]
  ],
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.json'
    }
  },
  // Performance test specific settings
  maxWorkers: 1, // Run performance tests sequentially to avoid interference
  verbose: true,
  bail: false, // Continue running tests even if some fail
  
  // Performance monitoring
  detectOpenHandles: true,
  forceExit: true,
  
  // Custom performance thresholds
  setupFilesAfterEnv: [
    '<rootDir>/src/tests/performance/setup.ts'
  ],
  
  // Performance test specific environment variables
  testEnvironmentOptions: {
    NODE_ENV: 'test',
    PERFORMANCE_TEST_MODE: 'true'
  }
};