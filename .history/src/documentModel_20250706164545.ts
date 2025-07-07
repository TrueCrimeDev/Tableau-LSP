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

    // 1. Find all symbols first
    const allMatches = [
        ...Array.from(text.matchAll(FIELD_REGEX)).map(m => ({ m, type: SymbolType.FieldReference })),
        ...Array.from(text.matchAll(FUNCTION_CALL_REGEX)).map(m => ({ m, type: SymbolType.FunctionCall })),
        ...Array.from(text.matchAll(LOD_REGEX)).map(m => ({ m, type: SymbolType.LODExpression })),
        ...Array.from(text.matchAll(VARIABLE_DECLARATION_REGEX)).map(m => ({ m, type: SymbolType.Variable })),
        ...Array.from(text.matchAll(KEYWORD_REGEX)).map(m => ({ m, type: SymbolType.Keyword })),
    ].filter(item => !isInComment(item.m.index!))
     .sort((a, b) => a.m.index! - b.m.index!);

    // 2. Build a structured tree
    const root: Symbol = { name: 'root', type: SymbolType.CalculationName, range: Range.create(0, 0, 0, 0), children: [] };
    const blockStack: Symbol[] = [root];

    for (const { m, type } of allMatches) {
        const parent = blockStack[blockStack.length - 1];
        const symbol: Symbol = {
            name: (type === SymbolType.Keyword ? m[1] : m[1]).toUpperCase(),
            type: type,
            range: Range.create(document.positionAt(m.index!), document.positionAt(m.index! + m[0].length)),
            parent: parent,
            children: []
        };

        if (type === SymbolType.Keyword) {
            const keywordName = symbol.name;
            if (keywordName === 'IF' || keywordName === 'CASE') {
                parent.children!.push(symbol);
                blockStack.push(symbol);
            } else if (keywordName === 'END') {
                parent.end = symbol;
                blockStack.pop();
            } else {
                parent.children!.push(symbol);
            }
        } else {
            parent.children!.push(symbol);
        }
        symbols.push(symbol);
    }

    return { symbols: root.children!, diagnostics };
}
