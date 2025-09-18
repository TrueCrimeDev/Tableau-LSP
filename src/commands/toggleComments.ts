// src/commands/toggleComments.ts

import * as vscode from 'vscode';

/**
 * R9.1: Toggle Comments Command (Ctrl+/)
 * 
 * Toggles line comments for the current line or selection in Tableau calculations.
 */

export async function toggleCommentsCommand(): Promise<void> {
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
        const document = editor.document;
        const selection = editor.selection;
        
        // Determine the range to comment/uncomment
        let startLine = selection.start.line;
        let endLine = selection.end.line;
        
        // If nothing is selected, use current line
        if (selection.isEmpty) {
            startLine = endLine = selection.active.line;
        }

        const edits: vscode.TextEdit[] = [];
        let shouldComment = false;
        
        // Check if we should comment or uncomment
        // If any line in the selection is not commented, we'll comment all lines
        for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
            const line = document.lineAt(lineNum);
            const trimmedText = line.text.trim();
            
            if (trimmedText.length > 0 && !trimmedText.startsWith('//')) {
                shouldComment = true;
                break;
            }
        }

        // Apply comment/uncomment to each line
        for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
            const line = document.lineAt(lineNum);
            const text = line.text;
            
            if (shouldComment) {
                // Add comment
                const firstNonWhitespace = text.search(/\\S/);
                if (firstNonWhitespace >= 0) {
                    const insertPosition = new vscode.Position(lineNum, firstNonWhitespace);
                    edits.push(vscode.TextEdit.insert(insertPosition, '// '));
                }
            } else {
                // Remove comment
                const commentMatch = text.match(/^(\s*)\/\/ ?/);
                if (commentMatch) {
                    const startPos = new vscode.Position(lineNum, commentMatch[1].length);
                    const endPos = new vscode.Position(lineNum, commentMatch[0].length);
                    edits.push(vscode.TextEdit.delete(new vscode.Range(startPos, endPos)));
                }
            }
        }

        // Apply all edits
        if (edits.length > 0) {
            const workspaceEdit = new vscode.WorkspaceEdit();
            workspaceEdit.set(document.uri, edits);
            await vscode.workspace.applyEdit(workspaceEdit);
            
            const action = shouldComment ? 'commented' : 'uncommented';
            const lineCount = endLine - startLine + 1;
            const lineText = lineCount === 1 ? 'line' : 'lines';
            
            vscode.window.setStatusBarMessage(`${lineCount} ${lineText} ${action}`, 2000);
        }
        
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to toggle comments: ${error}`);
        console.error('Toggle comments error:', error);
    }
}