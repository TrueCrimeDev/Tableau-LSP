import { workspace, Uri } from 'vscode';
import { TextDecoder } from 'util';
import { basename } from 'path';
import * as unzipper from 'unzipper';
import { ExtractedCalculation, ExtractionResult, ExtractedDatasource, ExtractedField } from './types';
import { extractCalcsFromXml, extractDatasourcesFromXml, extractFieldsFromXml, XmlPreprocessor } from './xml';

const textDecoder = new TextDecoder('utf8');

export async function extractFromFile(
    uri: Uri,
    preprocessor?: XmlPreprocessor
): Promise<ExtractedCalculation[]> {
    try {
        const filePath = uri.fsPath.toLowerCase();
        if (filePath.endsWith('.twbx')) {
            return await extractFromTwbx(uri, preprocessor);
        }

        if (filePath.endsWith('.twb')) {
            const data = await workspace.fs.readFile(uri);
            const xml = textDecoder.decode(data);
            return extractCalcsFromXml(xml, basename(uri.fsPath), preprocessor);
        }

        return [];
    } catch (error) {
        console.error(`Failed to extract from file ${uri.fsPath}:`, error);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Extraction failed: ${message}`);
    }
}

export async function extractFromTwbx(
    uri: Uri,
    preprocessor?: XmlPreprocessor
): Promise<ExtractedCalculation[]> {
    try {
        const data = await workspace.fs.readFile(uri);
        const directory = await unzipper.Open.buffer(Buffer.from(data));
        const twbEntries = directory.files.filter(entry => entry.path.toLowerCase().endsWith('.twb'));

        if (twbEntries.length === 0) {
            throw new Error('No .twb file found in the .twbx archive');
        }

        const calculations: ExtractedCalculation[] = [];
        const errors: string[] = [];

        for (const entry of twbEntries) {
            try {
                const buffer = await entry.buffer();
                const xml = buffer.toString('utf8');
                const workbookName = basename(entry.path);
                const extracted = extractCalcsFromXml(xml, workbookName, preprocessor);
                calculations.push(...extracted);
            } catch (entryError) {
                const message = entryError instanceof Error ? entryError.message : String(entryError);
                errors.push(`${entry.path}: ${message}`);
            }
        }

        if (errors.length > 0) {
            console.warn(`Extraction completed with errors for ${uri.fsPath}:`, errors);
        }

        return calculations;
    } catch (error) {
        console.error(`Failed to extract from archive ${uri.fsPath}:`, error);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Extraction failed: ${message}`);
    }
}

/**
 * Extracts all data (calculations, datasources, fields) from a Tableau workbook file
 *
 * @param uri - The URI of the workbook file
 * @param preprocessor - Optional XML preprocessor
 * @returns ExtractionResult with calculations, datasources, fields, and summary statistics
 */
export async function extractAllFromFile(
    uri: Uri,
    preprocessor?: XmlPreprocessor
): Promise<ExtractionResult> {
    try {
        const filePath = uri.fsPath.toLowerCase();
        if (filePath.endsWith('.twbx')) {
            return await extractAllFromTwbx(uri, preprocessor);
        }

        if (filePath.endsWith('.twb')) {
            const data = await workspace.fs.readFile(uri);
            const xml = textDecoder.decode(data);
            const workbookName = basename(uri.fsPath);

            const calculations = extractCalcsFromXml(xml, workbookName, preprocessor);
            const datasources = extractDatasourcesFromXml(xml, workbookName, preprocessor);
            const fields = extractFieldsFromXml(xml, workbookName, preprocessor);

            const uniqueWorkbooks = new Set([
                ...calculations.map(c => c.workbook),
                ...datasources.map(d => d.workbook),
                ...fields.map(f => f.workbook)
            ]);

            const uniqueDatasources = new Set([
                ...calculations.map(c => c.datasource),
                ...fields.map(f => f.datasource)
            ]);

            return {
                calculations,
                datasources,
                fields,
                summary: {
                    workbooks: uniqueWorkbooks.size,
                    datasources: uniqueDatasources.size,
                    calculations: calculations.length,
                    fields: fields.length
                }
            };
        }

        return {
            calculations: [],
            datasources: [],
            fields: [],
            summary: {
                workbooks: 0,
                datasources: 0,
                calculations: 0,
                fields: 0
            }
        };
    } catch (error) {
        console.error(`Failed to extract from file ${uri.fsPath}:`, error);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Extraction failed: ${message}`);
    }
}

/**
 * Extracts all data from a .twbx archive
 */
async function extractAllFromTwbx(
    uri: Uri,
    preprocessor?: XmlPreprocessor
): Promise<ExtractionResult> {
    try {
        const data = await workspace.fs.readFile(uri);
        const directory = await unzipper.Open.buffer(Buffer.from(data));
        const twbEntries = directory.files.filter(entry => entry.path.toLowerCase().endsWith('.twb'));

        if (twbEntries.length === 0) {
            throw new Error('No .twb file found in the .twbx archive');
        }

        const calculations: ExtractedCalculation[] = [];
        const datasources: ExtractedDatasource[] = [];
        const fields: ExtractedField[] = [];
        const errors: string[] = [];

        for (const entry of twbEntries) {
            try {
                const buffer = await entry.buffer();
                const xml = buffer.toString('utf8');
                const workbookName = basename(entry.path);

                calculations.push(...extractCalcsFromXml(xml, workbookName, preprocessor));
                datasources.push(...extractDatasourcesFromXml(xml, workbookName, preprocessor));
                fields.push(...extractFieldsFromXml(xml, workbookName, preprocessor));
            } catch (entryError) {
                const message = entryError instanceof Error ? entryError.message : String(entryError);
                errors.push(`${entry.path}: ${message}`);
            }
        }

        if (errors.length > 0) {
            console.warn(`Extraction completed with errors for ${uri.fsPath}:`, errors);
        }

        const uniqueWorkbooks = new Set([
            ...calculations.map(c => c.workbook),
            ...datasources.map(d => d.workbook),
            ...fields.map(f => f.workbook)
        ]);

        const uniqueDatasources = new Set([
            ...calculations.map(c => c.datasource),
            ...fields.map(f => f.datasource)
        ]);

        return {
            calculations,
            datasources,
            fields,
            summary: {
                workbooks: uniqueWorkbooks.size,
                datasources: uniqueDatasources.size,
                calculations: calculations.length,
                fields: fields.length
            }
        };
    } catch (error) {
        console.error(`Failed to extract from archive ${uri.fsPath}:`, error);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Extraction failed: ${message}`);
    }
}
