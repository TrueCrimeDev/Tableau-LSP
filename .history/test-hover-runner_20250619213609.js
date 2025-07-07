// Tableau LSP Test Runner for VS Code Extension Testing Framework
// This is the entry point for the VS Code extension testing framework

const vscode = require('vscode');
const path = require('path');
const testHover = require('./test-hover');

// This will be called by the VS Code extension testing framework
exports.run = async function() {
  try {
    console.log('Starting Tableau LSP tests in VS Code extension host...');
    
    // Wait for the extension to activate
    await waitForExtensionActivation();
    
    // Run the tests
    await testHover.runTests();
    
    console.log('All tests completed successfully');
  } catch (error) {
    console.error('Test execution failed:', error);
    throw error; // Rethrow to fail the test run
  }
};

// Helper function to wait for extension activation
async function waitForExtensionActivation() {
  const extension = vscode.extensions.getExtension('TrueCrimeAudit.tableau-language-support');
  
  if (!extension) {
    throw new Error('Extension not found. Make sure the extension ID is correct.');
  }
  
  if (!extension.isActive) {
    console.log('Activating extension...');
    await extension.activate();
    console.log('Extension activated');
  } else {
    console.log('Extension is already active');
  }
  
  return extension;
}