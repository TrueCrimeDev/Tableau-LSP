import vscode from "vscode";

import { registerDocumentFormatting } from "./tableauFormat";
import { setupTableau, tableauProvider } from "./tableauSetup";
import { TableauHoverProvider } from "./tableauHoverProvider";
import TableauCodeLensProvider from "./tableauCodeLens";
import TableauDiagnosticsProvider from "./tableauDiagnosticsProvider";
import TableauValidationProvider from "./tableauValidationProvider";

// Import test runner
const testRunner = require("../test-runner");

const TABLEAU_MODE = [
    { language: "twbl", scheme: "file" },
    { language: "twbl", scheme: "untitled" },
];

let outputChannel: vscode.LogOutputChannel;
let disposables: vscode.Disposable[] = [];

export async function activate(context: vscode.ExtensionContext) {
    // Create output channel for logging
    outputChannel = vscode.window.createOutputChannel("Tableau Language Server", { log: true });
    context.subscriptions.push(outputChannel);

    // Setup Tableau providers and status (creates single TableauProvider instance)
    await setupTableau(context);

    // Register ALL language providers using the single TableauProvider instance
    if (tableauProvider) {
        // Register enhanced hover provider
        const hoverProvider = new TableauHoverProvider(tableauProvider);
        disposables.push(
            vscode.languages.registerHoverProvider(TABLEAU_MODE, hoverProvider)
        );

        // Register completion provider  
        disposables.push(
            vscode.languages.registerCompletionItemProvider(
                TABLEAU_MODE, 
                tableauProvider, 
                '(', ',', ' '
            )
        );

        // Register definition provider
        disposables.push(
            vscode.languages.registerDefinitionProvider(TABLEAU_MODE, tableauProvider)
        );

        // Register document symbol provider
        disposables.push(
            vscode.languages.registerDocumentSymbolProvider(TABLEAU_MODE, tableauProvider)
        );

        // Register signature help provider
        disposables.push(
            vscode.languages.registerSignatureHelpProvider(
                TABLEAU_MODE, 
                tableauProvider, 
                '(', ','
            )
        );

        // Register semantic tokens provider (CRITICAL - was missing!)
        disposables.push(
            vscode.languages.registerDocumentSemanticTokensProvider(
                TABLEAU_MODE, 
                tableauProvider, 
                tableauProvider.getSemanticTokensLegend()
            )
        );

        // Register document formatting provider (CRITICAL - was missing!)
        disposables.push(
            vscode.languages.registerDocumentFormattingEditProvider(
                TABLEAU_MODE, 
                tableauProvider
            )
        );

        // Add all provider disposables to context
        context.subscriptions.push(...disposables);

        outputChannel.info('Tableau Language Server started successfully (consolidated architecture)');
    } else {
        outputChannel.error('Failed to initialize TableauProvider');
        throw new Error('Failed to initialize TableauProvider');
    }

    // Initialize Tableau diagnostics provider
    const diagnosticsProvider = new TableauDiagnosticsProvider();
    diagnosticsProvider.activate(context.subscriptions);

    // Initialize validation provider
    const validationProvider = new TableauValidationProvider();
    validationProvider.activate(context.subscriptions);

    // Register formatting provider
    context.subscriptions.push(registerDocumentFormatting());

    // Register code lens provider
    TableauCodeLensProvider.registerCommands(context);
    const codeLensProvider = new TableauCodeLensProvider();
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { language: "twbl", scheme: "file" },
            codeLensProvider
        )
    );

    // Listen for configuration changes to refresh code lenses
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('tableau.codeLens')) {
                // Trigger refresh of code lenses
                codeLensProvider.refresh();
            }
        })
    );

    // Register restart command
    context.subscriptions.push(
        vscode.commands.registerCommand("tableau.lsp.restart", async () => {
            // Dispose current providers
            disposables.forEach(d => d.dispose());
            disposables = [];
            
            // Re-initialize
            await tableauProvider?.initialize();
            vscode.window.showInformationMessage("Tableau Language Server restarted");
        })
    );
    
    // Register test command
    testRunner.activate(context);
}

export function deactivate() {
    // Dispose all provider registrations
    disposables.forEach(d => d.dispose());
    disposables = [];
    
    // Dispose tableau provider
    if (tableauProvider) {
        tableauProvider.dispose();
    }
    
    outputChannel?.info('Tableau Language Server deactivated');
}
