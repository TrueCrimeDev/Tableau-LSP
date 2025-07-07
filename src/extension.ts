import { ExtensionContext, commands, window, languages } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { SlashCommandProvider } from './slashCommandProvider';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
    const serverModule = context.asAbsolutePath('out/server.js');

    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
        },
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'twbl' }],
    };

    client = new LanguageClient(
        'tableauLanguageServer',
        'Tableau Language Server',
        serverOptions,
        clientOptions
    );

    // Register the insert snippet command
    const insertSnippetCommand = commands.registerCommand('tableau.insertSnippet', async () => {
        const editor = window.activeTextEditor;
        if (!editor) {
            window.showErrorMessage('No active editor found');
            return;
        }

        // Check if the current document is a Tableau file
        if (editor.document.languageId !== 'twbl') {
            window.showErrorMessage('This command can only be used in Tableau calculation files (.twbl)');
            return;
        }

        // Execute the built-in insert snippet command which will show the snippet picker
        try {
            await commands.executeCommand('editor.action.insertSnippet');
        } catch (error) {
            window.showErrorMessage('Failed to open snippet picker: ' + error);
        }
    });

    // Register the slash command completion provider
    const slashCommandProvider = new SlashCommandProvider();
    const slashCommandDisposable = languages.registerCompletionItemProvider(
        { scheme: 'file', language: 'twbl' },
        slashCommandProvider,
        '/' // Trigger character
    );

    // Add all disposables to the context subscriptions
    context.subscriptions.push(insertSnippetCommand, slashCommandDisposable);

    client.start();
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
