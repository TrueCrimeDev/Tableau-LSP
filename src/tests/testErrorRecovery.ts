// src/tests/testErrorRecovery.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver';
import { ErrorRecovery } from '../errorRecovery';
import { SymbolType } from '../common';
import { PerformanceMonitor } from '../performanceMonitor';

/**
 * Comprehensive test suite for error recovery functionality
 */
async function testErrorRecovery() {
    console.log('🛡️  Starting Error Recovery Tests\n');
    
    // Enable performance monitoring
    PerformanceMonitor.setEnabled(true);
    PerformanceMonitor.clearMetrics();
    
    let totalTests = 0;
    let passedTests = 0;
    
    // Test 1: Graceful fallback for unknown functions
    console.log('🔧 Test 1: Unknown function handling');
    try {
        const doc = createTestDocument('UNKNOWN_FUNCTION([Sales]) + ANOTHER_UNKNOWN([Profit])');
        const result = ErrorRecovery.parseWithErrorRecovery(doc);
        
        const hasUnknownFunc = result.symbols.some(s => s.name === 'UNKNOWN_FUNCTION');
        const hasAnotherUnknown = result.symbols.some(s => s.name === 'ANOTHER_UNKNOWN');
        
        if (hasUnknownFunc && hasAnotherUnknown) {
            console.log('   ✓ Unknown functions handled gracefully');
            console.log(`   ✓ Found ${result.symbols.length} symbols, ${result.diagnostics.length} diagnostics`);
            passedTests++;
        } else {
            console.log('   ✗ Unknown functions not handled properly');
        }
        totalTests++;
    } catch (error) {
        console.log('   ✗ Test failed with error:', error);
        totalTests++;
    }
    
    // Test 2: Multi-line expression parsing
    console.log('\n📝 Test 2: Multi-line expression parsing');
    try {
        const multiLineDoc = createTestDocument(`
IF [Sales] > 1000 
THEN 
    CASE [Region]
    WHEN "North" THEN "High North"
    WHEN "South" THEN "High South"
    ELSE "High Other"
    END
ELSEIF [Sales] > 500
THEN "Medium"
ELSE "Low"
END
        `.trim());
        
        const result = ErrorRecovery.parseWithErrorRecovery(multiLineDoc);
        
        const hasIF = result.symbols.some(s => s.name === 'IF');
        const hasCASE = result.symbols.some(s => s.name === 'CASE');
        const whenCount = result.symbols.filter(s => s.name === 'WHEN').length;
        const hasELSEIF = result.symbols.some(s => s.name === 'ELSEIF');
        
        if (hasIF && hasCASE && whenCount === 2 && hasELSEIF) {
            console.log('   ✓ Multi-line expressions parsed correctly');
            console.log(`   ✓ Found IF, CASE, ${whenCount} WHEN statements, ELSEIF`);
            
            // Check for false positive "incomplete" errors
            const incompleteErrors = result.diagnostics.filter(d => 
                d.message.toLowerCase().includes('incomplete') && 
                d.severity === DiagnosticSeverity.Error
            );
            
            if (incompleteErrors.length === 0) {
                console.log('   ✓ No false positive "incomplete" errors');
                passedTests++;
            } else {
                console.log(`   ✗ Found ${incompleteErrors.length} false positive incomplete errors`);
            }
        } else {
            console.log('   ✗ Multi-line expression parsing failed');
        }
        totalTests++;
    } catch (error) {
        console.log('   ✗ Test failed with error:', error);
        totalTests++;
    }
    
    // Test 3: Logical operators vs function calls
    console.log('\n🔀 Test 3: Logical operators recognition');
    try {
        const logicalDoc = createTestDocument('[Sales] > 100 AND [Profit] > 0 OR NOT [Discount] > 0.1 AND [Category] IN ("A", "B")');
        const result = ErrorRecovery.parseWithErrorRecovery(logicalDoc);
        
        const logicalOperators = result.symbols.filter(s => 
            ['AND', 'OR', 'NOT', 'IN'].includes(s.name) && s.type === SymbolType.Keyword
        );
        
        const falseFunctionCalls = result.symbols.filter(s => 
            ['AND', 'OR', 'NOT', 'IN'].includes(s.name) && s.type === SymbolType.FunctionCall
        );
        
        if (logicalOperators.length >= 4 && falseFunctionCalls.length === 0) {
            console.log('   ✓ Logical operators recognized correctly');
            console.log(`   ✓ Found ${logicalOperators.length} logical operators as keywords`);
            console.log('   ✓ No logical operators misclassified as functions');
            passedTests++;
        } else {
            console.log(`   ✗ Logical operator recognition failed: ${logicalOperators.length} keywords, ${falseFunctionCalls.length} false functions`);
        }
        totalTests++;
    } catch (error) {
        console.log('   ✗ Test failed with error:', error);
        totalTests++;
    }
    
    // Test 4: String literals with special characters
    console.log('\n📜 Test 4: String literal parsing');
    try {
        const stringDoc = createTestDocument(`IF [Category] = "Men's Clothing & Accessories" THEN "Special" ELSE 'Normal "quoted" text' END`);
        const result = ErrorRecovery.parseWithErrorRecovery(stringDoc);
        
        const stringSymbols = result.symbols.filter(s => 
            s.text?.includes("Men's") || s.text?.includes('Normal "quoted"')
        );
        
        const stringErrors = result.diagnostics.filter(d => 
            d.severity === DiagnosticSeverity.Error && 
            d.message.toLowerCase().includes('string')
        );
        
        if (stringSymbols.length > 0 && stringErrors.length === 0) {
            console.log('   ✓ String literals with special characters parsed correctly');
            console.log(`   ✓ Found ${stringSymbols.length} string symbols`);
            console.log('   ✓ No string parsing errors');
            passedTests++;
        } else {
            console.log(`   ✗ String literal parsing failed: ${stringSymbols.length} symbols, ${stringErrors.length} errors`);
        }
        totalTests++;
    } catch (error) {
        console.log('   ✗ Test failed with error:', error);
        totalTests++;
    }
    
    // Test 5: Expression continuation tracking
    console.log('\n🔗 Test 5: Expression continuation tracking');
    try {
        const continuationDoc = createTestDocument(`
SUM([Sales]) +
AVG([Profit]) *
COUNT([Orders]) -
MIN([Discount])
        `.trim());
        
        const result = ErrorRecovery.parseWithErrorRecovery(continuationDoc);
        
        const functions = ['SUM', 'AVG', 'COUNT', 'MIN'];
        const foundFunctions = functions.filter(func => 
            result.symbols.some(s => s.name === func && s.type === SymbolType.FunctionCall)
        );
        
        if (foundFunctions.length === functions.length) {
            console.log('   ✓ Expression continuation tracked correctly');
            console.log(`   ✓ Found all ${foundFunctions.length} functions across multiple lines`);
            passedTests++;
        } else {
            console.log(`   ✗ Expression continuation failed: found ${foundFunctions.length}/${functions.length} functions`);
        }
        totalTests++;
    } catch (error) {
        console.log('   ✗ Test failed with error:', error);
        totalTests++;
    }
    
    // Test 6: Error recovery for malformed syntax
    console.log('\n🚨 Test 6: Malformed syntax recovery');
    try {
        const malformedDoc = createTestDocument('SUM([Sales] + AVG([Profit] + [] + {FIXED [Customer] : COUNT(');
        const result = ErrorRecovery.parseWithErrorRecovery(malformedDoc);
        
        const hasSymbols = result.symbols.length > 0;
        const hasRecovery = result.recoveryInfo.recoveredErrors > 0;
        const hasFallbacks = result.recoveryInfo.fallbacksUsed.length > 0;
        
        if (hasSymbols && hasRecovery) {
            console.log('   ✓ Malformed syntax handled with recovery');
            console.log(`   ✓ Found ${result.symbols.length} symbols despite errors`);
            console.log(`   ✓ Recovered from ${result.recoveryInfo.recoveredErrors}/${result.recoveryInfo.totalErrors} errors`);
            console.log(`   ✓ Used ${result.recoveryInfo.fallbacksUsed.length} fallback strategies`);
            passedTests++;
        } else {
            console.log('   ✗ Malformed syntax recovery failed');
        }
        totalTests++;
    } catch (error) {
        console.log('   ✗ Test failed with error:', error);
        totalTests++;
    }
    
    // Test 7: Context-aware parsing
    console.log('\n🎯 Test 7: Context-aware parsing');
    try {
        const contextDoc = createTestDocument(`
{FIXED [Customer] : 
    CASE [Region]
    WHEN "North" THEN SUM([Sales])
    WHEN "South" THEN AVG([Sales])
    ELSE MAX([Sales])
    END
}
        `.trim());
        
        const result = ErrorRecovery.parseWithErrorRecovery(contextDoc);
        
        const hasLOD = result.symbols.some(s => s.name === 'FIXED');
        const hasCase = result.symbols.some(s => s.name === 'CASE');
        const hasFunctions = ['SUM', 'AVG', 'MAX'].every(func => 
            result.symbols.some(s => s.name === func)
        );
        
        if (hasLOD && hasCase && hasFunctions) {
            console.log('   ✓ Context-aware parsing successful');
            console.log('   ✓ LOD expression with nested CASE statement parsed correctly');
            console.log('   ✓ All nested functions recognized');
            passedTests++;
        } else {
            console.log('   ✗ Context-aware parsing failed');
        }
        totalTests++;
    } catch (error) {
        console.log('   ✗ Test failed with error:', error);
        totalTests++;
    }
    
    // Test 8: Different formatting styles
    console.log('\n🎨 Test 8: Different formatting styles');
    try {
        const formatTests = [
            'IF[Sales]>100THEN"High"ELSE"Low"END',  // No spaces
            'IF [Sales] > 100 THEN "High" ELSE "Low" END',  // Normal
            'IF  [Sales]  >  100  THEN  "High"  ELSE  "Low"  END',  // Extra spaces
        ];
        
        let formatTestsPassed = 0;
        
        for (let i = 0; i < formatTests.length; i++) {
            const doc = createTestDocument(formatTests[i]);
            const result = ErrorRecovery.parseWithErrorRecovery(doc);
            
            const keywords = ['IF', 'THEN', 'ELSE', 'END'];
            const foundKeywords = keywords.filter(kw => 
                result.symbols.some(s => s.name === kw)
            );
            
            if (foundKeywords.length === keywords.length) {
                formatTestsPassed++;
            }
        }
        
        if (formatTestsPassed === formatTests.length) {
            console.log('   ✓ All formatting styles handled correctly');
            console.log(`   ✓ Passed ${formatTestsPassed}/${formatTests.length} format variations`);
            passedTests++;
        } else {
            console.log(`   ✗ Formatting style handling failed: ${formatTestsPassed}/${formatTests.length} passed`);
        }
        totalTests++;
    } catch (error) {
        console.log('   ✗ Test failed with error:', error);
        totalTests++;
    }
    
    // Test 9: Performance under error conditions
    console.log('\n⚡ Test 9: Performance under error conditions');
    try {
        const startTime = performance.now();
        
        // Create a document with many errors
        const errorDoc = createTestDocument(`
UNKNOWN1([Field1]) + UNKNOWN2([Field2]) + 
IF [Sales] > UNKNOWN3([Field3]
THEN UNKNOWN4([Field4]) +
CASE [Region
WHEN "North" THEN UNKNOWN5([Field5]
ELSE UNKNOWN6([Field6]
        `.trim());
        
        const result = ErrorRecovery.parseWithErrorRecovery(errorDoc);
        const endTime = performance.now();
        
        const parseTime = endTime - startTime;
        const hasSymbols = result.symbols.length > 0;
        const hasRecovery = result.recoveryInfo.recoveredErrors > 0;
        
        if (hasSymbols && hasRecovery && parseTime < 100) { // Should complete within 100ms
            console.log('   ✓ Performance maintained under error conditions');
            console.log(`   ✓ Parsed in ${parseTime.toFixed(2)}ms`);
            console.log(`   ✓ Found ${result.symbols.length} symbols with ${result.recoveryInfo.totalErrors} errors`);
            console.log(`   ✓ Recovered from ${result.recoveryInfo.recoveredErrors} errors`);
            passedTests++;
        } else {
            console.log(`   ✗ Performance test failed: ${parseTime.toFixed(2)}ms, symbols: ${hasSymbols}, recovery: ${hasRecovery}`);
        }
        totalTests++;
    } catch (error) {
        console.log('   ✗ Test failed with error:', error);
        totalTests++;
    }
    
    // Test 10: Recovery statistics accuracy
    console.log('\n📊 Test 10: Recovery statistics accuracy');
    try {
        const statsDoc = createTestDocument(`
SUM([Sales] +  // Unclosed parenthesis
UNKNOWN_FUNC([Profit]) +  // Unknown function
[] +  // Empty field
{FIXED [Customer] : AVG([Sales]  // Unclosed LOD
        `.trim());
        
        const result = ErrorRecovery.parseWithErrorRecovery(statsDoc);
        
        const hasErrors = result.recoveryInfo.totalErrors > 0;
        const hasRecovery = result.recoveryInfo.recoveredErrors > 0;
        const validRatio = result.recoveryInfo.recoveredErrors <= result.recoveryInfo.totalErrors;
        const hasFallbacks = result.recoveryInfo.fallbacksUsed.length > 0;
        
        if (hasErrors && hasRecovery && validRatio && hasFallbacks) {
            console.log('   ✓ Recovery statistics accurate');
            console.log(`   ✓ Total errors: ${result.recoveryInfo.totalErrors}`);
            console.log(`   ✓ Recovered errors: ${result.recoveryInfo.recoveredErrors}`);
            console.log(`   ✓ Fallbacks used: ${result.recoveryInfo.fallbacksUsed.length}`);
            console.log(`   ✓ Recovery rate: ${((result.recoveryInfo.recoveredErrors / result.recoveryInfo.totalErrors) * 100).toFixed(1)}%`);
            passedTests++;
        } else {
            console.log('   ✗ Recovery statistics inaccurate');
        }
        totalTests++;
    } catch (error) {
        console.log('   ✗ Test failed with error:', error);
        totalTests++;
    }
    
    // Performance report
    console.log('\n📈 Performance Report:');
    PerformanceMonitor.logReport();
    
    // Final results
    console.log(`\n🏁 Error Recovery Tests Complete!`);
    console.log(`✅ Passed: ${passedTests}/${totalTests} tests`);
    console.log(`📊 Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (passedTests === totalTests) {
        console.log('🎉 All error recovery tests passed!\n');
    } else {
        console.log(`⚠️  ${totalTests - passedTests} tests failed. Review implementation.\n`);
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
    testErrorRecovery().catch(console.error);
}

export { testErrorRecovery };