// src/tableau-provider.ts

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
    TABLEAU_FUNCTION_SIGNATURES
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
 * Parses a Tableau calculation document to identify all relevant symbols and perform basic validation.
 * This function replaces the complex AHK Lexer.
 */
function parseDocument(document: TextDocument): ParsedTableauDocument {
    if (parsedDocumentCache.has(document.uri)) {
        return parsedDocumentCache.get(document.uri)!;
    }

    const text = document.getText();
    const symbols: TableauSymbol[] = [];
    const diagnostics: Diagnostic[] = [];

    // 1. Find the Calculation Name (our convention)
    const nameMatch = text.match(CALC_NAME_REGEX);
    if (nameMatch) {
        const line = text.substring(0, nameMatch.index).split('\n').length - 1;
        symbols.push({
            name: nameMatch[1].trim(),
            type: TableauSymbolType.CalculationName,
            range: Range.create(line, 0, line, nameMatch[0].length)
        });
    }

    // 2. Find all Field and Parameter References: [Field Name]
    for (const match of text.matchAll(FIELD_REGEX)) {
        symbols.push({
            name: match[1],
            type: TableauSymbolType.FieldReference,
            range: Range.create(document.positionAt(match.index!), document.positionAt(match.index! + match[0].length)),
        });
    }

    // 3. Find all Function Calls: FUNCTION(...)
    for (const match of text.matchAll(FUNCTION_REGEX)) {
        const functionName = match[1].toUpperCase();
        const range = Range.create(document.positionAt(match.index!), document.positionAt(match.index! + match[0].length));
        
        const symbol: TableauSymbol = {
            name: functionName,
            type: TableauSymbolType.FunctionCall,
            range: range
        };
        symbols.push(symbol);

        // Basic Diagnostic: Check if function is known
        const signature = TABLEAU_FUNCTION_SIGNATURES[functionName];
        if (!signature) {
            diagnostics.push({
                message: `Unknown function: ${functionName}`,
                range: Range.create(document.positionAt(match.index!), document.positionAt(match.index! + functionName.length)),
                severity: DiagnosticSeverity.Warning,
                source: 'Tableau'
            });
        }
        // NOTE: Parameter count checking is more complex and would require a proper AST.
        // This is a good place to add it later.
    }

    // 4. Find LOD Expressions: { FIXED ... }
     for (const match of text.matchAll(LOD_REGEX)) {
        symbols.push({
            name: match[1].toUpperCase(), // FIXED, INCLUDE, or EXCLUDE
            type: TableauSymbolType.LODExpression,
            range: Range.create(document.positionAt(match.index!), document.positionAt(match.index! + match[0].length)),
        });
    }

    // TODO: Add parsing for other symbols like comments, keywords, etc. if needed.

    const parsedDoc: ParsedTableauDocument = { document, symbols, diagnostics };
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
            case TableauSymbolType.CalculationName:
                kind = SymbolKind.Function; // Or Variable, represents the whole calc
                break;
            case TableauSymbolType.FieldReference:
                kind = SymbolKind.Variable;
                break;
            case TableauSymbolType.FunctionCall:
                kind = SymbolKind.Function;
                break;
            case TableauSymbolType.LODExpression:
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
        const calcNameSymbol = parsedDoc.symbols.find(s => s.type === TableauSymbolType.CalculationName);
        
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