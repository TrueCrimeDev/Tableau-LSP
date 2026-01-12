import * as vscode from 'vscode';
import { PARSING_GUIDE_CONTAINER_ID, PARSING_GUIDE_VIEW_ID } from '../views/parsingGuideView.js';

export async function showParsingGuideCommand(): Promise<void> {
    try {
        await vscode.commands.executeCommand(`workbench.view.extension.${PARSING_GUIDE_CONTAINER_ID}`);
        await vscode.commands.executeCommand('views.openView', PARSING_GUIDE_VIEW_ID);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Unable to open Parsing Guide: ${message}`);
    }
}
