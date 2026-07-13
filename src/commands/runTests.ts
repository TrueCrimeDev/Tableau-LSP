// src/commands/runTests.ts

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

/**
 * Command to run Tableau LSP tests from VS Code
 */
export function registerRunTestsCommand(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand('tableau-language-support.runTests', async () => {
    const testOptions = [
      { label: 'Run All Tests', value: 'test:all' },
      { label: 'Run Unit Tests', value: 'test:unit' },
      { label: 'Run Incremental Parsing Tests', value: 'test:incremental' },
      { label: 'Run Error Recovery Tests', value: 'test:error' },
      { label: 'Run Performance Tests', value: 'test:performance' },
      { label: 'Run Edge Case Tests', value: 'test:edge' },
      { label: 'Run Integration Tests', value: 'test:integration' }
    ];
    
    const selectedOption = await vscode.window.showQuickPick(testOptions, {
      placeHolder: 'Select which tests to run'
    });
    
    if (!selectedOption) {
      return;
    }
    
    // Create and show output channel
    const outputChannel = vscode.window.createOutputChannel('Tableau LSP Tests');
    outputChannel.show();
    
    outputChannel.appendLine(`Running ${selectedOption.label}...`);
    
    // Get extension directory
    const extensionPath = context.extensionPath;
    
    // Run the tests
    const process = cp.spawn('npm', ['run', selectedOption.value], {
      cwd: extensionPath,
      shell: true
    });
    
    // Capture output
    process.stdout.on('data', (data) => {
      outputChannel.append(data.toString());
    });
    
    process.stderr.on('data', (data) => {
      outputChannel.append(data.toString());
    });
    
    // Handle process completion
    process.on('close', (code) => {
      if (code === 0) {
        outputChannel.appendLine('\nTests completed successfully!');
        
        // Check if test report exists and offer to open it
        const reportPath = path.join(extensionPath, 'test-results', 'test-report.html');
        if (selectedOption.value === 'test:all') {
          vscode.window.showInformationMessage(
            'Tests completed successfully. Would you like to view the test report?',
            'Open Report'
          ).then((selection) => {
            if (selection === 'Open Report') {
              vscode.commands.executeCommand('tableau-language-support.openTestReport');
            }
          });
        }
      } else {
        outputChannel.appendLine(`\nTests failed with exit code ${code}`);
        vscode.window.showErrorMessage(`Tableau LSP tests failed with exit code ${code}`);
      }
    });
  });
  
  // Register command to open test report
  const openReportCommand = vscode.commands.registerCommand('tableau-language-support.openTestReport', () => {
    const reportPath = path.join(context.extensionPath, 'test-results', 'test-report.html');
    vscode.env.openExternal(vscode.Uri.file(reportPath));
  });
  
  context.subscriptions.push(command, openReportCommand);
}