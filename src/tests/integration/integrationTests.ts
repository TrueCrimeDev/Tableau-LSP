// src/tests/integration/integrationTests.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver';
import { parseDocument } from '../../documentModel';
import { getDiagnostics } from '../../diagnosticsProvider';
import { provideHover } from '../../hoverProvider';
import { provideCompletion } from '../../completionProvider';
import { buildSignatureHelp } from '../../signatureProvider';
import { format } from '../../format';
import { IncrementalParser } from '../../incrementalParser';
import { ErrorRecovery } from '../../errorRecovery';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Run comprehensive integration tests for all LSP features
 */
export async function runIntegrationTests() {
  console.log('🔄 Starting Integration Tests\n');
  
  // Test categories
  const categories = [
    { name: 'End-to-End LSP Feature Tests', tests: testEndToEndFeatures },
    { name: 'Real-World Tableau Calculation Scenarios', tests: testRealWorldScenarios },
    { name: 'Feature Interaction Tests', tests: testFeatureInteractions },
    { name: 'Document Lifecycle Tests', tests: testDocumentLifecycle }
  ];
  
  // Run all test categories
  for (const category of categories) {
    console.log(`📋 ${category.name}`);
    await category.tests();
    console.log('');
  }
  
  console.log('✅ Integration Tests Complete!\n');
}

/**
 * Test end-to-end LSP features
 */
async function testEndToEndFeatures() {
  // Test 1: Parse → Diagnostics → Hover → Completion → Format
  console.log('\n   🔍 Test 1: Full LSP feature pipeline');
  
  const document = createTestDocument(`
    // Calculate sales ratio
    IF SUM([Sales]) > 0 THEN
      SUM([Profit]) / SUM([Sales])
    ELSE
      0
    END
  `);
  
  // Step 1: Parse document
  console.log('   Step 1: Parse document');
  const parsedDocument = parseDocument(document);
  console.log(`   ✓ Found ${parsedDocument.symbols.length} symbols`);
  
  // Step 2: Get diagnostics
  console.log('   Step 2: Get diagnostics');
  const diagnostics = getDiagnostics(document, parsedDocument);
  console.log(`   ✓ Found ${diagnostics.length} diagnostics`);
  
  // Step 3: Get hover information
  console.log('   Step 3: Get hover information');
  const hoverPosition = { line: 2, character: 10 }; // Position over SUM
  const hoverResult = provideHover({ textDocument: { uri: document.uri }, position: hoverPosition }, document, null);
  console.log(`   ✓ Hover result: ${hoverResult ? 'Success' : 'No hover information'}`);
  
  // Step 4: Get completion suggestions
  console.log('   Step 4: Get completion suggestions');
  const completionPosition = { line: 2, character: 4 }; // Position after SUM
  const completionResult = provideCompletion({ textDocument: { uri: document.uri }, position: completionPosition }, document, parsedDocument, null);
  console.log(`   ✓ Completion result: ${completionResult && completionResult.items ? completionResult.items.length : 0} items`);
  
  // Step 5: Get signature help
  console.log('   Step 5: Get signature help');
  const signaturePosition = { line: 2, character: 8 }; // Position inside SUM()
  const signatureResult = buildSignatureHelp(document, signaturePosition, parsedDocument);
  console.log(`   ✓ Signature help result: ${signatureResult ? 'Success' : 'No signature help'}`);
  
  // Step 6: Format document
  console.log('   Step 6: Format document');
  const formatResult = format(document, { tabSize: 2, insertSpaces: true });
  console.log(`   ✓ Format result: ${formatResult.length} edits`);
  
  // Test 2: Error recovery with LSP features
  console.log('\n   🔍 Test 2: Error recovery with LSP features');
  
  const errorDocument = createTestDocument(`
    // Document with errors
    IF SUM([Sales] > 0 THEN
      SUM([Profit]) / SUM([Sales])
    ELSE
      UNKNOWN_FUNCTION([Value])
    END
  `);
  
  // Step 1: Parse with error recovery
  console.log('   Step 1: Parse with error recovery');
  const errorResult = ErrorRecovery.parseWithErrorRecovery(errorDocument);
  console.log(`   ✓ Found ${errorResult.symbols.length} symbols`);
  console.log(`   ✓ Recovered from ${errorResult.recoveryInfo.recoveredErrors}/${errorResult.recoveryInfo.totalErrors} errors`);
  
  // Step 2: Get diagnostics
  console.log('   Step 2: Get diagnostics');
  const errorDiagnostics = getDiagnostics(errorDocument, errorResult);
  console.log(`   ✓ Found ${errorDiagnostics.length} diagnostics`);
  
  // Step 3: Get hover information despite errors
  console.log('   Step 3: Get hover information despite errors');
  const errorHoverPosition = { line: 2, character: 10 }; // Position over SUM
  const errorHoverResult = provideHover({ textDocument: { uri: errorDocument.uri }, position: errorHoverPosition }, errorDocument, null);
  console.log(`   ✓ Hover result: ${errorHoverResult ? 'Success' : 'No hover information'}`);
  
  // Step 4: Get completion suggestions despite errors
  console.log('   Step 4: Get completion suggestions despite errors');
  const errorCompletionPosition = { line: 4, character: 20 }; // Position after UNKNOWN_
  const errorCompletionResult = provideCompletion({ textDocument: { uri: errorDocument.uri }, position: errorCompletionPosition }, errorDocument, errorResult, null);
  console.log(`   ✓ Completion result: ${errorCompletionResult && errorCompletionResult.items ? errorCompletionResult.items.length : 0} items`);
}

/**
 * Test real-world Tableau calculation scenarios
 */
async function testRealWorldScenarios() {
  // Load real-world calculation examples
  const examples = loadRealWorldExamples();
  
  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    console.log(`\n   🔍 Test ${i + 1}: ${example.name}`);
    
    const document = createTestDocument(example.content);
    
    // Parse document
    const parsedDocument = parseDocument(document);
    console.log(`   ✓ Parsed with ${parsedDocument.symbols.length} symbols`);
    
    // Get diagnostics
    const diagnostics = getDiagnostics(document, parsedDocument);
    console.log(`   ✓ Found ${diagnostics.length} diagnostics`);
    
    // Test hover at random positions
    const positions = generateRandomPositions(document, 3);
    for (let j = 0; j < positions.length; j++) {
      const hoverResult = provideHover({ textDocument: { uri: document.uri }, position: positions[j] }, document, null);
      console.log(`   ✓ Hover at position (${positions[j].line},${positions[j].character}): ${hoverResult ? 'Success' : 'No hover'}`);
    }
    
    // Test formatting
    const formatResult = format(document, { tabSize: 2, insertSpaces: true });
    console.log(`   ✓ Format result: ${formatResult.length} edits`);
  }
}

/**
 * Test feature interactions
 */
async function testFeatureInteractions() {
  // Test 1: Incremental parsing + diagnostics
  console.log('\n   🔍 Test 1: Incremental parsing + diagnostics');
  
  const document1 = createTestDocument(`
    IF SUM([Sales]) > 1000 THEN
      "High"
    ELSE
      "Low"
    END
  `);
  
  // Initial parse
  const result1 = IncrementalParser.parseDocumentIncremental(document1);
  const diagnostics1 = getDiagnostics(document1, result1);
  
  console.log(`   ✓ Initial parse: ${result1.symbols.length} symbols, ${diagnostics1.length} diagnostics`);
  
  // Modify document
  const document2 = createTestDocument(`
    IF SUM([Sales]) > 1000 THEN
      "High"
    ELSEIF SUM([Sales]) > 500 THEN
      "Medium"
    ELSE
      "Low"
    END
  `);
  
  // Incremental parse
  const result2 = IncrementalParser.parseDocumentIncremental(document2);
  const diagnostics2 = getDiagnostics(document2, result2);
  
  console.log(`   ✓ Incremental parse: ${result2.symbols.length} symbols, ${diagnostics2.length} diagnostics`);
  
  // Test 2: Error recovery + hover
  console.log('\n   🔍 Test 2: Error recovery + hover');
  
  const errorDocument = createTestDocument(`
    IF SUM([Sales] > 1000 THEN
      "High"
    ELSE
      "Low"
    END
  `);
  
  // Parse with error recovery
  const errorResult = ErrorRecovery.parseWithErrorRecovery(errorDocument);
  
  console.log(`   ✓ Error recovery: ${errorResult.symbols.length} symbols, ${errorResult.recoveryInfo.recoveredErrors}/${errorResult.recoveryInfo.totalErrors} errors recovered`);
  
  // Test hover over SUM despite the error
  const hoverPosition = { line: 1, character: 7 };
  const hoverResult = provideHover({ textDocument: { uri: errorDocument.uri }, position: hoverPosition }, errorDocument, null);
  
  console.log(`   ✓ Hover result: ${hoverResult ? 'Success' : 'No hover information'}`);
  
  // Test 3: Formatting + incremental parsing
  console.log('\n   🔍 Test 3: Formatting + incremental parsing');
  
  const unformattedDocument = createTestDocument(`
  IF[Sales]>1000THEN"High"ELSE"Low"END
  `);
  
  // Format document
  const formatEdits = format(unformattedDocument, { tabSize: 2, insertSpaces: true });
  
  // Apply format edits (simplified)
  const formattedContent = `IF [Sales] > 1000 THEN "High" ELSE "Low" END`;
  const formattedDocument = createTestDocument(formattedContent);
  
  // Incremental parse after formatting
  const formattedResult = IncrementalParser.parseDocumentIncremental(formattedDocument);
  
  console.log(`   ✓ Format edits: ${formatEdits.length}`);
  console.log(`   ✓ Incremental parse after formatting: ${formattedResult.symbols.length} symbols`);
}

/**
 * Test document lifecycle
 */
async function testDocumentLifecycle() {
  // Test 1: Document open → change → close
  console.log('\n   🔍 Test 1: Document lifecycle');
  
  // Step 1: Document open
  console.log('   Step 1: Document open');
  const document1 = createTestDocument('SUM([Sales])');
  const openResult = IncrementalParser.parseDocumentIncremental(document1);
  console.log(`   ✓ Document opened: ${openResult.symbols.length} symbols`);
  
  // Step 2: Document change
  console.log('   Step 2: Document change');
  const document2 = createTestDocument('SUM([Sales]) + AVG([Profit])', 2);
  const changeResult = IncrementalParser.parseDocumentIncremental(document2);
  console.log(`   ✓ Document changed: ${changeResult.symbols.length} symbols`);
  
  // Step 3: Document close
  console.log('   Step 3: Document close');
  IncrementalParser.clearDocumentCache(document2.uri);
  console.log(`   ✓ Document closed and cache cleared`);
  
  // Verify cache was cleared
  const cacheStats = IncrementalParser.getCacheStats();
  console.log(`   ✓ Cache size: ${cacheStats.size}`);
  
  // Test 2: Multiple documents
  console.log('\n   🔍 Test 2: Multiple documents');
  
  // Create multiple documents
  const documents = [
    createTestDocument('SUM([Sales])', 1, 'test://doc1.twbl'),
    createTestDocument('AVG([Profit])', 1, 'test://doc2.twbl'),
    createTestDocument('COUNT([Orders])', 1, 'test://doc3.twbl')
  ];
  
  // Parse all documents
  for (const doc of documents) {
    IncrementalParser.parseDocumentIncremental(doc);
  }
  
  // Check cache size
  const multiDocCacheStats = IncrementalParser.getCacheStats();
  console.log(`   ✓ Cache size after parsing ${documents.length} documents: ${multiDocCacheStats.size}`);
  
  // Clear all cache
  IncrementalParser.clearAllCache();
  const clearedCacheStats = IncrementalParser.getCacheStats();
  console.log(`   ✓ Cache size after clearing: ${clearedCacheStats.size}`);
}

/**
 * Load real-world Tableau calculation examples
 */
function loadRealWorldExamples(): Array<{ name: string; content: string }> {
  // Create examples directory if it doesn't exist
  const examplesDir = path.join(__dirname, '../examples');
  if (!fs.existsSync(examplesDir)) {
    fs.mkdirSync(examplesDir, { recursive: true });
    
    // Create example files if they don't exist
    createExampleFiles(examplesDir);
  }
  
  // Load examples
  const examples: Array<{ name: string; content: string }> = [];
  
  try {
    const files = fs.readdirSync(examplesDir);
    for (const file of files) {
      if (file.endsWith('.twbl')) {
        const content = fs.readFileSync(path.join(examplesDir, file), 'utf8');
        examples.push({
          name: file,
          content
        });
      }
    }
  } catch (error) {
    console.error('Error loading examples:', error);
    
    // Provide fallback examples
    return getFallbackExamples();
  }
  
  return examples.length > 0 ? examples : getFallbackExamples();
}

/**
 * Create example Tableau calculation files
 */
function createExampleFiles(dir: string): void {
  const examples = getFallbackExamples();
  
  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    fs.writeFileSync(path.join(dir, `example${i + 1}.twbl`), example.content);
  }
}

/**
 * Get fallback examples if file loading fails
 */
function getFallbackExamples(): Array<{ name: string; content: string }> {
  return [
    {
      name: 'Sales Analysis',
      content: `
// Sales Analysis Calculation
IF SUM([Sales]) > 1000000 THEN
    "High Performing"
ELSEIF SUM([Sales]) > 500000 THEN
    "Medium Performing"
ELSE
    "Low Performing"
END
      `.trim()
    },
    {
      name: 'Profit Ratio',
      content: `
// Profit Ratio Calculation
IF SUM([Sales]) > 0 THEN
    SUM([Profit]) / SUM([Sales])
ELSE
    0
END
      `.trim()
    },
    {
      name: 'Customer Segmentation',
      content: `
// Customer Segmentation
CASE [Customer Segment]
WHEN "Consumer" THEN
    IF SUM([Sales]) > 10000 THEN
        "High Value Consumer"
    ELSE
        "Standard Consumer"
    END
WHEN "Corporate" THEN
    IF SUM([Sales]) > 50000 THEN
        "Key Account"
    ELSE
        "Standard Corporate"
    END
ELSE
    "Other"
END
      `.trim()
    },
    {
      name: 'Year-over-Year Growth',
      content: `
// Year-over-Year Growth
{FIXED [Customer], YEAR([Order Date]) : SUM([Sales])} /
{FIXED [Customer], YEAR(DATEADD('year', -1, [Order Date])) : SUM([Sales])} - 1
      `.trim()
    },
    {
      name: 'Complex Calculation',
      content: `
// Complex Calculation with Multiple Functions
IF ATTR([Region]) = "East" THEN
    // Eastern region calculation
    CASE [Category]
    WHEN "Furniture" THEN
        IF SUM([Profit]) > 0 THEN
            SUM([Sales]) * 0.15
        ELSE
            SUM([Sales]) * 0.05
        END
    WHEN "Technology" THEN
        IF SUM([Profit]) > 0 THEN
            SUM([Sales]) * 0.20
        ELSE
            SUM([Sales]) * 0.08
        END
    ELSE
        SUM([Sales]) * 0.10
    END
ELSEIF ATTR([Region]) = "West" THEN
    // Western region calculation
    {FIXED [Sub-Category] : SUM([Sales])} / SUM({FIXED [Category] : SUM([Sales])})
ELSE
    // Default calculation
    (SUM([Sales]) - LOOKUP(SUM([Sales]), -1)) / LOOKUP(SUM([Sales]), -1)
END
      `.trim()
    }
  ];
}

/**
 * Generate random positions within a document
 */
function generateRandomPositions(document: TextDocument, count: number): Position[] {
  const positions: Position[] = [];
  const lines = document.getText().split('\n');
  
  for (let i = 0; i < count; i++) {
    const line = Math.floor(Math.random() * lines.length);
    const character = Math.min(5, lines[line].length); // Position near the beginning of the line
    
    positions.push({ line, character });
  }
  
  return positions;
}

/**
 * Helper function to create test documents
 */
function createTestDocument(content: string, version: number = 1, uri: string = 'test://test.twbl'): TextDocument {
  return TextDocument.create(uri, 'tableau', version, content);
}

// Run tests if this file is executed directly
if (require.main === module) {
  runIntegrationTests().catch(console.error);
}

export { runIntegrationTests };