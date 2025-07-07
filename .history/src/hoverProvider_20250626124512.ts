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

export function provideHover(params: HoverParams, document: TextDocument): Hover | null {
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

    return null;
}

function createJSDocHoverResponse(jsDocSymbol: JSDocSymbol, range: any): Hover {
    const parts: string[] = [];

    // Function name (Markdown bold)
    parts.push(`**${jsDocSymbol.name}**`);

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
    if (!value.trim()) return null;

    const markdown: MarkupContent = {
        kind: MarkupKind.Markdown,
        value,
    };

    return {
        contents: markdown,
        range: range,
    };
                    .replace(/>/g, '&gt;');
                parts.push(`<p><code style="background:var(--vscode-textCodeBlock-background);padding:2px 4px;border-radius:3px;color:var(--vscode-charts-green);">${escapedExample}</code></p>`);
            } else {
                // Description text - format as regular text
                parts.push(`<p style="color:var(--vscode-foreground);">${jsDocSymbol.example}</p>`);
            }
        }
    }

    // Add author if available
    if (jsDocSymbol.author) {
        parts.push('<hr>');
        parts.push(`<p><em style="color:var(--vscode-descriptionForeground);">Author: ${jsDocSymbol.author}</em></p>`);
    }

    const markdown: MarkupContent = {
        kind: MarkupKind.Markdown,
        value: parts.join('\n'),
    };

    return {
        contents: markdown,
        range: range,
    };
}

function createHoverResponse(symbolInfo: SymbolInfo, range: any): Hover {
    const parts: string[] = [];

    // Function name with styling
    const escapedName = symbolInfo.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    parts.push(`<h3><span style="color:var(--vscode-symbolIcon-functionForeground);">${escapedName}</span></h3>`);
    parts.push('<hr>');

    // Description
    if (symbolInfo.description) {
        const escapedDesc = symbolInfo.description.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        parts.push(`<p style="color:var(--vscode-foreground);">${escapedDesc}</p>`);
    }

    // Parameters section
    if (symbolInfo.parameters && symbolInfo.parameters.length > 0) {
        parts.push('<hr>');
        parts.push(`<h4 style="color:var(--vscode-symbolIcon-variableForeground);">Parameters</h4>`);
        parts.push('<ul>');
        symbolInfo.parameters.forEach((p: any) => {
            const escapedParamName = p.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const escapedParamType = p.type.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const escapedParamDesc = p.description.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            parts.push(`<li><code style="background:var(--vscode-textCodeBlock-background);padding:2px 4px;border-radius:3px;">${escapedParamName}: <span style="color:var(--vscode-symbolIcon-typeForeground);">${escapedParamType}</span></code> - ${escapedParamDesc}</li>`);
        });
        parts.push('</ul>');
    }

    // Returns section
    if (symbolInfo.returns) {
        parts.push('<hr>');
        const escapedReturns = symbolInfo.returns.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        parts.push(`<p><strong style="color:var(--vscode-symbolIcon-keywordForeground);">Returns:</strong> <code style="background:var(--vscode-textCodeBlock-background);padding:2px 4px;border-radius:3px;color:var(--vscode-symbolIcon-typeForeground);">${escapedReturns}</code></p>`);
    }

    // Example section
    if (symbolInfo.example) {
        parts.push('<hr>');
        parts.push(`<h4 style="color:var(--vscode-charts-green);">Example</h4>`);
        const escapedExample = symbolInfo.example
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        parts.push(`<pre style="background:var(--vscode-textCodeBlock-background);padding:8px;border-radius:4px;border:1px solid var(--vscode-widget-border);overflow-x:auto;"><code style="color:var(--vscode-textPreformat-foreground);">${escapedExample}</code></pre>`);
    }

    const markdown: MarkupContent = {
        kind: MarkupKind.Markdown,
        value: parts.join('\n'),
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