import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ParsedDocument, Symbol, SymbolType } from './common';

/**
 * TableauDiagnosticCategory for advanced error recovery
 */
export enum AdvancedErrorRecoveryCategory {
    PARTIAL_EXPRESSION = "Partial Expression",
    NESTED_EXPRESSION = "Nested Expression",
    INCOMPLETE_LOD = "Incomplete LOD",
    BOUNDARY_DETECTION = "Expression Boundary",
    RECOVERY_SUGGESTION = "Recovery Suggestion"
}

/**
 * R2.5: Advanced error recovery for complex expressions
 * Implements requirements 6.11, 6.12, and 6.13
 */
export class AdvancedErrorRecovery {
    private diagnostics: Diagnostic[] = [];
    
    /**
     * R2.5: Process document for advanced error recovery
     * Handles partial expressions, nested expressions, and incomplete LOD expressions
     * FIXED: Re-enabled with improved false positive prevention
     */
    processDocument(document: TextDocument, parsedDocument: ParsedDocument): Diagnostic[] {
        this.diagnostics = [];

        try {
            // Process symbols for advanced error recovery with improved logic
            for (const symbol of parsedDocument.symbols) {
                this.processSymbol(symbol, document);
            }

            // Process partial expressions with enhanced detection
            this.processPartialExpressions(document, parsedDocument);

            return this.diagnostics;
        } catch (error) {
            // If error recovery fails, return empty diagnostics to prevent crashes
            console.error('Error in advanced error recovery:', error);
            return [];
        }
    }
    
    /**
     * R2.5: Process individual symbols for advanced error recovery
     */
    private processSymbol(symbol: Symbol, document: TextDocument): void {
        // Process nested expressions
        if (symbol.type === SymbolType.FunctionCall || 
            symbol.name === 'IF' || 
            symbol.name === 'CASE') {
            this.processNestedExpression(symbol, document);
        }
        
        // Process LOD expressions
        if (symbol.type === SymbolType.LODExpression) {
            this.processLODExpression(symbol, document);
        }
        
        // Recursively process children
        if (symbol.children) {
            for (const child of symbol.children) {
                this.processSymbol(child, document);
            }
        }
    }
    
    /**
     * R2.5: Process nested expressions for boundary detection
     * Requirement 6.12: Maintain proper expression boundaries and context
     */
    private processNestedExpression(symbol: Symbol, document: TextDocument): void {
        // Check for complex nested expressions with potential boundary issues
        if (symbol.arguments && symbol.arguments.length > 0) {
            for (const arg of symbol.arguments) {
                // Look for complex arguments that might have boundary issues
                if (arg.text && this.isComplexArgument(arg.text)) {
                    this.processComplexArgument(arg, symbol, document);
                }
            }
        }
        
        // Check for nested IF/CASE statements with potential boundary issues
        if ((symbol.name === 'IF' || symbol.name === 'CASE') && symbol.children) {
            let nestedDepth = 0;
            this.calculateNestedDepth(symbol, 0, (s, depth) => {
                nestedDepth = Math.max(nestedDepth, depth);
            });
            
            // For deeply nested expressions, provide boundary guidance
            if (nestedDepth >= 3) {
                this.addBoundaryGuidance(symbol, document);
            }
        }
    }
    
    /**
     * R2.5: Calculate nested depth of expressions
     */
    private calculateNestedDepth(symbol: Symbol, currentDepth: number, callback: (symbol: Symbol, depth: number) => void): void {
        callback(symbol, currentDepth);
        
        if (symbol.children) {
            for (const child of symbol.children) {
                if (child.name === 'IF' || child.name === 'CASE' || child.type === SymbolType.FunctionCall) {
                    this.calculateNestedDepth(child, currentDepth + 1, callback);
                } else {
                    this.calculateNestedDepth(child, currentDepth, callback);
                }
            }
        }
    }
    
    /**
     * R2.5: Add boundary guidance for complex nested expressions
     */
    private addBoundaryGuidance(symbol: Symbol, document: TextDocument): void {
        // Only add guidance for expressions that span multiple lines
        const text = document.getText(symbol.range);
        if (text.includes('\n')) {
            this.addDiagnostic(
                symbol.range,
                `Complex nested expression detected. Consider using comments or line breaks to clarify expression boundaries.`,
                DiagnosticSeverity.Information,
                { category: AdvancedErrorRecoveryCategory.BOUNDARY_DETECTION }
            );
        }
    }
    
    /**
     * R2.5: Check if an argument is complex and might have boundary issues
     */
    private isComplexArgument(text: string): boolean {
        // Check for nested function calls, IF/CASE statements, or LOD expressions
        return (
            (text.includes('(') && text.includes(')')) || // Nested function calls
            text.includes('IF ') || 
            text.includes('CASE ') ||
            text.includes('{') || // LOD expressions
            text.split('\n').length > 1 // Multi-line expressions
        );
    }
    
    /**
     * R2.5: Process complex arguments for boundary detection
     */
    private processComplexArgument(arg: any, parentSymbol: Symbol, document: TextDocument): void {
        // Check for unbalanced parentheses or brackets
        const text = arg.text;
        const openParens = (text.match(/\(/g) || []).length;
        const closeParens = (text.match(/\)/g) || []).length;
        const openBrackets = (text.match(/\[/g) || []).length;
        const closeBrackets = (text.match(/\]/g) || []).length;
        const openBraces = (text.match(/{/g) || []).length;
        const closeBraces = (text.match(/}/g) || []).length;
        
        // If we have unbalanced delimiters, provide guidance
        if (openParens !== closeParens || openBrackets !== closeBrackets || openBraces !== closeBraces) {
            this.addDiagnostic(
                arg.range,
                `Possible unbalanced delimiters in complex expression. Check for matching parentheses, brackets, and braces.`,
                DiagnosticSeverity.Information,
                { category: AdvancedErrorRecoveryCategory.NESTED_EXPRESSION }
            );
        }
    }
    
    /**
     * R2.5: Process LOD expressions for helpful guidance
     * Requirement 6.13: Provide helpful guidance for incomplete LOD expressions
     */
    private processLODExpression(symbol: Symbol, document: TextDocument): void {
        // Check if the LOD expression is incomplete or malformed
        if (symbol.text) {
            const text = symbol.text.trim();
            
            // Check for common LOD syntax issues
            if (!text.includes(':')) {
                this.addDiagnostic(
                    symbol.range,
                    `Incomplete LOD expression. LOD expressions require a colon after the aggregation type (FIXED, INCLUDE, EXCLUDE).`,
                    DiagnosticSeverity.Information,
                    { category: AdvancedErrorRecoveryCategory.INCOMPLETE_LOD }
                );
                return;
            }
            
            // Check for missing aggregation type
            if (!text.match(/\b(FIXED|INCLUDE|EXCLUDE)\b/i)) {
                this.addDiagnostic(
                    symbol.range,
                    `Incomplete LOD expression. Specify an aggregation type: FIXED, INCLUDE, or EXCLUDE.`,
                    DiagnosticSeverity.Information,
                    { category: AdvancedErrorRecoveryCategory.INCOMPLETE_LOD }
                );
                return;
            }
            
            // Check for missing aggregation function
            if (!text.match(/\b(SUM|AVG|MIN|MAX|COUNT|COUNTD|ATTR|MEDIAN|STDEV|VAR)\s*\(/i)) {
                this.addDiagnostic(
                    symbol.range,
                    `LOD expression may be missing an aggregation function (SUM, AVG, COUNT, etc.).`,
                    DiagnosticSeverity.Information,
                    { category: AdvancedErrorRecoveryCategory.INCOMPLETE_LOD }
                );
            }
        }
    }
    
    /**
     * R2.5: Process partial expressions during editing
     * Requirement 6.11: Provide graceful error recovery for partial expressions
     */
    private processPartialExpressions(document: TextDocument, parsedDocument: ParsedDocument): void {
        const text = document.getText();
        const lines = text.split('\n');
        
        // Look for lines that might contain partial expressions
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Skip empty lines or comments
            if (line === '' || line.startsWith('//')) {
                continue;
            }
            
            // Check for potential partial expressions
            if (this.isLikelyPartialExpression(line)) {
                // Check if this line is already part of a valid expression
                if (!this.isLinePartOfValidExpression(i, parsedDocument)) {
                    this.handlePartialExpression(line, i, document);
                }
            }
        }
    }
    
    /**
     * R2.5: Check if a line is likely a partial expression
     * ENHANCED: Improved logic to reduce false positives
     */
    private isLikelyPartialExpression(line: string): boolean {
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
            return false;
        }

        // Check for unbalanced delimiters, but be more conservative
        const openParens = (trimmed.match(/\(/g) || []).length;
        const closeParens = (trimmed.match(/\)/g) || []).length;
        const openBrackets = (trimmed.match(/\[/g) || []).length;
        const closeBrackets = (trimmed.match(/\]/g) || []).length;
        const openBraces = (trimmed.match(/{/g) || []).length;
        const closeBraces = (trimmed.match(/}/g) || []).length;

        // Only flag as partial if there's a significant imbalance
        const parenImbalance = Math.abs(openParens - closeParens);
        const bracketImbalance = Math.abs(openBrackets - closeBrackets);
        const braceImbalance = Math.abs(openBraces - closeBraces);

        // High confidence indicators of partial expressions
        const hasUnbalancedDelimiters = parenImbalance > 0 || bracketImbalance > 0 || braceImbalance > 0;

        // Line ends with operators that suggest continuation (but not comparison operators which are valid)
        const endsWithContinuation = /[+\-*\/,]$/.test(trimmed);

        // Line starts with continuation keywords
        const startsWithContinuation = /^\s*(THEN|ELSE|ELSEIF|WHEN|AND|OR)\b/i.test(trimmed);

        // Incomplete conditional structures (more conservative check)
        const incompleteIf = /\bIF\b/i.test(trimmed) && !(/\bTHEN\b/i.test(trimmed)) && !(/\bEND\b/i.test(trimmed));
        const incompleteCase = /\bCASE\b/i.test(trimmed) && !(/\bWHEN\b/i.test(trimmed)) && !(/\bEND\b/i.test(trimmed));

        // Only return true if we have strong indicators
        return hasUnbalancedDelimiters || endsWithContinuation || startsWithContinuation ||
               (incompleteIf && trimmed.length > 10) || (incompleteCase && trimmed.length > 10);
    }
    
    /**
     * R2.5: Check if a line is part of a valid expression
     */
    private isLinePartOfValidExpression(lineIndex: number, parsedDocument: ParsedDocument): boolean {
        // Check if this line is covered by any valid symbol
        if (parsedDocument.lineSymbols) {
            const lineSymbols = parsedDocument.lineSymbols.get(lineIndex) || [];
            
            // If we have any valid symbols on this line, it's part of a valid expression
            return lineSymbols.length > 0;
        }
        
        // If we don't have line symbols, check all symbols
        for (const symbol of parsedDocument.symbols) {
            if (symbol.range.start.line <= lineIndex && symbol.range.end.line >= lineIndex) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * R2.5: Handle partial expressions during editing
     */
    private handlePartialExpression(line: string, lineIndex: number, document: TextDocument): void {
        const range = Range.create(lineIndex, 0, lineIndex, line.length);
        
        // Determine the type of partial expression
        if (line.includes('IF') && !line.includes('THEN')) {
            this.addDiagnostic(
                range,
                `Partial IF statement detected. Complete with THEN, condition, and END.`,
                DiagnosticSeverity.Information,
                { category: AdvancedErrorRecoveryCategory.PARTIAL_EXPRESSION }
            );
        } else if (line.includes('CASE') && !line.includes('WHEN')) {
            this.addDiagnostic(
                range,
                `Partial CASE statement detected. Complete with WHEN, condition, and END.`,
                DiagnosticSeverity.Information,
                { category: AdvancedErrorRecoveryCategory.PARTIAL_EXPRESSION }
            );
        } else if (line.includes('{') && !line.includes('}')) {
            this.addDiagnostic(
                range,
                `Partial LOD expression detected. Complete with aggregation type, dimensions, and aggregation.`,
                DiagnosticSeverity.Information,
                { category: AdvancedErrorRecoveryCategory.PARTIAL_EXPRESSION }
            );
        } else if ((line.match(/\(/g) || []).length !== (line.match(/\)/g) || []).length) {
            this.addDiagnostic(
                range,
                `Partial function call or expression detected. Ensure parentheses are balanced.`,
                DiagnosticSeverity.Information,
                { category: AdvancedErrorRecoveryCategory.PARTIAL_EXPRESSION }
            );
        } else if ((line.match(/\[/g) || []).length !== (line.match(/\]/g) || []).length) {
            this.addDiagnostic(
                range,
                `Partial field reference detected. Ensure brackets are balanced.`,
                DiagnosticSeverity.Information,
                { category: AdvancedErrorRecoveryCategory.PARTIAL_EXPRESSION }
            );
        } else if (/[+\-*\/=<>!&|,]$/.test(line)) {
            this.addDiagnostic(
                range,
                `Expression appears to continue on the next line. Complete the expression.`,
                DiagnosticSeverity.Information,
                { category: AdvancedErrorRecoveryCategory.PARTIAL_EXPRESSION }
            );
        }
    }
    
    /**
     * R2.5: Add diagnostic with enhanced information
     */
    private addDiagnostic(
        range: Range, 
        message: string, 
        severity: DiagnosticSeverity, 
        context?: {
            category: AdvancedErrorRecoveryCategory;
        }
    ): void {
        const diagnostic: Diagnostic = {
            severity,
            range,
            message,
            source: 'Tableau LSP',
            code: context?.category || 'ADVANCED_ERROR_RECOVERY'
        };
        
        // Add additional context for enhanced diagnostics
        if (context) {
            diagnostic.data = {
                category: context.category
            };
        }
        
        this.diagnostics.push(diagnostic);
    }
}