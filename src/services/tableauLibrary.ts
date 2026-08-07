import * as vscode from 'vscode';
import {
    TABLEAU_LIBRARY_FOLDERS,
    TableauLibrary,
    discoverTableauLibrary,
} from './tableauWorkspaceFiles.js';

/**
 * VS Code-side wrapper over the workspace Tableau library discovery: resolves
 * which folder names to search and which roots to search them in.
 *
 * The discovery rules themselves live in `tableauWorkspaceFiles.ts`, which the
 * language server also imports — it cannot depend on `vscode`.
 */

export const LIBRARY_FOLDERS_SETTING = 'tableau-language-support.fieldDefinitions.folders';

/** Folder names to search at each workspace root, from settings. */
export function libraryFolderNames(): string[] {
    const configured = vscode.workspace
        .getConfiguration('tableau-language-support')
        .get<string[]>('fieldDefinitions.folders');
    const names = (configured ?? [])
        .filter((name): name is string => typeof name === 'string')
        // Strip a leading "./" or "/" and any trailing separator, but NOT a
        // leading dot on its own — ".tableau" is a hidden folder name, and the
        // shipped default would otherwise collapse to "tableau".
        .map(name => name.trim().replace(/^(?:\.[\\/]|[\\/])+/, '').replace(/[\\/]+$/, ''))
        .filter(name => Boolean(name) && name !== '.' && name !== '..');
    // De-duplicated: a repeated name would walk the same folder twice and
    // register two identical watchers, firing every refresh twice.
    const unique = [...new Set(names)];
    return unique.length ? unique : [...TABLEAU_LIBRARY_FOLDERS];
}

/** Local-filesystem workspace roots. Virtual workspaces contribute nothing. */
export function workspaceRootPaths(): string[] {
    return (vscode.workspace.workspaceFolders ?? [])
        .filter(folder => folder.uri.scheme === 'file')
        .map(folder => folder.uri.fsPath);
}

/**
 * Discovery walks the filesystem synchronously, and the workbook context is
 * republished on a 400 ms debounce while a .twb is being edited — so the same
 * scan would otherwise run every few keystrokes. Results are cached until a
 * watcher reports a change, with a short TTL as a backstop for any path that
 * forgets to invalidate.
 */
const CACHE_TTL_MS = 2000;

// Keyed rather than single-slot: the sidebar asks for the whole workspace
// while the field-context manager asks for one root, and a single slot would
// let those two callers evict each other on every call.
const cache = new Map<string, { stamp: number; library: TableauLibrary }>();

export function invalidateLibraryCache(): void {
    cache.clear();
}

function discoverCached(roots: string[], folderNames: string[]): TableauLibrary {
    const key = JSON.stringify([roots, folderNames]);
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && now - hit.stamp < CACHE_TTL_MS) {
        return hit.library;
    }
    const library = discoverTableauLibrary(roots, folderNames);
    cache.set(key, { stamp: now, library });
    return library;
}

/** The whole workspace's library, across every root. */
export function discoverWorkspaceLibrary(): TableauLibrary {
    return discoverCached(workspaceRootPaths(), libraryFolderNames());
}

/** One root's library — used to scope declarations to the active folder. */
export function discoverFolderLibrary(rootPath: string): TableauLibrary {
    return discoverCached([rootPath], libraryFolderNames());
}

/**
 * Glob patterns covering everything discovery can pick up, for file watchers.
 * Root-level declaration files stay watched for the pre-`tableau/` layout.
 */
export function libraryWatchPatterns(): vscode.RelativePattern[] {
    const patterns: vscode.RelativePattern[] = [];
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        patterns.push(new vscode.RelativePattern(folder, '*.d.twbl'));
        for (const name of libraryFolderNames()) {
            patterns.push(new vscode.RelativePattern(folder, `${name}/**/*.twbl`));
        }
    }
    return patterns;
}
