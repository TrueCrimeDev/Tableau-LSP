import { Hover, HoverParams, MarkupContent, MarkupKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseDocument } from './documentModel';
import { JSDocParser, JSDocSymbol } from './jsdocParser';
import { SymbolType, Symbol } from './common';
import { FieldParser, CustomField } from './fieldParser';

interface SymbolInfo {
    name: string;
    type: string;
    description: string;
    parameters?: { name: string; type: string; description: string }[];
    returns?: string;
    example?: string;
}

// R3.4: Performance optimization interfaces
interface HoverCacheEntry {
    hover: Hover;
    timestamp: number;
    documentVersion: number;
}

interface SymbolLookupIndex {
    symbolsByLine: Map<number, Symbol[]>;
    symbolsByName: Map<string, Symbol[]>;
    lastUpdated: number;
}

// R3.4: Performance optimization configuration
const HOVER_CACHE_CONFIG = {
    MAX_CACHE_SIZE: 1000,
    CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes
    SYMBOL_INDEX_TTL_MS: 2 * 60 * 1000, // 2 minutes
    ENABLE_PERFORMANCE_LOGGING: false
};

// R3.4: Performance optimization caches
const hoverCache = new Map<string, HoverCacheEntry>();
const symbolIndexCache = new Map<string, SymbolLookupIndex>();
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

/**
 * R3.4: Optimized hover provider with caching and efficient symbol lookup
 */
export function provideHover(params: HoverParams, document: TextDocument, fieldParser: FieldParser | null): Hover | undefined {
    const startTime = HOVER_CACHE_CONFIG.ENABLE_PERFORMANCE_LOGGING ? Date.now() : 0;
    const position = params.position;
    const documentUri = document.uri;
    const documentVersion = document.version;
    
    // R3.4: Generate cache key for this hover request
    const cacheKey = generateHoverCacheKey(documentUri, position, documentVersion);
    
    // R3.4: Check hover cache first
    const cachedHover = getFromHoverCache(cacheKey);
    if (cachedHover) {
        logPerformance('Hover cache hit', startTime);
        return cachedHover;
    }
    
    // R3.4: Get or create symbol index for efficient lookup
    const symbolIndex = getOrCreateSymbolIndex(document);
    
    // R3.4: Use efficient symbol lookup
    const symbol = findSymbolAtPosition(position, symbolIndex);
    let hover: Hover | undefined;
    
    if (symbol) {
        hover = createHoverForSymbol(symbol, fieldParser);
    }
    
    // R3.4: Fallback to word-at-position lookup if no symbol found
    if (!hover) {
        hover = createHoverForWordAtPosition(document, position, fieldParser);
    }
    
    // R3.4: Cache the result if we found a hover
    if (hover) {
        addToHoverCache(cacheKey, hover, documentVersion);
    }
    
    logPerformance('Total hover processing', startTime);
    return hover;
}

/**
 * R3.4: Generate cache key for hover requests
 */
function generateHoverCacheKey(documentUri: string, position: any, documentVersion: number): string {
    return `${documentUri}:${position.line}:${position.character}:${documentVersion}`;
}

/**
 * R3.4: Get hover from cache if valid
 */
function getFromHoverCache(cacheKey: string): Hover | undefined {
    const entry = hoverCache.get(cacheKey);
    if (!entry) {
        return undefined;
    }
    
    // Check if cache entry is still valid
    const now = Date.now();
    if (now - entry.timestamp > HOVER_CACHE_CONFIG.CACHE_TTL_MS) {
        hoverCache.delete(cacheKey);
        return undefined;
    }
    
    return entry.hover;
}

/**
 * R3.4: Add hover to cache with cleanup
 */
function addToHoverCache(cacheKey: string, hover: Hover, documentVersion: number): void {
    // Clean up cache if it's getting too large
    if (hoverCache.size >= HOVER_CACHE_CONFIG.MAX_CACHE_SIZE) {
        cleanupHoverCache();
    }
    
    hoverCache.set(cacheKey, {
        hover,
        timestamp: Date.now(),
        documentVersion
    });
}

/**
 * R3.4: Clean up old cache entries
 */
function cleanupHoverCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of hoverCache.entries()) {
        if (now - entry.timestamp > HOVER_CACHE_CONFIG.CACHE_TTL_MS) {
            keysToDelete.push(key);
        }
    }
    
    // Remove oldest entries if still too large
    if (keysToDelete.length === 0 && hoverCache.size >= HOVER_CACHE_CONFIG.MAX_CACHE_SIZE) {
        const entries = Array.from(hoverCache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        const toRemove = Math.floor(HOVER_CACHE_CONFIG.MAX_CACHE_SIZE * 0.2); // Remove 20%
        keysToDelete.push(...entries.slice(0, toRemove).map(([key]) => key));
    }
    
    keysToDelete.forEach(key => hoverCache.delete(key));
}

/**
 * R3.4: Get or create symbol index for efficient lookup
 */
function getOrCreateSymbolIndex(document: TextDocument): SymbolLookupIndex {
    const documentUri = document.uri;
    const documentVersion = document.version;
    
    // Check if we have a valid cached index
    const cachedIndex = symbolIndexCache.get(documentUri);
    if (cachedIndex && 
        Date.now() - cachedIndex.lastUpdated < HOVER_CACHE_CONFIG.SYMBOL_INDEX_TTL_MS) {
        return cachedIndex;
    }
    
    // Parse document and create new index
    const { symbols } = parseDocument(document);
    const symbolIndex = createSymbolIndex(symbols);
    
    // Cache the index
    symbolIndexCache.set(documentUri, symbolIndex);
    
    // Clean up old indexes
    cleanupSymbolIndexCache();
    
    return symbolIndex;
}

/**
 * R3.4: Create efficient symbol lookup index
 */
function createSymbolIndex(symbols: Symbol[]): SymbolLookupIndex {
    const symbolsByLine = new Map<number, Symbol[]>();
    const symbolsByName = new Map<string, Symbol[]>();
    
    for (const symbol of symbols) {
        // Index by line for position-based lookup
        for (let line = symbol.range.start.line; line <= symbol.range.end.line; line++) {
            if (!symbolsByLine.has(line)) {
                symbolsByLine.set(line, []);
            }
            symbolsByLine.get(line)!.push(symbol);
        }
        
        // Index by name for name-based lookup
        const upperName = symbol.name.toUpperCase();
        if (!symbolsByName.has(upperName)) {
            symbolsByName.set(upperName, []);
        }
        symbolsByName.get(upperName)!.push(symbol);
    }
    
    return {
        symbolsByLine,
        symbolsByName,
        lastUpdated: Date.now()
    };
}

/**
 * R3.4: Clean up old symbol index cache entries
 */
function cleanupSymbolIndexCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    for (const [key, index] of symbolIndexCache.entries()) {
        if (now - index.lastUpdated > HOVER_CACHE_CONFIG.SYMBOL_INDEX_TTL_MS) {
            keysToDelete.push(key);
        }
    }
    
    keysToDelete.forEach(key => symbolIndexCache.delete(key));
}

/**
 * R3.4: Efficiently find symbol at position using index
 */
function findSymbolAtPosition(position: any, symbolIndex: SymbolLookupIndex): Symbol | undefined {
    const symbolsOnLine = symbolIndex.symbolsByLine.get(position.line);
    if (!symbolsOnLine) {
        return undefined;
    }
    
    // Find the most specific symbol at this position
    let bestMatch: Symbol | undefined;
    let bestMatchSize = Infinity;
    
    for (const symbol of symbolsOnLine) {
        if (position.line >= symbol.range.start.line &&
            position.line <= symbol.range.end.line &&
            position.character >= symbol.range.start.character &&
            position.character <= symbol.range.end.character) {
            
            // Calculate symbol size to find the most specific match
            const symbolSize = (symbol.range.end.line - symbol.range.start.line) * 1000 + 
                             (symbol.range.end.character - symbol.range.start.character);
            
            if (symbolSize < bestMatchSize) {
                bestMatch = symbol;
                bestMatchSize = symbolSize;
            }
        }
    }
    
    return bestMatch;
}

/**
 * R3.4: Create hover for a specific symbol
 */
function createHoverForSymbol(symbol: Symbol, fieldParser: FieldParser | null): Hover | undefined {
    // Handle Custom Fields
    if (symbol.type === SymbolType.FieldReference && fieldParser) {
        const customField = fieldParser.getField(symbol.name);
        if (customField) {
            return createCustomFieldHoverResponse(customField, symbol.range);
        }
    }

    // Handle variables with JSDoc types
    if (symbol.type === SymbolType.Variable && symbol.jsdocType && jsDocParser) {
        const typeName = symbol.jsdocType.replace(/<.*>/, ''); // Handle generics like Result<T>
        const jsDocType = jsDocParser.getType(typeName);
        if (jsDocType) {
            return createJSDocTypeHoverResponse(jsDocType, symbol.range);
        }
    }

    // Handle function calls
    if (symbol.type === SymbolType.FunctionCall) {
        if (jsDocParser) {
            const jsDocSymbol = jsDocParser.getSymbol(symbol.name);
            if (jsDocSymbol) {
                return createJSDocHoverResponse(jsDocSymbol, symbol.range);
            }
        }
        
        // Fallback to legacy symbol info
        const symbolInfo = symbolInfoMap.get(symbol.name.toUpperCase());
        if (symbolInfo) {
            return createHoverResponse(symbolInfo, symbol.range);
        }
    }

    return undefined;
}

/**
 * R3.4: Create hover for word at position (fallback)
 */
function createHoverForWordAtPosition(document: TextDocument, position: any, fieldParser: FieldParser | null): Hover | undefined {
    const wordRange = getWordRangeAtPosition(document, position);
    if (!wordRange) {
        return undefined;
    }
    
    const word = document.getText(wordRange);
    const upperWord = word.toUpperCase();

    // Check for field (inside brackets)
    const lineText = document.getText({ 
        start: { line: position.line, character: 0 }, 
        end: { line: position.line, character: Number.MAX_SAFE_INTEGER } 
    });
    const fieldMatch = lineText.match(/\[([^\]]+)\]/);
    if (fieldMatch && fieldParser) {
        const fieldName = fieldMatch[1];
        const customField = fieldParser.getField(fieldName);
        if (customField) {
            return createCustomFieldHoverResponse(customField, wordRange);
        }
    }
    
    // Try JSDoc parser first for functions
    if (jsDocParser) {
        const jsDocSymbol = jsDocParser.getSymbol(upperWord);
        if (jsDocSymbol) {
            return createJSDocHoverResponse(jsDocSymbol, wordRange);
        }
        // Try typedefs
        const jsDocType = jsDocParser.getType(upperWord);
        if (jsDocType) {
            return createJSDocTypeHoverResponse(jsDocType, wordRange);
        }
    }
    
    // Fallback to legacy symbol info map
    const symbolInfo = symbolInfoMap.get(upperWord);
    if (symbolInfo) {
        return createHoverResponse(symbolInfo, wordRange);
    }

    return undefined;
}

/**
 * R3.4: Performance logging utility
 */
function logPerformance(operation: string, startTime: number): void {
    if (HOVER_CACHE_CONFIG.ENABLE_PERFORMANCE_LOGGING && startTime > 0) {
        const duration = Date.now() - startTime;
        console.log(`[Hover Performance] ${operation}: ${duration}ms`);
    }
}

function createJSDocHoverResponse(jsDocSymbol: JSDocSymbol, range: any): Hover | undefined {
    const parts: string[] = [];

    // Function signature with syntax highlighting
    let signature = `${jsDocSymbol.name}(`;
    if (jsDocSymbol.parameters && jsDocSymbol.parameters.length > 0) {
        signature += jsDocSymbol.parameters.map(p => p.name).join(', ');
    }
    signature += ')';
    parts.push('```twbl\n' + signature + '\n```');

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

function createCustomFieldHoverResponse(field: CustomField, range: any): Hover | undefined {
    const parts: string[] = [];
    parts.push(`**[${field.name}]**: \`${field.type}\``);
    if (field.description) {
        parts.push(field.description);
    }
    const value = parts.filter(Boolean).join('\n\n');
    return {
        contents: {
            kind: MarkupKind.Markdown,
            value
        },
        range: range
    };
}

function createJSDocParameterHoverResponse(param: import('./jsdocParser').JSDocParam, range: any): Hover | undefined {
    const parts: string[] = [];
    const optional = param.optional ? ' (optional)' : '';
    parts.push(`**${param.name}**${optional}: \`${param.type}\``);
    if (param.description) {
        parts.push(param.description);
    }
    if (param.defaultValue) {
        parts.push(`*Default: \`${param.defaultValue}\`*`);
    }

    const value = parts.filter(Boolean).join('\n\n');
    return {
        contents: {
            kind: MarkupKind.Markdown,
            value
        },
        range: range
    };
}

function createJSDocTypeHoverResponse(jsDocType: import('./jsdocParser').JSDocType, range: any): Hover | undefined {
    const parts: string[] = [];

    // Type name and signature
    let signature = jsDocType.name;
    if (jsDocType.templateParams && jsDocType.templateParams.length > 0) {
        signature += `<${jsDocType.templateParams.join(', ')}>`;
    }
    if (jsDocType.typeDef) {
        signature += `: ${jsDocType.typeDef}`;
    }
    parts.push('```twbl\n' + signature + '\n```');

    // Description
    if (jsDocType.description) {
        parts.push(jsDocType.description);
    }

    // Properties
    if (jsDocType.properties && jsDocType.properties.length > 0) {
        parts.push('\n**Properties:**');
        jsDocType.properties.forEach(prop => {
            const optional = prop.optional ? '?' : '';
            parts.push(`- \`${prop.name}${optional}: ${prop.type}\` - ${prop.description}`);
        });
    }

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

/**
 * R3.4: Public API for cache management and performance monitoring
 */
export const HoverPerformanceAPI = {
    /**
     * Clear all hover caches
     */
    clearCaches(): void {
        hoverCache.clear();
        symbolIndexCache.clear();
    },
    
    /**
     * Get cache statistics
     */
    getCacheStats(): {
        hoverCacheSize: number;
        symbolIndexCacheSize: number;
        hoverCacheHitRate?: number;
    } {
        return {
            hoverCacheSize: hoverCache.size,
            symbolIndexCacheSize: symbolIndexCache.size
        };
    },
    
    /**
     * Configure performance settings
     */
    configurePerformance(config: Partial<typeof HOVER_CACHE_CONFIG>): void {
        Object.assign(HOVER_CACHE_CONFIG, config);
    },
    
    /**
     * Force cleanup of caches
     */
    forceCleanup(): void {
        cleanupHoverCache();
        cleanupSymbolIndexCache();
    },
    
    /**
     * Invalidate cache for specific document
     */
    invalidateDocument(documentUri: string): void {
        // Remove hover cache entries for this document
        const keysToDelete: string[] = [];
        for (const key of hoverCache.keys()) {
            if (key.startsWith(documentUri + ':')) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => hoverCache.delete(key));
        
        // Remove symbol index for this document
        symbolIndexCache.delete(documentUri);
    }
};
