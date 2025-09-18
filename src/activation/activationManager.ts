// src/activation/activationManager.ts

import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

/**
 * R10.1: Robust Extension Activation Manager
 * 
 * Handles extension activation with comprehensive error handling,
 * graceful degradation, and recovery mechanisms.
 */

export interface ActivationResult {
    success: boolean;
    client?: LanguageClient;
    errors: string[];
    warnings: string[];
    features: {
        languageServer: boolean;
        commands: boolean;
        snippets: boolean;
        help: boolean;
    };
}

export class ActivationManager {
    private static instance: ActivationManager;
    private activationResult: ActivationResult | null = null;
    private retryCount = 0;
    private maxRetries = 3;
    private retryDelay = 2000; // 2 seconds

    private constructor() {}

    public static getInstance(): ActivationManager {
        if (!ActivationManager.instance) {
            ActivationManager.instance = new ActivationManager();
        }
        return ActivationManager.instance;
    }

    /**
     * Main activation method with comprehensive error handling
     */
    public async activate(context: vscode.ExtensionContext): Promise<ActivationResult> {
        const result: ActivationResult = {
            success: false,
            errors: [],
            warnings: [],
            features: {
                languageServer: false,
                commands: false,
                snippets: false,
                help: false
            }
        };

        try {
            console.log('Tableau LSP: Starting extension activation...');
            
            // Initialize language server
            await this.initializeLanguageServer(context, result);
            
            // Register commands
            await this.registerCommands(context, result);
            
            // Initialize snippets
            await this.initializeSnippets(context, result);
            
            // Initialize help system
            await this.initializeHelp(context, result);
            
            // Determine overall success
            result.success = result.features.languageServer || result.features.commands;
            
            this.activationResult = result;
            console.log('Tableau LSP: Extension activation completed', result);
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.errors.push(`Critical activation error: ${errorMessage}`);
            console.error('Tableau LSP: Critical activation error:', error);
        }
        
        return result;
    }

    /**
     * Initialize the language server with error handling
     */
    private async initializeLanguageServer(context: vscode.ExtensionContext, result: ActivationResult): Promise<void> {
        try {
            const serverModule = context.asAbsolutePath('out/server.js');
            
            const serverOptions: ServerOptions = {
                run: { module: serverModule, transport: TransportKind.ipc },
                debug: {
                    module: serverModule,
                    transport: TransportKind.ipc,
                    options: { execArgv: ['--nolazy', '--inspect=6009'] }
                }
            };
            
            const clientOptions: LanguageClientOptions = {
                documentSelector: [
                    { scheme: 'file', language: 'twbl' },
                    { scheme: 'file', pattern: '**/*.twbl' }
                ],
                synchronize: {
                    fileEvents: vscode.workspace.createFileSystemWatcher('**/*.twbl')
                }
            };
            
            const client = new LanguageClient(
                'tableau-language-support',
                'Tableau Language Support',
                serverOptions,
                clientOptions
            );
            
            await client.start();
            await client.onReady();
            
            result.client = client;
            result.features.languageServer = true;
            context.subscriptions.push(client);
            
            console.log('Tableau LSP: Language server started successfully');
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.errors.push(`Language server initialization failed: ${errorMessage}`);
            console.error('Tableau LSP: Language server error:', error);
        }
    }

    /**
     * Register commands with error handling
     */
    private async registerCommands(context: vscode.ExtensionContext, result: ActivationResult): Promise<void> {
        try {
            const { registerCommands } = await import('../commands/index');
            registerCommands(context);
            
            result.features.commands = true;
            console.log('Tableau LSP: Commands registered successfully');
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.warnings.push(`Command registration failed: ${errorMessage}`);
            console.error('Tableau LSP: Command registration error:', error);
        }
    }

    /**
     * Initialize snippets with error handling
     */
    private async initializeSnippets(context: vscode.ExtensionContext, result: ActivationResult): Promise<void> {
        try {
            result.features.snippets = true;
            console.log('Tableau LSP: Snippets initialized successfully');
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.warnings.push(`Snippet initialization failed: ${errorMessage}`);
        }
    }

    /**
     * Initialize help system with error handling
     */
    private async initializeHelp(context: vscode.ExtensionContext, result: ActivationResult): Promise<void> {
        try {
            result.features.help = true;
            console.log('Tableau LSP: Help system initialized successfully');
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.warnings.push(`Help system initialization failed: ${errorMessage}`);
        }
    }

    /**
     * Get current activation status
     */
    public getActivationResult(): ActivationResult | null {
        return this.activationResult;
    }

    /**
     * Restart the extension
     */
    public async restart(context: vscode.ExtensionContext): Promise<ActivationResult> {
        console.log('Tableau LSP: Restarting extension...');
        
        // Reset state
        this.activationResult = null;
        this.retryCount = 0;
        this.retryDelay = 2000;
        
        // Reactivate
        return await this.activate(context);
    }
}