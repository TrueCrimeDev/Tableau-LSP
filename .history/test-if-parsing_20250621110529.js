// Simple test to verify IF symbol parsing
const fs = require('fs');
const path = require('path');

// Mock VS Code context
const mockContext = {
    extensionPath: __dirname
};

// Import our TableauProvider
const { TableauProvider } = require('./out/src/tableauProvider');

async function testIFParsing() {
    console.log('Testing IF symbol parsing...');
    
    try {
        // Create provider instance
        const provider = new TableauProvider(mockContext);
        await provider.initialize();
        
        // Test IF symbol
        const ifSymbol = provider.getSymbol('IF');
        
        if (ifSymbol) {
            console.log('✅ IF symbol found!');
            console.log('Symbol details:');
            console.log(`  Name: ${ifSymbol.name}`);
            console.log(`  Type: ${ifSymbol.type}`);
            console.log(`  Category: ${ifSymbol.category || 'None'}`);
            console.log(`  Description: ${ifSymbol.description || 'None'}`);
            
            // Test other symbols for comparison
            const sumSymbol = provider.getSymbol('SUM');
            if (sumSymbol) {
                console.log('\n✅ SUM symbol found for comparison:');
                console.log(`  Name: ${sumSymbol.name}`);
                console.log(`  Type: ${sumSymbol.type}`);
                console.log(`  Category: ${sumSymbol.category || 'None'}`);
                console.log(`  Description: ${sumSymbol.description || 'None'}`);
                console.log(`  Parameters: ${sumSymbol.parameters ? sumSymbol.parameters.length : 0}`);
                console.log(`  Return Type: ${sumSymbol.returnType || 'None'}`);
            }
            
            // Test all symbols
            const allSymbols = provider.getAllSymbols();
            console.log(`\n📊 Total symbols loaded: ${allSymbols.length}`);
            
            // Count by type
            const symbolsByType = {};
            allSymbols.forEach(symbol => {
                symbolsByType[symbol.type] = (symbolsByType[symbol.type] || 0) + 1;
            });
            
            console.log('Symbol counts by type:');
            Object.entries(symbolsByType).forEach(([type, count]) => {
                console.log(`  ${type}: ${count}`);
            });
            
        } else {
            console.log('❌ IF symbol not found');
        }
        
        // Clean up
        provider.dispose();
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Run the test
testIFParsing();
