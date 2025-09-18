
import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    DidChangeConfigurationNotification,
    TextDocumentSyncKind,
    InitializeResult,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getDiagnostics } from './diagnosticsProvider';
import { format } from './format';
import { parseDocument } from './documentModel';
import { provideHover } from './hoverProvider';
import { buildSignatureHelp } from './signatureProvider';
import { provideCompletion } from './completionProvider';
import { provideSemanticTokens } from './semanticTokensProvider';
import { documentSymbolProvider, workspaceSymbolProvider, provideCodeActions, provideDefinition, provideReferences } from './provider';
import { parsedDocumentCache } from './common';
import { FieldParser } from './fieldParser';
import { IncrementalParser } from './incrementalParser';
import { globalDebouncer, DebounceHelpers, RequestType } from './requestDebouncer';
import { globalMemoryManager, MemoryHelpers } from './memoryManager';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let fieldParser: FieldParser | null = null;
const fieldDefinitionPath = FieldParser.findDefinitionFile(__dirname);
if (fieldDefinitionPath) {
    fieldParser = new FieldParser(fieldDefinitionPath);
}

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

connection.onInitialize((params) => {
    const capabilities = params.capabilities;

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
});

// R7.2: Debounce document and workspace symbol requests
connection.onDocumentSymbol((params, token) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    
    return globalDebouncer.debounceRequest(
        RequestType.DOCUMENT_SYMBOLS,
        { params, document },
        async ({ params, document }) => {
            return documentSymbolProvider(params, token);
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
