// src/tests/edge/edgeCaseTests.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseDocument } from '../../documentModel';
import { getDiagnostics } from '../../diagnosticsProvider';
import { ErrorRecovery } from '../../errorRecovery';
import { IncrementalParser } from '../../incrementalParser';

/**
 * Run comprehensive edge case tests for error handling
 */
export async function runEdgeCaseTests() {
  console.log('🧪 Starting Edge Case Tests\n');
  
  // Test categories
  const categories = [
    { name: 'Syntax Errors', tests: testSyntaxErrors },
    { name: 'Malformed Inputs', tests: testMalformedInputs },
    { name: 'Boundary Conditions', tests: testBoundaryConditions },
    { name: 'Recovery Scenarios', tests: testRecoveryScenarios },
    { name: 'Extreme Cases', tests: testExtremeCases }
  ];
  
  // Run all test categories
  for (const category of categories) {
    console.log(`📋 ${category.name}`);
    await category.tests();
    console.log('');
  }
  
  console.log('✅ Edge Case Tests Complete!\n');
}

/**
 * Test syntax error handling
 */
async function testSyntaxErrors() {
  // Test 1: Unclosed blocks
  console.log('\n   🔍 Test 1: Unclosed blocks');
  const unclosedBlocks = [
    'IF [Sales] > 100 THEN "High"',
    'IF [Sales] > 100 THEN "High" ELSE "Low"',
    'CASE [Region] WHEN "North" THEN "Northern"',
    'CASE [Region] WHEN "North" THEN "Northern" ELSE "Other"'
  ];
  
  for (const test of unclosedBlocks) {
    const document = createTestDocument(test);
    const result = parseDocument(document);
    const diagnostics = getDiagnostics(document, result);
    
    console.log(`   ✓ "${test}" - ${diagnostics.length} diagnostics`);
  }
  
  // Test 2: Mismatched blocks
  console.log('\n   🔍 Test 2: Mismatched blocks');
  const mismatchedBlocks = [
    'IF [Sales] > 100 THEN "High" END ELSE "Low" END',
    'CASE [Region] WHEN "North" THEN "Northern" END ELSE "Other" END',
    'IF [Sales] > 100 THEN "High" ELSE "Low" END END'
  ];
  
  for (const test of mismatchedBlocks) {
    const document = createTestDocument(test);
    const result = parseDocument(document);
    const diagnostics = getDiagnostics(document, result);
    
    console.log(`   ✓ "${test}" - ${diagnostics.length} diagnostics`);
  }
  
  // Test 3: Invalid function calls
  console.log('\n   🔍 Test 3: Invalid function calls');
  const invalidFunctions = [
    'SUM()',
    'SUM([Sales], [Profit], [Orders])',
    'UNKNOWN_FUNCTION([Sales])',
    'SUM(AVG([Sales]))'
  ];
  
  for (const test of invalidFunctions) {
    const document = createTestDocument(test);
    const result = parseDocument(document);
    const diagnostics = getDiagnostics(document, result);
    
    console.log(`   ✓ "${test}" - ${diagnostics.length} diagnostics`);
  }
}

/**
 * Test malformed input handling
 */
async function testMalformedInputs() {
  // Test 1: Unclosed strings
  console.log('\n   🔍 Test 1: Unclosed strings');
  const unclosedStrings = [
    'IF [Sales] > 100 THEN "High ELSE "Low" END',
    'CASE [Region] WHEN "North THEN "Northern" ELSE "Other" END'
  ];
  
  for (const test of unclosedStrings) {
    const document = createTestDocument(test);
    const result = parseDocument(document);
    
    console.log(`   ✓ "${test}" - ${result.symbols.length} symbols`);
  }
  
  // Test 2: Unclosed brackets
  console.log('\n   🔍 Test 2: Unclosed brackets');
  const unclosedBrackets = [
    'SUM([Sales)',
    'AVG([Profit) + COUNT([Orders)',
    '{FIXED [Customer] : SUM([Sales)'
  ];
  
  for (const test of unclosedBrackets) {
    const document = createTestDocument(test);
    const result = parseDocument(document);
    
    console.log(`   ✓ "${test}" - ${result.symbols.length} symbols`);
  }
  
  // Test 3: Invalid characters
  console.log('\n   🔍 Test 3: Invalid characters');
  const invalidChars = [
    'SUM([Sales]) @ AVG([Profit])',
    'IF [Sales] > 100 # THEN "High" ELSE "Low" END',
    'CASE [Region] % WHEN "North" THEN "Northern" ELSE "Other" END'
  ];
  
  for (const test of invalidChars) {
    const document = createTestDocument(test);
    const result = parseDocument(document);
    
    console.log(`   ✓ "${test}" - ${result.symbols.length} symbols`);
  }
}

/**
 * Test boundary conditions
 */
async function testBoundaryConditions() {
  // Test 1: Empty document
  console.log('\n   🔍 Test 1: Empty document');
  const emptyDocument = createTestDocument('');
  const emptyResult = parseDocument(emptyDocument);
  
  console.log(`   ✓ Empty document - ${emptyResult.symbols.length} symbols, ${emptyResult.diagnostics.length} diagnostics`);
  
  // Test 2: Very long line
  console.log('\n   🔍 Test 2: Very long line');
  const longLine = 'SUM(' + '[Sales]'.repeat(1000) + ')';
  const longLineDocument = createTestDocument(longLine);
  const longLineResult = parseDocument(longLineDocument);
  
  console.log(`   ✓ Very long line (${longLine.length} chars) - ${longLineResult.symbols.length} symbols`);
  
  // Test 3: Deeply nested expressions
  console.log('\n   🔍 Test 3: Deeply nested expressions');
  let nestedExpression = 'SUM([Sales])';
  for (let i = 0; i < 10; i++) {
    nestedExpression = `IF [Sales${i}] > 100 THEN ${nestedExpression} ELSE AVG([Profit${i}]) END`;
  }
  
  const nestedDocument = createTestDocument(nestedExpression);
  const nestedResult = parseDocument(nestedDocument);
  
  console.log(`   ✓ Deeply nested expression - ${nestedResult.symbols.length} symbols, ${nestedResult.diagnostics.length} diagnostics`);
  
  // Test 4: Maximum function nesting
  console.log('\n   🔍 Test 4: Maximum function nesting');
  let nestedFunctions = '[Sales]';
  for (let i = 0; i < 20; i++) {
    nestedFunctions = `SUM(${nestedFunctions})`;
  }
  
  const nestedFunctionsDocument = createTestDocument(nestedFunctions);
  const nestedFunctionsResult = parseDocument(nestedFunctionsDocument);
  
  console.log(`   ✓ Maximum function nesting - ${nestedFunctionsResult.symbols.length} symbols, ${nestedFunctionsResult.diagnostics.length} diagnostics`);
}

/**
 * Test recovery scenarios
 */
async function testRecoveryScenarios() {
  // Test 1: Mixed errors
  console.log('\n   🔍 Test 1: Mixed errors');
  const mixedErrors = [
    'IF [Sales] > SUM( THEN "High" ELSE "Low" END',
    'CASE [Region] WHEN "North" THEN {FIXED [Customer] : COUNT([Orders] ELSE "Other" END',
    'SUM([Sales) + AVG([Profit) * UNKNOWN_FUNC([Orders])'
  ];
  
  for (const test of mixedErrors) {
    const document = createTestDocument(test);
    const result = ErrorRecovery.parseWithErrorRecovery(document);
    
    console.log(`   ✓ "${test}" - ${result.symbols.length} symbols, ${result.recoveryInfo.recoveredErrors}/${result.recoveryInfo.totalErrors} errors recovered`);
  }
  
  // Test 2: Catastrophic errors
  console.log('\n   🔍 Test 2: Catastrophic errors');
  const catastrophicErrors = [
    'IF THEN ELSE WHEN CASE END END END',
    '{ [ ( " \' } ] ) " \'',
    'SUM(AVG(COUNT(MAX(MIN([Sales])))))'
  ];
  
  for (const test of catastrophicErrors) {
    const document = createTestDocument(test);
    const result = ErrorRecovery.parseWithErrorRecovery(document);
    
    console.log(`   ✓ "${test}" - ${result.symbols.length} symbols, ${result.recoveryInfo.recoveredErrors}/${result.recoveryInfo.totalErrors} errors recovered`);
  }
  
  // Test 3: Incremental parsing with errors
  console.log('\n   🔍 Test 3: Incremental parsing with errors');
  const document1 = createTestDocument('SUM([Sales]) + AVG([Profit])');
  IncrementalParser.parseDocumentIncremental(document1);
  
  const document2 = createTestDocument('SUM([Sales]) + AVG([Profit) + UNKNOWN_FUNC(');
  const result = IncrementalParser.parseDocumentIncremental(document2);
  
  console.log(`   ✓ Incremental parsing with errors - ${result.symbols.length} symbols, ${result.diagnostics.length} diagnostics`);
}

/**
 * Test extreme cases
 */
async function testExtremeCases() {
  // Test 1: Very large document
  console.log('\n   🔍 Test 1: Very large document');
  const largeContent = Array(1000).fill('SUM([Sales]) + AVG([Profit])').join('\n');
  const largeDocument = createTestDocument(largeContent);
  
  console.log(`   Document created with ${largeDocument.lineCount} lines`);
  
  const startTime = performance.now();
  const result = parseDocument(largeDocument);
  const endTime = performance.now();
  
  console.log(`   ✓ Parsed in ${(endTime - startTime).toFixed(2)}ms`);
  console.log(`   ✓ Found ${result.symbols.length} symbols`);
  
  // Test 2: Document with many errors
  console.log('\n   🔍 Test 2: Document with many errors');
  const errorLines = Array(100).fill(0).map((_, i) => {
    const errorTypes = [
      `SUM([Sales${i})`,
      `UNKNOWN_FUNC${i}([Profit])`,
      `IF [Sales${i}] > 100 THEN "High"`,
      `{FIXED [Customer${i}] : COUNT([Orders${i}]`
    ];
    return errorTypes[i % errorTypes.length];
  });
  
  const errorDocument = createTestDocument(errorLines.join('\n'));
  
  const errorStartTime = performance.now();
  const errorResult = ErrorRecovery.parseWithErrorRecovery(errorDocument);
  const errorEndTime = performance.now();
  
  console.log(`   ✓ Parsed in ${(errorEndTime - errorStartTime).toFixed(2)}ms`);
  console.log(`   ✓ Found ${errorResult.symbols.length} symbols`);
  console.log(`   ✓ Recovered from ${errorResult.recoveryInfo.recoveredErrors}/${errorResult.recoveryInfo.totalErrors} errors`);
  
  // Test 3: Memory usage
  console.log('\n   🔍 Test 3: Memory usage');
  
  // Create a large document with many symbols
  const memoryContent = Array(500).fill(0).map((_, i) => {
    return `IF [Sales${i}] > 100 THEN SUM([Profit${i}]) ELSE AVG([Orders${i}]) END`;
  }).join('\n');
  
  const memoryDocument = createTestDocument(memoryContent);
  
  // Measure memory before
  const memBefore = process.memoryUsage().heapUsed / 1024 / 1024;
  
  // Parse document
  const memoryResult = parseDocument(memoryDocument);
  
  // Measure memory after
  const memAfter = process.memoryUsage().heapUsed / 1024 / 1024;
  
  console.log(`   ✓ Memory before: ${memBefore.toFixed(2)}MB`);
  console.log(`   ✓ Memory after: ${memAfter.toFixed(2)}MB`);
  console.log(`   ✓ Memory usage: ${(memAfter - memBefore).toFixed(2)}MB`);
  
  // Check against requirements
  if (memAfter - memBefore > 50) {
    console.log(`   ⚠️ Memory usage exceeds 50MB requirement: ${(memAfter - memBefore).toFixed(2)}MB`);
  }
}

/**
 * Helper function to create test documents
 */
function createTestDocument(content: string, version: number = 1, uri: string = 'test://test.twbl'): TextDocument {
  return TextDocument.create(uri, 'tableau', version, content);
}

// Run tests if this file is executed directly
if (require.main === module) {
  runEdgeCaseTests().catch(console.error);
}

export { runEdgeCaseTests };