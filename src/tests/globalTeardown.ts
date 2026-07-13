// src/tests/globalTeardown.ts

import * as fs from 'fs';
import * as path from 'path';

/**
 * Global teardown for all tests
 * This runs once after all test suites complete
 */
export default async function globalTeardown(): Promise<void> {
    console.log('🧹 Starting test cleanup');
    
    // Clean up temporary test files
    await cleanupTestFiles();
    
    // Generate test summary
    await generateTestSummary();
    
    // Log completion
    console.log('✅ Test cleanup completed');
    console.log('📊 Test results available in ./test-results/');
    console.log('📈 Coverage report available in ./coverage/');
}

/**
 * Clean up temporary files created during testing
 */
async function cleanupTestFiles(): Promise<void> {
    const tempDirs = [
        path.join(__dirname, 'temp'),
        path.join(__dirname, 'fixtures/temp')
    ];
    
    for (const dir of tempDirs) {
        if (fs.existsSync(dir)) {
            try {
                fs.rmSync(dir, { recursive: true, force: true });
                console.log(`🗑️  Cleaned up temporary directory: ${dir}`);
            } catch (error) {
                console.warn(`⚠️  Failed to clean up ${dir}:`, error);
            }
        }
    }
}

/**
 * Generate a test execution summary
 */
async function generateTestSummary(): Promise<void> {
    const summaryPath = path.join(__dirname, '../test-results/test-summary.json');
    
    const summary = {
        timestamp: new Date().toISOString(),
        environment: {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            testEnvironment: process.env.NODE_ENV
        },
        configuration: {
            testTimeout: process.env.TEST_TIMEOUT,
            maxWorkers: '50%',
            collectCoverage: true
        },
        testSuites: {
            unit: 'src/tests/unit/**/*.test.ts',
            integration: 'src/tests/integration/**/*.test.ts',
            performance: 'src/tests/performance/**/*.test.ts',
            edge: 'src/tests/edge/**/*.test.ts'
        },
        coverageThresholds: {
            global: {
                branches: 80,
                functions: 80,
                lines: 80,
                statements: 80
            }
        },
        artifacts: {
            coverageReport: './coverage/index.html',
            junitReport: './test-results/junit.xml',
            htmlReport: './test-results/test-report.html'
        }
    };
    
    try {
        const resultsDir = path.dirname(summaryPath);
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }
        
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
        console.log('📋 Test summary generated');
    } catch (error) {
        console.warn('⚠️  Failed to generate test summary:', error);
    }
}
