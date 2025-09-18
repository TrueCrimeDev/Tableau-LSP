// src/tests/edge/jest.edge.config.js

module.exports = {
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
    '^.+\\.ts$': 'ts-jest'
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
      outputFile: '<rootDir>/test-results/edge-cases/edge-case-results.json'
    }]
  ],
  
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.json'
    }
  },
  
  // Error handling
  errorOnDeprecated: false,
  
  setupFilesAfterEnv: [
    '<rootDir>/src/tests/edge/setup.ts'
  ]
};