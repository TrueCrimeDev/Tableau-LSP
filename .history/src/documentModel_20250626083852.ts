import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { TableauSymbol as Symbol, TableauSymbolType, TABLEAU_FUNCTION_SIGNATURES } from './common';

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
export function parseDocument(document: TextDocument): {
    symbols: Symbol[];
    diagnostics: Diagnostic[];
} {
    const text = document.getText();
    const symbols: Symbol[] = [];
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
        
        const symbol: Symbol = {
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

    return { symbols, diagnostics };
}