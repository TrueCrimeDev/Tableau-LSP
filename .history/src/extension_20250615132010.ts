import vscode from "vscode";

import TableauCodeLensProvider from "./tableauCodeLens";
import TableauDiagnosticsProvider from "./tableauDiagnosticsProvider";
import { registerDocumentFormatting } from "./tableauFormat";
import { activate as activateTableauLsp, deactivate as deactivateTableauLsp } from "./tableauLsp";
import { setupTableau } from "./tableauSetup";
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
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { language: "twbl", scheme: "file" },
            new TableauCodeLensProvider()
        )
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
