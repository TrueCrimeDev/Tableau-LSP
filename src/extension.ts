import vscode from "vscode";

import { registerDocumentFormatting } from "./tableauFormat";
import { activate as activateTableauLsp, deactivate as deactivateTableauLsp } from "./tableauLsp";
import { setupTableau } from "./tableauSetup";
import TableauCodeLensProvider from "./tableauCodeLens";
import TableauDiagnosticsProvider from "./tableauDiagnosticsProvider";
import TableauValidationProvider from "./tableauValidationProvider";

export async function activate(context: vscode.ExtensionContext) {
    // Setup Tableau providers and status
    await setupTableau(context);

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
            deactivateTableauLsp();
            await activateTableauLsp(context);
            vscode.window.showInformationMessage("Tableau Language Server restarted");
        })
    );

    // Activate Tableau Language Server
    await activateTableauLsp(context);
}

export function deactivate() {
    deactivateTableauLsp();
}
