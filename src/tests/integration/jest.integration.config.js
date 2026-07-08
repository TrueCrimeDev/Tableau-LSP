// src/tests/integration/jest.integration.config.js

module.exports = {
  rootDir: '../../..',
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
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.test.json',
      diagnostics: false
    }]
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  roots: ['<rootDir>/src'],
  testResultsProcessor: '<rootDir>/src/tests/integration/testResultsProcessor.js',
  reporters: ['default'],
  // Integration test specific settings
  maxWorkers: 1, // Run integration tests sequentially
  verbose: true,
  bail: false, // Continue running tests even if some fail
  
  // Performance monitoring
  detectOpenHandles: true,
  forceExit: true
};
