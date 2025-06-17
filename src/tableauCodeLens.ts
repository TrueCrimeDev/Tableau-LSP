import vscode from "vscode";

import { getTableauProvider } from "./tableauLsp";

export default class TableauCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    public provideCodeLenses(document: vscode.TextDocument): vscode.ProviderResult<vscode.CodeLens[]> {
        const config = vscode.workspace.getConfiguration('tableau');
        
        // Check if code lens is globally enabled
        if (!config.get<boolean>('codeLens.enabled', true)) {
            return [];
        }
        
        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            
            // Add code lens for complex IF statements
            if (/^\s*IF\s+/i.test(line) && config.get<boolean>('codeLens.formatExpression', false)) {
                const position = new vscode.Position(lineIndex, 0);
                const range = new vscode.Range(position, position);
                codeLenses.push(
                    new vscode.CodeLens(range, {
                        title: "Format Expression",
                        command: "tableau.formatExpression",
                        arguments: [document.uri, lineIndex]
                    })
                );
            }
            
            // Add code lens for CASE statements
            if (/^\s*CASE\s+/i.test(line) && config.get<boolean>('codeLens.formatExpression', false)) {
                const position = new vscode.Position(lineIndex, 0);
                const range = new vscode.Range(position, position);
                codeLenses.push(
                    new vscode.CodeLens(range, {
                        title: "Format CASE",
                        command: "tableau.formatExpression",
                        arguments: [document.uri, lineIndex]
                    })
                );
            }
            
            // Add code lens for LOD expressions
            if (/\{.*FIXED|INCLUDE|EXCLUDE.*\}/i.test(line) && config.get<boolean>('codeLens.explainLOD', false)) {
                const position = new vscode.Position(lineIndex, 0);
                const range = new vscode.Range(position, position);
                codeLenses.push(
                    new vscode.CodeLens(range, {
                        title: "Explain LOD",
                        command: "tableau.explainLOD",
                        arguments: [document.uri, lineIndex]
                    })
                );
            }
            
            // Add code lens for aggregate functions
            if (/\b(SUM|AVG|COUNT|MIN|MAX)\s*\(/i.test(line) && config.get<boolean>('codeLens.showFunctionHelp', false)) {
                const position = new vscode.Position(lineIndex, 0);
                const range = new vscode.Range(position, position);
                codeLenses.push(
                    new vscode.CodeLens(range, {
                        title: "Show Function Help",
                        command: "tableau.showFunctionHelp",
                        arguments: [document.uri, lineIndex]
                    })
                );
            }
            
            // Add code lens for copying expressions with comments
            if (line.trim().length > 0 && !line.trim().startsWith('//') && !line.trim().startsWith('/*') && config.get<boolean>('codeLens.copyWithComment', true)) {
                const position = new vscode.Position(lineIndex, 0);
                const range = new vscode.Range(position, position);
                codeLenses.push(
                    new vscode.CodeLens(range, {
                        title: "Copy",
                        command: "tableau.copyWithComment",
                        arguments: [document.uri, lineIndex]
                    })
                );
            }
        }
        
        return codeLenses;
    }

    public refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }

    public static registerCommands(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.commands.registerCommand("tableau.formatExpression", formatTableauExpression),
            vscode.commands.registerCommand("tableau.explainLOD", explainLODExpression),
            vscode.commands.registerCommand("tableau.showFunctionHelp", showFunctionHelp),
            vscode.commands.registerCommand("tableau.copyWithComment", copyExpressionWithComment),
        );
    }
}

async function formatTableauExpression(uri: vscode.Uri, lineIndex: number) {
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);
    
    const line = document.lineAt(lineIndex);
    const range = line.range;
    
    // Simple formatting for the expression
    let text = line.text;
    text = text.replace(/\s+/g, ' '); // Normalize whitespace
    text = text.replace(/\b(IF|THEN|ELSE|ELSEIF|END|CASE|WHEN|AND|OR)\b/gi, (match) => match.toUpperCase());
    
    await editor.edit(editBuilder => {
        editBuilder.replace(range, text);
    });
}

async function explainLODExpression(uri: vscode.Uri, lineIndex: number) {
    const document = await vscode.workspace.openTextDocument(uri);
    const line = document.lineAt(lineIndex);
    const text = line.text;
    
    let explanation = "Level of Detail (LOD) Expression:\n\n";
    
    if (text.includes('FIXED')) {
        explanation += "FIXED: Computes using the specified dimensions, ignoring any filters or dimensions in the view.";
    } else if (text.includes('INCLUDE')) {
        explanation += "INCLUDE: Computes using the specified dimensions in addition to the dimensions in the view.";
    } else if (text.includes('EXCLUDE')) {
        explanation += "EXCLUDE: Computes using all dimensions in the view except the specified dimensions.";
    }
    
    vscode.window.showInformationMessage(explanation, { modal: true });
}

async function showFunctionHelp(uri: vscode.Uri, lineIndex: number) {
    const document = await vscode.workspace.openTextDocument(uri);
    const line = document.lineAt(lineIndex);
    const text = line.text;
    
    // Extract function name
    const match = /\b(SUM|AVG|COUNT|MIN|MAX|DATEPART|LEN|CONTAINS)\s*\(/i.exec(text);
    if (!match) return;
    
    const functionName = match[1].toUpperCase();
    const tableauProvider = getTableauProvider();
    
    if (tableauProvider) {
        const symbol = tableauProvider.getSymbol(functionName);
        if (symbol && symbol.description) {
            vscode.window.showInformationMessage(
                `${functionName}: ${symbol.description}`,
                { modal: true }
            );
            return;
        }
    }
    
    // Fallback descriptions
    const descriptions: Record<string, string> = {
        "SUM": "Returns the sum of all values in the expression",
        "AVG": "Returns the average of all values in the expression",
        "COUNT": "Returns the number of items in a group",
        "MIN": "Returns the minimum value",
        "MAX": "Returns the maximum value",
        "DATEPART": "Returns the specified part of a date as an integer",
        "LEN": "Returns the length of a string",
        "CONTAINS": "Returns true if the string contains the substring"
    };
    
    const description = descriptions[functionName] || "Function information not available";
    vscode.window.showInformationMessage(`${functionName}: ${description}`, { modal: true });
}

async function copyExpressionWithComment(uri: vscode.Uri, lineIndex: number) {
    const document = await vscode.workspace.openTextDocument(uri);
    const lines = document.getText().split('\n');
    const textToCopy: string[] = [];
    
    // Look for comments above the current line
    let currentIndex = lineIndex - 1;
    while (currentIndex >= 0) {
        const line = lines[currentIndex].trim();
        if (line.startsWith('//') || line.startsWith('/*') || line.includes('*/')) {
            textToCopy.unshift(lines[currentIndex]);
            currentIndex--;
        } else if (line.length === 0) {
            // Skip empty lines but don't add them to the beginning
            currentIndex--;
        } else {
            // Found a non-comment, non-empty line, stop looking
            break;
        }
    }
    
    // Add the current expression line
    textToCopy.push(lines[lineIndex]);
    
    // Copy to clipboard
    const finalText = textToCopy.join('\n');
    await vscode.env.clipboard.writeText(finalText);
    
    // Show confirmation
    vscode.window.showInformationMessage("Expression with comment copied to clipboard!");
}