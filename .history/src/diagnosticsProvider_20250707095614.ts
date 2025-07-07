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
            return; // Don't validate children of unclosed blocks
        }

        // Rule: Validate IF statement structure
        if (node.name === 'IF') {
            const children = node.children || [];
            let hasFinalElse = false;

            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                if (child.name === 'ELSE' || child.name === 'ELSEIF' || child.name === 'THEN') {
                    // A branch is empty if it has no children.
                    if (child.children?.length === 0) {
                        diagnostics.push({
                            severity: DiagnosticSeverity.Warning,
                            range: child.range,
                            message: `Empty ${child.name} branch. Consider adding a value.`,
                            source: 'Tableau LSP'
                        });
                    }
                }
                if (child.name === 'ELSE') {
                    hasFinalElse = true;
                }
            }

            if (!hasFinalElse) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: node.range,
                    message: `IF block is missing a final ELSE branch. This may lead to unexpected NULL values.`,
                    source: 'Tableau LSP'
                });
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
