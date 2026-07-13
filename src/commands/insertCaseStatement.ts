// src/commands/insertCaseStatement.ts

import * as vscode from 'vscode';

/**
 * R9.1: Insert CASE Statement Command (Ctrl+Shift+C)
 * 
 * Inserts a properly formatted CASE statement template at the cursor position.
 */

export async function insertCaseStatementCommand(): Promise<void> {
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
        
        // CASE statement template with placeholders
        const caseTemplate = `CASE \${1:field}
WHEN \${2:value1} THEN \${3:result1}
WHEN \${4:value2} THEN \${5:result2}
ELSE \${6:default_result}
END`;

        // Insert the template as a snippet
        await editor.insertSnippet(new vscode.SnippetString(caseTemplate), position);
        
        vscode.window.setStatusBarMessage('CASE statement inserted', 2000);
        
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to insert CASE statement: ${error}`);
        console.error('Insert CASE statement error:', error);
    }
}