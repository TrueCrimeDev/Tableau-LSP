// src/tests/integration/jest.integration.config.js

module.exports = {
  displayName: 'Integration Tests',
  testMatch: ['<rootDir>/src/tests/integration/**/*.test.ts'],
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/tests/integration/setup.ts'],
  testTimeout: 30000, // 30 seconds for integration tests
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage/integration',
  coverageReporters: ['text', 'lcov', 'html'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/out/',
    '/test-results/',
    '/.vscode/',
    '/coverage/'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  roots: ['<rootDir>/src'],
  testResultsProcessor: '<rootDir>/src/tests/integration/testResultsProcessor.js',
  reporters: [
    'default',
    ['jest-html-reporters', {
      publicPath: '<rootDir>/test-results/integration',
      filename: 'integration-test-report.html',
      expand: true
    }]
  ],
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.json'
    }
  },
  // Integration test specific settings
  maxWorkers: 1, // Run integration tests sequentially
  verbose: true,
  bail: false, // Continue running tests even if some fail
  
  // Performance monitoring
  detectOpenHandles: true,
  forceExit: true,
  
  // Custom matchers for integration tests
  setupFilesAfterEnv: [
    '<rootDir>/src/tests/integration/setup.ts'
  ]
};