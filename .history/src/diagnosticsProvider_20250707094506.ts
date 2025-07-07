import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ParsedDocument, FUNCTION_SIGNATURES, SymbolType, Symbol } from './common';

export function getDiagnostics(document: TextDocument, parsedDocument: ParsedDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Add diagnostics from the parsed document
    diagnostics.push(...parsedDocument.diagnostics);

    // --- New Structural and Semantic Validation ---
    function validateNode(node: Symbol) {
        // Rule: Check for unclosed blocks
        if ((node.name === 'IF' || node.name === 'CASE') && !node.end) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: node.range,
                message: `Unclosed ${node.name} block.`,
                source: 'Tableau LSP'
            });
        }

        // Rule: Check for empty ELSE branch in IF statements
        if (node.name === 'IF') {
            const elseChild = node.children?.find(c => c.name === 'ELSE');
            if (elseChild) {
                const elseIndex = node.children!.indexOf(elseChild);
                const nextSymbol = node.children![elseIndex + 1];
                if (!nextSymbol || nextSymbol.type === SymbolType.Keyword) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Warning,
                        range: elseChild.range,
                        message: `Empty ELSE branch. Consider adding a value.`,
                        source: 'Tableau LSP'
                    });
                }
            } else {
                // Rule: Check for missing ELSE branch
                const hasElseIf = node.children?.some(c => c.name === 'ELSEIF');
                if (!hasElseIf) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Warning,
                        range: node.range,
                        message: `IF block is missing an ELSE branch. This may lead to unexpected NULL values.`,
                        source: 'Tableau LSP'
                    });
                }
            }
        }

        // Recursively validate children
        if (node.children) {
            for (const child of node.children) {
                validateNode(child);
            }
        }
    }

    for (const symbol of parsedDocument.symbols) {
        validateNode(symbol);
    }
    
    return diagnostics;
}
