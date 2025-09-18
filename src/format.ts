

import { TextEdit, Range, Position, FormattingOptions } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { tokenize, TokenType, Token } from './lexer';

/**
 * R6.3: Multi-line expression formatting configuration
 */
interface MultiLineFormattingConfig {
    preserveLogicalLineBreaks: boolean;
    maxLineLength: number;
    indentSize: number;
    useSpaces: boolean;
    alignParameters: boolean;
    breakAfterOperators: boolean;
    wrapLongExpressions: boolean;
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
    wrapLongExpressions: true
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
export function format(document: TextDocument, options: FormattingOptions): TextEdit[] {
    const config = createFormattingConfig(options);
    const tokens = tokenize(document.getText());
    
    if (tokens.length === 0) {
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

/**
 * R6.3: Create formatting configuration from VS Code options
 */
function createFormattingConfig(options: FormattingOptions): MultiLineFormattingConfig {
    return {
        ...DEFAULT_FORMATTING_CONFIG,
        indentSize: options.tabSize || DEFAULT_FORMATTING_CONFIG.indentSize,
        useSpaces: options.insertSpaces !== false
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
    
    constructor(config: MultiLineFormattingConfig) {
        this.config = config;
    }
    
    format(tokens: Token[], expressions: ExpressionContext[]): string {
        this.indentLevel = 0;
        this.currentLine = '';
        this.result = [];
        this.preserveNextLineBreak = false;
        
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
        
        return this.result.join('\n');
    }
    
    private processToken(token: Token, index: number, tokens: Token[], expressions: ExpressionContext[]): void {
        // R6.3: Handle different token types with multi-line awareness
        switch (token.type) {
            case TokenType.If:
            case TokenType.Case:
                this.handleBlockStart(token);
                break;
                
            case TokenType.Then:
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
                this.handleComma(token, index, tokens);
                break;
                
            case TokenType.And:
            case TokenType.Or:
                this.handleLogicalOperator(token);
                break;
                
            case TokenType.Plus:
            case TokenType.Minus:
            case TokenType.Star:
            case TokenType.Slash:
            case TokenType.Equal:
            case TokenType.EqualEqual:
            case TokenType.BangEqual:
            case TokenType.Greater:
            case TokenType.GreaterEqual:
            case TokenType.Less:
            case TokenType.LessEqual:
                this.handleOperator(token);
                break;
                
            default:
                this.handleRegularToken(token);
                break;
        }
    }
    
    private handleBlockStart(token: Token): void {
        this.addToken(token.value.toUpperCase());
        this.indentLevel++;
    }
    
    private handleBranchKeyword(token: Token): void {
        // R6.3: Branch keywords start new lines with proper indentation
        this.finishCurrentLine();
        this.addToken(token.value.toUpperCase());
        
        // THEN doesn't increase indent, but ELSE/ELSEIF/WHEN do
        if (token.type !== TokenType.Then) {
            // Temporarily decrease indent for the keyword, then increase for content
            this.indentLevel = Math.max(0, this.indentLevel - 1);
            this.finishCurrentLine();
            this.indentLevel++;
        }
    }
    
    private handleBlockEnd(token: Token): void {
        this.indentLevel = Math.max(0, this.indentLevel - 1);
        this.finishCurrentLine();
        this.addToken(token.value.toUpperCase());
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
        this.addToken(token.value);
        
        // R6.3: Check if this is a complex function call that should be multi-line
        if (this.shouldBreakFunctionParameters(index, tokens)) {
            this.indentLevel++;
        }
    }
    
    private handleFunctionEnd(token: Token): void {
        // Check if we increased indent for this function
        if (this.shouldDecreaseFunctionIndent()) {
            this.indentLevel = Math.max(0, this.indentLevel - 1);
        }
        this.addToken(token.value);
    }
    
    private handleComma(token: Token, index: number, tokens: Token[]): void {
        this.addToken(token.value);
        
        // R6.3: Break after comma in complex expressions
        if (this.shouldBreakAfterComma(index, tokens)) {
            this.finishCurrentLine();
        } else {
            this.addSpace();
        }
    }
    
    private handleLogicalOperator(token: Token): void {
        // R6.3: Logical operators can break lines for readability
        if (this.config.breakAfterOperators && this.shouldBreakAfterLogicalOperator()) {
            this.addSpace();
            this.addToken(token.value.toUpperCase());
            this.finishCurrentLine();
        } else {
            this.addSpace();
            this.addToken(token.value.toUpperCase());
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
            this.addToken(token.value.toUpperCase());
        } else {
            this.addToken(token.value);
        }
    }
    
    private addToken(value: string): void {
        if (this.currentLine === '') {
            this.currentLine = this.getIndentation();
        } else if (this.needsSpace()) {
            this.currentLine += ' ';
        }
        
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
    
    private shouldBreakFunctionParameters(index: number, tokens: Token[]): boolean {
        // R6.3: Break function parameters if the function call is complex
        let parenCount = 1;
        let paramCount = 0;
        let hasNestedCalls = false;
        
        for (let i = index + 1; i < tokens.length && parenCount > 0; i++) {
            const token = tokens[i];
            
            if (token.type === TokenType.LParen) {
                parenCount++;
                hasNestedCalls = true;
            } else if (token.type === TokenType.RParen) {
                parenCount--;
            } else if (token.type === TokenType.Comma && parenCount === 1) {
                paramCount++;
            }
        }
        
        return paramCount > 2 || hasNestedCalls;
    }
    
    private shouldDecreaseFunctionIndent(): boolean {
        // This is a simplified check - in a real implementation, 
        // we'd track which functions had their indent increased
        return false;
    }
    
    private shouldBreakAfterComma(index: number, tokens: Token[]): boolean {
        // R6.3: Break after comma in complex parameter lists
        return this.config.wrapLongExpressions && 
               this.currentLine.length > this.config.maxLineLength * 0.7;
    }
    
    private shouldBreakAfterLogicalOperator(): boolean {
        // R6.3: Break after logical operators in complex conditions
        return this.config.wrapLongExpressions && 
               this.currentLine.length > this.config.maxLineLength * 0.6;
    }
}

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
