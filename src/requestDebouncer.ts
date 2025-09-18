// src/requestDebouncer.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range } from 'vscode-languageserver';

/**
 * R7.2: Request debouncing system for performance optimization
 * 
 * This module provides intelligent request debouncing to handle rapid typing scenarios
 * and prioritize critical requests for optimal user experience.
 */

/**
 * Request priority levels for intelligent handling
 */
export enum RequestPriority {
    CRITICAL = 0,    // Immediate execution (diagnostics, errors)
    HIGH = 1,        // Quick response needed (hover, signature help)
    MEDIUM = 2,      // Standard response (completion)
    LOW = 3          // Can be delayed (formatting, symbols)
}

/**
 * Request types for categorization and handling
 */
export enum RequestType {
    DIAGNOSTICS = 'diagnostics',
    HOVER = 'hover',
    COMPLETION = 'completion',
    SIGNATURE_HELP = 'signature_help',
    FORMATTING = 'formatting',
    SEMANTIC_TOKENS = 'semantic_tokens',
    DOCUMENT_SYMBOLS = 'document_symbols',
    WORKSPACE_SYMBOLS = 'workspace_symbols',
    CODE_ACTIONS = 'code_actions',
    DEFINITION = 'definition',
    REFERENCES = 'references'
}

/**
 * Request context for debouncing decisions
 */
interface RequestContext {
    type: RequestType;
    priority: RequestPriority;
    documentUri: string;
    position?: Position;
    range?: Range;
    timestamp: number;
    requestId: string;
}

/**
 * Debounce configuration for different request types
 */
interface DebounceConfig {
    delay: number;           // Debounce delay in milliseconds
    maxDelay: number;        // Maximum delay before forced execution
    batchSize: number;       // Maximum requests to batch together
    enableBatching: boolean; // Whether to batch similar requests
}

/**
 * Request handler function type
 */
type RequestHandler<T, R> = (params: T, context: RequestContext) => Promise<R> | R;

/**
 * Pending request information
 */
interface PendingRequest<T, R> {
    context: RequestContext;
    params: T;
    handler: RequestHandler<T, R>;
    resolve: (value: R) => void;
    reject: (error: any) => void;
    timeoutId?: NodeJS.Timeout;
}

/**
 * R7.2: Intelligent request debouncer with priority handling
 */
export class RequestDebouncer {
    private pendingRequests = new Map<string, PendingRequest<any, any>>();
    private requestQueues = new Map<RequestType, PendingRequest<any, any>[]>();
    private lastRequestTime = new Map<string, number>();
    private requestCounts = new Map<RequestType, number>();
    
    // Configuration for different request types
    private readonly debounceConfigs: Map<RequestType, DebounceConfig> = new Map([
        [RequestType.DIAGNOSTICS, {
            delay: 300,
            maxDelay: 1000,
            batchSize: 1,
            enableBatching: false
        }],
        [RequestType.HOVER, {
            delay: 100,
            maxDelay: 500,
            batchSize: 1,
            enableBatching: false
        }],
        [RequestType.COMPLETION, {
            delay: 150,
            maxDelay: 800,
            batchSize: 3,
            enableBatching: true
        }],
        [RequestType.SIGNATURE_HELP, {
            delay: 50,
            maxDelay: 300,
            batchSize: 1,
            enableBatching: false
        }],
        [RequestType.FORMATTING, {
            delay: 500,
            maxDelay: 2000,
            batchSize: 1,
            enableBatching: false
        }],
        [RequestType.SEMANTIC_TOKENS, {
            delay: 200,
            maxDelay: 1000,
            batchSize: 1,
            enableBatching: false
        }],
        [RequestType.DOCUMENT_SYMBOLS, {
            delay: 300,
            maxDelay: 1500,
            batchSize: 2,
            enableBatching: true
        }],
        [RequestType.WORKSPACE_SYMBOLS, {
            delay: 400,
            maxDelay: 2000,
            batchSize: 5,
            enableBatching: true
        }],
        [RequestType.CODE_ACTIONS, {
            delay: 200,
            maxDelay: 1000,
            batchSize: 2,
            enableBatching: true
        }],
        [RequestType.DEFINITION, {
            delay: 100,
            maxDelay: 600,
            batchSize: 1,
            enableBatching: false
        }],
        [RequestType.REFERENCES, {
            delay: 200,
            maxDelay: 1000,
            batchSize: 1,
            enableBatching: false
        }]
    ]);

    // Priority mapping for request types
    private readonly priorityMapping: Map<RequestType, RequestPriority> = new Map([
        [RequestType.DIAGNOSTICS, RequestPriority.CRITICAL],
        [RequestType.SIGNATURE_HELP, RequestPriority.HIGH],
        [RequestType.HOVER, RequestPriority.HIGH],
        [RequestType.COMPLETION, RequestPriority.MEDIUM],
        [RequestType.CODE_ACTIONS, RequestPriority.MEDIUM],
        [RequestType.DEFINITION, RequestPriority.MEDIUM],
        [RequestType.REFERENCES, RequestPriority.MEDIUM],
        [RequestType.SEMANTIC_TOKENS, RequestPriority.LOW],
        [RequestType.FORMATTING, RequestPriority.LOW],
        [RequestType.DOCUMENT_SYMBOLS, RequestPriority.LOW],
        [RequestType.WORKSPACE_SYMBOLS, RequestPriority.LOW]
    ]);

    /**
     * Debounce a request with intelligent priority handling
     */
    async debounceRequest<T, R>(
        type: RequestType,
        params: T,
        handler: RequestHandler<T, R>,
        documentUri: string,
        position?: Position,
        range?: Range
    ): Promise<R> {
        const requestId = this.generateRequestId(type, documentUri, position);
        const priority = this.priorityMapping.get(type) || RequestPriority.MEDIUM;
        const config = this.debounceConfigs.get(type)!;
        
        const context: RequestContext = {
            type,
            priority,
            documentUri,
            position,
            range,
            timestamp: Date.now(),
            requestId
        };

        // Handle critical priority requests immediately
        if (priority === RequestPriority.CRITICAL) {
            return this.executeImmediately(params, handler, context);
        }

        // Cancel existing request for the same operation
        this.cancelPendingRequest(requestId);

        return new Promise<R>((resolve, reject) => {
            const pendingRequest: PendingRequest<T, R> = {
                context,
                params,
                handler,
                resolve,
                reject
            };

            // Determine debounce delay based on typing patterns
            const effectiveDelay = this.calculateEffectiveDelay(type, documentUri, config);
            
            // Set up debounced execution
            pendingRequest.timeoutId = setTimeout(() => {
                this.executePendingRequest(requestId);
            }, effectiveDelay);

            this.pendingRequests.set(requestId, pendingRequest);
            this.updateRequestQueue(type, pendingRequest);
            this.updateRequestStats(type);
        });
    }

    /**
     * Execute a request immediately without debouncing
     */
    private async executeImmediately<T, R>(
        params: T,
        handler: RequestHandler<T, R>,
        context: RequestContext
    ): Promise<R> {
        try {
            this.updateRequestStats(context.type);
            return await handler(params, context);
        } catch (error) {
            console.error(`[RequestDebouncer] Immediate execution failed for ${context.type}:`, error);
            throw error;
        }
    }

    /**
     * Calculate effective delay based on typing patterns and request history
     */
    private calculateEffectiveDelay(
        type: RequestType,
        documentUri: string,
        config: DebounceConfig
    ): number {
        const now = Date.now();
        const lastRequestKey = `${type}:${documentUri}`;
        const lastRequestTime = this.lastRequestTime.get(lastRequestKey) || 0;
        const timeSinceLastRequest = now - lastRequestTime;
        
        this.lastRequestTime.set(lastRequestKey, now);
        
        // Adaptive delay based on typing speed
        if (timeSinceLastRequest < 100) {
            // Very rapid typing - increase delay
            return Math.min(config.delay * 1.5, config.maxDelay);
        } else if (timeSinceLastRequest < 300) {
            // Normal typing - standard delay
            return config.delay;
        } else {
            // Slow typing or pause - reduce delay
            return Math.max(config.delay * 0.7, 50);
        }
    }

    /**
     * Execute a pending request
     */
    private async executePendingRequest(requestId: string): Promise<void> {
        const pendingRequest = this.pendingRequests.get(requestId);
        if (!pendingRequest) return;

        this.pendingRequests.delete(requestId);
        this.removeFromRequestQueue(pendingRequest.context.type, requestId);

        try {
            const result = await pendingRequest.handler(pendingRequest.params, pendingRequest.context);
            pendingRequest.resolve(result);
        } catch (error) {
            console.error(`[RequestDebouncer] Request execution failed for ${pendingRequest.context.type}:`, error);
            pendingRequest.reject(error);
        }
    }

    /**
     * Cancel a pending request
     */
    private cancelPendingRequest(requestId: string): void {
        const pendingRequest = this.pendingRequests.get(requestId);
        if (pendingRequest) {
            if (pendingRequest.timeoutId) {
                clearTimeout(pendingRequest.timeoutId);
            }
            this.pendingRequests.delete(requestId);
            this.removeFromRequestQueue(pendingRequest.context.type, requestId);
        }
    }

    /**
     * Generate a unique request ID
     */
    private generateRequestId(
        type: RequestType,
        documentUri: string,
        position?: Position
    ): string {
        const positionStr = position ? `${position.line}:${position.character}` : 'global';
        return `${type}:${documentUri}:${positionStr}`;
    }

    /**
     * Update request queue for batching
     */
    private updateRequestQueue<T, R>(type: RequestType, request: PendingRequest<T, R>): void {
        if (!this.requestQueues.has(type)) {
            this.requestQueues.set(type, []);
        }
        
        const queue = this.requestQueues.get(type)!;
        queue.push(request);
        
        const config = this.debounceConfigs.get(type)!;
        if (config.enableBatching && queue.length >= config.batchSize) {
            this.processBatchedRequests(type);
        }
    }

    /**
     * Remove request from queue
     */
    private removeFromRequestQueue(type: RequestType, requestId: string): void {
        const queue = this.requestQueues.get(type);
        if (queue) {
            const index = queue.findIndex(req => req.context.requestId === requestId);
            if (index !== -1) {
                queue.splice(index, 1);
            }
        }
    }

    /**
     * Process batched requests for efficiency
     */
    private async processBatchedRequests(type: RequestType): Promise<void> {
        const queue = this.requestQueues.get(type);
        if (!queue || queue.length === 0) return;

        const config = this.debounceConfigs.get(type)!;
        const batchToProcess = queue.splice(0, config.batchSize);

        // Execute batched requests concurrently
        const batchPromises = batchToProcess.map(async (request) => {
            try {
                const result = await request.handler(request.params, request.context);
                request.resolve(result);
            } catch (error) {
                console.error(`[RequestDebouncer] Batched request failed for ${type}:`, error);
                request.reject(error);
            }
        });

        await Promise.allSettled(batchPromises);
    }

    /**
     * Update request statistics
     */
    private updateRequestStats(type: RequestType): void {
        const currentCount = this.requestCounts.get(type) || 0;
        this.requestCounts.set(type, currentCount + 1);
    }

    /**
     * Force execution of all pending requests (for shutdown or urgent scenarios)
     */
    async flushAllRequests(): Promise<void> {
        const allRequests = Array.from(this.pendingRequests.values());
        
        // Clear all timeouts
        allRequests.forEach(request => {
            if (request.timeoutId) {
                clearTimeout(request.timeoutId);
            }
        });

        // Execute all pending requests
        const executionPromises = allRequests.map(async (request) => {
            try {
                const result = await request.handler(request.params, request.context);
                request.resolve(result);
            } catch (error) {
                request.reject(error);
            }
        });

        await Promise.allSettled(executionPromises);
        
        // Clear all state
        this.pendingRequests.clear();
        this.requestQueues.clear();
    }

    /**
     * Get debouncing statistics for monitoring
     */
    getDebounceStats(): {
        pendingRequests: number;
        requestCounts: { [key: string]: number };
        queueSizes: { [key: string]: number };
        averageDelay: { [key: string]: number };
    } {
        const queueSizes: { [key: string]: number } = {};
        for (const [type, queue] of this.requestQueues) {
            queueSizes[type] = queue.length;
        }

        const requestCounts: { [key: string]: number } = {};
        for (const [type, count] of this.requestCounts) {
            requestCounts[type] = count;
        }

        const averageDelay: { [key: string]: number } = {};
        for (const [type, config] of this.debounceConfigs) {
            averageDelay[type] = config.delay;
        }

        return {
            pendingRequests: this.pendingRequests.size,
            requestCounts,
            queueSizes,
            averageDelay
        };
    }

    /**
     * Configure debouncing for a specific request type
     */
    configureDebouncing(type: RequestType, config: Partial<DebounceConfig>): void {
        const currentConfig = this.debounceConfigs.get(type);
        if (currentConfig) {
            this.debounceConfigs.set(type, { ...currentConfig, ...config });
        }
    }

    /**
     * Clear all pending requests for a specific document
     */
    clearDocumentRequests(documentUri: string): void {
        const requestsToCancel: string[] = [];
        
        for (const [requestId, request] of this.pendingRequests) {
            if (request.context.documentUri === documentUri) {
                requestsToCancel.push(requestId);
            }
        }
        
        requestsToCancel.forEach(requestId => {
            this.cancelPendingRequest(requestId);
        });
    }

    /**
     * Check if a request type should be debounced based on current load
     */
    shouldDebounce(type: RequestType): boolean {
        const queue = this.requestQueues.get(type);
        const queueSize = queue ? queue.length : 0;
        const config = this.debounceConfigs.get(type)!;
        
        // Don't debounce if queue is getting too large
        return queueSize < config.batchSize * 2;
    }
}

/**
 * Global debouncer instance
 */
export const globalDebouncer = new RequestDebouncer();

/**
 * R7.2: Convenience wrapper functions for common request types
 */
export const DebounceHelpers = {
    /**
     * Debounce diagnostics requests
     */
    diagnostics: <T, R>(params: T, handler: RequestHandler<T, R>, documentUri: string) => {
        return globalDebouncer.debounceRequest(
            RequestType.DIAGNOSTICS,
            params,
            handler,
            documentUri
        );
    },

    /**
     * Debounce hover requests
     */
    hover: <T, R>(params: T, handler: RequestHandler<T, R>, documentUri: string, position: Position) => {
        return globalDebouncer.debounceRequest(
            RequestType.HOVER,
            params,
            handler,
            documentUri,
            position
        );
    },

    /**
     * Debounce completion requests
     */
    completion: <T, R>(params: T, handler: RequestHandler<T, R>, documentUri: string, position: Position) => {
        return globalDebouncer.debounceRequest(
            RequestType.COMPLETION,
            params,
            handler,
            documentUri,
            position
        );
    },

    /**
     * Debounce signature help requests
     */
    signatureHelp: <T, R>(params: T, handler: RequestHandler<T, R>, documentUri: string, position: Position) => {
        return globalDebouncer.debounceRequest(
            RequestType.SIGNATURE_HELP,
            params,
            handler,
            documentUri,
            position
        );
    },

    /**
     * Debounce formatting requests
     */
    formatting: <T, R>(params: T, handler: RequestHandler<T, R>, documentUri: string) => {
        return globalDebouncer.debounceRequest(
            RequestType.FORMATTING,
            params,
            handler,
            documentUri
        );
    }
};