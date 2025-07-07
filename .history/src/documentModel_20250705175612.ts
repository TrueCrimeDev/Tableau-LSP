import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { Symbol, SymbolType, FUNCTION_SIGNATURES, ArgumentSymbol } from './common';

// REGEX CONSTANTS
const FIELD_REGEX = /\[([^\]]+)\]/g;
const LOD_REGEX = /\{\s*(FIXED|INCLUDE|EXCLUDE)\b/ig;
const COMMENT_LINE_REGEX = /\/\/.*/g;
const COMMENT_BLOCK_REGEX = /\/\*[\s\S]*?\*\//g;
const CALC_NAME_REGEX = /\/\/\s*@name:\s*(.*)/;
const VARIABLE_DECLARATION_REGEX = /(?:let|const)\s+([a-zA-Z0-9_]+)\s*=/g;
const JSDOC_TYPE_REGEX = /@type\s+\{([^}]+)\}/;
const FUNCTION_CALL_REGEX = /\b([A-Z_]+)\s*\(([^)]*)\)/ig;
const KEYWORD_REGEX = /\b(IF|THEN|ELSE|ELSEIF|END|CASE|WHEN)\b/ig;

/**
 * Parses a calculation document to identify all relevant symbols and perform basic validation.
 */
export function parseDocument(document: TextDocument): {
    symbols: Symbol[];
    diagnostics: Diagnostic[];
} {
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    const symbols: Symbol[] = [];
    const diagnostics: Diagnostic[] = [];

    const commentRanges: Array<{start: number, end: number}> = [];
    
    for (const match of text.matchAll(COMMENT_LINE_REGEX)) {
        commentRanges.push({ start: match.index!, end: match.index! + match[0].length });
    }
    
    for (const match of text.matchAll(COMMENT_BLOCK_REGEX)) {
        commentRanges.push({ start: match.index!, end: match.index! + match[0].length });
    }

    const isInComment = (index: number): boolean => {
        return commentRanges.some(range => index >= range.start && index < range.end);
    };

    // 1. Find Calculation Name
    const nameMatch = text.match(CALC_NAME_REGEX);
    if (nameMatch) {
        const line = text.substring(0, nameMatch.index).split('\n').length - 1;
        symbols.push({
            name: nameMatch[1].trim(),
            type: SymbolType.CalculationName,
            range: Range.create(line, 0, line, nameMatch[0].length)
        });
    }

    // 2. Find Field and Parameter References
    for (const match of text.matchAll(FIELD_REGEX)) {
        if (isInComment(match.index!)) continue;
        symbols.push({
            name: match[1],
            type: SymbolType.FieldReference,
            range: Range.create(document.positionAt(match.index!), document.positionAt(match.index! + match[0].length)),
        });
    }

    // 3. Find Function Calls and parse arguments
    for (const match of text.matchAll(FUNCTION_CALL_REGEX)) {
        if (isInComment(match.index!)) continue;
        
        const functionName = match[1].toUpperCase();
        const argsText = match[2];
        const functionNameStartIndex = match.index! + match[0].indexOf(match[1]);
        const argsStartIndex = match.index! + match[0].indexOf('(') + 1;

        const signature = FUNCTION_SIGNATURES[functionName];
        if (!signature) {
            diagnostics.push({
                message: `Unknown function: ${functionName}`,
                range: Range.create(document.positionAt(functionNameStartIndex), document.positionAt(functionNameStartIndex + functionName.length)),
                severity: DiagnosticSeverity.Warning,
                source: 'Tableau'
            });
        }

        const parsedArgs: ArgumentSymbol[] = [];
        if (argsText.trim()) {
            const args = argsText.split(',');
            let currentOffset = 0;
            for (const arg of args) {
                const argTrimmed = arg.trim();
                const argStart = argsText.indexOf(arg, currentOffset) + argsStartIndex;
                const argEnd = argStart + arg.length;
                parsedArgs.push({
                    text: argTrimmed,
                    range: Range.create(document.positionAt(argStart), document.positionAt(argEnd))
                });
                currentOffset = argsText.indexOf(arg, currentOffset) + arg.length + 1;
            }
        }

        symbols.push({
            name: functionName,
            type: SymbolType.FunctionCall,
            range: Range.create(document.positionAt(match.index!), document.positionAt(match.index! + match[0].length)),
            arguments: parsedArgs
        });
    }

    // 4. Find LOD Expressions
    for (const match of text.matchAll(LOD_REGEX)) {
        if (isInComment(match.index!)) continue;
        symbols.push({
            name: match[1].toUpperCase(),
            type: SymbolType.LODExpression,
            range: Range.create(document.positionAt(match.index!), document.positionAt(match.index! + match[0].length)),
        });
    }

    // 5. Find Variable Declarations and their JSDoc types
    for (const match of text.matchAll(VARIABLE_DECLARATION_REGEX)) {
        if (isInComment(match.index!)) continue;
        
        const varName = match[1];
        const range = Range.create(document.positionAt(match.index!), document.positionAt(match.index! + match[0].length));
        
        const startPos = document.positionAt(match.index!);
        let jsdocType: string | undefined = undefined;
        
        let lineNum = startPos.line - 1;
        while(lineNum >= 0) {
            const line = lines[lineNum].trim();
            if (line.endsWith('*/')) {
                let commentBlock = line;
                let currentLine = lineNum;
                while(currentLine > 0 && !lines[currentLine - 1].trim().startsWith('/**')) {
                    currentLine--;
                    commentBlock = lines[currentLine] + '\n' + commentBlock;
                }
                
                if (lines[currentLine-1].trim().startsWith('/**')) {
                    const typeMatch = commentBlock.match(JSDOC_TYPE_REGEX);
                    if (typeMatch) {
                        jsdocType = typeMatch[1].trim();
                    }
                }
                break;
            } else if (line) {
                break;
            }
            lineNum--;
        }

        symbols.push({
            name: varName,
            type: SymbolType.Variable,
            range: range,
            jsdocType: jsdocType
        });
    }

    return { symbols, diagnostics };
}
