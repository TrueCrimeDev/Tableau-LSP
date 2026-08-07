import * as vscode from 'vscode';
import { discoverWorkspaceLibrary, workspaceRootPaths } from '../services/tableauLibrary.js';
import { InstructionSource } from './customInstructions.js';
import { describeLibraryFile } from '../services/tableauWorkspaceFiles.js';

/**
 * Reads the workspace's agent instruction files. Kept apart from
 * `customInstructions.ts` so the composition logic stays testable without a
 * filesystem or a `vscode` stub.
 */
export async function loadProjectInstructions(): Promise<InstructionSource[]> {
    const roots = workspaceRootPaths();
    const sources: InstructionSource[] = [];
    for (const path of discoverWorkspaceLibrary().instructions) {
        try {
            const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(path));
            sources.push({
                label: describeLibraryFile(path, roots),
                text: new TextDecoder('utf-8').decode(bytes),
            });
        } catch {
            // An unreadable instruction file is skipped, not fatal: the agent
            // is still useful without the project's conventions.
        }
    }
    return sources;
}
