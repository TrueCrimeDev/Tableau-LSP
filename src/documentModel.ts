import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { Symbol, SymbolType } from './common';
import { AdvancedErrorRecovery } from './errorRecovery';

// REGEX CONSTANTS
const FIELD_REGEX = /\[([^\]]+)\]/g;
const LOD_REGEX = /\{\s*(FIXED|INCLUDE|EXCLUDE)\b/ig;
const COMMENT_LINE_REGEX = /\/\/.*/g;
const COMMENT_BLOCK_REGEX = /\/\*[\s\S]*?\*\//g;
const KEYWORD_REGEX = /^\s*(IF|THEN|ELSEIF|ELSE|END|CASE|WHEN)\b/i;
const FUNCTION_CALL_REGEX = /\b([A-Z_][A-Z0-9_]*)\s*\(/gi;
const IIF_REGEX = /\bIIF\s*\(/gi;

// Enhanced parsing constants
const LOGICAL_OPERATORS = new Set(['AND', 'OR', 'NOT', 'IN']);
const STRING_LITERAL_REGEX = /(['"])((?:(?!\1)[^\\]|\\.)*)(\1)/g;
const OPERATOR_REGEX = /\b(AND|OR|NOT|IN)\b/gi;

/**
 * Parses a calculation document to identify all relevant symbols and perform basic validation.
 * This function performs a full parse of the document with enhanced error recovery.
 */
export function parseDocument(document: TextDocument): {
    symbols: Symbol[];
    diagnostics: Diagnostic[];
} {
    // Use the legacy parsing function for now
    const result = parseDocumentLegacy(document);
    
    // Apply advanced error recovery to the parsed result
    const errorRecovery = new AdvancedErrorRecovery();
    const recoveryDiagnostics = errorRecovery.processDocument(document, {
        symbols: result.symbols,
        diagnostics: result.diagnostics
    });
    
    return {
        symbols: result.symbols,
        diagnostics: [...result.diagnostics, ...recoveryDiagnostics]
    };
}

/**
 * Legacy parsing function for backward compatibility and fallback scenarios
 * This function performs the original parsing logic without error recovery
 */
export function parseDocumentLegacy(document: TextDocument): {
    symbols: Symbol[];
    diagnostics: Diagnostic[];
} {
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    const symbols: Symbol[] = [];
    const diagnostics: Diagnostic[] = [];

    // Enhanced parsing with multi-line expression support
    const root: Symbol = { name: 'root', type: SymbolType.CalculationName, range: Range.create(
        { line: 0, character: 0 },
        { line: 0, character: 0 }
    ), children: [] };
    const blockStack: Symbol[] = [root];
    let currentBranch: Symbol | null = null;
    let multiLineExpression = '';
    let multiLineStartLine = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip comments and empty lines, but handle multi-line expressions
        if (trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;
        if (trimmed === '') {
            // Empty line might be part of a multi-line expression
            if (multiLineExpression) {
                multiLineExpression += '\n';
            }
            continue;
        }

        const keywordMatch = trimmed.match(KEYWORD_REGEX);
        let parent = blockStack[blockStack.length - 1];

        if (keywordMatch) {
            // Process any pending multi-line expression before handling keywords
            if (multiLineExpression && multiLineStartLine >= 0) {
                const expressionSymbols = parseMultiLineExpression(multiLineExpression, multiLineStartLine);
                for (const exprSymbol of expressionSymbols) {
                    if (currentBranch) {
                        exprSymbol.parent = currentBranch;
                        currentBranch.children!.push(exprSymbol);
                    } else {
                        exprSymbol.parent = parent;
                        parent.children!.push(exprSymbol);
                    }
                    symbols.push(exprSymbol);
                }
                multiLineExpression = '';
                multiLineStartLine = -1;
            }

            const keyword = keywordMatch[1].toUpperCase();
            const symbol: Symbol = {
                name: keyword,
                type: SymbolType.Keyword,
                range: Range.create(
                    { line: i, character: 0 },
                    { line: i, character: line.length }
                ),
                parent: parent,
                children: []
            };

            if (keyword === 'IF' || keyword === 'CASE') {
                // Enhanced: Store the condition text for later validation
                const conditionText = trimmed.substring(keyword.length).trim();
                symbol.text = conditionText;
                
                // If we are currently inside a branch, treat this IF/CASE as nested
                if (currentBranch) {
                    parent = currentBranch;
                    symbol.parent = currentBranch;
                }
                parent.children!.push(symbol);
                blockStack.push(symbol);
                currentBranch = null;
            } else if (keyword === 'THEN' || keyword === 'ELSEIF' || keyword === 'ELSE' || keyword === 'WHEN') {
                currentBranch = symbol;
                parent.children!.push(symbol);
                
                // Enhanced: Store branch content for validation and parse inline expressions
                if (keyword === 'ELSEIF' || keyword === 'WHEN') {
                    const conditionText = trimmed.substring(keyword.length).trim();
                    symbol.text = conditionText;
                } else if (keyword === 'THEN' || keyword === 'ELSE') {
                    // Check if there's an expression on the same line as THEN/ELSE
                    const expressionText = trimmed.substring(keyword.length).trim();
                    if (expressionText) {
                        symbol.text = expressionText;
                        // Create an expression symbol for the inline content
                        const inlineExpression: Symbol = {
                            name: expressionText,
                            type: SymbolType.Expression,
                            range: Range.create(
                                { line: i, character: keyword.length + 1 },
                                { line: i, character: line.length }
                            ),
                            text: expressionText,
                            parent: symbol,
                            children: []
                        };
                        symbol.children!.push(inlineExpression);
                        symbols.push(inlineExpression);
                    }
                }
            } else if (keyword === 'END') {
                if (blockStack.length > 1) {
                    const block = blockStack.pop();
                    if (block) block.end = symbol;
                }
                currentBranch = null;
            } else {
                if (currentBranch) {
                    currentBranch.children!.push(symbol);
                } else {
                    parent.children!.push(symbol);
                }
            }
            symbols.push(symbol);
        } else {
            // Handle potential multi-line expressions
            if (isIncompleteExpression(trimmed)) {
                if (multiLineExpression === '') {
                    multiLineStartLine = i;
                }
                multiLineExpression += (multiLineExpression ? '\n' : '') + line;
            } else {
                // Complete expression on this line
                if (multiLineExpression) {
                    // Complete the multi-line expression
                    multiLineExpression += '\n' + line;
                    const expressionSymbols = parseMultiLineExpression(multiLineExpression, multiLineStartLine);
                    for (const exprSymbol of expressionSymbols) {
                        if (currentBranch) {
                            exprSymbol.parent = currentBranch;
                            currentBranch.children!.push(exprSymbol);
                        } else {
                            exprSymbol.parent = parent;
                            parent.children!.push(exprSymbol);
                        }
                        symbols.push(exprSymbol);
                    }
                    multiLineExpression = '';
                    multiLineStartLine = -1;
                } else {
                    // Single line expression
                    const expressionSymbols = parseExpression(line, i);
                    for (const exprSymbol of expressionSymbols) {
                        if (currentBranch) {
                            exprSymbol.parent = currentBranch;
                            currentBranch.children!.push(exprSymbol);
                        } else {
                            exprSymbol.parent = parent;
                            parent.children!.push(exprSymbol);
                        }
                        symbols.push(exprSymbol);
                    }
                }
            }
        }
    }

    // Handle any remaining multi-line expression
    if (multiLineExpression && multiLineStartLine >= 0) {
        const parent = blockStack[blockStack.length - 1];
        const expressionSymbols = parseMultiLineExpression(multiLineExpression, multiLineStartLine);
        for (const exprSymbol of expressionSymbols) {
            if (currentBranch) {
                exprSymbol.parent = currentBranch;
                currentBranch.children!.push(exprSymbol);
            } else {
                exprSymbol.parent = parent;
                parent.children!.push(exprSymbol);
            }
            symbols.push(exprSymbol);
        }
    }

    return { symbols: root.children!, diagnostics };
}

/**
 * Enhanced expression parsing to detect function calls, field references, and other symbols
 */
function parseExpression(line: string, lineNumber: number): Symbol[] {
    const symbols: Symbol[] = [];
    const trimmed = line.trim();
    
    if (!trimmed) return symbols;

    // First, remove string literals to avoid parsing their contents
    const cleanedLine = removeStringLiterals(trimmed);

    // Check for logical operators first (to avoid misclassifying as functions)
    const operatorMatches = Array.from(cleanedLine.matchAll(OPERATOR_REGEX));
    for (const match of operatorMatches) {
        if (match.index !== undefined) {
            const operatorName = match[1].toUpperCase();
            const symbol: Symbol = {
                name: operatorName,
                type: SymbolType.Keyword, // Treat logical operators as keywords
                range: Range.create(
                    { line: lineNumber, character: match.index },
                    { line: lineNumber, character: match.index + match[0].length }
                ),
                text: operatorName,
                children: []
            };
            symbols.push(symbol);
        }
    }

    // Check for function calls (excluding logical operators)
    const functionMatches = Array.from(cleanedLine.matchAll(FUNCTION_CALL_REGEX));
    for (const match of functionMatches) {
        if (match.index !== undefined) {
            const functionName = match[1].toUpperCase();
            
            // Skip if this is a logical operator
            if (LOGICAL_OPERATORS.has(functionName)) {
                continue;
            }
            
            const startChar = match.index;
            const endChar = match.index + match[0].length - 1; // Exclude the opening parenthesis
            
            const symbol: Symbol = {
                name: functionName,
                type: SymbolType.FunctionCall,
                range: Range.create(
                    { line: lineNumber, character: startChar },
                    { line: lineNumber, character: endChar }
                ),
                text: functionName,
                arguments: extractFunctionArguments(trimmed, match.index + match[1].length),
                children: []
            };
            symbols.push(symbol);
        }
    }

    // Check for field references
    const fieldMatches = Array.from(trimmed.matchAll(FIELD_REGEX));
    for (const match of fieldMatches) {
        if (match.index !== undefined) {
            const fieldName = match[1];
            const symbol: Symbol = {
                name: fieldName,
                type: SymbolType.FieldReference,
                range: Range.create(
                    { line: lineNumber, character: match.index },
                    { line: lineNumber, character: match.index + match[0].length }
                ),
                text: match[0],
                children: []
            };
            symbols.push(symbol);
        }
    }

    // Check for LOD expressions
    const lodMatches = Array.from(trimmed.matchAll(LOD_REGEX));
    for (const match of lodMatches) {
        if (match.index !== undefined) {
            const lodType = match[1].toUpperCase();
            const symbol: Symbol = {
                name: lodType,
                type: SymbolType.LODExpression,
                range: Range.create(
                    { line: lineNumber, character: match.index },
                    { line: lineNumber, character: match.index + match[0].length }
                ),
                text: match[0],
                children: []
            };
            symbols.push(symbol);
        }
    }

    // Check for string literals
    const stringMatches = Array.from(trimmed.matchAll(STRING_LITERAL_REGEX));
    for (const match of stringMatches) {
        if (match.index !== undefined) {
            const stringValue = match[0];
            const symbol: Symbol = {
                name: stringValue,
                type: SymbolType.Expression,
                range: Range.create(
                    { line: lineNumber, character: match.index },
                    { line: lineNumber, character: match.index + match[0].length }
                ),
                text: stringValue,
                children: []
            };
            symbols.push(symbol);
        }
    }

    // If no specific symbols found, create a general expression symbol for non-empty lines
    if (symbols.length === 0 && trimmed.length > 0) {
        const symbol: Symbol = {
            name: trimmed,
            type: SymbolType.Expression,
            range: Range.create(
                { line: lineNumber, character: 0 },
                { line: lineNumber, character: line.length }
            ),
            text: trimmed,
            children: []
        };
        symbols.push(symbol);
    }

    return symbols;
}

/**
 * Remove string literals from a line to avoid parsing their contents
 */
function removeStringLiterals(text: string): string {
    return text.replace(STRING_LITERAL_REGEX, (match, quote) => {
        // Replace string content with spaces to preserve positions
        return quote + ' '.repeat(match.length - 2) + quote;
    });
}

/**
 * Enhanced function argument extraction with better multi-line support
 */
function extractFunctionArguments(text: string, startPos: number): Array<{text: string, range: Range}> | undefined {
    const parenStart = text.indexOf('(', startPos);
    if (parenStart === -1) return undefined;
    
    // Find matching closing parenthesis, handling nested parentheses
    let parenCount = 1;
    let parenEnd = parenStart + 1;
    
    while (parenEnd < text.length && parenCount > 0) {
        if (text[parenEnd] === '(') parenCount++;
        else if (text[parenEnd] === ')') parenCount--;
        parenEnd++;
    }
    
    if (parenCount > 0) {
        // Unclosed parentheses - this might be a multi-line expression
        // For now, return empty arguments to avoid false errors
        return [];
    }
    
    parenEnd--; // Adjust to point to the closing parenthesis
    
    const argsText = text.substring(parenStart + 1, parenEnd).trim();
    if (!argsText) return [];
    
    // Enhanced comma-separated argument parsing that respects nested parentheses
    const args: string[] = [];
    let currentArg = '';
    let nestedParens = 0;
    let inString = false;
    let stringChar = '';
    
    for (let i = 0; i < argsText.length; i++) {
        const char = argsText[i];
        
        if (!inString && (char === '"' || char === "'")) {
            inString = true;
            stringChar = char;
        } else if (inString && char === stringChar) {
            inString = false;
            stringChar = '';
        } else if (!inString) {
            if (char === '(') nestedParens++;
            else if (char === ')') nestedParens--;
            else if (char === ',' && nestedParens === 0) {
                args.push(currentArg.trim());
                currentArg = '';
                continue;
            }
        }
        
        currentArg += char;
    }
    
    if (currentArg.trim()) {
        args.push(currentArg.trim());
    }
    
    return args.map((arg, index) => ({
        text: arg,
        range: Range.create(
            { line: 0, character: 0 }, // Simplified for now
            { line: 0, character: arg.length }
        )
    }));
}

/**
 * Check if an expression appears to be incomplete (likely continues on next line)
 */
function isIncompleteExpression(line: string): boolean {
    const trimmed = line.trim();
    
    // Check for unclosed parentheses, brackets, or braces
    let parenCount = 0;
    let bracketCount = 0;
    let braceCount = 0;
    let inString = false;
    let stringChar = '';
    
    for (const char of trimmed) {
        if (!inString && (char === '"' || char === "'")) {
            inString = true;
            stringChar = char;
        } else if (inString && char === stringChar) {
            inString = false;
            stringChar = '';
        } else if (!inString) {
            if (char === '(') parenCount++;
            else if (char === ')') parenCount--;
            else if (char === '[') bracketCount++;
            else if (char === ']') bracketCount--;
            else if (char === '{') braceCount++;
            else if (char === '}') braceCount--;
        }
    }
    
    // Expression is incomplete if there are unclosed structures
    if (parenCount > 0 || bracketCount > 0 || braceCount > 0) return true;
    
    // Check for common continuation patterns
    if (trimmed.endsWith(',') || trimmed.endsWith('+') || trimmed.endsWith('-') || 
        trimmed.endsWith('*') || trimmed.endsWith('/') || trimmed.endsWith('AND') || 
        trimmed.endsWith('OR') || trimmed.endsWith('=') || trimmed.endsWith('<') ||
        trimmed.endsWith('>') || trimmed.endsWith('<=') || trimmed.endsWith('>=') ||
        trimmed.endsWith('<>') || trimmed.endsWith('!=')) {
        return true;
    }
    
    return false;
}

/**
 * Parse a multi-line expression as a single unit
 */
function parseMultiLineExpression(expression: string, startLine: number): Symbol[] {
    const symbols: Symbol[] = [];
    const trimmedExpression = expression.trim();
    
    // Check if this is a multi-line function call
    const functionMatch = trimmedExpression.match(/^([A-Z_][A-Z0-9_]*)\s*\(/i);
    if (functionMatch && !LOGICAL_OPERATORS.has(functionMatch[1].toUpperCase())) {
        const functionName = functionMatch[1].toUpperCase();
        
        // Extract arguments from the complete multi-line expression
        const args = extractFunctionArguments(trimmedExpression, 0);
        
        const symbol: Symbol = {
            name: functionName,
            type: SymbolType.FunctionCall,
            range: Range.create(
                { line: startLine, character: 0 },
                { line: startLine + expression.split('\n').length - 1, character: expression.split('\n').slice(-1)[0].length }
            ),
            text: functionName,
            arguments: args,
            children: []
        };
        symbols.push(symbol);
    } else {
        // Parse line by line for non-function expressions
        const lines = expression.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const lineSymbols = parseExpression(lines[i], startLine + i);
            symbols.push(...lineSymbols);
        }
    }
    
    return symbols;
}

/**
 * Parse a specific range of lines from a document
 * Used by incremental parser for efficient partial parsing
 */
export function parseDocumentRange(document: TextDocument, startLine: number, endLine: number): {
    symbols: Symbol[];
    diagnostics: Diagnostic[];
} {
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    const rangeLines = lines.slice(startLine, endLine + 1);
    
    // Create a temporary document for the range
    const rangeText = rangeLines.join('\n');
    const rangeDocument = TextDocument.create(
        document.uri + '#range',
        document.languageId,
        document.version,
        rangeText
    );
    
    // Parse the range
    const result = parseDocument(rangeDocument);
    
    // Adjust symbol ranges to match the original document
    const adjustedSymbols = result.symbols.map(symbol => adjustSymbolRange(symbol, startLine));
    
    return {
        symbols: adjustedSymbols,
        diagnostics: result.diagnostics.map(diagnostic => ({
            ...diagnostic,
            range: {
                start: { line: diagnostic.range.start.line + startLine, character: diagnostic.range.start.character },
                end: { line: diagnostic.range.end.line + startLine, character: diagnostic.range.end.character }
            }
        }))
    };
}

/**
 * Adjust a symbol's range to account for line offset
 */
function adjustSymbolRange(symbol: Symbol, lineOffset: number): Symbol {
    return {
        ...symbol,
        range: Range.create(
            { line: symbol.range.start.line + lineOffset, character: symbol.range.start.character },
            { line: symbol.range.end.line + lineOffset, character: symbol.range.end.character }
        ),
        children: symbol.children ? symbol.children.map(child => adjustSymbolRange(child, lineOffset)) : undefined
    };
}

/**
 * Check if a document change affects parsing context
 * Used to determine if incremental parsing is safe
 */
export function isContextualChange(document: TextDocument, changedLines: Set<number>): boolean {
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    
    // Check if any changed line contains keywords that affect parsing context
    for (const lineNum of changedLines) {
        if (lineNum >= 0 && lineNum < lines.length) {
            const line = lines[lineNum].trim();
            
            // Keywords that affect parsing context
            if (line.match(/^\s*(IF|THEN|ELSEIF|ELSE|END|CASE|WHEN)\b/i)) {
                return true;
            }
            
            // Multi-line expressions that might affect context
            if (isIncompleteExpression(line)) {
                return true;
            }
        }
    }
    
    return false;
}