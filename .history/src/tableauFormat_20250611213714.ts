import vscode from "vscode";

const TABLEAU_MODE: vscode.DocumentSelector = { language: "twbl" };

export function registerDocumentFormatting(): vscode.Disposable {
    const disposables: vscode.Disposable[] = [];
    let registeredFormatter: vscode.Disposable | null = null;

    const onFormattingProviderChange = (change: vscode.ConfigurationChangeEvent | null) => {
        const config = vscode.workspace.getConfiguration("tableau");
        const formattingEnabled = config.get<boolean>("enableFormatting", false);
        
        if (!change || change.affectsConfiguration("tableau.enableFormatting", undefined)) {
            if (!formattingEnabled) {
                // Unregister the formatting provider
                if (registeredFormatter !== null) registeredFormatter.dispose();
                registeredFormatter = null;
            } else {
                // Register the formatting provider
                registeredFormatter ??= vscode.languages.registerDocumentRangeFormattingEditProvider(TABLEAU_MODE, {
                    provideDocumentRangeFormattingEdits,
                });
            }
        }
    };

    onFormattingProviderChange(null);
    vscode.workspace.onDidChangeConfiguration(onFormattingProviderChange, disposables);

    return {
        dispose: () => {
            for (const disposable of disposables) {
                disposable.dispose();
            }
            if (registeredFormatter !== null) registeredFormatter.dispose();
        },
    };
}

async function provideDocumentRangeFormattingEdits(
    document: vscode.TextDocument,
    range: vscode.Range,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken,
): Promise<vscode.TextEdit[] | null> {
    const text = document.getText(range);
    const formattedText = formatTableauExpression(text, options);
    
    if (formattedText === text) {
        return null; // No changes needed
    }
    
    return [new vscode.TextEdit(range, formattedText)];
}

function formatTableauExpression(text: string, options: vscode.FormattingOptions): string {
    const lines = text.split('\n');
    const formattedLines: string[] = [];
    let indentLevel = 0;
    const indent = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
    
    for (let line of lines) {
        line = line.trim();
        if (!line) {
            formattedLines.push('');
            continue;
        }
        
        // Decrease indent for END, ELSE, ELSEIF
        if (/^(END|ELSE|ELSEIF)\b/i.test(line)) {
            indentLevel = Math.max(0, indentLevel - 1);
        }
        
        // Add current indentation
        const indentedLine = indent.repeat(indentLevel) + line;
        formattedLines.push(indentedLine);
        
        // Increase indent after IF, THEN, CASE, WHEN, ELSE, ELSEIF
        if (/^(IF\b.*THEN|CASE\b|WHEN\b.*THEN|ELSE|ELSEIF\b.*THEN)/i.test(line)) {
            indentLevel++;
        }
        
        // Format common patterns
        line = formatTableauKeywords(line);
        line = formatTableauOperators(line);
        line = formatTableauFunctions(line);
    }
    
    return formattedLines.join('\n');
}

function formatTableauKeywords(text: string): string {
    // Ensure proper spacing around keywords
    text = text.replace(/\b(IF|THEN|ELSE|ELSEIF|END|CASE|WHEN|AND|OR|NOT|IN)\b/gi, (match) => match.toUpperCase());
    
    // Add space after IF, THEN, ELSE, etc.
    text = text.replace(/\b(IF|THEN|ELSE|ELSEIF|CASE|WHEN)\b(?!\s)/gi, '$1 ');
    
    // Add space before AND, OR
    text = text.replace(/(?<!\s)\b(AND|OR)\b/gi, ' $1');
    text = text.replace(/\b(AND|OR)\b(?!\s)/gi, '$1 ');
    
    return text;
}

function formatTableauOperators(text: string): string {
    // Add spaces around operators
    text = text.replace(/([<>=!]+)/g, ' $1 ');
    text = text.replace(/([+\-*/%])/g, ' $1 ');
    
    // Clean up multiple spaces
    text = text.replace(/\s+/g, ' ');
    
    return text;
}

function formatTableauFunctions(text: string): string {
    // Uppercase function names
    const functionPattern = /\b(SUM|AVG|COUNT|MIN|MAX|DATEPART|TODAY|NOW|LEN|LEFT|RIGHT|CONTAINS|ISNULL|IFNULL|ABS|ROUND|CEILING|FLOOR)\s*\(/gi;
    text = text.replace(functionPattern, (match) => match.toUpperCase());
    
    return text;
}