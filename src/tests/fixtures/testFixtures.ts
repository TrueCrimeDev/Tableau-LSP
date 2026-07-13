// src/tests/fixtures/testFixtures.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range, Diagnostic, DiagnosticSeverity, CompletionItem, CompletionItemKind, Hover, SignatureHelp, SignatureInformation, ParameterInformation } from 'vscode-languageserver';
import { Symbol, SymbolType, ParsedDocument, CachedDocument } from '../../common.js';

/**
 * R8.1: Comprehensive test fixtures and mock data for consistent testing
 * 
 * This module provides reusable test fixtures, mock data, and helper functions
 * to ensure consistent and comprehensive testing across all components.
 */

/**
 * Common Tableau expressions for testing
 */
export const TABLEAU_EXPRESSIONS = {
    SIMPLE_IF: 'IF [Sales] > 100 THEN "High" ELSE "Low" END',
    NESTED_IF: `
        IF [Sales] > 1000 THEN "Excellent"
        ELSEIF [Sales] > 500 THEN "Good"
        ELSEIF [Sales] > 100 THEN "Average"
        ELSE "Poor"
        END
    `,
    SIMPLE_CASE: `
        CASE [Category]
            WHEN 'Furniture' THEN 'F'
            WHEN 'Technology' THEN 'T'
            ELSE 'O'
        END
    `,
    COMPLEX_CASE: `
        CASE 
            WHEN [Sales] > 1000 AND [Profit] > 100 THEN "High Performance"
            WHEN [Sales] > 500 OR [Profit] > 50 THEN "Medium Performance"
            ELSE "Low Performance"
        END
    `,
    LOD_FIXED: '{ FIXED [Region] : SUM([Sales]) }',
    LOD_INCLUDE: '{ INCLUDE [Category] : AVG([Profit]) }',
    LOD_EXCLUDE: '{ EXCLUDE [Sub-Category] : COUNT([Orders]) }',
    AGGREGATE_FUNCTIONS: [
        'SUM([Sales])',
        'AVG([Profit])',
        'COUNT([Orders])',
        'MIN([Discount])',
        'MAX([Quantity])'
    ],
    STRING_FUNCTIONS: [
        'LEFT([Customer Name], 5)',
        'RIGHT([Product Name], 10)',
        'MID([Description], 2, 8)',
        'LEN([Category])',
        'UPPER([Region])',
        'LOWER([Segment])'
    ],
    DATE_FUNCTIONS: [
        'YEAR([Order Date])',
        'MONTH([Ship Date])',
        'DAY([Order Date])',
        'DATEADD("month", 1, [Order Date])',
        'DATEDIFF("day", [Order Date], [Ship Date])'
    ],
    MATH_FUNCTIONS: [
        'ROUND([Sales], 2)',
        'ABS([Profit])',
        'CEILING([Discount])',
        'FLOOR([Quantity])',
        'SQRT([Sales])'
    ],
    COMPLEX_EXPRESSIONS: [
        'SUM(IF [Region] = "East" THEN [Sales] ELSE 0 END)',
        'AVG(CASE WHEN [Category] = "Furniture" THEN [Profit] END)',
        '{ FIXED [Customer ID] : SUM([Sales]) } / { FIXED : SUM([Sales]) }',
        'RUNNING_SUM(SUM([Sales]))',
        'WINDOW_AVG(SUM([Profit]), -2, 0)'
    ],
    MALFORMED_EXPRESSIONS: [
        'IF [Sales] > 100 THEN "High" ELSE "Low"', // Missing END
        'CASE [Category] WHEN "Furniture" THEN "F" ELSE "O"', // Missing END
        'SUM([Sales]', // Missing closing parenthesis
        'IF [Sales] > 100 THEN THEN "High" ELSE "Low" END', // Duplicate THEN
        '{ FIXED [Region] : SUM([Sales]', // Missing closing brace
        'LEFT([Customer Name], )', // Missing parameter
        'DATEADD("month", [Order Date])', // Missing parameter
        'IF THEN "High" ELSE "Low" END' // Missing condition
    ]
};

/**
 * Field definitions for testing
 */
export const TABLEAU_FIELDS = {
    DIMENSIONS: [
        { name: 'Region', type: 'string', description: 'Sales region' },
        { name: 'Category', type: 'string', description: 'Product category' },
        { name: 'Sub-Category', type: 'string', description: 'Product sub-category' },
        { name: 'Customer Name', type: 'string', description: 'Customer name' },
        { name: 'Product Name', type: 'string', description: 'Product name' },
        { name: 'Segment', type: 'string', description: 'Customer segment' },
        { name: 'Order Date', type: 'date', description: 'Order date' },
        { name: 'Ship Date', type: 'date', description: 'Ship date' }
    ],
    MEASURES: [
        { name: 'Sales', type: 'number', description: 'Sales amount' },
        { name: 'Profit', type: 'number', description: 'Profit amount' },
        { name: 'Quantity', type: 'number', description: 'Quantity ordered' },
        { name: 'Discount', type: 'number', description: 'Discount percentage' },
        { name: 'Orders', type: 'number', description: 'Number of orders' }
    ],
    CALCULATED_FIELDS: [
        { name: 'Profit Ratio', expression: '[Profit] / [Sales]', type: 'number' },
        { name: 'Sales Category', expression: 'IF [Sales] > 100 THEN "High" ELSE "Low" END', type: 'string' },
        { name: 'Days to Ship', expression: 'DATEDIFF("day", [Order Date], [Ship Date])', type: 'number' }
    ]
};

/**
 * Test document factory
 */
export class TestDocumentFactory {
    static create(
        content: string,
        uri: string = 'test://test.twbl',
        version: number = 1,
        languageId: string = 'tableau'
    ): TextDocument {
        return TextDocument.create(uri, languageId, version, content);
    }
    
    static createWithExpression(expression: string): TextDocument {
        return this.create(expression);
    }
    
    static createMultiLine(lines: string[]): TextDocument {
        return this.create(lines.join('\n'));
    }
    
    static createLarge(baseExpression: string, repetitions: number = 100): TextDocument {
        const lines = Array(repetitions).fill(baseExpression);
        return this.createMultiLine(lines);
    }
    
    static createWithComments(expression: string, comments: string[]): TextDocument {
        const lines = [];
        comments.forEach(comment => lines.push(`// ${comment}`));
        lines.push(expression);
        return this.createMultiLine(lines);
    }
}

/**
 * Position and Range helpers
 */
export class TestPositionFactory {
    static create(line: number = 0, character: number = 0): Position {
        return { line, character };
    }
    
    static createRange(
        startLine: number = 0,
        startChar: number = 0,
        endLine: number = 0,
        endChar: number = 10
    ): Range {
        return Range.create(
            { line: startLine, character: startChar },
            { line: endLine, character: endChar }
        );
    }
    
    static findInDocument(document: TextDocument, searchText: string): Position | null {
        const content = document.getText();
        const lines = content.split('\n');
        
        for (let line = 0; line < lines.length; line++) {
            const character = lines[line].indexOf(searchText);
            if (character !== -1) {
                return { line, character };
            }
        }
        
        return null;
    }
    
    static findRangeInDocument(document: TextDocument, searchText: string): Range | null {
        const position = this.findInDocument(document, searchText);
        if (!position) return null;
        
        return Range.create(
            position,
            { line: position.line, character: position.character + searchText.length }
        );
    }
}

/**
 * Symbol factory for testing
 */
export class TestSymbolFactory {
    static create(
        name: string,
        type: SymbolType,
        range: Range,
        text?: string,
        children?: Symbol[]
    ): Symbol {
        return {
            name,
            type,
            range,
            text,
            children,
            arguments: [],
            parent: undefined,
            end: undefined
        };
    }
    
    static createFunction(
        name: string,
        range: Range,
        args: string[] = []
    ): Symbol {
        return {
            name,
            type: SymbolType.FunctionCall,
            range,
            arguments: args.map(arg => ({
                text: arg,
                range: range // Simplified for testing
            })),
            children: [],
            parent: undefined,
            end: undefined
        };
    }
    
    static createField(name: string, range: Range): Symbol {
        return this.create(name, SymbolType.FieldReference, range, `[${name}]`);
    }
    
    static createKeyword(name: string, range: Range): Symbol {
        return this.create(name, SymbolType.Keyword, range, name.toUpperCase());
    }
    
    static createExpression(name: string, range: Range, children: Symbol[] = []): Symbol {
        return {
            name,
            type: SymbolType.Expression,
            range,
            children,
            arguments: [],
            parent: undefined,
            end: undefined
        };
    }
}

/**
 * Diagnostic factory for testing
 */
export class TestDiagnosticFactory {
    static create(
        range: Range,
        message: string,
        severity: DiagnosticSeverity = DiagnosticSeverity.Error,
        code?: string
    ): Diagnostic {
        return {
            range,
            message,
            severity,
            code,
            source: 'tableau-lsp'
        };
    }
    
    static createError(range: Range, message: string, code?: string): Diagnostic {
        return this.create(range, message, DiagnosticSeverity.Error, code);
    }
    
    static createWarning(range: Range, message: string, code?: string): Diagnostic {
        return this.create(range, message, DiagnosticSeverity.Warning, code);
    }
    
    static createInfo(range: Range, message: string, code?: string): Diagnostic {
        return this.create(range, message, DiagnosticSeverity.Information, code);
    }
}

/**
 * Completion item factory for testing
 */
export class TestCompletionFactory {
    static create(
        label: string,
        kind: CompletionItemKind,
        detail?: string,
        documentation?: string,
        insertText?: string
    ): CompletionItem {
        return {
            label,
            kind,
            detail,
            documentation,
            insertText: insertText || label
        };
    }
    
    static createFunction(
        name: string,
        detail: string,
        documentation: string,
        insertText?: string
    ): CompletionItem {
        return this.create(
            name,
            CompletionItemKind.Function,
            detail,
            documentation,
            insertText || `${name}($1)$0`
        );
    }
    
    static createField(name: string, type: string): CompletionItem {
        return this.create(
            name,
            CompletionItemKind.Field,
            `${type} field`,
            `Field: ${name}`,
            `[${name}]`
        );
    }
    
    static createKeyword(keyword: string, documentation: string): CompletionItem {
        return this.create(
            keyword,
            CompletionItemKind.Keyword,
            'Keyword',
            documentation,
            keyword.toUpperCase()
        );
    }
}

/**
 * Hover factory for testing
 */
export class TestHoverFactory {
    static create(contents: string | string[], range?: Range): Hover {
        return {
            contents: Array.isArray(contents) ? contents : [contents],
            range
        };
    }
    
    static createFunction(
        name: string,
        signature: string,
        description: string,
        examples: string[] = []
    ): Hover {
        const contents = [
            `**${name}**`,
            `\`\`\`tableau\n${signature}\n\`\`\``,
            description
        ];
        
        if (examples.length > 0) {
            contents.push('**Examples:**');
            examples.forEach(example => {
                contents.push(`\`\`\`tableau\n${example}\n\`\`\``);
            });
        }
        
        return this.create(contents);
    }
    
    static createField(name: string, type: string, description: string): Hover {
        return this.create([
            `**[${name}]**`,
            `Type: ${type}`,
            description
        ]);
    }
}

/**
 * Signature help factory for testing
 */
export class TestSignatureFactory {
    static create(
        signatures: SignatureInformation[],
        activeSignature: number = 0,
        activeParameter: number = 0
    ): SignatureHelp {
        return {
            signatures,
            activeSignature,
            activeParameter
        };
    }
    
    static createSignature(
        label: string,
        documentation: string,
        parameters: ParameterInformation[] = []
    ): SignatureInformation {
        return {
            label,
            documentation,
            parameters
        };
    }
    
    static createParameter(
        label: string,
        documentation: string
    ): ParameterInformation {
        return {
            label,
            documentation
        };
    }
    
    static createFunctionSignature(
        name: string,
        params: Array<{ name: string; type: string; description: string }>,
        returnType: string,
        description: string
    ): SignatureInformation {
        const paramLabels = params.map(p => `${p.name}: ${p.type}`).join(', ');
        const label = `${name}(${paramLabels}) -> ${returnType}`;
        
        const parameters = params.map(p => this.createParameter(
            `${p.name}: ${p.type}`,
            p.description
        ));
        
        return this.createSignature(label, description, parameters);
    }
}

/**
 * Parsed document factory for testing
 */
export class TestParsedDocumentFactory {
    static create(
        document: TextDocument,
        symbols: Symbol[] = [],
        diagnostics: Diagnostic[] = []
    ): ParsedDocument {
        return {
            document,
            symbols,
            diagnostics,
            lineSymbols: new Map(),
            lastChangeVersion: document.version,
            changedLines: new Set()
        };
    }
    
    static createCached(
        document: TextDocument,
        symbols: Symbol[] = [],
        diagnostics: Diagnostic[] = []
    ): CachedDocument {
        const lineSymbols = new Map<number, Symbol[]>();
        
        // Organize symbols by line
        symbols.forEach(symbol => {
            const line = symbol.range.start.line;
            if (!lineSymbols.has(line)) {
                lineSymbols.set(line, []);
            }
            lineSymbols.get(line)!.push(symbol);
        });
        
        return {
            document,
            symbols,
            diagnostics,
            lineSymbols,
            lastChangeVersion: document.version,
            changedLines: new Set()
        };
    }
    
    static createWithExpression(expression: string): ParsedDocument {
        const document = TestDocumentFactory.createWithExpression(expression);
        
        // Create basic symbols based on expression type
        const symbols: Symbol[] = [];
        const range = TestPositionFactory.createRange(0, 0, 0, expression.length);
        
        if (expression.includes('IF')) {
            symbols.push(TestSymbolFactory.createKeyword('IF', range));
        }
        if (expression.includes('CASE')) {
            symbols.push(TestSymbolFactory.createKeyword('CASE', range));
        }
        if (expression.includes('SUM(')) {
            symbols.push(TestSymbolFactory.createFunction('SUM', range, ['[Sales]']));
        }
        
        return this.create(document, symbols);
    }
}

/**
 * Mock data generators
 */
export class TestMockData {
    static generateRandomExpression(): string {
        const expressions = [
            ...TABLEAU_EXPRESSIONS.AGGREGATE_FUNCTIONS,
            ...TABLEAU_EXPRESSIONS.STRING_FUNCTIONS,
            ...TABLEAU_EXPRESSIONS.DATE_FUNCTIONS,
            ...TABLEAU_EXPRESSIONS.MATH_FUNCTIONS
        ];
        
        return expressions[Math.floor(Math.random() * expressions.length)];
    }
    
    static generateRandomField(): { name: string; type: string; description: string } {
        const allFields = [...TABLEAU_FIELDS.DIMENSIONS, ...TABLEAU_FIELDS.MEASURES];
        return allFields[Math.floor(Math.random() * allFields.length)];
    }
    
    static generateComplexExpression(): string {
        const templates = [
            'IF {field1} > {value} THEN {result1} ELSE {result2} END',
            'CASE {field1} WHEN "{value}" THEN {result1} ELSE {result2} END',
            '{ FIXED {field1} : {aggregation}({field2}) }',
            '{aggregation}(IF {field1} = "{value}" THEN {field2} END)'
        ];
        
        const template = templates[Math.floor(Math.random() * templates.length)];
        const field1 = this.generateRandomField();
        const field2 = this.generateRandomField();
        const aggregation = ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'][Math.floor(Math.random() * 5)];
        
        return template
            .replace('{field1}', `[${field1.name}]`)
            .replace('{field2}', `[${field2.name}]`)
            .replace('{aggregation}', aggregation)
            .replace('{value}', field1.type === 'string' ? 'Test' : '100')
            .replace('{result1}', '"High"')
            .replace('{result2}', '"Low"');
    }
    
    static generateTestSuite(componentName: string, testCount: number = 10): string {
        const tests = [];
        
        for (let i = 0; i < testCount; i++) {
            const expression = this.generateRandomExpression();
            tests.push(`
        it('should handle ${expression.split('(')[0]} function', () => {
            const document = TestDocumentFactory.createWithExpression('${expression}');
            const result = ${componentName}(document);
            expect(result).toBeDefined();
        });
            `);
        }
        
        return `
// Auto-generated tests for ${componentName}
describe('${componentName} - Generated Tests', () => {
    ${tests.join('')}
});
        `;
    }
}

/**
 * Test utilities and helpers
 */
export class TestUtils {
    static async waitFor(condition: () => boolean, timeout: number = 1000): Promise<void> {
        const start = Date.now();
        while (!condition() && Date.now() - start < timeout) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        if (!condition()) {
            throw new Error('Condition not met within timeout');
        }
    }
    
    static measurePerformance<T>(fn: () => T): { result: T; duration: number } {
        const start = Date.now();
        const result = fn();
        const duration = Date.now() - start;
        return { result, duration };
    }
    
    static async measureAsyncPerformance<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
        const start = Date.now();
        const result = await fn();
        const duration = Date.now() - start;
        return { result, duration };
    }
    
    static createMemorySnapshot(): { heapUsed: number; heapTotal: number } {
        if (typeof process !== 'undefined' && process.memoryUsage) {
            const usage = process.memoryUsage();
            return {
                heapUsed: usage.heapUsed,
                heapTotal: usage.heapTotal
            };
        }
        return { heapUsed: 0, heapTotal: 0 };
    }
    
    static compareMemorySnapshots(
        before: { heapUsed: number; heapTotal: number },
        after: { heapUsed: number; heapTotal: number }
    ): { heapUsedDiff: number; heapTotalDiff: number } {
        return {
            heapUsedDiff: after.heapUsed - before.heapUsed,
            heapTotalDiff: after.heapTotal - before.heapTotal
        };
    }
    
    static generateStressTestData(count: number): TextDocument[] {
        const documents: TextDocument[] = [];
        
        for (let i = 0; i < count; i++) {
            const expression = TestMockData.generateComplexExpression();
            const document = TestDocumentFactory.create(
                expression,
                `test://stress-test-${i}.twbl`,
                1
            );
            documents.push(document);
        }
        
        return documents;
    }
}

/**
 * Export all test data for easy access
 */
export const TEST_DATA = {
    EXPRESSIONS: TABLEAU_EXPRESSIONS,
    FIELDS: TABLEAU_FIELDS,
    FACTORIES: {
        Document: TestDocumentFactory,
        Position: TestPositionFactory,
        Symbol: TestSymbolFactory,
        Diagnostic: TestDiagnosticFactory,
        Completion: TestCompletionFactory,
        Hover: TestHoverFactory,
        Signature: TestSignatureFactory,
        ParsedDocument: TestParsedDocumentFactory
    },
    MOCK: TestMockData,
    UTILS: TestUtils
};
