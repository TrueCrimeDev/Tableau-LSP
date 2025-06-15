import vscode from "vscode";
import { TableauProvider } from "./tableauProvider";

let statusItem: vscode.StatusBarItem;
let languageStatusItem: vscode.LanguageStatusItem;
export let tableauProvider: TableauProvider;

export async function setupTableau(context: vscode.ExtensionContext): Promise<void> {
    // Initialize Tableau provider
    tableauProvider = new TableauProvider(context);
    await tableauProvider.initialize();

    // Create status bar item
    statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusItem.text = "$(symbol-function) Tableau";
    statusItem.tooltip = "Tableau Language Server";
    statusItem.command = "tableau.lsp.restart";
    statusItem.show();
    context.subscriptions.push(statusItem);

    // Create language status item
    languageStatusItem = vscode.languages.createLanguageStatusItem(
        "tableau.status",
        [{ language: "twbl" }]
    );
    languageStatusItem.name = "Tableau";
    languageStatusItem.text = "Ready";
    languageStatusItem.detail = "Tableau Language Server is active";
    context.subscriptions.push(languageStatusItem);

    // Monitor configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("tableau")) {
                updateStatusItems();
            }
        })
    );

    updateStatusItems();
}

function updateStatusItems(): void {
    const config = vscode.workspace.getConfiguration("tableau");
    const symbolCount = tableauProvider.getAllSymbols().length || 0;
    
    // Update status bar
    statusItem.text = `$(symbol-function) Tableau (${symbolCount} symbols)`;
    
    // Update language status
    if (config.get("enableHover") && config.get("enableCompletion")) {
        languageStatusItem.text = "Ready";
        languageStatusItem.detail = `${symbolCount} functions loaded`;
        languageStatusItem.severity = vscode.LanguageStatusSeverity.Information;
    } else {
        languageStatusItem.text = "Partial";
        languageStatusItem.detail = "Some features disabled in settings";
        languageStatusItem.severity = vscode.LanguageStatusSeverity.Warning;
    }
}