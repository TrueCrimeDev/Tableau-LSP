// src/logging/logger.ts

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
    TRACE = 0,
    DEBUG = 1,
    INFO = 2,
    WARN = 3,
    ERROR = 4,
    FATAL = 5
}

export interface LogStatistics {
    totalEntries: number;
    currentLogLevel: LogLevel;
    fileLoggingEnabled: boolean;
    logFilePath?: string;
    levelCounts: Record<string, number>;
    categoryCounts: Record<string, number>;
    bufferSize: number;
    maxBufferSize: number;
}

export interface LogEntry {
    timestamp: Date;
    level: LogLevel;
    category: string;
    message: string;
    data?: any;
}

class Logger {
    private outputChannel: vscode.OutputChannel;
    private logLevel: LogLevel = LogLevel.INFO;
    private fileLoggingEnabled: boolean = false;
    private logFilePath?: string;
    private logBuffer: LogEntry[] = [];
    private maxBufferSize: number = 1000;
    private statistics: LogStatistics;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Tableau Language Support');
        this.statistics = {
            totalEntries: 0,
            currentLogLevel: this.logLevel,
            fileLoggingEnabled: this.fileLoggingEnabled,
            levelCounts: {},
            categoryCounts: {},
            bufferSize: 0,
            maxBufferSize: this.maxBufferSize
        };
    }

    public setLogLevel(level: LogLevel): void {
        this.logLevel = level;
        this.statistics.currentLogLevel = level;
    }

    public getLogLevel(): LogLevel {
        return this.logLevel;
    }

    public setFileLogging(enabled: boolean): void {
        this.fileLoggingEnabled = enabled;
        this.statistics.fileLoggingEnabled = enabled;
        
        if (enabled && !this.logFilePath) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                const logsDir = path.join(workspaceFolder.uri.fsPath, '.vscode', 'logs');
                if (!fs.existsSync(logsDir)) {
                    fs.mkdirSync(logsDir, { recursive: true });
                }
                this.logFilePath = path.join(logsDir, 'tableau-language-support.log');
                this.statistics.logFilePath = this.logFilePath;
            }
        }
    }

    public trace(category: string, message: string, data?: any): void {
        this.log(LogLevel.TRACE, category, message, data);
    }

    public debug(category: string, message: string, data?: any): void {
        this.log(LogLevel.DEBUG, category, message, data);
    }

    public info(category: string, message: string, data?: any): void {
        this.log(LogLevel.INFO, category, message, data);
    }

    public warn(category: string, message: string, data?: any): void {
        this.log(LogLevel.WARN, category, message, data);
    }

    public error(category: string, message: string, error?: Error | any): void {
        this.log(LogLevel.ERROR, category, message, error);
    }

    public fatal(category: string, message: string, error?: Error | any): void {
        this.log(LogLevel.FATAL, category, message, error);
    }

    public startPerformance(operationId: string): void {
        this.debug('Performance', `Started: ${operationId}`, { operationId, startTime: Date.now() });
    }

    public endPerformance(operationId: string, category: string, message: string): void {
        this.debug('Performance', `Completed: ${operationId} - ${message}`, { operationId, endTime: Date.now() });
    }

    private log(level: LogLevel, category: string, message: string, data?: any): void {
        if (level < this.logLevel) {
            return;
        }

        const entry: LogEntry = {
            timestamp: new Date(),
            level,
            category,
            message,
            data
        };

        this.logBuffer.push(entry);
        if (this.logBuffer.length > this.maxBufferSize) {
            this.logBuffer.shift();
        }

        this.updateStatistics(level, category);
        this.writeToOutputChannel(entry);
        
        if (this.fileLoggingEnabled && this.logFilePath) {
            this.writeToFile(entry);
        }
    }

    private updateStatistics(level: LogLevel, category: string): void {
        this.statistics.totalEntries++;
        this.statistics.bufferSize = this.logBuffer.length;
        
        const levelName = LogLevel[level];
        this.statistics.levelCounts[levelName] = (this.statistics.levelCounts[levelName] || 0) + 1;
        this.statistics.categoryCounts[category] = (this.statistics.categoryCounts[category] || 0) + 1;
    }

    private writeToOutputChannel(entry: LogEntry): void {
        const levelName = LogLevel[entry.level].padEnd(5);
        const timestamp = entry.timestamp.toISOString();
        const dataStr = entry.data ? ` | ${JSON.stringify(entry.data)}` : '';
        
        this.outputChannel.appendLine(`[${timestamp}] ${levelName} [${entry.category}] ${entry.message}${dataStr}`);
    }

    private writeToFile(entry: LogEntry): void {
        if (!this.logFilePath) return;
        
        try {
            const levelName = LogLevel[entry.level].padEnd(5);
            const timestamp = entry.timestamp.toISOString();
            const dataStr = entry.data ? ` | ${JSON.stringify(entry.data)}` : '';
            const logLine = `[${timestamp}] ${levelName} [${entry.category}] ${entry.message}${dataStr}\n`;
            
            fs.appendFileSync(this.logFilePath, logLine);
        } catch (error) {
            // Fallback to output channel if file writing fails
            this.outputChannel.appendLine(`[ERROR] Failed to write to log file: ${error}`);
        }
    }

    public showOutputChannel(): void {
        this.outputChannel.show();
    }

    public clearOutputChannel(): void {
        this.outputChannel.clear();
    }

    public getStatistics(): LogStatistics {
        return { ...this.statistics };
    }

    public async exportLogs(): Promise<void> {
        try {
            const content = this.logBuffer.map(entry => {
                const levelName = LogLevel[entry.level].padEnd(5);
                const timestamp = entry.timestamp.toISOString();
                const dataStr = entry.data ? ` | ${JSON.stringify(entry.data)}` : '';
                return `[${timestamp}] ${levelName} [${entry.category}] ${entry.message}${dataStr}`;
            }).join('\n');

            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file('tableau-language-support-logs.txt'),
                filters: {
                    'Text Files': ['txt'],
                    'All Files': ['*']
                }
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
                vscode.window.showInformationMessage(`Logs exported to ${uri.fsPath}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export logs: ${error}`);
        }
    }
}

let loggerInstance: Logger | undefined;

export function getLogger(): Logger {
    if (!loggerInstance) {
        loggerInstance = new Logger();
    }
    return loggerInstance;
}