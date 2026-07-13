// src/commands/insertIfStatement.ts

import * as vscode from 'vscode';

/**
 * R9.1: Insert IF Statement Command (Ctrl+Shift+I)
 * 
 * Inserts a properly formatted IF statement template at the cursor position.
 */

export async function insertIfStatementCommand(): Promise<void> {
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
        const position = editor.selection.active;
        
        // IF statement template with placeholders
        const ifTemplate = `IF \${1:condition} THEN
    \${2:value_if_true}
ELSE
    \${3:value_if_false}
END`;

        // Insert the template as a snippet
        await editor.insertSnippet(new vscode.SnippetString(ifTemplate), position);
        
        vscode.window.setStatusBarMessage('IF statement inserted', 2000);
        
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to insert IF statement: ${error}`);
        console.error('Insert IF statement error:', error);
    }
}