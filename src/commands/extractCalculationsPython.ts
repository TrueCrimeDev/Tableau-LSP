/**
 * Extract Calculations (Python Style) Command
 *
 * Extracts calculations from Tableau workbooks using Python-matching logic:
 * - XML cleaning (remove invalid chars, fix unescaped ampersands)
 * - Name resolution (replace internal names with captions)
 * - Worksheet-level calculation extraction
 * - 66-keyword uppercasing
 * - Python-style normalization
 * - Filtering and deduplication
 * - Output as `.notes` file with statistics
 */

import { window, workspace, ProgressLocation, Uri } from 'vscode';
import * as path from 'path';
import { extractAllFromFile } from '../extract/zip.js';
import { cleanXmlContent } from '../extract/xmlCleaner.js';
import { resolveNames } from '../extract/nameResolver.js';
import { normalize, filterAndDedupe } from '../extract/normalize.js';
import { generateFullNotesFile } from '../extract/outputGenerator.js';

/**
 * Main command handler for Python-style extraction
 *
 * Workflow:
 * 1. Validate active editor has .twb or .twbx file
 * 2. Extract with preprocessing pipeline (clean XML, resolve names)
 * 3. Normalize formulas (whitespace, keywords)
 * 4. Filter trivial calculations and deduplicate
 * 5. Generate _Calculations.notes in workspace root
 * 6. Auto-open the output file
 * 7. Show success message with statistics
 */
export async function extractCalculationsPythonCommand(): Promise<void> {
    try {
        // 1. Get active editor and validate file type
        const activeEditor = window.activeTextEditor;
        if (!activeEditor) {
            window.showErrorMessage('No active file. Please open a .twb or .twbx file.');
            return;
        }

        const uri = activeEditor.document.uri;
        const fileName = uri.fsPath.toLowerCase();

        if (!fileName.endsWith('.twb') && !fileName.endsWith('.twbx')) {
            window.showErrorMessage('Active file must be a .twb or .twbx file.');
            return;
        }

        // 2. Show progress indicator
        await window.withProgress({
            location: ProgressLocation.Notification,
            title: 'Extracting data from workbook',
            cancellable: false
        }, async (progress) => {
            // 3. Extract with full Python-matching pipeline
            progress.report({ message: 'Reading workbook...' });

            const result = await extractAllFromFile(uri, {
                clean: cleanXmlContent,
                resolveNames: resolveNames
            });

            progress.report({ message: `Processing ${result.calculations.length} calculation(s)...` });

            // 4. Normalize and filter calculations
            const normalized = normalize(result.calculations);
            const filtered = filterAndDedupe(normalized);

            // Update result with filtered calculations
            result.calculations = filtered;
            result.summary.calculations = filtered.length;

            progress.report({ message: 'Generating output file...' });

            // 5. Generate output file in workspace root
            const workspaceFolder = workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                window.showErrorMessage('No workspace folder found. Please open a folder in VS Code.');
                return;
            }

            const outputPath = path.join(workspaceFolder.uri.fsPath, 'Extracted_Calculations.twbl');

            await generateFullNotesFile(result, {
                outputPath,
                autoOpen: true
            });

            // 6. Show success message
            window.showInformationMessage(
                `Extracted ${result.summary.calculations} calculation(s), ` +
                `${result.summary.datasources} datasource(s), ` +
                `${result.summary.fields} field(s) from ${result.summary.workbooks} workbook(s) to Extracted_Calculations.twbl`
            );
        });

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        window.showErrorMessage(`Extraction failed: ${message}`);
        console.error('Extraction error:', error);
    }
}
