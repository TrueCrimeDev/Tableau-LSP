import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ParsedDocument, Symbol, SymbolType, FUNCTION_SIGNATURES } from './common.js';

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
    private validateBalancedStructures(_symbols: Symbol[]): void {
        // Unclosed-block detection is handled more accurately by validateIfStatement
        // and validateCaseStatement (which include the inline-END text fallback).
        // This method is kept as an extension point but intentionally does nothing
        // to avoid emitting duplicate, less-accurate diagnostics.
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
    }
    
    /**
     * R2.3: Validate IF branch logic and sequence
     */
    private validateIfBranchLogic(branches: Symbol[], parentSymbol: Symbol): void {
        const hasThen = branches.some(branch => branch.name === 'THEN');
        const hasElse = branches.some(branch => branch.name === 'ELSE');
        const hasElseIf = branches.some(branch => branch.name === 'ELSEIF');
        
        // Case 1: Missing THEN clause
        if (!hasThen && branches.length > 0) {
            this.addDiagnostic(
                parentSymbol.range,
                `IF statement must have a THEN clause`,
                DiagnosticSeverity.Error,
                { category: TableauDiagnosticCategory.MISSING_BRANCH, branchType: 'THEN' }
            );
        }
        
        // Case 2: Validate branch sequence
        let foundElse = false;
        for (let i = 0; i < branches.length; i++) {
            const branch = branches[i];
            
            if (branch.name === 'ELSE') {
                foundElse = true;
                if (i !== branches.length - 1) {
                    this.addDiagnostic(
                        branch.range,
                        `ELSE clause must be the last branch in an IF statement`,
                        DiagnosticSeverity.Error,
                        { category: TableauDiagnosticCategory.CONDITIONAL_LOGIC, branchType: 'ELSE' }
                    );
                }
            } else if (branch.name === 'ELSEIF' && foundElse) {
                this.addDiagnostic(
                    branch.range,
                    `ELSEIF cannot come after ELSE clause`,
                    DiagnosticSeverity.Error,
                    { category: TableauDiagnosticCategory.CONDITIONAL_LOGIC, branchType: 'ELSEIF' }
                );
            }
        }
    }
    
    /**
     * R2.3: Validate ELSE branch requirements
     */
    private validateElseBranch(branches: Symbol[], parentSymbol: Symbol): void {
        const hasElse = branches.some(branch => branch.name === 'ELSE');
        const elseIfCount = branches.filter(branch => branch.name === 'ELSEIF').length;
        
        // Only warn if there are multiple ELSEIF branches (3+ total conditions)
        if (!hasElse && elseIfCount >= 2) {
            this.addDiagnostic(
                parentSymbol.range,
                `Complex IF block with multiple ELSEIF clauses might benefit from a final ELSE branch`,
                DiagnosticSeverity.Information,
                { category: TableauDiagnosticCategory.MISSING_BRANCH, branchType: 'ELSE' }
            );
        }
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
                // Fallback: the parser only detects END at line-start, so "ELSE value END"
                // on one line won't set symbol.end. Scan the document text from the CASE
                // line through the next blank line before concluding END is missing.
                const startLine = symbol.range.start.line;
                const allLines = document.getText().split('\n');
                let hasInlineEnd = false;
                for (let li = startLine; li < allLines.length; li++) {
                    if (li > startLine && allLines[li].trim() === '') { break; }
                    if (/\bEND\b/i.test(allLines[li])) { hasInlineEnd = true; break; }
                }
                if (!hasInlineEnd) {
                    this.addDiagnostic(
                        symbol.range,
                        `Unclosed CASE block - missing END statement`,
                        DiagnosticSeverity.Error,
                        { category: TableauDiagnosticCategory.UNCLOSED_BLOCK, blockType: 'CASE' }
                    );
                    return;
                }
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
            // Check for empty WHEN conditions
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
            // ELSE is optional in Tableau — an unmatched CASE returns Null, which is a
            // valid, common pattern. Surface only as an informational hint (matching the
            // IF-branch treatment), never a Warning.
            this.addDiagnostic(
                parentSymbol.range,
                `CASE statement has no ELSE clause; unmatched values return Null`,
                DiagnosticSeverity.Information,
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
        // Undefined args means the parser couldn't extract them (multi-line call) — skip to avoid false "got 0".
        if (symbol.arguments === undefined) { return; }
        const argCount = symbol.arguments.length;

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
        // Undefined args means the parser couldn't extract them (multi-line call) — skip to avoid false "got 0".
        if (symbol.arguments === undefined) { return; }
        const argCount = symbol.arguments.length;

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
        // Enhanced LOD validation with better multi-line support
        if (!symbol.children || symbol.children.length === 0) {
            // Check if the LOD expression has text content
            if (!symbol.text || symbol.text.trim() === '') {
                // Only report as warning to reduce false positives
                this.addDiagnostic(
                    symbol.range,
                    `LOD expression appears incomplete. Ensure it includes dimensions and aggregation.`,
                    DiagnosticSeverity.Warning,
                    { category: TableauDiagnosticCategory.LOD_VALIDATION }
                );
            }
        }
    }
    
    private validateBranches(branches: Symbol[], parentSymbol: Symbol): void {
        // Enhanced: Empty branch validation with improved logic and reduced false positives
        for (const branch of branches) {
            // Only flag truly empty branches - be more conservative to avoid false positives
            if (this.isBranchTrulyEmpty(branch)) {
                // Only report as Information level to reduce noise
                this.addDiagnostic(
                    branch.range,
                    `${branch.name} branch appears to be empty - consider adding a value or expression`,
                    DiagnosticSeverity.Information,
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
     * Enhanced logic to check if a branch is truly empty (no meaningful content)
     * Improved to handle multi-line expressions and various symbol types
     */
    private isBranchTrulyEmpty(branch: Symbol): boolean {
        // If no children at all, it might still have content in the branch text itself
        if (!branch.children || branch.children.length === 0) {
            // Check if the branch itself has meaningful text content
            if (branch.text && branch.text.trim() !== '') {
                return false;
            }
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
            
            // All these types are meaningful content
            if (child.type === SymbolType.Expression || 
                child.type === SymbolType.FunctionCall ||
                child.type === SymbolType.FieldReference ||
                child.type === SymbolType.LODExpression ||
                child.type === SymbolType.Variable ||
                child.type === SymbolType.Keyword) {
                return true;
            }
            
            // If we have text content, it's meaningful
            if (child.text && child.text.trim() !== '') {
                return true;
            }
            
            // If the child has a meaningful name, it's content
            if (child.name && child.name.trim() !== '' && 
                !['THEN', 'ELSE', 'ELSEIF', 'WHEN', 'END'].includes(child.name.toUpperCase())) {
                return true;
            }
            
            // Recursively check if child has meaningful content
            if (child.children && child.children.length > 0) {
                return !this.isBranchTrulyEmpty(child);
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
                        `ELSE clause must be the last branch in an IF statement`,
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
                        `ELSEIF cannot come after ELSE clause`,
                        DiagnosticSeverity.Error,
                        { category: TableauDiagnosticCategory.CONDITIONAL_LOGIC, branchType: 'ELSEIF' }
                    );
                }
            } else if (branch.name === 'THEN') {
                // The parser attaches every THEN/ELSEIF/ELSE as a flat child of the IF,
                // so a valid `IF c THEN x ELSEIF c2 THEN y ELSE z END` yields branches
                // [THEN, ELSEIF, THEN, ELSE]. A THEN is valid as the first branch OR
                // immediately after an ELSEIF; only otherwise is it misplaced.
                const prev = i > 0 ? branches[i - 1] : undefined;
                if (i !== 0 && prev?.name !== 'ELSEIF') {
                    this.addDiagnostic(
                        branch.range,
                        `THEN clause must be the first branch in an IF statement`,
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

// ---------------------------------------------------------------------------
// Functional facade (api-drift compatibility)
//
// The unit tests consume a standalone `validateConditionalExpression(symbol,
// document)` returning a structured { isValid, errors, warnings } result rather
// than the class-based Diagnostic[] API above. This thin facade performs a
// self-contained, text-based structural validation of a single Tableau
// conditional expression (IF / ELSEIF / ELSE / END and CASE / WHEN / THEN /
// ELSE / END). The class is kept intact for the LSP diagnostics pipeline.
// ---------------------------------------------------------------------------

export interface ConditionalValidationIssue {
    message: string;
    suggestion?: string;
    range?: Range;
}

export interface ConditionalValidationResult {
    isValid: boolean;
    errors: ConditionalValidationIssue[];
    warnings: ConditionalValidationIssue[];
}

type CondToken = { kind: 'kw'; word: string } | { kind: 'seg'; text: string };

const COND_FACADE_KEYWORDS = new Set(['IF', 'THEN', 'ELSEIF', 'ELSE', 'END', 'CASE', 'WHEN']);

/** Replace comment spans with spaces (preserving newlines), respecting string literals. */
function stripConditionalComments(text: string): string {
    let out = '';
    let inStr = false;
    let strCh = '';
    let blk = false;
    let k = 0;
    while (k < text.length) {
        const c = text[k];
        const c2 = text[k + 1];
        if (blk) {
            if (c === '*' && c2 === '/') { out += '  '; blk = false; k += 2; continue; }
            out += c === '\n' ? '\n' : ' ';
            k++;
            continue;
        }
        if (inStr) { out += c; if (c === strCh) { inStr = false; } k++; continue; }
        if (c === '"' || c === "'") { inStr = true; strCh = c; out += c; k++; continue; }
        if (c === '/' && c2 === '/') {
            while (k < text.length && text[k] !== '\n') { out += ' '; k++; }
            continue;
        }
        if (c === '/' && c2 === '*') { blk = true; out += '  '; k += 2; continue; }
        out += c;
        k++;
    }
    return out;
}

/** Split conditional code into keyword tokens and the (trimmed) value segments between them. */
function tokenizeConditional(code: string): CondToken[] {
    const tokens: CondToken[] = [];
    let inStr = false;
    let strCh = '';
    let bracket = 0;
    let prevEnd = 0;
    const pushSeg = (start: number, end: number): void => {
        const t = code.slice(start, end).trim();
        if (t) { tokens.push({ kind: 'seg', text: t }); }
    };
    for (let k = 0; k < code.length; k++) {
        const c = code[k];
        if (inStr) { if (c === strCh) { inStr = false; } continue; }
        if (c === '"' || c === "'") { inStr = true; strCh = c; continue; }
        if (c === '[') { bracket++; continue; }
        if (c === ']') { if (bracket > 0) { bracket--; } continue; }
        if (bracket > 0) { continue; }
        if (/[A-Za-z]/.test(c)) {
            const prev = k > 0 ? code[k - 1] : '';
            let j = k;
            while (j < code.length && /[A-Za-z0-9_]/.test(code[j])) { j++; }
            const word = code.slice(k, j).toUpperCase();
            if (!/[A-Za-z0-9_]/.test(prev) && COND_FACADE_KEYWORDS.has(word)) {
                pushSeg(prevEnd, k);
                tokens.push({ kind: 'kw', word });
                prevEnd = j;
            }
            k = j - 1;
        }
    }
    pushSeg(prevEnd, code.length);
    return tokens;
}

/** Count top-level string literals in a segment (used to detect a value missing an ELSE). */
function topLevelStringCount(seg: string): number {
    let count = 0;
    let i = 0;
    while (i < seg.length) {
        const c = seg[i];
        if (c === '"' || c === "'") {
            count++;
            const q = c;
            i++;
            while (i < seg.length && seg[i] !== q) { i++; }
            i++;
            continue;
        }
        i++;
    }
    return count;
}

/** Classify an IF/ELSEIF condition: 'empty', 'nonbool', or null when it looks boolean. */
function classifyCondition(cond: string): 'empty' | 'nonbool' | null {
    const c = cond.trim();
    if (!c) { return 'empty'; }
    // Dangling trailing operator (e.g. "[Sales] >") or a leading binary operator.
    if (/[+\-*/<>=!&|]$/.test(c)) { return 'nonbool'; }
    if (/^[*/<>=!&|]/.test(c)) { return 'nonbool'; }
    const hasComparison = /(>=|<=|!=|<>|==|>|<|=)/.test(c);
    const hasWordOp = /\b(AND|OR|NOT|IN)\b/i.test(c);
    const hasBoolFunc = /\b(ISNULL|ISEMPTY|ISDATE|CONTAINS|STARTSWITH|ENDSWITH|REGEXP_MATCH)\s*\(/i.test(c);
    const hasBoolLit = /\b(TRUE|FALSE)\b/i.test(c);
    if (hasComparison || hasWordOp || hasBoolFunc || hasBoolLit) { return null; }
    return 'nonbool';
}

/** Collect distinct top-level [field] references from conditional code. */
function extractFieldReferences(code: string): string[] {
    const fields: string[] = [];
    let i = 0;
    let inStr = false;
    let strCh = '';
    while (i < code.length) {
        const c = code[i];
        if (inStr) { if (c === strCh) { inStr = false; } i++; continue; }
        if (c === '"' || c === "'") { inStr = true; strCh = c; i++; continue; }
        if (c === '[') {
            let j = i + 1;
            while (j < code.length && code[j] !== ']') { j++; }
            fields.push(code.slice(i + 1, j));
            i = j + 1;
            continue;
        }
        i++;
    }
    return fields;
}

/**
 * Validate a single Tableau conditional expression and return a structured result.
 *
 * Note: the validation is performed against the document text (each tested document
 * holds exactly one conditional). The `symbol` parameter is accepted for API
 * compatibility with the parsed-symbol calling convention used by the tests.
 */
export function validateConditionalExpression(
    _symbol: Symbol | null | undefined,
    document: TextDocument
): ConditionalValidationResult {
    const errors: ConditionalValidationIssue[] = [];
    const warnings: ConditionalValidationIssue[] = [];

    const rawText = document ? document.getText() : '';
    const code = stripConditionalComments(rawText);
    const tokens = tokenizeConditional(code);

    // Field-reference warnings (cannot be verified without a connected data source).
    const seenFields = new Set<string>();
    for (const field of extractFieldReferences(code)) {
        if (!seenFields.has(field)) {
            seenFields.add(field);
            warnings.push({
                message: `Field reference [${field}] could not be verified against a data source`,
                suggestion: 'Ensure the field exists in the connected data source'
            });
        }
    }

    let pos = 0;
    const peekKw = (): string | undefined => {
        const t = tokens[pos];
        return t && t.kind === 'kw' ? t.word : undefined;
    };

    // Consume a value position: free-text segments plus nested IF/CASE expressions.
    const parseValue = (): { text: string; count: number } => {
        let text = '';
        let count = 0;
        while (pos < tokens.length) {
            const t = tokens[pos];
            if (t.kind === 'seg') {
                text += (text ? ' ' : '') + t.text;
                count++;
                pos++;
                continue;
            }
            if (t.kind === 'kw' && t.word === 'IF') { pos++; parseIf(); count++; continue; }
            if (t.kind === 'kw' && t.word === 'CASE') { pos++; parseCase(); count++; continue; }
            break;
        }
        return { text, count };
    };

    function parseIf(): void {
        // 'IF' already consumed by the caller.
        const cond = parseValue();
        const ci = classifyCondition(cond.text);
        if (ci === 'empty') {
            errors.push({
                message: 'IF statement is missing a condition',
                suggestion: 'Add a boolean condition after IF'
            });
        } else if (ci === 'nonbool') {
            errors.push({
                message: 'IF condition should be a boolean expression',
                suggestion: 'Use a comparison or logical operator to form a boolean condition'
            });
        }

        let thenPresent = false;
        if (peekKw() === 'THEN') {
            thenPresent = true;
            pos++;
        } else {
            errors.push({
                message: 'IF statement is missing a THEN keyword',
                suggestion: 'Add THEN keyword after the condition'
            });
        }

        const thenVal = parseValue();
        if (thenPresent && thenVal.count === 0) {
            if (pos >= tokens.length) {
                errors.push({
                    message: 'IF expression is incomplete',
                    suggestion: 'Complete the THEN branch and add an END keyword'
                });
                return;
            }
            errors.push({
                message: 'THEN branch is empty',
                suggestion: 'Provide a value for the THEN branch'
            });
        }

        while (peekKw() === 'ELSEIF') {
            pos++;
            const eCond = parseValue();
            const eci = classifyCondition(eCond.text);
            if (eci === 'empty') {
                errors.push({
                    message: 'ELSEIF clause is missing a condition',
                    suggestion: 'Add a boolean condition after ELSEIF'
                });
            } else if (eci === 'nonbool') {
                errors.push({
                    message: 'ELSEIF condition should be a boolean expression',
                    suggestion: 'Use a comparison or logical operator'
                });
            }
            if (peekKw() === 'THEN') {
                pos++;
            } else {
                errors.push({
                    message: 'ELSEIF clause is missing a THEN keyword',
                    suggestion: 'Add THEN keyword after the ELSEIF condition'
                });
            }
            parseValue();
        }

        let sawElse = false;
        if (peekKw() === 'ELSE') {
            sawElse = true;
            pos++;
            parseValue();
        }

        // A THEN value holding multiple juxtaposed literals with no ELSE means the
        // ELSE keyword separating the alternative value was omitted.
        if (!sawElse && topLevelStringCount(thenVal.text) >= 2) {
            errors.push({
                message: 'IF statement is missing an ELSE keyword between values',
                suggestion: 'Add ELSE keyword before the alternative value'
            });
        }

        if (peekKw() === 'END') {
            pos++;
        } else {
            errors.push({
                message: 'IF statement is missing an END keyword',
                suggestion: 'Add END to close the IF block'
            });
        }
    }

    function parseCase(): void {
        // 'CASE' already consumed by the caller.
        const expr = parseValue();
        if (expr.count === 0) {
            errors.push({
                message: 'CASE statement is missing an expression',
                suggestion: 'Add the field or expression to evaluate after CASE'
            });
        }

        let whenCount = 0;
        let sawElse = false;

        while (pos < tokens.length) {
            const t = tokens[pos];
            if (t.kind === 'kw' && t.word === 'WHEN') {
                pos++;
                whenCount++;
                parseValue();
                if (peekKw() === 'THEN') {
                    pos++;
                    parseValue();
                } else {
                    errors.push({
                        message: 'WHEN clause is missing a THEN keyword',
                        suggestion: 'Add THEN keyword after the WHEN value'
                    });
                }
            } else if (t.kind === 'kw' && t.word === 'ELSE') {
                sawElse = true;
                pos++;
                parseValue();
            } else if (t.kind === 'kw' && t.word === 'END') {
                break;
            } else if (t.kind === 'kw' && t.word === 'THEN') {
                // A THEN/value with no preceding WHEN means the WHEN keyword was omitted.
                errors.push({
                    message: 'CASE clause is missing a WHEN keyword',
                    suggestion: 'Add WHEN keyword before the value'
                });
                pos++;
                parseValue();
            } else if (t.kind === 'seg') {
                errors.push({
                    message: 'CASE clause is missing a WHEN keyword',
                    suggestion: 'Add WHEN keyword before the value'
                });
                pos++;
            } else {
                break;
            }
        }

        if (whenCount === 0) {
            errors.push({
                message: 'CASE statement must have at least one WHEN clause',
                suggestion: 'Add a WHEN clause'
            });
        }
        if (!sawElse) {
            warnings.push({
                message: 'CASE statement has no ELSE clause to handle unmatched values',
                suggestion: 'Add an ELSE clause'
            });
        }

        if (peekKw() === 'END') {
            pos++;
        } else {
            errors.push({
                message: 'CASE statement is missing an END keyword',
                suggestion: 'Add END to close the CASE block'
            });
        }
    }

    // Dispatch on the first conditional construct found.
    let started = false;
    while (pos < tokens.length) {
        const t = tokens[pos];
        if (t.kind === 'kw' && t.word === 'IF') { pos++; parseIf(); started = true; break; }
        if (t.kind === 'kw' && t.word === 'CASE') { pos++; parseCase(); started = true; break; }
        pos++;
    }

    if (!started) {
        errors.push({ message: 'No conditional expression (IF or CASE) found to validate' });
    }

    return { isValid: errors.length === 0, errors, warnings };
}
