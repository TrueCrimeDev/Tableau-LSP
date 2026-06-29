import * as vscode from 'vscode';
import { TextDecoder, promisify } from 'util';
import { exec } from 'child_process';
const execAsync = promisify(exec);
import { basename, dirname, join } from 'path';
import JSZip from 'jszip';

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
import { RichWorkbookData, WorkbookError } from '../types/workbook.js';
import { cleanXmlContent } from '../extract/xmlCleaner.js';
import { resolveNames } from '../extract/nameResolver.js';
import {
    extractCalcsFromXml,
    extractDatasourcesWithConnectionsFromXml,
    extractFieldsFromXml,
    extractWorksheetsFromXml
} from '../extract/xml.js';
import { filterAndDedupe, normalize, normalizeFormula } from '../extract/normalize.js';
import { generateNotesFile } from '../extract/outputGenerator.js';
import { extractFromFile } from '../extract/zip.js';
import { getLogger } from '../logging/logger.js';
import {
    readThemeFromXml,
    applyThemeEditsToXml,
    xmlToThemeJson,
    applyThemeJsonToXml,
    validateThemeJson,
    getXmlElementName,
    WorkbookTheme,
} from '../parsers/formattingTheme.js';

const log = getLogger();
const LOG_CAT = 'WorkbookInspector';
const BUILD_STAMP = 'v6-2026-02-24';

export const PARSING_GUIDE_VIEW_ID = 'tableauLanguageSupport.parsingGuide';
export const PARSING_GUIDE_CONTAINER_ID = 'tableauLsp';

class ParsingGuideViewProvider implements vscode.WebviewViewProvider {
    private view: vscode.WebviewView | undefined;
    private lastWorkbookUri: vscode.Uri | undefined;
    private postWorkbookPending = false;

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

            const payload = message as { type?: string; palettes?: unknown; palette?: unknown; paletteName?: unknown; path?: string; formula?: string; options?: unknown; edits?: unknown; mode?: string; json?: string; element?: string; };
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
                case 'parseWorkbook':
                    void this.postWorkbookData();
                    break;
                case 'importWorkbookPalette':
                    void this.importWorkbookPalette(payload.palette);
                    break;
                case 'extractCalculations':
                    void this.extractCalculationsToFile();
                    break;
                case 'openFormattingPanel':
                    void vscode.commands.executeCommand('tableauLanguageSupport.openFormattingPanel');
                    break;
                case 'locateElement':
                    void this.handleLocateElement(payload.element ?? '');
                    break;
                case 'applyFormattingEdits':
                    void this.handleFormattingApplyEdits((payload.edits ?? {}) as WorkbookTheme);
                    break;
                case 'pickFormattingImportFile':
                    void this.handleFormattingPickImportFile();
                    break;
                case 'importFormattingTheme':
                    void this.handleFormattingImportTheme(payload.path ?? '', (payload.mode ?? 'override') as 'override' | 'preserve');
                    break;
                case 'requestFormattingExport':
                    void this.handleFormattingExport();
                    break;
                case 'saveFormattingJson':
                    void this.handleFormattingJsonSave(payload.json ?? '');
                    break;
                case 'importPaletteFromFile':
                    void this.importPaletteFromFile();
                    break;
                case 'revealFile':
                    if (typeof payload.path === 'string') {
                        void vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(payload.path));
                    }
                    break;
                case 'copyFormula':
                    if (typeof payload.formula === 'string') {
                        void vscode.env.clipboard.writeText(payload.formula);
                    }
                    break;
                case 'insertFormula': {
                    const insertEditor = vscode.window.activeTextEditor;
                    const insertFormula = payload.formula ?? '';
                    if (insertEditor && insertFormula) {
                        void insertEditor.edit(eb => {
                            eb.insert(insertEditor.selection.active, insertFormula);
                        });
                    }
                    break;
                }
                case 'requestCalcBank':
                    void this.postCalcBankData();
                    break;
                case 'webviewDiag': {
                    const diagMsg = (payload as { message?: string }).message ?? '(no message)';
                    log.info(LOG_CAT, `[webview-diag] ${diagMsg}`);
                    break;
                }
                case 'openInTableau':
                    void this.openInTableau();
                    break;
                default:
                    break;
            }
        });

        view.webview.html = getGuideHtml(view.webview, this.context, getNonce());

        // Populate lastWorkbookUri from any already-open documents on first mount
        log.info(LOG_CAT, `resolveWebviewView [${BUILD_STAMP}]: view mounted, visible=${view.visible}`);
        log.info(LOG_CAT, `resolveWebviewView: workspace.textDocuments count=${vscode.workspace.textDocuments.length}`);
        for (const doc of vscode.workspace.textDocuments) {
            const p = doc.uri.path.toLowerCase();
            if (p.endsWith('.twb') || p.endsWith('.twbx')) {
                this.lastWorkbookUri = doc.uri;
                log.info(LOG_CAT, `resolveWebviewView: found .twb in textDocuments: ${doc.uri.fsPath}`);
                break;
            }
        }

        // Also scan open tabs (covers custom editors, large files not yet in textDocuments)
        if (!this.lastWorkbookUri) {
            const tabUri = this.findWorkbookUriFromTabs();
            if (tabUri) {
                this.lastWorkbookUri = tabUri;
                log.info(LOG_CAT, `resolveWebviewView: found .twb in open tabs: ${tabUri.fsPath}`);
            }
        }
        if (!this.lastWorkbookUri) {
            log.info(LOG_CAT, 'resolveWebviewView: no .twb found in textDocuments or tabs');
        }

        // Listen for text editor focus changes.
        // Only refresh when a workbook file becomes active — switching to a non-workbook
        // file (e.g. a .twbl file to paste into) should not reset the sidebar.
        this.context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor) {
                    const p = editor.document.uri.path.toLowerCase();
                    if (p.endsWith('.twb') || p.endsWith('.twbx')) {
                        this.lastWorkbookUri = editor.document.uri;
                        void this.postWorkbookData();
                    }
                }
            })
        );

        // Listen for newly opened documents (catches first-time file open before editor focus)
        this.context.subscriptions.push(
            vscode.workspace.onDidOpenTextDocument(doc => {
                const p = doc.uri.path.toLowerCase();
                if (p.endsWith('.twb') || p.endsWith('.twbx')) {
                    this.lastWorkbookUri = doc.uri;
                    void this.postWorkbookData();
                }
            })
        );

        // Listen for tab changes — catches custom editors that don't fire onDidChangeActiveTextEditor.
        // Only update when a workbook tab specifically becomes active; ignore all other tab changes
        // so switching to a non-workbook tab doesn't reset lastWorkbookUri to whichever .twb
        // happens to be first in the tab list.
        this.context.subscriptions.push(
            vscode.window.tabGroups.onDidChangeTabs(event => {
                for (const tab of event.changed) {
                    if (!tab.isActive) { continue; }
                    const input = tab.input as { uri?: vscode.Uri } | null | undefined;
                    const uri = input?.uri;
                    if (uri) {
                        const p = uri.path.toLowerCase();
                        if (p.endsWith('.twb') || p.endsWith('.twbx')) {
                            this.lastWorkbookUri = uri;
                            void this.postWorkbookData();
                        }
                    }
                }
            })
        );

        // Re-push all data whenever the view becomes visible (e.g. user switches to this panel).
        // postMessage silently drops messages when view.visible is false, so this ensures
        // the workbook inspector is populated as soon as the user can actually see it.
        view.onDidChangeVisibility(() => {
            log.info(LOG_CAT, `onDidChangeVisibility: visible=${view.visible}`);
            if (view.visible) {
                // Reset pending flag so debounce never suppresses this visibility-triggered refresh.
                this.postWorkbookPending = false;
                void this.postPaletteData();
                void this.postContextData();
                void this.postWorkbookData();
            }
        });

        // Explicitly push workbook data after a short delay to ensure the webview
        // has fully loaded its JS and the view is rendered.
        setTimeout(() => {
            log.info(LOG_CAT, `initial delayed postWorkbookData: view exists=${!!this.view}, visible=${this.view?.visible}`);
            void this.postWorkbookData();
        }, 500);

        view.onDidDispose(() => {
            if (this.view === view) {
                this.view = undefined;
            }
        });
    }

    /** Scans all open tabs for a .twb/.twbx, regardless of editor type. */
    private findWorkbookUriFromTabs(): vscode.Uri | undefined {
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                const input = tab.input as { uri?: vscode.Uri } | null | undefined;
                const uri = input?.uri;
                if (uri) {
                    const p = uri.path.toLowerCase();
                    if (p.endsWith('.twb') || p.endsWith('.twbx')) {
                        return uri;
                    }
                }
            }
        }
        return undefined;
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

        let workbookUri: vscode.Uri | undefined;
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const p = activeEditor.document.uri.path.toLowerCase();
            if (p.endsWith('.twb') || p.endsWith('.twbx')) {
                workbookUri = activeEditor.document.uri;
            }
        }
        if (!workbookUri && this.lastWorkbookUri) {
            workbookUri = this.lastWorkbookUri;
        }
        if (!workbookUri) {
            await this.postStatus('No active workbook file. Open a .twb file first.', 'error');
            return;
        }
        const path = workbookUri.path.toLowerCase();
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

    private async openInTableau(): Promise<void> {
        let workbookUri: vscode.Uri | undefined;
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const p = activeEditor.document.uri.path.toLowerCase();
            if (p.endsWith('.twb') || p.endsWith('.twbx')) { workbookUri = activeEditor.document.uri; }
        }
        if (!workbookUri && this.lastWorkbookUri) { workbookUri = this.lastWorkbookUri; }
        if (!workbookUri) {
            void vscode.window.showErrorMessage('No active workbook file. Open a .twb or .twbx file first.');
            return;
        }

        const isWsl = !!(process.env['WSL_DISTRO_NAME'] || process.env['WSL_INTEROP']);
        if (isWsl) {
            // WSL: vscode.env.openExternal can't reach Windows apps via /mnt/c/... paths.
            // Convert to a Windows path and invoke via cmd.exe.
            try {
                const linuxPath = workbookUri.fsPath;
                const { stdout } = await execAsync(`wslpath -w "${linuxPath.replace(/"/g, '\\"')}"`);
                const winPath = stdout.trim();
                await execAsync(`cmd.exe /c start "" "${winPath.replace(/"/g, '\\"')}"`);
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                void vscode.window.showErrorMessage(`Failed to open in Tableau: ${msg}`);
            }
        } else {
            await vscode.env.openExternal(workbookUri);
        }
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

    private async postWorkbookData(): Promise<void> {
        if (!this.view) {
            log.debug(LOG_CAT, 'postWorkbookData: no view, skipping');
            return;
        }

        // Debounce: coalesce rapid-fire calls into a single execution.
        if (this.postWorkbookPending) {
            log.debug(LOG_CAT, 'postWorkbookData: already pending, skipping duplicate');
            return;
        }
        this.postWorkbookPending = true;
        // Yield to allow other listeners to fire, then proceed.
        await new Promise<void>(resolve => setTimeout(resolve, 150));
        this.postWorkbookPending = false;

        // Re-check in case view was disposed or hidden during the wait.
        // postMessage silently returns false when view.visible is false, so there
        // is no point sending — onDidChangeVisibility will re-trigger when it shows.
        if (!this.view || !this.view.visible) {
            log.debug(LOG_CAT, `postWorkbookData: view not available after debounce (view=${!!this.view}, visible=${this.view?.visible})`);
            return;
        }

        // Resolve the workbook URI.
        // vscode.window.activeTextEditor is undefined when the sidebar webview has focus,
        // so we fall back to the last seen workbook and then to any visible text editor.
        let uri: vscode.Uri | undefined;
        let source = '';

        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const p = activeEditor.document.uri.path.toLowerCase();
            log.debug(LOG_CAT, `postWorkbookData: activeTextEditor path=${p}`);
            if (p.endsWith('.twb') || p.endsWith('.twbx')) {
                uri = activeEditor.document.uri;
                this.lastWorkbookUri = uri;
                source = 'activeTextEditor';
            }
        } else {
            log.debug(LOG_CAT, 'postWorkbookData: activeTextEditor is undefined');
        }

        if (!uri && this.lastWorkbookUri) {
            uri = this.lastWorkbookUri;
            source = 'lastWorkbookUri';
        }

        if (!uri) {
            const visibleTwb = vscode.window.visibleTextEditors.find(e => {
                const p = e.document.uri.path.toLowerCase();
                return p.endsWith('.twb') || p.endsWith('.twbx');
            });
            if (visibleTwb) {
                uri = visibleTwb.document.uri;
                this.lastWorkbookUri = uri;
                source = 'visibleTextEditors';
            }
        }

        // Fallback: scan all open tabs (catches custom editors, XML viewers, etc.)
        if (!uri) {
            const tabUri = this.findWorkbookUriFromTabs();
            if (tabUri) {
                uri = tabUri;
                this.lastWorkbookUri = uri;
                source = 'tabGroups';
            }
        }

        // Fallback: scan workspace.textDocuments directly
        if (!uri) {
            const openDoc = vscode.workspace.textDocuments.find(d => {
                const p = d.uri.path.toLowerCase();
                return p.endsWith('.twb') || p.endsWith('.twbx');
            });
            if (openDoc) {
                uri = openDoc.uri;
                this.lastWorkbookUri = uri;
                source = 'workspace.textDocuments';
            }
        }

        if (!uri) {
            log.info(LOG_CAT, 'postWorkbookData: no .twb/.twbx found anywhere, sending workbookCleared');
            await this.view.webview.postMessage({ type: 'workbookCleared' });
            return;
        }

        log.info(LOG_CAT, `postWorkbookData [${BUILD_STAMP}]: resolved from ${source} -> ${uri.fsPath}`);

        const lowerPath = uri.path.toLowerCase();

        try {
            const fileName = basename(uri.fsPath);
            let xml: string;

            if (lowerPath.endsWith('.twbx')) {
                log.info(LOG_CAT, 'postWorkbookData: reading .twbx archive');
                const data = await vscode.workspace.fs.readFile(uri);
                const zip = await JSZip.loadAsync(Buffer.from(data));
                const twbEntries = Object.entries(zip.files).filter(
                    ([entryPath, entry]) => !entry.dir && entryPath.toLowerCase().endsWith('.twb')
                );
                if (twbEntries.length === 0) {
                    throw new Error('No .twb file found in the .twbx archive');
                }
                xml = await twbEntries[0][1].async('string');
            } else {
                // Prefer getting text from an already-open VS Code document
                // (faster and avoids any workspace.fs.readFile edge cases).
                const openDoc = vscode.workspace.textDocuments.find(
                    d => d.uri.toString() === uri.toString()
                );
                if (openDoc) {
                    log.info(LOG_CAT, 'postWorkbookData: reading from open document');
                    xml = openDoc.getText();
                } else {
                    log.info(LOG_CAT, 'postWorkbookData: reading via workspace.fs.readFile');
                    const data = await vscode.workspace.fs.readFile(uri);
                    xml = new TextDecoder('utf-8').decode(data);
                }
            }
            log.info(LOG_CAT, `postWorkbookData: read XML, length=${xml.length}`);

            // Parse Tableau version from raw XML before cleaning
            const versionMatch = /source-build='(\d{4}\.\d+)/.exec(xml);
            const tableauVersion = versionMatch ? versionMatch[1] : '';

            // Clean and resolve names
            const cleaned = cleanXmlContent(xml);
            const resolved = resolveNames(cleaned);

            // Extract all data
            const calculations = extractCalcsFromXml(resolved, fileName);
            const datasourcesRaw = extractDatasourcesWithConnectionsFromXml(resolved, fileName);
            const fields = extractFieldsFromXml(resolved, fileName);
            const worksheets = extractWorksheetsFromXml(resolved, fileName);

            // Parse custom palettes directly from the XML we already have
            // (avoids a second file read via TWBParser).
            let palettes: PaletteDefinition[] = [];
            if (lowerPath.endsWith('.twb')) {
                try {
                    palettes = parsePalettes(xml);
                } catch {
                    palettes = [];
                }
            }

            log.info(LOG_CAT, `postWorkbookData: extracted ${calculations.length} calcs, ${datasourcesRaw.length} datasources, ${fields.length} fields, ${worksheets.length} worksheets, ${palettes.length} palettes`);

            const richData: RichWorkbookData = {
                fileName,
                filePath: uri.fsPath,
                tableauVersion,
                datasourceCount: datasourcesRaw.length,
                calcCount: calculations.length,
                sheetCount: worksheets.length,
                datasources: datasourcesRaw.map(ds => ({
                    caption: ds.caption ?? ds.name,
                    connectionClass: ds.connection?.class ?? 'unknown'
                })),
                calculations: calculations.map(c => ({
                    caption: c.title,
                    datatype: '',
                    formula: normalizeFormula(c.formula),
                    datasource: c.datasource
                })),
                fields: fields.map(f => ({
                    name: f.caption ?? f.name,
                    datatype: f.datatype ?? ''
                })),
                worksheets: worksheets.map(w => w.name),
                palettes
            };

            const posted = await this.view.webview.postMessage({
                type: 'workbookParsed',
                ...richData
            });
            log.info(LOG_CAT, `postWorkbookData: postMessage returned ${posted}`);
            void this.view.webview.postMessage({ type: 'formattingLoaded', elements: readThemeFromXml(xml) });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            log.warn(LOG_CAT, `postWorkbookData: ERROR during parse/send: ${msg}`);
            await this.view.webview.postMessage({ type: 'workbookError', message: msg });
        }
    }

    private async postCalcBankData(): Promise<void> {
        if (!this.view) { return; }
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            await this.view.webview.postMessage({ type: 'calcBankLoaded', calcs: [], error: 'No workspace folder open.' });
            return;
        }
        const bankUri = vscode.Uri.joinPath(folders[0].uri, '_calc_bank.twbl');
        let text: string;
        try {
            const bytes = await vscode.workspace.fs.readFile(bankUri);
            text = new TextDecoder('utf-8').decode(bytes);
        } catch {
            await this.view.webview.postMessage({ type: 'calcBankLoaded', calcs: [], error: 'No _calc_bank.twbl found in workspace root.' });
            return;
        }
        // Parse blocks separated by blank lines. Each block: first line = "// Title", rest = formula.
        const calcs: { title: string; formula: string }[] = [];
        const blocks = text.split(/\n\s*\n/);
        for (const block of blocks) {
            const lines = block.trim().split('\n');
            if (lines.length === 0 || !lines[0]) { continue; }
            const firstLine = lines[0].trim();
            if (!firstLine.startsWith('//')) { continue; }
            const title = firstLine.replace(/^\/\/\s*/, '').trim();
            const formula = lines.slice(1).join('\n').trim();
            if (title) { calcs.push({ title, formula }); }
        }
        await this.view.webview.postMessage({ type: 'calcBankLoaded', calcs });
    }

    private async extractCalculationsToFile(): Promise<void> {
        if (!this.view) {
            return;
        }

        let uri: vscode.Uri | undefined;
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const p = activeEditor.document.uri.path.toLowerCase();
            if (p.endsWith('.twb') || p.endsWith('.twbx')) {
                uri = activeEditor.document.uri;
            }
        }
        if (!uri && this.lastWorkbookUri) {
            uri = this.lastWorkbookUri;
        }
        if (!uri) {
            await this.postStatus('No active workbook file. Open a .twb or .twbx file first.', 'error');
            return;
        }

        try {
            const preprocessor = { clean: cleanXmlContent, resolveNames };
            const calcs = await extractFromFile(uri, preprocessor);
            const filtered = filterAndDedupe(normalize(calcs));
            const outputPath = join(dirname(uri.fsPath), '_Calculations.notes');
            await generateNotesFile(filtered, { outputPath, autoOpen: false });
            await this.view.webview.postMessage({ type: 'extractResult', count: filtered.length });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            await this.postStatus(`Failed to extract calculations: ${message}`, 'error');
        }
    }

    private async importPaletteFromFile(): Promise<void> {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { 'Tableau Preferences': ['tps'], 'All Files': ['*'] },
            openLabel: 'Import Palettes'
        });
        if (!uris || uris.length === 0) { return; }
        try {
            const data = await vscode.workspace.fs.readFile(uris[0]);
            const xml = new TextDecoder('utf-8').decode(data);
            const imported = parsePalettes(xml);
            if (imported.length === 0) {
                await this.postStatus('No palettes found in selected file.', 'info');
                return;
            }
            const loadResult = await loadPreferencesText(this.context, true);
            const existing = parsePalettes(loadResult.text);
            let added = 0;
            for (const p of imported) {
                if (!existing.some(e => e.name.toLowerCase() === p.name.toLowerCase())) {
                    existing.push(p);
                    added++;
                }
            }
            await this.savePalettes(existing);
            await this.postStatus(`Imported ${added} palette${added !== 1 ? 's' : ''}.`, 'success');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            await this.postStatus(`Import failed: ${message}`, 'error');
        }
    }

    private async importWorkbookPalette(rawPalette: unknown): Promise<void> {
        const palette = coercePalette(rawPalette);
        if (!palette) {
            await this.postStatus('Invalid palette data.', 'error');
            return;
        }

        try {
            const loadResult = await loadPreferencesText(this.context, true);
            const palettes = parsePalettes(loadResult.text);

            let finalName = palette.name;
            const nameConflict = palettes.some(p => p.name.toLowerCase() === finalName.toLowerCase());
            if (nameConflict) {
                finalName = `${palette.name} (Workbook)`;
            }

            palettes.push({ ...palette, name: finalName });
            await this.savePalettes(palettes);
            await this.postStatus(`Imported \u201c${finalName}\u201d to library.`, 'success');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            await this.postStatus(`Failed to import palette: ${message}`, 'error');
        }
    }

    private getActiveWorkbookXml(): Promise<string | null> {
        const uri = this.lastWorkbookUri;
        if (!uri) { return Promise.resolve(null); }
        const openDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
        if (openDoc) { return Promise.resolve(openDoc.getText()); }
        return Promise.resolve(vscode.workspace.fs.readFile(uri).then(data => new TextDecoder('utf-8').decode(data)));
    }

    private async handleFormattingApplyEdits(edits: WorkbookTheme): Promise<void> {
        if (!this.view) { return; }
        const uri = this.lastWorkbookUri;
        if (!uri) {
            await this.view.webview.postMessage({ type: 'formattingError', tab: 'inspect', message: 'No active .twb file.' });
            return;
        }
        try {
            const parser = new TWBParser();
            const doc = await parser.parseWorkbook(uri);
            const updated = applyThemeEditsToXml(doc.xml, edits);
            await parser.writeWorkbook(uri, updated);
            const elements = readThemeFromXml(updated);
            await this.view.webview.postMessage({ type: 'formattingSuccess', tab: 'inspect', message: 'Changes applied.', elements });
        } catch (e) {
            await this.view.webview.postMessage({ type: 'formattingError', tab: 'inspect', message: `Write failed: ${e instanceof Error ? e.message : String(e)}` });
        }
    }

    private async handleFormattingPickImportFile(): Promise<void> {
        if (!this.view) { return; }
        const uris = await vscode.window.showOpenDialog({ filters: { 'JSON Theme': ['json'] }, canSelectMany: false });
        if (uris?.[0]) {
            await this.view.webview.postMessage({ type: 'formattingImportFilePicked', filePath: uris[0].fsPath });
        }
    }

    private async handleFormattingImportTheme(filePath: string, mode: 'override' | 'preserve'): Promise<void> {
        if (!this.view) { return; }
        const uri = this.lastWorkbookUri;
        if (!uri) {
            await this.view.webview.postMessage({ type: 'formattingError', tab: 'apply', message: 'No active .twb file.' });
            return;
        }
        try {
            const raw = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(filePath))).toString('utf8');
            const theme = JSON.parse(raw) as object;
            const err = validateThemeJson(theme);
            if (err) { await this.view.webview.postMessage({ type: 'formattingError', tab: 'apply', message: `Invalid theme: ${err}` }); return; }
            const parser = new TWBParser();
            const doc = await parser.parseWorkbook(uri);
            const updated = applyThemeJsonToXml(doc.xml, theme, mode);
            await parser.writeWorkbook(uri, updated);
            await this.view.webview.postMessage({ type: 'formattingSuccess', tab: 'apply', message: 'Theme applied.' });
        } catch (e) {
            await this.view.webview.postMessage({ type: 'formattingError', tab: 'apply', message: `Failed: ${e instanceof Error ? e.message : String(e)}` });
        }
    }

    private async handleFormattingExport(): Promise<void> {
        if (!this.view) { return; }
        const xml = await this.getActiveWorkbookXml();
        if (!xml) { await this.view.webview.postMessage({ type: 'formattingJsonReady', json: null }); return; }
        try {
            const json = JSON.stringify(xmlToThemeJson(xml), null, 2);
            await this.view.webview.postMessage({ type: 'formattingJsonReady', json });
        } catch {
            await this.view.webview.postMessage({ type: 'formattingJsonReady', json: null });
        }
    }

    private async handleLocateElement(panelElement: string): Promise<void> {
        const uri = this.lastWorkbookUri;
        if (!uri || !panelElement) { return; }
        const xmlElement = getXmlElementName(panelElement);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
        const lines = doc.getText().split(/\r?\n/);
        const pattern = new RegExp(`<style-rule[^>]*element=['"]${xmlElement}['"]`);
        const lineIndex = lines.findIndex(l => pattern.test(l));
        if (lineIndex >= 0) {
            const range = new vscode.Range(lineIndex, 0, lineIndex, lines[lineIndex].length);
            editor.selection = new vscode.Selection(range.start, range.end);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        }
    }

    private async handleFormattingJsonSave(json: string): Promise<void> {
        if (!this.view) { return; }
        const uri = this.lastWorkbookUri;
        const defaultName = uri ? basename(uri.fsPath, '.twb') + '-theme.json' : 'theme.json';
        const dest = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(defaultName),
            filters: { JSON: ['json'] }
        });
        if (!dest) { return; }
        await vscode.workspace.fs.writeFile(dest, Buffer.from(json, 'utf8'));
        await this.view.webview.postMessage({ type: 'formattingSuccess', tab: 'export', message: `Saved to ${basename(dest.fsPath)}` });
    }
}

export function registerParsingGuideView(context: vscode.ExtensionContext): void {
    const provider = new ParsingGuideViewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(PARSING_GUIDE_VIEW_ID, provider)
    );
}

function getGuideHtml(webview: vscode.Webview, context: vscode.ExtensionContext, _nonce: string): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'parsingGuideSidebar.js'));
    const cacheBust = Date.now();
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src ${webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tableau LSP</title>
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
            font-size: 13px; line-height: 1.4;
            color: var(--vscode-sideBar-foreground);
            background: var(--vscode-sideBar-background);
            overflow-x: hidden;
        }
        body::-webkit-scrollbar { width: 10px; }
        body::-webkit-scrollbar-track { background: transparent; }
        body::-webkit-scrollbar-thumb { background: rgba(121,121,121,0.4); border-radius: 10px; border: 2px solid transparent; background-clip: content-box; }

        /* ——— Icon ——— */
        .ic {
          width: 16px; height: 16px; fill: none; stroke: currentColor;
          stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round;
          display: inline-block; vertical-align: middle; flex-shrink: 0;
        }

        /* ——— Icon Buttons ——— */
        .ib {
          width: 22px; height: 22px; display: inline-flex; align-items: center;
          justify-content: center; background: transparent; border: none;
          color: var(--vscode-icon-foreground); cursor: pointer;
          border-radius: 3px; padding: 0;
        }
        .ib:hover { background: rgba(90,93,94,0.31); }

        /* ——— Section Headers ——— */
        .sh {
          display: flex; align-items: center; height: 22px; padding: 0 8px;
          background: var(--vscode-sideBarSectionHeader-background);
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.04em; color: var(--vscode-sideBarSectionHeader-foreground);
          cursor: pointer; user-select: none; flex-shrink: 0;
          border-top: 1px solid var(--vscode-separator);
        }
        .sh:first-child { border-top: none; }
        .sh .cv { width: 20px; display: inline-flex; align-items: center; justify-content: center; transition: transform 0.15s; }
        .sh.c .cv { transform: rotate(-90deg); }
        .sh .bg {
          margin-left: auto; background: var(--vscode-badge-background);
          color: var(--vscode-badge-foreground); font-size: 10px; font-weight: 600;
          padding: 0 5px; border-radius: 8px; min-width: 18px;
          text-align: center; line-height: 16px;
        }
        .sh .ha { margin-left: auto; display: flex; gap: 2px; opacity: 0; transition: opacity 0.1s; }
        .sh:hover .ha { opacity: 1; }
        .sh:hover .bg { display: none; }
        .sb { overflow: hidden; }
        .sb.c { display: none; }

        /* ——— Subsection Headers ——— */
        .ssh {
          display: flex; align-items: center; padding: 4px 12px;
          font-size: 11px; font-weight: 600; color: var(--vscode-descriptionForeground);
          cursor: pointer; user-select: none;
        }
        .ssh:hover { color: var(--vscode-foreground); }
        .ssh .cv { width: 16px; display: inline-flex; align-items: center; justify-content: center; transition: transform 0.15s; }
        .ssh.c .cv { transform: rotate(-90deg); }

        /* ——— Unified Row Item (Palette Library + Theme Vault) ——— */
        .ri {
          display: flex; align-items: center; height: 22px;
          padding: 0 0 0 16px; cursor: pointer;
        }
        .ri:hover { background: var(--vscode-list-hoverBackground); }
        .ri.sel { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
        .ri .cb {
          width: 60px; height: 10px; border-radius: 2px;
          flex-shrink: 0; margin-right: 8px;
        }
        .ri .lb {
          flex: 1; white-space: nowrap; overflow: hidden;
          text-overflow: ellipsis; font-size: 13px;
        }
        .ri .mt {
          color: var(--vscode-descriptionForeground); font-size: 12px;
          margin-left: 4px; flex-shrink: 0; margin-right: 4px;
        }
        .ri .ra { display: flex; gap: 0; margin-right: 4px; opacity: 0; flex-shrink: 0; }
        .ri:hover .ra { opacity: 1; }
        .ri:hover .mt { display: none; }

        /* ——— Forms ——— */
        .fs { padding: 8px 12px; }
        .fs + .fs { padding-top: 0; }
        .fg { margin-bottom: 8px; }
        .fg:last-child { margin-bottom: 0; }
        .fl { display: block; font-size: 12px; color: var(--vscode-foreground); margin-bottom: 3px; }
        input[type="text"], input[type="number"] {
          width: 100%; height: 26px; background: var(--vscode-input-background);
          color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border);
          border-radius: 0; padding: 3px 6px; font-size: 13px; font-family: inherit; outline: none;
        }
        input[type="checkbox"] {
          appearance: none; -webkit-appearance: none;
          width: 14px; height: 14px; flex-shrink: 0;
          background: var(--vscode-input-background);
          border: 1px solid var(--vscode-input-border);
          border-radius: 2px; cursor: pointer; position: relative;
          vertical-align: middle; margin-right: 5px;
        }
        input[type="checkbox"]:checked {
          background: var(--vscode-button-background);
          border-color: var(--vscode-button-background);
        }
        input[type="checkbox"]:checked::after {
          content: ''; position: absolute;
          left: 3px; top: 0px; width: 5px; height: 8px;
          border: 1.5px solid var(--vscode-button-foreground);
          border-top: none; border-left: none;
          transform: rotate(45deg);
        }
        input:focus { border-color: var(--vscode-focusBorder); }
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none; appearance: none; margin: 0;
        }
        input[type="number"] {
          -moz-appearance: textfield;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='16'%3E%3Cpath d='M2 6l3-3 3 3' fill='none' stroke='%23999' stroke-width='1.2'/%3E%3Cpath d='M2 10l3 3 3-3' fill='none' stroke='%23999' stroke-width='1.2'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 4px center;
          padding-right: 18px;
        }
        select {
          width: 100%; height: 26px; background: var(--vscode-dropdown-background);
          color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border);
          border-radius: 0; padding: 2px 6px; font-size: 13px; font-family: inherit;
          outline: none; appearance: none; cursor: pointer;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23ccc'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 6px center;
        }
        select:focus { border-color: var(--vscode-focusBorder); }

        /* ——— Buttons ——— */
        .bt {
          display: inline-flex; align-items: center; justify-content: center;
          height: 26px; padding: 0 14px; border: none; border-radius: 0;
          font-size: 13px; font-family: inherit; cursor: pointer; outline: none;
          white-space: nowrap; gap: 6px;
        }
        .bt .ic { width: 14px; height: 14px; }
        .bp { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
        .bp:hover { background: var(--vscode-button-hoverBackground); }
        .bs { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        .bs:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .bf { width: 100%; }
        .br { display: flex; gap: 4px; margin-bottom: 6px; }
        .br .bt { flex: 1; }

        /* ——— Swatch Row ——— */
        .sr { display: flex; gap: 0; margin: 6px 0; }
        .sr .sw { flex: 1; height: 24px; cursor: pointer; position: relative; transition: transform 0.1s; }
        .sr .sw:first-child { border-radius: 3px 0 0 3px; }
        .sr .sw:last-child { border-radius: 0 3px 3px 0; }
        .sr .sw:hover { transform: scaleY(1.3); z-index: 1; box-shadow: 0 0 0 1px rgba(255,255,255,0.3); }
        .sr .sw .tp {
          display: none; position: absolute; bottom: calc(100% + 4px); left: 50%; transform: translateX(-50%);
          background: #383838; color: #ccc; font-size: 11px; padding: 2px 6px; border-radius: 2px;
          white-space: nowrap; pointer-events: none; z-index: 10; border: 1px solid #505050;
          font-family: "SF Mono","Cascadia Code","Fira Code","Consolas",monospace;
        }
        .sr .sw:hover .tp { display: block; }

        /* ——— Swatch + Apply combo ——— */
        .sr-apply {
          display: flex; align-items: stretch; gap: 0; margin: 6px 0;
        }
        .sr-apply .sr { flex: 1; margin: 0; border-radius: 3px 0 0 3px; }
        .sr-apply .sr .sw:last-child { border-radius: 0; }
        .sr-apply .apply-btn {
          width: 28px; flex-shrink: 0; border: none; cursor: pointer;
          background: var(--vscode-button-background); color: var(--vscode-button-foreground);
          display: flex; align-items: center; justify-content: center;
          border-radius: 0 3px 3px 0; transition: background 0.1s;
        }
        .sr-apply .apply-btn:hover { background: var(--vscode-button-hoverBackground); }
        .sr-apply .apply-btn svg { width: 14px; height: 14px; }

        /* ——— Color Chips ——— */
        .cl { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; }
        .cp { width: 22px; height: 22px; border-radius: 3px; cursor: pointer; border: 1px solid rgba(255,255,255,0.08); }
        .cp:hover { border-color: rgba(255,255,255,0.3); }
        .cp.add {
          background: var(--vscode-input-background); border: 1px dashed var(--vscode-input-border);
          display: flex; align-items: center; justify-content: center;
          color: var(--vscode-descriptionForeground); font-size: 14px;
        }

        /* ——— Color Input Row ——— */
        .cr { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
        .cr .cv2 {
          width: 26px; height: 26px; border-radius: 3px; flex-shrink: 0;
          border: 1px solid rgba(255,255,255,0.08); cursor: pointer;
        }
        .cr input {
          flex: 1; font-family: "SF Mono","Cascadia Code","Fira Code","Consolas",monospace; font-size: 12px;
        }

        /* ——— Empty State ——— */
        .em { padding: 12px 16px; font-size: 12px; color: var(--vscode-descriptionForeground); text-align: center; }
        .em a { color: var(--vscode-textLink-foreground); text-decoration: none; cursor: pointer; }

        /* ——— Info Banner ——— */
        .ib2 {
          margin: 6px 0; padding: 6px 8px;
          background: rgba(0,120,212,0.08); border: 1px solid rgba(0,120,212,0.25);
          border-radius: 3px; font-size: 12px; color: var(--vscode-foreground);
          display: flex; align-items: center; gap: 6px;
        }
        .ib2 .ic { color: #3794ff; width: 14px; height: 14px; }

        /* ——— Commands ——— */
        .cmdl { padding: 4px 12px 8px; }
        .cmdi {
          display: flex; align-items: center; gap: 8px;
          padding: 3px 4px; font-size: 12px; border-radius: 3px; cursor: pointer;
        }
        .cmdi:hover { background: var(--vscode-list-hoverBackground); }
        .cmdi .cic { width: 16px; text-align: center; color: var(--vscode-descriptionForeground); flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; }
        .cmdi code {
          background: var(--vscode-input-background); padding: 1px 5px; border-radius: 3px;
          font-size: 11px; font-family: "SF Mono","Cascadia Code","Fira Code","Consolas",monospace;
        }
        .sep { height: 1px; background: var(--vscode-separator); margin: 4px 12px; }

        /* ——— Workbook Parser ——— */
        .wb-file {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 12px; margin: 4px 8px;
          background: var(--vscode-input-background); border-radius: 3px;
          border-left: 3px solid var(--vscode-focusBorder);
        }
        .wb-file .ic { color: var(--vscode-textLink-foreground); width: 16px; height: 16px; flex-shrink: 0; }
        .wb-file-info { flex: 1; min-width: 0; }
        .wb-file-name {
          font-size: 13px; font-weight: 600; color: var(--vscode-foreground);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .wb-file-meta {
          font-size: 11px; color: var(--vscode-descriptionForeground); line-height: 1.3;
        }

        /* Tree item with icon + label + dim meta */
        .tree-item {
          display: flex; align-items: center; height: 22px;
          padding: 0 4px 0 28px; cursor: pointer;
        }
        .tree-item.tree-item-calc {
          padding: 0 4px;
        }
        .tree-item:hover { background: var(--vscode-list-hoverBackground); }
        .tree-item .ti-icon {
          width: 16px; height: 16px; flex-shrink: 0; margin-right: 6px;
          color: var(--vscode-descriptionForeground);
          display: inline-flex; align-items: center; justify-content: center;
        }
        .tree-item.tree-item-calc .ti-preview {
          width: 22px; height: 22px; min-width: 22px;
          margin-right: 4px; padding: 0; flex-shrink: 0;
          border-radius: 3px;
          border: none;
          background: transparent;
          color: var(--vscode-icon-foreground);
          display: inline-flex; align-items: center; justify-content: center;
        }
        .tree-item.tree-item-calc .ti-preview:hover {
          color: var(--vscode-foreground);
          background: rgba(90,93,94,0.31);
        }
        .tree-item.tree-item-calc .ti-preview:focus-visible {
          outline: 1px solid var(--vscode-focusBorder);
          outline-offset: 1px;
        }
        .tree-item .ti-icon svg { width: 14px; height: 14px; }
        .tree-item .ti-label {
          flex: 1; font-size: 13px; white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis;
        }
        .tree-item .ti-badge {
          font-size: 11px; color: var(--vscode-descriptionForeground);
          margin-left: 6px; flex-shrink: 0;
          font-family: "SF Mono","Cascadia Code","Fira Code","Consolas",monospace;
          background: var(--vscode-input-background); padding: 0 5px;
          border-radius: 3px; line-height: 16px;
        }
        .tree-item .ti-type {
          font-size: 10px; color: var(--vscode-descriptionForeground);
          margin-left: 6px; flex-shrink: 0; text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .tree-item .ti-actions {
          display: flex; gap: 0; margin-right: 2px; opacity: 0; flex-shrink: 0;
        }
        .tree-item:hover .ti-actions { opacity: 1; }
        .tree-item[data-action="copy-calc"] .ti-actions { opacity: 1; }
        .tree-item:hover .ti-type { display: none; }
        .wb-more-hidden[hidden] { display: none; }
        .tree-more {
          display: flex; align-items: center; gap: 6px; height: 22px;
          padding: 0 8px 0 28px; cursor: pointer; user-select: none;
          font-size: 12px; color: var(--vscode-textLink-foreground);
        }
        .tree-more:hover { background: var(--vscode-list-hoverBackground); }
        .tree-more .tree-more-chev {
          display: inline-flex; align-items: center;
          color: var(--vscode-descriptionForeground); transition: transform 0.15s;
        }
        .tree-more.expanded .tree-more-chev { transform: rotate(180deg); }

        /* Formula preview below a tree item */
        .tree-formula {
          padding: 1px 4px 1px 50px; font-size: 11px; height: 18px;
          font-family: "SF Mono","Cascadia Code","Fira Code","Consolas",monospace;
          color: var(--vscode-descriptionForeground); white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis;
        }
        .tree-formula .kw { color: #569cd6; }
        .tree-formula .fn { color: #dcdcaa; }
        .tree-formula .fld { color: #9cdcfe; }
        .tree-formula .str { color: #ce9178; }

        /* Palette empty sub-state */
        .sub-empty {
          padding: 4px 28px; font-size: 11px;
          color: var(--vscode-disabledForeground); font-style: italic;
        }

        .invalid { outline: 2px solid var(--vscode-inputValidation-errorBorder); }

        .color-picker-input-row input { flex: 1; height: 26px; }

        code {
          font-family: var(--vscode-editor-font-family);
          background-color: var(--vscode-textCodeBlock-background);
          padding: 2px 4px;
          border-radius: 3px;
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

        .color-picker-buttons {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }

        /* ——— Workbook Formatting (inline sidebar) ——— */
        .fmt-group-hdr { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--vscode-descriptionForeground); padding: 10px 12px 3px; border-top: 1px solid var(--vscode-widget-border); margin-top: 2px; }
        .fmt-group-hdr:first-child { border-top: none; margin-top: 0; }
        .fmt-elem-row { padding: 3px 0 5px; border-bottom: 1px solid transparent; }
        .fmt-elem-row.dirty { border-left: 3px solid var(--vscode-focusBorder); }
        .fmt-elem-name { font-size: 12px; font-weight: 500; color: var(--vscode-foreground); padding: 2px 12px 1px; flex: 1; }
        .fmt-elem-row.dirty .fmt-elem-name { padding-left: 9px; }
        .fmt-elem-hdr { display: flex; align-items: center; padding-right: 8px; }
        .fmt-locate-btn { background: none; border: 1px solid var(--vscode-widget-border); color: var(--vscode-descriptionForeground); border-radius: 3px; padding: 0px 5px; font-size: 10px; font-family: var(--vscode-editor-font-family); cursor: pointer; white-space: nowrap; line-height: 16px; }
        .fmt-locate-btn:not(:disabled):hover { color: var(--vscode-foreground); border-color: var(--vscode-focusBorder); }
        .fmt-locate-btn:disabled { opacity: 0.25; cursor: default; }
        .fmt-prop-row { display: flex; align-items: center; padding: 1px 12px 1px 24px; gap: 6px; min-height: 22px; }
        .fmt-elem-row.dirty .fmt-prop-row { padding-left: 21px; }
        .fmt-prop-lbl { font-size: 11px; color: var(--vscode-descriptionForeground); width: 80px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .fmt-prop-ctrl { flex: 1; display: grid; grid-template-columns: 14px minmax(0, 1fr) 16px; align-items: center; gap: 4px; min-width: 0; }
        .fmt-swatch { grid-column: 1; width: 14px; height: 14px; border-radius: 2px; border: 1px solid var(--vscode-widget-border); cursor: pointer; flex-shrink: 0; background: repeating-conic-gradient(#555 0% 25%, #333 0% 50%) 0 0/8px 8px; }
        .fmt-swatch.has-val { background: var(--fmt-color, transparent); }
        .fmt-prop-ctrl input[type="text"] { grid-column: 2; width: 100%; height: 20px; min-width: 0; font-size: 11px; padding: 1px 5px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); outline: none; font-family: var(--vscode-editor-font-family); }
        .fmt-prop-ctrl input[type="text"]:focus { border-color: var(--vscode-focusBorder); }
        .fmt-prop-ctrl input[type="number"] { grid-column: 2; width: 100%; height: 20px; font-size: 11px; padding: 1px 16px 1px 5px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); outline: none; -moz-appearance: textfield; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='16'%3E%3Cpath d='M2 6l3-3 3 3' fill='none' stroke='%23999' stroke-width='1.2'/%3E%3Cpath d='M2 10l3 3 3-3' fill='none' stroke='%23999' stroke-width='1.2'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 3px center; }
        .fmt-prop-ctrl input[type="number"]::-webkit-inner-spin-button,
        .fmt-prop-ctrl input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; appearance: none; margin: 0; }
        .fmt-prop-ctrl input[type="number"]:focus { border-color: var(--vscode-focusBorder); }
        .fmt-prop-ctrl select { grid-column: 2; width: 100%; height: 20px; font-size: 11px; padding: 1px 18px 1px 4px; background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); outline: none; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23ccc'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 5px center; min-width: 0; cursor: pointer; }
        .fmt-prop-ctrl select:focus { border-color: var(--vscode-focusBorder); }
        .fmt-clear { grid-column: 3; background: none; border: none; color: var(--vscode-descriptionForeground); cursor: pointer; font-size: 14px; line-height: 1; padding: 0 1px; opacity: 0; flex-shrink: 0; width: 16px; text-align: center; }
        .fmt-prop-row:hover .fmt-clear { opacity: 0.5; }
        .fmt-prop-row:hover .fmt-clear:hover { opacity: 1; color: var(--vscode-foreground); }
        .fmt-clear.has-val { opacity: 0.6; }
        .fmt-action-bar { padding: 6px 12px; display: flex; gap: 4px; border-top: 1px solid var(--vscode-panel-border); }
        .fmt-status { padding: 4px 12px; font-size: 11px; }
        .fmt-status.error { color: var(--vscode-errorForeground); }
        .fmt-status.success { color: #7BC96F; }
        .fmt-status.hidden { display: none; }
        .fmt-filename { font-size: 11px; color: var(--vscode-descriptionForeground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px; }
        .fmt-json-pre { background: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-widget-border); padding: 6px 8px; font-family: var(--vscode-editor-font-family); font-size: 11px; white-space: pre; overflow: auto; max-height: 220px; margin-bottom: 6px; }
        .fmt-placeholder { padding: 14px 12px; text-align: center; color: var(--vscode-descriptionForeground); font-size: 12px; }
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
                        <input type="number" id="picker-r" min="0" max="255" value="0">
                    </div>
                    <div class="color-picker-input-row">
                        <label>G</label>
                        <input type="number" id="picker-g" min="0" max="255" value="0">
                    </div>
                    <div class="color-picker-input-row">
                        <label>B</label>
                        <input type="number" id="picker-b" min="0" max="255" value="0">
                    </div>
                </div>
            </div>
            <div class="color-picker-input-row" style="margin-bottom: 12px;">
                <label>Hex</label>
                <input type="text" id="picker-hex" value="#000000">
            </div>
            <div class="color-picker-buttons">
                <button class="bt bs" id="picker-cancel">Cancel</button>
                <button class="bt bp" id="picker-ok">OK</button>
            </div>
        </div>
    </div>

    <!-- ========== SVG Sprite Sheet ========== -->
    <svg xmlns="http://www.w3.org/2000/svg" style="display:none">
      <symbol id="i-chev-d" viewBox="0 0 10 10"><polyline points="2,3 5,6 8,3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
      <symbol id="i-plus" viewBox="0 0 16 16"><line x1="8" y1="3" x2="8" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></symbol>
      <symbol id="i-import" viewBox="0 0 16 16"><path d="M3 9v4h10V9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><polyline points="5,5 8,2 11,5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="8" y1="2" x2="8" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></symbol>
      <symbol id="i-pen" viewBox="0 0 16 16"><path d="M11.5 2.5l2 2L5 13H3v-2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></symbol>
      <symbol id="i-arrow" viewBox="0 0 16 16"><line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><polyline points="9,4 13,8 9,12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></symbol>
      <symbol id="i-dots" viewBox="0 0 16 16"><circle cx="4" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="12" cy="8" r="1.2" fill="currentColor"/></symbol>
      <symbol id="i-refresh" viewBox="0 0 16 16"><path d="M13 8A5 5 0 1 1 8 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><polyline points="10,3 13,3 13,6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></symbol>
      <symbol id="i-save" viewBox="0 0 16 16"><path d="M3 2h8l2 2v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><rect x="5" y="9" width="6" height="4" rx="0.5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="6" y="2" width="3" height="3" rx="0.3" fill="none" stroke="currentColor" stroke-width="1.2"/></symbol>
      <symbol id="i-archive" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="3" rx="0.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3 5v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="6" y1="9" x2="10" y2="9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></symbol>
      <symbol id="i-trash" viewBox="0 0 16 16"><line x1="3" y1="4" x2="13" y2="4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 4l0.7 9a1 1 0 0 0 1 0.9h3.6a1 1 0 0 0 1-0.9l0.7-9" fill="none" stroke="currentColor" stroke-width="1.3"/></symbol>
      <symbol id="i-load" viewBox="0 0 16 16"><path d="M4 2h5l3 3v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><polyline points="9,2 9,5 12,5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></symbol>
      <symbol id="i-code" viewBox="0 0 16 16"><polyline points="5,4 1,8 5,12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><polyline points="11,4 15,8 11,12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></symbol>
      <symbol id="i-check" viewBox="0 0 16 16"><polyline points="3,8 6.5,11.5 13,4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></symbol>
      <symbol id="i-branch" viewBox="0 0 16 16"><circle cx="5" cy="4" r="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="5" cy="12" r="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="11" cy="6" r="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><line x1="5" y1="5.5" x2="5" y2="10.5" stroke="currentColor" stroke-width="1.2"/><path d="M5 6c0 2.5 3 1 6 2" fill="none" stroke="currentColor" stroke-width="1.2"/></symbol>
      <symbol id="i-list" viewBox="0 0 16 16"><line x1="6" y1="4" x2="14" y2="4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="6" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="6" y1="12" x2="14" y2="12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="3" cy="4" r="1" fill="currentColor"/><circle cx="3" cy="8" r="1" fill="currentColor"/><circle cx="3" cy="12" r="1" fill="currentColor"/></symbol>
      <symbol id="i-layers" viewBox="0 0 16 16"><polygon points="8,2 14,6 8,10 2,6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><polyline points="2,9 8,13 14,9" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></symbol>
      <symbol id="i-help" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6.5 6.5a1.5 1.5 0 0 1 2.8 0.5c0 1-1.3 1-1.3 2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="11.5" r="0.6" fill="currentColor"/></symbol>
      <symbol id="i-export" viewBox="0 0 16 16"><path d="M3 9v4h10V9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><polyline points="5,6 8,3 11,6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="8" y1="3" x2="8" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></symbol>
      <symbol id="i-check-c" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.3"/><polyline points="5,8 7,10.5 11,5.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></symbol>
      <symbol id="i-files" viewBox="0 0 16 16"><rect x="5" y="1" width="8" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M3 5v7a1 1 0 0 0 1 1h6" fill="none" stroke="currentColor" stroke-width="1.2"/></symbol>
      <symbol id="i-db" viewBox="0 0 16 16"><ellipse cx="8" cy="4" rx="5" ry="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3 4v4c0 1.1 2.2 2 5 2s5-.9 5-2V4" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3 8v4c0 1.1 2.2 2 5 2s5-.9 5-2V8" fill="none" stroke="currentColor" stroke-width="1.3"/></symbol>
      <symbol id="i-fx" viewBox="0 0 16 16"><text x="1" y="13" font-family="serif" font-style="italic" font-size="13" font-weight="700" fill="currentColor" stroke="none">fx</text></symbol>
      <symbol id="i-grid" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="2" y1="6" x2="14" y2="6" stroke="currentColor" stroke-width="1.1"/><line x1="2" y1="10" x2="14" y2="10" stroke="currentColor" stroke-width="1.1"/><line x1="6" y1="2" x2="6" y2="14" stroke="currentColor" stroke-width="1.1"/><line x1="10" y1="2" x2="10" y2="14" stroke="currentColor" stroke-width="1.1"/></symbol>
      <symbol id="i-twb" viewBox="0 0 16 16"><path d="M4 1h5l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><polyline points="9,1 9,5 13,5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><line x1="5.5" y1="9" x2="10.5" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/><line x1="5.5" y1="11.5" x2="8.5" y2="11.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></symbol>
      <symbol id="i-field" viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="2" y1="6.5" x2="14" y2="6.5" stroke="currentColor" stroke-width="1.1"/><line x1="6" y1="3" x2="6" y2="13" stroke="currentColor" stroke-width="1.1"/></symbol>
      <symbol id="i-info" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="8" y1="7" x2="8" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="4.8" r="0.7" fill="currentColor"/></symbol>
    </svg>

    <!-- ====== WORKBOOK ====== -->
    <div class="sh" id="workbook-sh">
      <span class="cv"><svg class="ic" style="width:10px;height:10px"><use href="#i-chev-d"/></svg></span>
      Workbook <span id="wb-script-stamp" data-build-stamp="${BUILD_STAMP}" style="font-size:9px;opacity:0.4;font-weight:400">(js not loaded)</span>
      <div class="ha">
        <button class="ib" id="open-in-tableau-btn" title="Open in Tableau"><svg class="ic"><use href="#i-twb"/></svg></button>
        <button class="ib" id="extract-calcs-header-btn" title="Extract Calculations"><svg class="ic"><use href="#i-export"/></svg></button>
        <button class="ib" id="parse-workbook-btn" title="Refresh"><svg class="ic"><use href="#i-refresh"/></svg></button>
      </div>
    </div>
    <div class="sb" id="workbook-sb">
      <div id="workbook-file-card" class="wb-file" style="display:none"></div>
      <div id="workbook-empty-state" class="em">Open a <strong>.twb</strong> or <strong>.twbx</strong> file to inspect its contents.</div>
      <div id="extract-calcs-wrap" style="display:none;padding:4px 8px">
        <button id="extract-calcs-btn" class="bt bp bf"><svg class="ic"><use href="#i-export"/></svg> Extract Calculations</button>
      </div>
      <div class="ssh c" style="margin-top:2px">
        <span class="cv"><svg class="ic" style="width:9px;height:9px"><use href="#i-chev-d"/></svg></span>
        Datasources
        <span id="wb-datasources-badge" style="margin-left:auto;font-size:10px;color:var(--vscode-descriptionForeground);font-weight:400">0</span>
      </div>
      <div class="ssb" id="wb-datasources-content" style="display:none"></div>
      <div class="ssh c">
        <span class="cv"><svg class="ic" style="width:9px;height:9px"><use href="#i-chev-d"/></svg></span>
        Calculated Fields
        <span id="wb-calcs-badge" style="margin-left:auto;font-size:10px;color:var(--vscode-descriptionForeground);font-weight:400">0</span>
      </div>
      <div class="ssb" id="wb-calcs-content" style="display:none"></div>
      <div class="ssh c">
        <span class="cv"><svg class="ic" style="width:9px;height:9px"><use href="#i-chev-d"/></svg></span>
        Fields
        <span id="wb-fields-badge" style="margin-left:auto;font-size:10px;color:var(--vscode-descriptionForeground);font-weight:400">0</span>
      </div>
      <div class="ssb" id="wb-fields-content" style="display:none"></div>
      <div class="ssh c">
        <span class="cv"><svg class="ic" style="width:9px;height:9px"><use href="#i-chev-d"/></svg></span>
        Worksheets
        <span id="wb-sheets-badge" style="margin-left:auto;font-size:10px;color:var(--vscode-descriptionForeground);font-weight:400">0</span>
      </div>
      <div class="ssb" id="wb-sheets-content" style="display:none"></div>
      <div class="ssh c">
        <span class="cv"><svg class="ic" style="width:9px;height:9px"><use href="#i-chev-d"/></svg></span>
        Custom Palettes
        <span id="wb-palettes-badge" style="margin-left:auto;font-size:10px;color:var(--vscode-descriptionForeground);font-weight:400">0</span>
      </div>
      <div class="ssb" id="wb-palettes-content" style="display:none"></div>
    </div>

    <!-- ====== WORKBOOK FORMATTING ====== -->
    <div class="sh" style="display:flex;align-items:center;gap:4px">
      <span class="cv"><svg class="ic" style="width:10px;height:10px"><use href="#i-chev-d"/></svg></span>
      Workbook Formatting
      <button class="bt bs" id="open-formatting-panel-btn" title="Open Formatting Panel" style="margin-left:auto;padding:1px 7px;font-size:11px" onclick="vscode.postMessage({type:'openFormattingPanel'})">&#8599;</button>
    </div>
    <div class="sb">
      <div id="fmt-inspect-groups"></div>
      <div class="fmt-action-bar">
        <button class="bt bp" id="fmt-apply-edits-btn" disabled>Apply</button>
        <button class="bt bs" id="fmt-reset-edits-btn">Reset</button>
      </div>
      <div id="fmt-inspect-status" class="fmt-status hidden"></div>
      <div class="ssh c" id="fmt-apply-ssh">
        <span class="cv"><svg class="ic" style="width:9px;height:9px"><use href="#i-chev-d"/></svg></span>
        Apply Theme
      </div>
      <div class="ssb" style="display:none">
        <div class="fs">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
            <button class="bt bs" id="fmt-browse-btn">Browse\u2026</button>
            <span class="fmt-filename" id="fmt-import-filename">No file selected</span>
          </div>
          <div id="fmt-apply-mode-row" style="display:none;flex-direction:column;gap:4px;margin-bottom:8px">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="radio" name="fmt-apply-mode" value="override" checked> Override all</label>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="radio" name="fmt-apply-mode" value="preserve"> Preserve existing</label>
          </div>
          <button class="bt bp bf" id="fmt-apply-theme-btn" disabled>Apply Theme</button>
          <div id="fmt-apply-status" class="fmt-status hidden"></div>
        </div>
      </div>
      <div class="ssh c" id="fmt-export-ssh">
        <span class="cv"><svg class="ic" style="width:9px;height:9px"><use href="#i-chev-d"/></svg></span>
        Export Theme
      </div>
      <div class="ssb" style="display:none">
        <div class="fs">
          <div id="fmt-export-placeholder" class="fmt-placeholder">No active .twb file.</div>
          <pre id="fmt-json-preview" class="fmt-json-pre" style="display:none"></pre>
          <div id="fmt-export-actions" style="display:none;flex-direction:column;gap:4px">
            <button class="bt bp bf" id="fmt-save-json-btn">Save to File\u2026</button>
            <button class="bt bs bf" id="fmt-copy-json-btn">Copy JSON</button>
          </div>
          <div id="fmt-export-status" class="fmt-status hidden"></div>
        </div>
      </div>
    </div>

    <!-- ====== PALETTE LIBRARY ====== -->
    <div class="sh">
      <span class="cv"><svg class="ic" style="width:10px;height:10px"><use href="#i-chev-d"/></svg></span>
      Palette Library
      <span class="bg" id="palette-library-badge">0</span>
      <div class="ha">
        <button class="ib" id="new-palette-add" title="New Palette"><svg class="ic"><use href="#i-plus"/></svg></button>
        <button class="ib" id="import-palette-btn" title="Import"><svg class="ic"><use href="#i-import"/></svg></button>
      </div>
    </div>
    <div class="sb">

      <!-- My Palettes -->
      <div class="ssh c">
        <span class="cv"><svg class="ic" style="width:9px;height:9px"><use href="#i-chev-d"/></svg></span>
        My Palettes
      </div>
      <div class="ssb"><div id="palette-list"></div></div>

      <div class="sep"></div>

      <!-- Palette Editor -->
      <div class="ssh">
        <span class="cv"><svg class="ic" style="width:9px;height:9px"><use href="#i-chev-d"/></svg></span>
        Palette Editor
      </div>
      <div class="ssb"><div class="fs">
        <div class="fg"><label class="fl">Palette name</label><input type="text" id="palette-name" placeholder="My Palette"></div>
        <div class="fg"><label class="fl">Palette type</label>
          <select id="palette-type">
            <option value="regular">Categorical (regular)</option>
            <option value="ordered-sequential">Sequential (ordered-sequential)</option>
            <option value="ordered-diverging">Diverging (ordered-diverging)</option>
          </select>
        </div>
        <div class="fg"><label class="fl">Colors</label><div id="colors-list" class="cl"></div></div>
        <div class="br">
          <button class="bt bp" id="save-palette" style="flex:2"><svg class="ic"><use href="#i-save"/></svg> Save</button>
          <button class="bt bs" id="new-palette" title="New"><svg class="ic"><use href="#i-plus"/></svg></button>
          <button class="bt bs" id="archive-palette" title="Archive"><svg class="ic"><use href="#i-archive"/></svg></button>
          <button class="bt bs" id="delete-palette" title="Delete" style="color:var(--vscode-errorForeground)"><svg class="ic"><use href="#i-trash"/></svg></button>
        </div>
        <button class="bt bs bf" id="apply-to-workbook"><svg class="ic"><use href="#i-arrow"/></svg> Apply to Active Workbook</button>
      </div></div>

      <div class="sep"></div>

      <!-- Advanced Gradient Generator -->
      <div class="ssh">
        <span class="cv"><svg class="ic" style="width:9px;height:9px"><use href="#i-chev-d"/></svg></span>
        Advanced Gradient Generator
      </div>
      <div class="ssb"><div class="fs">
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <div style="flex:1"><label class="fl">Base Color</label><div class="cr"><div class="cv2" id="scale-base-swatch" style="background:#5CB8B2"></div><input type="text" id="scale-base-hex" value="#5CB8B2"></div></div>
          <div style="width:72px;flex-shrink:0"><label class="fl">Steps</label><input type="number" id="scale-steps" value="9" min="2" max="20"></div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:8px;align-items:flex-end">
          <div style="flex:1"><label class="fl">Easing Curve</label>
            <select id="scale-easing">
              <option value="linear">Linear</option>
              <option value="easeOut" selected>Ease Out</option>
              <option value="easeIn">Ease In</option>
              <option value="easeInOut">Ease In-Out</option>
            </select>
          </div>
          <div style="width:72px;flex-shrink:0"><button class="bt bp" id="scale-generate" style="height:26px;width:100%;padding:0;font-size:12px">Generate</button></div>
        </div>
        <div class="sr-apply">
          <div class="sr" id="scale-preview"></div>
          <button class="apply-btn" id="scale-apply" title="Apply to Editor"><svg class="ic"><use href="#i-arrow"/></svg></button>
        </div>
      </div></div>

      <div class="sep"></div>

      <!-- Multi-Stop Gradient -->
      <div class="ssh">
        <span class="cv"><svg class="ic" style="width:9px;height:9px"><use href="#i-chev-d"/></svg></span>
        Multi-Stop Gradient
      </div>
      <div class="ssb"><div class="fs">
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <div style="flex:1"><label class="fl">Start Color</label><div class="cr"><div class="cv2" id="blend-start-swatch" style="background:#F4B860"></div><input type="text" id="blend-start-hex" value="#F4B860"></div></div>
          <div style="flex:1"><label class="fl">End Color</label><div class="cr"><div class="cv2" id="blend-end-swatch" style="background:#3D5A80"></div><input type="text" id="blend-end-hex" value="#3D5A80"></div></div>
          <div style="width:72px;flex-shrink:0"><label class="fl">Steps</label><input type="number" id="blend-steps" value="7" min="2" max="20"></div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:8px;align-items:flex-end">
          <div style="flex:1"><label class="fl">Easing Curve</label>
            <select id="blend-easing">
              <option value="linear" selected>Linear</option>
              <option value="easeOut">Ease Out</option>
              <option value="easeIn">Ease In</option>
              <option value="easeInOut">Ease In-Out</option>
            </select>
          </div>
          <div style="flex:1"><label class="fl">Color Space</label>
            <select id="blend-colorspace">
              <option value="lab" selected>LAB</option>
              <option value="rgb">RGB</option>
              <option value="hsl">HSL</option>
            </select>
          </div>
          <div style="width:72px;flex-shrink:0;align-self:flex-end"><button class="bt bp" id="blend-generate" style="height:26px;width:100%;padding:0;font-size:12px">Generate</button></div>
        </div>
        <div class="sr-apply">
          <div class="sr" id="blend-preview"></div>
          <button class="apply-btn" id="blend-apply" title="Apply to Editor"><svg class="ic"><use href="#i-arrow"/></svg></button>
        </div>
      </div></div>

      <div class="sep"></div>

      <!-- Theme Vault -->
      <div class="ssh">
        <span class="cv"><svg class="ic" style="width:9px;height:9px"><use href="#i-chev-d"/></svg></span>
        Theme Vault
      </div>
      <div class="ssb" id="theme-list"></div>

      <div class="sep"></div>

      <!-- File Actions -->
      <div class="ssh">
        <span class="cv"><svg class="ic" style="width:9px;height:9px"><use href="#i-chev-d"/></svg></span>
        File Actions
      </div>
      <div class="ssb"><div class="fs">
        <div class="br">
          <button class="bt bp" id="save-file"><svg class="ic"><use href="#i-save"/></svg> Save</button>
          <button class="bt bs" id="reload-file"><svg class="ic"><use href="#i-refresh"/></svg> Reload</button>
        </div>
        <div id="palette-status" class="ib2" style="display:none">
          <svg class="ic"><use href="#i-info"/></svg>
          <span id="palette-status-text"></span>
        </div>
        <div id="palette-source" style="padding:4px 0 0;font-size:11px;color:var(--vscode-descriptionForeground)">Source: not loaded yet</div>
      </div></div>
    </div>


    <!-- ====== CALCULATION BANK ====== -->
    <div class="sh">
      <span class="cv"><svg class="ic" style="width:10px;height:10px"><use href="#i-chev-d"/></svg></span>
      Calculation Bank
      <div class="ha">
        <button class="ib" id="calc-bank-refresh" title="Reload _calc_bank.twbl"><svg class="ic"><use href="#i-refresh"/></svg></button>
      </div>
    </div>
    <div class="sb" id="calc-bank-sb">
      <div id="calc-bank-list"><div style="padding:8px;font-size:11px;color:var(--vscode-descriptionForeground)">Click ↺ to load _calc_bank.twbl from workspace root.</div></div>
    </div>

    <!-- ====== COMMANDS & REFERENCE ====== -->
    <div class="sh">
      <span class="cv"><svg class="ic" style="width:10px;height:10px"><use href="#i-chev-d"/></svg></span>
      Commands &amp; Reference
    </div>
    <div class="sb">
      <div class="ssh" style="padding-top:6px">
        <span class="cv"><svg class="ic" style="width:9px;height:9px"><use href="#i-chev-d"/></svg></span>
        Most Used Commands
      </div>
      <div class="ssb">
        <div class="cmdl">
          <div class="cmdi"><span class="cic"><svg class="ic"><use href="#i-code"/></svg></span><span><code>Format Tableau Expression</code></span></div>
          <div class="cmdi"><span class="cic"><svg class="ic"><use href="#i-check"/></svg></span><span><code>Validate Tableau Expression</code></span></div>
          <div class="cmdi"><span class="cic"><svg class="ic"><use href="#i-branch"/></svg></span><span><code>Insert IF Statement</code></span></div>
          <div class="cmdi"><span class="cic"><svg class="ic"><use href="#i-list"/></svg></span><span><code>Insert CASE Statement</code></span></div>
          <div class="cmdi"><span class="cic"><svg class="ic"><use href="#i-layers"/></svg></span><span><code>Insert LOD Expression</code></span></div>
          <div class="cmdi"><span class="cic"><svg class="ic"><use href="#i-help"/></svg></span><span><code>Show Function Help</code></span></div>
          <div class="cmdi"><span class="cic"><svg class="ic"><use href="#i-export"/></svg></span><span><code>Extract Calculations</code></span></div>
        </div>
      </div>
      <div class="ssh">
        <span class="cv"><svg class="ic" style="width:9px;height:9px"><use href="#i-chev-d"/></svg></span>
        .twbl Parsing Tips
      </div>
      <div class="ssb">
        <div class="cmdl" style="font-size:12px;color:var(--vscode-descriptionForeground);line-height:1.6">
          <div style="padding:2px 4px">Separate calculations with a blank line</div>
          <div style="padding:2px 4px">Header format: <code>// Name - description</code></div>
          <div style="padding:2px 4px">Put <code>IF</code>, <code>THEN</code>, <code>ELSE</code>, <code>END</code> on own lines</div>
          <div style="padding:2px 4px">Align <code>END</code> with opening keyword</div>
          <div style="padding:2px 4px">Avoid non-ASCII characters (smart quotes, emoji)</div>
        </div>
      </div>
    </div>

        <script src="${scriptUri}?v=${cacheBust}"></script>

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

