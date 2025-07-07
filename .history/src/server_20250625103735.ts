import {
    createConnection,
    ProposedFeatures,
    TextDocuments,
    InitializeParams,
    DidChangeConfigurationNotification,
    TextDocumentSyncKind,
    InitializeResult,
    Diagnostic
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { Lexer, TokenType } from './lexer';
import * as l10n from './tableauLcalizer';

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// --- Configuration and Cache Management ---

interface TableauServerSettings {
    maxNumberOfProblems: number;
    // Add other Tableau-specific settings here
    // e.g., linting rules, formatting options
}

// The global settings, used when the client doesn't provide them.
const defaultSettings: TableauServerSettings = { maxNumberOfProblems: 100 };
let globalSettings: TableauServerSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<TableauServerSettings>> = new Map();

// --- Server Lifecycle Events ---

connection.onInitialize((params: InitializeParams) => {
    l10n.initLocalize(); // Initialize our localization strings

    const capabilities = params.capabilities;

    // Does the client support the `workspace/configuration` request?
    // If not, we fall back to global settings.
    const hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            // Tell the client that the server supports code completion.
            completionProvider: {
                resolveProvider: true,
            },
            // Add other capabilities like hover, signature help, etc. as you implement them
        },
    };

    if (hasConfigurationCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true,
            },
        };
    }

    return result;
});

connection.onInitialized(() => {
    // Register for all configuration changes.
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
});


// --- Document and Settings Management ---

documents.onDidClose(e => {
    // Only keep settings for open documents
    documentSettings.delete(e.document.uri);
});

documents.onDidChangeContent(change => {
    validateTextDocument(change.document);
});

function getDocumentSettings(resource: string): Thenable<TableauServerSettings> {
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'tableau', // The section name in VS Code settings (e.g., "tableau.maxNumberOfProblems")
        });
        documentSettings.set(resource, result);
    }
    return result;
}

connection.onDidChangeConfiguration(change => {
    // Reset all cached document settings
    documentSettings.clear();

    // Revalidate all open text documents
    documents.all().forEach(validateTextDocument);
});


// --- Core Validation Logic ---

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
    const settings = await getDocumentSettings(textDocument.uri);
    const text = textDocument.getText();
    const lexer = new Lexer(text);
    
    let problems = 0;
    const diagnostics: Diagnostic[] = [];

    let token;
    while ((token = lexer.getNextToken()) && token.type !== TokenType.EOF) {
        if (problems >= (settings.maxNumberOfProblems || 100)) {
            break;
        }

        if (token.type === TokenType.Unexpected) {
            problems++;
            const diagnostic: Diagnostic = {
                severity: 1, // Error
                range: {
                    start: textDocument.positionAt(token.start),
                    end: textDocument.positionAt(token.end),
                },
                message: getLexerErrorMessage(token.value),
                source: 'twbl',
            };
            diagnostics.push(diagnostic);
        }
    }

    // Send the computed diagnostics to VS Code.
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

/**
 * Generates a localized error message based on the invalid token's content.
 * @param value The raw string value of the unexpected token.
 */
function getLexerErrorMessage(value: string): string {
    if (value.startsWith('[') && !value.endsWith(']')) {
        return l10n.diagnostic.unterminatedFieldRef();
    }
    if ((value.startsWith("'") && !value.endsWith("'")) || (value.startsWith('"') && !value.endsWith('"'))) {
        return l10n.diagnostic.unterminatedString(value[0]);
    }
    return l10n.diagnostic.unexpectedCharacter(value);
}


// --- Completion Provider (Example) ---

connection.onCompletion(
	(_textDocumentPosition) => {
		// This is where you would provide completion items.
        // For now, let's just return a few from our localizer.
		return [
			{
				label: 'SUM',
				kind: 1, // Function
				documentation: l10n.completionitem.sum(),
			},
			{
				label: 'IF',
				kind: 2, // Keyword
				documentation: l10n.completionitem.if(),
			},
            {
                label: 'FIXED',
                kind: 2, // Keyword
                documentation: l10n.completionitem.fixed(),
            }
		];
	}
);

connection.onCompletionResolve(
	(item) => {
        // Here you can add more details to a completion item if needed
		return item;
	}
);


// --- Final Setup ---

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();