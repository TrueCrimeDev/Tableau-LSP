import { workspace } from 'vscode';
import { ExtractedCalculation } from './types';
import { extractCalcsFromXml } from './xml';
import { normalize, filterAndDedupe } from './normalize';
import { basename } from 'path';
import { TextDecoder } from 'util';

export async function extractFromFile(uri: import('vscode').Uri): Promise<ExtractedCalculation[]> {
    try {
        if (uri.fsPath.toLowerCase().endsWith('.twbx')) {
            return await extractFromTwbx(uri);
        }
        if (uri.fsPath.toLowerCase().endsWith('.twb')) {
            const data = await workspace.fs.readFile(uri);
            const xml = new TextDecoder().decode(data);
            return processXml(xml, basename(uri.fsPath));
        }
        return [];
    } catch (error) {
        console.error(`Failed to extract from file ${uri.fsPath}:`, error);
        throw new Error(`Extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function extractFromTwbx(_: import('vscode').Uri): Promise<ExtractedCalculation[]> {
    // Placeholder: .twbx (packaged workbook) extraction not yet implemented in beta scaffold.
    // Returning empty list keeps the feature behind a functional stub without breaking build.
    console.warn('[tableau-extract] .twbx extraction is not implemented in this beta version.');
    return [];
}

function processXml(xml: string, workbook: string): ExtractedCalculation[] {
    try {
        const raw = extractCalcsFromXml(xml, workbook);
        const normalized = normalize(raw);
        return filterAndDedupe(normalized);
    } catch (error) {
        console.error(`Failed to process XML for workbook ${workbook}:`, error);
        return [];
    }
}
