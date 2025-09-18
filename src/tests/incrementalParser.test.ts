// src/tests/incrementalParser.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range, Position } from 'vscode-languageserver';
import { IncrementalParser } from '../incrementalParser';
import { parsedDocumentCache, INCREMENTAL_PARSING_CONFIG } from '../common';

describe('IncrementalParser', () => {
    
    beforeEach(() => {
        // Clear cache before each test
        IncrementalParser.clearAllCache();
    });
    
    describe('parseDocumentIncremental', () => {
        
        it('should perform full parse for small documents', () => {
            const smallDocument = createTestDocument('IF [Sales] > 100 THEN "High" ELSE "Low" END');
            
            const result = IncrementalParser.parseDocumentIncremental(smallDocument);
            
            expect(result.symbols.length).toBeGreaterThan(0);
            expect(result.lastChangeVersion).toBe(smallDocument.version);
        });
        
        it('should cache parsed results', () => {
            const document = createTestDocument('SUM([Sales])');
            
            // First parse
            const result1 = IncrementalParser.parseDocumentIncremental(document);
            
            // Second parse with same document should return cached result
            const result2 = IncrementalParser.parseDocumentIncremental(document);
            
            expect(result1).toBe(result2);
        });
        
        it('should detect document changes and re-parse incrementally', () => {
            // Create a large document to trigger incremental parsing
            const lines = Array(INCREMENTAL_PARSING_CONFIG.MIN_LINES_FOR_INCREMENTAL + 10)
                .fill('SUM([Sales])')
                .join('\n');
            const document1 = createTestDocument(lines, 1);
            
            // Initial parse
            const result1 = IncrementalParser.parseDocumentIncremental(document1);
            
            // Modify one line
            const modifiedLines = lines.replace('SUM([Sales])', 'AVG([Sales])');
            const document2 = createTestDocument(modifiedLines, 2);
            
            // Should perform incremental parse
            const result2 = IncrementalParser.parseDocumentIncremental(document2);
            
            expect(result2.lastChangeVersion).toBe(2);
            expect(result2.symbols).not.toBe(result1.symbols);
        });
        
        it('should fall back to full parse for extensive changes', () => {
            // Create a large document
            const lines = Array(INCREMENTAL_PARSING_CONFIG.MIN_LINES_FOR_INCREMENTAL + 10)
                .fill('SUM([Sales])')
                .join('\n');
            const document1 = createTestDocument(lines, 1);
            
            // Initial parse
            IncrementalParser.parseDocumentIncremental(document1);
            
            // Modify most lines (should trigger full re-parse)
            const modifiedLines = Array(INCREMENTAL_PARSING_CONFIG.MIN_LINES_FOR_INCREMENTAL + 10)
                .fill('AVG([Profit])')
                .join('\n');
            const document2 = createTestDocument(modifiedLines, 2);
            
            const result = IncrementalParser.parseDocumentIncremental(document2);
            
            expect(result.lastChangeVersion).toBe(2);
            expect(result.symbols.length).toBeGreaterThan(0);
        });
    });
    
    describe('getSymbolsForLine', () => {
        
        it('should return symbols for a specific line', () => {
            const document = createTestDocument('SUM([Sales])\nAVG([Profit])\nCOUNT([Orders])');
            
            // Parse document first
            IncrementalParser.parseDocumentIncremental(document);
            
            // Get symbols for line 1
            const symbols = IncrementalParser.getSymbolsForLine(document, 1);
            
            expect(symbols.length).toBeGreaterThan(0);
            expect(symbols.some(s => s.name === 'AVG')).toBe(true);
        });
        
        it('should return empty array for non-existent line', () => {
            const document = createTestDocument('SUM([Sales])');
            
            IncrementalParser.parseDocumentIncremental(document);
            
            const symbols = IncrementalParser.getSymbolsForLine(document, 999);
            
            expect(symbols).toEqual([]);
        });
    });
    
    describe('getSymbolsInRange', () => {
        
        it('should return symbols within a specific range', () => {
            const document = createTestDocument('SUM([Sales])\nAVG([Profit])');
            
            IncrementalParser.parseDocumentIncremental(document);
            
            const range = Range.create(
                Position.create(0, 0),
                Position.create(0, 12)
            );
            
            const symbols = IncrementalParser.getSymbolsInRange(document, range);
            
            expect(symbols.length).toBeGreaterThan(0);
            expect(symbols.some(s => s.name === 'SUM')).toBe(true);
        });
    });
    
    describe('cache management', () => {
        
        it('should manage cache size', () => {
            // Create many documents to exceed cache size
            for (let i = 0; i < INCREMENTAL_PARSING_CONFIG.MAX_CACHE_SIZE + 10; i++) {
                const document = createTestDocument(`SUM([Sales${i}])`, i + 1, `test://doc${i}.twbl`);
                IncrementalParser.parseDocumentIncremental(document);
            }
            
            const stats = IncrementalParser.getCacheStats();
            expect(stats.size).toBeLessThanOrEqual(INCREMENTAL_PARSING_CONFIG.MAX_CACHE_SIZE);
        });
        
        it('should clear document cache', () => {
            const document = createTestDocument('SUM([Sales])');
            
            IncrementalParser.parseDocumentIncremental(document);
            expect(parsedDocumentCache.has(document.uri)).toBe(true);
            
            IncrementalParser.clearDocumentCache(document.uri);
            expect(parsedDocumentCache.has(document.uri)).toBe(false);
        });
        
        it('should clear all cache', () => {
            const document1 = createTestDocument('SUM([Sales])', 1, 'test://doc1.twbl');
            const document2 = createTestDocument('AVG([Profit])', 1, 'test://doc2.twbl');
            
            IncrementalParser.parseDocumentIncremental(document1);
            IncrementalParser.parseDocumentIncremental(document2);
            
            expect(parsedDocumentCache.size).toBe(2);
            
            IncrementalParser.clearAllCache();
            expect(parsedDocumentCache.size).toBe(0);
        });
    });
    
    describe('change tracking', () => {
        
        it('should identify changed lines correctly', () => {
            const document1 = createTestDocument('SUM([Sales])\nAVG([Profit])\nCOUNT([Orders])', 1);
            const document2 = createTestDocument('SUM([Sales])\nMAX([Profit])\nCOUNT([Orders])', 2);
            
            // Parse initial document
            IncrementalParser.parseDocumentIncremental(document1);
            
            // Parse modified document
            const result = IncrementalParser.parseDocumentIncremental(document2);
            
            expect(result.changedLines?.has(1)).toBe(true);
            expect(result.changedLines?.has(0)).toBe(false);
            expect(result.changedLines?.has(2)).toBe(false);
        });
        
        it('should handle line additions', () => {
            const document1 = createTestDocument('SUM([Sales])\nAVG([Profit])', 1);
            const document2 = createTestDocument('SUM([Sales])\nAVG([Profit])\nCOUNT([Orders])', 2);
            
            IncrementalParser.parseDocumentIncremental(document1);
            const result = IncrementalParser.parseDocumentIncremental(document2);
            
            expect(result.changedLines?.has(2)).toBe(true);
        });
        
        it('should handle line deletions', () => {
            const document1 = createTestDocument('SUM([Sales])\nAVG([Profit])\nCOUNT([Orders])', 1);
            const document2 = createTestDocument('SUM([Sales])\nAVG([Profit])', 2);
            
            IncrementalParser.parseDocumentIncremental(document1);
            const result = IncrementalParser.parseDocumentIncremental(document2);
            
            expect(result.changedLines?.has(2)).toBe(true);
        });
    });
});

/**
 * Helper function to create test documents
 */
function createTestDocument(content: string, version: number = 1, uri: string = 'test://test.twbl'): TextDocument {
    return TextDocument.create(uri, 'tableau', version, content);
}