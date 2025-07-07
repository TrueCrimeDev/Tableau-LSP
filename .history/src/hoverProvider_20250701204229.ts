import { Hover, HoverParams, MarkupContent, MarkupKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseDocument } from './documentModel';
import { JSDocParser, JSDocSymbol } from './jsdocParser';

interface SymbolInfo {
    name: string;
    type: string;
    description: string;
    parameters?: { name: string; type: string; description: string }[];
    returns?: string;
    example?: string;
}

let jsDocParser: JSDocParser | null = null;
const symbolInfoMap = new Map<string, SymbolInfo>(); // Legacy fallback map

// Helper function to escape HTML entities for security
function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Initialize JSDoc parser
const definitionFilePath = JSDocParser.findDefinitionFile(__dirname);
if (definitionFilePath) {
    jsDocParser = new JSDocParser(definitionFilePath);
    console.log(`Found twbl.d.twbl at: ${definitionFilePath}`);
    console.log(`Loaded ${jsDocParser.getSymbolCount()} symbols from JSDoc parser`);
    
    // Debug: log first few symbols
    const allSymbols = Array.from(jsDocParser.getAllSymbols().keys()).slice(0, 5);
    console.log(`First few symbols: ${allSymbols.join(', ')}`);
} else {
    console.error('Could not find twbl.d.twbl definition file');
}

export function provideHover(params: HoverParams, document: TextDocument): Hover | undefined {
    const { symbols } = parseDocument(document);
    const position = params.position;
    const text = document.getText();
    const offset = document.offsetAt(position);

    console.log(`Hover request at line ${position.line}, character ${position.character}`);

    // First, check parsed symbols
    for (const symbol of symbols) {
        if (
            position.line >= symbol.range.start.line &&
            position.line <= symbol.range.end.line &&
            position.character >= symbol.range.start.character &&
            position.character <= symbol.range.end.character
        ) {
            console.log(`Found parsed symbol: ${symbol.name}`);
            const symbolInfo = symbolInfoMap.get(symbol.name.toUpperCase());
            if (symbolInfo) {
                console.log(`Returning hover for parsed symbol: ${symbol.name}`);
                return createHoverResponse(symbolInfo, symbol.range);
            }
        }
    }

    // If no symbol found, try word-at-position lookup for functions
    const wordRange = getWordRangeAtPosition(document, position);
    if (wordRange) {
        const word = document.getText(wordRange).toUpperCase();
        console.log(`Found word at position: ${word}`);
        
        // Try JSDoc parser first
        if (jsDocParser) {
            const jsDocSymbol = jsDocParser.getSymbol(word);
            if (jsDocSymbol) {
                console.log(`Returning JSDoc hover for word: ${word}`);
                return createJSDocHoverResponse(jsDocSymbol, wordRange);
            }
        }
        
        // Fallback to legacy symbol info map (will be removed later)
        const symbolInfo = symbolInfoMap.get(word);
        if (symbolInfo) {
            console.log(`Returning legacy hover for word: ${word}`);
            return createHoverResponse(symbolInfo, wordRange);
        } else {
            console.log(`No symbol info found for word: ${word}`);
        }
    } else {
        console.log(`No word found at position`);
    }

    return undefined;
}

function createJSDocHoverResponse(jsDocSymbol: JSDocSymbol, range: any): Hover | undefined {
    const parts: string[] = [];

    // Function name with syntax highlighting
    const functionTitle = `**<span style="color:yellow;">${jsDocSymbol.name}</span>**`;
    parts.push(functionTitle);

    if (jsDocSymbol.deprecated) {
        parts.push('_⚠️ deprecated_');
    }

    if (jsDocSymbol.since) {
        parts.push(`_Since: ${jsDocSymbol.since}_`);
    }

    // Description
    if (jsDocSymbol.markdown_detail) {
        parts.push(jsDocSymbol.markdown_detail);
    } else if (jsDocSymbol.description) {
        parts.push(jsDocSymbol.description);
    }

    // Parameters section
    if (jsDocSymbol.parameters && jsDocSymbol.parameters.length > 0) {
        parts.push('\n**Parameters:**');
        jsDocSymbol.parameters.forEach(param => {
            const optional = param.optional ? '?' : '';
            const defaultVal = param.defaultValue ? ` = ${param.defaultValue}` : '';
            parts.push(`- \`${param.name}${optional}: ${param.type}${defaultVal}\` - ${param.description}`);
        });
    }

    // Returns section
    if (jsDocSymbol.returns) {
        parts.push(`\n**Returns:** \`${jsDocSymbol.returns}\``);
    }

    // Example section
    if (jsDocSymbol.example) {
        parts.push('\n**Example:**');
        if (jsDocSymbol.example.includes('\n')) {
            parts.push('```twbl');
            parts.push(jsDocSymbol.example);
            parts.push('```');
        } else {
            parts.push('`' + jsDocSymbol.example + '`');
        }
    }

    // Author
    if (jsDocSymbol.author) {
        parts.push(`_Author: ${jsDocSymbol.author}_`);
    }

    // Join with double newlines for Markdown
    const value = parts.filter(Boolean).join('\n\n');
    if (!value.trim()) return undefined;

    const markdown: MarkupContent = {
        kind: MarkupKind.Markdown,
        value,
    };

    return {
        contents: markdown,
        range: range,
    };
}

function createHoverResponse(symbolInfo: SymbolInfo, range: any): Hover | undefined {
    const parts: string[] = [];

    // Function name (Markdown bold)
    parts.push(`**${symbolInfo.name}**`);

    // Description
    if (symbolInfo.description) {
        parts.push(symbolInfo.description);
    }

    // Parameters section
    if (symbolInfo.parameters && symbolInfo.parameters.length > 0) {
        parts.push('\n**Parameters:**');
        symbolInfo.parameters.forEach((p: any) => {
            parts.push(`- \`${p.name}: ${p.type}\` - ${p.description}`);
        });
    }

    // Returns section
    if (symbolInfo.returns) {
        parts.push(`\n**Returns:** \`${symbolInfo.returns}\``);
    }

    // Example section
    if (symbolInfo.example) {
        parts.push('\n**Example:**');
        if (symbolInfo.example.includes('\n')) {
            parts.push('```twbl');
            parts.push(symbolInfo.example);
            parts.push('```');
        } else {
            parts.push('`' + symbolInfo.example + '`');
        }
    }

    // Join with double newlines for Markdown
    const value = parts.filter(Boolean).join('\n\n');
    if (!value.trim()) return undefined;

    const markdown: MarkupContent = {
        kind: MarkupKind.Markdown,
        value,
    };

    return {
        contents: markdown,
        range: range,
    };
}

function getWordRangeAtPosition(document: TextDocument, position: any) {
    const text = document.getText();
    const offset = document.offsetAt(position);
    
    // Find word boundaries
    let start = offset;
    let end = offset;
    
    // Move start backward to find word start
    while (start > 0 && /[A-Za-z_]/.test(text[start - 1])) {
        start--;
    }
    
    // Move end forward to find word end
    while (end < text.length && /[A-Za-z_]/.test(text[end])) {
        end++;
    }
    
    if (start === end) return null;
    
    return {
        start: document.positionAt(start),
        end: document.positionAt(end)
    };
}
