import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ParsedDocument, FUNCTION_SIGNATURES, SymbolType, Symbol } from './common';

interface BlockInfo {
    symbol: Symbol;
    hasElse: boolean;
}

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

    // Add diagnostics for unmatched IF/CASE blocks and missing ELSE
    const blockStack: BlockInfo[] = [];
    const keywords = parsedDocument.symbols.filter(s => s.type === SymbolType.Keyword);

    for (const keyword of keywords) {
        const keywordName = keyword.name.toUpperCase();
        if (keywordName === 'IF' || keywordName === 'CASE') {
            blockStack.push({ symbol: keyword, hasElse: false });
        } else if (keywordName === 'ELSE' || keywordName === 'ELSEIF') {
            // Mark the current IF block as having an ELSE
            if (blockStack.length > 0 && blockStack[blockStack.length - 1].symbol.name === 'IF') {
                blockStack[blockStack.length - 1].hasElse = true;
            }
        } else if (keywordName === 'END') {
            if (blockStack.length > 0) {
                const openBlock = blockStack.pop();
                // Check for missing ELSE in IF statements
                if (openBlock && openBlock.symbol.name === 'IF' && !openBlock.hasElse) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Warning,
                        range: openBlock.symbol.range,
                        message: `IF block is missing an ELSE branch. This may lead to unexpected NULL values.`,
                        source: 'Tableau LSP'
                    });
                }
            } else {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: keyword.range,
                    message: `Unmatched END keyword.`,
                    source: 'Tableau LSP'
                });
            }
        }
    }

    // Check for unclosed blocks at the end of the document
    for (const openBlockInfo of blockStack) {
        diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: openBlockInfo.symbol.range,
            message: `Unclosed ${openBlockInfo.symbol.name.toUpperCase()} block.`,
            source: 'Tableau LSP'
        });
    }

    return diagnostics;
}
