
// In your main server.ts

import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    // ... other imports
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { documentSymbolProvider, workspaceSymbolProvider, getDiagnostics } from './provider';
import { parsedDocumentCache } from './common';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// --- Wire up the providers ---

// Document Symbols (Outline View)
connection.onDocumentSymbol(documentSymbolProvider);

// Workspace Symbols (Ctrl+T)
connection.onWorkspaceSymbol(workspaceSymbolProvider);

// --- Wire up Diagnostics (Error Checking) ---

documents.onDidChangeContent(change => {
    // Clear the cache for the changed document so it gets re-parsed
    parsedDocumentCache.delete(change.document.uri);
    
    const diagnostics = getDiagnostics(change.document);
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
});

// Initial validation for open documents
documents.onDidOpen(event => {
    const diagnostics = getDiagnostics(event.document);
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics });
});

// Clean up cache on close
documents.onDidClose(event => {
    parsedDocumentCache.delete(event.document.uri);
});

documents.listen(connection);
connection.listen();
