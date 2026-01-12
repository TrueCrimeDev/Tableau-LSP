import * as vscode from 'vscode';

import {
    PaletteDefinition,
    PaletteType,
    applyPaletteChanges,
    copyPreferencesToRepository,
    getWorkspacePreferencesUri,
    loadPreferencesText,
    parsePalettes,
    writePreferencesText
} from '../preferences/preferencesFile.js';

export const PARSING_GUIDE_VIEW_ID = 'tableauLanguageSupport.parsingGuide';
export const PARSING_GUIDE_CONTAINER_ID = 'tableauLsp';

class ParsingGuideViewProvider implements vscode.WebviewViewProvider {
    private view: vscode.WebviewView | undefined;

    public constructor(private readonly context: vscode.ExtensionContext) {}

    public resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = {
            enableScripts: true
        };

        view.webview.onDidReceiveMessage(message => {
            if (!message || typeof message !== 'object') {
                return;
            }

            const payload = message as { type?: string; palettes?: unknown };
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
                case 'savePalettes':
                    void this.savePalettes(payload.palettes);
                    break;
                default:
                    break;
            }
        });

        view.webview.html = getGuideHtml(getNonce());
        void this.postPaletteData();
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
}

export function registerParsingGuideView(context: vscode.ExtensionContext): void {
    const provider = new ParsingGuideViewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(PARSING_GUIDE_VIEW_ID, provider)
    );
}

function getGuideHtml(nonce: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tableau LSP Guide</title>
    <style>
        :root {
            --bg-0: #0f141a;
            --bg-1: #151c24;
            --bg-2: #1c2731;
            --panel: rgba(21, 28, 36, 0.88);
            --panel-border: rgba(255, 255, 255, 0.08);
            --text: #e8edf2;
            --muted: #a5b3c2;
            --accent: #f4b860;
            --accent-2: #5cb8b2;
            --accent-3: #e07a5f;
            --chip: rgba(244, 184, 96, 0.16);
            --shadow: rgba(0, 0, 0, 0.35);
            --code-bg: rgba(0, 0, 0, 0.35);
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            min-height: 100vh;
            color: var(--text);
            font-family: "Alegreya Sans", "Avenir Next", "Avenir", "Gill Sans", "Trebuchet MS", sans-serif;
            background:
                radial-gradient(120% 120% at 120% -10%, rgba(92, 184, 178, 0.24), transparent 55%),
                radial-gradient(90% 90% at -10% 10%, rgba(244, 184, 96, 0.24), transparent 55%),
                linear-gradient(160deg, var(--bg-0), var(--bg-1) 45%, var(--bg-2));
        }

        body::before {
            content: "";
            position: fixed;
            inset: 0;
            background-image:
                linear-gradient(130deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.02) 40%, transparent 60%),
                linear-gradient(0deg, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0));
            opacity: 0.6;
            pointer-events: none;
        }

        .shell {
            position: relative;
            padding: 18px 16px 24px;
        }

        .hero {
            padding: 16px 16px 18px;
            border-radius: 16px;
            border: 1px solid var(--panel-border);
            background: linear-gradient(135deg, rgba(244, 184, 96, 0.14), rgba(92, 184, 178, 0.08));
            box-shadow: 0 16px 30px var(--shadow);
        }

        .eyebrow {
            text-transform: uppercase;
            letter-spacing: 0.18em;
            font-size: 0.7rem;
            color: var(--accent-2);
        }

        h1 {
            margin: 8px 0 6px;
            font-size: 1.35rem;
            color: var(--text);
        }

        .subtitle {
            color: var(--muted);
            font-size: 0.9rem;
            margin: 0;
        }

        .menu {
            margin: 16px 0 10px;
            display: grid;
            gap: 8px;
        }

        .menu-title {
            font-size: 0.75rem;
            letter-spacing: 0.16em;
            text-transform: uppercase;
            color: var(--muted);
        }

        .menu a {
            text-decoration: none;
            color: var(--text);
            padding: 8px 12px;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.08);
            transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
        }

        .menu a:hover {
            border-color: rgba(244, 184, 96, 0.45);
            background: rgba(244, 184, 96, 0.12);
            transform: translateY(-1px);
        }

        main {
            display: grid;
            gap: 14px;
        }

        .card {
            border-radius: 16px;
            padding: 14px 16px;
            border: 1px solid var(--panel-border);
            background: var(--panel);
            box-shadow: 0 12px 24px var(--shadow);
            animation: rise 0.6s ease both;
            animation-delay: var(--delay, 0s);
        }

        h2 {
            margin: 0 0 8px;
            font-size: 1.05rem;
            color: var(--accent);
        }

        p {
            margin: 0 0 10px;
            color: var(--muted);
            line-height: 1.5;
        }

        ul {
            margin: 0;
            padding-left: 18px;
            color: var(--text);
            line-height: 1.5;
        }

        li + li {
            margin-top: 6px;
        }

        .chip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 2px 8px;
            border-radius: 999px;
            background: var(--chip);
            color: var(--accent);
            font-size: 0.72rem;
            letter-spacing: 0.04em;
            text-transform: uppercase;
        }

        code {
            font-family: "JetBrains Mono", "Fira Code", "Consolas", "Courier New", monospace;
            background: var(--code-bg);
            padding: 2px 5px;
            border-radius: 6px;
            color: var(--accent-2);
        }

        pre {
            margin: 10px 0 0;
            padding: 10px 12px;
            background: var(--code-bg);
            border-radius: 12px;
            overflow-x: auto;
            color: var(--text);
            font-size: 0.78rem;
        }

        .note {
            color: var(--muted);
            font-size: 0.82rem;
        }

        .cta {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            margin-top: 8px;
            padding: 10px 12px;
            border-radius: 12px;
            border: 1px solid rgba(244, 184, 96, 0.5);
            background: rgba(244, 184, 96, 0.16);
            color: var(--text);
            font-weight: 600;
            letter-spacing: 0.02em;
            cursor: pointer;
            transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
        }

        .cta:hover {
            transform: translateY(-1px);
            border-color: rgba(244, 184, 96, 0.8);
            background: rgba(244, 184, 96, 0.24);
        }

        .palette-grid {
            display: grid;
            gap: 12px;
        }

        .panel-block {
            display: grid;
            gap: 10px;
            padding: 12px;
            border-radius: 14px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(0, 0, 0, 0.2);
        }

        .panel-title {
            font-size: 0.78rem;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            color: var(--muted);
        }

        .field {
            display: grid;
            gap: 6px;
        }

        .field label {
            font-size: 0.8rem;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: var(--muted);
        }

        .field input,
        .field select {
            background: rgba(0, 0, 0, 0.35);
            border: 1px solid rgba(255, 255, 255, 0.12);
            color: var(--text);
            padding: 8px 10px;
            border-radius: 10px;
            font-size: 0.85rem;
        }

        .palette-list {
            display: grid;
            gap: 8px;
            padding: 8px;
            border-radius: 12px;
            background: rgba(0, 0, 0, 0.25);
            border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .palette-item {
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.05);
            padding: 8px 10px;
            text-align: left;
            color: var(--text);
            cursor: pointer;
            display: grid;
            gap: 6px;
            transition: border-color 0.2s ease, background 0.2s ease;
        }

        .palette-item.active {
            border-color: rgba(92, 184, 178, 0.7);
            background: rgba(92, 184, 178, 0.12);
        }

        .palette-bar {
            height: 10px;
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.18);
        }

        .palette-name {
            font-weight: 600;
        }

        .palette-meta {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            font-size: 0.75rem;
            color: var(--muted);
        }

        .palette-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }

        .chip-color {
            width: 18px;
            height: 18px;
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .color-builder {
            display: grid;
            gap: 8px;
        }

        .generator {
            display: grid;
            gap: 8px;
        }

        .generator-row {
            display: grid;
            grid-template-columns: auto 1fr auto auto;
            gap: 6px;
            align-items: center;
        }

        .generator-row input[type="number"] {
            width: 78px;
        }

        .scale-preview {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(36px, 1fr));
            gap: 6px;
        }

        .preview-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }

        .scale-swatch {
            display: grid;
            gap: 4px;
            justify-items: center;
        }

        .scale-color {
            width: 100%;
            height: 28px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .scale-label {
            font-size: 0.65rem;
            color: var(--muted);
        }

        .theme-list {
            display: grid;
            gap: 8px;
        }

        .theme-card {
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            background: rgba(255, 255, 255, 0.04);
            padding: 10px 12px;
            text-align: left;
            color: var(--text);
            display: grid;
            gap: 6px;
            cursor: pointer;
            transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
        }

        .theme-card.active {
            border-color: rgba(244, 184, 96, 0.6);
            background: rgba(244, 184, 96, 0.12);
        }

        .theme-card:hover {
            transform: translateY(-1px);
        }

        .theme-bar {
            height: 14px;
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .theme-meta {
            font-size: 0.75rem;
            color: var(--muted);
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
            width: 36px;
            height: 32px;
            padding: 0;
            border: none;
            background: transparent;
        }

        .color-row input[type="text"],
        .color-add input[type="text"] {
            width: 100%;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 8px 10px;
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            background: rgba(255, 255, 255, 0.06);
            color: var(--text);
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
        }

        .btn.secondary {
            background: rgba(92, 184, 178, 0.12);
            border-color: rgba(92, 184, 178, 0.5);
        }

        .btn.danger {
            background: rgba(224, 122, 95, 0.15);
            border-color: rgba(224, 122, 95, 0.6);
        }

        .btn:hover {
            transform: translateY(-1px);
            border-color: rgba(244, 184, 96, 0.7);
        }

        .button-grid {
            display: grid;
            gap: 8px;
        }

        .status {
            margin-top: 8px;
            font-size: 0.82rem;
            color: var(--muted);
        }

        .status.success {
            color: #7ddf9b;
        }

        .status.error {
            color: #f08b74;
        }

        .invalid {
            border-color: rgba(224, 122, 95, 0.8);
        }

        @media (max-width: 460px) {
            .color-row,
            .color-add {
                grid-template-columns: auto 1fr auto;
                grid-template-rows: auto auto;
            }

            .color-row .btn,
            .color-add .btn {
                grid-column: span 3;
            }
        }

        @keyframes rise {
            from {
                opacity: 0;
                transform: translateY(8px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        @media (prefers-reduced-motion: reduce) {
            .card {
                animation: none;
            }

            .menu a {
                transition: none;
            }
        }
    </style>
</head>
<body>
    <div class="shell">
        <header class="hero">
            <div class="eyebrow">Tableau</div>
            <h1>Tableau Tools</h1>
            <p class="subtitle">Color palette builder, workbook extraction, and .twbl language support.</p>
        </header>

        <nav class="menu">
            <div class="menu-title">Tools</div>
            <a href="#palettes">Color Palettes</a>
            <a href="#commands">Commands</a>
            <a href="#guide">Reference Guide</a>
        </nav>

        <main>
            <section class="card" id="palettes" style="--delay: 0.05s;">
                <span class="chip">Color Palettes</span>
                <h2>Preferences.tps Builder</h2>
                <p>Build palettes here, save them to <code>config/Preferences.tps</code>, then copy to your Tableau repository.</p>
                <ul>
                    <li><code>regular</code> for categorical palettes.</li>
                    <li><code>ordered-sequential</code> for sequential palettes.</li>
                    <li><code>ordered-diverging</code> for diverging palettes.</li>
                    <li>Use hex colors in the builder.</li>
                </ul>
                <div class="palette-grid">
                    <div class="panel-block">
                        <div class="panel-title">Palette Library</div>
                        <div class="palette-list" id="palette-list"></div>
                    </div>

                    <div class="panel-block">
                        <div class="panel-title">Palette Editor</div>
                        <div class="field">
                            <label for="palette-name">Palette name</label>
                            <input id="palette-name" type="text" placeholder="My Palette">
                        </div>
                        <div class="field">
                            <label for="palette-type">Palette type</label>
                            <select id="palette-type">
                                <option value="regular">Categorical (regular)</option>
                                <option value="ordered-sequential">Sequential (ordered-sequential)</option>
                                <option value="ordered-diverging">Diverging (ordered-diverging)</option>
                            </select>
                        </div>

                        <div class="color-builder">
                            <div class="color-add">
                                <input id="new-color-picker" type="color" value="#F4B860" aria-label="New color picker">
                                <input id="new-color-hex" type="text" value="#F4B860" aria-label="New color hex">
                                <button class="btn secondary" id="add-color" type="button">Add Color</button>
                            </div>
                            <div id="colors-list"></div>
                        </div>

                        <div class="button-grid">
                            <button class="btn secondary" id="save-palette" type="button">Save Palette</button>
                            <button class="btn" id="new-palette" type="button">New Palette</button>
                            <button class="btn danger" id="delete-palette" type="button">Delete Palette</button>
                        </div>
                    </div>

                    <div class="panel-block">
                        <div class="panel-title">Scale Generator</div>
                        <div class="generator">
                            <div class="generator-row">
                                <input id="scale-base-picker" type="color" value="#5CB8B2" aria-label="Scale base color">
                                <input id="scale-base-hex" type="text" value="#5CB8B2" aria-label="Scale base hex">
                                <input id="scale-steps" type="number" min="3" max="12" value="9" aria-label="Scale steps">
                                <button class="btn secondary" id="scale-generate" type="button">Generate Scale</button>
                            </div>
                            <div class="scale-preview" id="scale-preview"></div>
                            <div class="preview-actions">
                                <button class="btn" id="scale-apply" type="button">Apply to Editor</button>
                            </div>
                        </div>
                        <div class="generator">
                            <div class="generator-row">
                                <input id="blend-start-picker" type="color" value="#F4B860" aria-label="Blend start color">
                                <input id="blend-end-picker" type="color" value="#3D5A80" aria-label="Blend end color">
                                <input id="blend-steps" type="number" min="3" max="12" value="7" aria-label="Blend steps">
                                <button class="btn secondary" id="blend-generate" type="button">Blend Colors</button>
                            </div>
                            <div class="scale-preview" id="blend-preview"></div>
                            <div class="preview-actions">
                                <button class="btn" id="blend-apply" type="button">Apply to Editor</button>
                            </div>
                        </div>
                    </div>

                    <div class="panel-block">
                        <div class="panel-title">Theme Vault</div>
                        <div class="theme-list" id="theme-list"></div>
                        <button class="btn secondary" id="add-theme-palette" type="button">Add Theme Palette to List</button>
                    </div>

                    <div class="panel-block">
                        <div class="panel-title">File Actions</div>
                        <div class="button-grid">
                            <button class="btn secondary" id="save-file" type="button">Save to Preferences.tps</button>
                            <button class="btn" id="reload-file" type="button">Reload from Preferences.tps</button>
                            <button class="btn" id="open-preferences" type="button">Open Preferences.tps Template</button>
                            <button class="btn" id="copy-preferences" type="button">Copy to My Tableau Repository</button>
                        </div>

                        <div class="status" id="palette-status"></div>
                        <p class="note" id="palette-source">Source: not loaded yet.</p>
                        <p class="note">Restart Tableau Desktop after updating the file.</p>
                    </div>
                </div>
            </section>

            <section class="card" id="commands" style="--delay: 0.1s;">
                <span class="chip">Commands</span>
                <h2>Most Used Actions</h2>
                <ul>
                    <li><code>Format Tableau Expression</code> and <code>Validate Tableau Expression</code></li>
                    <li><code>Insert IF Statement</code>, <code>Insert CASE Statement</code>, <code>Insert LOD Expression</code></li>
                    <li><code>Show Function Help</code> for hover and reference guidance</li>
                    <li><code>Extract Calculations</code> to build a clean workbook inventory</li>
                </ul>
            </section>

            <section class="card" id="guide" style="--delay: 0.15s;">
                <span class="chip">Reference Guide</span>
                <h2>.twbl Parsing and Language Support</h2>
                <details>
                    <summary style="cursor: pointer; font-weight: 600; margin-bottom: 1rem; padding: 0.5rem; background: rgba(0,0,0,0.05); border-radius: 4px;">
                        Quick Start
                    </summary>
                    <ul>
                        <li>Open a <code>.twbl</code> file and the extension activates automatically.</li>
                        <li>Hover for function and field help, and use completion for syntax hints.</li>
                        <li>Use the Problems panel for parser feedback while you type.</li>
                        <li>Formatting and validation commands help keep expressions readable.</li>
                    </ul>
                </details>

                <details>
                    <summary style="cursor: pointer; font-weight: 600; margin-bottom: 1rem; padding: 0.5rem; background: rgba(0,0,0,0.05); border-radius: 4px;">
                        Parsing Rules
                    </summary>
                    <h3>Structure That Parses Cleanly</h3>
                    <ul>
                        <li>Separate calculations with a blank line to reduce ambiguity.</li>
                        <li>Optional header format: <code>// Name - short description</code>.</li>
                        <li>Put <code>IF</code>, <code>THEN</code>, <code>ELSE</code>, <code>END</code> on their own lines for multi-line logic.</li>
                        <li>For <code>CASE</code>, keep <code>WHEN</code> and <code>THEN</code> on separate lines.</li>
                        <li>LOD blocks are easiest to parse when the braces and colon are explicit.</li>
                        <li>Avoid non-ASCII characters such as smart quotes or emoji.</li>
                    </ul>
                </details>

                <details>
                    <summary style="cursor: pointer; font-weight: 600; margin-bottom: 1rem; padding: 0.5rem; background: rgba(0,0,0,0.05); border-radius: 4px;">
                        Parser Tips
                    </summary>
                    <h3>Stabilize Diagnostics</h3>
                    <ul>
                        <li>Inline <code>IF ... THEN</code> on one line can confuse multi-line parsing.</li>
                        <li>Align <code>END</code> with the opening keyword.</li>
                        <li>Use <code>AND</code>/<code>OR</code> on separate lines for long conditions.</li>
                        <li>Run <code>Tableau: Inspect Tableau Problems</code> for targeted guidance.</li>
                    </ul>
                </details>

                <details>
                    <summary style="cursor: pointer; font-weight: 600; margin-bottom: 1rem; padding: 0.5rem; background: rgba(0,0,0,0.05); border-radius: 4px;">
                        Extraction Output
                    </summary>
                    <h3>Output Shape</h3>
                    <p>Extraction creates a structured <code>.twbl</code> file with summary and sections.</p>
                    <pre><code>Total workbooks: 1
Total datasources: 2
Total calculations: 3
Total fields: 15

=== DATASOURCES ===
Datasource | Workbook.twb

=== FIELDS ===
Field | Datasource | datatype | role | Workbook.twb

=== CALCULATIONS ===
// Caption | Datasource | Workbook.twb
IF ... END</code></pre>
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
        const deletePaletteButton = document.getElementById('delete-palette');
        const saveFileButton = document.getElementById('save-file');
        const reloadFileButton = document.getElementById('reload-file');
        const openButton = document.getElementById('open-preferences');
        const copyButton = document.getElementById('copy-preferences');
        const statusLabel = document.getElementById('palette-status');
        const sourceLabel = document.getElementById('palette-source');
        const scaleBasePicker = document.getElementById('scale-base-picker');
        const scaleBaseHex = document.getElementById('scale-base-hex');
        const scaleSteps = document.getElementById('scale-steps');
        const scaleGenerateButton = document.getElementById('scale-generate');
        const scalePreview = document.getElementById('scale-preview');
        const scaleApplyButton = document.getElementById('scale-apply');
        const blendStartPicker = document.getElementById('blend-start-picker');
        const blendEndPicker = document.getElementById('blend-end-picker');
        const blendSteps = document.getElementById('blend-steps');
        const blendGenerateButton = document.getElementById('blend-generate');
        const blendPreview = document.getElementById('blend-preview');
        const blendApplyButton = document.getElementById('blend-apply');
        const themeList = document.getElementById('theme-list');
        const addThemeButton = document.getElementById('add-theme-palette');

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
            themeIndex: 0,
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
            scaleGenerateButton,
            scalePreview,
            scaleApplyButton,
            blendStartPicker,
            blendEndPicker,
            blendSteps,
            blendGenerateButton,
            blendPreview,
            blendApplyButton,
            themeList,
            addThemeButton
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

            if (deletePaletteButton) {
                deletePaletteButton.addEventListener('click', () => {
                    if (!state.selectedName) {
                        setStatus('Select a palette to delete.', 'error');
                        return;
                    }
                    const index = state.palettes.findIndex(item => item.name === state.selectedName);
                    if (index >= 0) {
                        state.palettes.splice(index, 1);
                    }
                    state.selectedName = '';
                    state.editor = {
                        name: '',
                        type: 'regular',
                        colors: []
                    };
                    paletteNameInput.value = '';
                    paletteTypeSelect.value = 'regular';
                    renderAll();
                    setStatus('Palette removed from the sidebar list.', 'success');
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

            scaleGenerateButton.addEventListener('click', () => {
                const base = normalizeHex(scaleBaseHex.value) || normalizeHex(scaleBasePicker.value);
                if (!base) {
                    scaleBaseHex.classList.add('invalid');
                    setStatus('Enter a valid hex color for the scale base.', 'error');
                    return;
                }
                const steps = normalizeSteps(scaleSteps.value, 9);
                scaleSteps.value = String(steps);
                scaleBaseHex.value = base;
                scaleBasePicker.value = base;

                const colors = generateScaleColors(base, steps);
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
                const start = normalizeHex(blendStartPicker.value);
                const end = normalizeHex(blendEndPicker.value);
                if (!start || !end) {
                    setStatus('Select valid blend colors.', 'error');
                    return;
                }
                const steps = normalizeSteps(blendSteps.value, 7);
                blendSteps.value = String(steps);

                const colors = generateBlendColors(start, end, steps);
                if (colors.length === 0) {
                    setStatus('Unable to blend colors.', 'error');
                    return;
                }
                state.blendColors = colors;
                renderBlendPreview();
                setStatus('Blend ready. Use Apply to Editor to load it.', 'info');
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
                const card = target.closest('.theme-card');
                if (!card) {
                    return;
                }
                const index = Number(card.dataset.index);
                if (Number.isNaN(index)) {
                    return;
                }
                const maxIndex = Math.max(0, themePresets.length - 1);
                state.themeIndex = clampNumber(index, 0, maxIndex);
                renderThemes();
            });

            addThemeButton.addEventListener('click', () => {
                const theme = themePresets[state.themeIndex] || themePresets[0];
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
                setStatus('Theme palette added to the list.', 'success');
            });

            window.addEventListener('message', event => {
                const message = event.data;
                if (!message || typeof message !== 'object') {
                    return;
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
                const chips = colors.slice(0, 8).map(color => {
                    const safeColor = sanitizeColor(color);
                    return '<span class="chip-color" style="background:' + safeColor + ';"></span>';
                }).join('');
                const activeClass = palette.name === state.selectedName ? ' active' : '';
                const paletteType = escapeHtml(palette.type || 'regular');
                const paletteName = escapeHtml(palette.name);
                const gradient = buildGradient(colors);
                return [
                    '<button class="palette-item' + activeClass + '" type="button" data-index="' + index + '">',
                    '    <div class="palette-name">' + paletteName + '</div>',
                    '    <div class="palette-meta">',
                    '        <span>' + paletteType + '</span>',
                    '        <span>' + colors.length + ' colors</span>',
                    '    </div>',
                    '    <div class="palette-bar" style="background:' + gradient + ';"></div>',
                    '    <div class="palette-chips">' + chips + '</div>',
                    '</button>'
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
                    '    <input class="color-hex' + invalidClass + '" type="text" value="' + escapeHtml(hexValue) + '" aria-label="Hex ' + (index + 1) + '">',
                    '    <button class="btn" data-action="up" type="button">Up</button>',
                    '    <button class="btn" data-action="down" type="button">Down</button>',
                    '    <button class="btn danger" data-action="remove" type="button">Remove</button>',
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
                const activeClass = index === state.themeIndex ? ' active' : '';
                const name = escapeHtml(theme.name);
                const tags = Array.isArray(theme.tags) ? theme.tags.map(tag => escapeHtml(tag)).filter(Boolean) : [];
                const tagText = tags.length ? ' | ' + tags.join(', ') : '';
                const metaText = name + ' | ' + colors.length + ' colors' + tagText;
                return [
                    '<button class="theme-card' + activeClass + '" type="button" data-index="' + index + '">',
                    '    <div class="theme-bar" style="background:' + gradient + ';"></div>',
                    '    <div class="theme-meta">' + metaText + '</div>',
                    '</button>'
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
            return clampNumber(parsed, 3, 12);
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

        function generateScaleColors(baseHex, steps) {
            const normalized = normalizeHex(baseHex);
            if (!normalized) {
                return [];
            }
            const rgb = hexToRgb(normalized);
            if (!rgb) {
                return [];
            }
            const hsl = rgbToHsl(rgb);
            const light = clampNumber(hsl.l + 35, 10, 95);
            const dark = clampNumber(hsl.l - 35, 5, 85);
            const start = Math.max(light, dark);
            const end = Math.min(light, dark);
            const count = Math.max(2, steps);
            const colors = [];

            for (let i = 0; i < count; i += 1) {
                const ratio = count === 1 ? 0 : i / (count - 1);
                const l = start + (end - start) * ratio;
                const step = hslToRgb({ h: hsl.h, s: hsl.s, l });
                colors.push(rgbToHex(step));
            }

            return colors;
        }

        function generateBlendColors(startHex, endHex, steps) {
            const start = hexToRgb(startHex);
            const end = hexToRgb(endHex);
            if (!start || !end) {
                return [];
            }
            const count = Math.max(2, steps);
            const colors = [];

            for (let i = 0; i < count; i += 1) {
                const ratio = count === 1 ? 0 : i / (count - 1);
                const r = Math.round(start.r + (end.r - start.r) * ratio);
                const g = Math.round(start.g + (end.g - start.g) * ratio);
                const b = Math.round(start.b + (end.b - start.b) * ratio);
                colors.push(rgbToHex({ r, g, b }));
            }

            return colors;
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
