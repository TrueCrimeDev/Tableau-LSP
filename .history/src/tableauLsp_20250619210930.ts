import vscode from "vscode";

import { TableauProvider } from "./tableauProvider";
import { TableauHoverProvider } from "./tableauHoverProvider";
import { TableauDocumentManager } from "./tableauDocumentModel";

const TABLEAU_MODE = [
    { language: "twbl", scheme: "file" },
    { language: "twbl", scheme: "untitled" },
];

let outputChannel: vscode.LogOutputChannel;
let tableauProvider: TableauProvider | null = null;
let hoverProvider: TableauHoverProvider | null = null;
let documentManager: TableauDocumentManager;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // Create output channel for logging
    outputChannel = vscode.window.createOutputChannel("Tableau Language Server", { log: true });
    context.subscriptions.push(outputChannel);

    // Initialize document manager
    documentManager = TableauDocumentManager.getInstance();

    // Initialize Tableau provider for symbol information
    tableauProvider = new TableauProvider(context);
    await tableauProvider.initialize();

    // Initialize enhanced hover provider
    hoverProvider = new TableauHoverProvider(tableauProvider);

    // Start the LSP client
    startClient(context);

    // Register document change handlers
    registerDocumentHandlers(context);
}

export function deactivate(): void {
    stopClient();
    if (tableauProvider) {
        tableauProvider.dispose();
        tableauProvider = null;
    }
    hoverProvider = null;
}

function startClient(context: vscode.ExtensionContext): void {
    try {
        // Use in-process language providers instead of external server
        if (tableauProvider) {
            // Register enhanced hover provider
            context.subscriptions.push(
                vscode.languages.registerHoverProvider(
                    TABLEAU_MODE,
                    hoverProvider!
                )
            );

            // Register completion provider
            context.subscriptions.push(
                vscode.languages.registerCompletionItemProvider(
                    TABLEAU_MODE,
                    tableauProvider,
                    '(', ',', ' '
                )
            );

            // Register definition provider
            context.subscriptions.push(
                vscode.languages.registerDefinitionProvider(
                    TABLEAU_MODE,
                    tableauProvider
                )
            );

            // Register document symbol provider
            context.subscriptions.push(
                vscode.languages.registerDocumentSymbolProvider(
                    TABLEAU_MODE,
                    tableauProvider
                )
            );

            // Register signature help provider
            context.subscriptions.push(
                vscode.languages.registerSignatureHelpProvider(
                    TABLEAU_MODE,
                    tableauProvider,
                    '(', ','
                )
            );
        }

        outputChannel.info('Tableau Language Server started successfully (in-process mode)');

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        outputChannel.error(`Failed to start Tableau Language Server: ${errorMessage}`);
        vscode.window.showErrorMessage(`Failed to start Tableau Language Server: ${errorMessage}`);
    }
}

/**
 * Register document change handlers to keep document models up to date
 */
function registerDocumentHandlers(context: vscode.ExtensionContext): void {
    // Handle document changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.languageId === 'twbl') {
                // Mark document as dirty in document manager
                documentManager.markDocumentDirty(event.document);
                
                // Clear hover cache
                if (hoverProvider) {
                    hoverProvider.clearCache(event.document);
                }
            }
        })
    );
    
    // Handle document open
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(document => {
            if (document.languageId === 'twbl') {
                // Create document model
                documentManager.getDocumentModel(document);
            }
        })
    );
    
    // Handle document close
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(document => {
            if (document.languageId === 'twbl') {
                // Remove document model
                documentManager.removeDocumentModel(document);
            }
        })
    );
}

function stopClient(): void {
    // Providers are disposed automatically when the extension context is disposed
    outputChannel.info('Tableau Language Server stopped successfully');
}

export function getTableauProvider(): TableauProvider | null {
    return tableauProvider;
}