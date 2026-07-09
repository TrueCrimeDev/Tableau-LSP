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
import { pathToFileURL } from 'url';
import {
    parsedDocumentCache,
    ParsedDocument,
    CachedDocument,
    Symbol,
    SymbolType,
    FUNCTION_SIGNATURES
} from './common.js';
import { FieldParser } from './fieldParser.js';
import { isCodeOffset, isDatasourceQualifier, precedingDatasource } from './fieldReferenceContext.js';

// REGEX CONSTANTS - inspired by your tmLanguage file
// We use the 'g' flag to find all occurrences.
const FIELD_REGEX = /\[([^\]]+)\]/g;
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
        if (!isCodeOffset(text, match.index ?? 0)) {
            continue;
        }
        symbols.push({
            name: match[1],
            type: SymbolType.FieldReference,
            range: Range.create(
                document.positionAt(match.index ?? 0),
                document.positionAt((match.index ?? 0) + match[0].length)
            ),
        });
    }

    // 3. Find all Function Calls: FUNCTION(...)
    for (const match of text.matchAll(FUNCTION_REGEX)) {
        const functionName = match[1].toUpperCase();
        const range = Range.create(
            document.positionAt(match.index ?? 0),
            document.positionAt((match.index ?? 0) + match[0].length)
        );
        
        const symbol: Symbol = {
            name: functionName,
            type: SymbolType.FunctionCall,
            range: range
        };
        symbols.push(symbol);

        // Basic Diagnostic: Check if function is known
        let isKnown = false;
        try {
            // Try to use JSDocParser from hoverProvider if available
            const { JSDocParser } = require('./jsdocParser');
            // Try to find the twbl.d.twbl file (same logic as hoverProvider)
            const path = require('path');
            const twblPath = JSDocParser.findDefinitionFile(__dirname);
            if (twblPath) {
                const parser = new JSDocParser(twblPath);
                isKnown = !!parser.getSymbol(functionName);
            }
        } catch (e) {
            // fallback to FUNCTION_SIGNATURES
            isKnown = !!FUNCTION_SIGNATURES[functionName];
        }
        if (!isKnown) {
            diagnostics.push({
                message: `Unknown function: ${functionName}`,
                range: Range.create(
                    document.positionAt(match.index ?? 0),
                    document.positionAt((match.index ?? 0) + functionName.length)
                ),
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
            range: Range.create(
                document.positionAt(match.index ?? 0),
                document.positionAt((match.index ?? 0) + match[0].length)
            ),
        });
    }

    // TODO: Add parsing for other symbols like comments, keywords, etc. if needed.

    // Create line symbols map for incremental parsing
    const lineSymbols = new Map<number, Symbol[]>();
    symbols.forEach(symbol => {
        const line = symbol.range.start.line;
        if (!lineSymbols.has(line)) {
            lineSymbols.set(line, []);
        }
        lineSymbols.get(line)!.push(symbol);
    });

    const cachedDoc: CachedDocument = { 
        document, 
        symbols, 
        diagnostics,
        lineSymbols,
        lastChangeVersion: document.version,
        changedLines: new Set<number>()
    };
    parsedDocumentCache.set(document.uri, cachedDoc);
    return cachedDoc;
}


function symbolKindFor(symbol: Symbol): SymbolKind {
    switch (symbol.type) {
        case SymbolType.CalculationName:
            return SymbolKind.Function; // Represents the whole calc
        case SymbolType.FieldReference:
        case SymbolType.ParameterReference:
        case SymbolType.Variable:
            return SymbolKind.Variable;
        case SymbolType.FunctionCall:
            return SymbolKind.Function;
        case SymbolType.LODExpression:
            return SymbolKind.Module; // No perfect match, Module is a good choice
        case SymbolType.Comment:
            return SymbolKind.String;
        case SymbolType.Keyword:
            // A block-opening keyword (IF/CASE/...) carries children or a matched end; a bare
            // keyword (AND, END, ...) does not.
            return (symbol.children && symbol.children.length > 0) || symbol.end
                ? SymbolKind.Module
                : SymbolKind.Operator;
        case SymbolType.Expression:
            return SymbolKind.Object;
        default:
            return SymbolKind.Key;
    }
}

/**
 * Flatten a symbol tree (including nested `.children`) into VS Code's flat SymbolInformation list.
 */
function flattenSymbols(symbols: Symbol[], documentUri: string): SymbolInformation[] {
    const result: SymbolInformation[] = [];
    for (const symbol of symbols) {
        result.push(SymbolInformation.create(symbol.name, symbolKindFor(symbol), symbol.range, documentUri));
        if (symbol.children && symbol.children.length > 0) {
            result.push(...flattenSymbols(symbol.children, documentUri));
        }
    }
    return result;
}

/**
 * Provides symbols for a single document (for Outline view and Go to Symbol).
 *
 * `document`, when supplied, is used directly instead of relying on it already being present
 * in `parsedDocumentCache` under the same URI (previously the only way this returned real
 * symbols instead of an empty placeholder parse).
 */
export function documentSymbolProvider(params: DocumentSymbolParams, _token?: CancellationToken, document?: TextDocument): SymbolInformation[] {
    const doc = document ?? TextDocument.create(params.textDocument.uri, 'twbl', 0, '');
    const parsedDoc = parseDocument(doc);

    if (!parsedDoc) return [];

    return flattenSymbols(parsedDoc.symbols, parsedDoc.document.uri);
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
        // Quick fix: insert a suggested header comment above an undocumented calc.
        if (diag.code === 'MISSING_HEADER_COMMENT' && diag.data && typeof diag.data.insertLine === 'number') {
            const header: string = diag.data.header || '// !NewCalc - Describe what this calculation returns';
            const insertLine: number = diag.data.insertLine;
            actions.push({
                title: `Add header comment:  ${header.replace(/^\/\/\s*/, '')}`,
                kind: 'quickfix',
                diagnostics: [diag],
                isPreferred: true,
                edit: {
                    changes: {
                        [document.uri]: [
                            {
                                range: {
                                    start: { line: insertLine, character: 0 },
                                    end: { line: insertLine, character: 0 }
                                },
                                newText: header + '\n'
                            }
                        ]
                    }
                }
            });
            continue;
        }

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
export function provideDefinition(
    params: any,
    document: TextDocument,
    fieldParser: FieldParser | null = null
): any | null {
    const pos = params.position;
    if (!isCodeOffset(document.getText(), document.offsetAt(pos))) {
        return null;
    }
    const fieldReference = fieldReferenceAtPosition(document, pos);
    if (fieldReference) {
        if (!fieldParser || fieldReference.isDatasourceQualifier) {
            return null;
        }
        const field = fieldParser.getField(fieldReference.name, fieldReference.datasource);
        if (field?.sourceUri && field.sourceLine !== undefined) {
            const line = Math.max(0, field.sourceLine);
            const character = Math.max(0, field.sourceCharacter ?? 0);
            return Location.create(
                field.sourceUri,
                LSRange.create(
                    Position.create(line, character),
                    Position.create(line, character + Math.max(1, field.name.length))
                )
            );
        }
        return null;
    }

    const word = identifierAtPosition(document, pos);
    if (!word) return null;
    const symbol = word.toUpperCase();

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
                    pathToFileURL(twblPath).toString(),
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
    if (!isCodeOffset(text, document.offsetAt(pos))) {
        return [];
    }
    const fieldReference = fieldReferenceAtPosition(document, pos);
    if (fieldReference) {
        if (fieldReference.isDatasourceQualifier) {
            return [];
        }
        if (fieldReference.datasource) {
            const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const qualified = new RegExp(
                `\\[${escape(fieldReference.datasource)}\\]\\s*\\.\\s*\\[${escape(fieldReference.name)}\\]`,
                'gi'
            );
            const locations = [];
            let match: RegExpExecArray | null;
            while ((match = qualified.exec(text)) !== null) {
                const relativeFieldStart = match[0].lastIndexOf('[');
                const startOffset = match.index + relativeFieldStart;
                if (!isCodeOffset(text, match.index)) {
                    continue;
                }
                locations.push(Location.create(
                    document.uri,
                    LSRange.create(
                        document.positionAt(startOffset),
                        document.positionAt(startOffset + fieldReference.name.length + 2)
                    )
                ));
            }
            return locations;
        }
        const needle = `[${fieldReference.name}]`.toLowerCase();
        const lowerText = text.toLowerCase();
        const locations = [];
        let offset = 0;
        while ((offset = lowerText.indexOf(needle, offset)) !== -1) {
            if (isCodeOffset(text, offset)) {
                const start = document.positionAt(offset);
                const end = document.positionAt(offset + needle.length);
                locations.push(Location.create(document.uri, LSRange.create(start, end)));
            }
            offset += needle.length;
        }
        return locations;
    }

    const symbol = identifierAtPosition(document, pos);
    if (!symbol) return [];

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

function fieldReferenceAtPosition(
    document: TextDocument,
    position: Position
): {
    name: string;
    start: number;
    end: number;
    isDatasourceQualifier: boolean;
    datasource?: string;
} | null {
    const lines = document.getText().split(/\r?\n/);
    if (position.line < 0 || position.line >= lines.length) {
        return null;
    }
    const line = lines[position.line];
    const documentText = document.getText();
    const lineOffset = document.offsetAt(Position.create(position.line, 0));
    const regex = /\[([^\]]+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (position.character >= start && position.character <= end &&
            isCodeOffset(documentText, lineOffset + start)) {
            return {
                name: match[1],
                start,
                end,
                isDatasourceQualifier: isDatasourceQualifier(line, end),
                datasource: precedingDatasource(line, start),
            };
        }
    }
    return null;
}

function identifierAtPosition(document: TextDocument, position: Position): string | null {
    const lines = document.getText().split(/\r?\n/);
    if (position.line < 0 || position.line >= lines.length) {
        return null;
    }
    const line = lines[position.line];
    const character = Math.min(Math.max(0, position.character), line.length);
    let start = character;
    let end = character;
    while (start > 0 && /[A-Z0-9_]/i.test(line[start - 1])) {
        start--;
    }
    while (end < line.length && /[A-Z0-9_]/i.test(line[end])) {
        end++;
    }
    return start < end ? line.slice(start, end) : null;
}
