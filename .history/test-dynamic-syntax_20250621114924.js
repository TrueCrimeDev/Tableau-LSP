// Test to verify dynamic syntax parsing for IF and CASE
const fs = require('fs');
const path = require('path');

// Mock VS Code context
const mockContext = {
    extensionPath: __dirname
};

// Import our TableauProvider
const { TableauProvider } = require('./out/src/tableauProvider');

async function testDynamicSyntax() {
    console.log('Testing dynamic syntax parsing for control flow structures...\n');
    
    try {
        // Create provider instance
        const provider = new TableauProvider(mockContext);
        await provider.initialize();
        
        // Test IF symbol
        console.log('=== Testing IF Symbol ===');
        const ifSymbol = provider.getSymbol('IF');
        
        if (ifSymbol) {
            console.log('✅ IF symbol found!');
            console.log(`Name: ${ifSymbol.name}`);
            console.log(`Type: ${ifSymbol.type}`);
            console.log(`Category: ${ifSymbol.category || 'None'}`);
            console.log(`Description: ${ifSymbol.description || 'None'}`);
            
            if (ifSymbol.syntax) {
                console.log('✅ Dynamic syntax found:');
                console.log('--- Syntax ---');
                console.log(ifSymbol.syntax);
                console.log('--- End Syntax ---');
            } else {
                console.log('❌ No dynamic syntax found (still using hardcoded)');
            }
        } else {
            console.log('❌ IF symbol not found');
        }
        
        console.log('\n=== Testing CASE Symbol ===');
        const caseSymbol = provider.getSymbol('CASE');
        
        if (caseSymbol) {
            console.log('✅ CASE symbol found!');
            console.log(`Name: ${caseSymbol.name}`);
            console.log(`Type: ${caseSymbol.type}`);
            console.log(`Category: ${caseSymbol.category || 'None'}`);
            console.log(`Description: ${caseSymbol.description || 'None'}`);
            
            if (caseSymbol.syntax) {
                console.log('✅ Dynamic syntax found:');
                console.log('--- Syntax ---');
                console.log(caseSymbol.syntax);
                console.log('--- End Syntax ---');
            } else {
                console.log('❌ No dynamic syntax found');
            }
        } else {
            console.log('❌ CASE symbol not found');
        }
        
        // Test comparison with function symbols
        console.log('\n=== Comparison with Function Symbol ===');
        const sumSymbol = provider.getSymbol('SUM');
        if (sumSymbol) {
            console.log('SUM symbol (for comparison):');
            console.log(`  Name: ${sumSymbol.name}`);
            console.log(`  Type: ${sumSymbol.type}`);
            console.log(`  Parameters: ${sumSymbol.parameters ? sumSymbol.parameters.length : 0}`);
            console.log(`  Return Type: ${sumSymbol.returnType || 'None'}`);
            console.log(`  Has Syntax: ${!!sumSymbol.syntax}`);
        }
        
        // Test all symbols
        const allSymbols = provider.getAllSymbols();
        console.log(`\n📊 Total symbols loaded: ${allSymbols.length}`);
        
        // Count symbols with syntax
        const symbolsWithSyntax = allSymbols.filter(s => s.syntax);
        console.log(`🔧 Symbols with dynamic syntax: ${symbolsWithSyntax.length}`);
        
        if (symbolsWithSyntax.length > 0) {
            console.log('Symbols with syntax:');
            symbolsWithSyntax.forEach(s => {
                console.log(`  - ${s.name} (${s.type})`);
            });
        }
        
        // Clean up
        provider.dispose();
        
        console.log('\n✅ Test completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Run the test
testDynamicSyntax();
