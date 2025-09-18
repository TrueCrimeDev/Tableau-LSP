// src/tests/testIncrementalParsing.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { IncrementalParser } from '../incrementalParser';
import { PerformanceMonitor } from '../performanceMonitor';
import { INCREMENTAL_PARSING_CONFIG } from '../common';

/**
 * Comprehensive test for incremental parsing functionality
 */
async function testIncrementalParsing() {
    console.log('🚀 Starting Incremental Parsing Tests\n');
    
    // Enable performance monitoring
    PerformanceMonitor.setEnabled(true);
    PerformanceMonitor.clearMetrics();
    
    // Test 1: Small document (should use full parsing)
    console.log('📝 Test 1: Small document parsing');
    const smallDoc = TextDocument.create('test://small.twbl', 'tableau', 1, 
        'IF [Sales] > 100 THEN "High" ELSE "Low" END');
    
    const smallResult = IncrementalParser.parseDocumentIncremental(smallDoc);
    console.log(`   ✓ Parsed ${smallResult.symbols.length} symbols`);
    
    // Test 2: Large document (should use incremental parsing)
    console.log('\n📊 Test 2: Large document incremental parsing');
    const largeContent = generateLargeDocument();
    const largeDoc1 = TextDocument.create('test://large.twbl', 'tableau', 1, largeContent);
    
    const largeResult1 = IncrementalParser.parseDocumentIncremental(largeDoc1);
    console.log(`   ✓ Initial parse: ${largeResult1.symbols.length} symbols, ${largeDoc1.lineCount} lines`);
    
    // Modify one line in the large document
    const modifiedContent = largeContent.replace('SUM([Sales0])', 'AVG([Sales0])');
    const largeDoc2 = TextDocument.create('test://large.twbl', 'tableau', 2, modifiedContent);
    
    const largeResult2 = IncrementalParser.parseDocumentIncremental(largeDoc2);
    console.log(`   ✓ Incremental parse: ${largeResult2.symbols.length} symbols`);
    console.log(`   ✓ Changed lines: ${largeResult2.changedLines?.size || 0}`);
    
    // Test 3: Multiple incremental changes
    console.log('\n🔄 Test 3: Multiple incremental changes');
    let currentDoc = largeDoc2;
    
    for (let i = 0; i < 5; i++) {
        const newContent = currentDoc.getText().replace(`SUM([Sales${i + 1}])`, `MAX([Sales${i + 1}])`);
        currentDoc = TextDocument.create('test://large.twbl', 'tableau', currentDoc.version + 1, newContent);
        
        const result = IncrementalParser.parseDocumentIncremental(currentDoc);
        console.log(`   ✓ Change ${i + 1}: ${result.symbols.length} symbols, ${result.changedLines?.size || 0} changed lines`);
    }
    
    // Test 4: Symbol lookup performance
    console.log('\n🔍 Test 4: Symbol lookup performance');
    const lookupDoc = TextDocument.create('test://lookup.twbl', 'tableau', 1,
        Array(100).fill(0).map((_, i) => `SUM([Field${i}])`).join('\n'));
    
    IncrementalParser.parseDocumentIncremental(lookupDoc);
    
    // Test line-based symbol lookup
    const startTime = performance.now();
    for (let line = 0; line < 100; line++) {
        const symbols = IncrementalParser.getSymbolsForLine(lookupDoc, line);
        if (line === 0) {
            console.log(`   ✓ Line 0 symbols: ${symbols.length}`);
        }
    }
    const endTime = performance.now();
    console.log(`   ✓ 100 line lookups took ${(endTime - startTime).toFixed(2)}ms`);
    
    // Test 5: Cache management
    console.log('\n💾 Test 5: Cache management');
    const initialStats = IncrementalParser.getCacheStats();
    console.log(`   Initial cache size: ${initialStats.size}`);
    
    // Create many documents to test cache management
    for (let i = 0; i < 10; i++) {
        const doc = TextDocument.create(`test://cache${i}.twbl`, 'tableau', 1, 
            `SUM([Sales${i}])\nAVG([Profit${i}])`);
        IncrementalParser.parseDocumentIncremental(doc);
    }
    
    const finalStats = IncrementalParser.getCacheStats();
    console.log(`   ✓ Final cache size: ${finalStats.size}`);
    console.log(`   ✓ Max cache size: ${finalStats.maxSize}`);
    
    // Test 6: Complex expressions
    console.log('\n🧮 Test 6: Complex expressions');
    const complexDoc = TextDocument.create('test://complex.twbl', 'tableau', 1, `
IF [Sales] > 1000 THEN
    CASE [Region]
    WHEN "North" THEN SUM([Profit])
    WHEN "South" THEN AVG([Profit])
    ELSE MAX([Profit])
    END
ELSEIF [Sales] > 500 THEN
    {FIXED [Customer] : SUM([Sales])}
ELSE
    IIF([Profit] > 0, [Profit], 0)
END
    `.trim());
    
    const complexResult = IncrementalParser.parseDocumentIncremental(complexDoc);
    console.log(`   ✓ Complex expression parsed: ${complexResult.symbols.length} symbols`);
    
    // Modify the complex expression
    const modifiedComplex = complexDoc.getText().replace('SUM([Profit])', 'COUNT([Orders])');
    const complexDoc2 = TextDocument.create('test://complex.twbl', 'tableau', 2, modifiedComplex);
    
    const complexResult2 = IncrementalParser.parseDocumentIncremental(complexDoc2);
    console.log(`   ✓ Modified complex expression: ${complexResult2.symbols.length} symbols`);
    console.log(`   ✓ Changed lines: ${complexResult2.changedLines?.size || 0}`);
    
    // Performance report
    console.log('\n📈 Performance Report:');
    PerformanceMonitor.logReport();
    
    console.log('✅ All Incremental Parsing Tests Completed!\n');
}

/**
 * Generate a large document for testing
 */
function generateLargeDocument(): string {
    const lines: string[] = [];
    const lineCount = INCREMENTAL_PARSING_CONFIG.MIN_LINES_FOR_INCREMENTAL + 20;
    
    for (let i = 0; i < lineCount; i++) {
        const functions = ['SUM', 'AVG', 'COUNT', 'MAX', 'MIN'];
        const fields = ['Sales', 'Profit', 'Orders', 'Quantity', 'Discount'];
        
        const func = functions[i % functions.length];
        const field = fields[i % fields.length];
        
        lines.push(`${func}([${field}${i}])`);
    }
    
    return lines.join('\n');
}

// Run tests if this file is executed directly
if (require.main === module) {
    testIncrementalParsing().catch(console.error);
}

export { testIncrementalParsing };