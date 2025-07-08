import vscode from "vscode";
import { TableauSymbol } from "./tableauProvider";

/**
 * Represents a Tableau document with enhanced parsing and analysis capabilities
 */
export class TableauDocumentModel {
    private readonly document: vscode.TextDocument;
    private _parsedExpressions: TableauExpression[] = [];
    private _symbols: Map<string, TableauSymbolContext> = new Map();
    private _dirty: boolean = true;

    constructor(document: vscode.TextDocument) {
        this.document = document;
    }

    /**
     * Get all parsed expressions in the document
     */
    get expressions(): TableauExpression[] {
        if (this._dirty) {
            this.parse();
        }
        return this._parsedExpressions;
    }

    /**
     * Get all symbols with their context
     */
    get symbols(): Map<string, TableauSymbolContext> {
        if (this._dirty) {
            this.parse();
        }
        return this._symbols;
    }

    /**
     * Mark the document as dirty, requiring re-parsing
     */
    markDirty(): void {
        this._dirty = true;
    }

    /**
     * Parse the document to extract expressions and symbols
     */
    parse(): void {
        this._parsedExpressions = [];
        this._symbols.clear();
        
        const lines = this.document.getText().split('\n');
        this._parsedExpressions = this._identifyExpressions(lines);
        
        // Second pass: extract symbols and their context
        this.extractSymbols();
        
        this._dirty = false;
    }

    /**
     * Identify multi-line expressions from document lines
     */
    private _identifyExpressions(lines: string[]): TableauExpression[] {
        const expressions: TableauExpression[] = [];
        let currentExpression: TableauExpression | null = null;

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex].trim();

            // Skip empty lines and comments
            if (!line || line.startsWith('//') || line.startsWith('/*')) {
                continue;
            }

            // Check if this is the start of a new expression
            if (!currentExpression) {
                currentExpression = {
                    startLine: lineIndex,
                    endLine: lineIndex,
                    text: line,
                    type: this.determineExpressionType(line),
                    symbols: []
                };
            } else {
                // Append to current expression
                currentExpression.text += '\n' + line;
                currentExpression.endLine = lineIndex;

                // Check if this is the end of the expression
                if (this.isExpressionEnd(line)) {
                    expressions.push(currentExpression);
                    currentExpression = null;
                }
            }
        }

        // Add the last expression if it exists
        if (currentExpression) {
            expressions.push(currentExpression);
        }
        return expressions;
    }

    /**
     * Helper to create and add a TableauSymbolContext
     */
    private _addSymbolContext(
        name: string,
        type: TableauSymbolContext['type'],
        expression: TableauExpression,
        matchText: string,
        matchIndex: number
    ): void {
        const context: TableauSymbolContext = {
            name: name,
            type: type,
            expressionType: expression.type,
            range: this.getRangeForMatch(expression, matchText, matchIndex)
        };
        expression.symbols.push(context);
        this._symbols.set(`${name}_${context.range.start.line}_${context.range.start.character}`, context);
    }
    
    /**
     * Determine the type of a Tableau expression
     */
    private determineExpressionType(line: string): TableauExpressionType {
        if (line.startsWith('IF ') || line === 'IF') {
            return 'if';
        } else if (line.startsWith('CASE ') || line === 'CASE') {
            return 'case';
        } else if (line.startsWith('{')) {
            return 'lod';
        } else if (/^[A-Z_][A-Z0-9_]*\s*\(/i.test(line)) {
            return 'function';
        } else if (line.startsWith('[') && line.includes(']')) {
            return 'field';
        } else {
            return 'other';
        }
    }
    
    /**
     * Check if a line represents the end of an expression
     */
    private isExpressionEnd(line: string): boolean {
        return line.endsWith('END') || 
               (line.includes('}') && !line.includes('{')) || 
               (!line.includes('IF') && !line.includes('CASE') && !line.includes('{'));
    }
    
    /**
     * Extract symbols and their context from expressions
     */
    private extractSymbols(): void {
        for (const expression of this._parsedExpressions) {
            // Extract function calls
            const functionMatches = expression.text.matchAll(/\b([A-Z_][A-Z0-9_]*)\s*\(/gi);
            for (const match of functionMatches) {
                const functionName = match[1].toUpperCase();
                const context: TableauSymbolContext = {
                    name: functionName,
                    type: 'function',
                    expressionType: expression.type,
                    range: this.getRangeForMatch(expression, match[0], match.index || 0)
                };
                expression.symbols.push(context);
                this._symbols.set(`${functionName}_${context.range.start.line}_${context.range.start.character}`, context);
            }
            
            // Extract field references
            const fieldMatches = expression.text.matchAll(/\[([^\]]+)\]/g);
            for (const match of fieldMatches) {
                const fieldName = match[1];
                const context: TableauSymbolContext = {
                    name: fieldName,
                    type: 'field',
                    expressionType: expression.type,
                    range: this.getRangeForMatch(expression, match[0], match.index || 0)
                };
                expression.symbols.push(context);
                this._symbols.set(`${fieldName}_${context.range.start.line}_${context.range.start.character}`, context);
            }
            
            // Extract keywords
            const keywordMatches = expression.text.matchAll(/\b(IF|THEN|ELSE|ELSEIF|END|CASE|WHEN|AND|OR|NOT|IN|BETWEEN|FIXED|INCLUDE|EXCLUDE)\b/gi);
            for (const match of keywordMatches) {
                const keyword = match[1].toUpperCase();
                const context: TableauSymbolContext = {
                    name: keyword,
                    type: 'keyword',
                    expressionType: expression.type,
                    range: this.getRangeForMatch(expression, match[0], match.index || 0)
                };
                expression.symbols.push(context);
                this._symbols.set(`${keyword}_${context.range.start.line}_${context.range.start.character}`, context);
            }
        }
    }
    
    /**
     * Get the range for a match within an expression
     */
    private getRangeForMatch(expression: TableauExpression, matchText: string, matchIndex: number): vscode.Range {
        // This is a simplified implementation - in a real implementation, we would need to
        // calculate the exact position based on the multi-line expression
        const text = this.document.getText();
        const offset = text.indexOf(expression.text);
        const position = this.document.positionAt(offset + matchIndex);
        return new vscode.Range(
            position,
            position.translate(0, matchText.length)
        );
    }
    
    /**
     * Get the symbol context at a specific position
     */
    getSymbolContextAtPosition(position: vscode.Position): TableauSymbolContext | undefined {
        for (const context of this._symbols.values()) {
            if (context.range.contains(position)) {
                return context;
            }
        }
        return undefined;
    }
    
    /**
     * Get the expression at a specific position
     */
    getExpressionAtPosition(position: vscode.Position): TableauExpression | undefined {
        for (const expression of this._parsedExpressions) {
            if (position.line >= expression.startLine && position.line <= expression.endLine) {
                return expression;
            }
        }
        return undefined;
    }
}

/**
 * Represents a Tableau expression in the document
 */
export interface TableauExpression {
    startLine: number;
    endLine: number;
    text: string;
    type: TableauExpressionType;
    symbols: TableauSymbolContext[];
}

/**
 * Types of Tableau expressions
 */
export type TableauExpressionType = 'if' | 'case' | 'function' | 'field' | 'lod' | 'other';

/**
 * Represents a symbol with its context in the document
 */
export interface TableauSymbolContext {
    name: string;
    type: 'function' | 'field' | 'keyword' | 'operator' | 'constant';
    expressionType: TableauExpressionType;
    range: vscode.Range;
}

/**
 * Manages document models for Tableau files
 */
export class TableauDocumentManager {
    private static instance: TableauDocumentManager;
    private documentModels: Map<string, TableauDocumentModel> = new Map();
    
    private constructor() {}
    
    /**
     * Get the singleton instance
     */
    public static getInstance(): TableauDocumentManager {
        if (!TableauDocumentManager.instance) {
            TableauDocumentManager.instance = new TableauDocumentManager();
        }
        return TableauDocumentManager.instance;
    }
    
    /**
     * Get or create a document model for a document
     */
    public getDocumentModel(document: vscode.TextDocument): TableauDocumentModel {
        const uri = document.uri.toString();
        if (!this.documentModels.has(uri)) {
            this.documentModels.set(uri, new TableauDocumentModel(document));
        }
        return this.documentModels.get(uri)!;
    }
    
    /**
     * Mark a document as dirty, requiring re-parsing
     */
    public markDocumentDirty(document: vscode.TextDocument): void {
        const uri = document.uri.toString();
        if (this.documentModels.has(uri)) {
            this.documentModels.get(uri)!.markDirty();
        }
    }
    
    /**
     * Remove a document model
     */
    public removeDocumentModel(document: vscode.TextDocument): void {
        const uri = document.uri.toString();
        this.documentModels.delete(uri);
    }
}
