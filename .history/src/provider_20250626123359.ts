// src/provider.ts

import {
    CancellationToken,
    DocumentSymbolParams,
    Range,
    SymbolInformation,
    WorkspaceSymbolParams,
    Diagnostic,
    DiagnosticSeverity,
    SymbolKind
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    parsedDocumentCache,
    ParsedDocument,
    Symbol,
    SymbolType,
    FUNCTION_SIGNATURES
} from './common';

// REGEX CONSTANTS - inspired by your tmLanguage file
// We use the 'g' flag to find all occurrences.
const FIELD_REGEX = /\b([A-Z_]+)\s*\(/ig;
const FUNCTION_REGEX = /\b([A-Z_]+)\s*\(/ig;
const LOD_REGEX = /\{\s*(FIXED|INCLUDE|EXCLUDE)\b/ig;
const COMMENT_LINE_REGEX = /\/\/.*/g;
const COMMENT_BLOCK_REGEX = /\/\*[\s\S]*?\*\//g;
// A convention for naming the calculation in a file
const CALC_NAME_REGEX = /\/\/\s*@name:\s*(.*)/;


/**
 * Parses a calculation document to identify all relevant symbols and perform basic validation.
 * This function provides parsing functionality.
 */
function parseDocument(document: TextDocument): ParsedDocument {
    if (parsedDocumentCache.has(document.uri)) {
        return parsedDocumentCache.get(document.uri)!;
    }

    const text = document.getText();
    const symbols: Symbol[] = [];
    const diagnostics: Diagnostic[] = [];

    // 1. Find the Calculation Name (our convention)
    const nameMatch = text.match(CALC_NAME_REGEX);
    if (nameMatch) {
        const line = text.substring(0, nameMatch.index).split('\n').length - 1;
        symbols.push({
            name: nameMatch[1].trim(),
            type: SymbolType.CalculationName,
            range: Range.create(line, 0, line, nameMatch[0].length)
        });
    }

    // 2. Find all Field and Parameter References: [Field Name]
    for (const match of text.matchAll(FIELD_REGEX)) {
        symbols.push({
            name: match[1],
            type: SymbolType.FieldReference,
            range: Range.create(document.positionAt(match.index!), document.positionAt(match.index! + match[0].length)),
        });
    }

    // 3. Find all Function Calls: FUNCTION(...)
    for (const match of text.matchAll(FUNCTION_REGEX)) {
        const functionName = match[1].toUpperCase();
        const range = Range.create(document.positionAt(match.index!), document.positionAt(match.index! + match[0].length));
        
        const symbol: Symbol = {
            name: functionName,
            type: SymbolType.FunctionCall,
            range: range
        };
        symbols.push(symbol);

        // Basic Diagnostic: Check if function is known
        const signature = FUNCTION_SIGNATURES[functionName];
        if (!signature) {
            diagnostics.push({
                message: `Unknown function: ${functionName}`,
                range: Range.create(document.positionAt(match.index!), document.positionAt(match.index! + functionName.length)),
                severity: DiagnosticSeverity.Warning,
                source: 'LSP'
            });
        }
        // NOTE: Parameter count checking is more complex and would require a proper AST.
        // This is a good place to add it later.
    }

    // 4. Find LOD Expressions: { FIXED ... }
     for (const match of text.matchAll(LOD_REGEX)) {
        symbols.push({
            name: match[1].toUpperCase(), // FIXED, INCLUDE, or EXCLUDE
            type: SymbolType.LODExpression,
            range: Range.create(document.positionAt(match.index!), document.positionAt(match.index! + match[0].length)),
        });
    }

    // TODO: Add parsing for other symbols like comments, keywords, etc. if needed.

    const parsedDoc: ParsedDocument = { document, symbols, diagnostics };
    parsedDocumentCache.set(document.uri, parsedDoc);
    return parsedDoc;
}


/**
 * Provides symbols for a single document (for Outline view and Go to Symbol).
 */
export function documentSymbolProvider(params: DocumentSymbolParams, _token?: CancellationToken): SymbolInformation[] {
    const doc = TextDocument.create(params.textDocument.uri, 'twbl', 0, ''); // We just need the URI
    const parsedDoc = parseDocument(doc); // This will need the actual document content, assuming it's managed elsewhere
    
    if (!parsedDoc) return [];

    // Convert our custom symbols to VS Code's SymbolInformation
    return parsedDoc.symbols.map(symbol => {
        let kind: SymbolKind;
        switch (symbol.type) {
            case SymbolType.CalculationName:
                kind = SymbolKind.Function; // Or Variable, represents the whole calc
                break;
            case SymbolType.FieldReference:
                kind = SymbolKind.Variable;
                break;
            case SymbolType.FunctionCall:
                kind = SymbolKind.Function;
                break;
            case SymbolType.LODExpression:
                kind = SymbolKind.Module; // No perfect match, Module is a good choice
                break;
            default:
                kind = SymbolKind.Key;
                break;
        }

        return SymbolInformation.create(symbol.name, kind, symbol.range, parsedDoc.document.uri);
    });
}


/**
 * Provides symbols across the entire workspace (for Go to Symbol in Workspace).
 * This will primarily find our named calculations.
 */
export async function workspaceSymbolProvider(params: WorkspaceSymbolParams, _token: CancellationToken): Promise<SymbolInformation[]> {
    const symbols: SymbolInformation[] = [];
    const query = params.query.toLowerCase();
    
    if (!query) return [];

    // This logic needs to be adapted to how you access workspace files.
    // For now, we'll iterate through our cache. In a real LSP, you'd scan files.
    for (const parsedDoc of parsedDocumentCache.values()) {
        const calcNameSymbol = parsedDoc.symbols.find(s => s.type === SymbolType.CalculationName);
        
        if (calcNameSymbol && calcNameSymbol.name.toLowerCase().includes(query)) {
            symbols.push(
                SymbolInformation.create(
                    calcNameSymbol.name,
                    SymbolKind.Function, // Treat the whole calc as a function
                    calcNameSymbol.range,
                    parsedDoc.document.uri
                )
            );
        }
    }
    
    return symbols;
}


/**
 * A function to get diagnostics for a document. Your language server will call this.
 */
export function getDiagnostics(document: TextDocument): Diagnostic[] {
    // In a real server, you get the document from the onDidChangeContent event
    // and call parseDocument there.
    // For simplicity, we re-parse here.
    parsedDocumentCache.delete(document.uri); // Ensure fresh parse
    const parsedDoc = parseDocument(document);
    return parsedDoc.diagnostics;
}

import { Location, Position, Range as LSRange } from 'vscode-languageserver';

// --- LSP Feature Stubs ---

/**
 * Helper: Parse twbl.d.twbl and return a map of function name → { line, signature }
 */
function parseTwblDefinitions(twblContent: string): Map<string, { line: number, signature: string }> {
    const map = new Map<string, { line: number, signature: string }>();
    const lines = twblContent.split(/\r?\n/);
    const fnSigRegex = /^([A-Z_][A-Z0-9_]*)(\s*\(.*\)\s*=>\s*\w+)/; // e.g. ABS(number: Number) => Number
    for (let i = 0; i < lines.length; ++i) {
        const m = lines[i].match(fnSigRegex);
        if (m) {
            map.set(m[1], { line: i, signature: m[0] });
        }
    }
    return map;
}

/**
 * Provide code actions (quick fixes) for diagnostics.
 */
export function provideCodeActions(params: any, document: TextDocument): any[] {
    // Only handle "Unknown function" diagnostics for now
    if (!params.context || !params.context.diagnostics) return [];
    const diagnostics = params.context.diagnostics;
    const fs = require('fs');
    const path = require('path');
    const twblPath = path.resolve(__dirname, '../syntaxes/twbl.d.twbl');
    let builtins: string[] = [];
    if (fs.existsSync(twblPath)) {
        const content = fs.readFileSync(twblPath, 'utf8');
        builtins = Array.from(parseTwblDefinitions(content).keys());
    }

    // Helper: find similar built-in function (prefix match, fallback to Levenshtein)
    function findSimilar(name: string): string | null {
        const upper = name.toUpperCase();
        const prefix = builtins.find(fn => fn.startsWith(upper));
        if (prefix) return prefix;
        // fallback: closest by length diff
        let minDist = 2, best = null;
        for (const fn of builtins) {
            if (Math.abs(fn.length - upper.length) <= minDist) {
                best = fn;
            }
        }
        return best;
    }

    const actions = [];
    for (const diag of diagnostics) {
        const m = diag.message.match(/^Unknown function: ([A-Z_][A-Z0-9_]*)$/i);
        if (m) {
            const unknown = m[1];
            const similar = findSimilar(unknown);
            if (similar) {
                actions.push({
                    title: `Replace with "${similar}"`,
                    kind: "quickfix",
                    diagnostics: [diag],
                    edit: {
                        changes: {
                            [document.uri]: [
                                {
                                    range: diag.range,
                                    newText: similar
                                }
                            ]
                        }
                    }
                });
            }
        }
    }
    return actions;
}

/**
 * Provide go-to-definition for a symbol at the given position.
 */
export function provideDefinition(params: any, document: TextDocument): any | null {
    // Get the word at the cursor
    const pos = params.position;
    const text = document.getText();
    const offset = document.offsetAt(pos);

    // Find word at offset (simple word match)
    const wordMatch = text.slice(0, offset).match(/([A-Z_][A-Z0-9_]*)$/i);
    if (!wordMatch) return null;
    const symbol = wordMatch[1].toUpperCase();

    // Try to resolve in twbl.d.twbl
    try {
        // Synchronously read twbl.d.twbl (Node.js fs)
        const fs = require('fs');
        const path = require('path');
        const twblPath = path.resolve(__dirname, '../syntaxes/twbl.d.twbl');
        if (fs.existsSync(twblPath)) {
            const content = fs.readFileSync(twblPath, 'utf8');
            const defMap = parseTwblDefinitions(content);
            if (defMap.has(symbol)) {
                const { line } = defMap.get(symbol)!;
                // Return Location in twbl.d.twbl
                return Location.create(
                    twblPath.replace(/\\/g, '/'), // VS Code expects forward slashes
                    LSRange.create(Position.create(line, 0), Position.create(line, 100))
                );
            }
        }
    } catch (e) {
        // ignore
    }

    // Fallback to user-defined symbols in the current document
    const parsedDoc = parseDocument(document);
    const found = parsedDoc.symbols.find(s => s.name.toUpperCase() === symbol);
    if (found) {
        return Location.create(
            document.uri,
            found.range
        );
    }

    return null;
}

/**
 * Provide all references to a symbol at the given position.
 */
export function provideReferences(params: any, document: TextDocument): any[] {
    const pos = params.position;
    const text = document.getText();
    const offset = document.offsetAt(pos);

    // Find word at offset (simple word match)
    const wordMatch = text.slice(0, offset).match(/([A-Z_][A-Z0-9_]*)$/i);
    if (!wordMatch) return [];
    const symbol = wordMatch[1];

    // Find all references in the document (case-insensitive, word boundary)
    const regex = new RegExp(`\\b${symbol}\\b`, 'gi');
    const locations = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        const start = document.positionAt(match.index);
        const end = document.positionAt(match.index + symbol.length);
        locations.push(Location.create(document.uri, LSRange.create(start, end)));
    }
    return locations;
}
