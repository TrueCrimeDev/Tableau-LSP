// src/incrementalParser.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range, Position } from 'vscode-languageserver';
import { 
    Symbol, 
    ParsedDocument, 
    CachedDocument, 
    DocumentChange, 
    parsedDocumentCache,
    INCREMENTAL_PARSING_CONFIG 
} from './common';
import { parseDocument, parseDocumentRange, isContextualChange } from './documentModel';
import { AdvancedErrorRecovery } from './errorRecovery';
import { PerformanceMonitor } from './performanceMonitor';
import { globalMemoryManager } from './memoryManager';

/**
 * Incremental document parser that tracks changes and only re-parses modified regions
 */
export class IncrementalParser {
    
    /**
     * Parse a document incrementally, reusing cached results where possible
     */
    static parseDocumentIncremental(document: TextDocument): ParsedDocument {
        const timer = PerformanceMonitor.startTiming('parseDocumentIncremental');
        
        try {
            const uri = document.uri;
            const currentVersion = document.version;
            const cachedDoc = parsedDocumentCache.get(uri);
            
            // If no cached version exists or document is small, do full parse
            if (!cachedDoc || document.lineCount < INCREMENTAL_PARSING_CONFIG.MIN_LINES_FOR_INCREMENTAL) {
                const fullParseTimer = PerformanceMonitor.startTiming('fullParse');
                const result = this.performFullParse(document);
                fullParseTimer.end();
                return result;
            }
            
            // If document version hasn't changed, return cached result
            if (cachedDoc.lastChangeVersion === currentVersion) {
                PerformanceMonitor.startTiming('cacheHit').end();
                return cachedDoc;
            }
            
            // Perform incremental parsing
            const incrementalTimer = PerformanceMonitor.startTiming('incrementalParse');
            const result = this.performIncrementalParse(document, cachedDoc);
            incrementalTimer.end();
            return result;
        } finally {
            timer.end();
        }
    }
    
    /**
     * Perform a full document parse and cache the results
     */
    private static performFullParse(document: TextDocument): CachedDocument {
        const parseResult = parseDocument(document);
        const lineSymbols = this.organizeSymbolsByLine(parseResult.symbols);
        
        const cachedDoc: CachedDocument = {
            document,
            symbols: parseResult.symbols,
            diagnostics: parseResult.diagnostics,
            lineSymbols,
            lastChangeVersion: document.version,
            changedLines: new Set()
        };
        
        // Manage cache size
        this.manageCacheSize();
        parsedDocumentCache.set(document.uri, cachedDoc);
        
        return cachedDoc;
    }
    
    /**
     * Perform incremental parsing by identifying changed regions
     */
    private static performIncrementalParse(document: TextDocument, cachedDoc: CachedDocument): CachedDocument {
        const changedLines = this.identifyChangedLines(document, cachedDoc.document);
        
        if (changedLines.size === 0) {
            // No changes detected, update version and return cached result
            cachedDoc.lastChangeVersion = document.version;
            cachedDoc.document = document;
            return cachedDoc;
        }
        
        // If too many lines changed or changes affect parsing context, fall back to full parse
        if (changedLines.size > document.lineCount * 0.3 || isContextualChange(document, changedLines)) {
            PerformanceMonitor.startTiming('fallbackToFullParse').end();
            return this.performFullParse(document);
        }
        
        // Determine the region to re-parse (with context)
        const reparseRegion = this.calculateReparseRegion(changedLines, document.lineCount);
        
        // Re-parse only the affected region
        const reparseTimer = PerformanceMonitor.startTiming('reparseRegion');
        const updatedSymbols = this.reparseRegion(document, reparseRegion, cachedDoc);
        reparseTimer.end();
        
        // Update the cached document
        const updatedCachedDoc: CachedDocument = {
            document,
            symbols: updatedSymbols,
            diagnostics: [], // Will be recalculated by diagnostics provider
            lineSymbols: this.organizeSymbolsByLine(updatedSymbols),
            lastChangeVersion: document.version,
            changedLines: new Set(changedLines)
        };
        
        parsedDocumentCache.set(document.uri, updatedCachedDoc);
        return updatedCachedDoc;
    }
    
    /**
     * Identify which lines have changed between document versions
     */
    private static identifyChangedLines(newDocument: TextDocument, oldDocument: TextDocument): Set<number> {
        const changedLines = new Set<number>();
        const newLines = newDocument.getText().split(/\r?\n/);
        const oldLines = oldDocument.getText().split(/\r?\n/);
        
        const maxLines = Math.max(newLines.length, oldLines.length);
        
        for (let i = 0; i < maxLines; i++) {
            const newLine = newLines[i] || '';
            const oldLine = oldLines[i] || '';
            
            if (newLine !== oldLine) {
                changedLines.add(i);
            }
        }
        
        return changedLines;
    }
    
    /**
     * Calculate the region that needs to be re-parsed, including context lines
     */
    private static calculateReparseRegion(changedLines: Set<number>, totalLines: number): { start: number; end: number } {
        if (changedLines.size === 0) {
            return { start: 0, end: 0 };
        }
        
        const sortedLines = Array.from(changedLines).sort((a, b) => a - b);
        const contextLines = INCREMENTAL_PARSING_CONFIG.REPARSE_CONTEXT_LINES;
        
        const start = Math.max(0, sortedLines[0] - contextLines);
        const end = Math.min(totalLines - 1, sortedLines[sortedLines.length - 1] + contextLines);
        
        return { start, end };
    }
    
    /**
     * Re-parse a specific region of the document
     */
    private static reparseRegion(document: TextDocument, region: { start: number; end: number }, cachedDoc: CachedDocument): Symbol[] {
        // Extract the region text
        const lines = document.getText().split(/\r?\n/);
        const regionLines = lines.slice(region.start, region.end + 1);
        const regionText = regionLines.join('\n');
        
        // Create a temporary document for the region
        const regionDocument = TextDocument.create(
            document.uri + '#region',
            document.languageId,
            1,
            regionText
        );
        
        // Parse the region
        const regionParseResult = parseDocument(regionDocument);
        
        // Adjust symbol ranges to match the original document
        const adjustedSymbols = this.adjustSymbolRanges(regionParseResult.symbols, region.start);
        
        // Merge with existing symbols (replace symbols in the re-parsed region)
        return this.mergeSymbols(cachedDoc.symbols, adjustedSymbols, region);
    }
    
    /**
     * Adjust symbol ranges to account for the region offset in the original document
     */
    private static adjustSymbolRanges(symbols: Symbol[], lineOffset: number): Symbol[] {
        return symbols.map(symbol => ({
            ...symbol,
            range: Range.create(
                Position.create(symbol.range.start.line + lineOffset, symbol.range.start.character),
                Position.create(symbol.range.end.line + lineOffset, symbol.range.end.character)
            ),
            children: symbol.children ? this.adjustSymbolRanges(symbol.children, lineOffset) : undefined
        }));
    }
    
    /**
     * Merge new symbols with existing symbols, replacing symbols in the specified region
     */
    private static mergeSymbols(existingSymbols: Symbol[], newSymbols: Symbol[], region: { start: number; end: number }): Symbol[] {
        // Filter out existing symbols that fall within the re-parsed region
        const filteredExisting = existingSymbols.filter(symbol => 
            symbol.range.start.line < region.start || symbol.range.start.line > region.end
        );
        
        // Combine filtered existing symbols with new symbols
        const mergedSymbols = [...filteredExisting, ...newSymbols];
        
        // Sort by line number and character position
        return mergedSymbols.sort((a, b) => {
            if (a.range.start.line !== b.range.start.line) {
                return a.range.start.line - b.range.start.line;
            }
            return a.range.start.character - b.range.start.character;
        });
    }
    
    /**
     * Organize symbols by line number for efficient lookup
     */
    private static organizeSymbolsByLine(symbols: Symbol[]): Map<number, Symbol[]> {
        const lineSymbols = new Map<number, Symbol[]>();
        
        for (const symbol of symbols) {
            const line = symbol.range.start.line;
            if (!lineSymbols.has(line)) {
                lineSymbols.set(line, []);
            }
            lineSymbols.get(line)!.push(symbol);
            
            // Also organize child symbols
            if (symbol.children) {
                const childLineSymbols = this.organizeSymbolsByLine(symbol.children);
                for (const [childLine, childSymbols] of childLineSymbols) {
                    if (!lineSymbols.has(childLine)) {
                        lineSymbols.set(childLine, []);
                    }
                    lineSymbols.get(childLine)!.push(...childSymbols);
                }
            }
        }
        
        return lineSymbols;
    }
    
    /**
     * Manage cache size to prevent memory leaks
     * R7.3: Enhanced with memory manager integration
     */
    private static manageCacheSize(): void {
        // Check if memory cleanup is needed
        if (globalMemoryManager.getMemoryHealthStatus().status !== 'healthy') {
            // Let memory manager handle cleanup
            globalMemoryManager.forceCleanup('normal').catch(error => {
                console.error('[IncrementalParser] Memory cleanup failed:', error);
            });
            return;
        }
        
        // Fallback to original cache size management
        if (parsedDocumentCache.size >= INCREMENTAL_PARSING_CONFIG.MAX_CACHE_SIZE) {
            // Remove oldest entries (simple LRU approximation)
            const entries = Array.from(parsedDocumentCache.entries());
            const toRemove = entries.slice(0, Math.floor(INCREMENTAL_PARSING_CONFIG.MAX_CACHE_SIZE * 0.2));
            
            for (const [uri] of toRemove) {
                parsedDocumentCache.delete(uri);
                // Notify memory manager of removal
                globalMemoryManager.markDocumentInactive(uri);
            }
        }
    }
    
    /**
     * Get symbols for a specific line (used for efficient hover/completion)
     */
    static getSymbolsForLine(document: TextDocument, lineNumber: number): Symbol[] {
        const cachedDoc = parsedDocumentCache.get(document.uri);
        if (!cachedDoc || !cachedDoc.lineSymbols) {
            return [];
        }
        
        return cachedDoc.lineSymbols.get(lineNumber) || [];
    }
    
    /**
     * Get symbols within a specific range (used for efficient operations)
     */
    static getSymbolsInRange(document: TextDocument, range: Range): Symbol[] {
        const cachedDoc = parsedDocumentCache.get(document.uri);
        if (!cachedDoc) {
            return [];
        }
        
        return cachedDoc.symbols.filter(symbol => 
            this.rangesOverlap(symbol.range, range)
        );
    }
    
    /**
     * Check if two ranges overlap
     */
    private static rangesOverlap(range1: Range, range2: Range): boolean {
        return !(
            range1.end.line < range2.start.line ||
            range2.end.line < range1.start.line ||
            (range1.end.line === range2.start.line && range1.end.character < range2.start.character) ||
            (range2.end.line === range1.start.line && range2.end.character < range1.start.character)
        );
    }
    
    /**
     * Clear cache for a specific document
     */
    static clearDocumentCache(uri: string): void {
        parsedDocumentCache.delete(uri);
    }
    
    /**
     * Clear all cached documents
     */
    static clearAllCache(): void {
        parsedDocumentCache.clear();
    }
    
    /**
     * Get cache statistics for monitoring
     */
    static getCacheStats(): { size: number; maxSize: number; hitRate?: number } {
        return {
            size: parsedDocumentCache.size,
            maxSize: INCREMENTAL_PARSING_CONFIG.MAX_CACHE_SIZE
        };
    }
}