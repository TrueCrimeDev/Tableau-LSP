import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

export type PaletteType = 'regular' | 'ordered-sequential' | 'ordered-diverging';

export interface PaletteDefinition {
    name: string;
    type: PaletteType;
    colors: string[];
}

export type PreferencesSource = 'workspace' | 'extension' | 'empty';

export interface PreferencesLoadResult {
    uri: vscode.Uri;
    source: PreferencesSource;
    text: string;
}

const textDecoder = new TextDecoder('utf-8');
const textEncoder = new TextEncoder();
const workspaceRelativePath = ['config', 'Preferences.tps'];
const archiveRelativePath = ['config', 'Preferences.archive.tps'];
const repositoryRelativePath = ['Documents', 'My Tableau Repository', 'Preferences.tps'];

export function getWorkspacePreferencesUri(): vscode.Uri | undefined {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return undefined;
    }
    return vscode.Uri.joinPath(workspaceFolder.uri, ...workspaceRelativePath);
}

function getWorkspaceArchiveUri(workspaceUri?: vscode.Uri): vscode.Uri | undefined {
    const root = workspaceUri ?? vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) {
        return undefined;
    }
    return vscode.Uri.joinPath(root, ...archiveRelativePath);
}

export function getExtensionPreferencesUri(context: vscode.ExtensionContext): vscode.Uri {
    return vscode.Uri.joinPath(context.extensionUri, ...workspaceRelativePath);
}

export function getRepositoryPreferencesUri(): vscode.Uri {
    return vscode.Uri.file(path.join(os.homedir(), ...repositoryRelativePath));
}

export async function loadPreferencesText(
    context: vscode.ExtensionContext,
    preferWorkspace: boolean
): Promise<PreferencesLoadResult> {
    const workspaceUri = getWorkspacePreferencesUri();
    if (preferWorkspace && workspaceUri) {
        const workspaceText = await readTextIfExists(workspaceUri);
        if (workspaceText !== null) {
            return { uri: workspaceUri, source: 'workspace', text: workspaceText };
        }
    }

    const extensionUri = getExtensionPreferencesUri(context);
    const extensionText = await readTextIfExists(extensionUri);
    if (extensionText !== null) {
        return { uri: extensionUri, source: 'extension', text: extensionText };
    }

    return {
        uri: workspaceUri ?? extensionUri,
        source: 'empty',
        text: buildPreferencesDocument([])
    };
}

export async function writePreferencesText(uri: vscode.Uri, text: string): Promise<void> {
    await vscode.workspace.fs.writeFile(uri, textEncoder.encode(text));
}

export async function copyPreferencesToRepository(
    context: vscode.ExtensionContext,
    preferWorkspace: boolean,
    promptOnOverwrite: boolean
): Promise<void> {
    const loadResult = await loadPreferencesText(context, preferWorkspace);
    const sourceText = loadResult.text.trim() ? loadResult.text : buildPreferencesDocument([]);
    const targetUri = getRepositoryPreferencesUri();
    const targetDir = vscode.Uri.file(path.dirname(targetUri.fsPath));

    await vscode.workspace.fs.createDirectory(targetDir);

    const targetExists = await fileExists(targetUri);
    if (targetExists && promptOnOverwrite) {
        const confirm = await vscode.window.showWarningMessage(
            'Preferences.tps already exists in My Tableau Repository. Overwrite it?',
            { modal: true },
            'Overwrite'
        );
        if (confirm !== 'Overwrite') {
            return;
        }
    }

    await writePreferencesText(targetUri, sourceText);
    const sourceLabel = loadResult.source === 'workspace' ? 'workspace config' : 'extension template';
    vscode.window.showInformationMessage(
        `Copied Preferences.tps from ${sourceLabel} to My Tableau Repository.`
    );
}

export async function appendToArchive(
    palette: PaletteDefinition,
    workspaceUri?: vscode.Uri
): Promise<void> {
    const archiveUri = getWorkspaceArchiveUri(workspaceUri);
    if (!archiveUri) {
        throw new Error('Open a workspace folder to archive palettes.');
    }

    const archiveDir = vscode.Uri.file(path.dirname(archiveUri.fsPath));
    await vscode.workspace.fs.createDirectory(archiveDir);

    const baseText = (await readTextIfExists(archiveUri)) ?? buildPreferencesDocument([]);
    const existing = parsePalettes(baseText);
    const normalizedName = palette.name.trim().toLowerCase();

    const filtered = existing.filter(item => item.name.trim().toLowerCase() !== normalizedName);
    filtered.push(normalizePalette(palette));

    const updatedText = applyPaletteChanges(baseText, filtered);
    await writePreferencesText(archiveUri, updatedText);
}

export function parsePalettes(text: string): PaletteDefinition[] {
    const palettes: PaletteDefinition[] = [];
    const paletteRegex = /<color-palette\b[^>]*>[\s\S]*?<\/color-palette>/gi;

    for (const match of text.matchAll(paletteRegex)) {
        const block = match[0];
        const nameMatch = /name=["']([^"']+)["']/i.exec(block);
        if (!nameMatch) {
            continue;
        }

        const typeMatch = /type=["']([^"']+)["']/i.exec(block);
        const name = decodeXmlEntities(nameMatch[1]);
        const type = normalizePaletteType(typeMatch?.[1] ?? 'regular');
        const colors: string[] = [];

        for (const colorMatch of block.matchAll(/<color>([^<]+)<\/color>/gi)) {
            const normalized = normalizeColorValue(colorMatch[1]);
            if (normalized) {
                colors.push(normalized);
            }
        }

        palettes.push({ name, type, colors });
    }

    return palettes;
}

export function applyPaletteChanges(text: string, palettes: PaletteDefinition[]): string {
    let updatedText = ensurePreferencesContainer(text);
    const existing = parsePalettes(updatedText);
    const nextByName = new Map(palettes.map(palette => [palette.name, normalizePalette(palette)]));

    for (const palette of existing) {
        if (!nextByName.has(palette.name)) {
            updatedText = removePaletteByName(updatedText, palette.name);
        }
    }

    for (const palette of nextByName.values()) {
        if (palette.name) {
            updatedText = upsertPalette(updatedText, palette);
        }
    }

    return updatedText;
}

export function buildPreferencesDocument(palettes: PaletteDefinition[]): string {
    const base = `<?xml version='1.0'?>\n<workbook>\n  <preferences>\n  </preferences>\n</workbook>\n`;
    return applyPaletteChanges(base, palettes);
}

async function readTextIfExists(uri: vscode.Uri): Promise<string | null> {
    try {
        const data = await vscode.workspace.fs.readFile(uri);
        return textDecoder.decode(data);
    } catch {
        return null;
    }
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}

function ensurePreferencesContainer(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) {
        return buildPreferencesDocument([]);
    }

    const hasPreferencesOpen = /<preferences\b/i.test(text);
    const hasPreferencesClose = /<\/preferences>/i.test(text);
    if (hasPreferencesOpen && hasPreferencesClose) {
        return text;
    }

    if (hasPreferencesOpen && !hasPreferencesClose) {
        const workbookClose = /<\/workbook>/i.exec(text);
        if (workbookClose?.index !== undefined) {
            return `${text.slice(0, workbookClose.index)}\n  </preferences>\n${text.slice(workbookClose.index)}`;
        }
    }

    const workbookOpen = /<workbook[^>]*>/i.exec(text);
    if (workbookOpen?.index !== undefined) {
        const insertAt = workbookOpen.index + workbookOpen[0].length;
        const before = text.slice(0, insertAt);
        const after = text.slice(insertAt);
        return `${before}\n  <preferences>\n  </preferences>${after}`;
    }

    return buildPreferencesDocument([]);
}

function upsertPalette(text: string, palette: PaletteDefinition): string {
    const escapedName = escapeRegExp(palette.name);
    const paletteBlock = buildPaletteBlock(palette);
    const paletteRegex = new RegExp(
        `<color-palette\\b[^>]*name=["']${escapedName}["'][^>]*>[\\s\\S]*?<\\/color-palette>`,
        'i'
    );

    if (paletteRegex.test(text)) {
        return text.replace(paletteRegex, paletteBlock);
    }

    return insertPaletteBlock(text, paletteBlock);
}

function removePaletteByName(text: string, name: string): string {
    const escapedName = escapeRegExp(name);
    const paletteRegex = new RegExp(
        `[\\t ]*<color-palette\\b[^>]*name=["']${escapedName}["'][^>]*>[\\s\\S]*?<\\/color-palette>\\s*`,
        'i'
    );
    return text.replace(paletteRegex, '');
}

function insertPaletteBlock(text: string, block: string): string {
    const closingMatch = /(\s*)<\/preferences>/i.exec(text);
    if (!closingMatch) {
        return `${text.trimEnd()}\n${block}\n`;
    }

    const indent = closingMatch[1];
    const before = text.slice(0, closingMatch.index);
    const after = text.slice(closingMatch.index + closingMatch[0].length);
    const beforeWithNewline = before.endsWith('\n') ? before : `${before}\n`;

    return `${beforeWithNewline}${block}\n${indent}</preferences>${after}`;
}

function buildPaletteBlock(palette: PaletteDefinition): string {
    const escapedName = escapeXmlAttribute(palette.name);
    const type = normalizePaletteType(palette.type);
    const colors = palette.colors.map(color => `      <color>${normalizeColorValue(color)}</color>`);
    return [
        `    <color-palette name="${escapedName}" type="${type}">`,
        ...colors,
        '    </color-palette>'
    ].join('\n');
}

function normalizePalette(palette: PaletteDefinition): PaletteDefinition {
    const name = palette.name.trim();
    const type = normalizePaletteType(palette.type);
    const colors = palette.colors.map(normalizeColorValue).filter(Boolean);
    return { name, type, colors };
}

function normalizePaletteType(type: string): PaletteType {
    if (type === 'ordered-sequential' || type === 'ordered-diverging') {
        return type;
    }
    return 'regular';
}

function normalizeColorValue(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
        return '';
    }

    if (/^#?[0-9a-fA-F]{6}$/.test(trimmed)) {
        const hex = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
        return hex.toUpperCase();
    }

    return trimmed;
}

function escapeXmlAttribute(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function decodeXmlEntities(value: string): string {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
