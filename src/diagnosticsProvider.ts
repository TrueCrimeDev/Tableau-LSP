import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ParsedDocument, FUNCTION_SIGNATURES, SymbolType, Symbol } from './common';
import { ConditionalExpressionValidator } from './conditionalExpressionValidator';
import { AdvancedErrorRecovery } from './errorRecovery';

/**
 * R2.1: Main diagnostic provider implementing comprehensive Tableau validation
 * Replaces all diagnostics for a document on each update
 * FIXED: Re-enabled with improved false positive prevention
 */
export function getDiagnostics(document: TextDocument, parsedDocument: ParsedDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    try {
        // R2.1: Enhanced document-level validation with false positive prevention
        diagnostics.push(...validateDocumentLevel(document, parsedDocument));

        // R2.4: Enhanced function signature validation with operator recognition
        diagnostics.push(...validateFunctionSignatures(parsedDocument));

        // R2.3: Enhanced conditional expression validation
        const conditionalValidator = new ConditionalExpressionValidator();
        diagnostics.push(...conditionalValidator.validateConditionalExpressions(document, parsedDocument));

        // R2.5: Enhanced error recovery with reduced false positives
        const errorRecovery = new AdvancedErrorRecovery();
        diagnostics.push(...errorRecovery.processDocument(document, parsedDocument));

        // Sort diagnostics by severity and position
        return sortDiagnostics(diagnostics);
    } catch (error) {
        // If validation fails, log error but don't crash the extension
        console.error('Error in diagnostics provider:', error);
        return [];
    }
}

/**
 * R2.4: Validate function signatures across the document
 * FIXED: Enhanced with better operator recognition and reduced false positives
 */
function validateFunctionSignatures(parsedDocument: ParsedDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Enhanced list of logical operators and keywords that should not be flagged as unknown functions
    const logicalOperators = new Set([
        'AND', 'OR', 'NOT', 'IN', 'IS', 'LIKE', 'BETWEEN',
        'NULL', 'TRUE', 'FALSE', 'THEN', 'ELSE', 'ELSEIF', 'WHEN', 'END'
    ]);

    // Common Tableau keywords that might be parsed as functions but aren't
    const tableauKeywords = new Set([
        'FIXED', 'INCLUDE', 'EXCLUDE', 'LEVEL', 'ASC', 'DESC'
    ]);

    function validateSymbol(symbol: Symbol): void {
        if (symbol.type === SymbolType.FunctionCall) {
            // Skip validation for logical operators and keywords
            if (logicalOperators.has(symbol.name) || tableauKeywords.has(symbol.name)) {
                return;
            }

            const signature = FUNCTION_SIGNATURES[symbol.name];
            if (!signature) {
                // Only report unknown functions for things that actually look like functions
                // Skip if it might be a field reference or other construct
                if (isLikelyFunction(symbol)) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Information, // Reduced from Warning
                        range: symbol.range,
                        message: `Unknown function: ${symbol.name}. Verify function name or check if this should be a field reference.`,
                        source: 'Tableau LSP',
                        code: 'UNKNOWN_FUNCTION'
                    });
                }
            } else {
                // Enhanced parameter validation with better multi-line handling
                validateFunctionParameters(symbol, signature, diagnostics);
            }
        }

        // Recursively validate children
        if (symbol.children) {
            for (const child of symbol.children) {
                validateSymbol(child);
            }
        }
    }

    /**
     * Check if a symbol is likely a function call vs other constructs
     */
    function isLikelyFunction(symbol: Symbol): boolean {
        // If it has arguments, it's likely a function
        if (symbol.arguments && symbol.arguments.length > 0) {
            return true;
        }

        // If it's all uppercase and doesn't look like a field, it might be a function
        if (symbol.name === symbol.name.toUpperCase() && !symbol.name.includes(' ')) {
            return true;
        }

        // If it contains underscores, it might be a Tableau function
        if (symbol.name.includes('_')) {
            return true;
        }

        return false;
    }

    /**
     * Enhanced parameter validation with multi-line expression support
     */
    function validateFunctionParameters(symbol: Symbol, signature: [number, number], diagnostics: Diagnostic[]): void {
        const [minArgs, maxArgs] = signature;
        const argCount = symbol.arguments?.length || 0;

        // Skip validation in certain cases to reduce false positives:
        // 1. If we have no arguments but expect some (might be multi-line)
        if (argCount === 0 && minArgs > 0) {
            // Check if this might be a multi-line expression by looking at the symbol text
            if (symbol.text && (symbol.text.includes('\n') || symbol.text.trim().endsWith(','))) {
                return; // Skip validation for potential multi-line expressions
            }
        }

        // 2. Only validate if we have some arguments to work with
        if (argCount > 0 && (argCount < minArgs || (maxArgs !== Infinity && argCount > maxArgs))) {
            const expectedRange = maxArgs === Infinity ? `${minArgs}+` :
                                minArgs === maxArgs ? `${minArgs}` : `${minArgs}-${maxArgs}`;

            diagnostics.push({
                severity: DiagnosticSeverity.Warning, // Reduced from Error
                range: symbol.range,
                message: `Function ${symbol.name} expects ${expectedRange} arguments, got ${argCount}`,
                source: 'Tableau LSP',
                code: 'FUNCTION_ARGS_MISMATCH'
            });
        }
    }

    for (const symbol of parsedDocument.symbols) {
        validateSymbol(symbol);
    }

    return diagnostics;
}

/**
 * R2.2: Document-level validation
 * R2.3: Enhanced with performance validation
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
    
    // R2.3: Enhanced complexity warnings with higher threshold to reduce false positives
    const complexity = calculateComplexity(parsedDocument.symbols);
    if (complexity > 25) { // Increased threshold from 15 to 25
        diagnostics.push({
            severity: DiagnosticSeverity.Information,
            range: Range.create(0, 0, 0, 0),
            message: `Very complex calculation (complexity score: ${complexity}). Consider breaking into multiple calculated fields for better maintainability and performance.`,
            source: 'Tableau LSP',
            code: 'HIGH_COMPLEXITY'
        });
    }

    // R2.3: Enhanced performance validation with conservative thresholds
    diagnostics.push(...validatePerformance(parsedDocument.symbols));
    
    return diagnostics;
}

/**
 * R2.3: Calculate expression complexity score based on:
 * - Number of nested expressions
 * - Number of function calls
 * - Number of field references
 * - Presence of complex operations (LOD, table calcs)
 */
function calculateComplexity(symbols: Symbol[]): number {
    let complexity = 0;
    
    function processSymbol(symbol: Symbol, depth: number = 0): void {
        // Add complexity based on symbol type
        switch (symbol.type) {
            case SymbolType.FunctionCall:
                // More weight for complex functions
                const complexFunctions = ['WINDOW_SUM', 'WINDOW_AVG', 'LOOKUP', 'FIXED', 'INCLUDE', 'EXCLUDE'];
                complexity += complexFunctions.includes(symbol.name) ? 3 : 1;
                break;
            case SymbolType.LODExpression:
                // LOD expressions are inherently complex
                complexity += 5;
                break;
            case SymbolType.FieldReference:
                // Field references add minimal complexity
                complexity += 0.5;
                break;
        }
        
        // Add complexity for nesting depth
        complexity += depth * 0.5;
        
        // Process children recursively with increased depth
        if (symbol.children) {
            for (const child of symbol.children) {
                processSymbol(child, depth + 1);
            }
        }
        
        // Process function arguments
        if (symbol.arguments) {
            for (const arg of symbol.arguments) {
                // Add complexity for argument length
                complexity += arg.text.length > 50 ? 1 : 0.2;
            }
        }
    }
    
    // Process all top-level symbols
    for (const symbol of symbols) {
        processSymbol(symbol);
    }
    
    // Return rounded complexity score
    return Math.round(complexity);
}

/**
 * R2.3: Validate potential performance issues in Tableau expressions
 * Identifies:
 * - Excessive nesting depth
 * - Complex calculations that could be simplified
 * - Inefficient patterns that could impact performance
 * - Provides optimization suggestions
 */
function validatePerformance(symbols: Symbol[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    
    // Track max nesting depth
    let maxNestingDepth = 0;
    
    // Track complex patterns
    const complexPatterns: {
        pattern: string;
        range: Range;
        suggestion: string;
    }[] = [];
    
    function analyzeSymbol(symbol: Symbol, depth: number = 0): void {
        // Update max nesting depth
        maxNestingDepth = Math.max(maxNestingDepth, depth);
        
        // Check for specific performance patterns
        if (symbol.type === SymbolType.FunctionCall) {
            // Pattern 1: Nested aggregations without LOD
            if (isAggregateFunction(symbol.name)) {
                checkNestedAggregations(symbol, depth);
            }
            
            // Pattern 2: Inefficient string operations
            if (isStringFunction(symbol.name)) {
                checkInefficientStringOps(symbol);
            }
            
            // Pattern 3: Complex date calculations
            if (isDateFunction(symbol.name)) {
                checkComplexDateCalcs(symbol);
            }
            
            // Pattern 4: Deeply nested IF/CASE statements (increased threshold)
            if (symbol.name === 'IF' || symbol.name === 'CASE' || symbol.name === 'IIF') {
                if (depth >= 5) { // Increased threshold from 3 to 5
                    complexPatterns.push({
                        pattern: `Very deeply nested ${symbol.name} statement (depth ${depth})`,
                        range: symbol.range,
                        suggestion: `Consider simplifying logic or using CASE instead of nested IF statements`
                    });
                }
            }
        }
        
        // Process children recursively
        if (symbol.children) {
            for (const child of symbol.children) {
                analyzeSymbol(child, depth + 1);
            }
        }
    }
    
    // Check for nested aggregations (performance issue in Tableau)
    function checkNestedAggregations(symbol: Symbol, depth: number): void {
        if (symbol.arguments) {
            for (const arg of symbol.arguments) {
                // Check if argument contains another aggregate function
                if (arg.text && containsAggregateFunction(arg.text)) {
                    complexPatterns.push({
                        pattern: `Nested aggregation in ${symbol.name}`,
                        range: symbol.range,
                        suggestion: `Use LOD expressions instead of nested aggregations for better performance`
                    });
                }
            }
        }
    }
    
    // Check for inefficient string operations
    function checkInefficientStringOps(symbol: Symbol): void {
        if (symbol.name === 'REPLACE' || symbol.name === 'REGEXP_REPLACE') {
            complexPatterns.push({
                pattern: `Complex string operation: ${symbol.name}`,
                range: symbol.range,
                suggestion: `Consider pre-processing data or using calculated fields for complex string operations`
            });
        }
    }
    
    // Check for complex date calculations
    function checkComplexDateCalcs(symbol: Symbol): void {
        if ((symbol.name === 'DATEADD' || symbol.name === 'DATEDIFF') && symbol.arguments && symbol.arguments.length > 0) {
            // Check if the date argument is itself a complex expression
            const dateArg = symbol.arguments[symbol.arguments.length - 1];
            if (dateArg.text && (dateArg.text.includes('(') || dateArg.text.includes('['))) {
                complexPatterns.push({
                    pattern: `Complex date calculation in ${symbol.name}`,
                    range: symbol.range,
                    suggestion: `Consider simplifying date calculations or using multiple steps for better performance`
                });
            }
        }
    }
    
    // Helper functions to identify function types
    function isAggregateFunction(name: string): boolean {
        const aggregateFunctions = [
            'SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'COUNTD', 
            'ATTR', 'MEDIAN', 'PERCENTILE', 'STDEV', 'STDEVP', 
            'VAR', 'VARP', 'WINDOW_SUM', 'WINDOW_AVG', 'WINDOW_MIN', 
            'WINDOW_MAX', 'WINDOW_COUNT', 'WINDOW_MEDIAN', 'WINDOW_STDEV',
            'WINDOW_VAR', 'RUNNING_SUM', 'RUNNING_AVG', 'RUNNING_MIN',
            'RUNNING_MAX', 'RUNNING_COUNT'
        ];
        return aggregateFunctions.includes(name);
    }
    
    function isStringFunction(name: string): boolean {
        const stringFunctions = [
            'LEFT', 'RIGHT', 'MID', 'FIND', 'CONTAINS', 'REPLACE',
            'REGEXP_EXTRACT', 'REGEXP_MATCH', 'REGEXP_REPLACE',
            'SPLIT', 'TRIM', 'LTRIM', 'RTRIM', 'UPPER', 'LOWER'
        ];
        return stringFunctions.includes(name);
    }
    
    function isDateFunction(name: string): boolean {
        const dateFunctions = [
            'DATEADD', 'DATEDIFF', 'DATEPART', 'DATETRUNC',
            'DATENAME', 'MAKEDATE', 'MAKEDATETIME', 'MAKETIME'
        ];
        return dateFunctions.includes(name);
    }
    
    function containsAggregateFunction(text: string): boolean {
        const aggregatePattern = /\b(SUM|AVG|MIN|MAX|COUNT|COUNTD|ATTR|MEDIAN|STDEV|VAR)\s*\(/i;
        return aggregatePattern.test(text);
    }
    
    // Analyze all symbols
    for (const symbol of symbols) {
        analyzeSymbol(symbol);
    }
    
    // R2.3: Warning for excessive nesting depth (increased threshold)
    if (maxNestingDepth > 5) { // Increased threshold from 3 to 5
        diagnostics.push({
            severity: DiagnosticSeverity.Information, // Reduced from Warning to Information
            range: Range.create(0, 0, 0, 0), // Document-level diagnostic
            message: `Expression has deep nesting (${maxNestingDepth} levels). Consider simplifying for better readability and performance.`,
            source: 'Tableau LSP',
            code: 'DEEP_NESTING'
        });
    }
    
    // R2.3: Add diagnostics for complex patterns
    for (const pattern of complexPatterns) {
        diagnostics.push({
            severity: DiagnosticSeverity.Information,
            range: pattern.range,
            message: `${pattern.pattern}. ${pattern.suggestion}`,
            source: 'Tableau LSP',
            code: 'PERFORMANCE_OPTIMIZATION'
        });
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
