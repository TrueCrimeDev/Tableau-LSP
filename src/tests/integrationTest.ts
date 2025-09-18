// src/tests/integrationTest.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { IncrementalParser } from '../incrementalParser';
import { ErrorRecovery } from '../errorRecovery';
import { PerformanceMonitor } from '../performanceMonitor';
import { INCREMENTAL_PARSING_CONFIG } from '../common';

/**
 * Integration test for incremental parsing with error recovery
 */
async function runIntegrationTest() {
    console.log('🔄 Starting Integration Test: Incremental Parsing + Error Recovery\n');
    
    PerformanceMonitor.setEnabled(true);
    PerformanceMonitor.clearMetrics();
    
    // Test 1: Large document with errors - incremental parsing with error recovery
    console.log('📊 Test 1: Large document with mixed errors');
    
    const largeDocumentWithErrors = generateLargeDocumentWithErrors();
    const doc1 = TextDocument.create('test://integration.twbl', 'tableau', 1, largeDocumentWithErrors);
    
    console.log(`   Document size: ${doc1.lineCount} lines`);
    console.log(`   Incremental parsing threshold: ${INCREMENTAL_PARSING_CONFIG.MIN_LINES_FOR_INCREMENTAL} lines`);
    
    // Initial parse
    const startTime1 = performance.now();
    const result1 = IncrementalParser.parseDocumentIncremental(doc1);
    const endTime1 = performance.now();
    
    console.log(`   ✓ Initial parse: ${(endTime1 - startTime1).toFixed(2)}ms`);
    console.log(`   ✓ Found ${result1.symbols.length} symbols`);
    console.log(`   ✓ Generated ${result1.diagnostics.length} diagnostics`);
    
    // Test error recovery info if available
    if ('recoveryInfo' in result1) {
        const recoveryInfo = (result1 as any).recoveryInfo;
        console.log(`   ✓ Error recovery: ${recoveryInfo.recoveredErrors}/${recoveryInfo.totalErrors} errors recovered`);
    }
    
    // Test 2: Incremental update with error introduction
    console.log('\n🔧 Test 2: Incremental update with error introduction');
    
    // Introduce errors in the middle of the document
    const modifiedContent = largeDocumentWithErrors.replace(
        'SUM([Sales10])',
        'UNKNOWN_FUNC([Sales10] + ANOTHER_ERROR(['
    );
    
    const doc2 = TextDocument.create('test://integration.twbl', 'tableau', 2, modifiedContent);
    
    const startTime2 = performance.now();
    const result2 = IncrementalParser.parseDocumentIncremental(doc2);
    const endTime2 = performance.now();
    
    console.log(`   ✓ Incremental parse: ${(endTime2 - startTime2).toFixed(2)}ms`);
    console.log(`   ✓ Found ${result2.symbols.length} symbols`);
    console.log(`   ✓ Generated ${result2.diagnostics.length} diagnostics`);
    
    if ('changedLines' in result2) {
        console.log(`   ✓ Changed lines: ${(result2 as any).changedLines?.size || 0}`);
    }
    
    // Test 3: Error correction with incremental parsing
    console.log('\n✅ Test 3: Error correction with incremental parsing');
    
    // Fix the errors
    const correctedContent = modifiedContent.replace(
        'UNKNOWN_FUNC([Sales10] + ANOTHER_ERROR([',
        'SUM([Sales10]) + AVG([Profit10])'
    );
    
    const doc3 = TextDocument.create('test://integration.twbl', 'tableau', 3, correctedContent);
    
    const startTime3 = performance.now();
    const result3 = IncrementalParser.parseDocumentIncremental(doc3);
    const endTime3 = performance.now();
    
    console.log(`   ✓ Error correction parse: ${(endTime3 - startTime3).toFixed(2)}ms`);
    console.log(`   ✓ Found ${result3.symbols.length} symbols`);
    console.log(`   ✓ Generated ${result3.diagnostics.length} diagnostics`);
    
    // Test 4: Complex multi-line expression with errors
    console.log('\n🧮 Test 4: Complex multi-line expression with errors');
    
    const complexExpression = `
IF [Sales] > 1000 THEN
    CASE [Region]
    WHEN "North" THEN 
        {FIXED [Customer] : 
            SUM([Sales]) + 
            UNKNOWN_FUNC([Profit] +
            AVG([Discount])
        }
    WHEN "South" THEN
        IIF([Profit] > 0,
            MAX([Sales]),
            MIN([Sales]
        )
    ELSE
        COUNT([Orders]) * 
        ANOTHER_UNKNOWN([Field])
    END
ELSEIF [Sales] > 500 THEN
    "Medium"
ELSE
    "Low"
END
    `.trim();
    
    const complexDoc = TextDocument.create('test://complex.twbl', 'tableau', 1, complexExpression);
    
    const startTime4 = performance.now();
    const result4 = IncrementalParser.parseDocumentIncremental(complexDoc);
    const endTime4 = performance.now();
    
    console.log(`   ✓ Complex expression parse: ${(endTime4 - startTime4).toFixed(2)}ms`);
    console.log(`   ✓ Found ${result4.symbols.length} symbols`);
    console.log(`   ✓ Generated ${result4.diagnostics.length} diagnostics`);
    
    // Verify key symbols were found despite errors
    const keySymbols = ['IF', 'CASE', 'WHEN', 'FIXED', 'SUM', 'IIF', 'COUNT', 'ELSEIF', 'ELSE', 'END'];
    const foundSymbols = keySymbols.filter(symbol => 
        result4.symbols.some(s => s.name === symbol)
    );
    
    console.log(`   ✓ Key symbols found: ${foundSymbols.length}/${keySymbols.length}`);
    console.log(`   ✓ Symbols: ${foundSymbols.join(', ')}`);
    
    // Test 5: Performance comparison - with vs without error recovery
    console.log('\n⚡ Test 5: Performance comparison');
    
    const testDoc = TextDocument.create('test://perf.twbl', 'tableau', 1, largeDocumentWithErrors);
    
    // Test with error recovery (current implementation)
    const perfStart1 = performance.now();
    const perfResult1 = IncrementalParser.parseDocumentIncremental(testDoc);
    const perfEnd1 = performance.now();
    
    console.log(`   ✓ With error recovery: ${(perfEnd1 - perfStart1).toFixed(2)}ms`);
    console.log(`   ✓ Symbols: ${perfResult1.symbols.length}, Diagnostics: ${perfResult1.diagnostics.length}`);
    
    // Test 6: Cache effectiveness with errors
    console.log('\n💾 Test 6: Cache effectiveness with errors');
    
    const cacheDoc = TextDocument.create('test://cache.twbl', 'tableau', 1, complexExpression);
    
    // First parse
    const cacheStart1 = performance.now();
    const cacheResult1 = IncrementalParser.parseDocumentIncremental(cacheDoc);
    const cacheEnd1 = performance.now();
    
    // Second parse (should hit cache)
    const cacheStart2 = performance.now();
    const cacheResult2 = IncrementalParser.parseDocumentIncremental(cacheDoc);
    const cacheEnd2 = performance.now();
    
    console.log(`   ✓ First parse: ${(cacheEnd1 - cacheStart1).toFixed(2)}ms`);
    console.log(`   ✓ Second parse (cached): ${(cacheEnd2 - cacheStart2).toFixed(2)}ms`);
    console.log(`   ✓ Cache speedup: ${((cacheEnd1 - cacheStart1) / (cacheEnd2 - cacheStart2)).toFixed(1)}x`);
    
    // Test 7: Symbol lookup with errors
    console.log('\n🔍 Test 7: Symbol lookup with errors');
    
    const lookupDoc = TextDocument.create('test://lookup.twbl', 'tableau', 1, complexExpression);
    IncrementalParser.parseDocumentIncremental(lookupDoc);
    
    // Test line-based lookup
    const lookupStart = performance.now();
    let totalSymbols = 0;
    
    for (let line = 0; line < lookupDoc.lineCount; line++) {
        const lineSymbols = IncrementalParser.getSymbolsForLine(lookupDoc, line);
        totalSymbols += lineSymbols.length;
    }
    
    const lookupEnd = performance.now();
    
    console.log(`   ✓ Symbol lookup: ${(lookupEnd - lookupStart).toFixed(2)}ms`);
    console.log(`   ✓ Total symbols found: ${totalSymbols}`);
    console.log(`   ✓ Average per line: ${(totalSymbols / lookupDoc.lineCount).toFixed(1)}`);
    
    // Final performance report
    console.log('\n📈 Final Performance Report:');
    PerformanceMonitor.logReport();
    
    // Cache statistics
    const cacheStats = IncrementalParser.getCacheStats();
    console.log('\n💾 Cache Statistics:');
    console.log(`   Current size: ${cacheStats.size}`);
    console.log(`   Max size: ${cacheStats.maxSize}`);
    console.log(`   Utilization: ${((cacheStats.size / cacheStats.maxSize) * 100).toFixed(1)}%`);
    
    console.log('\n🎉 Integration Test Complete!\n');
}

/**
 * Generate a large document with various types of errors for testing
 */
function generateLargeDocumentWithErrors(): string {
    const lines: string[] = [];
    const lineCount = INCREMENTAL_PARSING_CONFIG.MIN_LINES_FOR_INCREMENTAL + 30;
    
    for (let i = 0; i < lineCount; i++) {
        if (i % 10 === 0) {
            // Add some errors every 10 lines
            const errorTypes = [
                `UNKNOWN_FUNC${i}([Sales${i}])`,  // Unknown function
                `SUM([Sales${i}] +`,  // Unclosed parenthesis
                `AVG([])`,  // Empty field reference
                `{FIXED [Customer${i}] : COUNT([Orders${i}]`,  // Unclosed LOD
                `IF [Sales${i}] > 100 THEN "High"`,  // Missing ELSE/END
            ];
            lines.push(errorTypes[i % errorTypes.length]);
        } else if (i % 7 === 0) {
            // Add complex multi-line expressions
            lines.push(`IF [Sales${i}] > 1000`);
            lines.push(`THEN SUM([Profit${i}])`);
            lines.push(`ELSE AVG([Profit${i}])`);
            lines.push(`END`);
            i += 3; // Skip next 3 iterations since we added 4 lines
        } else {
            // Add normal expressions
            const functions = ['SUM', 'AVG', 'COUNT', 'MAX', 'MIN'];
            const fields = ['Sales', 'Profit', 'Orders', 'Quantity', 'Discount'];
            
            const func = functions[i % functions.length];
            const field = fields[i % fields.length];
            
            lines.push(`${func}([${field}${i}])`);
        }
    }
    
    return lines.join('\n');
}

// Run test if this file is executed directly
if (require.main === module) {
    runIntegrationTest().catch(console.error);
}

export { runIntegrationTest };