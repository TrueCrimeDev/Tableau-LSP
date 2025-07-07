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
    vscode.DocumentSymbolProvider,
    vscode.SignatureHelpProvider,
    vscode.DocumentSemanticTokensProvider,
    vscode.DocumentFormattingEditProvider {
    private symbols = new Map<string, TableauSymbol>();
    private context: vscode.ExtensionContext;
    private initialized = false;

    // Semantic Tokens Configuration (must match CLAUDE.md specification)
    static readonly tokenTypes = [
        'keyword',    // IF, THEN, ELSE, CASE, WHEN, END
        'function',   // SUM, AVG, DATEPART, LEN, CONTAINS
        'variable',   // [Field Name], calculated fields  
        'constant',   // Numbers, TRUE, FALSE, NULL
        'operator',   // +, -, *, /, =, >, <, AND, OR
        'string',     // 'text', "text"  
        'comment'     // //, /* */
    ];
    
    static readonly tokenModifiers: string[] = [];
    private tokenLegend = new vscode.SemanticTokensLegend(TableauProvider.tokenTypes, TableauProvider.tokenModifiers);

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
        let inJsDocComment = false;
        let i = 0;
        
        while (i < lines.length) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // Skip empty lines but don't clear description if we're in a JSDoc comment
            if (!trimmedLine) {
                if (!inJsDocComment) {
                    currentDescription = '';
                }
                i++;
                continue;
            }

            // Parse JSDoc comments
            if (trimmedLine.startsWith('/**')) {
                currentDescription = '';
                inJsDocComment = true;
                i++;
                continue;
            } else if (trimmedLine.startsWith('*') && !trimmedLine.startsWith('*/')) {
                if (inJsDocComment) {
                    const desc = trimmedLine.replace(/^\s*\*\s?/, '');
                    if (desc) {
                        currentDescription += (currentDescription ? ' ' : '') + desc;
                    }
                }
                i++;
                continue;
            } else if (trimmedLine.startsWith('*/')) {
                inJsDocComment = false;
                i++;
                continue;
            }

            // Parse single-line comments for descriptions  
            if (trimmedLine.startsWith('//')) {
                // Only use single-line comments if we don't already have a JSDoc description
                if (!currentDescription) {
                    const newDesc = trimmedLine.replace(/^\/\/\s?/, '');
                    currentDescription += (currentDescription ? ' ' : '') + newDesc;
                }
                i++;
                continue;
            }

            // Parse control flow structures (IF, CASE)
            const controlFlowResult = this.parseControlFlowStructure(lines, i, currentDescription);
            if (controlFlowResult) {
                this.symbols.set(controlFlowResult.symbol.name.toUpperCase(), controlFlowResult.symbol);
                i = controlFlowResult.nextIndex;
                currentDescription = '';
                inJsDocComment = false;
                continue;
            }

            // Parse function signatures with parameters - e.g., "SUM(expression: Number) => Number"
            const funcMatch = /^([A-Z_][A-Z0-9_]*)\s*\(([^)]*)\)\s*=>\s*(\w+)$/i.exec(trimmedLine);
            if (funcMatch) {
                const [, name, paramString, returnType] = funcMatch;
                const parameters = this.parseParameters(paramString);
                
                const symbol: TableauSymbol = {
                    name,
                    type: 'function',
                    description: currentDescription || undefined,
                    parameters: parameters,
                    returnType: returnType,
                    category: this.getSymbolCategory(name)
                };
                
                this.symbols.set(name.toUpperCase(), symbol);
                currentDescription = '';
                inJsDocComment = false;
                i++;
                continue;
            }

            // Parse simple symbol definitions - improved regex to handle operators and complex patterns
            const match = /^([A-Z_][A-Z0-9_]*|\[[^\]]+\]|[+\-*/%=<>!]+|<=|>=|AND|OR|NOT|IN|BETWEEN):\s*(\w+)$/i.exec(trimmedLine);
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
                inJsDocComment = false;
            }
            
            i++;
        }
    }

    /** Parse parameter string into TableauParameter objects */
    private parseParameters(paramString: string): TableauParameter[] {
        if (!paramString.trim()) return [];
        
        const parameters: TableauParameter[] = [];
        const paramParts = paramString.split(',');
        
        for (const part of paramParts) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            
            // Parse parameter format: "name: type" or "name?: type" for optional
            const paramMatch = /^(\w+)(\?)?:\s*(\w+)$/i.exec(trimmed);
            if (paramMatch) {
                const [, name, optional, type] = paramMatch;
                parameters.push({
                    name,
                    type,
                    optional: !!optional
                });
            }
        }
        
        return parameters;
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

    // Triple-Layer Exclusion Logic (CRITICAL FOR CORRECTNESS)
    
    /** Layer 1: Document-level range detection */
    private findExcludedRanges(document: vscode.TextDocument): vscode.Range[] {
        const excludedRanges: vscode.Range[] = [];
        const text = document.getText();
        let pos = 0;
        let line = 0;
        let character = 0;

        while (pos < text.length) {
            const char = text[pos];
            
            // Handle newlines
            if (char === '\n') {
                line++;
                character = 0;
                pos++;
                continue;
            }

            // Handle single-line comments
            if (char === '/' && pos + 1 < text.length && text[pos + 1] === '/') {
                const start = new vscode.Position(line, character);
                // Find end of line
                let endPos = pos;
                while (endPos < text.length && text[endPos] !== '\n') {
                    endPos++;
                }
                const endLine = line;
                const endChar = character + (endPos - pos);
                const end = new vscode.Position(endLine, endChar);
                excludedRanges.push(new vscode.Range(start, end));
                
                pos = endPos;
                continue;
            }

            // Handle multi-line comments
            if (char === '/' && pos + 1 < text.length && text[pos + 1] === '*') {
                const start = new vscode.Position(line, character);
                pos += 2; // Skip /*
                character += 2;
                
                // Find closing */
                while (pos + 1 < text.length) {
                    if (text[pos] === '\n') {
                        line++;
                        character = 0;
                    } else {
                        character++;
                    }
                    
                    if (text[pos] === '*' && pos + 1 < text.length && text[pos + 1] === '/') {
                        pos += 2; // Skip */
                        character += 2;
                        break;
                    }
                    pos++;
                }
                
                const end = new vscode.Position(line, character);
                excludedRanges.push(new vscode.Range(start, end));
                continue;
            }

            // Handle strings
            if (char === '"' || char === "'") {
                const quote = char;
                const start = new vscode.Position(line, character);
                pos++; // Skip opening quote
                character++;
                
                // Find closing quote
                while (pos < text.length) {
                    const currentChar = text[pos];
                    if (currentChar === '\n') {
                        line++;
                        character = 0;
                    } else {
                        character++;
                    }
                    
                    if (currentChar === quote) {
                        pos++; // Skip closing quote
                        character++;
                        break;
                    }
                    
                    // Handle escaped quotes
                    if (currentChar === '\\' && pos + 1 < text.length) {
                        pos++; // Skip escaped character
                        character++;
                    }
                    pos++;
                }
                
                const end = new vscode.Position(line, character);
                excludedRanges.push(new vscode.Range(start, end));
                continue;
            }

            character++;
            pos++;
        }

        return excludedRanges;
    }

    /** Layer 3: Provider-level filtering */
    private isInExcludedRange(document: vscode.TextDocument, position: vscode.Position): boolean {
        const excludedRanges = this.findExcludedRanges(document);
        return excludedRanges.some(range => range.contains(position));
    }

    // Semantic Tokens Public Methods

    /** Get the semantic tokens legend for registration */
    public getSemanticTokensLegend(): vscode.SemanticTokensLegend {
        return this.tokenLegend;
    }

    // VS Code Language Provider Interface Methods

    /** Provide semantic tokens for syntax highlighting */
    provideDocumentSemanticTokens(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.SemanticTokens> {
        const tokensBuilder = new vscode.SemanticTokensBuilder(this.tokenLegend);
        const text = document.getText();
        
        // Tokenize the entire document
        this.tokenizeDocument(text, tokensBuilder);
        
        return tokensBuilder.build();
    }

    /** Tokenize Tableau document content */
    private tokenizeDocument(text: string, tokensBuilder: vscode.SemanticTokensBuilder): void {
        const lines = text.split('\n');
        let inBlockComment = false;
        
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            inBlockComment = this.tokenizeLine(line, lineIndex, tokensBuilder, inBlockComment);
        }
    }

    /** Tokenize a single line of Tableau code */
    private tokenizeLine(line: string, lineIndex: number, tokensBuilder: vscode.SemanticTokensBuilder, inBlockComment: boolean): boolean {
        let pos = 0;
        const length = line.length;
        let blockCommentState = inBlockComment;

        // If we're already inside a block comment, check for end
        if (blockCommentState) {
            const endPos = this.findCommentEnd(line, 0);
            if (endPos !== -1) {
                // Found end of block comment - include the */ characters
                const commentLength = endPos + 2;
                tokensBuilder.push(lineIndex, 0, commentLength, this.getTokenType('comment'), 0);
                pos = commentLength;
                blockCommentState = false;
            } else {
                // Entire line is part of block comment
                if (length > 0) {
                    tokensBuilder.push(lineIndex, 0, length, this.getTokenType('comment'), 0);
                }
                return true; // Still in block comment
            }
        }

        while (pos < length) {
            const char = line[pos];

            // Skip whitespace
            if (/\s/.test(char)) {
                pos++;
                continue;
            }

            // Handle single-line comments
            if (char === '/' && pos + 1 < length && line[pos + 1] === '/') {
                tokensBuilder.push(lineIndex, pos, length - pos, this.getTokenType('comment'), 0);
                break; // Rest of line is comment
            }

            // Handle multi-line comments (start)
            if (char === '/' && pos + 1 < length && line[pos + 1] === '*') {
                const endPos = this.findCommentEnd(line, pos + 2);
                if (endPos !== -1) {
                    // Block comment ends on same line
                    tokensBuilder.push(lineIndex, pos, endPos - pos + 2, this.getTokenType('comment'), 0);
                    pos = endPos + 2;
                } else {
                    // Block comment continues to next line
                    tokensBuilder.push(lineIndex, pos, length - pos, this.getTokenType('comment'), 0);
                    blockCommentState = true;
                    break;
                }
                continue;
            }

            // Handle strings
            if (char === '"' || char === "'") {
                const endPos = this.findStringEnd(line, pos + 1, char);
                if (endPos !== -1) {
                    tokensBuilder.push(lineIndex, pos, endPos - pos + 1, this.getTokenType('string'), 0);
                    pos = endPos + 1;
                } else {
                    tokensBuilder.push(lineIndex, pos, length - pos, this.getTokenType('string'), 0);
                    break;
                }
                continue;
            }

            // Handle field references [Field Name]
            if (char === '[') {
                const endPos = this.findFieldEnd(line, pos + 1);
                if (endPos !== -1) {
                    tokensBuilder.push(lineIndex, pos, endPos - pos + 1, this.getTokenType('variable'), 0);
                    pos = endPos + 1;
                    continue;
                }
            }

            // Handle numbers
            if (/\d/.test(char)) {
                const numberMatch = line.slice(pos).match(/^\d+(\.\d+)?/);
                if (numberMatch) {
                    tokensBuilder.push(lineIndex, pos, numberMatch[0].length, this.getTokenType('constant'), 0);
                    pos += numberMatch[0].length;
                    continue;
                }
            }

            // Handle operators
            const operatorMatch = this.matchOperator(line, pos);
            if (operatorMatch) {
                tokensBuilder.push(lineIndex, pos, operatorMatch.length, this.getTokenType('operator'), 0);
                pos += operatorMatch.length;
                continue;
            }

            // Handle identifiers (keywords, functions, etc.)
            const identifierMatch = line.slice(pos).match(/^[A-Za-z_][A-Za-z0-9_]*/);
            if (identifierMatch) {
                const identifier = identifierMatch[0].toUpperCase();
                const tokenType = this.classifyIdentifier(identifier);
                tokensBuilder.push(lineIndex, pos, identifierMatch[0].length, this.getTokenType(tokenType), 0);
                pos += identifierMatch[0].length;
                continue;
            }

            // Skip unrecognized characters
            pos++;
        }
        
        return blockCommentState;
    }

    /** Find the end of a comment block */
    private findCommentEnd(line: string, startPos: number): number {
        for (let i = startPos; i < line.length - 1; i++) {
            if (line[i] === '*' && line[i + 1] === '/') {
                return i;
            }
        }
        return -1;
    }

    /** Find the end of a string */
    private findStringEnd(line: string, startPos: number, quote: string): number {
        for (let i = startPos; i < line.length; i++) {
            if (line[i] === quote) {
                return i;
            }
            if (line[i] === '\\' && i + 1 < line.length) {
                i++; // Skip escaped character
            }
        }
        return -1;
    }

    /** Find the end of a field reference */
    private findFieldEnd(line: string, startPos: number): number {
        for (let i = startPos; i < line.length; i++) {
            if (line[i] === ']') {
                return i;
            }
        }
        return -1;
    }

    /** Match operators at current position */
    private matchOperator(line: string, pos: number): string | null {
        const operators = ['<=', '>=', '<>', '==', '<', '>', '=', '+', '-', '*', '/', '%', '(', ')', '{', '}', ','];
        for (const op of operators) {
            if (line.slice(pos, pos + op.length) === op) {
                return op;
            }
        }
        return null;
    }

    /** Classify an identifier as keyword, function, or variable */
    private classifyIdentifier(identifier: string): string {
        // Check if it's a function in our symbol table
        if (this.symbols.has(identifier)) {
            const symbol = this.symbols.get(identifier)!;
            return symbol.type;
        }

        // Check keywords
        const keywords = ['IF', 'THEN', 'ELSE', 'ELSEIF', 'END', 'CASE', 'WHEN', 'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'IS', 'TRUE', 'FALSE', 'NULL'];
        if (keywords.includes(identifier)) {
            return 'keyword';
        }

        // Default to variable
        return 'variable';
    }

    /** Get token type index */
    private getTokenType(tokenType: string): number {
        const index = TableauProvider.tokenTypes.indexOf(tokenType);
        return index >= 0 ? index : 0; // Default to first token type if not found
    }

    /** Provide document formatting */
    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.TextEdit[]> {
        const config = vscode.workspace.getConfiguration("tableau");
        const formattingEnabled = config.get<boolean>("enableFormatting", false);
        
        if (!formattingEnabled) {
            return [];
        }

        const text = document.getText();
        const formattedText = this.formatTableauCode(text, options);
        
        if (formattedText === text) {
            return []; // No changes needed
        }

        // Return edit that replaces entire document
        const entireRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(text.length)
        );
        
        return [vscode.TextEdit.replace(entireRange, formattedText)];
    }

    /** Format Tableau code with proper indentation and spacing */
    private formatTableauCode(text: string, options: vscode.FormattingOptions): string {
        const lines = text.split('\n');
        const formattedLines: string[] = [];
        let indentLevel = 0;
        const indentString = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';

        for (const line of lines) {
            const trimmedLine = line.trim();
            
            // Skip empty lines
            if (!trimmedLine) {
                formattedLines.push('');
                continue;
            }

            // Decrease indent for END, ELSE, ELSEIF, WHEN
            if (/^(END|ELSE|ELSEIF|WHEN)\b/i.test(trimmedLine)) {
                indentLevel = Math.max(0, indentLevel - 1);
            }

            // Apply current indentation
            const formattedLine = indentString.repeat(indentLevel) + trimmedLine;
            formattedLines.push(formattedLine);

            // Increase indent for IF, CASE, THEN, ELSE, ELSEIF, WHEN
            if (/\b(IF|CASE|THEN|ELSE|ELSEIF|WHEN)\b/i.test(trimmedLine) && !/\bEND\b/i.test(trimmedLine)) {
                indentLevel++;
            }
        }

        return formattedLines.join('\n');
    }

    /** Provide hover information */
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        // Triple-layer exclusion logic: Skip hover inside comments/strings
        if (this.isInExcludedRange(document, position)) {
            return null;
        }

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
                    symbol.description ?? '',
                    vscode.SymbolKind.Function,
                    range,
                    range
                );
                
                symbols.push(docSymbol);
            }
        }
        
        return symbols;
    }

    /** Provide signature help for function parameters */
    provideSignatureHelp(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
        _context: vscode.SignatureHelpContext
    ): vscode.ProviderResult<vscode.SignatureHelp> {
        // Check if signature help is enabled
        const config = vscode.workspace.getConfiguration('tableau');
        if (!config.get<boolean>('enableSignatureHelp', true)) {
            return null;
        }
        const line = document.lineAt(position.line).text;
        const textBeforePosition = line.substring(0, position.character);
        
        // Find function call pattern before cursor
        const functionMatch = /(\w+)\s*\(\s*([^)]*?)$/i.exec(textBeforePosition);
        if (!functionMatch) return null;
        
        const functionName = functionMatch[1].toUpperCase();
        const symbol = this.getSymbol(functionName);
        
        if (!symbol || symbol.type !== 'function') return null;
        
        // Count parameters by counting commas
        const paramText = functionMatch[2];
        const parameterIndex = paramText ? paramText.split(',').length - 1 : 0;
        
        // Create signature information
        const signature = new vscode.SignatureInformation(
            this.buildSignatureLabel(symbol),
            symbol.description
        );
        
        // Add parameter information if available
        if (symbol.parameters) {
            signature.parameters = symbol.parameters.map(param => 
                new vscode.ParameterInformation(
                    param.name,
                    param.description || `${param.type} parameter`
                )
            );
        } else {
            // Create basic parameter info for common functions
            signature.parameters = this.getBasicParameterInfo(functionName);
        }
        
        const signatureHelp = new vscode.SignatureHelp();
        signatureHelp.signatures = [signature];
        signatureHelp.activeSignature = 0;
        signatureHelp.activeParameter = Math.min(parameterIndex, signature.parameters.length - 1);
        
        return signatureHelp;
    }

    /** Build a signature label for display */
    private buildSignatureLabel(symbol: TableauSymbol): string {
        if (symbol.parameters && symbol.parameters.length > 0) {
            const params = symbol.parameters.map(p => 
                p.optional ? `[${p.name}]` : p.name
            ).join(', ');
            return `${symbol.name}(${params})`;
        }
        
        // Fallback for functions without detailed parameter info
        return this.getBasicSignature(symbol.name);
    }

    /** Get basic signature for common functions */
    private getBasicSignature(functionName: string): string {
        const signatures: Record<string, string> = {
            'SUM': 'SUM(expression)',
            'AVG': 'AVG(expression)',
            'COUNT': 'COUNT(expression)',
            'MIN': 'MIN(expression)',
            'MAX': 'MAX(expression)',
            'DATEPART': 'DATEPART(date_part, date)',
            'DATEADD': 'DATEADD(date_part, interval, date)',
            'DATEDIFF': 'DATEDIFF(date_part, start_date, end_date)',
            'LEFT': 'LEFT(string, number)',
            'RIGHT': 'RIGHT(string, number)',
            'MID': 'MID(string, start, length)',
            'LEN': 'LEN(string)',
            'CONTAINS': 'CONTAINS(string, substring)',
            'REPLACE': 'REPLACE(string, old_text, new_text)',
            'IF': 'IF condition THEN value1 ELSE value2 END',
            'ISNULL': 'ISNULL(expression)',
            'IFNULL': 'IFNULL(expression, replacement)',
            'ROUND': 'ROUND(number, [decimals])',
            'ABS': 'ABS(number)',
            'CEILING': 'CEILING(number)',
            'FLOOR': 'FLOOR(number)'
        };
        
        return signatures[functionName] || `${functionName}(...)`;
    }

    /** Get basic parameter information for common functions */
    private getBasicParameterInfo(functionName: string): vscode.ParameterInformation[] {
        const paramInfo: Record<string, vscode.ParameterInformation[]> = {
            'SUM': [new vscode.ParameterInformation('expression', 'The expression to sum')],
            'AVG': [new vscode.ParameterInformation('expression', 'The expression to average')],
            'COUNT': [new vscode.ParameterInformation('expression', 'The expression to count')],
            'MIN': [new vscode.ParameterInformation('expression', 'The expression to find minimum')],
            'MAX': [new vscode.ParameterInformation('expression', 'The expression to find maximum')],
            'DATEPART': [
                new vscode.ParameterInformation('date_part', 'Part of date to extract: "year", "month", "day", etc.'),
                new vscode.ParameterInformation('date', 'The date expression')
            ],
            'DATEADD': [
                new vscode.ParameterInformation('date_part', 'Part of date to add: "year", "month", "day", etc.'),
                new vscode.ParameterInformation('interval', 'Number to add'),
                new vscode.ParameterInformation('date', 'The date expression')
            ],
            'DATEDIFF': [
                new vscode.ParameterInformation('date_part', 'Part of date to calculate difference: "year", "month", "day", etc.'),
                new vscode.ParameterInformation('start_date', 'The start date'),
                new vscode.ParameterInformation('end_date', 'The end date')
            ],
            'LEFT': [
                new vscode.ParameterInformation('string', 'The string to extract from'),
                new vscode.ParameterInformation('number', 'Number of characters from the left')
            ],
            'RIGHT': [
                new vscode.ParameterInformation('string', 'The string to extract from'),
                new vscode.ParameterInformation('number', 'Number of characters from the right')
            ],
            'MID': [
                new vscode.ParameterInformation('string', 'The string to extract from'),
                new vscode.ParameterInformation('start', 'Starting position (1-based)'),
                new vscode.ParameterInformation('length', 'Number of characters to extract')
            ],
            'LEN': [new vscode.ParameterInformation('string', 'The string to measure')],
            'CONTAINS': [
                new vscode.ParameterInformation('string', 'The string to search in'),
                new vscode.ParameterInformation('substring', 'The substring to find')
            ],
            'REPLACE': [
                new vscode.ParameterInformation('string', 'The original string'),
                new vscode.ParameterInformation('old_text', 'The text to replace'),
                new vscode.ParameterInformation('new_text', 'The replacement text')
            ],
            'ISNULL': [new vscode.ParameterInformation('expression', 'The expression to test for null')],
            'IFNULL': [
                new vscode.ParameterInformation('expression', 'The expression to test'),
                new vscode.ParameterInformation('replacement', 'Value to use if expression is null')
            ],
            'ROUND': [
                new vscode.ParameterInformation('number', 'The number to round'),
                new vscode.ParameterInformation('decimals', 'Number of decimal places (optional)')
            ],
            'ABS': [new vscode.ParameterInformation('number', 'The number to get absolute value')],
            'CEILING': [new vscode.ParameterInformation('number', 'The number to round up')],
            'FLOOR': [new vscode.ParameterInformation('number', 'The number to round down')]
        };
        
        return paramInfo[functionName] || [];
    }
}
