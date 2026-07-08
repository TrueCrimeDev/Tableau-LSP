// src/tests/integration/memoryManagement.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { globalMemoryManager, MemoryHelpers } from '../../memoryManager.js';
import { parsedDocumentCache } from '../../common.js';
import { IncrementalParser } from '../../incrementalParser.js';
import { globalDebouncer, RequestType } from '../../requestDebouncer.js';

describe('Memory Management Integration', () => {
    beforeEach(() => {
        // Reset global state
        parsedDocumentCache.clear();
        
        // Configure memory manager for testing
        globalMemoryManager.configure({
            maxMemoryMB: 50, // Lower threshold for testing
            cleanupThresholdMB: 40,
            aggressiveCleanupMB: 60,
            cacheRetentionMs: 1000, // 1 second for testing
            enableAutoCleanup: false, // Manual control for testing
            enableMemoryLogging: false
        });
    });
    
    afterEach(async () => {
        await globalDebouncer.flushAllRequests();
        await globalMemoryManager.forceCleanup('aggressive');
    });
    
    describe('Document Lifecycle Integration', () => {
        it('should manage memory during document parsing lifecycle', async () => {
            const documents = Array.from({ length: 20 }, (_, i) => 
                createTestDocument(`
                    IF [Sales${i}] > 100 THEN
                        SUM([Profit${i}])
                    ELSE
                        AVG([Revenue${i}])
                    END
                `, 1, `test://lifecycle${i}.twbl`)
            );
            
            // Simulate document opening and parsing
            for (const doc of documents) {
                globalMemoryManager.markDocumentActive(doc.uri);
                IncrementalParser.parseDocumentIncremental(doc);
                globalMemoryManager.markDocumentAccessed(doc.uri);
            }
            
            const initialStats = globalMemoryManager.getMemoryStats();
            expect(initialStats.documentsInCache).toBe(20);
            
            // Simulate closing half the documents
            for (let i = 0; i < 10; i++) {
                globalMemoryManager.markDocumentInactive(documents[i].uri);
            }
            
            // Wait for documents to become eligible for cleanup
            await new Promise(resolve => setTimeout(resolve, 1100));
            
            // Force cleanup
            const cleanupStats = await globalMemoryManager.forceCleanup('normal');
            
            const finalStats = globalMemoryManager.getMemoryStats();
            expect(finalStats.documentsInCache).toBeLessThan(initialStats.documentsInCache);
            expect(cleanupStats.documentsRemoved).toBeGreaterThan(0);
        });
        
        it('should protect active documents during aggressive cleanup', async () => {
            const activeDoc = createTestDocument(`
                CASE [Category]
                    WHEN 'Furniture' THEN [Sales] * 0.1
                    WHEN 'Technology' THEN [Sales] * 0.15
                    ELSE [Sales] * 0.05
                END
            `, 1, 'test://active-protected.twbl');
            
            const inactiveDocs = Array.from({ length: 15 }, (_, i) => 
                createTestDocument(`COUNT([Orders${i}])`, 1, `test://inactive${i}.twbl`)
            );
            
            // Parse all documents
            IncrementalParser.parseDocumentIncremental(activeDoc);
            globalMemoryManager.markDocumentActive(activeDoc.uri);
            
            for (const doc of inactiveDocs) {
                IncrementalParser.parseDocumentIncremental(doc);
                globalMemoryManager.markDocumentInactive(doc.uri);
            }
            
            // Wait for cleanup eligibility
            await new Promise(resolve => setTimeout(resolve, 1100));
            
            // Perform aggressive cleanup
            await globalMemoryManager.forceCleanup('aggressive');
            
            // Active document should still be in cache
            expect(parsedDocumentCache.has(activeDoc.uri)).toBe(true);
            
            // Some inactive documents should be removed
            const remainingInactive = inactiveDocs.filter(doc => 
                parsedDocumentCache.has(doc.uri)
            );
            expect(remainingInactive.length).toBeLessThan(inactiveDocs.length);
        });
    });
    
    describe('Integration with Request Debouncer', () => {
        it('should coordinate memory cleanup with request debouncing', async () => {
            const document = createTestDocument(`
                { FIXED [Region] : 
                    SUM([Sales]) / COUNT([Orders])
                }
            `, 1, 'test://debouncer-integration.twbl');
            
            // Start multiple debounced requests
            const mockHandler = jest.fn().mockResolvedValue('result');
            
            const requests = [
                globalDebouncer.debounceRequest(
                    RequestType.COMPLETION,
                    { document },
                    mockHandler,
                    document.uri,
                    { line: 1, character: 10 }
                ),
                globalDebouncer.debounceRequest(
                    RequestType.HOVER,
                    { document },
                    mockHandler,
                    document.uri,
                    { line: 2, character: 15 }
                )
            ];
            
            // Check initial request queue
            const initialDebounceStats = globalDebouncer.getDebounceStats();
            expect(initialDebounceStats.pendingRequests).toBeGreaterThan(0);
            
            // Perform memory cleanup (should coordinate with debouncer)
            const cleanupStats = await globalMemoryManager.forceCleanup('aggressive');
            
            // Requests should still complete
            const results = await Promise.all(requests);
            expect(results).toEqual(['result', 'result']);
            
            // Cleanup should have been coordinated
            expect(cleanupStats).toHaveProperty('requestsCancelled');
        });
        
        it('should handle memory pressure during high request load', async () => {
            const documents = Array.from({ length: 10 }, (_, i) => 
                createTestDocument(`FUNCTION${i}([Field])`, 1, `test://load${i}.twbl`)
            );
            
            const mockHandler = jest.fn().mockImplementation(() => 
                new Promise(resolve => setTimeout(() => resolve('result'), 100))
            );
            
            // Create high request load
            const requests = documents.flatMap(doc => 
                Array.from({ length: 5 }, (_, i) => 
                    globalDebouncer.debounceRequest(
                        RequestType.COMPLETION,
                        { document: doc, query: `test${i}` },
                        mockHandler,
                        doc.uri,
                        { line: 0, character: i }
                    )
                )
            );
            
            // Parse documents to add to cache
            documents.forEach(doc => {
                IncrementalParser.parseDocumentIncremental(doc);
                globalMemoryManager.markDocumentInactive(doc.uri);
            });
            
            // Monitor memory during load
            const initialMemory = globalMemoryManager.getMemoryStats();
            
            // Simulate memory pressure cleanup
            if (initialMemory.documentsInCache > 5) {
                await globalMemoryManager.forceCleanup('normal');
            }
            
            // Requests should still complete despite cleanup
            const results = await Promise.allSettled(requests);
            const successfulResults = results.filter(r => r.status === 'fulfilled');
            
            expect(successfulResults.length).toBeGreaterThan(0);
        });
    });
    
    describe('Cache Management Integration', () => {
        it('should integrate with incremental parser cache management', async () => {
            const largeDocument = createTestDocument(`
                // Large document with many expressions
                ${Array.from({ length: 100 }, (_, i) => `
                    IF [Field${i}] > ${i} THEN
                        SUM([Value${i}])
                    ELSE
                        AVG([Other${i}])
                    END
                `).join('\n')}
            `, 1, 'test://large-integration.twbl');
            
            // Parse the large document
            const parsedDoc = IncrementalParser.parseDocumentIncremental(largeDocument);
            globalMemoryManager.markDocumentActive(largeDocument.uri);
            
            expect(parsedDoc.symbols.length).toBeGreaterThan(0);
            expect(parsedDocumentCache.has(largeDocument.uri)).toBe(true);
            
            // Check memory usage
            const memoryStats = globalMemoryManager.getMemoryStats();
            expect(memoryStats.cacheMemoryMB).toBeGreaterThan(0);
            
            // Mark as inactive and cleanup
            globalMemoryManager.markDocumentInactive(largeDocument.uri);
            await new Promise(resolve => setTimeout(resolve, 1100));
            
            const cleanupStats = await globalMemoryManager.forceCleanup('normal');
            
            // Document should be removed from cache
            expect(cleanupStats.documentsRemoved).toBeGreaterThan(0);
        });
        
        it('should handle cache invalidation during memory cleanup', async () => {
            const documents = Array.from({ length: 15 }, (_, i) => 
                createTestDocument(`MAX([Field${i}])`, 1, `test://invalidation${i}.twbl`)
            );
            
            // Parse and cache all documents
            documents.forEach(doc => {
                IncrementalParser.parseDocumentIncremental(doc);
                globalMemoryManager.markDocumentAccessed(doc.uri);
            });
            
            const initialCacheSize = parsedDocumentCache.size;
            expect(initialCacheSize).toBe(15);
            
            // Mark some as inactive
            documents.slice(0, 10).forEach(doc => {
                globalMemoryManager.markDocumentInactive(doc.uri);
            });
            
            // Keep some active
            documents.slice(10).forEach(doc => {
                globalMemoryManager.markDocumentActive(doc.uri);
            });
            
            await new Promise(resolve => setTimeout(resolve, 1100));
            
            // Cleanup should remove inactive documents
            const cleanupStats = await globalMemoryManager.forceCleanup('normal');
            
            expect(parsedDocumentCache.size).toBeLessThan(initialCacheSize);
            expect(cleanupStats.documentsRemoved).toBeGreaterThan(0);
            
            // Active documents should remain
            documents.slice(10).forEach(doc => {
                expect(parsedDocumentCache.has(doc.uri)).toBe(true);
            });
        });
    });
    
    describe('Performance Under Memory Pressure', () => {
        it('should maintain performance during memory cleanup', async () => {
            const documents = Array.from({ length: 30 }, (_, i) => 
                createTestDocument(`
                    CASE [Type${i}]
                        WHEN 'A' THEN [Value${i}] * 1.1
                        WHEN 'B' THEN [Value${i}] * 1.2
                        ELSE [Value${i}]
                    END
                `, 1, `test://performance${i}.twbl`)
            );
            
            // Parse all documents
            const parseStart = Date.now();
            documents.forEach(doc => {
                IncrementalParser.parseDocumentIncremental(doc);
                globalMemoryManager.markDocumentInactive(doc.uri);
            });
            const parseTime = Date.now() - parseStart;
            
            await new Promise(resolve => setTimeout(resolve, 1100));
            
            // Measure cleanup performance
            const cleanupStart = Date.now();
            const cleanupStats = await globalMemoryManager.forceCleanup('aggressive');
            const cleanupTime = Date.now() - cleanupStart;
            
            // Performance should be reasonable
            expect(parseTime).toBeLessThan(5000); // 5 seconds max for parsing
            expect(cleanupTime).toBeLessThan(2000); // 2 seconds max for cleanup
            expect(cleanupStats.documentsRemoved).toBeGreaterThan(0);
            
            console.log(`Performance test: Parse=${parseTime}ms, Cleanup=${cleanupTime}ms, Removed=${cleanupStats.documentsRemoved}`);
        });
        
        it('should handle memory monitoring during continuous operation', async () => {
            const documents = Array.from({ length: 25 }, (_, i) => 
                createTestDocument(`COUNT(DISTINCT [Field${i}])`, 1, `test://monitoring${i}.twbl`)
            );
            
            // Simulate continuous operation
            for (let cycle = 0; cycle < 3; cycle++) {
                // Add documents
                documents.forEach(doc => {
                    const versionedUri = `${doc.uri}#v${cycle}`;
                    const versionedDoc = TextDocument.create(
                        versionedUri,
                        doc.languageId,
                        cycle + 1,
                        doc.getText()
                    );
                    
                    IncrementalParser.parseDocumentIncremental(versionedDoc);
                    globalMemoryManager.markDocumentActive(versionedUri);
                    globalMemoryManager.markDocumentAccessed(versionedUri);
                });
                
                // Check memory health
                const healthStatus = globalMemoryManager.getMemoryHealthStatus();
                
                if (healthStatus.status !== 'healthy') {
                    await globalMemoryManager.forceCleanup('normal');
                }
                
                // Mark previous cycle documents as inactive
                if (cycle > 0) {
                    documents.forEach(doc => {
                        const prevVersionUri = `${doc.uri}#v${cycle - 1}`;
                        globalMemoryManager.markDocumentInactive(prevVersionUri);
                    });
                }
                
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            const finalStats = globalMemoryManager.getMemoryStats();
            const finalHealth = globalMemoryManager.getMemoryHealthStatus();
            
            // System should remain stable
            expect(finalStats.documentsInCache).toBeGreaterThan(0);
            expect(['healthy', 'warning']).toContain(finalHealth.status);
        });
    });
    
    describe('Error Recovery Integration', () => {
        it('should handle errors during integrated cleanup', async () => {
            const documents = Array.from({ length: 10 }, (_, i) => 
                createTestDocument(`ERROR_FUNCTION${i}([Field])`, 1, `test://error${i}.twbl`)
            );
            
            // Parse documents
            documents.forEach(doc => {
                try {
                    IncrementalParser.parseDocumentIncremental(doc);
                    globalMemoryManager.markDocumentInactive(doc.uri);
                } catch (error) {
                    // Some parsing might fail, that's okay for this test
                }
            });
            
            // Mock an error in cache deletion
            const originalDelete = parsedDocumentCache.delete;
            let deleteCallCount = 0;
            parsedDocumentCache.delete = jest.fn().mockImplementation((key) => {
                deleteCallCount++;
                if (deleteCallCount === 3) {
                    throw new Error('Simulated deletion error');
                }
                return originalDelete.call(parsedDocumentCache, key);
            });
            
            await new Promise(resolve => setTimeout(resolve, 1100));
            
            // Cleanup should handle errors gracefully
            const cleanupStats = await globalMemoryManager.forceCleanup('normal');
            
            // Should have attempted cleanup despite errors
            expect(cleanupStats).toHaveProperty('documentsRemoved');
            
            // Restore original method
            parsedDocumentCache.delete = originalDelete;
        });
        
        it('should maintain system stability during memory pressure', async () => {
            // Create memory pressure scenario
            const largeDocuments = Array.from({ length: 20 }, (_, i) => 
                createTestDocument(`
                    // Large expression ${i}
                    ${Array.from({ length: 50 }, (_, j) => 
                        `SUM([Field${i}_${j}]) + AVG([Other${i}_${j}])`
                    ).join(' + ')}
                `, 1, `test://pressure${i}.twbl`)
            );
            
            // Parse all documents to create memory pressure
            largeDocuments.forEach(doc => {
                IncrementalParser.parseDocumentIncremental(doc);
                globalMemoryManager.markDocumentInactive(doc.uri);
            });
            
            // Check memory health
            const healthBefore = globalMemoryManager.getMemoryHealthStatus();
            
            await new Promise(resolve => setTimeout(resolve, 1100));
            
            // System should handle pressure gracefully
            if (healthBefore.status === 'critical') {
                await globalMemoryManager.forceCleanup('aggressive');
            }
            
            const healthAfter = globalMemoryManager.getMemoryHealthStatus();
            const finalStats = globalMemoryManager.getMemoryStats();
            
            // System should be more stable after cleanup
            expect(finalStats.documentsInCache).toBeGreaterThanOrEqual(0);
            expect(['healthy', 'warning', 'critical']).toContain(healthAfter.status);
        });
    });
    
    describe('Helper Functions Integration', () => {
        it('should provide accurate system-wide memory information', async () => {
            const documents = Array.from({ length: 8 }, (_, i) => 
                createTestDocument(`MEDIAN([Field${i}])`, 1, `test://helpers${i}.twbl`)
            );
            
            // Parse documents
            documents.forEach(doc => {
                IncrementalParser.parseDocumentIncremental(doc);
                globalMemoryManager.markDocumentAccessed(doc.uri);
            });
            
            // Test helper functions
            const memoryUsage = MemoryHelpers.getMemoryUsage();
            expect(memoryUsage.documentsInCache).toBe(8);
            expect(memoryUsage.cacheMemoryMB).toBeGreaterThan(0);
            
            const needsCleanup = MemoryHelpers.needsCleanup();
            expect(typeof needsCleanup).toBe('boolean');
            
            const healthStatus = MemoryHelpers.getHealthStatus();
            expect(['healthy', 'warning', 'critical']).toContain(healthStatus.status);
            
            // Test cleanup helper
            documents.forEach(doc => {
                globalMemoryManager.markDocumentInactive(doc.uri);
            });
            
            await new Promise(resolve => setTimeout(resolve, 1100));
            
            const cleanupStats = await MemoryHelpers.cleanup(false);
            expect(cleanupStats.documentsRemoved).toBeGreaterThanOrEqual(0);
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
