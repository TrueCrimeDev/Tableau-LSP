// src/tests/globalSetup.ts

import * as fs from 'fs';
import * as path from 'path';

/**
 * Global setup for all tests
 * This runs once before all test suites
 */
export default async function globalSetup(): Promise<void> {
    console.log('🚀 Starting Tableau LSP Test Suite');
    
    // Create test results directory
    const testResultsDir = path.join(__dirname, '../../test-results');
    if (!fs.existsSync(testResultsDir)) {
        fs.mkdirSync(testResultsDir, { recursive: true });
    }
    
    // Create coverage directory
    const coverageDir = path.join(__dirname, '../../coverage');
    if (!fs.existsSync(coverageDir)) {
        fs.mkdirSync(coverageDir, { recursive: true });
    }
    
    // Set up test environment variables
    process.env.NODE_ENV = 'test';
    process.env.TEST_TIMEOUT = '10000';
    
    // Initialize test fixtures
    await setupTestFixtures();
    
    // Log test configuration
    console.log('📋 Test Configuration:');
    console.log(`  - Node Environment: ${process.env.NODE_ENV}`);
    console.log(`  - Test Timeout: ${process.env.TEST_TIMEOUT}ms`);
    console.log(`  - Coverage Directory: ${coverageDir}`);
    console.log(`  - Results Directory: ${testResultsDir}`);
    
    console.log('✅ Global setup completed');
}

/**
 * Set up test fixtures and mock data
 */
async function setupTestFixtures(): Promise<void> {
    const fixturesDir = path.join(__dirname, 'fixtures');
    
    if (!fs.existsSync(fixturesDir)) {
        fs.mkdirSync(fixturesDir, { recursive: true });
    }
    
    // Create mock field definitions file
    const mockFieldDefinitions = `
        // Mock field definitions for testing
        [Sales] : Number // Total sales amount in USD
        [Profit] : Number // Profit margin
        [Customer Name] : String // Name of the customer
        [Order Date] : Date // Date when order was placed
        [Category] : String // Product category
        [Sub-Category] : String // Product sub-category
        [Region] : String // Geographic region
        [Quantity] : Number // Quantity ordered
        [Discount] : Number // Discount percentage
        [Ship Mode] : String // Shipping method
        [Product Name] : String // Name of the product
        [Order ID] : String // Unique order identifier
        [Customer ID] : String // Unique customer identifier
        [Segment] : String // Customer segment
        [Country] : String // Country name
        [City] : String // City name
        [State] : String // State or province
        [Postal Code] : String // Postal or ZIP code
        [Ship Date] : Date // Date when order was shipped
        [Revenue] : Number // Total revenue
    `;
    
    const fieldsPath = path.join(fixturesDir, 'fields.d.twbl');
    fs.writeFileSync(fieldsPath, mockFieldDefinitions, 'utf8');
    
    // Create mock function definitions
    const mockFunctionDefinitions = {
        functions: [
            {
                name: 'SUM',
                category: 'Aggregate',
                description: 'Returns the sum of all values in the expression',
                syntax: 'SUM(expression)',
                parameters: [
                    {
                        name: 'expression',
                        type: 'Number',
                        description: 'The expression to sum'
                    }
                ],
                returnType: 'Number',
                examples: ['SUM([Sales])', 'SUM([Profit] * [Quantity])']
            },
            {
                name: 'AVG',
                category: 'Aggregate',
                description: 'Returns the average of all values in the expression',
                syntax: 'AVG(expression)',
                parameters: [
                    {
                        name: 'expression',
                        type: 'Number',
                        description: 'The expression to average'
                    }
                ],
                returnType: 'Number',
                examples: ['AVG([Sales])', 'AVG([Profit])']
            },
            {
                name: 'COUNT',
                category: 'Aggregate',
                description: 'Returns the count of items in the group',
                syntax: 'COUNT(expression)',
                parameters: [
                    {
                        name: 'expression',
                        type: 'Any',
                        description: 'The expression to count'
                    }
                ],
                returnType: 'Number',
                examples: ['COUNT([Orders])', 'COUNT(DISTINCT [Customer ID])']
            },
            {
                name: 'LEFT',
                category: 'String',
                description: 'Returns the leftmost number of characters in the string',
                syntax: 'LEFT(string, number)',
                parameters: [
                    {
                        name: 'string',
                        type: 'String',
                        description: 'The string to extract from'
                    },
                    {
                        name: 'number',
                        type: 'Number',
                        description: 'The number of characters to extract'
                    }
                ],
                returnType: 'String',
                examples: ['LEFT([Customer Name], 5)', 'LEFT("Hello World", 5)']
            },
            {
                name: 'DATEADD',
                category: 'Date',
                description: 'Adds a specified number of date parts to a date',
                syntax: 'DATEADD(date_part, interval, date)',
                parameters: [
                    {
                        name: 'date_part',
                        type: 'String',
                        description: 'The part of the date to add to (year, month, day, etc.)'
                    },
                    {
                        name: 'interval',
                        type: 'Number',
                        description: 'The number of date parts to add'
                    },
                    {
                        name: 'date',
                        type: 'Date',
                        description: 'The date to add to'
                    }
                ],
                returnType: 'Date',
                examples: ['DATEADD(\'month\', 1, [Order Date])', 'DATEADD(\'year\', -1, TODAY())']
            }
        ]
    };
    
    const functionsPath = path.join(fixturesDir, 'functions.json');
    fs.writeFileSync(functionsPath, JSON.stringify(mockFunctionDefinitions, null, 2), 'utf8');
    
    // Create sample test documents
    const sampleDocuments = {
        simple: 'SUM([Sales])',
        complex: `
            IF [Sales] > 1000 THEN
                CASE [Category]
                    WHEN "Furniture" THEN [Sales] * 0.1
                    WHEN "Technology" THEN [Sales] * 0.15
                    ELSE [Sales] * 0.05
                END
            ELSE
                [Sales] * 0.02
            END
        `,
        lod: '{ FIXED [Region] : SUM([Sales]) }',
        nested: 'ROUND(SUM(AVG([Sales])), 2)',
        malformed: 'IF [Sales] > 100 THEN THEN ELSE',
        withComments: `
            // Calculate profit margin
            SUM([Profit]) / SUM([Sales]) // Profit ratio
        `
    };
    
    const documentsPath = path.join(fixturesDir, 'sampleDocuments.json');
    fs.writeFileSync(documentsPath, JSON.stringify(sampleDocuments, null, 2), 'utf8');
    
    console.log('📁 Test fixtures created successfully');
}
