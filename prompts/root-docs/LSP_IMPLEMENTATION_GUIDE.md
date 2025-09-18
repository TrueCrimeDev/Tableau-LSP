# Tableau LSP Implementation Guide

## 1. LSP Contract Rules (Client-Server Communication)

### Core Contract Principles
- **Stateless Requests**: Each request should contain all necessary information
- **Document State Management**: Server maintains internal document models, client manages UI
- **Asynchronous Communication**: Server can push diagnostics without client request
- **Capability Negotiation**: Client and server negotiate supported features during initialization

### Implementation Rules

#### R1.1: Document Lifecycle Management
```typescript
// RULE: Always update internal document state on content changes
documents.onDidChangeContent((change) => {
    const parsedDocument = parseDocument(change.document);
    parsedDocumentCache.set(change.document.uri, {
        document: change.document,
        ...parsedDocument,
    });
    // RULE: Push diagnostics immediately after parsing
    const diagnostics = getDiagnostics(change.document, parsedDocument);
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
});
```

#### R1.2: Capability Declaration
```typescript
// RULE: Only declare capabilities that are fully implemented
const result: InitializeResult = {
    capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        documentSymbolProvider: true,
        workspaceSymbolProvider: true,
        documentFormattingProvider: true,
        hoverProvider: true,
        signatureHelpProvider: {
            triggerCharacters: [' ', '\t', '\n', ')', ',', 'N', 'E'] // THEN, ELSE triggers
        },
    },
};
```

#### R1.3: Error Handling
```typescript
// RULE: Always handle missing documents gracefully
connection.onHover((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return null; // Never throw, return null for missing documents
    }
    return provideHover(params, document, fieldParser);
});
```

---

## 2. Diagnostics (textDocument/publishDiagnostics)

### Core Diagnostics Principles
- **Incremental Analysis**: Re-analyze only changed portions when possible
- **Severity Levels**: Use appropriate severity (Error, Warning, Information, Hint)
- **Contextual Messages**: Provide actionable error messages
- **Performance**: Limit diagnostics to prevent UI lag

### Implementation Rules

#### R2.1: Diagnostic Lifecycle
```typescript
// RULE: Replace all diagnostics for a document on each update
documents.onDidChangeContent((change) => {
    const diagnostics = getDiagnostics(change.document, parsedDocument);
    connection.sendDiagnostics({ 
        uri: change.document.uri, 
        diagnostics // This replaces ALL previous diagnostics
    });
});
```

#### R2.2: Tableau-Specific Diagnostic Categories
```typescript
// RULE: Implement these diagnostic categories for Tableau
enum TableauDiagnosticCategory {
    SYNTAX_ERROR = "Syntax Error",
    UNCLOSED_BLOCK = "Unclosed Block", 
    MISSING_BRANCH = "Missing Branch",
    INVALID_FUNCTION = "Invalid Function",
    FIELD_REFERENCE = "Field Reference",
    LOD_VALIDATION = "LOD Validation",
    CONDITIONAL_LOGIC = "Conditional Logic"
}
```

#### R2.3: Conditional Expression Validation
```typescript
// RULE: Validate IF/CASE block structure
export function validateConditionalBlock(symbol: Symbol): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    
    // RULE: Every IF must have matching END
    if (symbol.name === 'IF' && !symbol.end) {
        diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: symbol.range,
            message: 'Unclosed IF block. Missing END statement.',
            source: 'Tableau LSP'
        });
    }
    
    // RULE: Validate branch sequence (THEN -> ELSEIF -> ELSE)
    if (symbol.children) {
        validateBranchSequence(symbol.children, diagnostics);
    }
    
    return diagnostics;
}
```

#### R2.4: Function Signature Validation
```typescript
// RULE: Validate function calls against FUNCTION_SIGNATURES
export function validateFunctionCall(symbol: Symbol): Diagnostic[] {
    const signature = FUNCTION_SIGNATURES[symbol.name];
    if (!signature) {
        return [{
            severity: DiagnosticSeverity.Error,
            range: symbol.range,
            message: `Unknown function: ${symbol.name}`,
            source: 'Tableau LSP'
        }];
    }
    
    // RULE: Validate parameter count when AST parsing supports it
    const [minArgs, maxArgs] = signature;
    const argCount = symbol.arguments?.length || 0;
    
    if (argCount < minArgs || argCount > maxArgs) {
        return [{
            severity: DiagnosticSeverity.Error,
            range: symbol.range,
            message: `Function ${symbol.name} expects ${minArgs}-${maxArgs} arguments, got ${argCount}`,
            source: 'Tableau LSP'
        }];
    }
    
    return [];
}
```

---

## 3. Signature Help (textDocument/signatureHelp)

### Core Signature Help Principles
- **Context Awareness**: Show help based on cursor position within expressions
- **Multi-line Support**: Handle complex nested IF/CASE structures
- **Active Parameter Highlighting**: Highlight current parameter/branch
- **Trigger Characters**: Respond to appropriate trigger characters

### Implementation Rules

#### R3.1: Signature Help Triggers
```typescript
// RULE: Define comprehensive trigger characters for Tableau
signatureHelpProvider: {
    triggerCharacters: [
        ' ', '\t', '\n',    // Whitespace
        '(', ')', ',',      // Function calls
        'N', 'E',          // 'THEN', 'ELSE' completion
        'F'                // 'ELSEIF' completion
    ]
}
```

#### R3.2: Conditional Expression Context
```typescript
// RULE: Find deepest enclosing conditional block
export function findEnclosingConditionalBlock(
    symbols: Symbol[],
    position: Position
): Symbol | null {
    for (const symbol of symbols) {
        if (isPositionWithinSymbol(position, symbol)) {
            // RULE: Check children first (deepest first)
            const childResult = findEnclosingConditionalBlock(symbol.children || [], position);
            if (childResult) return childResult;
            
            // RULE: Only return IF/CASE blocks for signature help
            if (symbol.name === 'IF' || symbol.name === 'CASE') {
                return symbol;
            }
        }
    }
    return null;
}
```

#### R3.3: Multi-line Signature Display
```typescript
// RULE: Show complete block structure with active branch highlighted
export function buildConditionalSignature(
    block: Symbol,
    position: Position,
    document: TextDocument
): SignatureHelp {
    const displayLines: string[] = [];
    let activeParameter = 0;
    
    // RULE: Extract and display all branches
    for (const child of block.children || []) {
        if (isConditionalBranch(child)) {
            const lineText = extractBranchLine(child, document);
            
            // RULE: Bold the active branch
            if (isPositionInBranch(position, child)) {
                activeParameter = displayLines.length;
                displayLines.push(`**${lineText}**`);
            } else {
                displayLines.push(lineText);
            }
        }
    }
    
    // RULE: Always show END line
    displayLines.push(extractEndLine(block, document));
    
    return {
        signatures: [{
            label: displayLines.join('\n'),
            documentation: {
                kind: MarkupKind.Markdown,
                value: `${block.name} block structure`
            },
            parameters: displayLines.map(line => ({ label: line }))
        }],
        activeSignature: 0,
        activeParameter
    };
}
```

---

## 4. Document Formatting (textDocument/formatting)

### Core Formatting Principles
- **Minimal Edits**: Return only necessary text changes
- **Consistent Style**: Enforce consistent Tableau calculation style
- **Preserve Semantics**: Never change calculation meaning
- **User Preferences**: Respect formatting options

### Implementation Rules

#### R4.1: Tableau Formatting Style
```typescript
// RULE: Define Tableau-specific formatting rules
export interface TableauFormattingRules {
    keywordCase: 'UPPER' | 'LOWER' | 'PRESERVE';
    indentSize: number;
    indentType: 'spaces' | 'tabs';
    alignBranches: boolean;
    alignOperators: boolean;
    maxLineLength: number;
}

// RULE: Default Tableau formatting style
export const DEFAULT_TABLEAU_STYLE: TableauFormattingRules = {
    keywordCase: 'UPPER',
    indentSize: 4,
    indentType: 'spaces',
    alignBranches: true,
    alignOperators: false,
    maxLineLength: 120
};
```

#### R4.2: Conditional Block Formatting
```typescript
// RULE: Format IF/CASE blocks with consistent indentation
export function formatConditionalBlock(
    block: Symbol, 
    document: TextDocument,
    options: FormattingOptions
): TextEdit[] {
    const edits: TextEdit[] = [];
    
    // RULE: IF keyword at base indentation
    edits.push(...formatKeyword(block, 'IF', 0, options));
    
    // RULE: THEN/ELSEIF/ELSE at same level as IF
    for (const child of block.children || []) {
        if (child.name === 'THEN' || child.name === 'ELSEIF' || child.name === 'ELSE') {
            edits.push(...formatKeyword(child, child.name, 0, options));
            
            // RULE: Expressions indented within branches
            if (child.children) {
                edits.push(...formatBranchContent(child.children, 1, options));
            }
        }
    }
    
    // RULE: END at same level as IF
    if (block.end) {
        edits.push(...formatKeyword(block.end, 'END', 0, options));
    }
    
    return edits;
}
```

#### R4.3: Function Call Formatting
```typescript
// RULE: Format function calls with consistent spacing
export function formatFunctionCall(
    symbol: Symbol,
    document: TextDocument,
    options: FormattingOptions
): TextEdit[] {
    const edits: TextEdit[] = [];
    
    // RULE: Function name in uppercase
    edits.push({
        range: symbol.range,
        newText: symbol.name.toUpperCase()
    });
    
    // RULE: Format arguments with proper spacing
    if (symbol.arguments) {
        edits.push(...formatArguments(symbol.arguments, options));
    }
    
    return edits;
}
```

---

## 5. Tableau IF Expression Integration

### Core IF Expression Principles
- **Complete Block Validation**: Validate entire IF-THEN-ELSE-END structure
- **Nested Expression Support**: Handle nested IF blocks
- **Branch-aware Assistance**: Provide context-aware help within branches
- **Performance Optimization**: Efficiently parse and validate complex expressions

### Implementation Rules

#### R5.1: IF Expression AST Structure
```typescript
// RULE: Define complete IF expression structure
export interface TableauIfExpression {
    keyword: 'IF';
    condition: Expression;
    thenBranch: Expression;
    elseIfBranches: Array<{
        condition: Expression;
        thenExpression: Expression;
    }>;
    elseBranch?: Expression;
    endKeyword: 'END';
}
```

#### R5.2: Branch-aware Diagnostics
```typescript
// RULE: Validate each branch of IF expression
export function validateIfBranches(ifExpr: TableauIfExpression): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    
    // RULE: Validate condition expressions
    diagnostics.push(...validateExpression(ifExpr.condition));
    
    // RULE: Validate THEN branch
    diagnostics.push(...validateExpression(ifExpr.thenBranch));
    
    // RULE: Validate ELSEIF branches
    for (const elseIfBranch of ifExpr.elseIfBranches) {
        diagnostics.push(...validateExpression(elseIfBranch.condition));
        diagnostics.push(...validateExpression(elseIfBranch.thenExpression));
    }
    
    // RULE: Validate ELSE branch if present
    if (ifExpr.elseBranch) {
        diagnostics.push(...validateExpression(ifExpr.elseBranch));
    }
    
    return diagnostics;
}
```

#### R5.3: Branch-aware Signature Help
```typescript
// RULE: Provide context-specific signature help within IF branches
export function getIfBranchContext(
    position: Position,
    ifExpr: TableauIfExpression
): BranchContext {
    // RULE: Determine which branch contains the cursor
    if (isPositionInExpression(position, ifExpr.condition)) {
        return { type: 'condition', branch: 'if' };
    }
    
    if (isPositionInExpression(position, ifExpr.thenBranch)) {
        return { type: 'expression', branch: 'then' };
    }
    
    // RULE: Check ELSEIF branches
    for (let i = 0; i < ifExpr.elseIfBranches.length; i++) {
        const elseIfBranch = ifExpr.elseIfBranches[i];
        if (isPositionInExpression(position, elseIfBranch.condition)) {
            return { type: 'condition', branch: 'elseif', index: i };
        }
        if (isPositionInExpression(position, elseIfBranch.thenExpression)) {
            return { type: 'expression', branch: 'elseif', index: i };
        }
    }
    
    // RULE: Check ELSE branch
    if (ifExpr.elseBranch && isPositionInExpression(position, ifExpr.elseBranch)) {
        return { type: 'expression', branch: 'else' };
    }
    
    return { type: 'unknown', branch: 'unknown' };
}
```

#### R5.4: IF Expression Formatting
```typescript
// RULE: Format IF expressions with consistent style
export function formatIfExpression(
    ifExpr: TableauIfExpression,
    document: TextDocument,
    options: FormattingOptions
): TextEdit[] {
    const edits: TextEdit[] = [];
    const indent = ' '.repeat(options.tabSize || 4);
    
    // RULE: Format as multi-line when complex
    if (isComplexIfExpression(ifExpr)) {
        edits.push(...formatMultiLineIf(ifExpr, indent, options));
    } else {
        edits.push(...formatSingleLineIf(ifExpr, options));
    }
    
    return edits;
}

function isComplexIfExpression(ifExpr: TableauIfExpression): boolean {
    return (
        ifExpr.elseIfBranches.length > 0 ||
        ifExpr.elseBranch !== undefined ||
        containsNestedExpressions(ifExpr)
    );
}
```

---

## 6. Performance and Optimization Rules

### R6.1: Caching Strategy
```typescript
// RULE: Cache parsed documents but invalidate on changes
export const parsedDocumentCache: Map<string, ParsedDocument> = new Map();

// RULE: Clean up cache for closed documents
documents.onDidClose((event) => {
    parsedDocumentCache.delete(event.document.uri);
});
```

### R6.2: Incremental Parsing
```typescript
// RULE: Use incremental parsing for large documents
export function parseDocumentIncremental(
    document: TextDocument,
    changes: TextDocumentContentChangeEvent[]
): ParsedDocument {
    const cached = parsedDocumentCache.get(document.uri);
    
    if (cached && canUseIncrementalParsing(changes)) {
        return updateParsedDocument(cached, changes);
    }
    
    return parseDocument(document); // Full reparse
}
```

### R6.3: Diagnostic Throttling
```typescript
// RULE: Throttle diagnostic updates to prevent UI lag
const diagnosticThrottler = new Map<string, NodeJS.Timeout>();

function sendDiagnosticsThrottled(uri: string, diagnostics: Diagnostic[]) {
    const existing = diagnosticThrottler.get(uri);
    if (existing) {
        clearTimeout(existing);
    }
    
    diagnosticThrottler.set(uri, setTimeout(() => {
        connection.sendDiagnostics({ uri, diagnostics });
        diagnosticThrottler.delete(uri);
    }, 100)); // 100ms throttle
}
```

---

## 7. Error Handling Rules

### R7.1: Graceful Degradation
```typescript
// RULE: Always return partial results rather than failing completely
export function safeProvideHover(params: HoverParams, document: TextDocument): Hover | null {
    try {
        return provideHover(params, document);
    } catch (error) {
        connection.console.error(`Hover provider error: ${error}`);
        return null; // Graceful degradation
    }
}
```

### R7.2: Logging Strategy
```typescript
// RULE: Log errors without exposing sensitive information
export function logSafeError(error: Error, context: string): void {
    const safeMessage = error.message.replace(/file:\/\/[^\s]+/g, '[FILE_PATH]');
    connection.console.error(`${context}: ${safeMessage}`);
}
```

This implementation guide provides comprehensive rules and contexts for implementing the 5 core LSP features for Tableau expressions. Each rule is designed to ensure robust, performant, and user-friendly language server behavior.