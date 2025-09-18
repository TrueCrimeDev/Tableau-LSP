// src/commands/showFunctionHelp.ts

import * as vscode from 'vscode';

/**
 * R9.1: Show Function Help Command (Ctrl+Shift+H)
 * 
 * Shows help for the function at the cursor position or opens function reference.
 */

export async function showFunctionHelpCommand(): Promise<void> {
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
        const document = editor.document;
        
        // Try to get hover information at current position
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider',
            document.uri,
            position
        );

        if (hovers && hovers.length > 0) {
            // Show hover information in a webview panel
            const panel = vscode.window.createWebviewPanel(
                'tableauFunctionHelp',
                'Tableau Function Help',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            // Convert hover content to HTML
            const hoverContent = hovers[0].contents
                .map(content => {
                    if (typeof content === 'string') {
                        return content;
                    } else if ('value' in content) {
                        return content.value;
                    }
                    return '';
                })
                .join('\\n\\n');

            panel.webview.html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Tableau Function Help</title>
                    <style>
                        body {
                            font-family: var(--vscode-font-family);
                            font-size: var(--vscode-font-size);
                            color: var(--vscode-foreground);
                            background-color: var(--vscode-editor-background);
                            padding: 20px;
                            line-height: 1.6;
                        }
                        code {
                            background-color: var(--vscode-textCodeBlock-background);
                            padding: 2px 4px;
                            border-radius: 3px;
                            font-family: var(--vscode-editor-font-family);
                        }
                        pre {
                            background-color: var(--vscode-textCodeBlock-background);
                            padding: 10px;
                            border-radius: 5px;
                            overflow-x: auto;
                        }
                        h1, h2, h3 {
                            color: var(--vscode-textLink-foreground);
                        }
                    </style>
                </head>
                <body>
                    <div id="content">${hoverContent.replace(/\\n/g, '<br>')}</div>
                </body>
                </html>
            `;

            vscode.window.setStatusBarMessage('Function help displayed', 2000);
        } else {
            // No hover information available, show function reference
            await showFunctionReference();
        }
        
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to show function help: ${error}`);
        console.error('Show function help error:', error);
        
        // Fallback to function reference
        await showFunctionReference();
    }
}

/**
 * Show general function reference when specific help is not available
 */
async function showFunctionReference(): Promise<void> {
    const functionCategories = [
        {
            label: 'Aggregate Functions',
            description: 'SUM, AVG, COUNT, MAX, MIN, etc.',
            detail: 'Functions that aggregate data across multiple rows'
        },
        {
            label: 'String Functions',
            description: 'LEFT, RIGHT, MID, LEN, TRIM, etc.',
            detail: 'Functions for manipulating text and strings'
        },
        {
            label: 'Date Functions',
            description: 'DATEPART, DATEADD, DATEDIFF, etc.',
            detail: 'Functions for working with dates and times'
        },
        {
            label: 'Logical Functions',
            description: 'IF, CASE, ISNULL, etc.',
            detail: 'Functions for conditional logic and null handling'
        },
        {
            label: 'Mathematical Functions',
            description: 'ABS, ROUND, SQRT, etc.',
            detail: 'Functions for mathematical calculations'
        },
        {
            label: 'Type Conversion',
            description: 'STR, INT, FLOAT, DATE, etc.',
            detail: 'Functions for converting between data types'
        }
    ];

    const selectedCategory = await vscode.window.showQuickPick(functionCategories, {
        placeHolder: 'Select function category for help',
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (selectedCategory) {
        vscode.window.showInformationMessage(
            `${selectedCategory.label}: ${selectedCategory.detail}`,
            'Open Tableau Documentation'
        ).then(selection => {
            if (selection === 'Open Tableau Documentation') {
                vscode.env.openExternal(vscode.Uri.parse('https://help.tableau.com/current/pro/desktop/en-us/functions.htm'));
            }
        });
    }
}