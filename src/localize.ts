
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ParsedDocument, FUNCTION_SIGNATURES, SymbolType } from './common';

export function getDiagnostics(document: TextDocument, parsedDocument: ParsedDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Add diagnostics from the parsed document
    diagnostics.push(...parsedDocument.diagnostics);

    // Add diagnostics for function argument counts
    for (const symbol of parsedDocument.symbols) {
        if (symbol.type === SymbolType.FunctionCall) {
            const functionName = symbol.name.toUpperCase();
            const signature = FUNCTION_SIGNATURES[functionName];
            if (signature) {
                const [minArgs, maxArgs] = signature;
                const argCount = symbol.arguments?.length ?? 0;
                if (argCount < minArgs || argCount > maxArgs) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range: symbol.range,
                        message: `Function '${functionName}' expects between ${minArgs} and ${maxArgs} arguments, but got ${argCount}.`,
                        source: 'Tableau LSP'
                    });
                }
            }
        }
    }

    return diagnostics;
}
