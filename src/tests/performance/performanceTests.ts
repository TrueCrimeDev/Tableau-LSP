// src/tests/performance/performanceTests.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { performance } from 'perf_hooks';
import { parseDocument } from '../../documentModel';
import { getDiagnostics } from '../../diagnosticsProvider';
import { provideHover } from '../../hoverProvider';
import { provideCompletion } from '../../completionProvider';
import { buildSignatureHelp } from '../../signatureProvider';
import { IncrementalParser } from '../../incrementalParser';
import { Position } from 'vscode-languageserver';

/**
 * Run comprehensive performance tests for all LSP features
 */
export async function runPerformanceTests() {
  console.log('⚡ Starting Performance Tests\n');
  
  // Test document sizes
  const sizes = [
    { name: 'Small', lines: 10 },
    { name: 'Medium', lines: 100 },
    { name: 'Large', lines: 1000 },
    { name: 'Very Large', lines: 5000 }
  ];
  
  // Test each document size
  for (const size of sizes) {
    console.log(`📄 Testing ${size.name} Document (${size.lines} lines)`);
    
    // Generate test document
    const document = generateTestDocument(size.lines);
    console.log(`   Document created with ${document.lineCount} lines`);
    
    // Test parsing performance
    await testParsingPerformance(document);
    
    // Test diagnostics performance
    await testDiagnosticsPerformance(document);
    
    // Test hover performance
    await testHoverPerformance(document);
    
    // Test completion performance
    await testCompletionPerformance(document);
    
    // Test signature help performance
    await testSignatureHelpPerformance(document);
    
    // Test incremental parsing performance
    await testIncrementalParsingPerformance(document);
    
    console.log('');
  }
  
  // Test response time requirements
  await testResponseTimeRequirements();
  
  console.log('✅ Performance Tests Complete!\n');
}

/**
 * Test parsing performance
 */
async function testParsingPerformance(document: TextDocument) {
  console.log('\n   🔍 Testing Parsing Performance');
  
  const iterations = 5;
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const startTime = performance.now();
    const result = parseDocument(document);
    const endTime = performance.now();
    
    times.push(endTime - startTime);
  }
  
  const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
  const maxTime = Math.max(...times);
  
  console.log(`   ✓ Average parsing time: ${avgTime.toFixed(2)}ms`);
  console.log(`   ✓ Maximum parsing time: ${maxTime.toFixed(2)}ms`);
  
  // Check against requirements
  if (document.lineCount <= 1000 && avgTime > 200) {
    console.log(`   ⚠️ Average parsing time exceeds 200ms requirement: ${avgTime.toFixed(2)}ms`);
  }
}

/**
 * Test diagnostics performance
 */
async function testDiagnosticsPerformance(document: TextDocument) {
  console.log('\n   🔍 Testing Diagnostics Performance');
  
  const iterations = 5;
  const times: number[] = [];
  
  // Parse document once
  const parsedDocument = parseDocument(document);
  
  for (let i = 0; i < iterations; i++) {
    const startTime = performance.now();
    const diagnostics = getDiagnostics(document, parsedDocument);
    const endTime = performance.now();
    
    times.push(endTime - startTime);
  }
  
  const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
  const maxTime = Math.max(...times);
  
  console.log(`   ✓ Average diagnostics time: ${avgTime.toFixed(2)}ms`);
  console.log(`   ✓ Maximum diagnostics time: ${maxTime.toFixed(2)}ms`);
}

/**
 * Test hover performance
 */
async function testHoverPerformance(document: TextDocument) {
  console.log('\n   🔍 Testing Hover Performance');
  
  const iterations = 10;
  const times: number[] = [];
  
  // Generate random positions
  const positions = generateRandomPositions(document, iterations);
  
  for (let i = 0; i < iterations; i++) {
    const startTime = performance.now();
    const hoverResult = provideHover({ textDocument: { uri: document.uri }, position: positions[i] }, document, null);
    const endTime = performance.now();
    
    times.push(endTime - startTime);
  }
  
  const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
  const maxTime = Math.max(...times);
  
  console.log(`   ✓ Average hover time: ${avgTime.toFixed(2)}ms`);
  console.log(`   ✓ Maximum hover time: ${maxTime.toFixed(2)}ms`);
  
  // Check against requirements
  if (document.lineCount <= 1000 && avgTime > 50) {
    console.log(`   ⚠️ Average hover time exceeds 50ms requirement: ${avgTime.toFixed(2)}ms`);
  }
}

/**
 * Test completion performance
 */
async function testCompletionPerformance(document: TextDocument) {
  console.log('\n   🔍 Testing Completion Performance');
  
  const iterations = 10;
  const times: number[] = [];
  
  // Generate random positions
  const positions = generateRandomPositions(document, iterations);
  
  // Parse document once
  const parsedDocument = parseDocument(document);
  
  for (let i = 0; i < iterations; i++) {
    const startTime = performance.now();
    const completionResult = provideCompletion({ textDocument: { uri: document.uri }, position: positions[i] }, document, parsedDocument, null);
    const endTime = performance.now();
    
    times.push(endTime - startTime);
  }
  
  const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
  const maxTime = Math.max(...times);
  
  console.log(`   ✓ Average completion time: ${avgTime.toFixed(2)}ms`);
  console.log(`   ✓ Maximum completion time: ${maxTime.toFixed(2)}ms`);
  
  // Check against requirements
  if (document.lineCount <= 1000 && avgTime > 100) {
    console.log(`   ⚠️ Average completion time exceeds 100ms requirement: ${avgTime.toFixed(2)}ms`);
  }
}

/**
 * Test signature help performance
 */
async function testSignatureHelpPerformance(document: TextDocument) {
  console.log('\n   🔍 Testing Signature Help Performance');
  
  const iterations = 10;
  const times: number[] = [];
  
  // Generate random positions
  const positions = generateRandomPositions(document, iterations);
  
  // Parse document once
  const parsedDocument = parseDocument(document);
  
  for (let i = 0; i < iterations; i++) {
    const startTime = performance.now();
    const signatureResult = buildSignatureHelp(document, positions[i], parsedDocument);
    const endTime = performance.now();
    
    times.push(endTime - startTime);
  }
  
  const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
  const maxTime = Math.max(...times);
  
  console.log(`   ✓ Average signature help time: ${avgTime.toFixed(2)}ms`);
  console.log(`   ✓ Maximum signature help time: ${maxTime.toFixed(2)}ms`);
}

/**
 * Test incremental parsing performance
 */
async function testIncrementalParsingPerformance(document: TextDocument) {
  console.log('\n   🔍 Testing Incremental Parsing Performance');
  
  // Initial parse
  const startTime1 = performance.now();
  const result1 = IncrementalParser.parseDocumentIncremental(document);
  const endTime1 = performance.now();
  
  console.log(`   ✓ Initial parse time: ${(endTime1 - startTime1).toFixed(2)}ms`);
  
  // Create modified document with small change
  const text = document.getText();
  const modifiedText = text.replace('SUM([Sales0])', 'AVG([Sales0])');
  const modifiedDocument = TextDocument.create(document.uri, document.languageId, document.version + 1, modifiedText);
  
  // Incremental parse
  const startTime2 = performance.now();
  const result2 = IncrementalParser.parseDocumentIncremental(modifiedDocument);
  const endTime2 = performance.now();
  
  console.log(`   ✓ Incremental parse time: ${(endTime2 - startTime2).toFixed(2)}ms`);
  console.log(`   ✓ Speedup: ${((endTime1 - startTime1) / (endTime2 - startTime2)).toFixed(1)}x`);
  
  if ('changedLines' in result2) {
    console.log(`   ✓ Changed lines detected: ${(result2 as any).changedLines?.size || 0}`);
  }
}

/**
 * Test response time requirements
 */
async function testResponseTimeRequirements() {
  console.log('\n📊 Testing Response Time Requirements');
  
  // Create a 10KB document (approximately)
  const document = generateTestDocument(100); // ~100 lines ≈ 10KB
  console.log(`   Document created with ${document.lineCount} lines`);
  
  // Test parsing time
  const startParse = performance.now();
  parseDocument(document);
  const parseDuration = performance.now() - startParse;
  
  console.log(`   ✓ Parse time: ${parseDuration.toFixed(2)}ms (Requirement: <200ms)`);
  if (parseDuration > 200) {
    console.log(`   ⚠️ Parse time exceeds 200ms requirement`);
  }
  
  // Test hover time
  const parsedDocument = parseDocument(document);
  const position = { line: Math.floor(document.lineCount / 2), character: 5 };
  
  const startHover = performance.now();
  provideHover({ textDocument: { uri: document.uri }, position }, document, null);
  const hoverDuration = performance.now() - startHover;
  
  console.log(`   ✓ Hover time: ${hoverDuration.toFixed(2)}ms (Requirement: <50ms)`);
  if (hoverDuration > 50) {
    console.log(`   ⚠️ Hover time exceeds 50ms requirement`);
  }
  
  // Test completion time
  const startCompletion = performance.now();
  provideCompletion({ textDocument: { uri: document.uri }, position }, document, parsedDocument, null);
  const completionDuration = performance.now() - startCompletion;
  
  console.log(`   ✓ Completion time: ${completionDuration.toFixed(2)}ms (Requirement: <100ms)`);
  if (completionDuration > 100) {
    console.log(`   ⚠️ Completion time exceeds 100ms requirement`);
  }
  
  // Test diagnostics time
  const startDiagnostics = performance.now();
  getDiagnostics(document, parsedDocument);
  const diagnosticsDuration = performance.now() - startDiagnostics;
  
  console.log(`   ✓ Diagnostics time: ${diagnosticsDuration.toFixed(2)}ms (Requirement: <200ms)`);
  if (diagnosticsDuration > 200) {
    console.log(`   ⚠️ Diagnostics time exceeds 200ms requirement`);
  }
}

/**
 * Generate a test document with specified number of lines
 */
function generateTestDocument(lines: number): TextDocument {
  const content: string[] = [];
  
  for (let i = 0; i < lines; i++) {
    const lineType = i % 10;
    
    switch (lineType) {
      case 0:
        content.push(`SUM([Sales${i}])`);
        break;
      case 1:
        content.push(`AVG([Profit${i}])`);
        break;
      case 2:
        content.push(`COUNT([Orders${i}])`);
        break;
      case 3:
        content.push(`IF [Sales${i}] > 100 THEN "High" ELSE "Low" END`);
        break;
      case 4:
        content.push(`{FIXED [Customer${i}] : SUM([Sales${i}])}`);
        break;
      case 5:
        content.push(`// Comment line ${i}`);
        break;
      case 6:
        content.push(`[Field${i}] + [AnotherField${i}]`);
        break;
      case 7:
        content.push(`CASE [Region${i}]`);
        content.push(`WHEN "North" THEN "Northern"`);
        content.push(`WHEN "South" THEN "Southern"`);
        content.push(`ELSE "Other"`);
        content.push(`END`);
        i += 4; // Skip next 4 iterations since we added 5 lines
        break;
      case 8:
        content.push(`IIF([Profit${i}] > 0, "Profitable", "Loss")`);
        break;
      case 9:
        content.push(`LOOKUP(SUM([Sales${i}]), -1)`);
        break;
    }
  }
  
  return TextDocument.create('test://performance.twbl', 'tableau', 1, content.join('\n'));
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

// Run tests if this file is executed directly
if (require.main === module) {
  runPerformanceTests().catch(console.error);
}

export { runPerformanceTests };