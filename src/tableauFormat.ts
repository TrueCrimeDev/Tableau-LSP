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

function provideDocumentRangeFormattingEdits(
    document: vscode.TextDocument,
    range: vscode.Range,
    options: vscode.FormattingOptions,
    _token: vscode.CancellationToken,
): vscode.TextEdit[] | null {
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
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) {
            formattedLines.push('');
            continue;
        }
        
        // Skip comments
        if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
            formattedLines.push(line);
            continue;
        }
        
        // Check if this line completes a calculation (reset indentation)
        if (isCalculationComplete(line, lines, i)) {
            indentLevel = 0;
        }
        
        // Decrease indent for END, ELSE, ELSEIF
        if (/^(END|ELSE|ELSEIF)\b/i.test(line)) {
            indentLevel = Math.max(0, indentLevel - 1);
        }
        
        // Format the line content
        line = formatTableauKeywords(line);
        line = formatTableauOperators(line);
        line = formatTableauFunctions(line);
        
        // Add current indentation
        const indentedLine = indent.repeat(indentLevel) + line;
        formattedLines.push(indentedLine);
        
        // Increase indent after IF, THEN, CASE, WHEN, ELSE, ELSEIF
        if (/^(IF\b.*THEN|CASE\b|WHEN\b.*THEN|ELSE|ELSEIF\b.*THEN)/i.test(line)) {
            indentLevel++;
        }
        
        // Reset indentation after a complete calculation ends
        if (/\bEND\s*$/i.test(line) && indentLevel === 0) {
            indentLevel = 0;
        }
    }
    
    return formattedLines.join('\n');
}

function isCalculationComplete(currentLine: string, allLines: string[], currentIndex: number): boolean {
    // Check if we're starting a new calculation (not continuation)
    const prevLine = currentIndex > 0 ? allLines[currentIndex - 1].trim() : '';
    
    // If previous line ends a calculation, this is a new one
    if (prevLine.match(/\bEND\s*$/i) || 
        prevLine.match(/^\s*\/\//) || 
        prevLine === '' ||
        currentIndex === 0) {
        return true;
    }
    
    // Check if this line starts a calculation without being a continuation
    const trimmedLine = currentLine.trim();
    
    // Simple expressions (no control flow keywords) are standalone
    if (!trimmedLine.match(/\b(IF|CASE|WHEN|THEN|ELSE|ELSEIF|END)\b/i)) {
        // Check if it's a complete expression (balanced parens/braces)
        if (isExpressionBalanced(trimmedLine)) {
            return true;
        }
    }
    
    return false;
}

function isExpressionBalanced(expression: string): boolean {
    let parenCount = 0;
    let braceCount = 0;
    let inString = false;
    let stringChar = '';
    let inComment = false;
    
    for (let i = 0; i < expression.length; i++) {
        const char = expression[i];
        const nextChar = i + 1 < expression.length ? expression[i + 1] : '';
        
        // Handle comments
        if (!inString && char === '/' && nextChar === '/') {
            inComment = true;
            continue;
        }
        if (inComment) continue;
        
        // Handle strings
        if (!inString && (char === '"' || char === "'")) {
            inString = true;
            stringChar = char;
            continue;
        }
        if (inString && char === stringChar) {
            inString = false;
            stringChar = '';
            continue;
        }
        if (inString) continue;
        
        // Count brackets
        if (char === '(') parenCount++;
        if (char === ')') parenCount--;
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
    }
    
    return parenCount === 0 && braceCount === 0;
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