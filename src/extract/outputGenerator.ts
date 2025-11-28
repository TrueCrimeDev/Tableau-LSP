/**
 * Output Generator Module
 *
 * Generates `.twbl` files with extracted calculations, datasources, and fields in Python-matching format.
 * The output format includes:
 * - Summary statistics header
 * - Datasources section
 * - Fields section
 * - Calculations section with metadata comments
 * - Normalized and keyword-uppercased formulas
 */

import { workspace, window, Uri } from 'vscode';
import { ExtractedCalculation, ExtractedDatasource, ExtractedField, ExtractionResult } from './types';
import { normalizeFormula, uppercaseKeywords } from './normalize';

/**
 * Options for output file generation
 */
export interface OutputOptions {
    outputPath: string;
    autoOpen?: boolean;
}

/**
 * Generates a `.twbl` file with extracted calculations
 *
 * Output format (matching Python script):
 * ```
 * Total workbooks with calculations: X
 * Total calculations: Y
 *
 * // Caption | Datasource_Name | workbook.twb
 * {FORMULA}
 *
 * // Caption | Datasource_Name | workbook.twb
 * {FORMULA}
 * ```
 *
 * @param calculations - Array of extracted calculations (should already be filtered and deduplicated)
 * @param options - Output options including file path and auto-open flag
 */
export async function generateNotesFile(
    calculations: ExtractedCalculation[],
    options: OutputOptions
): Promise<void> {
    // 1. Compute statistics
    const uniqueWorkbooks = new Set(calculations.map(c => c.workbook));
    const totalWorkbooks = uniqueWorkbooks.size;
    const totalCalculations = calculations.length;

    // 2. Build summary header
    const summary =
        `Total workbooks with calculations: ${totalWorkbooks}\n` +
        `Total calculations: ${totalCalculations}\n\n`;

    // 3. Build calculation blocks
    const blocks: string[] = [];
    for (const calc of calculations) {
        // Normalize and transform the formula
        const normalizedFormula = normalizeFormula(calc.formula);
        const transformedFormula = uppercaseKeywords(normalizedFormula);

        // Replace spaces with underscores in datasource name
        const datasourceUnderscored = calc.datasource.replace(/ /g, '_');

        // Format: caption | datasource_with_underscores | workbook.twb
        const header = `// ${calc.title} | ${datasourceUnderscored} | ${calc.workbook}`;

        // Each block: comment line, formula, blank line
        blocks.push(`${header}\n${transformedFormula}\n`);
    }

    // Join blocks with single newline (blocks already end with \n, so joining adds another \n)
    const content = summary + blocks.join('\n');

    // 4. Write file
    try {
        const uri = Uri.file(options.outputPath);
        const buffer = Buffer.from(content, 'utf8');
        await workspace.fs.writeFile(uri, buffer);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to write output file: ${message}`);
    }

    // 5. Auto-open if requested
    if (options.autoOpen) {
        try {
            const uri = Uri.file(options.outputPath);
            const doc = await workspace.openTextDocument(uri);
            await window.showTextDocument(doc);
        } catch (error) {
            // Log but don't throw - file was written successfully
            console.error('Failed to auto-open output file:', error);
        }
    }
}

/**
 * Generates the output content without writing to file (useful for testing)
 *
 * @param calculations - Array of extracted calculations
 * @returns The formatted output content as a string
 */
export function generateContent(calculations: ExtractedCalculation[]): string {
    const uniqueWorkbooks = new Set(calculations.map(c => c.workbook));
    const totalWorkbooks = uniqueWorkbooks.size;
    const totalCalculations = calculations.length;

    const summary =
        `Total workbooks with calculations: ${totalWorkbooks}\n` +
        `Total calculations: ${totalCalculations}\n\n`;

    const blocks: string[] = [];
    for (const calc of calculations) {
        const normalizedFormula = normalizeFormula(calc.formula);
        const transformedFormula = uppercaseKeywords(normalizedFormula);
        const datasourceUnderscored = calc.datasource.replace(/ /g, '_');
        const header = `// ${calc.title} | ${datasourceUnderscored} | ${calc.workbook}`;
        blocks.push(`${header}\n${transformedFormula}\n`);
    }

    return summary + blocks.join('\n');
}

/**
 * Generates a `.twbl` file with extracted calculations, datasources, and fields
 *
 * Output format:
 * ```
 * Total workbooks: X
 * Total datasources: Y
 * Total calculations: Z
 * Total fields: W
 *
 * === DATASOURCES ===
 * Datasource_Name | workbook.twb
 *
 * === FIELDS ===
 * Field_Name | Datasource_Name | datatype | role | workbook.twb
 *
 * === CALCULATIONS ===
 * // Caption | Datasource_Name | workbook.twb
 * {FORMULA}
 * ```
 *
 * @param result - Complete extraction result with all data
 * @param options - Output options including file path and auto-open flag
 */
export async function generateFullNotesFile(
    result: ExtractionResult,
    options: OutputOptions
): Promise<void> {
    // 1. Build summary header (commented out)
    const summary =
        `// Total workbooks: ${result.summary.workbooks}\n` +
        `// Total datasources: ${result.summary.datasources}\n` +
        `// Total calculations: ${result.summary.calculations}\n` +
        `// Total fields: ${result.summary.fields || 0}\n\n`;

    // 2. Build datasources section (commented out)
    const datasourceSection: string[] = ['// === DATASOURCES ===\n'];
    if (result.datasources && result.datasources.length > 0) {
        for (const ds of result.datasources) {
            const nameUnderscored = ds.name.replace(/ /g, '_');
            datasourceSection.push(`// ${nameUnderscored} | ${ds.workbook}\n`);
        }
    } else {
        datasourceSection.push('// (No datasources found)\n');
    }
    datasourceSection.push('\n');

    // 3. Build fields section (using JSDoc format for declaration file compatibility)
    const fieldsSection: string[] = ['/*\n=== FIELDS (for declaration file) ===\n'];
    if (result.fields && result.fields.length > 0) {
        for (const field of result.fields) {
            // Map Tableau datatypes to TypeScript-like types
            const datatypeMap: Record<string, string> = {
                'integer': 'Number',
                'real': 'Number',
                'string': 'String',
                'boolean': 'Boolean',
                'date': 'Date',
                'datetime': 'DateTime'
            };
            const mappedType = datatypeMap[field.datatype?.toLowerCase() || ''] || 'String';

            // Generate JSDoc-style comment with field metadata
            const role = field.role || 'unknown';
            const datatype = field.datatype || 'unknown';

            fieldsSection.push(
                `/**\n` +
                ` * Field from datasource: ${field.datasource}\n` +
                ` * Datatype: ${datatype} | Role: ${role}\n` +
                ` */\n` +
                `[${field.name}]: ${mappedType}\n\n`
            );
        }
    } else {
        fieldsSection.push('(No fields found)\n');
    }
    fieldsSection.push('*/\n\n');

    // 4. Build calculations section
    const calculationsSection: string[] = ['// === CALCULATIONS ===\n'];
    if (result.calculations && result.calculations.length > 0) {
        for (const calc of result.calculations) {
            // Normalize and transform the formula
            const normalizedFormula = normalizeFormula(calc.formula);
            const transformedFormula = uppercaseKeywords(normalizedFormula);

            // Replace spaces with underscores in datasource name
            const datasourceUnderscored = calc.datasource.replace(/ /g, '_');

            // Format: caption | datasource_with_underscores | workbook.twb
            const header = `// ${calc.title} | ${datasourceUnderscored} | ${calc.workbook}`;

            // Each block: comment line, formula, blank line
            calculationsSection.push(`${header}\n${transformedFormula}\n\n`);
        }
    } else {
        calculationsSection.push('// (No calculations found)\n');
    }

    // Combine all sections
    const content =
        summary +
        datasourceSection.join('') +
        fieldsSection.join('') +
        calculationsSection.join('');

    // 5. Write file
    try {
        const uri = Uri.file(options.outputPath);
        const buffer = Buffer.from(content, 'utf8');
        await workspace.fs.writeFile(uri, buffer);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to write output file: ${message}`);
    }

    // 6. Auto-open if requested
    if (options.autoOpen) {
        try {
            const uri = Uri.file(options.outputPath);
            const doc = await workspace.openTextDocument(uri);
            await window.showTextDocument(doc);
        } catch (error) {
            // Log but don't throw - file was written successfully
            console.error('Failed to auto-open output file:', error);
        }
    }
}
