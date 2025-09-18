// src/tests/unit/memoryManager.test.ts

import { MemoryManager, globalMemoryManager, MemoryHelpers } from '../../memoryManager';
import { parsedDocumentCache } from '../../common';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { globalDebouncer } from '../../requestDebouncer';

// Mock process.memoryUsage for testing
const mockMemoryUsage = {
    heapTotal: 100 * 1024 * 1024, // 100MB
    heapUsed: 50 * 1024 * 1024,   // 50MB
    external: 10 * 1024 * 1024,   // 10MB
    rss: 120 * 1024 * 1024        // 120MB
};

// Mock global.gc
const mockGc = jest.fn();

describe('Memory Management System', () => {
    let memoryManager: MemoryManager;
    
    beforeEach(() => {
        // Reset global state
        parsedDocumentCache.clear();
        
        // Mock process.memoryUsage
        if (typeof process !== 'undefined') {
            jest.spyOn(process, 'memoryUsage').mockReturnValue(mockMemoryUsage);
        }
        
        // Mock global.gc
        (global as any).gc = mockGc;
        
        // Create fresh memory manager instance for testing
        memoryManager = (MemoryManager as any).getInstance();
        
        // Configure for testing
        memoryManager.configure({
            maxMemoryMB: 100,
            cleanupThresholdMB: 80,
            monitoringIntervalMs: 1000,
            aggressiveCleanupMB: 120,
            cacheRetentionMs: 60000, // 1 minute for testing
            enableAutoCleanup: false, // Disable for controlled testing
            enableMemoryLogging: false
        });
    });
    
    afterEach(() => {
        jest.restoreAllMocks();
        mockGc.mockClear();
    });
    
    describe('Memory Statistics', () => {
        it('should provide accurate memory statistics', () => {
            const stats = memoryManager.getMemoryStats();
            
            expect(stats).toHaveProperty('totalMemoryMB');
            expect(stats).toHaveProperty('usedMemoryMB');
            expect(stats).toHaveProperty('freeMemoryMB');
            expect(stats).toHaveProperty('cacheMemoryMB');
            expect(stats).toHaveProperty('requestQueueMemoryMB');
            expect(stats).toHaveProperty('documentsInCache');
            
            expect(typeof stats.totalMemoryMB).toBe('number');
            expect(typeof stats.usedMemoryMB).toBe('number');
            expect(stats.documentsInCache).toBe(0); // Initially empty
        });
        
        it('should calculate cache memory usage correctly', () => {
            // Add some documents to cache
            const doc1 = createTestDocument('SUM([Sales])', 1, 'test://doc1.twbl');
            const doc2 = createTestDocument('AVG([Profit])', 1, 'test://doc2.twbl');
            
            addDocumentToCache(doc1);
            addDocumentToCache(doc2);
            
            const stats = memoryManager.getMemoryStats();
            
            expect(stats.documentsInCache).toBe(2);
            expect(stats.cacheMemoryMB).toBeGreaterThan(0);
        });
    });
    
    describe('Memory Health Assessment', () => {
        it('should correctly assess healthy memory status', () => {
            // Mock low memory usage
            const lowMemoryUsage = {
                heapTotal: 100 * 1024 * 1024,
                heapUsed: 30 * 1024 * 1024, // 30MB - below threshold
                external: 5 * 1024 * 1024,
                rss: 50 * 1024 * 1024
            };
            
            if (typeof process !== 'undefined') {
                jest.spyOn(process, 'memoryUsage').mockReturnValue(lowMemoryUsage);
            }
            
            const healthStatus = memoryManager.getMemoryHealthStatus();
            
            expect(healthStatus.status).toBe('healthy');
            expect(healthStatus.recommendation).toContain('normal limits');
            expect(healthStatus).toHaveProperty('documentsExceedingLimit');
            expect(healthStatus).toHaveProperty('largestDocumentMB');
        });
        
        it('should detect documents exceeding size limit', () => {
            // Create a large document content (simulate 60MB document)
            const largeContent = 'A'.repeat(60 * 1024 * 1024); // 60MB of content
            const largeDoc = createTestDocument(largeContent, 1, 'test://large.twbl');
            
            addDocumentToCache(largeDoc);
            memoryManager.markDocumentActive(largeDoc.uri);
            
            const stats = memoryManager.getMemoryStats();
            const healthStatus = memoryManager.getMemoryHealthStatus();
            
            expect(stats.documentsExceedingLimit).toBeGreaterThan(0);
            expect(stats.largestDocumentMB).toBeGreaterThan(50);
            expect(healthStatus.status).toBe('critical');
            expect(healthStatus.recommendation).toContain('exceed 50MB limit');
        });
        
        it('should provide document size statistics', () => {
            // Add documents of various sizes
            const smallDoc = createTestDocument('SUM([Sales])', 1, 'test://small.twbl');
            const mediumDoc = createTestDocument('A'.repeat(1024 * 1024), 1, 'test://medium.twbl'); // 1MB
            
            addDocumentToCache(smallDoc);
            addDocumentToCache(mediumDoc);
            
            const stats = memoryManager.getMemoryStats();
            
            expect(stats.documentsInCache).toBe(2);
            expect(stats.averageDocumentSizeMB).toBeGreaterThan(0);
            expect(stats.largestDocumentMB).toBeGreaterThan(0);
        });
    });
    
    describe('Oversized Document Handling', () => {
        it('should identify documents exceeding size limit', () => {
            // Create a large document
            const largeContent = 'A'.repeat(60 * 1024 * 1024); // 60MB
            const largeDoc = createTestDocument(largeContent, 1, 'test://large.twbl');
            
            addDocumentToCache(largeDoc);
            
            const exceedingDocs = memoryManager.getDocumentsExceedingLimit();
            
            expect(exceedingDocs.length).toBeGreaterThan(0);
            expect(exceedingDocs[0].uri).toBe('test://large.twbl');
            expect(exceedingDocs[0].sizeMB).toBeGreaterThan(50);
            expect(exceedingDocs[0].limit).toBe(50);
        });
        
        it('should handle oversized inactive documents', async () => {
            // Create a large inactive document
            const largeContent = 'A'.repeat(60 * 1024 * 1024); // 60MB
            const largeDoc = createTestDocument(largeContent, 1, 'test://large-inactive.twbl');
            
            addDocumentToCache(largeDoc);
            // Don't mark as active - it should be removed
            
            const initialCount = parsedDocumentCache.size;
            
            await memoryManager.handleOversizedDocuments();
            
            const finalCount = parsedDocumentCache.size;
            
            expect(finalCount).toBeLessThan(initialCount);
            expect(parsedDocumentCache.has('test://large-inactive.twbl')).toBe(false);
        });
        
        it('should preserve oversized active documents', async () => {
            // Create a large active document
            const largeContent = 'A'.repeat(60 * 1024 * 1024); // 60MB
            const largeDoc = createTestDocument(largeContent, 1, 'test://large-active.twbl');
            
            addDocumentToCache(largeDoc);
            memoryManager.markDocumentActive(largeDoc.uri); // Mark as active
            
            await memoryManager.handleOversizedDocuments();
            
            // Should still be in cache because it's active
            expect(parsedDocumentCache.has('test://large-active.twbl')).toBe(true);
        });
    });
    
    describe('Helper Functions', () => {
        it('should provide convenient helper functions', () => {
            const memoryUsage = MemoryHelpers.getMemoryUsage();
            expect(memoryUsage).toHaveProperty('usedMemoryMB');
            expect(memoryUsage).toHaveProperty('documentsExceedingLimit');
            expect(memoryUsage).toHaveProperty('largestDocumentMB');
            
            const needsCleanup = MemoryHelpers.needsCleanup();
            expect(typeof needsCleanup).toBe('boolean');
            
            const healthStatus = MemoryHelpers.getHealthStatus();
            expect(healthStatus).toHaveProperty('status');
            expect(healthStatus).toHaveProperty('documentsExceedingLimit');
        });
    });
});

/**
 * Helper function to create test documents
 */
function createTestDocument(
    content: string, 
    version: number = 1, 
    uri: string = 'test://test.twbl'
): TextDocument {
    return TextDocument.create(uri, 'tableau', version, content);
}

/**
 * Helper function to add document to cache
 */
function addDocumentToCache(document: TextDocument): void {
    const cachedDoc = {
        document,
        symbols: [],
        diagnostics: [],
        lineSymbols: new Map(),
        lastChangeVersion: document.version,
        changedLines: new Set()
    };
    
    parsedDocumentCache.set(document.uri, cachedDoc);
}