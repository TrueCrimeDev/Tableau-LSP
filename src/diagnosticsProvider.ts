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
            const branches = children.filter(c => c.name === 'THEN' || c.name === 'ELSEIF' || c.name === 'ELSE');

            // Check for empty branches
            for (const branch of branches) {
                if (branch.children?.length === 0) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Warning,
                        range: branch.range,
                        message: `Empty ${branch.name} branch. Consider adding a value.`,
                        source: 'Tableau LSP'
                    });
                }
            }

            // Check for missing final ELSE
            if (branches.length > 0 && branches[branches.length - 1].name !== 'ELSE') {
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
