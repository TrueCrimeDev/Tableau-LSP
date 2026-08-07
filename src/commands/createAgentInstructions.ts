import * as vscode from 'vscode';
import { basename, join } from 'path';
import { invalidateLibraryCache, libraryFolderNames } from '../services/tableauLibrary.js';
import { TABLEAU_LIBRARY_FOLDERS } from '../services/tableauWorkspaceFiles.js';

export const CREATE_AGENT_INSTRUCTIONS_COMMAND = 'tableau-language-support.createAgentInstructions';

/** Starter content — prompts for the decisions that actually change answers. */
const TEMPLATE = `# Tableau agent instructions

Notes for the \`@tableau\` chat agent about how this project works. Everything
here is sent with every request, so keep it short and specific — conventions
the agent cannot infer from the workbook itself.

## Datasources

<!-- Which one is canonical? When does a calculation belong somewhere else? -->
-

## Naming

<!-- e.g. "Measures are title case. Prefix intermediate calcs with an underscore." -->
-

## House style

<!-- e.g. "Prefer FIXED LODs over table calculations so numbers survive a
     filter change." / "Always guard division with IIF, never ZN." -->
-

## Avoid

<!-- e.g. "Never use COUNTD on the extract — it is slow at our row counts." -->
-
`;

/**
 * Creates `tableau/agent.md` and opens it. The agent reads this file on every
 * request, so the main job here is discoverability: nobody finds a convention
 * documented only in a README.
 */
export async function createAgentInstructionsCommand(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders?.filter(folder => folder.uri.scheme === 'file') ?? [];
    if (folders.length === 0) {
        void vscode.window.showErrorMessage(
            'Open a workspace folder first — agent instructions live in that folder\'s Tableau library.'
        );
        return;
    }
    const folder = folders.length === 1
        ? folders[0]
        : (await vscode.window.showQuickPick(
            folders.map(item => ({ label: item.name, description: item.uri.fsPath, folder: item })),
            { placeHolder: 'Which workspace folder should hold the agent instructions?' }
        ))?.folder;
    if (!folder) {
        return;
    }

    const libraryFolder = libraryFolderNames()[0] ?? TABLEAU_LIBRARY_FOLDERS[0];
    const target = vscode.Uri.file(join(folder.uri.fsPath, libraryFolder, 'agent.md'));

    let existed = true;
    try {
        await vscode.workspace.fs.stat(target);
    } catch {
        existed = false;
    }
    if (!existed) {
        try {
            await vscode.workspace.fs.createDirectory(
                vscode.Uri.file(join(folder.uri.fsPath, libraryFolder))
            );
            await vscode.workspace.fs.writeFile(target, Buffer.from(TEMPLATE, 'utf8'));
            invalidateLibraryCache();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            void vscode.window.showErrorMessage(`Could not create the agent instructions file: ${message}`);
            return;
        }
    }

    const document = await vscode.workspace.openTextDocument(target);
    await vscode.window.showTextDocument(document, { preview: false });
    void vscode.window.showInformationMessage(
        existed
            ? `@tableau already reads ${libraryFolder}/${basename(target.fsPath)}.`
            : `Created ${libraryFolder}/agent.md — @tableau reads it on every request.`
    );
}
