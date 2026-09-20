import type * as vscode from 'vscode';

const sources = new Map<string, vscode.Uri>();
const previewSources = new Map<string, vscode.Uri>();

/** Only extension-created editor bindings can resolve to a writable package. */
export function bindWorkbookSource(editor: vscode.Uri, source: vscode.Uri): void {
    sources.set(editor.toString(), source);
}

export function resolveWorkbookSourceUri(uri: vscode.Uri): vscode.Uri {
    return sources.get(uri.toString()) ?? previewSources.get(uri.toString()) ?? uri;
}

/** A read-only comparison has a source identity, but is never a live XML draft. */
export function bindWorkbookPreview(preview: vscode.Uri, source: vscode.Uri): void {
    previewSources.set(preview.toString(), resolveWorkbookSourceUri(source));
}

export function unbindWorkbookSource(editor: vscode.Uri): void {
    sources.delete(editor.toString());
    previewSources.delete(editor.toString());
}

export function workbookEditorKeys(source: vscode.Uri): string[] {
    return [...sources].filter(([, uri]) => uri.toString() === source.toString()).map(([key]) => key);
}
