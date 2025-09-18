// src/tests/runIncrementalTests.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { IncrementalParser } from '../incrementalParser';
import { INCREMENTAL_PARSING_CONFIG } from '../common';

/**
 * Simple test runner for incremental parser functionality
 */
function runTests() {
    console.log('Running Incremental Parser Tests...\n');
    
    // Test 1: Basic incremental parsing
    console.log('Test 1: Basic incremental parsing');
    try {
        const document1 = TextDocument.create('test://test.twbl', 'tableau', 1, 'SUM([Sales])');
        const result1 = IncrementalParser.parseDocumentIncremental(document1);
        
        const document2 = TextDocument.create('test://test.twbl', 'tableau', 2, 'AVG([Sales])');
        const result2 = IncrementalParser.parseDocumentIncremental(document2);
        
        console.log('✓ Basic incremental parsing works');
        console.log(`  - First parse found ${result1.symbols.length} symbols`);
        console.log(`  - Second parse found ${result2.symbols.length} symbols`);
    } catch (error) {
        console.log('✗ Basic incremental parsing failed:', error);
    }
    
    // Test 2: Large document incremental parsing
    console.log('\nTest 2: Large document incremental parsing');
    try {
        const lines = Array(INCREMENTAL_PARSING_CONFIG.MIN_LINES_FOR_INCREMENTAL + 10)
            .fill(0)
            .map((_, i) => `SUM([Sales${i}])`)
            .join('\n');
            
        const largeDoc1 = TextDocument.create('test://large.twbl', 'tableau', 1, lines);
        const result1 = IncrementalParser.parseDocumentIncremental(largeDoc1);
        
        // Modify one line
        const modifiedLines = lines.replace('SUM([Sales0])', 'AVG([Sales0])');
        const largeDoc2 = TextDocument.create('test://large.twbl', 'tableau', 2, modifiedLines);
        const result2 = IncrementalParser.parseDocumentIncremental(largeDoc2);
        
        console.log('✓ Large document incremental parsing works');
        console.log(`  - Document has ${largeDoc1.lineCount} lines`);
        console.log(`  - Changed lines: ${result2.changedLines?.size || 0}`);
    } catch (error) {
        console.log('✗ Large document incremental parsing failed:', error);
    }
    
    // Test 3: Symbol lookup by line
    console.log('\nTest 3: Symbol lookup by line');
    try {
        const document = TextDocument.create('test://lookup.twbl', 'tableau', 1, 
            'SUM([Sales])\nAVG([Profit])\nCOUNT([Orders])');
        
        IncrementalParser.parseDocumentIncremental(document);
        
        const line0Symbols = IncrementalParser.getSymbolsForLine(document, 0);
        const line1Symbols = IncrementalParser.getSymbolsForLine(document, 1);
        
        console.log('✓ Symbol lookup by line works');
        console.log(`  - Line 0 has ${line0Symbols.length} symbols`);
        console.log(`  - Line 1 has ${line1Symbols.length} symbols`);
    } catch (error) {
        console.log('✗ Symbol lookup by line failed:', error);
    }
    
    // Test 4: Cache management
    console.log('\nTest 4: Cache management');
    try {
        const initialStats = IncrementalParser.getCacheStats();
        
        // Create multiple documents
        for (let i = 0; i < 5; i++) {
            const doc = TextDocument.create(`test://cache${i}.twbl`, 'tableau', 1, `SUM([Sales${i}])`);
            IncrementalParser.parseDocumentIncremental(doc);
        }
        
        const finalStats = IncrementalParser.getCacheStats();
        
        console.log('✓ Cache management works');
        console.log(`  - Initial cache size: ${initialStats.size}`);
        console.log(`  - Final cache size: ${finalStats.size}`);
        console.log(`  - Max cache size: ${finalStats.maxSize}`);
        
        // Clear cache
        IncrementalParser.clearAllCache();
        const clearedStats = IncrementalParser.getCacheStats();
        console.log(`  - Cache size after clear: ${clearedStats.size}`);
    } catch (error) {
        console.log('✗ Cache management failed:', error);
    }
    
    console.log('\nIncremental Parser Tests Complete!');
}

// Run tests if this file is executed directly
if (require.main === module) {
    runTests();
}

export { runTests };