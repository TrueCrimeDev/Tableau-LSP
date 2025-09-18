// src/tests/unit/memoryManagementRequirements.test.ts

import { globalMemoryManager, MemoryHelpers } from '../../memoryManager';
import { parsedDocumentCache } from '../../common';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * R7.3: Comprehensive tests to verify memory management requirements
 * 
 * This test suite validates that the memory management system meets all
 * specified requirements from the enhancement specification.
 */

describe('Memory Management Requirements Validation', () => {
    beforeEach(() => {
        // Reset global state
        parsedDocumentCache.clear();
        
        // Configure memory manager for testing
        globalMemoryManager.configure({
            maxMemoryMB: 100,
            cleanupThresholdMB: 80,
            monitoringIntervalMs: 1000,
            aggressiveCleanupMB: 120,
            cacheRetentionMs: 60000,
            enableAutoCleanup: false, // Disable for controlled testing
            enableMemoryLogging: false,
            maxDocumentSizeMB: 50
        });
    });
    
    describe('R1.5: Memory usage exceeds 100MB cache cleanup', () => {
        it('should trigger cleanup when memory usage exceeds 100MB threshold', async () => {
            // Mock high memory usage
            const highMemoryUsage = {
                heapTotal: 150 * 1024 * 1024,
                heapUsed: 110 * 1024 * 1024, // 110MB - above 100MB threshold
                external: 10 * 1024 * 1024,
                rss: 170 * 1024 * 1024
            };
            
            if (typeof process !== 'undefined') {
                jest.spyOn(process, 'memoryUsage').mockReturnValue(highMemoryUsage);
            }
            
            // Add some documents to cache
            for (let i = 0; i < 10; i++) {
                const doc = createTestDocument(`SUM([Sales${i}])`, 1, `test://doc${i}.twbl`);
                addDocumentToCache(doc);
                
                // Mark some as inactive for cleanup
                if (i < 5) {
                    globalMemoryManager.markDocumentInactive(doc.uri);
                }
            }
            
            const initialDocCount = parsedDocumentCache.size;
            const stats = globalMemoryManager.getMemoryStats();
            
            // Verify memory usage exceeds threshold
            expect(stats.usedMemoryMB).toBeGreaterThan(100);
            
            // Verify cleanup is needed
            expect(globalMemoryManager.isMemoryUsageHealthy()).toBe(false);
            
            // Perform cleanup
            const cleanupStats = await globalMemoryManager.forceCleanup('normal');
            
            // Verify cleanup occurred
            expect(cleanupStats.documentsRemoved).toBeGreaterThan(0);
            expect(parsedDocumentCache.size).toBeLessThan(initialDocCount);
        });
        
        it('should implement cache cleanup to prevent memory leaks', async () => {
            // Create multiple documents and mark them as inactive
            const documentUris: string[] = [];
            
            for (let i = 0; i < 20; i++) {
                const doc = createTestDocument(`AVG([Profit${i}])`, 1, `test://leak${i}.twbl`);
                addDocumentToCache(doc);
                documentUris.push(doc.uri);
                
                // Mark as inactive after a short time
                globalMemoryManager.markDocumentActive(doc.uri);
                globalMemoryManager.markDocumentInactive(doc.uri);
            }
            
            const initialCount = parsedDocumentCache.size;
            expect(initialCount).toBe(20);
            
            // Force cleanup
            const cleanupStats = await globalMemoryManager.forceCleanup('aggressive');
            
            // Verify memory leak prevention
            expect(cleanupStats.documentsRemoved).toBeGreaterThan(0);
            expect(parsedDocumentCache.size).toBeLessThan(initialCount);
            
            // Verify cache metadata is cleaned up
            const finalStats = globalMemoryManager.getMemoryStats();
            expect(finalStats.documentsInCache).toBe(parsedDocumentCache.size);
        });
    });
    
    describe('R7.4: Memory usage per document limit (50MB)', () => {
        it('should not exceed 50MB per document', () => {
            // Create a document that would exceed 50MB
            const largeContent = 'A'.repeat(60 * 1024 * 1024); // 60MB content
            const largeDoc = createTestDocument(largeContent, 1, 'test://large.twbl');
            
            addDocumentToCache(largeDoc);
            globalMemoryManager.markDocumentActive(largeDoc.uri);
            
            const stats = globalMemoryManager.getMemoryStats();
            const healthStatus = globalMemoryManager.getMemoryHealthStatus();
            
            // Verify detection of oversized document
            expect(stats.documentsExceedingLimit).toBeGreaterThan(0);
            expect(stats.largestDocumentMB).toBeGreaterThan(50);
            expect(healthStatus.status).toBe('critical');
            expect(healthStatus.documentsExceedingLimit).toBeGreaterThan(0);
        });
        
        it('should track per-document memory usage accurately', () => {
            // Create documents of known sizes
            const smallDoc = createTestDocument('SUM([Sales])', 1, 'test://small.twbl');
            const mediumDoc = createTestDocument('A'.repeat(1024 * 1024), 1, 'test://medium.twbl'); // ~1MB
            
            addDocumentToCache(smallDoc);
            addDocumentToCache(mediumDoc);
            
            const stats = globalMemoryManager.getMemoryStats();
            
            // Verify tracking
            expect(stats.documentsInCache).toBe(2);
            expect(stats.averageDocumentSizeMB).toBeGreaterThan(0);
            expect(stats.largestDocumentMB).toBeGreaterThan(0);
            expect(stats.documentsExceedingLimit).toBe(0); // Both should be under 50MB
        });
        
        it('should handle oversized documents appropriately', async () => {
            // Create an oversized inactive document
            const oversizedContent = 'B'.repeat(60 * 1024 * 1024); // 60MB
            const oversizedDoc = createTestDocument(oversizedContent, 1, 'test://oversized.twbl');
            
            addDocumentToCache(oversizedDoc);
            // Don't mark as active - should be removed
            
            const initialCount = parsedDocumentCache.size;
            
            // Handle oversized documents
            await globalMemoryManager.handleOversizedDocuments();
            
            // Verify removal of oversized inactive document
            expect(parsedDocumentCache.size).toBeLessThan(initialCount);
            expect(parsedDocumentCache.has('test://oversized.twbl')).toBe(false);
        });
        
        it('should preserve oversized active documents but warn', async () => {
            // Create an oversized active document
            const oversizedContent = 'C'.repeat(60 * 1024 * 1024); // 60MB
            const oversizedDoc = createTestDocument(oversizedContent, 1, 'test://active-oversized.twbl');
            
            addDocumentToCache(oversizedDoc);
            globalMemoryManager.markDocumentActive(oversizedDoc.uri);
            
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            
            await globalMemoryManager.handleOversizedDocuments();
            
            // Should still be in cache because it's active
            expect(parsedDocumentCache.has('test://active-oversized.twbl')).toBe(true);
            
            // Should have logged a warning
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Large document: test://active-oversized.twbl')
            );
            
            consoleSpy.mockRestore();
        });
    });
    
    describe('Memory Management Integration', () => {
        it('should provide comprehensive memory statistics', () => {
            // Add various documents
            const docs = [
                createTestDocument('SUM([Sales])', 1, 'test://doc1.twbl'),
                createTestDocument('AVG([Profit])', 1, 'test://doc2.twbl'),
                createTestDocument('COUNT([Orders])', 1, 'test://doc3.twbl')
            ];
            
            docs.forEach(doc => {
                addDocumentToCache(doc);
                globalMemoryManager.markDocumentActive(doc.uri);
            });
            
            const stats = globalMemoryManager.getMemoryStats();
            
            // Verify all required statistics are present
            expect(stats).toHaveProperty('totalMemoryMB');
            expect(stats).toHaveProperty('usedMemoryMB');
            expect(stats).toHaveProperty('freeMemoryMB');
            expect(stats).toHaveProperty('cacheMemoryMB');
            expect(stats).toHaveProperty('requestQueueMemoryMB');
            expect(stats).toHaveProperty('documentsInCache');
            expect(stats).toHaveProperty('largestDocumentMB');
            expect(stats).toHaveProperty('documentsExceedingLimit');
            expect(stats).toHaveProperty('averageDocumentSizeMB');
            
            expect(stats.documentsInCache).toBe(3);
            expect(stats.cacheMemoryMB).toBeGreaterThan(0);
        });
        
        it('should provide accurate health assessment', () => {
            const healthStatus = globalMemoryManager.getMemoryHealthStatus();
            
            // Verify health status structure
            expect(healthStatus).toHaveProperty('status');
            expect(healthStatus).toHaveProperty('usedMemoryMB');
            expect(healthStatus).toHaveProperty('thresholdMB');
            expect(healthStatus).toHaveProperty('recommendation');
            expect(healthStatus).toHaveProperty('documentsExceedingLimit');
            expect(healthStatus).toHaveProperty('largestDocumentMB');
            
            expect(['healthy', 'warning', 'critical']).toContain(healthStatus.status);
        });
        
        it('should support memory management configuration', () => {
            const originalConfig = globalMemoryManager.getConfiguration();
            
            // Update configuration
            globalMemoryManager.configure({
                maxMemoryMB: 150,
                maxDocumentSizeMB: 75
            });
            
            const updatedConfig = globalMemoryManager.getConfiguration();
            
            expect(updatedConfig.maxMemoryMB).toBe(150);
            expect(updatedConfig.maxDocumentSizeMB).toBe(75);
            
            // Restore original configuration
            globalMemoryManager.configure(originalConfig);
        });
        
        it('should track document lifecycle correctly', () => {
            const doc = createTestDocument('SUM([Sales])', 1, 'test://lifecycle.twbl');
            addDocumentToCache(doc);
            
            // Mark as active
            globalMemoryManager.markDocumentActive(doc.uri);
            globalMemoryManager.markDocumentAccessed(doc.uri);
            
            let stats = globalMemoryManager.getMemoryStats();
            expect(stats.documentsInCache).toBe(1);
            
            // Mark as inactive
            globalMemoryManager.markDocumentInactive(doc.uri);
            
            // Should still be in cache but marked as inactive
            stats = globalMemoryManager.getMemoryStats();
            expect(stats.documentsInCache).toBe(1);
        });
    });
    
    describe('Helper Functions Validation', () => {
        it('should provide convenient memory management helpers', () => {
            // Test all helper functions
            const memoryUsage = MemoryHelpers.getMemoryUsage();
            expect(memoryUsage).toHaveProperty('usedMemoryMB');
            expect(memoryUsage).toHaveProperty('documentsExceedingLimit');
            
            const needsCleanup = MemoryHelpers.needsCleanup();
            expect(typeof needsCleanup).toBe('boolean');
            
            const healthStatus = MemoryHelpers.getHealthStatus();
            expect(healthStatus).toHaveProperty('status');
            expect(healthStatus).toHaveProperty('documentsExceedingLimit');
            
            // Test configuration helper
            MemoryHelpers.configure({ maxMemoryMB: 200 });
            const config = globalMemoryManager.getConfiguration();
            expect(config.maxMemoryMB).toBe(200);
        });
        
        it('should support forced cleanup through helpers', async () => {
            // Add some documents
            for (let i = 0; i < 5; i++) {
                const doc = createTestDocument(`COUNT([Field${i}])`, 1, `test://helper${i}.twbl`);
                addDocumentToCache(doc);
                globalMemoryManager.markDocumentInactive(doc.uri);
            }
            
            const initialCount = parsedDocumentCache.size;
            
            // Use helper to perform cleanup
            const cleanupStats = await MemoryHelpers.cleanup(false);
            
            expect(cleanupStats).toHaveProperty('documentsRemoved');
            expect(cleanupStats).toHaveProperty('memoryFreedMB');
            expect(parsedDocumentCache.size).toBeLessThanOrEqual(initialCount);
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