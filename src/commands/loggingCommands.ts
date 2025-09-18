// src/commands/loggingCommands.ts

import * as vscode from 'vscode';
import { getLogger, LogLevel } from '../logging/logger';

/**
 * R10.4: Logging Commands
 * 
 * Commands for managing and viewing logs during development and debugging.
 */

/**
 * Show logs output channel
 */
export async function showLogsCommand(): Promise<void> {
    const logger = getLogger();
    logger.showOutputChannel();
}

/**
 * Clear logs
 */
export async function clearLogsCommand(): Promise<void> {
    const logger = getLogger();
    logger.clearOutputChannel();
    logger.info('LoggingCommands', 'Logs cleared by user');
}

/**
 * Export logs to file
 */
export async function exportLogsCommand(): Promise<void> {
    const logger = getLogger();
    await logger.exportLogs();
}

/**
 * Show logging statistics
 */
export async function showLoggingStatsCommand(): Promise<void> {
    const logger = getLogger();
    const stats = logger.getStatistics();
    
    const message = `
Tableau Language Support - Logging Statistics

Total Log Entries: ${stats.totalEntries}
Current Log Level: ${stats.currentLogLevel}
File Logging: ${stats.fileLoggingEnabled ? 'Enabled' : 'Disabled'}
${stats.logFilePath ? `Log File: ${stats.logFilePath}` : ''}

Log Levels:
${Object.entries(stats.levelCounts).map(([level, count]) => `  ${level}: ${count}`).join('\\n')}

Categories:
${Object.entries(stats.categoryCounts).map(([category, count]) => `  ${category}: ${count}`).join('\\n')}

Buffer: ${stats.bufferSize}/${stats.maxBufferSize} entries
    `.trim();
    
    const action = await vscode.window.showInformationMessage(
        'Logging Statistics',
        { modal: true, detail: message },
        'Show Logs',
        'Export Logs',
        'Close'
    );
    
    switch (action) {
        case 'Show Logs':
            await showLogsCommand();
            break;
        case 'Export Logs':
            await exportLogsCommand();
            break;
    }
}

/**
 * Change log level
 */
export async function changeLogLevelCommand(): Promise<void> {
    const logger = getLogger();
    const currentLevel = logger.getLogLevel();
    
    const levels = [
        { label: 'TRACE', description: 'Most verbose - all messages', level: LogLevel.TRACE },
        { label: 'DEBUG', description: 'Debug information', level: LogLevel.DEBUG },
        { label: 'INFO', description: 'General information (default)', level: LogLevel.INFO },
        { label: 'WARN', description: 'Warnings only', level: LogLevel.WARN },
        { label: 'ERROR', description: 'Errors only', level: LogLevel.ERROR },
        { label: 'FATAL', description: 'Fatal errors only', level: LogLevel.FATAL }
    ];
    
    const selected = await vscode.window.showQuickPick(
        levels.map(l => ({
            ...l,
            picked: l.level === currentLevel
        })),
        {
            placeHolder: `Current level: ${LogLevel[currentLevel]}`,
            matchOnDescription: true
        }
    );
    
    if (selected) {
        logger.setLogLevel(selected.level);
        vscode.window.showInformationMessage(`Log level changed to ${selected.label}`);
    }
}

/**
 * Toggle file logging
 */
export async function toggleFileLoggingCommand(): Promise<void> {
    const logger = getLogger();
    const stats = logger.getStatistics();
    const currentlyEnabled = stats.fileLoggingEnabled;
    
    const action = await vscode.window.showQuickPick([
        {
            label: currentlyEnabled ? 'Disable File Logging' : 'Enable File Logging',
            description: currentlyEnabled 
                ? 'Stop writing logs to file' 
                : 'Start writing logs to .vscode/logs/',
            action: 'toggle'
        },
        {
            label: 'Show Current Log File',
            description: stats.logFilePath || 'No log file active',
            action: 'show',
            disabled: !currentlyEnabled
        }
    ], {
        placeHolder: `File logging is currently ${currentlyEnabled ? 'enabled' : 'disabled'}`
    });
    
    if (action) {
        switch (action.action) {
            case 'toggle':
                logger.setFileLogging(!currentlyEnabled);
                vscode.window.showInformationMessage(
                    `File logging ${!currentlyEnabled ? 'enabled' : 'disabled'}`
                );
                break;
            case 'show':
                if (stats.logFilePath) {
                    const uri = vscode.Uri.file(stats.logFilePath);
                    await vscode.window.showTextDocument(uri);
                }
                break;
        }
    }
}

/**
 * Test logging (for development)
 */
export async function testLoggingCommand(): Promise<void> {
    const logger = getLogger();
    
    logger.trace('TestLogging', 'This is a trace message', { test: true });
    logger.debug('TestLogging', 'This is a debug message', { test: true });
    logger.info('TestLogging', 'This is an info message', { test: true });
    logger.warn('TestLogging', 'This is a warning message', { test: true });
    logger.error('TestLogging', 'This is an error message', new Error('Test error'));
    
    // Test performance logging
    logger.startPerformance('test-operation');
    await new Promise(resolve => setTimeout(resolve, 100));
    logger.endPerformance('test-operation', 'TestLogging', 'Test operation completed');
    
    vscode.window.showInformationMessage('Test log messages generated. Check the output channel.');
    logger.showOutputChannel();
}

/**
 * Register all logging commands
 */
export function registerLoggingCommands(context: vscode.ExtensionContext): void {
    const commands = [
        vscode.commands.registerCommand('tableau-language-support.showLogs', showLogsCommand),
        vscode.commands.registerCommand('tableau-language-support.clearLogs', clearLogsCommand),
        vscode.commands.registerCommand('tableau-language-support.exportLogs', exportLogsCommand),
        vscode.commands.registerCommand('tableau-language-support.loggingStats', showLoggingStatsCommand),
        vscode.commands.registerCommand('tableau-language-support.changeLogLevel', changeLogLevelCommand),
        vscode.commands.registerCommand('tableau-language-support.toggleFileLogging', toggleFileLoggingCommand),
        vscode.commands.registerCommand('tableau-language-support.testLogging', testLoggingCommand)
    ];
    
    context.subscriptions.push(...commands);
    
    const logger = getLogger();
    logger.info('LoggingCommands', 'Logging commands registered', {
        commandCount: commands.length
    });
}