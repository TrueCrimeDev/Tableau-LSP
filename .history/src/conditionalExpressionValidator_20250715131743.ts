import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ParsedDocument, Symbol, SymbolType, FUNCTION_SIGNATURES } from './common';

// R2.2: Tableau-specific diagnostic categories
export enum TableauDiagnosticCategory {
    SYNTAX_ERROR = "Syntax Error",
    UNCLOSED_BLOCK = "Unclosed Block", 
    MISSING_BRANCH = "Missing Branch",
    INVALID_FUNCTION = "Invalid Function",
    FIELD_REFERENCE = "Field Reference",
    LOD_VALIDATION = "LOD Validation",
    CONDITIONAL_LOGIC = "Conditional Logic"
}

/**
 * R2.3: Enhanced validator for conditional expressions (IF/THEN/ELSE, CASE, IIF)
 * Provides comprehensive linting and validation for Tableau conditional logic
 * Implements rules from LSP Implementation Guide
 */
export class ConditionalExpressionValidator {
    private diagnostics: Diagnostic[] = [];
    
    /**
     * R2.1: Validates all conditional expressions in a document
     * Implements comprehensive validation for all Tableau conditional constructs
     */
    validateConditionalExpressions(document: TextDocument, parsedDocument: ParsedDocument): Diagnostic[] {
        this.diagnostics = [];
        
        // R2.3: Process all symbols looking for conditional expressions
        for (const symbol of parsedDocument.symbols) {
            this.validateSymbol(symbol, document);
        }
        
        // R2.3: Validate overall document structure
        this.validateDocumentStructure(parsedDocument.symbols);
        
        return this.diagnostics;
    }
    
    /**
     * R2.3: Validate overall document structure
     */
    private validateDocumentStructure(symbols: Symbol[]): void {
        // Check for balanced parentheses, quotes, etc.
        this.validateBalancedStructures(symbols);
        
        // Check for unreachable code
        this.validateReachability(symbols);
    }
    
    /**
     * Validate balanced structures (parentheses, quotes, blocks)
     */
    private validateBalancedStructures(symbols: Symbol[]): void {
        // Re-enabled with improved logic: Check for unclosed blocks
        for (const symbol of symbols) {
            if ((symbol.name === 'IF' || symbol.name === 'CASE') && !symbol.end) {
                // Only flag as error if we have children but no END - this indicates a parsing issue
                if (symbol.children && symbol.children.length > 0) {
                    this.addDiagnostic(
                        symbol.range,
                        `Unclosed ${symbol.name} block - missing END statement`,
                        DiagnosticSeverity.Error,
                        { category: TableauDiagnosticCategory.UNCLOSED_BLOCK, blockType: symbol.name }
                    );
                }
            }
        }
    }
    
    /**
     * Validate code reachability
     */
    private validateReachability(symbols: Symbol[]): void {
        // Implementation would check for unreachable branches
        // This is a placeholder for future enhancement
    }
    
    /**
     * R2.3: Validate individual symbols recursively
     */
    private validateSymbol(symbol: Symbol, document: TextDocument): void {
        // R2.3: Validate IF statements
        if (symbol.name === 'IF') {
            this.validateIfStatement(symbol, document);
        }
        
        // R2.3: Validate CASE statements
        if (symbol.name === 'CASE') {
            this.validateCaseStatement(symbol, document);
        }
        
        // R2.4: Validate IIF function calls
        if (symbol.name === 'IIF' && symbol.type === SymbolType.FunctionCall) {
            this.validateIifFunction(symbol, document);
        }
        
        // R2.4: Validate all function calls
        if (symbol.type === SymbolType.FunctionCall) {
            this.validateFunctionCall(symbol);
        }
        
        // Validate field references
        if (symbol.type === SymbolType.FieldReference) {
            this.validateFieldReference(symbol);
        }
        
        // Validate LOD expressions
        if (symbol.type === SymbolType.LODExpression) {
            this.validateLODExpression(symbol);
        }
        
        // Recursively validate children
        if (symbol.children) {
            for (const child of symbol.children) {
                this.validateSymbol(child, document);
            }
        }
    }
    
    /**
     * R2.3: Comprehensive IF statement validation
     */
    private validateIfStatement(symbol: Symbol, document: TextDocument): void {
        // Re-enabled: Check for unclosed IF block with improved logic
        if (!symbol.end && symbol.children && symbol.children.length > 0) {
            // Only flag if we have meaningful content without an END
            const hasMeaningfulContent = symbol.children.some(child => 
                child.name === 'THEN' || child.name === 'ELSE' || child.name === 'ELSEIF'
            );
            
            if (hasMeaningfulContent) {
                this.addDiagnostic(
                    symbol.range,
                    `Unclosed IF block - missing END statement`,
                    DiagnosticSeverity.Error,
                    { category: TableauDiagnosticCategory.UNCLOSED_BLOCK, blockType: 'IF' }
                );
                return;
            }
        }
        
        const children = symbol.children || [];
        const branches = children.filter(c => 
            c.name === 'THEN' || c.name === 'ELSEIF' || c.name === 'ELSE'
        );
        
        // R2.3: Validate branch structure and sequence
        this.validateBranches(branches, symbol);
        
        // R2.3: Enhanced branch validation
        this.validateIfBranchLogic(branches, symbol);
        
        // R2.3: Check for missing ELSE (relaxed validation)
        this.validateElseBranch(branches, symbol);
        
        // Validate expressions within branches
        this.validateBranchExpressions(branches, document);
        
        // R2.3: Check for nested complexity
        this.validateNestingComplexity(symbol);
    }
    
    /**
     * R2.3: Validate IF branch logic and flow
     */
    private validateIfBranchLogic(branches: Symbol[], parentSymbol: Symbol): void {
        const branchTypes = new Set(branches.map(b => b.name));
        const hasThen = branchTypes.has('THEN');
        const hasElseIf = branchTypes.has('ELSEIF');
        const hasElse = branchTypes.has('ELSE');

        // Case 1: IF with ELSEIF but no THEN - definitely invalid
        if (hasElseIf && !hasThen) {
            this.addDiagnostic(
                parentSymbol.range,
                `IF statement with ELSEIF requires a THEN clause`,
                DiagnosticSeverity.Error,
                { category: TableauDiagnosticCategory.MISSING_BRANCH, blockType: 'IF' }
            );
            return;
        }

        // Case 2: IF with ELSE but no THEN - check if it's a valid single-branch IF
        if (hasElse && !hasThen && !hasElseIf) {
            // This could be valid in some contexts, but typically IF...ELSE needs THEN
            // Only flag if we have meaningful content suggesting this should be a full IF statement
            if (this.hasComplexCondition(parentSymbol)) {
                this.addDiagnostic(
                    parentSymbol.range,
                    `IF statement with ELSE should have a THEN clause`,
                    DiagnosticSeverity.Warning,
                    { category: TableauDiagnosticCategory.MISSING_BRANCH, blockType: 'IF' }
                );
            }
        }

        // Case 3: Validate that THEN comes first if present
        if (hasThen && branches.length > 1) {
            const thenIndex = branches.findIndex(b => b.name === 'THEN');
            if (thenIndex !== 0) {
                this.addDiagnostic(
                    branches[thenIndex].range,
                    `THEN clause should come immediately after IF condition`,
                    DiagnosticSeverity.Error,
                    { category: TableauDiagnosticCategory.CONDITIONAL_LOGIC, branchType: 'THEN' }
                );
            }
        }
    }

    /**
     * Check if an IF statement has a complex condition that suggests it should be a full IF statement
     */
    private hasComplexCondition(symbol: Symbol): boolean {
        // Check if the symbol has meaningful text content or complex structure
        if (symbol.children && symbol.children.length > 2) {
            return true;
        }
        
        // Check for complex operators or multiple conditions
        const symbolText = (symbol as any).text || '';
        if (typeof symbolText === 'string') {
            const hasComplexOperators = /\b(AND|OR|NOT|IN)\b/.test(symbolText);
            const hasMultipleConditions = (symbolText.match(/[<>=!]/g) || []).length > 1;
            
            return hasComplexOperators || hasMultipleConditions;
        }
        
        return false;
    }
    
    /**
     * R2.3: Validate ELSE branch requirements
     */
    private validateElseBranch(branches: Symbol[], parentSymbol: Symbol): void {
        const hasElse = branches.some(branch => branch.name === 'ELSE');
        const hasElseIf = branches.some(branch => branch.name === 'ELSEIF');
        
        // DISABLED: This warning is too aggressive for Tableau
        // Many valid Tableau calculations intentionally omit ELSE to return NULL
        // Only warn in very specific cases where it's clearly problematic
        
        // Only warn if there are multiple ELSEIF branches (3+ total conditions)
        const elseIfCount = branches.filter(branch => branch.name === 'ELSEIF').length;
        if (!hasElse && elseIfCount >= 2) {
            this.addDiagnostic(
                parentSymbol.range,
                `Complex IF block with multiple ELSEIF clauses might benefit from a final ELSE branch`,
                DiagnosticSeverity.Information, // Lowered to Information
                { category: TableauDiagnosticCategory.MISSING_BRANCH, branchType: 'ELSE' }
            );
        }
    }
    
    /**
     * R2.3: Validate nesting complexity
     */
    private validateNestingComplexity(symbol: Symbol): void {
        const depth = this.calculateNestingDepth(symbol);
        if (depth > 3) {
            this.addDiagnostic(
                symbol.range,
                `Deeply nested IF statement (depth: ${depth}). Consider simplifying for readability.`,
                DiagnosticSeverity.Information,
                { category: TableauDiagnosticCategory.CONDITIONAL_LOGIC, blockType: 'IF' }
            );
        }
    }
    
    /**
     * Calculate nesting depth of conditional expressions
     */
    private calculateNestingDepth(symbol: Symbol): number {
        let maxDepth = 0;
        
        if (symbol.children) {
            for (const child of symbol.children) {
                if (child.name === 'IF' || child.name === 'CASE') {
                    maxDepth = Math.max(maxDepth, 1 + this.calculateNestingDepth(child));
                } else if (child.children) {
                    maxDepth = Math.max(maxDepth, this.calculateNestingDepth(child));
                }
            }
        }
        
        return maxDepth;
    }
    
    /**
     * R2.3: Comprehensive CASE statement validation
     */
    private validateCaseStatement(symbol: Symbol, document: TextDocument): void {
        // Re-enabled: Check for unclosed CASE block with improved logic
        if (!symbol.end && symbol.children && symbol.children.length > 0) {
            // Only flag if we have meaningful content without an END
            const hasMeaningfulContent = symbol.children.some(child => 
                child.name === 'WHEN' || child.name === 'ELSE'
            );
            
            if (hasMeaningfulContent) {
                this.addDiagnostic(
                    symbol.range,
                    `Unclosed CASE block - missing END statement`,
                    DiagnosticSeverity.Error,
                    { category: TableauDiagnosticCategory.UNCLOSED_BLOCK, blockType: 'CASE' }
                );
                return;
            }
        }
        
        const children = symbol.children || [];
        const branches = children.filter(c => 
            c.name === 'WHEN' || c.name === 'ELSE'
        );
        
        // R2.3: CASE must have at least one WHEN
        if (!branches.some(b => b.name === 'WHEN')) {
            this.addDiagnostic(
                symbol.range,
                `CASE statement must have at least one WHEN clause`,
                DiagnosticSeverity.Error,
                { category: TableauDiagnosticCategory.MISSING_BRANCH, blockType: 'CASE' }
            );
        }
        
        // R2.3: Validate WHEN clause structure
        this.validateWhenClauses(branches, symbol);
        
        // Validate branch structure
        this.validateBranches(branches, symbol);
        
        // Validate expressions within branches
        this.validateBranchExpressions(branches, document);
        
        // R2.3: Check for exhaustive WHEN coverage
        this.validateCaseExhaustiveness(branches, symbol);
    }
    
    /**
     * R2.3: Validate WHEN clause structure and logic
     */
    private validateWhenClauses(branches: Symbol[], parentSymbol: Symbol): void {
        const whenBranches = branches.filter(b => b.name === 'WHEN');
        
        for (const whenBranch of whenBranches) {
            // Check for empty WHEN conditions using the improved logic
            if (this.isBranchTrulyEmpty(whenBranch)) {
                this.addDiagnostic(
                    whenBranch.range,
                    `Empty WHEN clause - provide a condition and value`,
                    DiagnosticSeverity.Error,
                    { category: TableauDiagnosticCategory.CONDITIONAL_LOGIC, branchType: 'WHEN' }
                );
            }
        }
    }
    
    /**
     * R2.3: Validate CASE statement exhaustiveness
     */
    private validateCaseExhaustiveness(branches: Symbol[], parentSymbol: Symbol): void {
        const hasElse = branches.some(b => b.name === 'ELSE');
        const whenCount = branches.filter(b => b.name === 'WHEN').length;
        
        if (!hasElse && whenCount > 1) {
            this.addDiagnostic(
                parentSymbol.range,
                `CASE statement should have an ELSE clause to handle unmatched values`,
                DiagnosticSeverity.Warning,
                { category: TableauDiagnosticCategory.MISSING_BRANCH, branchType: 'ELSE' }
            );
        }
    }
    
    /**
     * R2.4: Comprehensive IIF function validation
     */
    private validateIifFunction(symbol: Symbol, document: TextDocument): void {
        // R2.4: IIF requires exactly 3 parameters (condition, true_value, false_value)
        // or 4 parameters (condition, true_value, false_value, unknown_value)
        const signature = FUNCTION_SIGNATURES[symbol.name];
        if (!signature) {
            this.addDiagnostic(
                symbol.range,
                `Unknown function: ${symbol.name}`,
                DiagnosticSeverity.Error,
                { category: TableauDiagnosticCategory.INVALID_FUNCTION, functionName: symbol.name }
            );
            return;
        }
        
        // R2.4: Validate parameter count
        const [minArgs, maxArgs] = signature;
        const argCount = symbol.arguments?.length || 0;
        
        if (argCount < minArgs || argCount > maxArgs) {
            this.addDiagnostic(
                symbol.range,
                `Function ${symbol.name} expects ${minArgs}${maxArgs === Infinity ? '+' : `-${maxArgs}`} arguments, got ${argCount}`,
                DiagnosticSeverity.Error,
                { category: TableauDiagnosticCategory.INVALID_FUNCTION, functionName: symbol.name }
            );
        }
        
        // R2.4: IIF-specific validation
        if (argCount >= 3) {
            // Validate that first argument is a boolean condition
            this.validateIifCondition(symbol);
        }
    }
    
    /**
     * R2.4: Validate IIF condition parameter
     */
    private validateIifCondition(symbol: Symbol): void {
        // This would require enhanced AST parsing to validate boolean expressions
        // For now, we provide a placeholder
        if (symbol.arguments && symbol.arguments.length > 0) {
            const condition = symbol.arguments[0];
            // Basic validation - check for obvious non-boolean literals
            if (typeof condition.text === 'string' && condition.text.match(/^\d+$/)) {
                this.addDiagnostic(
                    condition.range,
                    `IIF condition should be a boolean expression, not a number`,
                    DiagnosticSeverity.Warning,
                    { category: TableauDiagnosticCategory.CONDITIONAL_LOGIC, functionName: 'IIF' }
                );
            }
        }
    }
    
    /**
     * R2.4: Validate all function calls against signatures
     */
    private validateFunctionCall(symbol: Symbol): void {
        const signature = FUNCTION_SIGNATURES[symbol.name];
        if (!signature) {
            this.addDiagnostic(
                symbol.range,
                `Unknown function: ${symbol.name}`,
                DiagnosticSeverity.Warning,
                { category: TableauDiagnosticCategory.INVALID_FUNCTION, functionName: symbol.name }
            );
            return;
        }
        
        // R2.4: Validate parameter count
        const [minArgs, maxArgs] = signature;
        const argCount = symbol.arguments?.length || 0;
        
        if (argCount < minArgs || (maxArgs !== Infinity && argCount > maxArgs)) {
            const expectedRange = maxArgs === Infinity ? `${minArgs}+` : 
                                minArgs === maxArgs ? `${minArgs}` : `${minArgs}-${maxArgs}`;
            
            this.addDiagnostic(
                symbol.range,
                `Function ${symbol.name} expects ${expectedRange} arguments, got ${argCount}`,
                DiagnosticSeverity.Error,
                { category: TableauDiagnosticCategory.INVALID_FUNCTION, functionName: symbol.name }
            );
        }
    }
    
    /**
     * Validate field references
     */
    private validateFieldReference(symbol: Symbol): void {
        // This would validate against known fields in the data source
        // For now, basic validation for obviously invalid field names
        if (symbol.name.includes('..') || symbol.name.startsWith('.')) {
            this.addDiagnostic(
                symbol.range,
                `Invalid field reference: ${symbol.name}`,
                DiagnosticSeverity.Warning,
                { category: TableauDiagnosticCategory.FIELD_REFERENCE }
            );
        }
    }
    
    /**
     * Validate LOD expressions
     */
    private validateLODExpression(symbol: Symbol): void {
        // Validate LOD syntax and structure
        if (!symbol.children || symbol.children.length === 0) {
            this.addDiagnostic(
                symbol.range,
                `Empty LOD expression. Provide dimensions and aggregation.`,
                DiagnosticSeverity.Error,
                { category: TableauDiagnosticCategory.LOD_VALIDATION }
            );
        }
    }
    
    private validateBranches(branches: Symbol[], parentSymbol: Symbol): void {
        // Re-enabled: Empty branch validation with improved logic
        for (const branch of branches) {
            // Only flag truly empty branches - improved detection
            if (this.isBranchTrulyEmpty(branch)) {
                this.addDiagnostic(
                    branch.range,
                    `Empty ${branch.name} branch - provide a value or expression`,
                    DiagnosticSeverity.Warning,
                    { category: TableauDiagnosticCategory.CONDITIONAL_LOGIC, branchType: branch.name }
                );
            }
        }
        
        // Validate branch sequence for IF statements
        if (parentSymbol.name === 'IF') {
            this.validateIfBranchSequence(branches);
        }
    }
    
    /**
     * Improved logic to check if a branch is truly empty (no meaningful content)
     */
    private isBranchTrulyEmpty(branch: Symbol): boolean {
        // If no children at all, it's empty
        if (!branch.children || branch.children.length === 0) {
            return true;
        }
        
        // Check if all children are just whitespace, comments, or other non-meaningful content
        const meaningfulChildren = branch.children.filter(child => {
            // Don't count comments as meaningful content
            if (child.type === SymbolType.Comment) {
                return false;
            }
            
            // Don't count pure whitespace
            if (child.type === SymbolType.Unknown && (!child.name || child.name.trim() === '')) {
                return false;
            }
            
            // Expressions, function calls, and field references are meaningful
            if (child.type === SymbolType.Expression || 
                child.type === SymbolType.FunctionCall ||
                child.type === SymbolType.FieldReference ||
                child.type === SymbolType.LODExpression) {
                return true;
            }
            
            // If we have text content, it's meaningful
            const childText = (child as any).text;
            if (typeof childText === 'string' && childText.trim() !== '') {
                return true;
            }
            
            return false;
        });
        
        return meaningfulChildren.length === 0;
    }
    
    private validateIfBranchSequence(branches: Symbol[]): void {
        let hasElse = false;
        let hasElseIf = false;
        
        for (let i = 0; i < branches.length; i++) {
            const branch = branches[i];
            
            if (branch.name === 'ELSE') {
                hasElse = true;
                // ELSE must be the last branch
                if (i !== branches.length - 1) {
                    this.addDiagnostic(
                        branch.range,
                        `ELSE clause must be the last branch in an IF statement.`,
                        DiagnosticSeverity.Error,
                        { category: TableauDiagnosticCategory.CONDITIONAL_LOGIC, branchType: 'ELSE' }
                    );
                }
            } else if (branch.name === 'ELSEIF') {
                hasElseIf = true;
                // ELSEIF cannot come after ELSE
                if (hasElse) {
                    this.addDiagnostic(
                        branch.range,
                        `ELSEIF cannot come after ELSE clause.`,
                        DiagnosticSeverity.Error,
                        { category: TableauDiagnosticCategory.CONDITIONAL_LOGIC, branchType: 'ELSEIF' }
                    );
                }
            } else if (branch.name === 'THEN') {
                // THEN must be the first branch
                if (i !== 0) {
                    this.addDiagnostic(
                        branch.range,
                        `THEN clause must be the first branch in an IF statement.`,
                        DiagnosticSeverity.Error,
                        { category: TableauDiagnosticCategory.CONDITIONAL_LOGIC, branchType: 'THEN' }
                    );
                }
            }
        }
    }
    
    private validateBranchExpressions(branches: Symbol[], document: TextDocument): void {
        for (const branch of branches) {
            if (branch.children) {
                for (const child of branch.children) {
                    this.validateExpressionSyntax(child, document);
                }
            }
        }
    }
    
    private validateExpressionSyntax(symbol: Symbol, document: TextDocument): void {
        // Enhanced expression validation
        if (symbol.type === SymbolType.FunctionCall) {
            // Validate function signatures
            const signature = FUNCTION_SIGNATURES[symbol.name];
            if (!signature) {
                this.addDiagnostic(
                    symbol.range,
                    `Unknown function: ${symbol.name}`,
                    DiagnosticSeverity.Warning,
                    { category: TableauDiagnosticCategory.INVALID_FUNCTION, functionName: symbol.name }
                );
            }
        }
        
        // Validate field references
        if (symbol.type === SymbolType.FieldReference) {
            this.validateFieldReference(symbol);
        }
        
        // Recursively validate nested expressions
        if (symbol.children) {
            for (const child of symbol.children) {
                this.validateExpressionSyntax(child, document);
            }
        }
    }
    
    /**
     * R2.2: Enhanced diagnostic creation with categories
     */
    private addDiagnostic(
        range: Range, 
        message: string, 
        severity: DiagnosticSeverity, 
        context?: {
            category: TableauDiagnosticCategory;
            blockType?: string;
            branchType?: string;
            functionName?: string;
        }
    ): void {
        const diagnostic: Diagnostic = {
            severity,
            range,
            message,
            source: 'Tableau LSP',
            code: context?.category || 'TABLEAU_VALIDATION'
        };
        
        // Add additional context for enhanced diagnostics
        if (context) {
            diagnostic.data = {
                category: context.category,
                blockType: context.blockType,
                branchType: context.branchType,
                functionName: context.functionName
            };
        }
        
        this.diagnostics.push(diagnostic);
    }
    
    /**
     * Get diagnostic statistics for reporting
     */
    public getDiagnosticStats(): { [key: string]: number } {
        const stats: { [key: string]: number } = {};
        
        for (const diagnostic of this.diagnostics) {
            const category = diagnostic.code as string || 'UNKNOWN';
            stats[category] = (stats[category] || 0) + 1;
        }
        
        return stats;
    }
    
    /**
     * Clear diagnostics for cleanup
     */
    public clearDiagnostics(): void {
        this.diagnostics = [];
    }
}
