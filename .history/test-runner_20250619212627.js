// Tableau LSP Test Runner
// This script runs the hover handler and document handling tests

const vscode = require('vscode');
const testHover = require('./test-hover');

/**
 * Activate the test runner
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    // Register the test command
    const disposable = vscode.commands.registerCommand('tableau-lsp.runTests', async () => {
        try {
            // Show notification that tests are starting
            vscode.window.showInformationMessage('Starting Tableau LSP tests...');
            
            // Run the tests
            await testHover.runTests();
            
            // Show notification that tests are complete
            vscode.window.showInformationMessage('Tableau LSP tests completed. Check test-results.log for details.');
        } catch (error) {
            // Show error notification
            vscode.window.showErrorMessage(`Test execution failed: ${error.message}`);
            console.error(error);
        }
    });
    
    context.subscriptions.push(disposable);
}

module.exports = {
    activate
};