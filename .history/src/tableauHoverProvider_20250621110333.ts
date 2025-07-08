import vscode from "vscode";
import { TableauProvider, TableauSymbol } from "./tableauProvider";
import { TableauDocumentManager, TableauSymbolContext } from "./tableauDocumentModel";

/**
 * Enhanced hover provider for Tableau expressions
 */
export class TableauHoverProvider implements vscode.HoverProvider {
    private tableauProvider: TableauProvider;
    private hoverCache: Map<string, vscode.Hover> = new Map();
    private documentManager: TableauDocumentManager;
    
    constructor(tableauProvider: TableauProvider) {
        this.tableauProvider = tableauProvider;
        this.documentManager = TableauDocumentManager.getInstance();
    }
    
    /**
     * Provide hover information for Tableau symbols
     */
    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | null> {
        // Skip hover inside comments/strings
        if (this.isInExcludedRange(document, position)) {
            return null;
        }
        
        // Check cache first
        const cacheKey = `${document.uri.toString()}_${position.line}_${position.character}`;
        if (this.hoverCache.has(cacheKey)) {
            return this.hoverCache.get(cacheKey)!;
        }
        
        // Get document model
        const documentModel = this.documentManager.getDocumentModel(document);
        
        // Get symbol context at position
        const symbolContext = documentModel.getSymbolContextAtPosition(position);
        if (!symbolContext) {
            return null;
        }
        
        // Get symbol from provider
        const symbol = this.tableauProvider.getSymbol(symbolContext.name);
        if (!symbol) {
            return null;
        }
        
        // Create hover based on symbol type and context
        const hover = this.createHoverForSymbol(symbol, symbolContext);
        
        // Cache the result
        this.hoverCache.set(cacheKey, hover);
        
        return hover;
    }
    
    /**
     * Create hover information based on symbol type and context
     */
    private createHoverForSymbol(symbol: TableauSymbol, context: TableauSymbolContext): vscode.Hover {
        const markdownString = new vscode.MarkdownString();
        markdownString.isTrusted = true;
        
        // Add header with syntax highlighting
        markdownString.appendCodeblock(`${symbol.name}: ${symbol.type}`, 'tableau');
        
        // Add category if available
        if (symbol.category) {
            markdownString.appendMarkdown(`\n**Category:** ${symbol.category}\n\n`);
        }
        
        // Add context-aware information
        this.addContextAwareInformation(markdownString, symbol, context);
        
        // Add description if available
        if (symbol.description) {
            markdownString.appendMarkdown(`\n\n${symbol.description}\n`);
        }
        
        // Add parameter information for functions
        if (symbol.type === 'function' && symbol.parameters) {
            this.addParameterInformation(markdownString, symbol);
        }
        
        // Add examples if available
        this.addExamples(markdownString, symbol, context);
        
        return new vscode.Hover(markdownString, context.range);
    }
    
    /**
     * Add context-aware information to hover
     */
    private addContextAwareInformation(
        markdownString: vscode.MarkdownString,
        symbol: TableauSymbol,
        context: TableauSymbolContext
    ): void {
        switch (symbol.type) {
            case 'function':
                markdownString.appendMarkdown(`\n\n**Usage:** \`${this.getFunctionSignature(symbol)}\``);
                
                if (symbol.returnType) {
                    markdownString.appendMarkdown(`\n\n**Returns:** ${symbol.returnType}`);
                }
                break;
                
            case 'keyword':
                // Add special handling for control flow structures
                if (symbol.name === 'IF') {
                    markdownString.appendMarkdown('\n\n**Syntax:**');
                    markdownString.appendCodeblock(
                        'IF <test_expression> THEN\n  <value_if_true>\nELSEIF <another_test_expression> THEN\n  <another_value_if_true>\nELSE\n  <value_if_false>\nEND',
                        'tableau'
                    );
                } else if (symbol.name === 'CASE') {
                    markdownString.appendMarkdown('\n\n**Syntax:**');
                    markdownString.appendCodeblock(
                        'CASE <expression>\n  WHEN <value1> THEN <return1>\n  WHEN <value2> THEN <return2>\n  ELSE <default_return>\nEND',
                        'tableau'
                    );
                } else {
                    // Generic keyword handling
                    if (context.expressionType === 'if') {
                        markdownString.appendMarkdown('\n\n**Used in:** IF statement');
                    } else if (context.expressionType === 'case') {
                        markdownString.appendMarkdown('\n\n**Used in:** CASE statement');
                    } else if (context.expressionType === 'lod') {
                        markdownString.appendMarkdown('\n\n**Used in:** Level of Detail (LOD) expression');
                    }
                }
                break;
                
            case 'operator':
                markdownString.appendMarkdown('\n\n**Operator Type:** ');
                if (['AND', 'OR', 'NOT'].includes(symbol.name)) {
                    markdownString.appendMarkdown('Logical operator');
                } else if (['+', '-', '*', '/', '%'].includes(symbol.name)) {
                    markdownString.appendMarkdown('Arithmetic operator');
                } else if (['=', '!=', '<', '>', '<=', '>='].includes(symbol.name)) {
                    markdownString.appendMarkdown('Comparison operator');
                }
                break;
        }
    }
    
    /**
     * Add parameter information to hover
     */
    private addParameterInformation(markdownString: vscode.MarkdownString, symbol: TableauSymbol): void {
        markdownString.appendMarkdown('\n\n**Parameters:**\n');
        
        for (const param of symbol.parameters!) {
            const optionalText = param.optional ? ' (optional)' : '';
            markdownString.appendMarkdown(`\n- \`${param.name}: ${param.type}\`${optionalText}`);
            
            if (param.description) {
                markdownString.appendMarkdown(` — ${param.description}`);
            }
        }
    }
    
    /**
     * Add examples to hover
     */
    private addExamples(
        markdownString: vscode.MarkdownString,
        symbol: TableauSymbol,
        context: TableauSymbolContext
    ): void {
        // Extract examples from JSDoc comments if available
        const examples = this.extractExamples(symbol.description || '');
        
        if (examples.length > 0) {
            markdownString.appendMarkdown('\n\n**Examples:**\n');
            
            for (const example of examples) {
                markdownString.appendCodeblock(example, 'tableau');
            }
        } else {
            // Add generic examples based on symbol type
            this.addGenericExamples(markdownString, symbol);
        }
    }
    
    /**
     * Extract examples from description
     */
    private extractExamples(description: string): string[] {
        const examples: string[] = [];
        const exampleMatches = description.matchAll(/@example\s+([^\n]+)/g);
        
        for (const match of exampleMatches) {
            examples.push(match[1]);
        }
        
        return examples;
    }
    
    /**
     * Add generic examples based on symbol type
     */
    private addGenericExamples(markdownString: vscode.MarkdownString, symbol: TableauSymbol): void {
        if (symbol.type === 'function') {
            switch (symbol.name) {
                case 'SUM':
                    markdownString.appendMarkdown('\n\n**Example:**\n');
                    markdownString.appendCodeblock('SUM([Sales])', 'tableau');
                    break;
                    
                case 'AVG':
                    markdownString.appendMarkdown('\n\n**Example:**\n');
                    markdownString.appendCodeblock('AVG([Profit])', 'tableau');
                    break;
                    
                case 'DATEPART':
                    markdownString.appendMarkdown('\n\n**Example:**\n');
                    markdownString.appendCodeblock("DATEPART('year', [Order Date])", 'tableau');
                    break;
            }
        } else if (symbol.type === 'keyword') {
            switch (symbol.name) {
                case 'IF':
                    markdownString.appendMarkdown('\n\n**Example:**\n');
                    markdownString.appendCodeblock('IF [Sales] > 0 THEN "Positive" ELSE "Zero or Negative" END', 'tableau');
                    break;
                    
                case 'CASE':
                    markdownString.appendMarkdown('\n\n**Example:**\n');
                    markdownString.appendCodeblock('CASE [Region]\n  WHEN "East" THEN "Eastern Region"\n  WHEN "West" THEN "Western Region"\n  ELSE "Other Region"\nEND', 'tableau');
                    break;
            }
        }
    }
    
    /**
     * Get function signature for display
     */
    private getFunctionSignature(symbol: TableauSymbol): string {
        if (symbol.parameters && symbol.parameters.length > 0) {
            const params = symbol.parameters.map(p => 
                p.optional ? `[${p.name}: ${p.type}]` : `${p.name}: ${p.type}`
            ).join(', ');
            
            const returnType = symbol.returnType ? ` => ${symbol.returnType}` : '';
            return `${symbol.name}(${params})${returnType}`;
        }
        
        return `${symbol.name}(...)`;
    }
    
    /**
     * Check if position is in excluded range (comments, strings)
     */
    private isInExcludedRange(document: vscode.TextDocument, position: vscode.Position): boolean {
        const text = document.getText();
        const offset = document.offsetAt(position);
        
        // Check if in comment
        const lineText = document.lineAt(position.line).text;
        const lineOffset = position.character;
        
        // Check for single-line comment
        const commentIndex = lineText.indexOf('//');
        if (commentIndex >= 0 && lineOffset > commentIndex) {
            return true;
        }
        
        // Check for multi-line comment
        let inComment = false;
        let inString = false;
        let stringChar = '';
        
        for (let i = 0; i < offset; i++) {
            const char = text[i];
            const nextChar = i + 1 < text.length ? text[i + 1] : '';
            
            if (!inString && char === '/' && nextChar === '*') {
                inComment = true;
                i++;
            } else if (inComment && char === '*' && nextChar === '/') {
                inComment = false;
                i++;
            } else if (!inComment && !inString && (char === '"' || char === "'")) {
                inString = true;
                stringChar = char;
            } else if (inString && char === stringChar && text[i - 1] !== '\\') {
                inString = false;
            }
        }
        
        return inComment || inString;
    }
    
    /**
     * Clear hover cache for a document
     */
    public clearCache(document: vscode.TextDocument): void {
        const uriString = document.uri.toString();
        
        // Remove all cache entries for this document
        for (const key of this.hoverCache.keys()) {
            if (key.startsWith(uriString)) {
                this.hoverCache.delete(key);
            }
        }
    }
}
