// src/commands/validateExpression.ts

import * as vscode from 'vscode';

/**
 * R9.1: Validate Expression Command (Ctrl+Shift+V)
 * 
 * Triggers validation of the current Tableau expression and shows diagnostics.
 */

export async function validateExpressionCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
    }

    // Check if the current document is a Tableau file
    if (editor.document.languageId !== 'twbl') {
        vscode.window.showErrorMessage('This command can only be used in Tableau calculation files (.twbl)');
        return;
    }

    try {
        // Save the document to trigger validation
        await editor.document.save();
        
        // Get current diagnostics
        const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
        
        if (diagnostics.length === 0) {
            vscode.window.showInformationMessage('✅ No validation errors found in Tableau expression');
        } else {
            const errorCount = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
            const warningCount = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length;
            
            let message = '⚠️ Validation found: ';
            if (errorCount > 0) {
                message += `${errorCount} error${errorCount > 1 ? 's' : ''}`;
            }
            if (warningCount > 0) {
                if (errorCount > 0) message += ', ';
                message += `${warningCount} warning${warningCount > 1 ? 's' : ''}`;
            }
            
            vscode.window.showWarningMessage(message);
            
            // Show the problems panel
            await vscode.commands.executeCommand('workbench.panel.markers.view.focus');
        }
        
        vscode.window.setStatusBarMessage('Tableau expression validated', 2000);
        
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to validate expression: ${error}`);
        console.error('Validate expression error:', error);
    }
}