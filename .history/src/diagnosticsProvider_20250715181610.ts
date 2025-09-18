import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ParsedDocument, FUNCTION_SIGNATURES, SymbolType, Symbol } from './common';
import { ConditionalExpressionValidator } from './conditionalExpressionValidator';

/**
 * R2.1: Main diagnostic provider implementing comprehensive Tableau validation
 * Replaces all diagnostics for a document on each update
 */
export function getDiagnostics(document: TextDocument, parsedDocument: ParsedDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // R2.1: Add diagnostics from the parsed document (syntax errors, etc.)
    diagnostics.push(...parsedDocument.diagnostics);

    // R2.3: Add enhanced conditional expression validation
    const conditionalValidator = new ConditionalExpressionValidator();
    diagnostics.push(...conditionalValidator.validateConditionalExpressions(document, parsedDocument));

    // R2.4: Add function signature validation
    diagnostics.push(...validateFunctionSignatures(parsedDocument));
    
    // R2.2: Add document-level validations
    diagnostics.push(...validateDocumentLevel(document, parsedDocument));
    
    // R2.1: Sort diagnostics by severity and position for consistent display
    return sortDiagnostics(diagnostics);
}

/**
 * R2.4: Validate function signatures across the document
 */
function validateFunctionSignatures(parsedDocument: ParsedDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    
    function validateSymbol(symbol: Symbol): void {
        if (symbol.type === SymbolType.FunctionCall) {
            const signature = FUNCTION_SIGNATURES[symbol.name];
            if (!signature) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: symbol.range,
                    message: `Unknown function: ${symbol.name}`,
                    source: 'Tableau LSP',
                    code: 'INVALID_FUNCTION'
                });
            } else {
                // Validate parameter count if available
                const [minArgs, maxArgs] = signature;
                const argCount = symbol.arguments?.length || 0;
                
                if (argCount < minArgs || (maxArgs !== Infinity && argCount > maxArgs)) {
                    const expectedRange = maxArgs === Infinity ? `${minArgs}+` : 
                                        minArgs === maxArgs ? `${minArgs}` : `${minArgs}-${maxArgs}`;
                    
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range: symbol.range,
                        message: `Function ${symbol.name} expects ${expectedRange} arguments, got ${argCount}`,
                        source: 'Tableau LSP',
                        code: 'INVALID_FUNCTION_ARGS'
                    });
                }
            }
        }
        
        // Recursively validate children
        if (symbol.children) {
            for (const child of symbol.children) {
                validateSymbol(child);
            }
        }
    }
    
    for (const symbol of parsedDocument.symbols) {
        validateSymbol(symbol);
    }
    
    return diagnostics;
}

/**
 * R2.2: Document-level validation
 */
function validateDocumentLevel(document: TextDocument, parsedDocument: ParsedDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    
    // Check for empty document
    if (document.getText().trim().length === 0) {
        diagnostics.push({
            severity: DiagnosticSeverity.Information,
            range: Range.create(0, 0, 0, 0),
            message: 'Empty calculation. Add an expression to get started.',
            source: 'Tableau LSP',
            code: 'EMPTY_CALCULATION'
        });
    }
    
    // Complexity warnings disabled - no performance/complexity warnings for .twbl files
    // const complexity = calculateComplexity(parsedDocument.symbols);
    // if (complexity > 10) {
    //     diagnostics.push({
    //         severity: DiagnosticSeverity.Information,
    //         range: Range.create(0, 0, 0, 0),
    //         message: `Complex calculation (complexity: ${complexity}). Consider breaking into multiple calculated fields.`,
    //         source: 'Tableau LSP',
    //         code: 'HIGH_COMPLEXITY'
    //     });
    // }
    
    // Performance warnings disabled - no performance warnings for .twbl files
    // diagnostics.push(...validatePerformance(parsedDocument.symbols));
    
    return diagnostics;
}

/**
 * Calculate expression complexity score
 */
function calculateComplexity(symbols: Symbol[]): number {
    let complexity = 0;
    
    function scoreSymbol(symbol: Symbol): void {
        // Base complexity for each symbol
        complexity += 1;
        
        // Additional complexity for certain constructs
        if (symbol.name === 'IF' || symbol.name === 'CASE') {
            complexity += 2; // Conditional logic adds complexity
        }
        
        if (symbol.type === SymbolType.FunctionCall) {
            complexity += 1; // Function calls add complexity
        }
        
        if (symbol.type === SymbolType.LODExpression) {
            complexity += 3; // LOD expressions are complex
        }
        
        // Recursively score children
        if (symbol.children) {
            for (const child of symbol.children) {
                scoreSymbol(child);
            }
        }
    }
    
    for (const symbol of symbols) {
        scoreSymbol(symbol);
    }
    
    return complexity;
}

/**
 * Validate potential performance issues
 */
function validatePerformance(symbols: Symbol[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    
    function checkSymbol(symbol: Symbol): void {
        // Check for nested LOD expressions
        if (symbol.type === SymbolType.LODExpression) {
            const hasNestedLOD = symbol.children?.some(child => 
                child.type === SymbolType.LODExpression || 
                (child.children && child.children.some(grandchild => grandchild.type === SymbolType.LODExpression))
            );
            
            if (hasNestedLOD) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: symbol.range,
                    message: 'Nested LOD expressions can impact performance. Consider alternative approaches.',
                    source: 'Tableau LSP',
                    code: 'PERFORMANCE_LOD'
                });
            }
        }
        
        // Check for excessive string operations
        if (symbol.type === SymbolType.FunctionCall && 
            ['REPLACE', 'SUBSTITUTE', 'REGEXP_REPLACE'].includes(symbol.name)) {
            diagnostics.push({
                severity: DiagnosticSeverity.Information,
                range: symbol.range,
                message: `String function ${symbol.name} can be computationally expensive on large datasets.`,
                source: 'Tableau LSP',
                code: 'PERFORMANCE_STRING'
            });
        }
        
        // Recursively check children
        if (symbol.children) {
            for (const child of symbol.children) {
                checkSymbol(child);
            }
        }
    }
    
    for (const symbol of symbols) {
        checkSymbol(symbol);
    }
    
    return diagnostics;
}

/**
 * R2.1: Sort diagnostics by severity and position for consistent display
 */
function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
    return diagnostics.sort((a, b) => {
        // Sort by severity first (Error > Warning > Information > Hint)
        const severityOrder = [
            DiagnosticSeverity.Error,
            DiagnosticSeverity.Warning,
            DiagnosticSeverity.Information,
            DiagnosticSeverity.Hint
        ];
        
        const severityDiff = severityOrder.indexOf(a.severity || DiagnosticSeverity.Information) - 
                             severityOrder.indexOf(b.severity || DiagnosticSeverity.Information);
        if (severityDiff !== 0) return severityDiff;
        
        // Then sort by line number
        const lineDiff = a.range.start.line - b.range.start.line;
        if (lineDiff !== 0) return lineDiff;
        
        // Finally sort by character position
        return a.range.start.character - b.range.start.character;
    });
}
