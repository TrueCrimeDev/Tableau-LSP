import * as vscode from 'vscode';
import { basename } from 'path';
import { TWBParser } from '../parsers/twbParser.js';
import {
    readThemeFromXml,
    applyThemeEditsToXml,
    xmlToThemeJson,
    applyThemeJsonToXml,
    validateThemeJson,
    WorkbookTheme,
} from '../parsers/formattingTheme.js';

let panel: vscode.WebviewPanel | undefined;

export function registerFormattingPanel(context: vscode.ExtensionContext): void {
    const cmd = vscode.commands.registerCommand(
        'tableauLanguageSupport.openFormattingPanel',
        () => { openOrReveal(context); }
    );
    context.subscriptions.push(cmd);

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (!panel || !editor) { return; }
            const p = editor.document.uri.path.toLowerCase();
            if (p.endsWith('.twb')) { void refreshPanel(editor.document.uri); }
        })
    );
}

function openOrReveal(context: vscode.ExtensionContext): void {
    if (panel) { panel.reveal(); return; }

    panel = vscode.window.createWebviewPanel(
        'tableauFormattingPanel',
        'Workbook Formatting',
        vscode.ViewColumn.One,
        { enableScripts: true, localResourceRoots: [context.extensionUri] }
    );

    panel.webview.html = getPanelHtml(panel.webview, context);

    panel.webview.onDidReceiveMessage(async (msg: { type: string; edits?: WorkbookTheme; filePath?: string; mode?: string; json?: string }) => {
        switch (msg.type) {
            case 'applyEdits':
                await handleApplyEdits(msg.edits ?? {});
                break;
            case 'importTheme':
                await handleImportTheme(msg.filePath ?? '', (msg.mode ?? 'override') as 'override' | 'preserve');
                break;
            case 'requestExport':
                await handleRequestExport();
                break;
            case 'saveJson':
                await handleSaveJson(msg.json ?? '');
                break;
            case 'pickImportFile':
                await handlePickImportFile();
                break;
        }
    });

    panel.onDidDispose(() => { panel = undefined; });

    const active = vscode.window.activeTextEditor;
    if (active) {
        const p = active.document.uri.path.toLowerCase();
        if (p.endsWith('.twb')) { void refreshPanel(active.document.uri); }
    }
}

function getWorkbookUri(): vscode.Uri | undefined {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const p = editor.document.uri.path.toLowerCase();
        if (p.endsWith('.twb')) { return editor.document.uri; }
    }
    return undefined;
}

async function refreshPanel(uri: vscode.Uri): Promise<void> {
    if (!panel) { return; }
    try {
        const parser = new TWBParser();
        const doc = await parser.parseWorkbook(uri);
        const elements = readThemeFromXml(doc.xml);
        panel.title = `Workbook Formatting — ${basename(uri.fsPath)}`;
        await panel.webview.postMessage({ type: 'formattingLoaded', elements });
    } catch { /* silently ignore read errors */ }
}

async function handleApplyEdits(edits: WorkbookTheme): Promise<void> {
    const uri = getWorkbookUri();
    if (!uri) { await postError('inspect', 'No active .twb file.'); return; }
    try {
        const parser = new TWBParser();
        const doc = await parser.parseWorkbook(uri);
        const updated = applyThemeEditsToXml(doc.xml, edits);
        await parser.writeWorkbook(uri, updated);
        const elements = readThemeFromXml(updated);
        await panel?.webview.postMessage({ type: 'formattingSuccess', tab: 'inspect', message: 'Changes applied.', elements });
    } catch (e) {
        await postError('inspect', `Write failed: ${e instanceof Error ? e.message : String(e)}`);
    }
}

async function handlePickImportFile(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({ filters: { 'JSON Theme': ['json'] }, canSelectMany: false });
    if (uris?.[0]) {
        await panel?.webview.postMessage({ type: 'importFilePicked', filePath: uris[0].fsPath });
    }
}

async function handleImportTheme(filePath: string, mode: 'override' | 'preserve'): Promise<void> {
    const uri = getWorkbookUri();
    if (!uri) { await postError('apply', 'No active .twb file.'); return; }
    try {
        const raw = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(filePath))).toString('utf8');
        const theme = JSON.parse(raw) as object;
        const err = validateThemeJson(theme);
        if (err) { await postError('apply', `Invalid theme: ${err}`); return; }
        const parser = new TWBParser();
        const doc = await parser.parseWorkbook(uri);
        const updated = applyThemeJsonToXml(doc.xml, theme, mode);
        await parser.writeWorkbook(uri, updated);
        await panel?.webview.postMessage({ type: 'formattingSuccess', tab: 'apply', message: 'Theme applied.' });
    } catch (e) {
        await postError('apply', `Failed: ${e instanceof Error ? e.message : String(e)}`);
    }
}

async function handleRequestExport(): Promise<void> {
    const uri = getWorkbookUri();
    if (!uri) { await panel?.webview.postMessage({ type: 'themeJsonReady', json: null }); return; }
    try {
        const parser = new TWBParser();
        const doc = await parser.parseWorkbook(uri);
        const json = JSON.stringify(xmlToThemeJson(doc.xml), null, 4);
        await panel?.webview.postMessage({ type: 'themeJsonReady', json });
    } catch {
        await panel?.webview.postMessage({ type: 'themeJsonReady', json: null });
    }
}

async function handleSaveJson(json: string): Promise<void> {
    const uri = getWorkbookUri();
    const defaultName = uri ? basename(uri.fsPath, '.twb') + '-theme.json' : 'theme.json';
    const dest = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultName),
        filters: { JSON: ['json'] }
    });
    if (!dest) { return; }
    await vscode.workspace.fs.writeFile(dest, Buffer.from(json, 'utf8'));
    await panel?.webview.postMessage({ type: 'formattingSuccess', tab: 'export', message: `Saved to ${basename(dest.fsPath)}` });
}

async function postError(tab: string, message: string): Promise<void> {
    await panel?.webview.postMessage({ type: 'formattingError', tab, message });
}

function getPanelHtml(webview: vscode.Webview, context: vscode.ExtensionContext): string {
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'formattingPanel.js'));
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'formattingPanel.css'));
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="${cssUri}">
    <title>Workbook Formatting</title>
</head>
<body>
    <div class="tabs">
        <div class="tab active" data-tab="tab-inspect">Inspect &amp; Edit</div>
        <div class="tab" data-tab="tab-apply">Apply Theme</div>
        <div class="tab" data-tab="tab-export">Export Theme</div>
    </div>
    <div id="tab-inspect" class="tab-content active">
        <div id="inspect-groups"></div>
        <div class="action-bar">
            <button class="btn btn-primary" id="apply-edits-btn" disabled>Apply Changes</button>
            <button class="btn btn-secondary" id="reset-edits-btn">Reset</button>
        </div>
        <div id="inspect-status" class="status-msg hidden"></div>
    </div>
    <div id="tab-apply" class="tab-content">
        <div class="file-row">
            <button class="btn btn-secondary" id="browse-btn">Browse\u2026</button>
            <span class="filename" id="import-filename">No file selected</span>
        </div>
        <div class="radio-group" id="apply-mode-row" style="display:none">
            <label><input type="radio" name="apply-mode" value="override" checked> Override</label>
            <label><input type="radio" name="apply-mode" value="preserve"> Preserve</label>
        </div>
        <button class="btn btn-primary" id="apply-theme-btn" disabled>Apply Theme</button>
        <div id="apply-status" class="status-msg hidden"></div>
    </div>
    <div id="tab-export" class="tab-content">
        <div id="export-placeholder" class="placeholder">Loading\u2026</div>
        <pre id="json-preview" class="json-preview" style="display:none"></pre>
        <div class="action-bar" id="export-actions" style="display:none">
            <button class="btn btn-primary" id="save-json-btn">Save to File\u2026</button>
            <button class="btn btn-secondary" id="copy-json-btn">Copy to Clipboard</button>
        </div>
        <div id="export-status" class="status-msg hidden"></div>
    </div>
    <script src="${jsUri}"></script>
</body>
</html>`;
}
