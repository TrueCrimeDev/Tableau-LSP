// src/memoryManager.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { parsedDocumentCache, CachedDocument, INCREMENTAL_PARSING_CONFIG } from './common';
import { globalDebouncer } from './requestDebouncer';
import { IncrementalParser } from './incrementalParser';

/**
 * R7.3: Comprehensive memory management system for the Tableau LSP extension
 * 
 * This module provides automatic cleanup for unused resources, memory usage monitoring,
 * and cache cleanup when memory usage exceeds configured thresholds.
 */

/**
 * Memory usage thresholds and configuration
 */
interface MemoryConfig {
    maxMemoryMB: number;           // Maximum memory usage before cleanup (default: 100MB)
    cleanupThresholdMB: number;    // Threshold to trigger cleanup (default: 80MB)
    monitoringIntervalMs: number;  // How often to check memory usage (default: 30s)
    aggressiveCleanupMB: number;   // Threshold for aggressive cleanup (default: 120MB)
    cacheRetentionMs: number;      // How long to keep unused cache entries (default: 5 minutes)
    enableAutoCleanup: boolean;    // Whether to enable automatic cleanup
    enableMemoryLogging: boolean;  // Whether to log memory usage
    maxDocumentSizeMB: number;     // Maximum memory per document (default: 50MB)
}

/**
 * Memory usage statistics
 */
interface MemoryStats {
    totalMemoryMB: number;
    usedMemoryMB: number;
    freeMemoryMB: number;
    cacheMemoryMB: number;
    requestQueueMemoryMB: number;
    lastCleanupTime: number;
    cleanupCount: number;
    cacheHitRate: number;
    documentsInCache: number;
    largestDocumentMB: number;
    documentsExceedingLimit: number;
    averageDocumentSizeMB: number;
}

/**
 * Cache entry metadata for memory management
 */
interface CacheEntryMetadata {
    uri: string;
    lastAccessed: number;
    accessCount: number;
    memorySize: number;
    isActive: boolean; // Whether the document is currently open
    documentSizeMB: number; // Size of the document content in MB
    exceedsDocumentLimit: boolean; // Whether this document exceeds 50MB limit
}

/**
 * Resource cleanup statistics
 */
interface CleanupStats {
    documentsRemoved: number;
    memoryFreedMB: number;
    requestsCancelled: number;
    cacheEntriesRemoved: number;
    cleanupDurationMs: number;
}

/**
 * R7.3: Memory manager class for comprehensive resource management
 */
export class MemoryManager {
    private static instance: MemoryManager;
    private config: MemoryConfig;
    private monitoringTimer?: NodeJS.Timeout;
    private cacheMetadata = new Map<string, CacheEntryMetadata>();
    private activeDocuments = new Set<string>();
    private cleanupStats: CleanupStats[] = [];
    private lastMemoryStats: MemoryStats;
    
    private constructor() {
        this.config = {
            maxMemoryMB: 100,
            cleanupThresholdMB: 80,
            monitoringIntervalMs: 30000, // 30 seconds
            aggressiveCleanupMB: 120,
            cacheRetentionMs: 5 * 60 * 1000, // 5 minutes
            enableAutoCleanup: true,
            enableMemoryLogging: true,
            maxDocumentSizeMB: 50 // R1.5: Maximum 50MB per document
        };
        
        this.lastMemoryStats = this.createEmptyStats();
        this.startMemoryMonitoring();
    }
    
    /**
     * Get singleton instance
     */
    static getInstance(): MemoryManager {
        if (!MemoryManager.instance) {
            MemoryManager.instance = new MemoryManager();
        }
        return MemoryManager.instance;
    }
    
    /**
     * Start automatic memory monitoring
     */
    private startMemoryMonitoring(): void {
        if (!this.config.enableAutoCleanup) return;
        
        this.monitoringTimer = setInterval(() => {
            this.performMemoryCheck();
        }, this.config.monitoringIntervalMs);
        
        // Also monitor on process events
        if (typeof process !== 'undefined') {
            process.on('memoryUsage', () => {
                this.performMemoryCheck();
            });
        }
    }
    
    /**
     * Perform periodic memory check and cleanup if needed
     */
    private async performMemoryCheck(): Promise<void> {
        try {
            const stats = this.getMemoryStats();
            this.lastMemoryStats = stats;
            
            if (this.config.enableMemoryLogging && (stats.usedMemoryMB > this.config.cleanupThresholdMB || stats.documentsExceedingLimit > 0)) {
                console.log('[MemoryManager] Memory usage:', {
                    used: `${stats.usedMemoryMB.toFixed(1)}MB`,
                    cache: `${stats.cacheMemoryMB.toFixed(1)}MB`,
                    documents: stats.documentsInCache,
                    threshold: `${this.config.cleanupThresholdMB}MB`,
                    largestDoc: `${stats.largestDocumentMB.toFixed(1)}MB`,
                    exceedingLimit: stats.documentsExceedingLimit
                });
            }
            
            // Update cache metadata first
            this.updateCacheMetadata();
            
            // Handle oversized documents
            if (stats.documentsExceedingLimit > 0) {
                await this.handleOversizedDocuments();
            }
            
            // Trigger cleanup if memory usage exceeds threshold
            if (stats.usedMemoryMB > this.config.cleanupThresholdMB) {
                const cleanupType = stats.usedMemoryMB > this.config.aggressiveCleanupMB ? 'aggressive' : 'normal';
                await this.performCleanup(cleanupType);
            }
            
        } catch (error) {
            console.error('[MemoryManager] Error during memory check:', error);
        }
    }
    
    /**
     * Get current memory usage statistics
     */
    getMemoryStats(): MemoryStats {
        const memUsage = this.getProcessMemoryUsage();
        const cacheMemory = this.calculateCacheMemoryUsage();
        const requestQueueMemory = this.calculateRequestQueueMemoryUsage();
        const documentStats = this.calculateDocumentStats();
        
        return {
            totalMemoryMB: memUsage.total,
            usedMemoryMB: memUsage.used,
            freeMemoryMB: memUsage.free,
            cacheMemoryMB: cacheMemory,
            requestQueueMemoryMB: requestQueueMemory,
            lastCleanupTime: this.getLastCleanupTime(),
            cleanupCount: this.cleanupStats.length,
            cacheHitRate: this.calculateCacheHitRate(),
            documentsInCache: parsedDocumentCache.size,
            largestDocumentMB: documentStats.largest,
            documentsExceedingLimit: documentStats.exceedingLimit,
            averageDocumentSizeMB: documentStats.average
        };
    }
    
    /**
     * Get process memory usage
     */
    private getProcessMemoryUsage(): { total: number; used: number; free: number } {
        if (typeof process !== 'undefined' && process.memoryUsage) {
            const usage = process.memoryUsage();
            const totalMB = (usage.heapTotal + usage.external) / 1024 / 1024;
            const usedMB = usage.heapUsed / 1024 / 1024;
            const freeMB = totalMB - usedMB;
            
            return {
                total: totalMB,
                used: usedMB,
                free: freeMB
            };
        }
        
        // Fallback for environments without process.memoryUsage
        return { total: 0, used: 0, free: 0 };
    }
    
    /**
     * Calculate memory usage of the document cache
     */
    private calculateCacheMemoryUsage(): number {
        let totalSize = 0;
        
        for (const [uri, cachedDoc] of parsedDocumentCache) {
            const docSize = this.estimateDocumentMemorySize(cachedDoc);
            totalSize += docSize;
            
            // Update metadata
            const metadata = this.cacheMetadata.get(uri);
            if (metadata) {
                metadata.memorySize = docSize;
            }
        }
        
        return totalSize / 1024 / 1024; // Convert to MB
    }
    
    /**
     * Calculate memory usage of the request debouncer queue
     */
    private calculateRequestQueueMemoryUsage(): number {
        const stats = globalDebouncer.getDebounceStats();
        
        // Estimate memory usage based on pending requests
        // Each request roughly uses 1KB (conservative estimate)
        const estimatedSize = stats.pendingRequests * 1024;
        
        return estimatedSize / 1024 / 1024; // Convert to MB
    }
    
    /**
     * Calculate per-document memory statistics
     */
    private calculateDocumentStats(): {
        largest: number;
        exceedingLimit: number;
        average: number;
    } {
        let largestMB = 0;
        let exceedingLimit = 0;
        let totalSizeMB = 0;
        
        for (const [uri, cachedDoc] of parsedDocumentCache) {
            const docSizeMB = this.estimateDocumentMemorySize(cachedDoc) / 1024 / 1024;
            
            if (docSizeMB > largestMB) {
                largestMB = docSizeMB;
            }
            
            if (docSizeMB > this.config.maxDocumentSizeMB) {
                exceedingLimit++;
            }
            
            totalSizeMB += docSizeMB;
        }
        
        const averageMB = parsedDocumentCache.size > 0 ? totalSizeMB / parsedDocumentCache.size : 0;
        
        return {
            largest: largestMB,
            exceedingLimit,
            average: averageMB
        };
    }
    
    /**
     * Estimate memory size of a cached document
     */
    private estimateDocumentMemorySize(cachedDoc: CachedDocument): number {
        let size = 0;
        
        // Document text size
        size += cachedDoc.document.getText().length * 2; // UTF-16 characters
        
        // Symbols size (rough estimate)
        size += cachedDoc.symbols.length * 200; // ~200 bytes per symbol
        
        // Line symbols map size
        if (cachedDoc.lineSymbols) {
            size += cachedDoc.lineSymbols.size * 50; // Map overhead
            for (const symbols of cachedDoc.lineSymbols.values()) {
                size += symbols.length * 50; // Reference overhead
            }
        }
        
        // Diagnostics size
        size += cachedDoc.diagnostics.length * 100; // ~100 bytes per diagnostic
        
        return size;
    }
    
    /**
     * Perform memory cleanup
     */
    async performCleanup(type: 'normal' | 'aggressive' = 'normal'): Promise<CleanupStats> {
        const startTime = Date.now();
        const initialMemory = this.getMemoryStats();
        
        console.log(`[MemoryManager] Starting ${type} cleanup - Memory usage: ${initialMemory.usedMemoryMB.toFixed(1)}MB`);
        
        const stats: CleanupStats = {
            documentsRemoved: 0,
            memoryFreedMB: 0,
            requestsCancelled: 0,
            cacheEntriesRemoved: 0,
            cleanupDurationMs: 0
        };
        
        try {
            // 1. Clean up request debouncer
            await this.cleanupRequestQueue(stats);
            
            // 2. Clean up document cache
            await this.cleanupDocumentCache(type, stats);
            
            // 3. Force garbage collection if available
            this.forceGarbageCollection();
            
            // 4. Update statistics
            const finalMemory = this.getMemoryStats();
            stats.memoryFreedMB = initialMemory.usedMemoryMB - finalMemory.usedMemoryMB;
            stats.cleanupDurationMs = Date.now() - startTime;
            
            this.cleanupStats.push(stats);
            
            // Keep only last 100 cleanup stats
            if (this.cleanupStats.length > 100) {
                this.cleanupStats = this.cleanupStats.slice(-100);
            }
            
            console.log(`[MemoryManager] Cleanup completed:`, {
                type,
                documentsRemoved: stats.documentsRemoved,
                memoryFreed: `${stats.memoryFreedMB.toFixed(1)}MB`,
                duration: `${stats.cleanupDurationMs}ms`,
                finalMemory: `${finalMemory.usedMemoryMB.toFixed(1)}MB`
            });
            
        } catch (error) {
            console.error('[MemoryManager] Error during cleanup:', error);
        }
        
        return stats;
    }
    
    /**
     * Clean up request debouncer queue
     */
    private async cleanupRequestQueue(stats: CleanupStats): Promise<void> {
        const initialStats = globalDebouncer.getDebounceStats();
        
        // Cancel low-priority pending requests if memory is critical
        if (this.lastMemoryStats.usedMemoryMB > this.config.aggressiveCleanupMB) {
            // This would require extending the debouncer API to cancel low-priority requests
            // For now, we'll just flush all requests to free memory
            await globalDebouncer.flushAllRequests();
            stats.requestsCancelled = initialStats.pendingRequests;
        }
    }
    
    /**
     * Clean up document cache
     */
    private async cleanupDocumentCache(type: 'normal' | 'aggressive', stats: CleanupStats): Promise<void> {
        const now = Date.now();
        const candidatesForRemoval: Array<{ uri: string; priority: number; metadata: CacheEntryMetadata }> = [];
        
        // Identify candidates for removal
        for (const [uri, metadata] of this.cacheMetadata) {
            if (!this.activeDocuments.has(uri)) {
                const timeSinceAccess = now - metadata.lastAccessed;
                const priority = this.calculateRemovalPriority(metadata, timeSinceAccess, type);
                
                if (priority > 0) {
                    candidatesForRemoval.push({ uri, priority, metadata });
                }
            }
        }
        
        // Sort by removal priority (higher priority = remove first)
        candidatesForRemoval.sort((a, b) => b.priority - a.priority);
        
        // Determine how many to remove
        const targetRemovalCount = type === 'aggressive' 
            ? Math.ceil(candidatesForRemoval.length * 0.5)
            : Math.ceil(candidatesForRemoval.length * 0.3);
        
        // Remove selected documents
        const toRemove = candidatesForRemoval.slice(0, targetRemovalCount);
        
        for (const { uri } of toRemove) {
            parsedDocumentCache.delete(uri);
            this.cacheMetadata.delete(uri);
            stats.documentsRemoved++;
            stats.cacheEntriesRemoved++;
        }
        
        // Also clean up any orphaned cache metadata
        for (const uri of this.cacheMetadata.keys()) {
            if (!parsedDocumentCache.has(uri)) {
                this.cacheMetadata.delete(uri);
                stats.cacheEntriesRemoved++;
            }
        }
    }
    
    /**
     * Calculate removal priority for a cache entry
     */
    private calculateRemovalPriority(
        metadata: CacheEntryMetadata, 
        timeSinceAccess: number, 
        cleanupType: 'normal' | 'aggressive'
    ): number {
        let priority = 0;
        
        // Time-based priority (older = higher priority for removal)
        if (timeSinceAccess > this.config.cacheRetentionMs) {
            priority += Math.min(10, timeSinceAccess / this.config.cacheRetentionMs);
        }
        
        // Access frequency (less accessed = higher priority for removal)
        const avgAccessInterval = timeSinceAccess / Math.max(1, metadata.accessCount);
        priority += Math.min(5, avgAccessInterval / (60 * 1000)); // Minutes since last access per access
        
        // Memory size (larger = higher priority for removal in aggressive mode)
        if (cleanupType === 'aggressive') {
            priority += Math.min(3, metadata.memorySize / (1024 * 1024)); // MB
        }
        
        // Active document protection (never remove active documents)
        if (metadata.isActive) {
            priority = 0;
        }
        
        return priority;
    }
    
    /**
     * Force garbage collection if available
     */
    private forceGarbageCollection(): void {
        if (typeof global !== 'undefined' && global.gc) {
            try {
                global.gc();
                console.log('[MemoryManager] Forced garbage collection');
            } catch (error) {
                // Ignore errors - GC might not be available
            }
        }
    }
    
    /**
     * Update cache metadata for all cached documents
     */
    private updateCacheMetadata(): void {
        const now = Date.now();
        
        for (const [uri, cachedDoc] of parsedDocumentCache) {
            let metadata = this.cacheMetadata.get(uri);
            const memorySize = this.estimateDocumentMemorySize(cachedDoc);
            const documentSizeMB = memorySize / 1024 / 1024;
            const exceedsLimit = documentSizeMB > this.config.maxDocumentSizeMB;
            
            if (!metadata) {
                metadata = {
                    uri,
                    lastAccessed: now,
                    accessCount: 1,
                    memorySize,
                    isActive: this.activeDocuments.has(uri),
                    documentSizeMB,
                    exceedsDocumentLimit: exceedsLimit
                };
                this.cacheMetadata.set(uri, metadata);
            } else {
                metadata.memorySize = memorySize;
                metadata.isActive = this.activeDocuments.has(uri);
                metadata.documentSizeMB = documentSizeMB;
                metadata.exceedsDocumentLimit = exceedsLimit;
            }
            
            // Log warning for documents exceeding limit
            if (exceedsLimit && this.config.enableMemoryLogging) {
                console.warn(`[MemoryManager] Document ${uri} exceeds size limit: ${documentSizeMB.toFixed(1)}MB > ${this.config.maxDocumentSizeMB}MB`);
            }
        }
    }
    
    /**
     * Mark a document as accessed (for LRU tracking)
     */
    markDocumentAccessed(uri: string): void {
        const metadata = this.cacheMetadata.get(uri);
        if (metadata) {
            metadata.lastAccessed = Date.now();
            metadata.accessCount++;
        }
    }
    
    /**
     * Mark a document as active (currently open)
     */
    markDocumentActive(uri: string): void {
        this.activeDocuments.add(uri);
        const metadata = this.cacheMetadata.get(uri);
        if (metadata) {
            metadata.isActive = true;
        }
    }
    
    /**
     * Mark a document as inactive (closed)
     */
    markDocumentInactive(uri: string): void {
        this.activeDocuments.delete(uri);
        const metadata = this.cacheMetadata.get(uri);
        if (metadata) {
            metadata.isActive = false;
        }
    }
    
    /**
     * Configure memory management settings
     */
    configure(config: Partial<MemoryConfig>): void {
        this.config = { ...this.config, ...config };
        
        // Restart monitoring if interval changed
        if (config.monitoringIntervalMs && this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
            this.startMemoryMonitoring();
        }
        
        console.log('[MemoryManager] Configuration updated:', this.config);
    }
    
    /**
     * Get current configuration
     */
    getConfiguration(): MemoryConfig {
        return { ...this.config };
    }
    
    /**
     * Get cleanup statistics
     */
    getCleanupStats(): CleanupStats[] {
        return [...this.cleanupStats];
    }
    
    /**
     * Force immediate cleanup
     */
    async forceCleanup(type: 'normal' | 'aggressive' = 'normal'): Promise<CleanupStats> {
        return this.performCleanup(type);
    }
    
    /**
     * Check if memory usage is within acceptable limits
     */
    isMemoryUsageHealthy(): boolean {
        const stats = this.getMemoryStats();
        return stats.usedMemoryMB < this.config.cleanupThresholdMB && stats.documentsExceedingLimit === 0;
    }
    
    /**
     * Get documents that exceed the per-document memory limit
     */
    getDocumentsExceedingLimit(): Array<{ uri: string; sizeMB: number; limit: number }> {
        const exceedingDocs: Array<{ uri: string; sizeMB: number; limit: number }> = [];
        
        for (const [uri, metadata] of this.cacheMetadata) {
            if (metadata.exceedsDocumentLimit) {
                exceedingDocs.push({
                    uri,
                    sizeMB: metadata.documentSizeMB,
                    limit: this.config.maxDocumentSizeMB
                });
            }
        }
        
        return exceedingDocs;
    }
    
    /**
     * Handle documents that exceed memory limits
     */
    async handleOversizedDocuments(): Promise<void> {
        const oversizedDocs = this.getDocumentsExceedingLimit();
        
        if (oversizedDocs.length === 0) return;
        
        console.warn(`[MemoryManager] Found ${oversizedDocs.length} documents exceeding size limit`);
        
        for (const doc of oversizedDocs) {
            // For now, we'll log the issue and potentially implement document splitting or optimization
            console.warn(`[MemoryManager] Large document: ${doc.uri} (${doc.sizeMB.toFixed(1)}MB)`);
            
            // In a production system, we might:
            // 1. Implement document content optimization
            // 2. Split large documents into chunks
            // 3. Use streaming parsing for large documents
            // 4. Implement lazy loading of document sections
            
            // For now, we'll mark these documents for priority cleanup if they're inactive
            const metadata = this.cacheMetadata.get(doc.uri);
            if (metadata && !metadata.isActive) {
                // Remove oversized inactive documents immediately
                parsedDocumentCache.delete(doc.uri);
                this.cacheMetadata.delete(doc.uri);
                console.log(`[MemoryManager] Removed oversized inactive document: ${doc.uri}`);
            }
        }
    }
    
    /**
     * Get memory health status
     */
    getMemoryHealthStatus(): {
        status: 'healthy' | 'warning' | 'critical';
        usedMemoryMB: number;
        thresholdMB: number;
        recommendation: string;
        documentsExceedingLimit: number;
        largestDocumentMB: number;
    } {
        const stats = this.getMemoryStats();
        
        // Check for critical issues first
        if (stats.usedMemoryMB >= this.config.aggressiveCleanupMB || stats.documentsExceedingLimit > 0) {
            return {
                status: 'critical',
                usedMemoryMB: stats.usedMemoryMB,
                thresholdMB: this.config.aggressiveCleanupMB,
                recommendation: stats.documentsExceedingLimit > 0 
                    ? `${stats.documentsExceedingLimit} documents exceed 50MB limit. Close large documents and restart if necessary.`
                    : 'Immediate cleanup recommended - close documents and restart if necessary',
                documentsExceedingLimit: stats.documentsExceedingLimit,
                largestDocumentMB: stats.largestDocumentMB
            };
        } else if (stats.usedMemoryMB >= this.config.cleanupThresholdMB || stats.largestDocumentMB > this.config.maxDocumentSizeMB * 0.8) {
            return {
                status: 'warning',
                usedMemoryMB: stats.usedMemoryMB,
                thresholdMB: this.config.cleanupThresholdMB,
                recommendation: stats.largestDocumentMB > this.config.maxDocumentSizeMB * 0.8
                    ? `Largest document is ${stats.largestDocumentMB.toFixed(1)}MB. Consider optimizing large calculations.`
                    : 'Consider closing unused documents or reducing cache size',
                documentsExceedingLimit: stats.documentsExceedingLimit,
                largestDocumentMB: stats.largestDocumentMB
            };
        } else {
            return {
                status: 'healthy',
                usedMemoryMB: stats.usedMemoryMB,
                thresholdMB: this.config.cleanupThresholdMB,
                recommendation: 'Memory usage is within normal limits',
                documentsExceedingLimit: stats.documentsExceedingLimit,
                largestDocumentMB: stats.largestDocumentMB
            };
        }
    }
    
    /**
     * Shutdown memory manager
     */
    shutdown(): void {
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
            this.monitoringTimer = undefined;
        }
        
        console.log('[MemoryManager] Shutdown completed');
    }
    
    // Helper methods
    
    private createEmptyStats(): MemoryStats {
        return {
            totalMemoryMB: 0,
            usedMemoryMB: 0,
            freeMemoryMB: 0,
            cacheMemoryMB: 0,
            requestQueueMemoryMB: 0,
            lastCleanupTime: 0,
            cleanupCount: 0,
            cacheHitRate: 0,
            documentsInCache: 0,
            largestDocumentMB: 0,
            documentsExceedingLimit: 0,
            averageDocumentSizeMB: 0
        };
    }
    
    private getLastCleanupTime(): number {
        return this.cleanupStats.length > 0 
            ? Date.now() - this.cleanupStats[this.cleanupStats.length - 1].cleanupDurationMs
            : 0;
    }
    
    private calculateCacheHitRate(): number {
        // This would require tracking cache hits/misses
        // For now, return a placeholder
        return 0.85; // 85% hit rate assumption
    }
}

/**
 * Global memory manager instance
 */
export const globalMemoryManager = MemoryManager.getInstance();

/**
 * R7.3: Convenience functions for memory management
 */
export const MemoryHelpers = {
    /**
     * Get current memory usage
     */
    getMemoryUsage(): MemoryStats {
        return globalMemoryManager.getMemoryStats();
    },
    
    /**
     * Check if memory cleanup is needed
     */
    needsCleanup(): boolean {
        return !globalMemoryManager.isMemoryUsageHealthy();
    },
    
    /**
     * Force memory cleanup
     */
    async cleanup(aggressive: boolean = false): Promise<CleanupStats> {
        return globalMemoryManager.forceCleanup(aggressive ? 'aggressive' : 'normal');
    },
    
    /**
     * Configure memory management
     */
    configure(config: Partial<MemoryConfig>): void {
        globalMemoryManager.configure(config);
    },
    
    /**
     * Get memory health status
     */
    getHealthStatus() {
        return globalMemoryManager.getMemoryHealthStatus();
    }
};