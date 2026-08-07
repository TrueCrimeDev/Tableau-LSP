import * as vscode from 'vscode';
import { discoverWorkspaceLibrary, invalidateLibraryCache, libraryFolderNames } from '../../services/tableauLibrary.js';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const roots: string[] = [];

function configure(folders: unknown): void {
    (vscode.workspace as any).getConfiguration = () => ({ get: () => folders });
    invalidateLibraryCache();
}

function workspace(layout: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'tableau-cfg-'));
    roots.push(root);
    for (const [relativePath, contents] of Object.entries(layout)) {
        const full = join(root, relativePath);
        mkdirSync(join(full, '..'), { recursive: true });
        writeFileSync(full, contents);
    }
    (vscode.workspace as any).workspaceFolders = [{ uri: { scheme: 'file', fsPath: root }, name: 'w', index: 0 }];
    invalidateLibraryCache();
    return root;
}

afterEach(() => {
    configure(undefined);
    (vscode.workspace as any).workspaceFolders = [];
});

afterAll(() => {
    for (const root of roots) {
        rmSync(root, { recursive: true, force: true });
    }
});

describe('libraryFolderNames', () => {
    it('defaults to the shipped folder names', () => {
        configure(undefined);
        expect(libraryFolderNames()).toEqual(['tableau', '.tableau']);
    });

    it('keeps the leading dot on a hidden folder name', () => {
        configure(['.tableau']);
        expect(libraryFolderNames()).toEqual(['.tableau']);
    });

    it('normalises a path-ish entry without eating the dot', () => {
        configure(['./tableau', 'shared/', '/lib', '.hidden']);
        expect(libraryFolderNames()).toEqual(['tableau', 'shared', 'lib', '.hidden']);
    });

    it('drops empty and traversal entries, and non-strings', () => {
        configure(['', '   ', '.', '..', 7, 'tableau']);
        expect(libraryFolderNames()).toEqual(['tableau']);
    });

    it('falls back to the defaults when the setting is empty', () => {
        configure([]);
        expect(libraryFolderNames()).toEqual(['tableau', '.tableau']);
    });

    it('de-duplicates names that normalise to the same folder', () => {
        // A repeat would walk the folder twice and register two identical
        // watchers, firing every refresh twice.
        configure(['tableau', './tableau', 'tableau/']);
        expect(libraryFolderNames()).toEqual(['tableau']);
    });
});

describe('discoverWorkspaceLibrary', () => {
    it('finds a hidden .tableau folder using the shipped default', () => {
        const root = workspace({ '.tableau/fields.d.twbl': '// hidden' });
        configure(undefined);
        (vscode.workspace as any).workspaceFolders = [
            { uri: { scheme: 'file', fsPath: root }, name: 'w', index: 0 },
        ];
        invalidateLibraryCache();

        expect(discoverWorkspaceLibrary().definitions)
            .toEqual([join(root, '.tableau', 'fields.d.twbl')]);
    });

    it('re-reads after the cache is invalidated', () => {
        const root = workspace({ 'tableau/one.d.twbl': '' });
        expect(discoverWorkspaceLibrary().definitions).toHaveLength(1);

        writeFileSync(join(root, 'tableau', 'two.d.twbl'), '');
        invalidateLibraryCache();

        expect(discoverWorkspaceLibrary().definitions).toHaveLength(2);
    });

    it('ignores workspace folders that are not on the local filesystem', () => {
        (vscode.workspace as any).workspaceFolders = [
            { uri: { scheme: 'vscode-vfs', fsPath: '/virtual' }, name: 'v', index: 0 },
        ];
        invalidateLibraryCache();

        expect(discoverWorkspaceLibrary()).toEqual({ definitions: [], calculations: [], instructions: [], folders: [] });
    });
});
