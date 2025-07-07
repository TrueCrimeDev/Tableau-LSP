
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
            signatureHelpProvider: {
                triggerCharacters: [' ', '\t', '\n', ')', ',']
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
