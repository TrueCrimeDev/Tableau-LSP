import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ParsedDocument, Symbol, SymbolType } from './common.js';

/**
 * Replace the CONTENTS of string literals and line/block comments with spaces,
 * preserving every quote/brace position, line break, and the overall length. Delimiter
 * counting and brace scanning run against this masked text so a '(' or '{' that lives
 * inside a string or comment is never mistaken for a real, unbalanced delimiter.
 */
function maskStringsAndComments(text: string): string {
    const out: string[] = [];
    let state: 'code' | 'line' | 'block' | 'str' | 'field' = 'code';
    let quote = '';
    let i = 0;
    while (i < text.length) {
        const c = text[i];
        const c2 = text[i + 1];
        if (state === 'code') {
            if (c === '/' && c2 === '/') { out.push('  '); i += 2; state = 'line'; continue; }
            if (c === '/' && c2 === '*') { out.push('  '); i += 2; state = 'block'; continue; }
            if (c === '"' || c === "'") { quote = c; out.push(c); i++; state = 'str'; continue; }
            // Enter a [field reference]; its contents (which may contain quotes, parens or
            // braces, e.g. [Customer's Type], [Profit (USD)]) must not be interpreted.
            if (c === '[') { out.push('['); i++; state = 'field'; continue; }
            out.push(c); i++; continue;
        }
        if (state === 'line') {
            if (c === '\n') { out.push('\n'); i++; state = 'code'; continue; }
            out.push(' '); i++; continue;
        }
        if (state === 'block') {
            if (c === '*' && c2 === '/') { out.push('  '); i += 2; state = 'code'; continue; }
            out.push(c === '\n' ? '\n' : ' '); i++; continue;
        }
        if (state === 'field') {
            if (c === ']') {
                if (c2 === ']') { out.push('  '); i += 2; continue; } // doubled ]] = literal ] in the name
                out.push(']'); i++; state = 'code'; continue;
            }
            out.push(c === '\n' ? '\n' : ' '); i++; continue;
        }
        // state === 'str'
        if (c === quote) {
            if (c2 === quote) { out.push(quote, quote); i += 2; continue; } // doubled-quote escape
            out.push(quote); i++; state = 'code'; continue;
        }
        out.push(c === '\n' ? '\n' : ' '); i++; continue;
    }
    return out.join('');
}

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

            // Text-based LOD validation for brace blocks the parser does not surface
            // as LODExpression symbols (e.g. those missing a FIXED/INCLUDE/EXCLUDE type).
            this.processLODBraceScan(document);

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
    private addBoundaryGuidance(symbol: Symbol, _document: TextDocument): void {
        // The parser records only the keyword's own (single-line) range on IF/CASE
        // symbols, so document.getText(symbol.range) never contains a newline -- even
        // for expressions that clearly span many lines. Derive the true span from the
        // symbol's subtree instead of from its (single-line) range.
        let startLine = symbol.range.start.line;
        let endLine = symbol.range.end.line;
        const visit = (s: Symbol): void => {
            startLine = Math.min(startLine, s.range.start.line);
            endLine = Math.max(endLine, s.range.end.line);
            if (s.children) {
                for (const child of s.children) {
                    visit(child);
                }
            }
        };
        visit(symbol);

        // Only add guidance for expressions that span multiple lines
        if (endLine > startLine) {
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
     * R2.5: Text-based LOD validation independent of the parser's symbol table.
     *
     * The parser only emits an LODExpression symbol when an aggregation TYPE keyword
     * (FIXED / INCLUDE / EXCLUDE) is present, so a brace block that omits the type --
     * e.g. `{ : SUM([Sales]) }` -- never reaches processLODExpression(). Scan the raw
     * text for balanced top-level brace blocks and flag any that lack a type keyword.
     */
    private processLODBraceScan(document: TextDocument): void {
        // Scan a string/comment-masked copy so a { } inside a string literal or comment
        // (e.g. "{draft}") is not mistaken for an LOD expression. Positions are preserved.
        const text = maskStringsAndComments(document.getText());
        let depth = 0;
        let blockStart = -1;

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch === '{') {
                if (depth === 0) {
                    blockStart = i;
                }
                depth++;
            } else if (ch === '}' && depth > 0) {
                depth--;
                if (depth === 0 && blockStart >= 0) {
                    const block = text.slice(blockStart, i + 1);
                    // Only flag when the aggregation type is missing -- blocks that DO
                    // carry FIXED/INCLUDE/EXCLUDE are surfaced as LODExpression symbols
                    // and validated by processLODExpression(), so flagging here too
                    // would double-report.
                    if (!/\b(FIXED|INCLUDE|EXCLUDE)\b/i.test(block)) {
                        const range = Range.create(
                            document.positionAt(blockStart),
                            document.positionAt(i + 1)
                        );
                        this.addDiagnostic(
                            range,
                            `Incomplete LOD expression. Specify an aggregation type: FIXED, INCLUDE, or EXCLUDE.`,
                            DiagnosticSeverity.Information,
                            { category: AdvancedErrorRecoveryCategory.INCOMPLETE_LOD }
                        );
                    }
                    blockStart = -1;
                }
            }
        }
    }

    /**
     * R2.5: Process partial expressions during editing
     * Requirement 6.11: Provide graceful error recovery for partial expressions
     */
    private processPartialExpressions(document: TextDocument, parsedDocument: ParsedDocument): void {
        // Work on a string/comment-masked copy so delimiters inside strings or comments
        // are not counted, and lines that are entirely comment/string collapse to blank.
        const lines = maskStringsAndComments(document.getText()).split('\n');

        // Pre-compute, per contiguous calculation block, the balance of (), [] and {}.
        // A "block" is a run of non-blank lines. Within a balanced block, a line that
        // opens more than it closes is a continuation of a multi-line construct — not a
        // partial expression — so we only flag a delimiter as partial when its BLOCK is
        // genuinely imbalanced for that delimiter kind.
        const parenBal: number[] = new Array(lines.length).fill(0);
        const bracketBal: number[] = new Array(lines.length).fill(0);
        const braceBal: number[] = new Array(lines.length).fill(0);
        let blockStart = -1;

        const countOf = (s: string, ch: string): number => s.split(ch).length - 1;

        const flushBlock = (end: number) => {
            if (blockStart < 0) { return; }
            let p = 0, b = 0, c = 0;
            for (let j = blockStart; j < end; j++) {
                p += countOf(lines[j], '(') - countOf(lines[j], ')');
                b += countOf(lines[j], '[') - countOf(lines[j], ']');
                c += countOf(lines[j], '{') - countOf(lines[j], '}');
            }
            for (let j = blockStart; j < end; j++) {
                parenBal[j] = p; bracketBal[j] = b; braceBal[j] = c;
            }
            blockStart = -1;
        };

        for (let i = 0; i <= lines.length; i++) {
            const isEmpty = i === lines.length || lines[i].trim() === '';
            if (isEmpty) {
                flushBlock(i);
            } else if (blockStart < 0) {
                blockStart = i;
            }
        }

        // Look for lines that might contain partial expressions
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Skip blank lines (this includes lines that were entirely comment/string).
            if (line === '') {
                continue;
            }

            // Check for potential partial expressions
            if (this.isLikelyPartialExpression(line)) {
                // Check if this line is already part of a valid expression
                if (!this.isLinePartOfValidExpression(i, parsedDocument)) {
                    // A trailing comma/operator is a normal continuation when ANY later
                    // content line exists (Tableau ignores blank lines within an
                    // expression) — only a truly dangling final line is incomplete.
                    let hasFollowingContentLine = false;
                    for (let k = i + 1; k < lines.length; k++) {
                        if (lines[k].trim() !== '') { hasFollowingContentLine = true; break; }
                    }
                    this.handlePartialExpression(
                        line, i, document,
                        { paren: parenBal[i], bracket: bracketBal[i], brace: braceBal[i] },
                        hasFollowingContentLine
                    );
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
        // A line should only be treated as "already valid" (and thus exempt from
        // partial-expression hints) when it is the INTERIOR of a genuine multi-line
        // construct. A symbol confined to this single line does NOT prove the line is
        // complete: the parser still extracts partial sub-symbols (e.g. the IF keyword
        // or a field reference) from an incomplete line. The previous check returned
        // true whenever any symbol overlapped the line, which suppressed essentially
        // all partial-expression detection.
        const spansAcross = (symbol: Symbol): boolean => {
            const { start, end } = symbol.range;
            if ((start.line < lineIndex && end.line >= lineIndex) ||
                (start.line <= lineIndex && end.line > lineIndex)) {
                return true;
            }
            if (symbol.children) {
                for (const child of symbol.children) {
                    if (spansAcross(child)) {
                        return true;
                    }
                }
            }
            return false;
        };

        for (const symbol of parsedDocument.symbols) {
            if (spansAcross(symbol)) {
                return true;
            }
        }

        return false;
    }
    
    /**
     * R2.5: Handle partial expressions during editing
     */
    private handlePartialExpression(line: string, lineIndex: number, document: TextDocument, blockBalance: { paren: number; bracket: number; brace: number } = { paren: 0, bracket: 0, brace: 0 }, hasFollowingContentLine: boolean = false): void {
        const range = Range.create(lineIndex, 0, lineIndex, line.length);

        // Determine the type of partial expression
        // Use word-boundary check so IIF(...) is not confused with the IF keyword
        if (/\bIF\b/.test(line) && !/\bIIF\b/.test(line) && !line.includes('THEN')) {
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
        } else if (blockBalance.brace !== 0 && line.includes('{') && !line.includes('}')) {
            // Only when the BLOCK has unmatched braces — a multi-line LOD whose braces
            // balance across lines is valid, not partial.
            this.addDiagnostic(
                range,
                `Partial LOD expression detected. Complete with aggregation type, dimensions, and aggregation.`,
                DiagnosticSeverity.Information,
                { category: AdvancedErrorRecoveryCategory.PARTIAL_EXPRESSION }
            );
        } else if (blockBalance.bracket !== 0 && (line.match(/\[/g) || []).length !== (line.match(/\]/g) || []).length) {
            // Only when the BLOCK has unmatched brackets. Check brackets before parens:
            // a line like `SUM([Sales` is unbalanced in both, but the field-reference hint
            // is the more specific and useful one.
            this.addDiagnostic(
                range,
                `Partial field reference detected. Ensure brackets are balanced.`,
                DiagnosticSeverity.Information,
                { category: AdvancedErrorRecoveryCategory.PARTIAL_EXPRESSION }
            );
        } else if (blockBalance.paren !== 0 && (line.match(/\(/g) || []).length > (line.match(/\)/g) || []).length) {
            // Only flag when the entire block is unbalanced AND this line opens more than
            // it closes. Lines within a balanced multi-line nested call are not partial.
            this.addDiagnostic(
                range,
                `Partial function call or expression detected. Ensure parentheses are balanced.`,
                DiagnosticSeverity.Information,
                { category: AdvancedErrorRecoveryCategory.PARTIAL_EXPRESSION }
            );
        } else if (!hasFollowingContentLine && /[+\-*\/=<>!&|,]$/.test(line)) {
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