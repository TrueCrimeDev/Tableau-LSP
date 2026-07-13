// src/commands/insertLodExpression.ts

import * as vscode from 'vscode';

/**
 * R9.1: Insert LOD Expression Command (Ctrl+Shift+L)
 * 
 * Shows a quick pick menu for different LOD expression types and inserts the selected template.
 */

export async function insertLodExpressionCommand(): Promise<void> {
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
        // Show quick pick for LOD expression types
        const lodTypes = [
            {
                label: 'FIXED',
                description: 'Fixed Level of Detail',
                detail: 'Computes values using specified dimensions, ignoring filters',
                template: '{FIXED \\${1:dimension} : \\${2:aggregate_expression}}'
            },
            {
                label: 'INCLUDE',
                description: 'Include Level of Detail',
                detail: 'Computes values using view dimensions plus specified dimensions',
                template: '{INCLUDE \\${1:dimension} : \\${2:aggregate_expression}}'
            },
            {
                label: 'EXCLUDE',
                description: 'Exclude Level of Detail',
                detail: 'Computes values using view dimensions minus specified dimensions',
                template: '{EXCLUDE \\${1:dimension} : \\${2:aggregate_expression}}'
            }
        ];

        const selectedType = await vscode.window.showQuickPick(lodTypes, {
            placeHolder: 'Select LOD expression type',
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (!selectedType) {
            return; // User cancelled
        }

        const position = editor.selection.active;
        
        // Insert the selected LOD template as a snippet
        await editor.insertSnippet(new vscode.SnippetString(selectedType.template), position);
        
        vscode.window.setStatusBarMessage(`${selectedType.label} LOD expression inserted`, 2000);
        
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to insert LOD expression: ${error}`);
        console.error('Insert LOD expression error:', error);
    }
}