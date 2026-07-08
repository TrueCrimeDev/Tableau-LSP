
import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    DidChangeConfigurationNotification,
    TextDocumentSyncKind,
    InitializeResult,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getDiagnostics } from './diagnosticsProvider.js';
import { format } from './format.js';
import { parseDocument } from './documentModel.js';
import { provideHover, HoverPerformanceAPI } from './hoverProvider.js';
import { buildSignatureHelp, SignaturePerformanceAPI } from './signatureProvider.js';
import { provideCompletion } from './completionProvider.js';
import { provideSemanticTokens } from './semanticTokensProvider.js';
import { documentSymbolProvider, workspaceSymbolProvider, provideCodeActions, provideDefinition, provideReferences } from './provider.js';
import { parsedDocumentCache } from './common.js';
import { FieldParser } from './fieldParser.js';
import { IncrementalParser } from './incrementalParser.js';
import { globalDebouncer, DebounceHelpers, RequestType } from './requestDebouncer.js';
import { globalMemoryManager, MemoryHelpers } from './memoryManager.js';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Helper function to check if a file should be excluded from diagnostics
function shouldSkipDiagnostics(uri: string): boolean {
    // Skip declaration files (*.d.twbl)
    if (uri.endsWith('.d.twbl')) {
        return true;
    }
    // Skip files in syntaxes/ directory
    if (uri.includes('/syntaxes/') || uri.includes('\\syntaxes\\')) {
        return true;
    }
    // Skip Tableau workbook files — they are XML, not formula text.
    // Running the formula parser over raw XML produces false positives on
    // field names, XML attribute values, and encoded field paths.
    if (uri.endsWith('.twb') || uri.endsWith('.twbx')) {
        return true;
    }
    return false;
}

let fieldParser: FieldParser | null = null;
const fieldDefinitionPath = FieldParser.findDefinitionFile(__dirname);
if (fieldDefinitionPath) {
    fieldParser = new FieldParser(fieldDefinitionPath);
}

// Optional: watch the field definition file for hot-reload
try {
    const fs = require('fs');
    const path = require('path');
    const { CompletionPerformanceAPI } = require('./completionProvider');
    const { HoverPerformanceAPI } = require('./hoverProvider');
    const watchPath = fieldDefinitionPath;
    if (watchPath && fs.existsSync(watchPath)) {
        fs.watch(watchPath, { persistent: false }, (eventType: string) => {
            if (eventType === 'change') {
                try {
                    fieldParser?.refresh();
                    // Clear completion and hover caches so updates reflect immediately
                    CompletionPerformanceAPI.clearCache();
                    HoverPerformanceAPI.clearCaches();
                    connection.console.log('[Server] Reloaded fields.d.twbl and cleared caches');
                } catch (e) {
                    connection.console.error('[Server] Failed to hot-reload fields.d.twbl: ' + e);
                }
            }
        });
    }
} catch (e) {
    // Ignore watcher errors in environments that lack fs.watch support
    console.warn('[Server] Field definition hot-reload disabled:', e);
}

/**
 * Overlays a workspace-level fields.d.twbl (generated from the Tableau Tools
 * sidebar) on top of the bundled definitions, and watches the workspace root
 * so edits — or the file first appearing — are picked up without a restart.
 */
function setupWorkspaceFieldDefinitions(workspaceRootPath: string): void {
    try {
        const fs = require('fs');
        const path = require('path');
        const { CompletionPerformanceAPI } = require('./completionProvider');
        const { HoverPerformanceAPI } = require('./hoverProvider');

        const overlayPath = path.join(workspaceRootPath, 'fields.d.twbl');

        if (fieldParser) {
            fieldParser.setOverlayPath(overlayPath);
        } else if (fs.existsSync(overlayPath)) {
            // No bundled definitions found — use the workspace file directly.
            fieldParser = new FieldParser(overlayPath);
        }

        let reloadTimer: ReturnType<typeof setTimeout> | undefined;
        fs.watch(workspaceRootPath, { persistent: false }, (_event: string, filename: string | null) => {
            if (filename !== 'fields.d.twbl') {
                return;
            }
            // fs.watch often fires multiple events per save — coalesce them.
            if (reloadTimer) {
                clearTimeout(reloadTimer);
            }
            reloadTimer = setTimeout(() => {
                try {
                    if (fieldParser) {
                        fieldParser.refresh();
                    } else if (fs.existsSync(overlayPath)) {
                        fieldParser = new FieldParser(overlayPath);
                    }
                    CompletionPerformanceAPI.clearCache();
                    HoverPerformanceAPI.clearCaches();
                    connection.console.log('[Server] Reloaded workspace fields.d.twbl and cleared caches');
                } catch (e) {
                    connection.console.error('[Server] Failed to reload workspace fields.d.twbl: ' + e);
                }
            }, 100);
        });
    } catch (e) {
        console.warn('[Server] Workspace field definitions disabled:', e);
    }
}

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

connection.onInitialize((params) => {
    const capabilities = params.capabilities;

    // Wire up the workspace-level fields.d.twbl overlay (first folder wins).
    try {
        const rootUri = params.workspaceFolders?.[0]?.uri;
        if (rootUri && rootUri.startsWith('file:')) {
            const { fileURLToPath } = require('url');
            setupWorkspaceFieldDefinitions(fileURLToPath(rootUri));
        }
    } catch (e) {
        console.warn('[Server] Could not resolve workspace root for field definitions:', e);
    }

    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            documentSymbolProvider: true,
            workspaceSymbolProvider: true,
            documentFormattingProvider: true,
            hoverProvider: true,
            codeActionProvider: true,
            definitionProvider: true,
            referencesProvider: true,
            completionProvider: {
                resolveProvider: false,
                triggerCharacters: ['.', '[', '(', ' ', '\t']
            },
            semanticTokensProvider: {
                legend: {
                    tokenTypes: ['keyword', 'function', 'variable', 'constant', 'operator', 'string', 'comment'],
                    tokenModifiers: []
                },
                full: true,
                range: false
            },
            signatureHelpProvider: {
                // R3.1: Comprehensive trigger characters for Tableau expressions
                triggerCharacters: [
                    ' ', '\t', '\n',    // Whitespace
                    '(', ')', ',',      // Function calls
                    'N', 'E',          // 'THEN', 'ELSE' completion
                    'F'                // 'ELSEIF' completion
                ]
            },
        },
    };

    return result;
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders((_event) => {
            connection.console.log('Workspace folder change event received.');
        });
    }
});

documents.onDidChangeContent((change) => {
    // Drop stale hover/signature symbol-index caches for this document version;
    // they were previously TTL-only and could serve results computed against
    // superseded document content for up to SYMBOL_INDEX_TTL_MS.
    HoverPerformanceAPI.invalidateDocument(change.document.uri);
    SignaturePerformanceAPI.invalidateDocument(change.document.uri);

    // Skip diagnostics for declaration files
    if (shouldSkipDiagnostics(change.document.uri)) {
        connection.sendDiagnostics({ uri: change.document.uri, diagnostics: [] });
        return;
    }

    // R7.2: Use debounced diagnostics for rapid typing scenarios
    DebounceHelpers.diagnostics(
        change.document,
        async (document) => {
            // Use incremental parsing for better performance
            const parsedDocument = IncrementalParser.parseDocumentIncremental(document);
            const diagnostics = getDiagnostics(document, parsedDocument);
            connection.sendDiagnostics({ uri: document.uri, diagnostics });
            return diagnostics;
        },
        change.document.uri
    ).catch(error => {
        console.error('[Server] Debounced diagnostics failed:', error);
    });
});

// Enhanced document lifecycle handlers with incremental parsing
documents.onDidOpen((event) => {
    // R7.3: Mark document as active for memory management
    globalMemoryManager.markDocumentActive(event.document.uri);

    // Skip diagnostics for declaration files
    if (shouldSkipDiagnostics(event.document.uri)) {
        connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
        return;
    }

    // R7.2: Immediate diagnostics for document open (critical priority)
    const parsedDocument = IncrementalParser.parseDocumentIncremental(event.document);
    const diagnostics = getDiagnostics(event.document, parsedDocument);
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics });
});

// Clean up cache and pending requests on document close
documents.onDidClose((event) => {
    // R7.3: Mark document as inactive and clean up memory
    globalMemoryManager.markDocumentInactive(event.document.uri);
    
    IncrementalParser.clearDocumentCache(event.document.uri);
    // R7.2: Clear any pending debounced requests for the closed document
    globalDebouncer.clearDocumentRequests(event.document.uri);
    HoverPerformanceAPI.invalidateDocument(event.document.uri);
    SignaturePerformanceAPI.invalidateDocument(event.document.uri);
});

// R7.2: Debounce document and workspace symbol requests
connection.onDocumentSymbol((params, token) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    
    return globalDebouncer.debounceRequest(
        RequestType.DOCUMENT_SYMBOLS,
        { params, document },
        async ({ params, document }) => {
            return documentSymbolProvider(params, token, document);
        },
        document.uri
    );
});

connection.onWorkspaceSymbol((params, token) => {
    return globalDebouncer.debounceRequest(
        RequestType.WORKSPACE_SYMBOLS,
        { params },
        async ({ params }) => {
            return workspaceSymbolProvider(params, token);
        },
        'workspace'
    );
});

// Register code action, definition, and reference providers with debouncing
connection.onCodeAction((params, token) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    
    // R7.2: Debounce code action requests
    return globalDebouncer.debounceRequest(
        RequestType.CODE_ACTIONS,
        { params, document },
        async ({ params, document }) => {
            return provideCodeActions(params, document);
        },
        document.uri,
        params.range.start,
        params.range
    );
});

connection.onDefinition((params, token) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    
    // R7.2: Debounce definition requests
    return globalDebouncer.debounceRequest(
        RequestType.DEFINITION,
        { params, document },
        async ({ params, document }) => {
            return provideDefinition(params, document);
        },
        document.uri,
        params.position
    );
});

connection.onReferences((params, token) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    
    // R7.2: Debounce reference requests
    return globalDebouncer.debounceRequest(
        RequestType.REFERENCES,
        { params, document },
        async ({ params, document }) => {
            return provideReferences(params, document);
        },
        document.uri,
        params.position
    );
});

connection.onSignatureHelp((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    // R7.2: Debounce signature help requests for better performance
    return DebounceHelpers.signatureHelp(
        { document, position: params.position },
        async ({ document, position }) => {
            const parsed = parsedDocumentCache.get(document.uri);
            if (!parsed) return null;
            return buildSignatureHelp(document, position, parsed);
        },
        document.uri,
        params.position
    );
});

connection.onCompletion((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    // R7.3: Track document access for memory management
    globalMemoryManager.markDocumentAccessed(document.uri);

    // R7.2: Debounce completion requests for rapid typing scenarios
    return DebounceHelpers.completion(
        { params, document, fieldParser },
        async ({ params, document, fieldParser }) => {
            const parsed = parsedDocumentCache.get(document.uri);
            if (!parsed) return null;
            return provideCompletion(params, document, parsed, fieldParser);
        },
        document.uri,
        params.position
    );
});

connection.languages.semanticTokens.on((params, token) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return { data: [] };

    // R7.2: Debounce semantic tokens requests (low priority)
    return globalDebouncer.debounceRequest(
        RequestType.SEMANTIC_TOKENS,
        { document },
        async ({ document }) => {
            const parsed = parsedDocumentCache.get(document.uri);
            if (!parsed) return { data: [] };
            return provideSemanticTokens(document, parsed);
        },
        document.uri
    );
});

connection.onHover((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return null;
    }
    
    // R7.3: Track document access for memory management
    globalMemoryManager.markDocumentAccessed(document.uri);
    
    // R7.2: Debounce hover requests for better performance
    return DebounceHelpers.hover(
        { params, document, fieldParser },
        async ({ params, document, fieldParser }) => {
            return provideHover(params, document, fieldParser);
        },
        document.uri,
        params.position
    );
});


connection.onDocumentFormatting((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }
    
    // R7.2: Debounce formatting requests (low priority)
    return DebounceHelpers.formatting(
        { document, options: params.options },
        async ({ document, options }) => {
            return format(document, options);
        },
        document.uri
    );
});

// R7.2: Handle graceful shutdown with request flushing
connection.onShutdown(async () => {
    console.log('[Server] Shutting down - flushing pending requests...');
    await globalDebouncer.flushAllRequests();
    console.log('[Server] All pending requests flushed.');
    
    // R7.3: Shutdown memory manager
    globalMemoryManager.shutdown();
    console.log('[Server] Memory manager shutdown completed.');
});

// R7.2: Add periodic stats logging for monitoring
setInterval(() => {
    const stats = globalDebouncer.getDebounceStats();
    if (stats.pendingRequests > 0) {
        console.log('[RequestDebouncer] Stats:', JSON.stringify(stats, null, 2));
    }
}, 30000); // Log every 30 seconds if there are pending requests

// R7.3: Add periodic memory monitoring and logging
setInterval(() => {
    const memoryStats = globalMemoryManager.getMemoryStats();
    const healthStatus = globalMemoryManager.getMemoryHealthStatus();
    
    if (healthStatus.status !== 'healthy') {
        console.log('[MemoryManager] Memory Status:', {
            status: healthStatus.status,
            used: `${memoryStats.usedMemoryMB.toFixed(1)}MB`,
            cache: `${memoryStats.cacheMemoryMB.toFixed(1)}MB`,
            documents: memoryStats.documentsInCache,
            largestDoc: `${memoryStats.largestDocumentMB.toFixed(1)}MB`,
            exceedingLimit: memoryStats.documentsExceedingLimit,
            avgDocSize: `${memoryStats.averageDocumentSizeMB.toFixed(1)}MB`,
            recommendation: healthStatus.recommendation
        });
        
        // R1.5: Handle documents exceeding 50MB limit
        if (memoryStats.documentsExceedingLimit > 0) {
            console.warn(`[MemoryManager] ${memoryStats.documentsExceedingLimit} documents exceed 50MB limit`);
            const exceedingDocs = globalMemoryManager.getDocumentsExceedingLimit();
            exceedingDocs.forEach(doc => {
                console.warn(`[MemoryManager] Large document: ${doc.uri} (${doc.sizeMB.toFixed(1)}MB)`);
            });
        }
    }
}, 60000); // Log every minute if memory status is not healthy

documents.listen(connection);
connection.listen();
