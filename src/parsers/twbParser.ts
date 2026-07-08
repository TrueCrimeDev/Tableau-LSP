import * as vscode from 'vscode';

import {
    PaletteDefinition,
    applyPaletteChanges,
    parsePalettes
} from '../preferences/preferencesFile.js';
import {
    WorkbookDocument,
    WorkbookError,
    WorkbookUpdateResult
} from '../types/workbook.js';

const textDecoder = new TextDecoder('utf-8');
const textEncoder = new TextEncoder();

export class TWBParser {
    public async parseWorkbook(uri: vscode.Uri): Promise<WorkbookDocument> {
        try {
            const fileData = await vscode.workspace.fs.readFile(uri);
            const xml = textDecoder.decode(fileData);
            const extension = uri.path.toLowerCase();

            if (!extension.endsWith('.twb')) {
                throw new WorkbookError('Only .twb files are supported by this parser.', 'UNSUPPORTED_EXTENSION');
            }

            if (!xml.trim()) {
                throw new WorkbookError('Workbook file is empty.', 'EMPTY_WORKBOOK');
            }

            const palettes = parsePalettes(xml);
            return { xml, palettes };
        } catch (error: unknown) {
            if (error instanceof WorkbookError) {
                throw error;
            }
            const message = error instanceof Error ? error.message : String(error);
            throw new WorkbookError(`Unable to read workbook: ${message}`, 'READ_FAILED');
        }
    }

    public upsertPalette(workbook: WorkbookDocument, palette: PaletteDefinition): WorkbookUpdateResult {
        const nextPalette = normalizePalette(palette);
        if (!nextPalette) {
            throw new WorkbookError('Palette is invalid. Provide a name and at least one color.', 'INVALID_PALETTE');
        }

        const existingIndex = workbook.palettes.findIndex(
            existing => existing.name.toLowerCase() === nextPalette.name.toLowerCase()
        );

        const nextPalettes = workbook.palettes.slice();
        let action: WorkbookUpdateResult['action'] = 'none';

        if (existingIndex >= 0) {
            if (isSamePalette(nextPalettes[existingIndex], nextPalette)) {
                return {
                    updatedXml: workbook.xml,
                    hasChanges: false,
                    action: 'none'
                };
            }
            nextPalettes[existingIndex] = nextPalette;
            action = 'updated';
        } else {
            nextPalettes.push(nextPalette);
            action = 'added';
        }

        const updatedXml = applyPaletteChanges(workbook.xml, nextPalettes);
        return {
            updatedXml,
            hasChanges: updatedXml !== workbook.xml,
            action
        };
    }

    public async writeWorkbook(uri: vscode.Uri, xml: string): Promise<void> {
        try {
            await vscode.workspace.fs.writeFile(uri, textEncoder.encode(xml));
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new WorkbookError(`Unable to write workbook: ${message}`, 'WRITE_FAILED');
        }
    }
}

function normalizePalette(rawPalette: PaletteDefinition | null | undefined): PaletteDefinition | null {
    if (!rawPalette) {
        return null;
    }

    const name = rawPalette.name.trim();
    if (!name) {
        return null;
    }

    const colors = rawPalette.colors
        .map(color => color.trim())
        .filter(Boolean);

    if (colors.length === 0) {
        return null;
    }

    return {
        name,
        type: rawPalette.type,
        colors
    };
}

function isSamePalette(left: PaletteDefinition, right: PaletteDefinition): boolean {
    if (left.name !== right.name || left.type !== right.type || left.colors.length !== right.colors.length) {
        return false;
    }

    for (let i = 0; i < left.colors.length; i += 1) {
        if (left.colors[i] !== right.colors[i]) {
            return false;
        }
    }

    return true;
}

