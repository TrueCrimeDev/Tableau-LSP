import * as unzipper from 'unzipper';
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

async function extractFromTwbx(uri: import('vscode').Uri): Promise<ExtractedCalculation[]> {
    return new Promise<ExtractedCalculation[]>((resolve, reject) => {
        const calcs: ExtractedCalculation[] = [];
        const errors: Error[] = [];
        let processedEntries = 0;
        let totalEntries = 0;
        let hasFoundTwb = false;

        try {
            // Dynamic require to avoid TS type dependency for beta scaffold
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const unzipper: any = (() => { try { return require('unzipper'); } catch { return null; } })();
            if (!unzipper) return [];
            const fileData = await workspace.fs.readFile(uri);
            await new Promise<void>((resolve) => {
                const stream = unzipper.Parse({ forceStream: true });
            
            stream.on('entry', (entry: any) => {
                totalEntries++;
                const fileName: string = entry.path;
                
                if (fileName.toLowerCase().endsWith('.twb')) {
                    hasFoundTwb = true;
                    let chunks: Buffer[] = [];
                    
                    entry.on('data', (chunk: Buffer) => {
                        chunks.push(chunk);
                    });
                    
                    entry.on('end', () => {
                        try {
                            const xml = Buffer.concat(chunks).toString('utf8');
                            const extracted = processXml(xml, basename(fileName));
                            calcs.push(...extracted);
                        } catch (error) {
                            errors.push(new Error(`Failed to process ${fileName}: ${error}`));
                        }
                        processedEntries++;
                        checkCompletion();
                    });
                    
                    entry.on('error', (error: Error) => {
                        errors.push(new Error(`Stream error for ${fileName}: ${error.message}`));
                        processedEntries++;
                        checkCompletion();
                    });
                } else {
                    entry.autodrain();
                    processedEntries++;
                    setImmediate(checkCompletion);
                }
            });

            stream.on('error', (error: Error) => {
                reject(new Error(`ZIP parsing failed: ${error.message}`));
            });

            stream.on('end', () => {
                if (!hasFoundTwb) {
                    reject(new Error('No .twb file found in the .twbx archive'));
                }
            });

            function checkCompletion() {
                if (processedEntries >= totalEntries) {
                    if (errors.length > 0) {
                        console.warn('Extraction completed with errors:', errors);
                    }
                    resolve(calcs);
                }
            }

            // Start processing
            });
            workspace.fs.readFile(uri).then(fileData => {
                const buffer = Buffer.from(fileData);
                stream.end(buffer);
            }).catch(reject);

        } catch (error) {
            reject(new Error(`Failed to initialize ZIP processing: ${error}`));
        }
    });
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
