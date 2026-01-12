import * as vscode from 'vscode';
import { copyPreferencesToRepository } from '../preferences/preferencesFile.js';

export async function copyPreferencesToRepositoryCommand(
    context: vscode.ExtensionContext
): Promise<void> {
    try {
        await copyPreferencesToRepository(context, true, true);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to copy Preferences.tps: ${message}`);
    }
}
