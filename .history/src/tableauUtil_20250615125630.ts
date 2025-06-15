import os from "os";
import path from "path";
import vscode from "vscode";

import { debounce } from "lodash-es";

/**
 * Replace any references to predefined variables in config string.
 * https://code.visualstudio.com/docs/editor/variables-reference#_predefined-variables
 */
export function handleConfigOption(input: string): string {
    if (input.includes("${userHome}")) {
        input = input.replaceAll("${userHome}", os.homedir());
    }

    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        input = input.replaceAll("${workspaceFolder}", vscode.workspace.workspaceFolders[0].uri.fsPath);
        input = input.replaceAll("${workspaceFolderBasename}", vscode.workspace.workspaceFolders[0].name);
    }

    const document = vscode.window.activeTextEditor?.document;
    if (document) {
        input = input.replaceAll("${file}", document.fileName);
        input = input.replaceAll("${fileBasename}", path.basename(document.fileName));
        input = input.replaceAll(
            "${fileBasenameNoExtension}",
            path.basename(document.fileName, path.extname(document.fileName)),
        );
        input = input.replaceAll("${fileExtname}", path.extname(document.fileName));
        input = input.replaceAll("${fileDirname}", path.dirname(document.fileName));
        input = input.replaceAll("${fileDirnameBasename}", path.basename(path.dirname(document.fileName)));
    }

    input = input.replaceAll("${pathSeparator}", path.sep);
    input = input.replaceAll("${/}", path.sep);
    if (input.includes("${cwd}")) {
        input = input.replaceAll("${cwd}", process.cwd());
    }

    if (input.includes("${env:")) {
        for (let env = /\${env:([^}]+)}/.exec(input)?.[1]; env; env = /\${env:([^}]+)}/.exec(input)?.[1]) {
            input = input.replaceAll(`\${env:${env}}`, process.env[env] ?? "");
        }
    }

    return input;
}

export function getWorkspaceFolder(uri: string | vscode.Uri): vscode.WorkspaceFolder | undefined {
    const fsPath = typeof uri === "string" ? uri : uri.fsPath;
    return vscode.workspace.getWorkspaceFolder(vscode.Uri.file(fsPath));
}

export function isWorkspaceFile(uri: string | vscode.Uri): boolean {
    const workspaceFolder = getWorkspaceFolder(uri);
    return workspaceFolder !== undefined;
}

/**
 * Updates a configuration option and handles potential errors gracefully.
 */
export async function workspaceConfigUpdateNoThrow(
    configuration: vscode.WorkspaceConfiguration,
    section: string,
    value: any,
    configurationTarget?: boolean | vscode.ConfigurationTarget
): Promise<void> {
    try {
        await configuration.update(section, value, configurationTarget);
    } catch (error) {
        console.error(`Failed to update configuration ${section}:`, error);
        vscode.window.showWarningMessage(`Failed to update configuration ${section}`);
    }
}

/**
 * Creates a debounced async function.
 */
export function asyncDebounce<T extends any[]>(
    func: (...args: T) => Promise<void>,
    wait: number
): (...args: T) => void {
    return debounce(func, wait);
}

/**
 * Checks if a file exists.
 */
export function fileExists(filePath: string): boolean {
    try {
        const fs = require('fs');
        return fs.existsSync(filePath);
    } catch {
        return false;
    }
}

/**
 * Gets file extension for Tableau files.
 */
export function isTableauFile(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() === '.twbl';
}

/**
 * Normalizes a file path.
 */
export function normalizePath(filePath: string): string {
    return path.normalize(filePath);
}