// src/tests/jest.config.js

module.exports = {
    // Test environment
    testEnvironment: 'node',
    
    // Root directory for tests
    rootDir: '../..',
    
    // Test file patterns
    testMatch: [
        '<rootDir>/src/tests/**/*.test.ts',
        '<rootDir>/src/tests/**/*.test.js'
    ],
    
    // Setup files
    setupFilesAfterEnv: [
        '<rootDir>/src/tests/jest.setup.ts'
    ],
    
    // TypeScript transformation
    transform: {
        '^.+\.ts$': 'ts-jest'
    },
    
    // Module file extensions
    moduleFileExtensions: [
        'ts',
        'js',
        'json'
    ],
    
    // Coverage configuration
    collectCoverage: true,
    coverageDirectory: '<rootDir>/coverage',
    coverageReporters: [
        'text',
        'lcov',
        'html',
        'json'
    ],
    
    // Coverage collection patterns
    collectCoverageFrom: [
        '<rootDir>/src/**/*.ts',
        '!<rootDir>/src/tests/**',
        '!<rootDir>/src/**/*.d.ts',
        '!<rootDir>/src/extension.ts', // VS Code extension entry point
        '!<rootDir>/src/server.ts'    // Server entry point (integration tested separately)
    ],
    
    // Coverage thresholds
    coverageThreshold: {
        global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80
        },
        // Specific thresholds for core components
        '<rootDir>/src/documentModel.ts': {
            branches: 85,
            functions: 85,
            lines: 85,
            statements: 85
        },
        '<rootDir>/src/diagnosticsProvider.ts': {
            branches: 85,
            functions: 85,
            lines: 85,
            statements: 85
        },
        '<rootDir>/src/hoverProvider.ts': {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80
        },
        '<rootDir>/src/completionProvider.ts': {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80
        },
        '<rootDir>/src/signatureProvider.ts': {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80
        },
        '<rootDir>/src/format.ts': {
            branches: 75,
            functions: 75,
            lines: 75,
            statements: 75
        }
    },
    
    // Test timeout
    testTimeout: 10000,
    
    // Verbose output
    verbose: true,
    
    // Clear mocks between tests
    clearMocks: true,
    
    // Restore mocks after each test
    restoreMocks: true,
    
    // Module name mapping for path resolution
    moduleNameMapping: {
        '^@/(.*)$': '<rootDir>/src/$1'
    },
    
    // Global setup and teardown
    globalSetup: '<rootDir>/src/tests/globalSetup.ts',
    globalTeardown: '<rootDir>/src/tests/globalTeardown.ts',
    
    // Test result processor
    testResultsProcessor: '<rootDir>/src/tests/testResultsProcessor.js',
    
    // Custom reporters
    reporters: [
        'default',
        [
            'jest-junit',
            {
                outputDirectory: '<rootDir>/test-results',
                outputName: 'junit.xml',
                suiteName: 'Tableau LSP Unit Tests'
            }
        ],
        [
            'jest-html-reporters',
            {
                publicPath: '<rootDir>/test-results',
                filename: 'test-report.html',
                expand: true
            }
        ]
    ],
    
    // Error handling
    errorOnDeprecated: true,
    
    // Performance monitoring
    detectOpenHandles: true,
    detectLeaks: true,
    
    // Parallel execution
    maxWorkers: '50%',
    
    // Cache configuration
    cache: true,
    cacheDirectory: '<rootDir>/node_modules/.cache/jest',
    
    // Watch mode configuration
    watchPathIgnorePatterns: [
        '<rootDir>/node_modules/',
        '<rootDir>/coverage/',
        '<rootDir>/test-results/'
    ],
    
    // Test categories configuration
    projects: [
        {
            displayName: 'Unit Tests',
            testMatch: ['<rootDir>/src/tests/unit/**/*.test.ts'],
            setupFilesAfterEnv: ['<rootDir>/src/tests/jest.setup.ts']
        },
        {
            displayName: 'Integration Tests',
            testMatch: ['<rootDir>/src/tests/integration/**/*.test.ts'],
            setupFilesAfterEnv: ['<rootDir>/src/tests/jest.setup.ts'],
            testTimeout: 30000 // Longer timeout for integration tests
        },
        {
            displayName: 'Performance Tests',
            testMatch: ['<rootDir>/src/tests/performance/**/*.test.ts'],
            setupFilesAfterEnv: ['<rootDir>/src/tests/jest.setup.ts'],
            testTimeout: 60000 // Even longer timeout for performance tests
        },
        {
            displayName: 'Edge Case Tests',
            testMatch: ['<rootDir>/src/tests/edge/**/*.test.ts'],
            setupFilesAfterEnv: ['<rootDir>/src/tests/jest.setup.ts']
        }
    ]
};
