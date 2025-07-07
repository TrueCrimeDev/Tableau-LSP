import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { Symbol, SymbolType } from './common';

// REGEX CONSTANTS
const FIELD_REGEX = /\[([^\]]+)\]/g;
const LOD_REGEX = /\{\s*(FIXED|INCLUDE|EXCLUDE)\b/ig;
const COMMENT_LINE_REGEX = /\/\/.*/g;
const COMMENT_BLOCK_REGEX = /\/\*[\s\S]*?\*\//g;
const KEYWORD_REGEX = /^\s*(IF|THEN|ELSEIF|ELSE|END|CASE|WHEN)\b/i;

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
    let inBlockComment = false;

    // 1. Build a line-by-line AST
    const root: Symbol = { name: 'root', type: SymbolType.CalculationName, range: Range.create(0, 0, 0, 0), children: [] };
    const blockStack: Symbol[] = [root];
    let currentBranch: Symbol | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Handle block comments
        if (trimmed.startsWith('/*')) inBlockComment = true;
        if (inBlockComment) {
            if (trimmed.endsWith('*/')) inBlockComment = false;
            continue;
        }
        if (trimmed.startsWith('//') || trimmed === '') continue;

        const keywordMatch = trimmed.match(KEYWORD_REGEX);
        let parent = blockStack[blockStack.length - 1];

        if (keywordMatch) {
            const keyword = keywordMatch[1].toUpperCase();
            const symbol: Symbol = {
                name: keyword,
                type: SymbolType.Keyword,
                range: Range.create(i, 0, i, line.length),
                parent: parent,
                children: []
            };

            if (keyword === 'IF' || keyword === 'CASE') {
                parent.children!.push(symbol);
                blockStack.push(symbol);
                currentBranch = null;
            } else if (keyword === 'THEN' || keyword === 'ELSEIF' || keyword === 'ELSE' || keyword === 'WHEN') {
                currentBranch = symbol;
                parent.children!.push(symbol);
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
            // This is a value/expression line
            const valueSymbol: Symbol = {
                name: trimmed,
                type: SymbolType.Unknown,
                range: Range.create(i, 0, i, line.length),
                parent: currentBranch || parent,
                children: []
            };
            if (currentBranch) {
                currentBranch.children!.push(valueSymbol);
            } else {
                parent.children!.push(valueSymbol);
            }
            symbols.push(valueSymbol);
        }
    }

    return { symbols: root.children!, diagnostics };
}
