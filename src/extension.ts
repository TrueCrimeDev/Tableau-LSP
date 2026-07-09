import { ExtensionContext, ExtensionMode, commands, window, languages, workspace, env, Uri, ProgressLocation, debug, tasks, Task, TaskExecution, extensions, TextDocument } from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { SlashCommandProvider } from './slashCommandProvider.js';
import { ActivationManager } from './activation/activationManager.js';
import { extractCalculationsPythonCommand } from './commands/extractCalculationsPython.js';
import { registerFormattingPanel } from './views/formattingPanel.js';
import { registerTableauChatParticipant } from './chat/tableauChatParticipant.js';
import { registerFieldSwapFeature } from './providers/fieldSwapHover.js';
import { CalcCopyCodeLensProvider, COPY_CALC_BLOCK_COMMAND } from './calcCopyLens.js';
import { registerRunTestsCommand } from './commands/runTests.js';

let client: LanguageClient | undefined;
let activationManager: ActivationManager;

/**
 * R10.1: Robust Extension Activation
 * 
 * Main extension entry point with comprehensive error handling,
 * graceful degradation, and recovery mechanisms.
 */

export async function activate(context: ExtensionContext): Promise<void> {
    console.log('Tableau LSP: Extension activation started');

    // Registered unconditionally, before anything below that could throw, so these
    // always resolve to a real command instead of "command not found" whenever
    // activation happens to succeed (registerBasicFunctionality previously only
    // ran from the catch block below, i.e. only when activation had already failed).
    registerBasicFunctionality(context);

    // Register before any awaits: chat requests must not hang behind the
    // conflicting-extension warning or language-server startup.
    registerTableauChatParticipant(context);

    try {
        await warnIfConflictingExtensionInstalled();

        // Initialize activation manager
        activationManager = ActivationManager.getInstance();

        // Perform robust activation
        const result = await activationManager.activate(context);

        // Store client reference if language server started successfully
        if (result.client) {
            client = result.client;
        }

        // Register additional components that don't require language server
        await registerAdditionalComponents(context);

        // Register restart command
        const restartCommand = commands.registerCommand('tableau-language-support.lsp.restart', async () => {
            await restartExtension(context);
        });

        context.subscriptions.push(restartCommand);

        // Development-only tooling: these assume a source checkout (an "npm: compile"
        // task, a "Run Extension (VS Code)" debug config, `npm run test:*` scripts) that
        // does not exist in a packaged/installed extension, so they only make sense
        // inside the extension's own Extension Development Host.
        if (context.extensionMode !== ExtensionMode.Production) {
            const compileAndReloadCommand = commands.registerCommand('tableau-language-support.compileAndReload', async () => {
                try {
                    await window.withProgress(
                        {
                            location: ProgressLocation.Notification,
                            title: 'Compiling and reloading Tableau Language Support...'
                        },
                        async () => {
                            const compileTask = await findCompileTask();
                            if (!compileTask) {
                                throw new Error('Unable to find the "npm: compile" task. Run it once from Tasks > Run Task to generate it.');
                            }

                            const execution = await tasks.executeTask(compileTask);
                            await waitForTaskCompletion(execution);
                            await restartDebuggerSession();
                        }
                    );
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    window.showErrorMessage(`Compile and reload failed: ${errorMessage}`);
                }
            });

            context.subscriptions.push(compileAndReloadCommand);
            registerRunTestsCommand(context);
        }

        console.log('Tableau LSP: Extension activation completed successfully');

    } catch (error) {
        console.error('Tableau LSP: Critical activation error:', error);

        // Show error to user but don't crash
        const errorMessage = error instanceof Error ? error.message : String(error);
        window.showErrorMessage(`Tableau Language Support activation failed: ${errorMessage}`);

        // registerBasicFunctionality already ran unconditionally above; nothing further
        // to register here.
    }
}

async function warnIfConflictingExtensionInstalled(): Promise<void> {
    const conflictingExtensionId = 'TrueCrimeDev.tableau-lsp';
    const conflictingExtension = extensions.getExtension(conflictingExtensionId);
    if (!conflictingExtension) {
        return;
    }

    const action = await window.showWarningMessage(
        'Another Tableau extension is installed (TrueCrimeDev.tableau-lsp). It can conflict with this extension. Uninstall or disable the duplicate extension.',
        'Open Extensions'
    );

    if (action === 'Open Extensions') {
        await commands.executeCommand('workbench.extensions.search', '@installed tableau');
    }
}

/**
 * Register additional components that enhance the extension
 */
async function registerAdditionalComponents(context: ExtensionContext): Promise<void> {
    try {
        await ensureOpenWorkbookDocsUseTwbLanguage();
        const twbLanguageOnOpen = workspace.onDidOpenTextDocument((document) => {
            void ensureWorkbookDocUsesTwbLanguage(document);
        });
        const twbLanguageOnFocus = window.onDidChangeActiveTextEditor((editor) => {
            if (!editor) {
                return;
            }
            void ensureWorkbookDocUsesTwbLanguage(editor.document);
        });

        // Register the insert snippet command
        const insertSnippetCommand = commands.registerCommand('tableau-language-support.insertSnippet', async () => {
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

        // Add disposables to context subscriptions
        context.subscriptions.push(
            insertSnippetCommand,
            slashCommandDisposable,
            twbLanguageOnOpen,
            twbLanguageOnFocus
        );

        // Extraction feature commands (lazy-load modules when invoked)
        // Extraction + related viewer commands temporarily removed for beta hard reset.

        // Python-style extraction command (new implementation)
        const extractPythonCommand = commands.registerCommand(
            'tableau-lsp.extractCalculationsPython',
            extractCalculationsPythonCommand
        );
        context.subscriptions.push(extractPythonCommand);

        registerFormattingPanel(context);
        registerFieldSwapFeature(context);

        // "Copy" CodeLens above each calculation block (copies comment header + formula).
        const calcCopyLens = new CalcCopyCodeLensProvider();
        const copyCalcBlockCommand = commands.registerCommand(COPY_CALC_BLOCK_COMMAND, async (text?: string) => {
            if (typeof text !== 'string' || text.length === 0) { return; }
            await env.clipboard.writeText(text);
            window.setStatusBarMessage('$(check) Calculation copied', 1500);
        });
        const calcCopyLensDisposable = languages.registerCodeLensProvider(
            { scheme: 'file', language: 'twbl' },
            calcCopyLens
        );
        const calcCopyConfigWatch = workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('tableau-language-support.codeLens')) {
                calcCopyLens.refresh();
            }
        });
        context.subscriptions.push(copyCalcBlockCommand, calcCopyLensDisposable, calcCopyConfigWatch);

        console.log('Tableau LSP: Additional components registered successfully');

    } catch (error) {
        console.error('Tableau LSP: Failed to register additional components:', error);
        // Don't throw - this is not critical
    }
}

function isTwbWorkbookDocument(document: TextDocument): boolean {
    const lowerPath = (document.uri.path || document.fileName || '').toLowerCase();
    return lowerPath.endsWith('.twb');
}

async function ensureWorkbookDocUsesTwbLanguage(document: TextDocument): Promise<void> {
    if (!isTwbWorkbookDocument(document) || document.languageId === 'twb') {
        return;
    }
    try {
        await languages.setTextDocumentLanguage(document, 'twb');
    } catch (error) {
        console.error('Tableau LSP: Failed to enforce twb language mode:', error);
    }
}

async function ensureOpenWorkbookDocsUseTwbLanguage(): Promise<void> {
    await Promise.all(
        workspace.textDocuments.map((document) =>
            ensureWorkbookDocUsesTwbLanguage(document)
        )
    );
}

// Extraction run function removed for this beta; feature will return in a later build.

/**
 * Register basic functionality when full activation fails
 */
async function registerBasicFunctionality(context: ExtensionContext): Promise<void> {
    try {
        // Register basic commands that don't require language server
        const helloCommand = commands.registerCommand('tableau-language-support.hello', () => {
            window.showInformationMessage('Tableau Language Support is running in basic mode. Some features may be limited.');
        });

        const statusCommand = commands.registerCommand('tableau-language-support.status', () => {
            const result = activationManager?.getActivationResult();
            if (result) {
                const featuresEnabled = Object.values(result.features).filter(Boolean).length;
                const totalFeatures = Object.keys(result.features).length;
                window.showInformationMessage(`Tableau Language Support: ${featuresEnabled}/${totalFeatures} features active`);
            } else {
                window.showWarningMessage('Tableau Language Support: Activation status unknown');
            }
        });

        context.subscriptions.push(helloCommand, statusCommand);

        console.log('Tableau LSP: Basic functionality registered');

    } catch (error) {
        console.error('Tableau LSP: Failed to register basic functionality:', error);
    }
}

/**
 * Restart the extension
 */
async function restartExtension(context: ExtensionContext): Promise<void> {
    try {
        window.showInformationMessage('Restarting Tableau Language Support...');

        // Stop current client if running
        if (client) {
            await client.stop();
            client = undefined;
        }

        // Restart using activation manager
        if (activationManager) {
            const result = await activationManager.restart(context);
            if (result?.client) {
                client = result.client;
            }
        }

        window.showInformationMessage('Tableau Language Support restarted successfully');

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        window.showErrorMessage(`Failed to restart Tableau Language Support: ${errorMessage}`);
        console.error('Tableau LSP: Restart failed:', error);
    }
}

async function findCompileTask(): Promise<Task | undefined> {
    const availableTasks = await tasks.fetchTasks({ type: 'npm' });
    return availableTasks.find(task => {
        if (task.name?.toLowerCase() === 'npm: compile') {
            return true;
        }

        const definition = task.definition as { script?: string } | undefined;
        return definition?.script === 'compile';
    });
}

async function waitForTaskCompletion(execution: TaskExecution): Promise<void> {
    return new Promise((resolve, reject) => {
        const disposable = tasks.onDidEndTaskProcess(event => {
            if (event.execution === execution) {
                disposable.dispose();
                if (typeof event.exitCode === 'number' && event.exitCode !== 0) {
                    reject(new Error(`"npm run compile" exited with code ${event.exitCode}`));
                    return;
                }

                resolve();
            }
        });
    });
}

async function restartDebuggerSession(): Promise<void> {
    const session = debug.activeDebugSession;
    if (session) {
        await commands.executeCommand('workbench.action.debug.restart');
        return;
    }

    const targetWorkspace = workspace.workspaceFolders?.[0];
    const started = await debug.startDebugging(targetWorkspace, 'Run Extension (VS Code)');
    if (!started) {
        window.showInformationMessage('Compilation finished. Press F5 to launch the "Run Extension (VS Code)" configuration.');
    }
}

/**
 * Extension deactivation with proper cleanup
 */
export async function deactivate(): Promise<void> {
    console.log('Tableau LSP: Extension deactivation started');

    try {
        if (client) {
            console.log('Tableau LSP: Stopping language client...');
            await client.stop();
            client = undefined;
        }

        console.log('Tableau LSP: Extension deactivated successfully');

    } catch (error) {
        console.error('Tableau LSP: Error during deactivation:', error);
        // Don't throw during deactivation
    }
}

/**
 * Get current activation status (for testing/debugging)
 */
export function getActivationStatus() {
    return activationManager?.getActivationResult();
}
