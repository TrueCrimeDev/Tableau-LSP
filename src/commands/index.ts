// src/commands/index.ts

import * as vscode from 'vscode';
import { formatExpressionCommand } from './formatExpression.js';
import { validateExpressionCommand } from './validateExpression.js';
import { insertIfStatementCommand } from './insertIfStatement.js';
import { insertCaseStatementCommand } from './insertCaseStatement.js';
import { insertLodExpressionCommand } from './insertLodExpression.js';
import { showFunctionHelpCommand } from './showFunctionHelp.js';
import { toggleCommentsCommand } from './toggleComments.js';
import { reviewProblemsCommand } from './reviewProblems.js';
// import { registerHelpCommands } from '../help/helpProvider.js';
// import { registerLoggingCommands } from './loggingCommands.js';

/**
 * R9.1: Register all keyboard shortcut commands
 * 
 * This module registers all commands that can be triggered via keyboard shortcuts
 * for quick access to common Tableau calculation operations.
 */

export function registerCommands(context: vscode.ExtensionContext): void {
    const commands = [
        // Formatting and validation
        vscode.commands.registerCommand('tableau-language-support.formatExpression', formatExpressionCommand),
        vscode.commands.registerCommand('tableau-language-support.validateExpression', validateExpressionCommand),
        
        // Code insertion shortcuts
        vscode.commands.registerCommand('tableau-language-support.insertIfStatement', insertIfStatementCommand),
        vscode.commands.registerCommand('tableau-language-support.insertCaseStatement', insertCaseStatementCommand),
        vscode.commands.registerCommand('tableau-language-support.insertLodExpression', insertLodExpressionCommand),
        
        // Help and utilities
        vscode.commands.registerCommand('tableau-language-support.showFunctionHelp', showFunctionHelpCommand),
        vscode.commands.registerCommand('tableau-language-support.toggleComments', toggleCommentsCommand),
        vscode.commands.registerCommand('tableau-language-support.reviewProblems', reviewProblemsCommand),
    ];

    // Add all commands to context subscriptions
    context.subscriptions.push(...commands);
    
    // Register help commands
    // registerHelpCommands(context);
    
    // Register logging commands
    // registerLoggingCommands(context);
    
    console.log('Tableau LSP: Registered keyboard shortcut commands');
}
