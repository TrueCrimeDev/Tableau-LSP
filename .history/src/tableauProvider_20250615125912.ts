import fs from "fs/promises";
import path from "path";
import vscode from "vscode";

export interface TableauSymbol {
    name: string;
    type: 'function' | 'operator' | 'keyword' | 'constant';
    description?: string;
    parameters?: TableauParameter[];
    returnType?: string;
    category?: string;
}

export interface TableauParameter {
    name: string;
    type: string;
    description?: string;
    optional?: boolean;
}

export class TableauProvider implements 
    vscode.HoverProvider,
    vscode.CompletionItemProvider,
    vscode.DefinitionProvider,
    vscode.DocumentSymbolProvider {
    private symbols = new Map<string, TableauSymbol>();
    private context: vscode.ExtensionContext;
    private initialized = false;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /** Initialize the provider by loading Tableau function definitions */
    public async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            await this.loadSymbolsFromFile();
            this.initialized = true;
        } catch (error) {
            console.error('Failed to initialize TableauProvider:', error);
            throw error;
        }
    }

    /** Load symbol definitions from twbl.d.twbl file */
    private async loadSymbolsFromFile(): Promise<void> {
        const symbolsPath = path.join(this.context.extensionPath, 'syntaxes', 'twbl.d.twbl');
        
        try {
            const content = await fs.readFile(symbolsPath, 'utf-8');
            this.parseSymbolDefinitions(content);
        } catch (error) {
            console.error('Failed to load symbol definitions:', error);
            // Initialize with basic symbols if file loading fails
            this.initializeBasicSymbols();
        }
    }

    /** Parse symbol definitions from the content of twbl.d.twbl */
    private parseSymbolDefinitions(content: string): void {
        const lines = content.split('\n');
        let currentDescription = '';
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            
            // Skip empty lines
            if (!trimmedLine) {
                currentDescription = '';
                continue;
            }

            // Parse JSDoc comments
            if (trimmedLine.startsWith('/**')) {
                currentDescription = '';
                continue;
            } else if (trimmedLine.startsWith('*') && !trimmedLine.startsWith('*/')) {
                const desc = trimmedLine.replace(/^\s*\*\s?/, '');
                if (desc) {
                    currentDescription += (currentDescription ? ' ' : '') + desc;
                }
                continue;
            } else if (trimmedLine.startsWith('*/')) {
                continue;
            }

            // Parse single-line comments for descriptions
            if (trimmedLine.startsWith('//')) {
                currentDescription = trimmedLine.replace(/^\/\/\s?/, '');
                continue;
            }

            // Parse symbol definitions (name: type format)
            const match = /^([A-Z_][A-Z0-9_]*|\[[^\]]+\]|[+\-*/%=<>!]+|AND|OR|NOT):\s*(\w+)$/i.exec(trimmedLine);
            if (match) {
                const [, name, type] = match;
                const symbol: TableauSymbol = {
                    name,
                    type: this.categorizeSymbol(name, type),
                    description: currentDescription || undefined,
                    category: this.getSymbolCategory(name)
                };
                
                this.symbols.set(name.toUpperCase(), symbol);
                currentDescription = '';
            }
        }
    }

    /** Initialize basic symbols if file loading fails */
    private initializeBasicSymbols(): void {
        const basicSymbols: TableauSymbol[] = [
            // Keywords
            { name: 'IF', type: 'keyword', description: 'Conditional statement' },
            { name: 'THEN', type: 'keyword', description: 'Used with IF statements' },
            { name: 'ELSE', type: 'keyword', description: 'Alternative condition in IF statements' },
            { name: 'END', type: 'keyword', description: 'Ends IF or CASE statements' },
            { name: 'CASE', type: 'keyword', description: 'Multi-way conditional statement' },
            { name: 'WHEN', type: 'keyword', description: 'Used with CASE statements' },
            
            // Logical operators
            { name: 'AND', type: 'operator', description: 'Logical AND operator' },
            { name: 'OR', type: 'operator', description: 'Logical OR operator' },
            { name: 'NOT', type: 'operator', description: 'Logical NOT operator' },
            
            // Constants
            { name: 'TRUE', type: 'constant', description: 'Boolean true value' },
            { name: 'FALSE', type: 'constant', description: 'Boolean false value' },
            { name: 'NULL', type: 'constant', description: 'Null value' },
            
            // Common functions
            { name: 'SUM', type: 'function', category: 'Aggregate', description: 'Returns the sum of all values' },
            { name: 'AVG', type: 'function', category: 'Aggregate', description: 'Returns the average of all values' },
            { name: 'COUNT', type: 'function', category: 'Aggregate', description: 'Returns the count of items' },
            { name: 'MIN', type: 'function', category: 'Aggregate', description: 'Returns the minimum value' },
            { name: 'MAX', type: 'function', category: 'Aggregate', description: 'Returns the maximum value' },
            
            { name: 'DATEPART', type: 'function', category: 'Date', description: 'Returns part of a date' },
            { name: 'TODAY', type: 'function', category: 'Date', description: 'Returns today\'s date' },
            { name: 'NOW', type: 'function', category: 'Date', description: 'Returns current date and time' },
            
            { name: 'LEN', type: 'function', category: 'String', description: 'Returns the length of a string' },
            { name: 'LEFT', type: 'function', category: 'String', description: 'Returns leftmost characters' },
            { name: 'RIGHT', type: 'function', category: 'String', description: 'Returns rightmost characters' },
            { name: 'CONTAINS', type: 'function', category: 'String', description: 'Tests if string contains substring' },
        ];
        
        basicSymbols.forEach(symbol => {
            this.symbols.set(symbol.name, symbol);
        });
    }

    /** Categorize a symbol based on its name and type */
    private categorizeSymbol(name: string, _type: string): TableauSymbol['type'] {
        const upperName = name.toUpperCase();
        
        if (['IF', 'THEN', 'ELSE', 'ELSEIF', 'END', 'CASE', 'WHEN', 'FIXED', 'INCLUDE', 'EXCLUDE'].includes(upperName)) {
            return 'keyword';
        }
        
        if (['AND', 'OR', 'NOT', 'IN'].includes(upperName) || /^[+\-*/%=<>!]+$/.test(name)) {
            return 'operator';
        }
        
        if (['TRUE', 'FALSE', 'NULL'].includes(upperName)) {
            return 'constant';
        }
        
        return 'function';
    }

    /** Get the category for a symbol (Aggregate, Date, String, etc.) */
    private getSymbolCategory(name: string): string | undefined {
        const upperName = name.toUpperCase();
        
        if (['SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'MEDIAN', 'STDEV', 'VAR'].includes(upperName)) {
            return 'Aggregate';
        }
        
        if (['DATEPART', 'DATEADD', 'DATEDIFF', 'TODAY', 'NOW', 'YEAR', 'MONTH', 'DAY'].includes(upperName)) {
            return 'Date';
        }
        
        if (['LEN', 'LEFT', 'RIGHT', 'MID', 'CONTAINS', 'REPLACE', 'TRIM', 'UPPER', 'LOWER'].includes(upperName)) {
            return 'String';
        }
        
        if (['ABS', 'ROUND', 'CEILING', 'FLOOR', 'SQRT', 'POWER', 'EXP', 'LOG'].includes(upperName)) {
            return 'Math';
        }
        
        if (['ISNULL', 'IFNULL', 'IIF', 'ZN'].includes(upperName)) {
            return 'Logical';
        }
        
        return undefined;
    }

    /** Get a symbol by name (case-insensitive) */
    public getSymbol(name: string): TableauSymbol | undefined {
        return this.symbols.get(name.toUpperCase());
    }

    /** Get all symbols */
    public getAllSymbols(): TableauSymbol[] {
        return Array.from(this.symbols.values());
    }

    /** Get symbols by type */
    public getSymbolsByType(type: TableauSymbol['type']): TableauSymbol[] {
        return this.getAllSymbols().filter(symbol => symbol.type === type);
    }

    /** Get symbols by category */
    public getSymbolsByCategory(category: string): TableauSymbol[] {
        return this.getAllSymbols().filter(symbol => symbol.category === category);
    }

    /** Get function symbols for completion */
    public getFunctionCompletions(): vscode.CompletionItem[] {
        return this.getSymbolsByType('function').map(symbol => {
            const item = new vscode.CompletionItem(symbol.name, vscode.CompletionItemKind.Function);
            item.detail = symbol.category ? `${symbol.category} Function` : 'Function';
            item.documentation = symbol.description;
            return item;
        });
    }

    /** Get keyword symbols for completion */
    public getKeywordCompletions(): vscode.CompletionItem[] {
        return this.getSymbolsByType('keyword').map(symbol => {
            const item = new vscode.CompletionItem(symbol.name, vscode.CompletionItemKind.Keyword);
            item.detail = 'Keyword';
            item.documentation = symbol.description;
            return item;
        });
    }

    /** Check if provider is initialized */
    public isInitialized(): boolean {
        return this.initialized;
    }

    /** Dispose of resources */
    public dispose(): void {
        this.symbols.clear();
        this.initialized = false;
    }

    // VS Code Language Provider Interface Methods

    /** Provide hover information */
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        const range = document.getWordRangeAtPosition(position);
        if (!range) return null;

        const word = document.getText(range).toUpperCase();
        const symbol = this.getSymbol(word);
        
        if (symbol) {
            const markdownString = new vscode.MarkdownString();
            markdownString.appendCodeblock(`${symbol.name}: ${symbol.type}`, 'tableau');
            
            if (symbol.category) {
                markdownString.appendText(`\n**Category:** ${symbol.category}\n\n`);
            }
            
            if (symbol.description) {
                markdownString.appendText(symbol.description);
            }
            
            return new vscode.Hover(markdownString, range);
        }
        
        return null;
    }

    /** Provide completion items */
    provideCompletionItems(
        _document: vscode.TextDocument,
        _position: vscode.Position,
        _token: vscode.CancellationToken,
        _context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        const functionCompletions = this.getFunctionCompletions();
        const keywordCompletions = this.getKeywordCompletions();
        
        return [...functionCompletions, ...keywordCompletions];
    }

    /** Provide definition locations */
    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
        const range = document.getWordRangeAtPosition(position);
        if (!range) return null;

        const word = document.getText(range).toUpperCase();
        const symbol = this.getSymbol(word);
        
        if (symbol) {
            // Try to find the definition in the twbl.d.twbl file
            const definitionPath = path.join(this.context.extensionPath, 'syntaxes', 'twbl.d.twbl');
            const uri = vscode.Uri.file(definitionPath);
            
            // For now, return the start of the file
            // In a more sophisticated implementation, we could parse the file to find the exact line
            return new vscode.Location(uri, new vscode.Position(0, 0));
        }
        
        return null;
    }

    /** Provide document symbols */
    provideDocumentSymbols(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
        const symbols: vscode.DocumentSymbol[] = [];
        const text = document.getText();
        
        // Find function calls in the document
        const functionRegex = /\b([A-Z_][A-Z0-9_]*)\s*\(/gi;
        let match;
        
        while ((match = functionRegex.exec(text)) !== null) {
            const functionName = match[1].toUpperCase();
            const symbol = this.getSymbol(functionName);
            
            if (symbol && symbol.type === 'function') {
                const position = document.positionAt(match.index);
                const range = new vscode.Range(position, position.translate(0, match[1].length));
                
                const docSymbol = new vscode.DocumentSymbol(
                    symbol.name,
                    symbol.description || '',
                    vscode.SymbolKind.Function,
                    range,
                    range
                );
                
                symbols.push(docSymbol);
            }
        }
        
        return symbols;
    }
}