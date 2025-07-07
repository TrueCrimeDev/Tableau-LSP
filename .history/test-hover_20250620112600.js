// Tableau LSP Testing Script
// This script tests the hover handler and document handling features
// Modified to work with a mock VS Code API

// The vscode module will be provided by the test-runner.js
// Do not require it directly here
const path = require('path');
const fs = require('fs');

// Test configuration
const TEST_FILE = 'test-sample.twbl';
const LOG_FILE = 'test-results.log';

// Initialize logging
let logStream;

/**
 * Main test function
 */
async function runTests() {
    try {
        initLogging();
        log('Starting Tableau LSP tests...');
        
        // Open the test document
        const testDoc = await openTestDocument();
        if (!testDoc) {
            log('ERROR: Failed to open test document');
            return;
        }
        
        // Run tests
        await testHoverHandler(testDoc);
        await testDocumentHandling(testDoc);
        await testPerformance(testDoc);
        
        log('All tests completed');
    } catch (error) {
        log(`ERROR: Test execution failed: ${error.message}`);
        console.error(error);
    } finally {
        closeLogging();
    }
}

/**
 * Test the hover handler functionality
 */
async function testHoverHandler(document) {
    log('\n=== HOVER HANDLER TESTING ===');
    
    // Test cases for different symbol types
    const testCases = [
        { line: 7, character: 5, expectedType: 'function', description: 'SUM function' },
        { line: 8, character: 5, expectedType: 'function', description: 'AVG function' },
        { line: 9, character: 5, expectedType: 'function', description: 'COUNT function' },
        { line: 13, character: 5, expectedType: 'function', description: 'DATEPART function' },
        { line: 14, character: 3, expectedType: 'function', description: 'TODAY function' },
        { line: 17, character: 3, expectedType: 'function', description: 'LEN function' },
        { line: 18, character: 5, expectedType: 'function', description: 'CONTAINS function' },
        { line: 21, character: 12, expectedType: 'keyword', description: 'FIXED keyword in LOD' },
        { line: 22, character: 12, expectedType: 'keyword', description: 'INCLUDE keyword in LOD' },
        { line: 25, character: 3, expectedType: 'keyword', description: 'CASE keyword' },
        { line: 26, character: 5, expectedType: 'keyword', description: 'WHEN keyword' },
        { line: 28, character: 5, expectedType: 'keyword', description: 'ELSE keyword' },
        { line: 32, character: 3, expectedType: 'field', description: 'Field reference' },
        { line: 37, character: 5, expectedType: 'keyword', description: 'IF keyword' },
        { line: 37, character: 15, expectedType: 'operator', description: 'AND operator' }
    ];
    
    // Test each case
    for (const testCase of testCases) {
        await testHover(document, testCase);
    }
    
    // Test caching mechanism
    log('\nTesting hover cache:');
    const cacheTestCase = { line: 7, character: 5, expectedType: 'function', description: 'SUM function (cached)' };
    
    // First hover should populate cache
    const firstHoverStart = Date.now();
    await testHover(document, cacheTestCase);
    const firstHoverDuration = Date.now() - firstHoverStart;
    
    // Second hover should use cache
    const secondHoverStart = Date.now();
    await testHover(document, cacheTestCase);
    const secondHoverDuration = Date.now() - secondHoverStart;
    
    log(`First hover duration: ${firstHoverDuration}ms`);
    log(`Second hover duration: ${secondHoverDuration}ms`);
    log(`Cache performance improvement: ${Math.round((1 - secondHoverDuration/firstHoverDuration) * 100)}%`);
}

/**
 * Test a single hover case
 */
async function testHover(document, testCase) {
    try {
        // Get the global vscode object from the test runner
        const vscode = global.vscode || require('vscode');
        
        const position = new vscode.Position(testCase.line, testCase.character);
        const hoverResults = await vscode.commands.executeCommand(
            'vscode.executeHoverProvider',
            document.uri,
            position
        );
        
        if (hoverResults && hoverResults.length > 0) {
            const hover = hoverResults[0];
            const content = hover.contents[0].value;
            
            // Check if hover content contains expected type
            const hasExpectedType = content.toLowerCase().includes(testCase.expectedType.toLowerCase());
            
            log(`Hover test for ${testCase.description}: ${hasExpectedType ? 'PASS' : 'FAIL'}`);
            
            if (!hasExpectedType) {
                log(`  Expected type: ${testCase.expectedType}`);
                log(`  Actual content: ${content}`);
            }
            
            // Check for context-aware information
            const isContextAware = 
                content.includes('Category') || 
                content.includes('Returns') || 
                content.includes('Used in') ||
                content.includes('Parameters');
                
            log(`  Context-aware information: ${isContextAware ? 'YES' : 'NO'}`);
            
            return { success: hasExpectedType, content };
        } else {
            log(`Hover test for ${testCase.description}: FAIL (No hover results)`);
            return { success: false };
        }
    } catch (error) {
        log(`ERROR in hover test for ${testCase.description}: ${error.message}`);
        return { success: false, error };
    }
}

/**
 * Test document handling functionality
 */
async function testDocumentHandling(document) {
    log('\n=== DOCUMENT HANDLING TESTING ===');
    
    // Test symbol recognition
    await testSymbolRecognition(document);
    
    // Test multi-line expression parsing
    await testMultiLineExpressions(document);
    
    // Test validation rules
    await testValidationRules(document);
    
    // Test document model updates
    await testDocumentModelUpdates(document);
}

/**
 * Test symbol recognition in the document
 */
async function testSymbolRecognition(document) {
    log('\nTesting symbol recognition:');
    
    try {
        // Get the global vscode object from the test runner
        const vscode = global.vscode || require('vscode');
        
        const symbols = await vscode.commands.executeCommand(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        );
        
        if (symbols && symbols.length > 0) {
            log(`Found ${symbols.length} symbols in document`);
            
            // Count symbol types
            const symbolTypes = {};
            for (const symbol of symbols) {
                const type = symbol.kind.toString();
                symbolTypes[type] = (symbolTypes[type] || 0) + 1;
            }
            
            // Log symbol type counts
            for (const [type, count] of Object.entries(symbolTypes)) {
                log(`  ${type}: ${count}`);
            }
            
            return { success: true, symbolCount: symbols.length };
        } else {
            log('FAIL: No symbols found in document');
            return { success: false };
        }
    } catch (error) {
        log(`ERROR in symbol recognition test: ${error.message}`);
        return { success: false, error };
    }
}

/**
 * Test multi-line expression parsing
 */
async function testMultiLineExpressions(document) {
    log('\nTesting multi-line expression parsing:');
    
    // Test cases for multi-line expressions
    const multiLineExpressions = [
        { startLine: 36, endLine: 42, type: 'if', description: 'Complex IF statement' },
        { startLine: 24, endLine: 29, type: 'case', description: 'CASE statement' }
    ];
    
    for (const expr of multiLineExpressions) {
        try {
            // Get the global vscode object from the test runner
            const vscode = global.vscode || require('vscode');
            
            // Check if the expression is recognized as a symbol
            const symbols = await vscode.commands.executeCommand(
                'vscode.executeDocumentSymbolProvider',
                document.uri
            );
            
            // Find a symbol that spans the expression lines
            const matchingSymbol = symbols.find(s => 
                s.range.start.line <= expr.startLine && 
                s.range.end.line >= expr.endLine
            );
            
            if (matchingSymbol) {
                log(`Multi-line expression test for ${expr.description}: PASS`);
                log(`  Spans lines ${expr.startLine}-${expr.endLine}`);
            } else {
                log(`Multi-line expression test for ${expr.description}: FAIL (Not recognized as a symbol)`);
            }
        } catch (error) {
            log(`ERROR in multi-line expression test for ${expr.description}: ${error.message}`);
        }
    }
}

/**
 * Test validation rules
 */
async function testValidationRules(document) {
    log('\nTesting validation rules:');
    
    try {
        // Get the global vscode object from the test runner
        const vscode = global.vscode || require('vscode');
        
        // Get diagnostics for the document
        const diagnostics = vscode.languages.getDiagnostics(document.uri);
        
        if (diagnostics && diagnostics.length > 0) {
            log(`Found ${diagnostics.length} diagnostics in document`);
            
            // Log first few diagnostics
            const maxToShow = Math.min(diagnostics.length, 5);
            for (let i = 0; i < maxToShow; i++) {
                const diag = diagnostics[i];
                log(`  Line ${diag.range.start.line}: ${diag.message}`);
            }
            
            if (diagnostics.length > maxToShow) {
                log(`  ... and ${diagnostics.length - maxToShow} more`);
            }
        } else {
            log('No diagnostics found (document is valid)');
        }
        
        return { success: true, diagnosticCount: diagnostics.length };
    } catch (error) {
        log(`ERROR in validation rules test: ${error.message}`);
        return { success: false, error };
    }
}

/**
 * Test document model updates
 */
async function testDocumentModelUpdates(document) {
    log('\nTesting document model updates:');
    
    try {
        // Get the global vscode object from the test runner
        const vscode = global.vscode || require('vscode');
        
        // Get initial symbols
        const initialSymbols = await vscode.commands.executeCommand(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        );
        
        const initialCount = initialSymbols ? initialSymbols.length : 0;
        log(`Initial symbol count: ${initialCount}`);
        
        // Make an edit to the document
        const edit = new vscode.WorkspaceEdit();
        const position = new vscode.Position(document.lineCount, 0);
        edit.insert(document.uri, position, '\n// New comment\nSUM([New Field])\n');
        
        await vscode.workspace.applyEdit(edit);
        log('Added new content to document');
        
        // Wait for the document model to update
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Get updated symbols
        const updatedSymbols = await vscode.commands.executeCommand(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        );
        
        const updatedCount = updatedSymbols ? updatedSymbols.length : 0;
        log(`Updated symbol count: ${updatedCount}`);
        
        // Check if new symbols were added
        const symbolsAdded = updatedCount > initialCount;
        log(`Document model updated correctly: ${symbolsAdded ? 'PASS' : 'FAIL'}`);
        
        // Revert the changes
        const revertEdit = new vscode.WorkspaceEdit();
        const range = new vscode.Range(
            document.lineCount - 3,
            0,
            document.lineCount,
            0
        );
        revertEdit.delete(document.uri, range);
        
        await vscode.workspace.applyEdit(revertEdit);
        log('Reverted changes to document');
        
        return { success: symbolsAdded };
    } catch (error) {
        log(`ERROR in document model update test: ${error.message}`);
        return { success: false, error };
    }
}

/**
 * Test performance
 */
async function testPerformance(document) {
    log('\n=== PERFORMANCE TESTING ===');
    
    // Test hover performance with and without caching
    await testHoverPerformance(document);
    
    // Test document model performance with large document
    await testDocumentModelPerformance(document);
}

/**
 * Test hover performance
 */
async function testHoverPerformance(document) {
    log('\nTesting hover performance:');
    
    // Get the global vscode object from the test runner
    const vscode = global.vscode || require('vscode');
    
    // Test positions
    const positions = [
        new vscode.Position(7, 5),   // SUM
        new vscode.Position(8, 5),   // AVG
        new vscode.Position(13, 5),  // DATEPART
        new vscode.Position(17, 3),  // LEN
        new vscode.Position(25, 3)   // CASE
    ];
    
    // First run - no cache
    log('First run (no cache):');
    const firstRunTimes = [];
    
    for (const position of positions) {
        const start = Date.now();
        await vscode.commands.executeCommand(
            'vscode.executeHoverProvider',
            document.uri,
            position
        );
        const duration = Date.now() - start;
        firstRunTimes.push(duration);
        log(`  Position (${position.line},${position.character}): ${duration}ms`);
    }
    
    // Second run - with cache
    log('Second run (with cache):');
    const secondRunTimes = [];
    
    for (const position of positions) {
        const start = Date.now();
        await vscode.commands.executeCommand(
            'vscode.executeHoverProvider',
            document.uri,
            position
        );
        const duration = Date.now() - start;
        secondRunTimes.push(duration);
        log(`  Position (${position.line},${position.character}): ${duration}ms`);
    }
    
    // Calculate average improvement
    const avgFirstRun = firstRunTimes.reduce((sum, time) => sum + time, 0) / firstRunTimes.length;
    const avgSecondRun = secondRunTimes.reduce((sum, time) => sum + time, 0) / secondRunTimes.length;
    const improvement = Math.round((1 - avgSecondRun/avgFirstRun) * 100);
    
    log(`Average first run: ${avgFirstRun.toFixed(2)}ms`);
    log(`Average second run: ${avgSecondRun.toFixed(2)}ms`);
    log(`Average cache performance improvement: ${improvement}%`);
}

/**
 * Test document model performance with large document
 */
async function testDocumentModelPerformance(document) {
    log('\nTesting document model performance with large document:');
    
    try {
        // Get the global vscode object from the test runner
        const vscode = global.vscode || require('vscode');
        
        // Create a temporary large document
        const largeDocUri = vscode.Uri.file(path.join(path.dirname(document.uri.fsPath), 'temp-large.twbl'));
        
        // Generate large document content
        let content = '// Large test document\n\n';
        
        // Add many expressions
        for (let i = 0; i < 100; i++) {
            content += `// Expression ${i}\n`;
            content += `SUM([Sales ${i}])\n`;
            content += `AVG([Profit ${i}])\n`;
            content += `IF [Value ${i}] > 100 THEN "High" ELSE "Low" END\n\n`;
        }
        
        // Create the document
        const edit = new vscode.WorkspaceEdit();
        edit.createFile(largeDocUri, { overwrite: true });
        await vscode.workspace.applyEdit(edit);
        
        // Write content to the file
        fs.writeFileSync(largeDocUri.fsPath, content);
        
        // Open the document
        const largeDoc = await vscode.workspace.openTextDocument(largeDocUri);
        
        // Measure time to parse document
        const startParse = Date.now();
        await vscode.commands.executeCommand(
            'vscode.executeDocumentSymbolProvider',
            largeDoc.uri
        );
        const parseDuration = Date.now() - startParse;
        
        log(`Time to parse large document (${largeDoc.lineCount} lines): ${parseDuration}ms`);
        
        // Clean up
        const deleteEdit = new vscode.WorkspaceEdit();
        deleteEdit.deleteFile(largeDocUri, { ignoreIfNotExists: true });
        await vscode.workspace.applyEdit(deleteEdit);
        
        return { success: true, parseDuration };
    } catch (error) {
        log(`ERROR in document model performance test: ${error.message}`);
        return { success: false, error };
    }
}

/**
 * Open the test document
 */
async function openTestDocument() {
    try {
        // Get the global vscode object from the test runner
        const vscode = global.vscode || require('vscode');
        
        // Get the workspace folder
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            log('ERROR: No workspace folder found');
            return null;
        }
        
        const workspaceFolder = workspaceFolders[0];
        const testFilePath = path.join(workspaceFolder.uri.fsPath, TEST_FILE);
        
        // Check if the test file exists
        if (!fs.existsSync(testFilePath)) {
            log(`ERROR: Test file not found: ${testFilePath}`);
            return null;
        }
        
        // Open the document
        const document = await vscode.workspace.openTextDocument(testFilePath);
        await vscode.window.showTextDocument(document);
        
        log(`Opened test document: ${TEST_FILE}`);
        return document;
    } catch (error) {
        log(`ERROR opening test document: ${error.message}`);
        return null;
    }
}

/**
 * Initialize logging
 */
function initLogging() {
    try {
        // Get the global vscode object from the test runner
        const vscode = global.vscode || require('vscode');
        
        // Get the workspace folder
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            console.error('No workspace folder found');
            return;
        }
        
        const workspaceFolder = workspaceFolders[0];
        const logFilePath = path.join(workspaceFolder.uri.fsPath, LOG_FILE);
        
        // Create log file
        logStream = fs.createWriteStream(logFilePath, { flags: 'w' });
        console.log(`Log file created at: ${logFilePath}`);
    } catch (error) {
        console.error('Error initializing logging:', error);
    }
}

/**
 * Log a message to the console and log file
 */
function log(message) {
    console.log(message);
    if (logStream) {
        logStream.write(message + '\n');
    }
}

/**
 * Close the log file
 */
function closeLogging() {
    if (logStream) {
        logStream.end();
    }
}

module.exports = {
    runTests
};