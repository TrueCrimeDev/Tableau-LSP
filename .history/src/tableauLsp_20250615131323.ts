import vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";

import { TableauProvider } from "./tableauProvider";

const TABLEAU_MODE = [
    { language: "twbl", scheme: "file" },
    { language: "twbl", scheme: "untitled" },
];

let outputChannel: vscode.LogOutputChannel;
let tableauProvider: TableauProvider | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // Create output channel for logging
    outputChannel = vscode.window.createOutputChannel("Tableau Language Server", { log: true });
    context.subscriptions.push(outputChannel);

    // Initialize Tableau provider for symbol information
    tableauProvider = new TableauProvider(context);
    await tableauProvider.initialize();

    // Start the LSP client
    startClient(context);
}

export async function deactivate(): Promise<void> {
    await stopClient();
    if (tableauProvider) {
        tableauProvider.dispose();
        tableauProvider = null;
    }
}

function startClient(context: vscode.ExtensionContext): void {
    try {
        // Use in-process language providers instead of external server
        // Register hover provider
        if (tableauProvider) {
            context.subscriptions.push(
                vscode.languages.registerHoverProvider(
                    TABLEAU_MODE,
                    tableauProvider
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
        }

        outputChannel.info('Tableau Language Server started successfully (in-process mode)');

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        outputChannel.error(`Failed to start Tableau Language Server: ${errorMessage}`);
        vscode.window.showErrorMessage(`Failed to start Tableau Language Server: ${errorMessage}`);
    }
}

async function stopClient(): Promise<void> {
    // Providers are disposed automatically when the extension context is disposed
    outputChannel.info('Tableau Language Server stopped successfully');
}

export function getTableauProvider(): TableauProvider | null {
    return tableauProvider;
}