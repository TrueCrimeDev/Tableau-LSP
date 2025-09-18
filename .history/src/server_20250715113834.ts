
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
    // R1.1: Clear cache first to ensure fresh parsing
    parsedDocumentCache.delete(change.document.uri);
    
    const parsedDocument = parseDocument(change.document);
    parsedDocumentCache.set(change.document.uri, {
        document: change.document,
        ...parsedDocument,
    });
    const diagnostics = getDiagnostics(change.document, {
        document: change.document,
        ...parsedDocument,
    });
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
});

// R1.1: Add document lifecycle handlers for proper cache management
documents.onDidOpen((event) => {
    // Clear any stale cache and send initial diagnostics
    parsedDocumentCache.delete(event.document.uri);
    
    const parsedDocument = parseDocument(event.document);
    parsedDocumentCache.set(event.document.uri, {
        document: event.document,
        ...parsedDocument,
    });
    const diagnostics = getDiagnostics(event.document, {
        document: event.document,
        ...parsedDocument,
    });
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics });
});

// R1.1: Clean up cache on document close
documents.onDidClose((event) => {
    parsedDocumentCache.delete(event.document.uri);
});

connection.onDocumentSymbol(documentSymbolProvider);
connection.onWorkspaceSymbol(workspaceSymbolProvider);

// Register code action, definition, and reference providers
connection.onCodeAction((params, token) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    return provideCodeActions(params, document);
});
connection.onDefinition((params, token) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    return provideDefinition(params, document);
});
connection.onReferences((params, token) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    return provideReferences(params, document);
});

connection.onSignatureHelp((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const parsed = parsedDocumentCache.get(document.uri);
    if (!parsed) return null;

    return buildSignatureHelp(document, params.position, parsed);
});

connection.onCompletion((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const parsed = parsedDocumentCache.get(document.uri);
    if (!parsed) return null;

    return provideCompletion(params, document, parsed, fieldParser);
});

connection.languages.semanticTokens.on((params, token) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return { data: [] };

    const parsed = parsedDocumentCache.get(document.uri);
    if (!parsed) return { data: [] };

    return provideSemanticTokens(document, parsed);
});

connection.onHover((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return null;
    }
    return provideHover(params, document, fieldParser);
});


connection.onDocumentFormatting((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }
    return format(document, params.options);
});

documents.listen(connection);
connection.listen();
