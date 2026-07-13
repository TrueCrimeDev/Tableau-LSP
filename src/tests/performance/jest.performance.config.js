// src/tests/performance/jest.performance.config.js

module.exports = {
  rootDir: '../../..',
  displayName: 'Performance Tests',
  testMatch: ['<rootDir>/src/tests/performance/**/*.test.ts'],
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/tests/performance/setup.ts'],
  testTimeout: 60000, // 60 seconds for performance tests
  collectCoverage: false, // Performance tests don't need coverage
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
  reporters: ['default'],
  // Performance test specific settings
  maxWorkers: 1, // Run performance tests sequentially to avoid interference
  verbose: true,
  bail: false, // Continue running tests even if some fail
  
  // Performance monitoring
  detectOpenHandles: true,
  forceExit: true,
  
  // Performance test specific environment variables
  testEnvironmentOptions: {
    NODE_ENV: 'test',
    PERFORMANCE_TEST_MODE: 'true'
  }
};
