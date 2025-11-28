import * as unzipper from 'unzipper';
import { workspace } from 'vscode';
import { ExtractedCalculation } from './types';
import { extractCalcsFromXml } from './xml';
import { normalize, filterAndDedupe } from './normalize';
import { basename } from 'path';
import { TextDecoder } from 'util';

export async function extractFromFile(uri: import('vscode').Uri): Promise<ExtractedCalculation[]> {
    if (uri.fsPath.toLowerCase().endsWith('.twbx')) {
        return extractFromTwbx(uri);
    }
    if (uri.fsPath.toLowerCase().endsWith('.twb')) {
        const data = await workspace.fs.readFile(uri);
        const xml = new TextDecoder().decode(data);
        return processXml(xml, basename(uri.fsPath));
    }
    return [];
}

async function extractFromTwbx(uri: import('vscode').Uri): Promise<ExtractedCalculation[]> {
    const calcs: ExtractedCalculation[] = [];
    const stream = unzipper.Parse({ forceStream: true });
    const fileData = await workspace.fs.readFile(uri);
    const buffer = Buffer.from(fileData);
    stream.on('entry', (entry: any) => {
        const fileName: string = entry.path;
        if (fileName.toLowerCase().endsWith('.twb')) {
            let chunks: Buffer[] = [];
            entry.on('data', (d: Buffer) => chunks.push(d));
            entry.on('end', () => {
                const xml = Buffer.concat(chunks).toString('utf8');
                calcs.push(...processXml(xml, basename(fileName)));
            });
        } else {
            entry.autodrain();
        }
    });
    stream.end(buffer);
    // Wait a tick for processing (quick stub)
    await new Promise(r => setTimeout(r, 50));
    return calcs;
}

function processXml(xml: string, workbook: string): ExtractedCalculation[] {
    const raw = extractCalcsFromXml(xml, workbook);
    const norm = normalize(raw);
    return filterAndDedupe(norm);
}
