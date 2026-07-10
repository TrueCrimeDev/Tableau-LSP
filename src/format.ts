

import { FormattingOptions, Range, TextEdit } from 'vscode-languageserver';
import { Token, TokenType, tokenize } from './lexer.js';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * R6.3: Multi-line expression formatting configuration
 */
export interface TableauFormattingOptions extends FormattingOptions {
    profile?: 'readable' | 'compact' | 'expanded';
    maxLineLength?: number;
    keywordCase?: 'upper' | 'lower' | 'preserve';
    logicalOperatorPosition?: 'leading' | 'trailing';
    functionArguments?: 'auto' | 'compact' | 'one-per-line';
    finalNewline?: boolean;
}

interface MultiLineFormattingConfig {
    preserveLogicalLineBreaks: boolean;
    maxLineLength: number;
    indentSize: number;
    useSpaces: boolean;
    alignParameters: boolean;
    breakAfterOperators: boolean;
    wrapLongExpressions: boolean;
    keywordCase: 'upper' | 'lower' | 'preserve';
    logicalOperatorPosition: 'leading' | 'trailing';
    functionArguments: 'auto' | 'compact' | 'one-per-line';
    finalNewline: boolean;
    blockStyle: 'legacy' | 'readable';
}

/**
 * R6.3: Default formatting configuration
 */
const DEFAULT_FORMATTING_CONFIG: MultiLineFormattingConfig = {
    preserveLogicalLineBreaks: true,
    maxLineLength: 120,
    indentSize: 4,
    useSpaces: true,
    alignParameters: true,
    breakAfterOperators: false,
    wrapLongExpressions: true,
    keywordCase: 'upper',
    logicalOperatorPosition: 'leading',
    functionArguments: 'auto',
    finalNewline: false,
    blockStyle: 'legacy'
};

const PROFILE_DEFAULTS: Record<NonNullable<TableauFormattingOptions['profile']>, Partial<MultiLineFormattingConfig>> = {
    readable: {
        maxLineLength: 100,
        functionArguments: 'auto',
        logicalOperatorPosition: 'leading',
        blockStyle: 'readable',
    },
    compact: {
        maxLineLength: 160,
        functionArguments: 'compact',
        logicalOperatorPosition: 'trailing',
        blockStyle: 'readable',
    },
    expanded: {
        maxLineLength: 80,
        functionArguments: 'one-per-line',
        logicalOperatorPosition: 'leading',
        blockStyle: 'readable',
    },
};

/**
 * R6.3: Expression context for intelligent formatting
 */
interface ExpressionContext {
    type: 'if' | 'case' | 'function' | 'lod' | 'arithmetic' | 'logical' | 'unknown';
    depth: number;
    isMultiLine: boolean;
    hasComplexNesting: boolean;
    startToken: Token;
    endToken?: Token;
}

/**
 * R6.3: Enhanced format function with multi-line expression support
 */
export function format(document: TextDocument, options: TableauFormattingOptions): TextEdit[] {
    const config = createFormattingConfig(options);
    const tokens = tokenize(document.getText());

    // R6.4: Treat empty / whitespace-only input (only an EOF token) as a no-op.
    if (tokens.filter(t => t.type !== TokenType.EOF).length === 0) {
        return [];
    }

    try {
        // R6.3: Analyze expression structure for intelligent formatting
        const expressions = analyzeExpressionStructure(tokens);
        
        // R6.3: Format with multi-line awareness
        const formattedText = formatWithMultiLineSupport(tokens, expressions, config);
        
        return [
            TextEdit.replace(
                Range.create(
                    { line: 0, character: 0 },
                    document.positionAt(document.getText().length)
                ),
                formattedText
            ),
        ];
    } catch (error) {
        // R6.4: Robust error handling - preserve original content on failure
        console.error('Formatting error:', error);
        return [];
    }
}

/** Format a selected calculation without rewriting the surrounding document. */
export function formatRange(
    document: TextDocument,
    range: Range,
    options: TableauFormattingOptions
): TextEdit[] {
    const selectedText = document.getText(range);
    if (!selectedText.trim()) {
        return [];
    }
    const fragment = TextDocument.create(
        `${document.uri}#format-selection`,
        document.languageId,
        document.version,
        selectedText
    );
    const edits = format(fragment, options);
    if (!edits.length) {
        return [];
    }
    const baseIndent = /^[\t ]*/.exec(selectedText)?.[0] ?? '';
    const formatted = baseIndent
        ? edits[0].newText.split('\n').map(line => line ? `${baseIndent}${line}` : line).join('\n')
        : edits[0].newText;
    return [TextEdit.replace(range, formatted)];
}

/**
 * R6.3: Create formatting configuration from VS Code options
 */
function createFormattingConfig(options: TableauFormattingOptions): MultiLineFormattingConfig {
    const profileDefaults = options.profile ? PROFILE_DEFAULTS[options.profile] : {};
    return {
        ...DEFAULT_FORMATTING_CONFIG,
        ...profileDefaults,
        indentSize: options.tabSize || DEFAULT_FORMATTING_CONFIG.indentSize,
        useSpaces: options.insertSpaces !== false,
        maxLineLength: options.maxLineLength ?? profileDefaults.maxLineLength ?? DEFAULT_FORMATTING_CONFIG.maxLineLength,
        keywordCase: options.keywordCase ?? DEFAULT_FORMATTING_CONFIG.keywordCase,
        logicalOperatorPosition: options.logicalOperatorPosition ??
            profileDefaults.logicalOperatorPosition ?? DEFAULT_FORMATTING_CONFIG.logicalOperatorPosition,
        functionArguments: options.functionArguments ??
            profileDefaults.functionArguments ?? DEFAULT_FORMATTING_CONFIG.functionArguments,
        finalNewline: options.finalNewline ?? DEFAULT_FORMATTING_CONFIG.finalNewline,
    };
}

/**
 * R6.3: Analyze expression structure for intelligent formatting
 */
function analyzeExpressionStructure(tokens: Token[]): ExpressionContext[] {
    const expressions: ExpressionContext[] = [];
    const stack: { token: Token; depth: number }[] = [];
    let currentDepth = 0;
    
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        
        // Track expression depth
        if (isOpeningToken(token)) {
            stack.push({ token, depth: currentDepth });
            currentDepth++;
        } else if (isClosingToken(token)) {
            const opening = stack.pop();
            if (opening) {
                const context = createExpressionContext(opening.token, token, opening.depth, tokens, i);
                expressions.push(context);
                currentDepth = Math.max(0, currentDepth - 1);
            }
        }
    }
    
    return expressions;
}

/**
 * R6.3: Create expression context from token analysis
 */
function createExpressionContext(
    startToken: Token, 
    endToken: Token, 
    depth: number, 
    tokens: Token[], 
    endIndex: number
): ExpressionContext {
    const type = determineExpressionType(startToken);
    const isMultiLine = endToken.line > startToken.line;
    const hasComplexNesting = depth > 2;
    
    return {
        type,
        depth,
        isMultiLine,
        hasComplexNesting,
        startToken,
        endToken
    };
}

/**
 * R6.3: Determine expression type from starting token
 */
function determineExpressionType(token: Token): ExpressionContext['type'] {
    switch (token.type) {
        case TokenType.If:
            return 'if';
        case TokenType.Case:
            return 'case';
        case TokenType.LParen:
            return 'function';
        case TokenType.LBrace:
            return 'lod';
        case TokenType.Plus:
        case TokenType.Minus:
        case TokenType.Star:
        case TokenType.Slash:
            return 'arithmetic';
        case TokenType.And:
        case TokenType.Or:
        case TokenType.Not:
            return 'logical';
        default:
            return 'unknown';
    }
}

/**
 * R6.3: Check if token opens an expression
 */
function isOpeningToken(token: Token): boolean {
    return [
        TokenType.If,
        TokenType.Case,
        TokenType.LParen,
        TokenType.LBrace
    ].includes(token.type);
}

/**
 * R6.3: Check if token closes an expression
 */
function isClosingToken(token: Token): boolean {
    return [
        TokenType.End,
        TokenType.RParen,
        TokenType.RBrace
    ].includes(token.type);
}

/**
 * R6.3: Format tokens with multi-line expression support
 */
function formatWithMultiLineSupport(
    tokens: Token[], 
    expressions: ExpressionContext[], 
    config: MultiLineFormattingConfig
): string {
    const formatter = new MultiLineFormatter(config);
    return formatter.format(tokens, expressions);
}

/**
 * R6.3: Multi-line expression formatter class
 */
class MultiLineFormatter {
    private config: MultiLineFormattingConfig;
    private indentLevel: number = 0;
    private currentLine: string = '';
    private result: string[] = [];
    private preserveNextLineBreak: boolean = false;
    // R6.3: Suppress the leading space that addToken would otherwise insert,
    // used to keep function calls tight (e.g. SUM([Sales]) not SUM ( [Sales] )).
    private suppressLeadingSpace: boolean = false;
    private functionExpansionStack: boolean[] = [];

    constructor(config: MultiLineFormattingConfig) {
        this.config = config;
    }

    format(tokens: Token[], expressions: ExpressionContext[]): string {
        this.indentLevel = 0;
        this.currentLine = '';
        this.result = [];
        this.preserveNextLineBreak = false;
        this.suppressLeadingSpace = false;
        this.functionExpansionStack = [];
        
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            
            if (token.type === TokenType.EOF) {
                break;
            }
            
            this.processToken(token, i, tokens, expressions);
        }
        
        // Add any remaining content
        if (this.currentLine.trim()) {
            this.result.push(this.currentLine.trimEnd());
        }
        
        const formatted = this.result.join('\n');
        return this.config.finalNewline && formatted ? `${formatted}\n` : formatted;
    }
    
    private processToken(token: Token, index: number, tokens: Token[], expressions: ExpressionContext[]): void {
        // R6.3: Handle different token types with multi-line awareness
        switch (token.type) {
            case TokenType.If:
            case TokenType.Case:
                this.handleBlockStart(token);
                break;
                
            case TokenType.Then:
                this.handleThen(token);
                break;

            case TokenType.Else:
            case TokenType.Elseif:
            case TokenType.When:
                this.handleBranchKeyword(token);
                break;
                
            case TokenType.End:
                this.handleBlockEnd(token);
                break;
                
            case TokenType.LBrace:
                this.handleLODStart(token);
                break;
                
            case TokenType.RBrace:
                this.handleLODEnd(token);
                break;
                
            case TokenType.LParen:
                this.handleFunctionStart(token, index, tokens);
                break;
                
            case TokenType.RParen:
                this.handleFunctionEnd(token);
                break;
                
            case TokenType.Comma:
                this.handleComma(token);
                break;
                
            case TokenType.And:
            case TokenType.Or:
                this.handleLogicalOperator(token);
                break;
                
            case TokenType.Plus:
            case TokenType.Minus:
            case TokenType.Star:
            case TokenType.Slash:
            case TokenType.Percent:
            case TokenType.Caret:
            case TokenType.Equal:
            case TokenType.EqualEqual:
            case TokenType.BangEqual:
            case TokenType.Greater:
            case TokenType.GreaterEqual:
            case TokenType.Less:
            case TokenType.LessEqual:
                this.handleOperator(token);
                break;

            case TokenType.Comment:
                this.handleComment(token);
                break;
                
            default:
                this.handleRegularToken(token);
                break;
        }
    }
    
    private handleBlockStart(token: Token): void {
        this.addToken(this.keywordValue(token));
        this.indentLevel++;
    }

    private handleThen(token: Token): void {
        if (this.config.blockStyle === 'legacy') {
            this.finishCurrentLine();
            this.addToken(this.keywordValue(token));
            return;
        }
        this.addToken(this.keywordValue(token));
        this.finishCurrentLine();
    }

    private handleBranchKeyword(token: Token): void {
        this.finishCurrentLine();
        if (this.config.blockStyle === 'legacy') {
            this.addToken(this.keywordValue(token));
            return;
        }
        const bodyIndent = this.indentLevel;
        this.indentLevel = Math.max(0, bodyIndent - 1);
        this.addToken(this.keywordValue(token));
        this.indentLevel = bodyIndent;
        if (token.type === TokenType.Else) {
            this.finishCurrentLine();
        }
    }
    
    private handleBlockEnd(token: Token): void {
        this.finishCurrentLine();
        this.indentLevel = Math.max(0, this.indentLevel - 1);
        this.addToken(this.keywordValue(token));
        this.finishCurrentLine();
    }
    
    private handleLODStart(token: Token): void {
        this.addToken(token.value);
        // LOD expressions can be formatted on multiple lines if complex
    }
    
    private handleLODEnd(token: Token): void {
        this.addToken(token.value);
    }
    
    private handleFunctionStart(token: Token, index: number, tokens: Token[]): void {
        // R6.3: No space before "(" and no space after it (tight call syntax).
        this.suppressLeadingSpace = true;
        this.addToken(token.value);
        this.suppressLeadingSpace = true;

        const expand = this.shouldBreakFunctionParameters(index, tokens);
        this.functionExpansionStack.push(expand);
        if (expand) {
            this.finishCurrentLine();
            this.indentLevel++;
        }
    }

    private handleFunctionEnd(token: Token): void {
        const expanded = this.functionExpansionStack.pop() ?? false;
        if (expanded) {
            this.finishCurrentLine();
            this.indentLevel = Math.max(0, this.indentLevel - 1);
        }
        // R6.3: No space before ")".
        this.suppressLeadingSpace = true;
        this.addToken(token.value);
    }

    private handleComma(token: Token): void {
        // R6.3: No space before ",", single space after.
        this.suppressLeadingSpace = true;
        this.addToken(token.value);

        // R6.3: Break after comma in complex expressions
        if (this.functionExpansionStack[this.functionExpansionStack.length - 1] ||
            this.shouldBreakAfterComma()) {
            this.finishCurrentLine();
        } else {
            this.addSpace();
        }
    }
    
    private handleLogicalOperator(token: Token): void {
        if (!this.shouldBreakAfterLogicalOperator()) {
            this.addSpace();
            this.addToken(this.keywordValue(token));
            this.addSpace();
            return;
        }
        if (this.config.logicalOperatorPosition === 'trailing') {
            this.addSpace();
            this.addToken(this.keywordValue(token));
            this.finishCurrentLine();
        } else {
            this.finishCurrentLine();
            this.addToken(this.keywordValue(token));
            this.addSpace();
        }
    }
    
    private handleOperator(token: Token): void {
        this.addSpace();
        this.addToken(token.value);
        this.addSpace();
    }
    
    private handleRegularToken(token: Token): void {
        // R6.3: Handle keywords with proper casing
        if (this.isKeyword(token)) {
            this.addToken(this.keywordValue(token));
        } else {
            this.addToken(token.value);
        }
    }

    private handleComment(token: Token): void {
        if (token.value.startsWith('//')) {
            this.addToken(token.value.trimEnd());
            this.finishCurrentLine();
            return;
        }
        const lines = token.value.split(/\r?\n/);
        for (let index = 0; index < lines.length; index++) {
            if (lines[index]) {
                this.addToken(lines[index].trimEnd());
            }
            if (index < lines.length - 1) {
                this.finishCurrentLine();
            }
        }
    }
    
    private addToken(value: string): void {
        if (this.currentLine === '') {
            this.currentLine = this.getIndentation();
        } else if (this.needsSpace() && !this.suppressLeadingSpace) {
            this.currentLine += ' ';
        }

        this.suppressLeadingSpace = false;
        this.currentLine += value;
    }
    
    private addSpace(): void {
        if (this.currentLine && !this.currentLine.endsWith(' ')) {
            this.currentLine += ' ';
        }
    }
    
    private finishCurrentLine(): void {
        if (this.currentLine.trim()) {
            this.result.push(this.currentLine.trimEnd());
        }
        this.currentLine = '';
    }
    
    private getIndentation(): string {
        const indentChar = this.config.useSpaces ? ' ' : '\t';
        const indentSize = this.config.useSpaces ? this.config.indentSize : 1;
        return indentChar.repeat(this.indentLevel * indentSize);
    }
    
    private needsSpace(): boolean {
        return this.currentLine.length > 0 && 
               !this.currentLine.endsWith(' ') && 
               !this.currentLine.endsWith('\t');
    }
    
    private isKeyword(token: Token): boolean {
        return [
            TokenType.If, TokenType.Then, TokenType.Else, TokenType.Elseif, TokenType.End,
            TokenType.Case, TokenType.When, TokenType.And, TokenType.Or, TokenType.Not,
            TokenType.Fixed, TokenType.Include, TokenType.Exclude,
            TokenType.True, TokenType.False, TokenType.Null
        ].includes(token.type);
    }

    private keywordValue(token: Token): string {
        if (this.config.keywordCase === 'preserve') {
            return token.value;
        }
        return this.config.keywordCase === 'lower'
            ? token.value.toLowerCase()
            : token.value.toUpperCase();
    }

    private shouldBreakFunctionParameters(index: number, tokens: Token[]): boolean {
        const previous = tokens[index - 1];
        if (!previous || previous.type !== TokenType.Identifier || this.config.functionArguments === 'compact') {
            return false;
        }
        let parenCount = 1;
        let paramCount = 0;
        let endIndex = index;
        
        for (let i = index + 1; i < tokens.length && parenCount > 0; i++) {
            const token = tokens[i];
            
            if (token.type === TokenType.LParen) {
                parenCount++;
            } else if (token.type === TokenType.RParen) {
                parenCount--;
                if (parenCount === 0) {
                    endIndex = i;
                }
            } else if (token.type === TokenType.Comma && parenCount === 1) {
                paramCount++;
            }
        }

        if (paramCount === 0) {
            return false;
        }
        if (this.config.functionArguments === 'one-per-line') {
            return true;
        }
        const callLength = Math.max(0, tokens[endIndex].end - previous.start);
        return this.config.wrapLongExpressions &&
            (this.currentLine.trimEnd().length + callLength > this.config.maxLineLength || paramCount >= 3);
    }
    
    private shouldBreakAfterComma(): boolean {
        // R6.3: Break after comma in complex parameter lists
        return this.config.wrapLongExpressions && 
               this.currentLine.length > this.config.maxLineLength * 0.7;
    }
    
    private shouldBreakAfterLogicalOperator(): boolean {
        return this.config.wrapLongExpressions &&
            (this.config.breakAfterOperators || this.currentLine.length > this.config.maxLineLength * 0.75);
    }
}

/**
 * R6.4: Error-handling configuration for formatting robustness
 */
interface FormattingErrorHandlingConfig {
    MAX_FORMATTING_ATTEMPTS: number;
    ENABLE_PARTIAL_FORMATTING: boolean;
    PRESERVE_ORIGINAL_ON_FAILURE: boolean;
    LOG_FORMATTING_ERRORS: boolean;
    FALLBACK_TO_BASIC_FORMATTING: boolean;
}

const DEFAULT_ERROR_HANDLING_CONFIG: FormattingErrorHandlingConfig = {
    MAX_FORMATTING_ATTEMPTS: 3,
    ENABLE_PARTIAL_FORMATTING: true,
    PRESERVE_ORIGINAL_ON_FAILURE: true,
    LOG_FORMATTING_ERRORS: true,
    FALLBACK_TO_BASIC_FORMATTING: true
};

let currentErrorHandlingConfig: FormattingErrorHandlingConfig = { ...DEFAULT_ERROR_HANDLING_CONFIG };

/**
 * R6.4: Public API facade for formatting error-handling configuration.
 * The format pipeline already guards itself with try/catch (returning [] on
 * failure); this facade exposes a stable, configurable surface for callers
 * and tests without changing that behavior.
 */
export const FormattingErrorHandlingAPI = {
    /**
     * Apply error-handling configuration (partial overrides supported).
     */
    configureErrorHandling(config: Partial<FormattingErrorHandlingConfig>): void {
        currentErrorHandlingConfig = { ...currentErrorHandlingConfig, ...config };
    },

    /**
     * Get the current error-handling configuration.
     */
    getErrorHandlingConfig(): FormattingErrorHandlingConfig {
        return { ...currentErrorHandlingConfig };
    },

    /**
     * Reset error-handling configuration to defaults.
     */
    resetErrorHandling(): void {
        currentErrorHandlingConfig = { ...DEFAULT_ERROR_HANDLING_CONFIG };
    }
};

/**
 * R6.3: Public API for multi-line formatting configuration
 */
export const MultiLineFormattingAPI = {
    /**
     * Get default formatting configuration
     */
    getDefaultConfig(): MultiLineFormattingConfig {
        return { ...DEFAULT_FORMATTING_CONFIG };
    },
    
    /**
     * Format document with custom configuration
     */
    formatWithConfig(document: TextDocument, config: Partial<MultiLineFormattingConfig>): TextEdit[] {
        const fullConfig = { ...DEFAULT_FORMATTING_CONFIG, ...config };
        const tokens = tokenize(document.getText());
        
        if (tokens.length === 0) {
            return [];
        }
        
        try {
            const expressions = analyzeExpressionStructure(tokens);
            const formattedText = formatWithMultiLineSupport(tokens, expressions, fullConfig);
            
            return [
                TextEdit.replace(
                    Range.create(
                        { line: 0, character: 0 },
                        document.positionAt(document.getText().length)
                    ),
                    formattedText
                ),
            ];
        } catch (error) {
            console.error('Formatting error:', error);
            return [];
        }
    },
    
    /**
     * Analyze expression structure without formatting
     */
    analyzeExpressions(document: TextDocument): ExpressionContext[] {
        const tokens = tokenize(document.getText());
        return analyzeExpressionStructure(tokens);
    },
    
    /**
     * Check if document needs multi-line formatting
     */
    needsMultiLineFormatting(document: TextDocument): boolean {
        const expressions = this.analyzeExpressions(document);
        return expressions.some(expr => 
            expr.isMultiLine || 
            expr.hasComplexNesting || 
            expr.type === 'if' || 
            expr.type === 'case'
        );
    },
    
    /**
     * Get formatting statistics
     */
    getFormattingStats(document: TextDocument): {
        totalExpressions: number;
        multiLineExpressions: number;
        complexExpressions: number;
        maxNestingDepth: number;
        expressionTypes: { [key: string]: number };
    } {
        const expressions = this.analyzeExpressions(document);
        const stats = {
            totalExpressions: expressions.length,
            multiLineExpressions: expressions.filter(e => e.isMultiLine).length,
            complexExpressions: expressions.filter(e => e.hasComplexNesting).length,
            maxNestingDepth: Math.max(...expressions.map(e => e.depth), 0),
            expressionTypes: {} as { [key: string]: number }
        };
        
        // Count expression types
        for (const expr of expressions) {
            stats.expressionTypes[expr.type] = (stats.expressionTypes[expr.type] || 0) + 1;
        }
        
        return stats;
    }
};
