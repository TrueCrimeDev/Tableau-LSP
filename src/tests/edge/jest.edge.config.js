// src/tests/edge/jest.edge.config.js

module.exports = {
  rootDir: '../../..',
  displayName: 'Edge Case Tests',
  testMatch: ['<rootDir>/src/tests/edge/**/*.test.ts'],
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/tests/edge/setup.ts'],
  testTimeout: 30000, // 30 seconds for edge case tests
  collectCoverage: false, // Focus on edge case validation, not coverage
  maxWorkers: 2, // Allow some parallelization
  verbose: true,
  bail: false, // Continue running tests even if some fail
  
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
  
  // Edge case test specific settings
  detectOpenHandles: true,
  forceExit: true,
  
  // Custom reporters for edge case tests
  reporters: [
    'default',
    ['<rootDir>/src/tests/edge/edgeCaseReporter.js', {
      outputFile: 'test-results/edge-cases/edge-case-results.json'
    }]
  ],
  
  // Error handling
  errorOnDeprecated: false,

};
