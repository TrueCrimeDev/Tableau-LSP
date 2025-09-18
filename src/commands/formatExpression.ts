// src/commands/formatExpression.ts

import * as vscode from 'vscode';

/**
 * R9.1: Format Expression Command (Ctrl+Shift+F)
 * 
 * Formats the current Tableau expression or selection using the LSP formatter.
 */

export async function formatExpressionCommand(): Promise<void> {
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
        // Use VS Code's built-in format command which will use our LSP formatter
        await vscode.commands.executeCommand('editor.action.formatDocument');
        
        // Show success message
        vscode.window.setStatusBarMessage('Tableau expression formatted', 2000);
        
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to format expression: ${error}`);
        console.error('Format expression error:', error);
    }
}