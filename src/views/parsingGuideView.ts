import * as vscode from 'vscode';

import {
    PaletteDefinition,
    PaletteType,
    applyPaletteChanges,
    appendToArchive,
    copyPreferencesToRepository,
    getWorkspacePreferencesUri,
    loadPreferencesText,
    parsePalettes,
    writePreferencesText
} from '../preferences/preferencesFile.js';
import { TWBParser } from '../parsers/twbParser.js';
import { WorkbookError } from '../types/workbook.js';

export const PARSING_GUIDE_VIEW_ID = 'tableauLanguageSupport.parsingGuide';
export const PARSING_GUIDE_CONTAINER_ID = 'tableauLsp';

class ParsingGuideViewProvider implements vscode.WebviewViewProvider {
    private view: vscode.WebviewView | undefined;

    public constructor(private readonly context: vscode.ExtensionContext) {}

    public resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };

        view.webview.onDidReceiveMessage(message => {
            if (!message || typeof message !== 'object') {
                return;
            }

            const payload = message as { type?: string; palettes?: unknown; palette?: unknown; paletteName?: unknown };
            switch (payload.type) {
                case 'openPreferencesTemplate':
                    void this.openPreferencesTemplate();
                    break;
                case 'copyPreferencesToRepository':
                    void this.copyPreferencesTemplateToRepository();
                    break;
                case 'requestPalettes':
                    void this.postPaletteData();
                    break;
                case 'requestContext':
                    void this.postContextData();
                    break;
                case 'savePalettes':
                    void this.savePalettes(payload.palettes);
                    break;
                case 'applyToWorkbook':
                    void this.applyPaletteToWorkbook(payload.palette);
                    break;
                case 'updatePalette':
                    void this.updatePalette(payload.palette);
                    break;
                case 'archivePalette':
                    void this.archivePalette(payload.paletteName);
                    break;
                case 'deletePalette':
                    void this.deletePalette(payload.paletteName);
                    break;
                default:
                    break;
            }
        });

        view.webview.html = getGuideHtml(view.webview, this.context, getNonce());
        void this.postPaletteData();
        void this.postContextData();
        view.onDidDispose(() => {
            if (this.view === view) {
                this.view = undefined;
            }
        });
    }

    private async openPreferencesTemplate(): Promise<void> {
        const workspaceUri = getWorkspacePreferencesUri();
        let targetUri = vscode.Uri.joinPath(this.context.extensionUri, 'config', 'Preferences.tps');

        if (workspaceUri && await fileExists(workspaceUri)) {
            targetUri = workspaceUri;
        }

        try {
            await vscode.window.showTextDocument(targetUri, { preview: false });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Unable to open Preferences.tps: ${message}`);
        }
    }

    private async copyPreferencesTemplateToRepository(): Promise<void> {
        try {
            await copyPreferencesToRepository(this.context, true, true);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Unable to copy Preferences.tps: ${message}`);
        }
    }

    private async savePalettes(rawPalettes: unknown): Promise<void> {
        const palettes = coercePalettes(rawPalettes);
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const workspaceUri = getWorkspacePreferencesUri();

        if (!workspaceFolder || !workspaceUri) {
            vscode.window.showErrorMessage('Open a workspace folder to save Preferences.tps.');
            return;
        }

        try {
            const loadResult = await loadPreferencesText(this.context, true);
            const updatedText = applyPaletteChanges(loadResult.text, palettes);
            const configDir = vscode.Uri.joinPath(workspaceFolder.uri, 'config');
            await vscode.workspace.fs.createDirectory(configDir);
            await writePreferencesText(workspaceUri, updatedText);
            await this.postPaletteData();
            await this.postStatus('Saved palettes to config/Preferences.tps.', 'success');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            await this.postStatus(`Failed to save palettes: ${message}`, 'error');
        }
    }

    private async updatePalette(rawPalette: unknown): Promise<void> {
        try {
            const updatedPalette = coercePalette(rawPalette);
            if (!updatedPalette) {
                await this.postStatus('Invalid palette data.', 'error');
                return;
            }

            const loadResult = await loadPreferencesText(this.context, true);
            const palettes = parsePalettes(loadResult.text);
            const paletteIndex = palettes.findIndex(palette => palette.name === updatedPalette.name);

            if (paletteIndex < 0) {
                await this.postStatus(`Palette "${updatedPalette.name}" not found.`, 'error');
                return;
            }

            palettes[paletteIndex] = updatedPalette;
            await this.savePalettes(palettes);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            await this.postStatus(`Failed to update palette: ${message}`, 'error');
        }
    }

    private async archivePalette(rawPaletteName: unknown): Promise<void> {
        try {
            if (typeof rawPaletteName !== 'string' || rawPaletteName.trim().length === 0) {
                await this.postStatus('Invalid palette name.', 'error');
                return;
            }

            const loadResult = await loadPreferencesText(this.context, true);
            const palettes = parsePalettes(loadResult.text);
            const paletteIndex = palettes.findIndex(palette => palette.name === rawPaletteName);

            if (paletteIndex < 0) {
                await this.postStatus(`Palette "${rawPaletteName}" not found.`, 'error');
                return;
            }

            const palette = palettes[paletteIndex];
            const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
            await appendToArchive(palette, workspaceUri);

            palettes.splice(paletteIndex, 1);
            await this.savePalettes(palettes);
            await this.postStatus(`Palette "${rawPaletteName}" archived.`, 'success');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            await this.postStatus(`Failed to archive palette: ${message}`, 'error');
        }
    }

    private async deletePalette(rawPaletteName: unknown): Promise<void> {
        try {
            if (typeof rawPaletteName !== 'string' || rawPaletteName.trim().length === 0) {
                await this.postStatus('Invalid palette name.', 'error');
                return;
            }

            const loadResult = await loadPreferencesText(this.context, true);
            const palettes = parsePalettes(loadResult.text);
            const filteredPalettes = palettes.filter(palette => palette.name !== rawPaletteName);

            if (filteredPalettes.length === palettes.length) {
                await this.postStatus(`Palette "${rawPaletteName}" not found.`, 'error');
                return;
            }

            await this.savePalettes(filteredPalettes);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            await this.postStatus(`Failed to delete palette: ${message}`, 'error');
        }
    }

    private async applyPaletteToWorkbook(rawPalette: unknown): Promise<void> {
        const initialPalette = coercePalette(rawPalette);
        if (!initialPalette) {
            await this.postStatus('Invalid palette data.', 'error');
            return;
        }
        let palette: PaletteDefinition = initialPalette;

        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            await this.postStatus('No active workbook file. Open a .twb file first.', 'error');
            return;
        }

        const workbookUri = activeEditor.document.uri;
        const path = workbookUri.path.toLowerCase();
        if (!path.endsWith('.twb') && !path.endsWith('.twbx')) {
            await this.postStatus('Active file is not a Tableau workbook (.twb or .twbx).', 'error');
            return;
        }
        if (path.endsWith('.twbx')) {
            await this.postStatus('Packaged workbooks (.twbx) are not yet supported.', 'error');
            return;
        }

        try {
            const parser = new TWBParser();
            const workbookDoc = await parser.parseWorkbook(workbookUri);
            const existingPalette = workbookDoc.palettes.find(
                current => current.name.toLowerCase() === palette.name.toLowerCase()
            );

            if (existingPalette) {
                const choice = await vscode.window.showWarningMessage(
                    `A palette named "${existingPalette.name}" already exists in this workbook.`,
                    'Replace',
                    'Rename',
                    'Cancel'
                );

                if (!choice || choice === 'Cancel') {
                    await this.postStatus('Cancelled palette application.', 'info');
                    return;
                }

                if (choice === 'Rename') {
                    const newName = await vscode.window.showInputBox({
                        prompt: 'Enter a new palette name',
                        value: `${palette.name} (Copy)`,
                        validateInput: value => {
                            if (!value || value.trim().length === 0) {
                                return 'Palette name cannot be empty.';
                            }
                            const hasConflict = workbookDoc.palettes.some(
                                current => current.name.toLowerCase() === value.trim().toLowerCase()
                            );
                            return hasConflict ? 'A palette with this name already exists.' : null;
                        }
                    });

                    if (!newName) {
                        await this.postStatus('Cancelled palette application.', 'info');
                        return;
                    }

                    palette = {
                        ...palette,
                        name: newName.trim()
                    };
                }
            }

            const updateResult = parser.upsertPalette(workbookDoc, palette);
            if (!updateResult.hasChanges) {
                await this.postStatus('No workbook changes were required.', 'info');
                return;
            }

            await parser.writeWorkbook(workbookUri, updateResult.updatedXml);
            const action = existingPalette ? 'updated' : 'added';
            await this.postStatus(`Successfully ${action} palette "${palette.name}".`, 'success');
        } catch (error: unknown) {
            if (error instanceof WorkbookError) {
                await this.postStatus(`Workbook error: ${error.message}`, 'error');
                return;
            }

            const message = error instanceof Error ? error.message : String(error);
            await this.postStatus(`Failed to apply palette to workbook: ${message}`, 'error');
        }
    }

    private async postPaletteData(): Promise<void> {
        if (!this.view) {
            return;
        }

        try {
            const loadResult = await loadPreferencesText(this.context, true);
            const palettes = parsePalettes(loadResult.text);
            const sourceLabel = loadResult.source === 'workspace'
                ? 'Workspace config/Preferences.tps'
                : loadResult.source === 'extension'
                    ? 'Extension template config/Preferences.tps'
                    : 'New Preferences.tps';

            await this.view.webview.postMessage({
                type: 'palettesLoaded',
                palettes,
                source: loadResult.source,
                sourceLabel,
                sourcePath: loadResult.uri.fsPath
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            await this.postStatus(`Failed to load palettes: ${message}`, 'error');
        }
    }

    private async postStatus(message: string, tone: 'success' | 'error' | 'info'): Promise<void> {
        if (!this.view) {
            return;
        }
        await this.view.webview.postMessage({
            type: 'paletteStatus',
            message,
            tone
        });
    }

    private async postContextData(): Promise<void> {
        if (!this.view) {
            return;
        }

        const workspaceUri = getWorkspacePreferencesUri();
        await this.view.webview.postMessage({
            type: 'contextChanged',
            context: {
                mode: 'system',
                sourceType: workspaceUri ? 'preferences' : 'extension-template',
                sourceLabel: workspaceUri ? 'Workspace config/Preferences.tps' : 'Extension template',
                sourceUri: workspaceUri?.toString() ?? ''
            }
        });
    }
}

export function registerParsingGuideView(context: vscode.ExtensionContext): void {
    const provider = new ParsingGuideViewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(PARSING_GUIDE_VIEW_ID, provider)
    );
}

function getGuideHtml(webview: vscode.Webview, context: vscode.ExtensionContext, nonce: string): string {
    // Get URI for the Webview UI Toolkit
    const toolkitUri = webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'media', 'toolkit.js')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}' ${toolkitUri};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tableau LSP Guide</title>
    <script type="module" src="${toolkitUri}"></script>
    <style>
        /* VS Code Native UI - Layout-only CSS */
        body {
            padding: 0;
            margin: 0;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
        }

        .shell {
            padding: 0 8px 16px;
        }

        main {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .card {
            padding: 0;
            margin-bottom: 20px;
        }

        h2 {
            margin: 0 0 8px 0;
            font-size: 1rem;
            font-weight: 600;
        }

        .palette-grid,
        .panel-block {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 20px;
        }

        .library-section {
            margin: 0 -8px 4px;
        }

        .library-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            height: 22px;
            padding: 0 8px 0 8px;
            background-color: var(--vscode-sideBarSectionHeader-background);
            border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
        }

        .library-title {
            font-size: 0.688rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            font-weight: 700;
            color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground));
            opacity: 0.9;
            user-select: none;
        }

        .library-header-actions {
            display: flex;
            align-items: center;
            gap: 0;
        }

        .library-help {
            font-size: 0.8rem;
            font-weight: 700;
            color: var(--vscode-icon-foreground);
            text-decoration: none;
            width: 22px;
            height: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.7;
        }

        .library-help:hover {
            opacity: 1;
            background-color: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
        }

        .panel-title {
            font-size: 0.85rem;
            font-weight: 600;
            margin-bottom: 8px;
            opacity: 0.9;
        }

        .field {
            display: flex;
            flex-direction: column;
            gap: 4px;
            margin-bottom: 8px;
        }

        .field label {
            font-size: 0.85rem;
            font-weight: 600;
        }

        .palette-list,
        .theme-list {
            display: flex;
            flex-direction: column;
            gap: 0;
        }

        .palette-item,
        .theme-card {
            padding: 5px 8px;
            background-color: transparent;
            display: flex;
            flex-direction: column;
            gap: 4px;
            border-left: 2px solid transparent;
            cursor: pointer;
            transition: background-color 0.05s ease;
        }

        .theme-card:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .theme-card-content {
            display: flex;
            flex-direction: column;
            gap: 6px;
            flex: 1;
        }

        .theme-card-actions {
            display: flex;
            gap: 4px;
            margin-top: 4px;
        }

        .palette-item.active {
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
            border-left-color: var(--vscode-focusBorder);
        }

        .palette-item.active .palette-meta {
            opacity: 1;
            color: var(--vscode-list-activeSelectionForeground);
        }

        .palette-item:hover:not(.active) {
            background-color: var(--vscode-list-hoverBackground);
        }

        .palette-item:focus-visible {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
        }

        .palette-bar,
        .theme-bar {
            height: 14px;
            border-radius: 2px;
        }

        .palette-name {
            font-weight: 600;
        }

        .palette-meta,
        .theme-meta {
            font-size: 0.8rem;
            opacity: 0.7;
            display: flex;
            gap: 8px;
        }

        .palette-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 4px;
        }

        .palette-actions {
            display: flex;
            gap: 0;
            flex-shrink: 0;
        }

        .color-builder,
        .generator {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .color-row,
        .color-add {
            display: grid;
            grid-template-columns: auto 1fr auto auto auto;
            gap: 6px;
            align-items: center;
        }

        .color-row input[type="color"],
        .color-add input[type="color"] {
            width: 32px;
            height: 28px;
            border: 1px solid var(--vscode-input-border);
            padding: 2px;
            background-color: var(--vscode-input-background);
            cursor: pointer;
            transition: border-color 0.1s ease;
        }

        .color-row input[type="color"]:hover,
        .color-add input[type="color"]:hover {
            border-color: var(--vscode-focusBorder);
        }

        .color-row input[type="color"]::-webkit-color-swatch-wrapper,
        .color-add input[type="color"]::-webkit-color-swatch-wrapper {
            padding: 0;
        }

        .color-row input[type="color"]::-webkit-color-swatch,
        .color-add input[type="color"]::-webkit-color-swatch {
            border: none;
            border-radius: 2px;
        }

        .generator-row {
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .scale-preview {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(40px, 1fr));
            gap: 6px;
        }

        .scale-swatch {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
        }

        .scale-color {
            width: 100%;
            height: 28px;
            border-radius: 4px;
            border: 1px solid var(--vscode-input-border);
        }

        .scale-label {
            font-size: 0.7rem;
            opacity: 0.7;
        }

        .preview-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }

        .button-grid {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .status {
            margin-top: 8px;
            font-size: 0.85rem;
            padding: 8px;
            border-radius: 4px;
        }

        .status.success {
            color: var(--vscode-notificationsInfoIcon-foreground);
            background-color: var(--vscode-inputValidation-infoBackground);
        }

        .status.error {
            color: var(--vscode-notificationsErrorIcon-foreground);
            background-color: var(--vscode-inputValidation-errorBackground);
        }

        .status.info {
            opacity: 0.8;
        }

        .note {
            font-size: 0.85rem;
            opacity: 0.7;
            margin: 4px 0;
        }

        code {
            font-family: var(--vscode-editor-font-family);
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 4px;
            border-radius: 3px;
        }

        pre {
            font-family: var(--vscode-editor-font-family);
            background-color: var(--vscode-textCodeBlock-background);
            padding: 8px;
            border-radius: 4px;
            overflow-x: auto;
        }

        details {
            margin: 8px 0;
        }

        summary {
            cursor: pointer;
            padding: 8px;
            background-color: transparent;
            font-weight: 600;
            margin-bottom: 8px;
            list-style: none;
            transition: background-color 0.1s ease;
            border-radius: 4px;
        }

        summary:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        summary::-webkit-details-marker {
            display: none;
        }

        details[open] > summary {
            margin-bottom: 12px;
        }

        details#builder-tools {
            margin: 8px -8px 0;
        }

        .builder-summary {
            font-size: 0.688rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            font-weight: 700;
            color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground));
            opacity: 0.9;
            padding: 0 8px;
            margin-bottom: 0;
            cursor: pointer;
            list-style: none;
            display: flex;
            align-items: center;
            gap: 6px;
            height: 22px;
            background-color: var(--vscode-sideBarSectionHeader-background);
            border-top: 1px solid var(--vscode-sideBarSectionHeader-border);
            border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
            user-select: none;
        }

        .builder-summary:hover {
            background-color: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
            opacity: 1;
        }

        .builder-summary::before {
            content: '▶';
            font-size: 0.5rem;
            transition: transform 0.12s ease;
            display: inline-block;
            opacity: 0.7;
        }

        details[open] > .builder-summary::before {
            transform: rotate(90deg);
        }

        details#builder-tools > section.card {
            padding: 8px 8px 0;
        }

        ul {
            margin: 0;
            padding-left: 20px;
            line-height: 1.6;
        }

        li + li {
            margin-top: 4px;
        }

        .invalid {
            outline: 2px solid var(--vscode-inputValidation-errorBorder);
        }

        /* Custom class for danger button styling */
        .danger-button {
            background-color: var(--vscode-button-secondaryBackground) !important;
            color: var(--vscode-errorForeground) !important;
        }

        .danger-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground) !important;
        }

        @media (max-width: 460px) {
            .color-row,
            .color-add {
                grid-template-columns: auto 1fr;
                grid-template-rows: auto auto auto;
            }
        }

        /* Custom Color Picker Modal */
        .color-picker-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.6);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }

        .color-picker-modal.active {
            display: flex;
        }

        .color-picker-panel {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 16px;
            min-width: 320px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        }

        .color-picker-title {
            font-weight: 600;
            margin-bottom: 12px;
        }

        .color-picker-main {
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
        }

        .color-picker-square {
            width: 200px;
            height: 200px;
            position: relative;
            cursor: crosshair;
            border: 1px solid var(--vscode-input-border);
        }

        .color-picker-square-gradient {
            width: 100%;
            height: 100%;
            background: linear-gradient(to top, #000, transparent),
                        linear-gradient(to right, #fff, transparent);
        }

        .color-picker-cursor {
            position: absolute;
            width: 12px;
            height: 12px;
            border: 2px solid #fff;
            border-radius: 50%;
            margin: -6px 0 0 -6px;
            box-shadow: 0 0 0 1px #000;
            pointer-events: none;
        }

        .color-picker-hue {
            width: 20px;
            height: 200px;
            position: relative;
            cursor: pointer;
            border: 1px solid var(--vscode-input-border);
            background: linear-gradient(to bottom,
                #f00 0%, #ff0 17%, #0f0 33%,
                #0ff 50%, #00f 67%, #f0f 83%, #f00 100%);
        }

        .color-picker-hue-cursor {
            position: absolute;
            left: -2px;
            width: 24px;
            height: 4px;
            background: #fff;
            border: 1px solid #000;
            margin-top: -2px;
            pointer-events: none;
        }

        .color-picker-preview {
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
        }

        .color-preview-box {
            width: 48px;
            height: 48px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
        }

        .color-picker-inputs {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .color-picker-input-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .color-picker-input-row label {
            width: 32px;
            font-size: 0.85rem;
        }

        .color-picker-input-row vscode-text-field {
            flex: 1;
        }

        .color-picker-buttons {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }
    </style>
</head>
<body>
    <!-- Custom Color Picker Modal -->
    <div class="color-picker-modal" id="color-picker-modal">
        <div class="color-picker-panel">
            <div class="color-picker-title">Choose Color</div>
            <div class="color-picker-main">
                <div class="color-picker-square" id="picker-square">
                    <div class="color-picker-square-gradient" id="picker-square-gradient"></div>
                    <div class="color-picker-cursor" id="picker-square-cursor"></div>
                </div>
                <div class="color-picker-hue" id="picker-hue">
                    <div class="color-picker-hue-cursor" id="picker-hue-cursor"></div>
                </div>
            </div>
            <div class="color-picker-preview">
                <div class="color-preview-box" id="picker-preview"></div>
                <div class="color-picker-inputs">
                    <div class="color-picker-input-row">
                        <label>R</label>
                        <vscode-text-field id="picker-r" type="number" min="0" max="255" value="0"></vscode-text-field>
                    </div>
                    <div class="color-picker-input-row">
                        <label>G</label>
                        <vscode-text-field id="picker-g" type="number" min="0" max="255" value="0"></vscode-text-field>
                    </div>
                    <div class="color-picker-input-row">
                        <label>B</label>
                        <vscode-text-field id="picker-b" type="number" min="0" max="255" value="0"></vscode-text-field>
                    </div>
                </div>
            </div>
            <div class="color-picker-input-row" style="margin-bottom: 12px;">
                <label>Hex</label>
                <vscode-text-field id="picker-hex" value="#000000"></vscode-text-field>
            </div>
            <div class="color-picker-buttons">
                <vscode-button id="picker-cancel" appearance="secondary">Cancel</vscode-button>
                <vscode-button id="picker-ok" appearance="primary">OK</vscode-button>
            </div>
        </div>
    </div>

    <div class="shell">
        <section class="library-section">
            <div class="library-header">
                <span class="library-title">Palette Library</span>
                <div class="library-header-actions">
                    <vscode-button id="new-palette-add" appearance="icon" title="Add palette"><span class="codicon codicon-add"></span></vscode-button>
                    <a class="library-help" href="#guide" title="Reference guide"><span class="codicon codicon-book"></span></a>
                </div>
            </div>
            <div class="palette-list" id="palette-list"></div>
        </section>
        <main>
            <details id="builder-tools">
                <summary class="builder-summary">Builder Tools</summary>
            <section class="card" id="palettes" style="--delay: 0.05s;">
                <div class="palette-grid">
                    <div class="panel-block">
                        <div class="panel-title">Palette Editor</div>
                        <div class="field">
                            <label for="palette-name">Palette name</label>
                            <vscode-text-field id="palette-name" placeholder="My Palette"></vscode-text-field>
                        </div>
                        <div class="field">
                            <label for="palette-type">Palette type</label>
                            <vscode-dropdown id="palette-type">
                                <vscode-option value="regular">Categorical (regular)</vscode-option>
                                <vscode-option value="ordered-sequential">Sequential (ordered-sequential)</vscode-option>
                                <vscode-option value="ordered-diverging">Diverging (ordered-diverging)</vscode-option>
                            </vscode-dropdown>
                        </div>

                        <div class="color-builder">
                            <div class="color-add">
                                <input id="new-color-picker" type="color" value="#F4B860" aria-label="New color picker">
                                <vscode-text-field id="new-color-hex" value="#F4B860" aria-label="New color hex"></vscode-text-field>
                                <vscode-button id="add-color" appearance="secondary">Add Color</vscode-button>
                            </div>
                            <div id="colors-list"></div>
                        </div>

                        <div class="button-grid">
                            <vscode-button id="save-palette" appearance="primary">Save Palette</vscode-button>
                            <vscode-button id="new-palette" appearance="secondary">New Palette</vscode-button>
                            <vscode-button id="archive-palette" appearance="secondary">Archive Palette</vscode-button>
                            <vscode-button id="delete-palette" appearance="secondary" class="danger-button">Delete Palette</vscode-button>
                            <vscode-button id="apply-to-workbook" appearance="secondary">Apply to Active Workbook</vscode-button>
                        </div>
                    </div>

                    <vscode-divider></vscode-divider>

                    <div class="panel-block">
                        <div class="panel-title">Advanced Gradient Generator</div>
                        <div class="generator">
                            <div class="field">
                                <label for="scale-base-picker">Base Color</label>
                                <div class="generator-row">
                                    <input id="scale-base-picker" type="color" value="#5CB8B2" aria-label="Scale base color">
                                    <vscode-text-field id="scale-base-hex" value="#5CB8B2" aria-label="Scale base hex"></vscode-text-field>
                                </div>
                            </div>
                            <div class="field">
                                <label for="scale-steps">Steps</label>
                                <vscode-text-field id="scale-steps" type="number" min="3" max="15" value="9" aria-label="Scale steps"></vscode-text-field>
                            </div>
                            <div class="field">
                                <label for="scale-easing">Easing Curve</label>
                                <vscode-dropdown id="scale-easing">
                                    <vscode-option value="linear">Linear</vscode-option>
                                    <vscode-option value="easeIn">Ease In (slower start)</vscode-option>
                                    <vscode-option value="easeOut" selected>Ease Out (slower end)</vscode-option>
                                    <vscode-option value="easeInOut">Ease In Out (smooth)</vscode-option>
                                </vscode-dropdown>
                            </div>
                            <vscode-button id="scale-generate" appearance="secondary" style="width: 100%;">Generate Scale</vscode-button>
                            <div class="scale-preview" id="scale-preview"></div>
                            <div class="preview-actions">
                                <vscode-button id="scale-apply" appearance="primary">Apply to Editor</vscode-button>
                            </div>
                        </div>
                        <div class="panel-title" style="margin-top: 1.5rem;">Multi-Stop Gradient</div>
                        <div class="generator">
                            <div class="field">
                                <label for="blend-start-picker">Start Color</label>
                                <div class="generator-row">
                                    <input id="blend-start-picker" type="color" value="#F4B860" aria-label="Blend start color">
                                    <vscode-text-field id="blend-start-hex" value="#F4B860" aria-label="Blend start hex"></vscode-text-field>
                                </div>
                            </div>
                            <div class="field">
                                <label for="blend-end-picker">End Color</label>
                                <div class="generator-row">
                                    <input id="blend-end-picker" type="color" value="#3D5A80" aria-label="Blend end color">
                                    <vscode-text-field id="blend-end-hex" value="#3D5A80" aria-label="Blend end hex"></vscode-text-field>
                                </div>
                            </div>
                            <div class="field">
                                <label for="blend-steps">Steps</label>
                                <vscode-text-field id="blend-steps" type="number" min="3" max="15" value="7" aria-label="Blend steps"></vscode-text-field>
                            </div>
                            <div class="field">
                                <label for="blend-easing">Easing Curve</label>
                                <vscode-dropdown id="blend-easing">
                                    <vscode-option value="linear" selected>Linear</vscode-option>
                                    <vscode-option value="easeIn">Ease In (slower start)</vscode-option>
                                    <vscode-option value="easeOut">Ease Out (slower end)</vscode-option>
                                    <vscode-option value="easeInOut">Ease In Out (smooth)</vscode-option>
                                </vscode-dropdown>
                            </div>
                            <div class="field">
                                <label for="blend-colorspace">Color Space</label>
                                <vscode-dropdown id="blend-colorspace">
                                    <vscode-option value="lab" selected>LAB (perceptual)</vscode-option>
                                    <vscode-option value="rgb">RGB (direct)</vscode-option>
                                    <vscode-option value="hsl">HSL (hue-based)</vscode-option>
                                </vscode-dropdown>
                            </div>
                            <vscode-button id="blend-generate" appearance="secondary" style="width: 100%;">Generate Gradient</vscode-button>
                            <div class="scale-preview" id="blend-preview"></div>
                            <div class="preview-actions">
                                <vscode-button id="blend-apply" appearance="primary">Apply to Editor</vscode-button>
                            </div>
                        </div>
                    </div>

                    <vscode-divider></vscode-divider>

                    <div class="panel-block">
                        <div class="panel-title">Theme Vault</div>
                        <div class="theme-list" id="theme-list"></div>
                    </div>

                    <vscode-divider></vscode-divider>

                    <div class="panel-block">
                        <div class="panel-title">File Actions</div>
                        <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                            <vscode-button id="save-file" appearance="primary" style="flex: 1;">Save</vscode-button>
                            <vscode-button id="reload-file" appearance="secondary" style="flex: 1;">Reload</vscode-button>
                        </div>
                        <details style="margin-bottom: 12px;">
                            <summary style="font-size: 0.85rem;">More Actions</summary>
                            <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 8px;">
                                <vscode-button id="open-preferences" appearance="secondary">Open Template</vscode-button>
                                <vscode-button id="copy-preferences" appearance="secondary">Copy to Repository</vscode-button>
                            </div>
                        </details>

                        <div class="status" id="palette-status"></div>
                        <p class="note" id="palette-source" style="font-size: 0.8rem; margin: 4px 0;">Source: not loaded yet</p>
                    </div>
                </div>
            </section>
            </details>

            <vscode-divider></vscode-divider>

            <section class="card" id="guide">
                <details>
                    <summary><strong>Commands & Reference</strong></summary>
                    <div style="margin-top: 12px;">
                        <h3 style="font-size: 0.9rem; margin: 8px 0;">Most Used Commands</h3>
                        <ul style="font-size: 0.85rem;">
                            <li><code>Format Tableau Expression</code> and <code>Validate Tableau Expression</code></li>
                            <li><code>Insert IF Statement</code>, <code>Insert CASE Statement</code>, <code>Insert LOD Expression</code></li>
                            <li><code>Show Function Help</code> for hover and reference guidance</li>
                            <li><code>Extract Calculations</code> to build a clean workbook inventory</li>
                        </ul>

                        <h3 style="font-size: 0.9rem; margin: 16px 0 8px 0;">.twbl Parsing Tips</h3>
                        <ul style="font-size: 0.85rem;">
                            <li>Separate calculations with a blank line</li>
                            <li>Use header format: <code>// Name - description</code></li>
                            <li>Put <code>IF</code>, <code>THEN</code>, <code>ELSE</code>, <code>END</code> on their own lines</li>
                            <li>Align <code>END</code> with opening keyword</li>
                            <li>Avoid non-ASCII characters (smart quotes, emoji)</li>
                        </ul>
                    </div>
                </details>
            </section>
        </main>
    </div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        const paletteList = document.getElementById('palette-list');
        const paletteNameInput = document.getElementById('palette-name');
        const paletteTypeSelect = document.getElementById('palette-type');
        const colorsList = document.getElementById('colors-list');
        const newColorPicker = document.getElementById('new-color-picker');
        const newColorHex = document.getElementById('new-color-hex');
        const addColorButton = document.getElementById('add-color');
        const savePaletteButton = document.getElementById('save-palette');
        const newPaletteButton = document.getElementById('new-palette');
        const newPaletteAddButton = document.getElementById('new-palette-add');
        const archivePaletteButton = document.getElementById('archive-palette');
        const deletePaletteButton = document.getElementById('delete-palette');
        const applyToWorkbookButton = document.getElementById('apply-to-workbook');
        const saveFileButton = document.getElementById('save-file');
        const reloadFileButton = document.getElementById('reload-file');
        const openButton = document.getElementById('open-preferences');
        const copyButton = document.getElementById('copy-preferences');
        const statusLabel = document.getElementById('palette-status');
        const sourceLabel = document.getElementById('palette-source');
        const scaleBasePicker = document.getElementById('scale-base-picker');
        const scaleBaseHex = document.getElementById('scale-base-hex');
        const scaleSteps = document.getElementById('scale-steps');
        const scaleEasing = document.getElementById('scale-easing');
        const scaleGenerateButton = document.getElementById('scale-generate');
        const scalePreview = document.getElementById('scale-preview');
        const scaleApplyButton = document.getElementById('scale-apply');
        const blendStartPicker = document.getElementById('blend-start-picker');
        const blendStartHex = document.getElementById('blend-start-hex');
        const blendEndPicker = document.getElementById('blend-end-picker');
        const blendEndHex = document.getElementById('blend-end-hex');
        const blendSteps = document.getElementById('blend-steps');
        const blendEasing = document.getElementById('blend-easing');
        const blendColorspace = document.getElementById('blend-colorspace');
        const blendGenerateButton = document.getElementById('blend-generate');
        const blendPreview = document.getElementById('blend-preview');
        const blendApplyButton = document.getElementById('blend-apply');
        const themeList = document.getElementById('theme-list');

        const themePresets = [
            {
                name: 'Copper Noir',
                type: 'regular',
                tags: ['moody', 'studio', 'warm'],
                colors: ['#F4B860', '#E07A5F', '#D1495B', '#9B4F5B', '#6D3B47', '#3D405B', '#1F2A44', '#0F1C2E']
            },
            {
                name: 'Ocean Studio',
                type: 'regular',
                tags: ['cool', 'modern', 'clean'],
                colors: ['#D6F2F0', '#A3DAD4', '#5CB8B2', '#2A9D8F', '#1B6F8F', '#264653', '#0B1F2A']
            },
            {
                name: 'Dusty Atelier',
                type: 'regular',
                tags: ['neutral', 'vintage', 'paper'],
                colors: ['#F4ECE1', '#E7D2C0', '#D4B49E', '#BA907B', '#9B6B5A', '#6E4D44', '#3F2E2E']
            },
            {
                name: 'Botanical Lab',
                type: 'regular',
                tags: ['botanical', 'fresh', 'soft'],
                colors: ['#E9F5DB', '#CFE1B9', '#B5C99A', '#97A97C', '#87986A', '#718355', '#546A3A']
            },
            {
                name: 'Signal Drift',
                type: 'regular',
                tags: ['contrast', 'signal', 'night'],
                colors: ['#F6BD60', '#F28482', '#84A59D', '#4D6F6F', '#2F4858', '#1B263B', '#0D1B2A']
            },
            {
                name: 'Slate Archive',
                type: 'regular',
                tags: ['slate', 'archive', 'mono'],
                colors: ['#E8EDF2', '#C6D0DA', '#A1AFC1', '#7C8DA3', '#607089', '#445468', '#2F3843']
            },
            {
                name: 'Midnight Citrus',
                type: 'regular',
                tags: ['citrus', 'night', 'bold'],
                colors: ['#F4D35E', '#EE964B', '#F95738', '#EE6C4D', '#3D5A80', '#1B263B', '#0D1B2A']
            },
            {
                name: 'Quiet Bloom',
                type: 'regular',
                tags: ['bloom', 'soft', 'rose'],
                colors: ['#F8EDEB', '#F4D6CC', '#F1B5A7', '#D87C7C', '#A44354', '#7E3147', '#4E1D3A']
            }
        ];

        const state = {
            palettes: [],
            selectedName: '',
            scaleColors: [],
            blendColors: [],
            editor: {
                name: '',
                type: 'regular',
                colors: []
            }
        };

        const requiredElements = [
            paletteList,
            paletteNameInput,
            paletteTypeSelect,
            colorsList,
            newColorPicker,
            newColorHex,
            scaleBasePicker,
            scaleBaseHex,
            scaleSteps,
            scaleEasing,
            scaleGenerateButton,
            scalePreview,
            scaleApplyButton,
            blendStartPicker,
            blendStartHex,
            blendEndPicker,
            blendEndHex,
            blendSteps,
            blendEasing,
            blendColorspace,
            blendGenerateButton,
            blendPreview,
            blendApplyButton,
            themeList
        ];

        if (requiredElements.some(element => !element)) {
            if (statusLabel) {
                statusLabel.textContent = 'Palette editor failed to load.';
                statusLabel.className = 'status error';
            }
        } else {
            const normalizedScaleBase = normalizeHex(scaleBaseHex.value) || normalizeHex(scaleBasePicker.value);
            if (normalizedScaleBase) {
                scaleBaseHex.value = normalizedScaleBase;
                scaleBasePicker.value = normalizedScaleBase;
                scaleBaseHex.classList.remove('invalid');
            }

            const normalizedBlendStart = normalizeHex(blendStartPicker.value);
            if (normalizedBlendStart) {
                blendStartPicker.value = normalizedBlendStart;
            }
            const normalizedBlendEnd = normalizeHex(blendEndPicker.value);
            if (normalizedBlendEnd) {
                blendEndPicker.value = normalizedBlendEnd;
            }

            state.scaleColors = generateScaleColors(scaleBaseHex.value, normalizeSteps(scaleSteps.value, 9));
            state.blendColors = generateBlendColors(blendStartPicker.value, blendEndPicker.value, normalizeSteps(blendSteps.value, 7));

            paletteList.addEventListener('click', event => {
                const target = event.target;
                if (!(target instanceof HTMLElement)) {
                    return;
                }

                // Check if a card action button was clicked
                const actionButton = target.closest('[data-action]');
                if (actionButton instanceof HTMLElement) {
                    event.stopPropagation();
                    const idx = Number(actionButton.dataset.index);
                    const palette = state.palettes[idx];
                    if (!palette) {
                        return;
                    }
                    const action = actionButton.dataset.action;
                    if (action === 'apply') {
                        const colors = normalizeColorList(palette.colors).filter(Boolean);
                        vscode.postMessage({
                            type: 'applyToWorkbook',
                            palette: { name: palette.name, type: palette.type, colors }
                        });
                        setStatus('Applying \u201c' + escapeHtml(palette.name) + '\u201d to workbook\u2026', 'info');
                    } else if (action === 'edit') {
                        state.selectedName = palette.name;
                        state.editor = { name: palette.name, type: palette.type, colors: palette.colors.slice() };
                        const builderDetails = document.getElementById('builder-tools');
                        if (builderDetails instanceof HTMLDetailsElement) {
                            builderDetails.open = true;
                        }
                        renderAll();
                        if (builderDetails) {
                            builderDetails.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    } else if (action === 'archive') {
                        vscode.postMessage({ type: 'archivePalette', paletteName: palette.name });
                    }
                    return;
                }

                // Fall through: clicking the card body selects the palette
                const item = target.closest('.palette-item');
                if (!item) {
                    return;
                }
                const index = Number(item.dataset.index);
                const palette = state.palettes[index];
                if (!palette) {
                    return;
                }
                state.selectedName = palette.name;
                state.editor = {
                    name: palette.name,
                    type: palette.type,
                    colors: palette.colors.slice()
                };
                renderAll();
            });

            paletteList.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }
                const target = event.target;
                if (!(target instanceof HTMLElement)) {
                    return;
                }
                const item = target.closest('.palette-item');
                if (!item) {
                    return;
                }
                event.preventDefault();
                const index = Number(item.dataset.index);
                const palette = state.palettes[index];
                if (!palette) {
                    return;
                }
                state.selectedName = palette.name;
                state.editor = { name: palette.name, type: palette.type, colors: palette.colors.slice() };
                renderAll();
            });

            paletteNameInput.addEventListener('input', () => {
                state.editor.name = paletteNameInput.value;
            });

            paletteTypeSelect.addEventListener('change', () => {
                state.editor.type = paletteTypeSelect.value;
            });

            newColorPicker.addEventListener('input', () => {
                const normalized = normalizeHex(newColorPicker.value);
                if (normalized) {
                    newColorHex.value = normalized;
                    newColorHex.classList.remove('invalid');
                }
            });

            newColorHex.addEventListener('input', () => {
                const normalized = normalizeHex(newColorHex.value);
                if (normalized) {
                    newColorHex.classList.remove('invalid');
                    newColorHex.value = normalized;
                    newColorPicker.value = normalized;
                } else {
                    newColorHex.classList.add('invalid');
                }
            });

            if (addColorButton) {
                addColorButton.addEventListener('click', () => {
                    const normalized = normalizeHex(newColorHex.value) || normalizeHex(newColorPicker.value);
                    if (!normalized) {
                        setStatus('Enter a valid hex color before adding.', 'error');
                        return;
                    }
                    state.editor.colors.push(normalized);
                    renderColors();
                });
            }

            colorsList.addEventListener('input', event => {
                const target = event.target;
                if (!(target instanceof HTMLInputElement)) {
                    return;
                }
                const row = target.closest('.color-row');
                if (!row) {
                    return;
                }
                const index = Number(row.dataset.index);
                if (Number.isNaN(index) || !state.editor.colors[index]) {
                    return;
                }

                if (target.classList.contains('color-picker')) {
                    const normalized = normalizeHex(target.value);
                    if (normalized) {
                        state.editor.colors[index] = normalized;
                        const hexInput = row.querySelector('.color-hex');
                        if (hexInput instanceof HTMLInputElement) {
                            hexInput.value = normalized;
                            hexInput.classList.remove('invalid');
                        }
                    }
                }

                if (target.classList.contains('color-hex')) {
                    const normalized = normalizeHex(target.value);
                    if (normalized) {
                        target.classList.remove('invalid');
                        target.value = normalized;
                        state.editor.colors[index] = normalized;
                        const picker = row.querySelector('.color-picker');
                        if (picker instanceof HTMLInputElement) {
                            picker.value = normalized;
                        }
                    } else {
                        target.classList.add('invalid');
                    }
                }
            });

            colorsList.addEventListener('click', event => {
                const target = event.target;
                if (!(target instanceof HTMLElement)) {
                    return;
                }
                const button = target.closest('button[data-action]');
                if (!button) {
                    return;
                }
                const row = button.closest('.color-row');
                if (!row) {
                    return;
                }
                const index = Number(row.dataset.index);
                if (Number.isNaN(index)) {
                    return;
                }
                const action = button.dataset.action;
                if (action === 'remove') {
                    state.editor.colors.splice(index, 1);
                }
                if (action === 'up' && index > 0) {
                    const temp = state.editor.colors[index - 1];
                    state.editor.colors[index - 1] = state.editor.colors[index];
                    state.editor.colors[index] = temp;
                }
                if (action === 'down' && index < state.editor.colors.length - 1) {
                    const temp = state.editor.colors[index + 1];
                    state.editor.colors[index + 1] = state.editor.colors[index];
                    state.editor.colors[index] = temp;
                }
                renderColors();
            });

            if (savePaletteButton) {
                savePaletteButton.addEventListener('click', () => {
                    const name = paletteNameInput.value.trim();
                    if (!name) {
                        setStatus('Palette name is required.', 'error');
                        return;
                    }
                    const normalizedColors = state.editor.colors.map(color => normalizeHex(color));
                    if (normalizedColors.some(color => !color)) {
                        setStatus('Fix invalid colors before saving.', 'error');
                        return;
                    }
                    const colors = normalizedColors.filter(Boolean);
                    if (colors.length === 0) {
                        setStatus('Add at least one color before saving.', 'error');
                        return;
                    }
                    const palette = {
                        name,
                        type: normalizePaletteType(paletteTypeSelect.value),
                        colors
                    };
                    upsertPalette(palette);
                    state.selectedName = palette.name;
                    state.editor = {
                        name: palette.name,
                        type: palette.type,
                        colors: palette.colors.slice()
                    };
                    renderAll();
                    setStatus('Palette saved to the sidebar list.', 'success');
                });
            }

            if (newPaletteButton) {
                newPaletteButton.addEventListener('click', () => {
                    state.selectedName = '';
                    state.editor = {
                        name: '',
                        type: 'regular',
                        colors: []
                    };
                    paletteNameInput.value = '';
                    paletteTypeSelect.value = 'regular';
                    renderAll();
                    setStatus('New palette ready.', 'info');
                });
            }

            if (newPaletteAddButton) {
                newPaletteAddButton.addEventListener('click', () => {
                    state.selectedName = '';
                    state.editor = { name: '', type: 'regular', colors: [] };
                    if (paletteNameInput) {
                        paletteNameInput.value = '';
                    }
                    if (paletteTypeSelect) {
                        paletteTypeSelect.value = 'regular';
                    }
                    const builderDetails = document.getElementById('builder-tools');
                    if (builderDetails instanceof HTMLDetailsElement) {
                        builderDetails.open = true;
                    }
                    renderAll();
                    if (builderDetails) {
                        builderDetails.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                    setStatus('New palette ready.', 'info');
                });
            }

            if (deletePaletteButton) {
                deletePaletteButton.addEventListener('click', () => {
                    if (!state.selectedName) {
                        setStatus('Select a palette to delete.', 'error');
                        return;
                    }
                    vscode.postMessage({
                        type: 'deletePalette',
                        paletteName: state.selectedName
                    });
                });
            }

            if (archivePaletteButton) {
                archivePaletteButton.addEventListener('click', () => {
                    if (!state.selectedName) {
                        setStatus('Select a palette to archive.', 'error');
                        return;
                    }
                    vscode.postMessage({
                        type: 'archivePalette',
                        paletteName: state.selectedName
                    });
                });
            }

            if (applyToWorkbookButton) {
                applyToWorkbookButton.addEventListener('click', () => {
                    const name = paletteNameInput.value.trim();
                    if (!name) {
                        setStatus('Palette name is required before applying.', 'error');
                        return;
                    }
                    const normalizedColors = state.editor.colors.map(color => normalizeHex(color));
                    if (normalizedColors.some(color => !color)) {
                        setStatus('Fix invalid colors before applying.', 'error');
                        return;
                    }
                    const colors = normalizedColors.filter(Boolean);
                    if (colors.length === 0) {
                        setStatus('Add at least one color before applying.', 'error');
                        return;
                    }

                    vscode.postMessage({
                        type: 'applyToWorkbook',
                        palette: {
                            name,
                            type: normalizePaletteType(paletteTypeSelect.value),
                            colors
                        }
                    });
                });
            }

            if (saveFileButton) {
                saveFileButton.addEventListener('click', () => {
                    vscode.postMessage({
                        type: 'savePalettes',
                        palettes: state.palettes
                    });
                });
            }

            if (reloadFileButton) {
                reloadFileButton.addEventListener('click', () => {
                    vscode.postMessage({ type: 'requestPalettes' });
                });
            }

            if (openButton) {
                openButton.addEventListener('click', () => {
                    vscode.postMessage({ type: 'openPreferencesTemplate' });
                });
            }

            if (copyButton) {
                copyButton.addEventListener('click', () => {
                    vscode.postMessage({ type: 'copyPreferencesToRepository' });
                });
            }

            scaleBasePicker.addEventListener('input', () => {
                const normalized = normalizeHex(scaleBasePicker.value);
                if (normalized) {
                    scaleBaseHex.value = normalized;
                    scaleBaseHex.classList.remove('invalid');
                }
            });

            scaleBaseHex.addEventListener('input', () => {
                const normalized = normalizeHex(scaleBaseHex.value);
                if (normalized) {
                    scaleBaseHex.classList.remove('invalid');
                    scaleBaseHex.value = normalized;
                    scaleBasePicker.value = normalized;
                } else {
                    scaleBaseHex.classList.add('invalid');
                }
            });

            blendStartHex.addEventListener('input', () => {
                const normalized = normalizeHex(blendStartHex.value);
                if (normalized) {
                    blendStartHex.classList.remove('invalid');
                    blendStartHex.value = normalized;
                    blendStartPicker.value = normalized;
                } else {
                    blendStartHex.classList.add('invalid');
                }
            });

            blendStartPicker.addEventListener('input', () => {
                const normalized = normalizeHex(blendStartPicker.value);
                if (normalized) {
                    blendStartHex.value = normalized;
                    blendStartHex.classList.remove('invalid');
                }
            });

            blendEndHex.addEventListener('input', () => {
                const normalized = normalizeHex(blendEndHex.value);
                if (normalized) {
                    blendEndHex.classList.remove('invalid');
                    blendEndHex.value = normalized;
                    blendEndPicker.value = normalized;
                } else {
                    blendEndHex.classList.add('invalid');
                }
            });

            blendEndPicker.addEventListener('input', () => {
                const normalized = normalizeHex(blendEndPicker.value);
                if (normalized) {
                    blendEndHex.value = normalized;
                    blendEndHex.classList.remove('invalid');
                }
            });

            scaleGenerateButton.addEventListener('click', () => {
                const base = normalizeHex(scaleBaseHex.value) || normalizeHex(scaleBasePicker.value);
                if (!base) {
                    scaleBaseHex.classList.add('invalid');
                    setStatus('Enter a valid hex color for the scale base.', 'error');
                    return;
                }
                const steps = normalizeSteps(scaleSteps.value, 9);
                const easing = scaleEasing.value || 'easeOut';
                scaleSteps.value = String(steps);
                scaleBaseHex.value = base;
                scaleBasePicker.value = base;

                const colors = generateScaleColors(base, steps, easing);
                if (colors.length === 0) {
                    setStatus('Unable to generate scale colors.', 'error');
                    return;
                }
                state.scaleColors = colors;
                renderScalePreview();
                setStatus('Scale ready. Use Apply to Editor to load it.', 'info');
            });

            scaleApplyButton.addEventListener('click', () => {
                if (state.scaleColors.length === 0) {
                    setStatus('Generate a scale before applying.', 'error');
                    return;
                }
                applyGeneratedPalette(state.scaleColors, 'ordered-sequential');
                setStatus('Scale applied to the editor.', 'success');
            });

            blendGenerateButton.addEventListener('click', () => {
                const start = normalizeHex(blendStartHex.value) || normalizeHex(blendStartPicker.value);
                const end = normalizeHex(blendEndHex.value) || normalizeHex(blendEndPicker.value);
                if (!start || !end) {
                    setStatus('Select valid blend colors.', 'error');
                    return;
                }
                const steps = normalizeSteps(blendSteps.value, 7);
                const easing = blendEasing.value || 'linear';
                const colorspace = blendColorspace.value || 'lab';
                blendSteps.value = String(steps);
                blendStartHex.value = start;
                blendStartPicker.value = start;
                blendEndHex.value = end;
                blendEndPicker.value = end;

                const colors = generateBlendColors(start, end, steps, easing, colorspace);
                if (colors.length === 0) {
                    setStatus('Unable to blend colors.', 'error');
                    return;
                }
                state.blendColors = colors;
                renderBlendPreview();
                setStatus('Gradient ready. Use Apply to Editor to load it.', 'info');
            });

            blendApplyButton.addEventListener('click', () => {
                if (state.blendColors.length === 0) {
                    setStatus('Generate a blend before applying.', 'error');
                    return;
                }
                applyGeneratedPalette(state.blendColors, 'ordered-diverging');
                setStatus('Blend applied to the editor.', 'success');
            });

            themeList.addEventListener('click', event => {
                const target = event.target;
                if (!(target instanceof HTMLElement)) {
                    return;
                }
                const button = target.closest('[data-action="add-theme"]');
                if (!button) {
                    return;
                }
                const index = Number(button.dataset.index);
                if (Number.isNaN(index)) {
                    return;
                }
                const theme = themePresets[index];
                if (!theme) {
                    setStatus('No theme available.', 'error');
                    return;
                }
                const colors = normalizeColorList(theme.colors);
                if (colors.length === 0) {
                    setStatus('Theme has no colors.', 'error');
                    return;
                }
                const palette = {
                    name: ensureUniqueName(theme.name),
                    type: normalizePaletteType(theme.type),
                    colors
                };

                upsertPalette(palette);
                state.selectedName = palette.name;
                state.editor = {
                    name: palette.name,
                    type: palette.type,
                    colors: palette.colors.slice()
                };
                renderAll();
                setStatus('Theme "' + theme.name + '" added to your palette library.', 'success');
            });

            window.addEventListener('message', event => {
                const message = event.data;
                if (!message || typeof message !== 'object') {
                    return;
                }
                if (message.type === 'contextChanged' && message.context) {
                    updateSourceLabel(message.context.sourceLabel, message.context.sourceUri);
                }
                if (message.type === 'palettesLoaded') {
                    state.palettes = coercePaletteList(message.palettes);
                    const selected = state.selectedName
                        ? state.palettes.find(item => item.name === state.selectedName)
                        : state.palettes[0];
                    if (selected) {
                        state.selectedName = selected.name;
                        state.editor = {
                            name: selected.name,
                            type: selected.type,
                            colors: selected.colors.slice()
                        };
                    } else {
                        state.selectedName = '';
                        state.editor = {
                            name: '',
                            type: 'regular',
                            colors: []
                        };
                    }
                    updateSourceLabel(message.sourceLabel, message.sourcePath);
                    renderAll();
                }
                if (message.type === 'paletteStatus') {
                    setStatus(message.message || 'Update complete.', message.tone || 'info');
                }
            });

            renderAll();
            vscode.postMessage({ type: 'requestPalettes' });
        }

        function renderAll() {
            renderPaletteList();
            renderColors();
            renderThemes();
            renderScalePreview();
            renderBlendPreview();
            if (paletteNameInput) {
                paletteNameInput.value = state.editor.name;
            }
            if (paletteTypeSelect) {
                paletteTypeSelect.value = normalizePaletteType(state.editor.type || 'regular');
            }
        }

        function renderPaletteList() {
            if (!paletteList) {
                return;
            }
            if (state.palettes.length === 0) {
                paletteList.innerHTML = '<div class="note">No palettes loaded.</div>';
                return;
            }
            paletteList.innerHTML = state.palettes.map((palette, index) => {
                const colors = normalizeColorList(palette.colors);
                const activeClass = palette.name === state.selectedName ? ' active' : '';
                const paletteType = escapeHtml(palette.type || 'regular');
                const paletteName = escapeHtml(palette.name);
                const gradient = buildGradient(colors);
                return [
                    '<div class="palette-item' + activeClass + '" data-index="' + index + '" role="button" tabindex="0">',
                    '    <div class="palette-bar" style="background:' + gradient + ';"></div>',
                    '    <div class="palette-row">',
                    '        <span class="palette-name">' + paletteName + '</span>',
                    '        <div class="palette-actions">',
                    '            <vscode-button class="action-apply" data-action="apply" data-index="' + index + '" appearance="icon" title="Apply to workbook">\u26A1</vscode-button>',
                    '            <vscode-button class="action-edit" data-action="edit" data-index="' + index + '" appearance="icon" title="Edit palette">\u270E</vscode-button>',
                    '            <vscode-button class="action-archive" data-action="archive" data-index="' + index + '" appearance="icon" title="Archive palette">\u22EF</vscode-button>',
                    '        </div>',
                    '    </div>',
                    '    <div class="palette-meta">',
                    '        <span>' + paletteType + '</span>',
                    '        <span>\u00B7</span>',
                    '        <span>' + colors.length + ' colors</span>',
                    '    </div>',
                    '</div>'
                ].join('');
            }).join('');
        }

        function renderColors() {
            if (!colorsList) {
                return;
            }
            if (state.editor.colors.length === 0) {
                colorsList.innerHTML = '<div class="note">Add colors to begin.</div>';
                return;
            }
            colorsList.innerHTML = state.editor.colors.map((color, index) => {
                const normalized = normalizeHex(color);
                const pickerValue = normalized || '#000000';
                const hexValue = normalized || color;
                const invalidClass = normalized ? '' : ' invalid';
                return [
                    '<div class="color-row" data-index="' + index + '">',
                    '    <input class="color-picker" type="color" value="' + pickerValue + '" aria-label="Color ' + (index + 1) + '">',
                    '    <vscode-text-field class="color-hex' + invalidClass + '" value="' + escapeHtml(hexValue) + '" aria-label="Hex ' + (index + 1) + '"></vscode-text-field>',
                    '    <vscode-button data-action="up" appearance="icon"><span class="codicon codicon-arrow-up"></span></vscode-button>',
                    '    <vscode-button data-action="down" appearance="icon"><span class="codicon codicon-arrow-down"></span></vscode-button>',
                    '    <vscode-button data-action="remove" appearance="icon" class="danger-button"><span class="codicon codicon-trash"></span></vscode-button>',
                    '</div>'
                ].join('');
            }).join('');
        }

        function renderThemes() {
            if (!themeList) {
                return;
            }
            if (themePresets.length === 0) {
                themeList.innerHTML = '<div class="note">No theme presets available.</div>';
                return;
            }
            themeList.innerHTML = themePresets.map((theme, index) => {
                const colors = normalizeColorList(theme.colors);
                const gradient = buildGradient(colors);
                const name = escapeHtml(theme.name);
                const tags = Array.isArray(theme.tags) ? theme.tags.map(tag => escapeHtml(tag)).filter(Boolean) : [];
                const tagText = tags.length ? ' | ' + tags.join(', ') : '';
                const metaText = name + ' | ' + colors.length + ' colors' + tagText;
                return [
                    '<div class="theme-card" data-index="' + index + '">',
                    '    <div class="theme-card-content">',
                    '        <div class="theme-bar" style="background:' + gradient + ';"></div>',
                    '        <div class="theme-meta">' + metaText + '</div>',
                    '    </div>',
                    '    <div class="theme-card-actions">',
                    '        <vscode-button appearance="primary" data-action="add-theme" data-index="' + index + '">Add to Library</vscode-button>',
                    '    </div>',
                    '</div>'
                ].join('');
            }).join('');
        }

        function renderScalePreview() {
            if (!scalePreview) {
                return;
            }
            if (state.scaleColors.length === 0) {
                scalePreview.innerHTML = '<div class="note">Generate a scale to preview.</div>';
                return;
            }
            scalePreview.innerHTML = state.scaleColors.map(color => {
                const safeColor = sanitizeColor(color);
                return [
                    '<div class="scale-swatch">',
                    '    <div class="scale-color" style="background:' + safeColor + ';"></div>',
                    '    <div class="scale-label">' + safeColor + '</div>',
                    '</div>'
                ].join('');
            }).join('');
        }

        function renderBlendPreview() {
            if (!blendPreview) {
                return;
            }
            if (state.blendColors.length === 0) {
                blendPreview.innerHTML = '<div class="note">Generate a blend to preview.</div>';
                return;
            }
            blendPreview.innerHTML = state.blendColors.map(color => {
                const safeColor = sanitizeColor(color);
                return [
                    '<div class="scale-swatch">',
                    '    <div class="scale-color" style="background:' + safeColor + ';"></div>',
                    '    <div class="scale-label">' + safeColor + '</div>',
                    '</div>'
                ].join('');
            }).join('');
        }

        function applyGeneratedPalette(colors, type) {
            state.editor.colors = colors.slice();
            state.editor.type = normalizePaletteType(type);
            renderAll();
        }

        function updateSourceLabel(label, path) {
            if (!sourceLabel) {
                return;
            }
            const text = label ? 'Source: ' + label : 'Source: not available';
            sourceLabel.textContent = text;
            sourceLabel.title = path || '';
        }

        function setStatus(message, tone) {
            if (!statusLabel) {
                return;
            }
            statusLabel.textContent = message;
            statusLabel.className = 'status ' + (tone || 'info');
        }

        function normalizeHex(value) {
            if (typeof value !== 'string') {
                return '';
            }
            const trimmed = value.trim();
            if (!trimmed) {
                return '';
            }
            const hex = trimmed.startsWith('#') ? trimmed : '#' + trimmed;
            if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
                return '';
            }
            return hex.toUpperCase();
        }

        function sanitizeColor(value) {
            return normalizeHex(value) || '#000000';
        }

        function normalizeSteps(value, fallback) {
            const parsed = Number.parseInt(value, 10);
            if (!Number.isFinite(parsed)) {
                return fallback;
            }
            return clampNumber(parsed, 3, 15);
        }

        function normalizeColorList(colors) {
            if (!Array.isArray(colors)) {
                return [];
            }
            return colors.map(color => normalizeHex(color)).filter(Boolean);
        }

        function coercePaletteList(value) {
            if (!Array.isArray(value)) {
                return [];
            }
            const seen = new Set();
            const palettes = [];

            value.forEach(entry => {
                if (!entry || typeof entry.name !== 'string') {
                    return;
                }
                const name = entry.name.trim();
                if (!name) {
                    return;
                }
                const key = name.toLowerCase();
                if (seen.has(key)) {
                    return;
                }
                seen.add(key);

                const type = normalizePaletteType(entry.type);
                const colors = normalizeColorList(entry.colors);

                palettes.push({
                    name,
                    type,
                    colors
                });
            });

            return palettes;
        }

        function normalizePaletteType(value) {
            if (value === 'ordered-sequential' || value === 'ordered-diverging' || value === 'regular') {
                return value;
            }
            return 'regular';
        }

        function upsertPalette(palette) {
            const key = palette.name.toLowerCase();
            const existingIndex = state.palettes.findIndex(item => item.name.toLowerCase() === key);
            if (existingIndex >= 0) {
                state.palettes[existingIndex] = palette;
                return;
            }
            state.palettes.push(palette);
        }

        function ensureUniqueName(baseName) {
            const seed = typeof baseName === 'string' && baseName.trim() ? baseName.trim() : 'Untitled Palette';
            let candidate = seed;
            let index = 2;
            while (state.palettes.some(palette => palette.name.toLowerCase() === candidate.toLowerCase())) {
                candidate = seed + ' ' + index;
                index += 1;
            }
            return candidate;
        }

        function buildGradient(colors) {
            if (!Array.isArray(colors) || colors.length === 0) {
                return 'linear-gradient(90deg, #2F3843 0%, #4E5C6C 100%)';
            }
            const safeColors = colors.map(sanitizeColor);
            if (safeColors.length === 1) {
                return 'linear-gradient(90deg, ' + safeColors[0] + ' 0%, ' + safeColors[0] + ' 100%)';
            }
            const stops = safeColors.map((color, index) => {
                const percent = Math.round((index / (safeColors.length - 1)) * 100);
                return color + ' ' + percent + '%';
            }).join(', ');
            return 'linear-gradient(90deg, ' + stops + ')';
        }

        function generateScaleColors(baseHex, steps, easingType) {
            const normalized = normalizeHex(baseHex);
            if (!normalized) {
                return [];
            }
            const rgb = hexToRgb(normalized);
            if (!rgb) {
                return [];
            }

            // Convert to LAB for perceptually uniform scaling
            const baseLab = rgbToLab(rgb);
            const count = Math.max(2, steps);
            const colors = [];

            // Create lighter and darker versions
            const lightLab = { l: Math.min(baseLab.l + 40, 95), a: baseLab.a, b: baseLab.b };
            const darkLab = { l: Math.max(baseLab.l - 40, 10), a: baseLab.a, b: baseLab.b };

            for (let i = 0; i < count; i += 1) {
                let t = count === 1 ? 0 : i / (count - 1);
                t = applyEasing(t, easingType);

                const l = lightLab.l + (darkLab.l - lightLab.l) * t;
                const a = lightLab.a + (darkLab.a - lightLab.a) * t;
                const b = lightLab.b + (darkLab.b - lightLab.b) * t;

                const stepRgb = labToRgb({ l, a, b });
                colors.push(rgbToHex(stepRgb));
            }

            return colors;
        }

        function generateBlendColors(startHex, endHex, steps, easingType, colorspace) {
            const startRgb = hexToRgb(startHex);
            const endRgb = hexToRgb(endHex);
            if (!startRgb || !endRgb) {
                return [];
            }

            const count = Math.max(2, steps);
            const colors = [];

            if (colorspace === 'lab') {
                // LAB interpolation (perceptually uniform)
                const startLab = rgbToLab(startRgb);
                const endLab = rgbToLab(endRgb);

                for (let i = 0; i < count; i += 1) {
                    let t = count === 1 ? 0 : i / (count - 1);
                    t = applyEasing(t, easingType);

                    const l = startLab.l + (endLab.l - startLab.l) * t;
                    const a = startLab.a + (endLab.a - startLab.a) * t;
                    const b = startLab.b + (endLab.b - startLab.b) * t;

                    const rgb = labToRgb({ l, a, b });
                    colors.push(rgbToHex(rgb));
                }
            } else if (colorspace === 'hsl') {
                // HSL interpolation (hue-based)
                const startHsl = rgbToHsl(startRgb);
                const endHsl = rgbToHsl(endRgb);

                for (let i = 0; i < count; i += 1) {
                    let t = count === 1 ? 0 : i / (count - 1);
                    t = applyEasing(t, easingType);

                    const h = startHsl.h + (endHsl.h - startHsl.h) * t;
                    const s = startHsl.s + (endHsl.s - startHsl.s) * t;
                    const l = startHsl.l + (endHsl.l - startHsl.l) * t;

                    const rgb = hslToRgb({ h, s, l });
                    colors.push(rgbToHex(rgb));
                }
            } else {
                // RGB interpolation (direct)
                for (let i = 0; i < count; i += 1) {
                    let t = count === 1 ? 0 : i / (count - 1);
                    t = applyEasing(t, easingType);

                    const r = Math.round(startRgb.r + (endRgb.r - startRgb.r) * t);
                    const g = Math.round(startRgb.g + (endRgb.g - startRgb.g) * t);
                    const b = Math.round(startRgb.b + (endRgb.b - startRgb.b) * t);
                    colors.push(rgbToHex({ r, g, b }));
                }
            }

            return colors;
        }

        function applyEasing(t, type) {
            switch (type) {
                case 'easeIn':
                    return t * t * t;
                case 'easeOut':
                    return 1 - Math.pow(1 - t, 3);
                case 'easeInOut':
                    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
                default:
                    return t;
            }
        }

        function hexToRgb(value) {
            const normalized = normalizeHex(value);
            if (!normalized) {
                return null;
            }
            const hex = normalized.slice(1);
            const r = Number.parseInt(hex.slice(0, 2), 16);
            const g = Number.parseInt(hex.slice(2, 4), 16);
            const b = Number.parseInt(hex.slice(4, 6), 16);
            if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
                return null;
            }
            return { r, g, b };
        }

        function rgbToHex(rgb) {
            const r = clampNumber(Math.round(rgb.r), 0, 255);
            const g = clampNumber(Math.round(rgb.g), 0, 255);
            const b = clampNumber(Math.round(rgb.b), 0, 255);
            const hex = '#' + r.toString(16).padStart(2, '0')
                + g.toString(16).padStart(2, '0')
                + b.toString(16).padStart(2, '0');
            return hex.toUpperCase();
        }

        function rgbToHsl(rgb) {
            const r = clampNumber(rgb.r, 0, 255) / 255;
            const g = clampNumber(rgb.g, 0, 255) / 255;
            const b = clampNumber(rgb.b, 0, 255) / 255;
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            let h = 0;
            let s = 0;
            const l = (max + min) / 2;

            if (max !== min) {
                const d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                switch (max) {
                    case r:
                        h = (g - b) / d + (g < b ? 6 : 0);
                        break;
                    case g:
                        h = (b - r) / d + 2;
                        break;
                    default:
                        h = (r - g) / d + 4;
                        break;
                }
                h /= 6;
            }

            return {
                h: h * 360,
                s: s * 100,
                l: l * 100
            };
        }

        function hslToRgb(hsl) {
            const h = ((hsl.h % 360) + 360) % 360 / 360;
            const s = clampNumber(hsl.s, 0, 100) / 100;
            const l = clampNumber(hsl.l, 0, 100) / 100;

            if (s === 0) {
                const gray = Math.round(l * 255);
                return { r: gray, g: gray, b: gray };
            }

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;

            const r = hueToRgb(p, q, h + 1 / 3);
            const g = hueToRgb(p, q, h);
            const b = hueToRgb(p, q, h - 1 / 3);

            return {
                r: Math.round(r * 255),
                g: Math.round(g * 255),
                b: Math.round(b * 255)
            };
        }

        function hueToRgb(p, q, t) {
            let value = t;
            if (value < 0) {
                value += 1;
            }
            if (value > 1) {
                value -= 1;
            }
            if (value < 1 / 6) {
                return p + (q - p) * 6 * value;
            }
            if (value < 1 / 2) {
                return q;
            }
            if (value < 2 / 3) {
                return p + (q - p) * (2 / 3 - value) * 6;
            }
            return p;
        }

        function rgbToLab(rgb) {
            // RGB to XYZ
            let r = rgb.r / 255;
            let g = rgb.g / 255;
            let b = rgb.b / 255;

            r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
            g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
            b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

            let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) * 100;
            let y = (r * 0.2126 + g * 0.7152 + b * 0.0722) * 100;
            let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) * 100;

            // XYZ to LAB
            x = x / 95.047;
            y = y / 100.000;
            z = z / 108.883;

            x = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x) + 16/116;
            y = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y) + 16/116;
            z = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z) + 16/116;

            return {
                l: (116 * y) - 16,
                a: 500 * (x - y),
                b: 200 * (y - z)
            };
        }

        function labToRgb(lab) {
            // LAB to XYZ
            let y = (lab.l + 16) / 116;
            let x = lab.a / 500 + y;
            let z = y - lab.b / 200;

            x = Math.pow(x, 3) > 0.008856 ? Math.pow(x, 3) : (x - 16/116) / 7.787;
            y = Math.pow(y, 3) > 0.008856 ? Math.pow(y, 3) : (y - 16/116) / 7.787;
            z = Math.pow(z, 3) > 0.008856 ? Math.pow(z, 3) : (z - 16/116) / 7.787;

            x = x * 95.047;
            y = y * 100.000;
            z = z * 108.883;

            // XYZ to RGB
            x = x / 100;
            y = y / 100;
            z = z / 100;

            let r = x *  3.2406 + y * -1.5372 + z * -0.4986;
            let g = x * -0.9689 + y *  1.8758 + z *  0.0415;
            let b = x *  0.0557 + y * -0.2040 + z *  1.0570;

            r = r > 0.0031308 ? 1.055 * Math.pow(r, 1/2.4) - 0.055 : 12.92 * r;
            g = g > 0.0031308 ? 1.055 * Math.pow(g, 1/2.4) - 0.055 : 12.92 * g;
            b = b > 0.0031308 ? 1.055 * Math.pow(b, 1/2.4) - 0.055 : 12.92 * b;

            return {
                r: clampNumber(Math.round(r * 255), 0, 255),
                g: clampNumber(Math.round(g * 255), 0, 255),
                b: clampNumber(Math.round(b * 255), 0, 255)
            };
        }

        function clampNumber(value, min, max) {
            if (!Number.isFinite(value)) {
                return min;
            }
            return Math.min(max, Math.max(min, value));
        }

        function escapeHtml(value) {
            if (typeof value !== 'string') {
                return '';
            }
            return value
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
    </script>
</body>
</html>`;
}

function getNonce(): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i += 1) {
        nonce += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return nonce;
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}

function coercePalette(rawPalette: unknown): PaletteDefinition | null {
    if (!isPaletteDefinition(rawPalette)) {
        return null;
    }

    const name = rawPalette.name.trim();
    if (!name) {
        return null;
    }

    const colors = rawPalette.colors
        .filter((color): color is string => typeof color === 'string')
        .map(color => color.trim())
        .filter(Boolean);

    if (colors.length === 0) {
        return null;
    }

    return {
        name,
        type: sanitizePaletteType(rawPalette.type),
        colors
    };
}

function coercePalettes(rawPalettes: unknown): PaletteDefinition[] {
    if (!Array.isArray(rawPalettes)) {
        return [];
    }

    const seen = new Set<string>();
    const palettes: PaletteDefinition[] = [];

    for (const entry of rawPalettes) {
        if (!isPaletteDefinition(entry)) {
            continue;
        }

        const name = entry.name.trim();
        if (!name) {
            continue;
        }

        const key = name.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);

        const colors = entry.colors
            .filter((color): color is string => typeof color === 'string')
            .map(color => color.trim())
            .filter(Boolean);

        palettes.push({
            name,
            type: sanitizePaletteType(entry.type),
            colors
        });
    }

    return palettes;
}

function isPaletteDefinition(value: unknown): value is PaletteDefinition {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const palette = value as { name?: unknown; type?: unknown; colors?: unknown };
    if (typeof palette.name !== 'string' || typeof palette.type !== 'string') {
        return false;
    }

    if (!Array.isArray(palette.colors)) {
        return false;
    }

    return palette.colors.every(color => typeof color === 'string');
}

function sanitizePaletteType(type: string): PaletteType {
    if (type === 'ordered-sequential' || type === 'ordered-diverging' || type === 'regular') {
        return type;
    }
    return 'regular';
}
