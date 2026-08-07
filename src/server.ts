
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
import { format, formatRange, TableauFormattingOptions } from './format.js';
import { parseDocument } from './documentModel.js';
import { provideHover, HoverPerformanceAPI } from './hoverProvider.js';
import { buildSignatureHelp, SignaturePerformanceAPI } from './signatureProvider.js';
import { provideCompletion, CompletionPerformanceAPI } from './completionProvider.js';
import { provideSemanticTokens } from './semanticTokensProvider.js';
import { documentSymbolProvider, workspaceSymbolProvider, provideCodeActions, provideDefinition, provideReferences } from './provider.js';
import { parsedDocumentCache } from './common.js';
import { FieldParser } from './fieldParser.js';
import { discoverTableauLibrary } from './services/tableauWorkspaceFiles.js';
import { IncrementalParser } from './incrementalParser.js';
import { globalDebouncer, DebounceHelpers, RequestType } from './requestDebouncer.js';
import { globalMemoryManager, MemoryHelpers } from './memoryManager.js';
import {
    WORKBOOK_FIELD_CONTEXT_NOTIFICATION,
    WorkbookFieldContextNotification,
} from './services/fieldContextProtocol.js';

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
/** Set once the extension host publishes its own declaration-file list. */
let hostOwnsOverlays = false;
const fieldDefinitionPath = FieldParser.findDefinitionFile(__dirname);
if (fieldDefinitionPath) {
    fieldParser = new FieldParser(fieldDefinitionPath);
}

connection.onNotification(
    WORKBOOK_FIELD_CONTEXT_NOTIFICATION,
    (context: WorkbookFieldContextNotification) => {
        if (!fieldParser) {
            fieldParser = new FieldParser(null);
        }
        // From here on the extension host owns overlay resolution: only it can
        // see the user's configured folder names and which workspace folder is
        // active. The server's own bootstrap watcher must stop recomputing the
        // list or it would clobber this on the next file event.
        hostOwnsOverlays = true;
        fieldParser.setOverlayPaths(
            Array.isArray(context?.definitionPaths) ? context.definitionPaths : []
        );
        fieldParser.setRuntimeFields(
            Array.isArray(context?.fields) ? context.fields : [],
            Boolean(context?.workbook),
            Array.isArray(context?.datasourceFields)
                ? context.datasourceFields
                : (Array.isArray(context?.fields) ? context.fields : [])
        );
        CompletionPerformanceAPI.clearCache();
        HoverPerformanceAPI.clearCaches();
        for (const document of documents.all()) {
            if (shouldSkipDiagnostics(document.uri)) {
                continue;
            }
            const parsedDocument = IncrementalParser.parseDocumentIncremental(document);
            connection.sendDiagnostics({
                uri: document.uri,
                diagnostics: getDiagnostics(document, parsedDocument, fieldParser),
            });
        }
        connection.console.log(
            `[Server] Loaded ${context?.fields?.length ?? 0} workbook field definitions` +
            (context?.workbook ? ` from ${context.workbook}` : '')
        );
    }
);

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
 * Overlays every workspace `*.d.twbl` declaration file — the `tableau/` library
 * folder plus a root-level fields.d.twbl — on top of the bundled definitions,
 * and watches those locations so edits, or a file first appearing, are picked
 * up without a restart.
 *
 * This is the bootstrap for the window before the extension host publishes its
 * first workbook context; that notification then becomes authoritative, since
 * only the host can see the user's configured folder names.
 */
function setupWorkspaceFieldDefinitions(workspaceRootPaths: string[]): void {
    try {
        const fs = require('fs');
        const { CompletionPerformanceAPI } = require('./completionProvider');
        const { HoverPerformanceAPI } = require('./hoverProvider');

        const resolveOverlays = (): string[] =>
            discoverTableauLibrary(workspaceRootPaths).definitions;

        const applyOverlays = (): void => {
            const overlays = resolveOverlays();
            if (fieldParser) {
                fieldParser.setOverlayPaths(overlays);
            } else if (overlays.length) {
                // No bundled definitions found — use the workspace files directly.
                fieldParser = new FieldParser(overlays[0]);
                fieldParser.setOverlayPaths(overlays.slice(1));
            }
        };
        applyOverlays();

        let reloadTimer: ReturnType<typeof setTimeout> | undefined;
        const scheduleReload = (): void => {
            // fs.watch often fires multiple events per save — coalesce them.
            if (reloadTimer) {
                clearTimeout(reloadTimer);
            }
            reloadTimer = setTimeout(() => {
                try {
                    if (hostOwnsOverlays) {
                        // Re-read the files the host named; do not re-resolve
                        // which files those are. setOverlayPaths already
                        // refreshes, so this is the only pass needed.
                        fieldParser?.refresh();
                    } else {
                        applyOverlays();
                    }
                    CompletionPerformanceAPI.clearCache();
                    HoverPerformanceAPI.clearCaches();
                    connection.console.log('[Server] Reloaded workspace declaration files and cleared caches');
                } catch (e) {
                    connection.console.error('[Server] Failed to reload workspace declarations: ' + e);
                }
            }, 100);
        };

        // Watch each root (for a root-level or newly created tableau/ folder)
        // and each library folder that already exists. `recursive` is not
        // supported on every platform, so a failure per path is tolerated.
        const watched = new Set<string>();
        const onEvent = (_event: string, filename: string | null): void => {
            if (filename && !filename.toLowerCase().endsWith('.twbl')) {
                return;
            }
            scheduleReload();
        };
        const watch = (target: string, recursive: boolean): void => {
            if (watched.has(target)) {
                return;
            }
            watched.add(target);
            try {
                fs.watch(target, { persistent: false, recursive }, onEvent);
            } catch {
                // Recursive watching is not available on every platform (Linux
                // only gained it in Node 20). Fall back to a flat watch so at
                // least direct children of the library folder hot-reload; the
                // extension host's own watcher covers the rest by re-sending
                // definitionPaths.
                if (!recursive) {
                    return;
                }
                try {
                    fs.watch(target, { persistent: false }, onEvent);
                } catch {
                    // An unwatchable path just means no hot-reload from it.
                }
            }
        };
        for (const root of workspaceRootPaths) {
            watch(root, false);
        }
        for (const folder of discoverTableauLibrary(workspaceRootPaths).folders) {
            watch(folder, true);
        }
    } catch (e) {
        console.warn('[Server] Workspace field definitions disabled:', e);
    }
}

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

connection.onInitialize((params) => {
    const capabilities = params.capabilities;

    // Wire up the workspace declaration-file overlays across every root.
    try {
        const { fileURLToPath } = require('url');
        const rootUris = params.workspaceFolders?.length
            ? params.workspaceFolders.map(folder => folder.uri)
            : (params.rootUri ? [params.rootUri] : []);
        const roots = rootUris
            .filter((uri: string) => uri.startsWith('file:'))
            .map((uri: string) => fileURLToPath(uri) as string);
        if (roots.length) {
            setupWorkspaceFieldDefinitions(roots);
        }
    } catch (e) {
        console.warn('[Server] Could not resolve workspace roots for field definitions:', e);
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
            documentRangeFormattingProvider: true,
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
            const diagnostics = getDiagnostics(document, parsedDocument, fieldParser);
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
    const diagnostics = getDiagnostics(event.document, parsedDocument, fieldParser);
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
            return provideDefinition(params, document, fieldParser);
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


async function configuredFormattingOptions(
    uri: string,
    options: TableauFormattingOptions
): Promise<TableauFormattingOptions> {
    if (!hasConfigurationCapability) {
        return options;
    }
    try {
        const configured = await connection.workspace.getConfiguration({
            scopeUri: uri,
            section: 'tableau-language-support.formatting',
        }) as Partial<TableauFormattingOptions> | null;
        return configured ? { ...options, ...configured } : options;
    } catch (error) {
        connection.console.warn(`[Server] Could not read formatting settings: ${String(error)}`);
        return options;
    }
}

connection.onDocumentFormatting(async (params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }
    const options = await configuredFormattingOptions(document.uri, params.options);

    // R7.2: Debounce formatting requests (low priority)
    return DebounceHelpers.formatting(
        { document, options },
        async ({ document, options }) => {
            return format(document, options);
        },
        document.uri
    );
});

connection.onDocumentRangeFormatting(async (params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }
    const options = await configuredFormattingOptions(document.uri, params.options);
    return DebounceHelpers.formatting(
        { document, options, range: params.range },
        ({ document, options, range }) => formatRange(document, range, options),
        `${document.uri}#${String(params.range.start.line)}:${String(params.range.start.character)}-` +
            `${String(params.range.end.line)}:${String(params.range.end.character)}`
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
