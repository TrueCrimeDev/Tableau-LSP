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
import {
    ExtractedCalculation,
    ExtractedDatasource,
    ExtractedField,
    ExtractedParameter,
    ExtractedFilter,
    ExtractedDashboard,
    ExtractedWorksheet,
    ExtractedHierarchy,
    ExtractionResult
} from './types.js';
import { normalizeFormula, uppercaseKeywords } from './normalize.js';

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
        `// Total fields: ${result.summary.fields || 0}\n` +
        `// Total parameters: ${result.summary.parameters || 0}\n` +
        `// Total filters: ${result.summary.filters || 0}\n` +
        `// Total dashboards: ${result.summary.dashboards || 0}\n` +
        `// Total worksheets: ${result.summary.worksheets || 0}\n` +
        `// Total hierarchies: ${result.summary.hierarchies || 0}\n\n`;

    // 2. Build datasources section (commented out)
    const datasourceSection: string[] = ['// === DATASOURCES ===\n'];
    if (result.datasources && result.datasources.length > 0) {
        for (const ds of result.datasources) {
            const nameUnderscored = ds.name.replace(/ /g, '_');
            datasourceSection.push(`// ${nameUnderscored} | ${ds.workbook}\n`);

            // Add connection information if available
            if (ds.connection) {
                const connDetails: string[] = [];
                connDetails.push(`class: ${ds.connection.class}`);
                if (ds.connection.server) connDetails.push(`server: ${ds.connection.server}`);
                if (ds.connection.dbname) connDetails.push(`database: ${ds.connection.dbname}`);
                if (ds.connection.filename) connDetails.push(`file: ${ds.connection.filename}`);
                if (ds.connection.username) connDetails.push(`user: ${ds.connection.username}`);

                if (connDetails.length > 0) {
                    datasourceSection.push(`//   Connection: ${connDetails.join(', ')}\n`);
                }
            }
        }
    } else {
        datasourceSection.push('// (No datasources found)\n');
    }
    datasourceSection.push('\n');

    // 3. Build parameters section
    const parametersSection: string[] = ['// === PARAMETERS ===\n'];
    if (result.parameters && result.parameters.length > 0) {
        for (const param of result.parameters) {
            const nameUnderscored = param.name.replace(/ /g, '_');
            parametersSection.push(`// Parameter: ${nameUnderscored} | ${param.datasource} | ${param.workbook}\n`);

            // Add parameter details
            const details: string[] = [];
            if (param.datatype) details.push(`type: ${param.datatype}`);
            if (param.value) details.push(`value: ${param.value}`);
            if (param.domainType) details.push(`domain: ${param.domainType}`);
            if (param.minValue && param.maxValue) {
                details.push(`range: ${param.minValue}-${param.maxValue}`);
            }
            if (param.allowableValues && param.allowableValues.length > 0) {
                details.push(`values: [${param.allowableValues.join(', ')}]`);
            }

            if (details.length > 0) {
                parametersSection.push(`//   Details: ${details.join(', ')}\n`);
            }

            // Add formula if present
            if (param.formula) {
                parametersSection.push(`//   Formula: ${param.formula}\n`);
            }
        }
    } else {
        parametersSection.push('// (No parameters found)\n');
    }
    parametersSection.push('\n');

    // 4. Build filters section
    const filtersSection: string[] = ['// === FILTERS ===\n'];
    if (result.filters && result.filters.length > 0) {
        for (const filter of result.filters) {
            filtersSection.push(`// Filter: ${filter.worksheet} | ${filter.column} | ${filter.class}\n`);

            const details: string[] = [];
            if (filter.function) details.push(`function: ${filter.function}`);
            if (filter.minValue && filter.maxValue) {
                details.push(`range: ${filter.minValue}-${filter.maxValue}`);
            }
            if (filter.members && filter.members.length > 0) {
                details.push(`members: ${filter.members.length} items`);
            }

            if (details.length > 0) {
                filtersSection.push(`//   Details: ${details.join(', ')}\n`);
            }
        }
    } else {
        filtersSection.push('// (No filters found)\n');
    }
    filtersSection.push('\n');

    // 5. Build dashboards section
    const dashboardsSection: string[] = ['// === DASHBOARDS ===\n'];
    if (result.dashboards && result.dashboards.length > 0) {
        for (const dashboard of result.dashboards) {
            dashboardsSection.push(`// Dashboard: ${dashboard.name} | ${dashboard.workbook}\n`);

            const details: string[] = [];
            if (dashboard.width && dashboard.height) {
                details.push(`Size: ${dashboard.width}x${dashboard.height}`);
            }
            if (dashboard.zones && dashboard.zones.length > 0) {
                details.push(`Zones: ${dashboard.zones.length}`);
            }

            if (details.length > 0) {
                dashboardsSection.push(`//   Details: ${details.join(', ')}\n`);
            }

            // List zones
            if (dashboard.zones && dashboard.zones.length > 0) {
                for (const zone of dashboard.zones) {
                    if (zone.worksheet) {
                        dashboardsSection.push(`//   Zone: ${zone.type} - ${zone.worksheet} (${zone.w}x${zone.h})\n`);
                    } else if (zone.name) {
                        dashboardsSection.push(`//   Zone: ${zone.type} - ${zone.name} (${zone.w}x${zone.h})\n`);
                    }
                }
            }
        }
    } else {
        dashboardsSection.push('// (No dashboards found)\n');
    }
    dashboardsSection.push('\n');

    // 6. Build worksheets section
    const worksheetsSection: string[] = ['// === WORKSHEETS ===\n'];
    if (result.worksheets && result.worksheets.length > 0) {
        for (const worksheet of result.worksheets) {
            worksheetsSection.push(`// Worksheet: ${worksheet.name} | ${worksheet.workbook}\n`);

            const details: string[] = [];
            if (worksheet.datasources.length > 0) {
                details.push(`datasources: ${worksheet.datasources.join(', ')}`);
            }
            if (worksheet.filters) {
                details.push(`filters: ${worksheet.filters}`);
            }
            if (worksheet.calculated_fields) {
                details.push(`calculated fields: ${worksheet.calculated_fields}`);
            }

            if (details.length > 0) {
                worksheetsSection.push(`//   Details: ${details.join(', ')}\n`);
            }
        }
    } else {
        worksheetsSection.push('// (No worksheets found)\n');
    }
    worksheetsSection.push('\n');

    // 7. Build hierarchies section
    const hierarchiesSection: string[] = ['// === HIERARCHIES ===\n'];
    if (result.hierarchies && result.hierarchies.length > 0) {
        for (const hierarchy of result.hierarchies) {
            hierarchiesSection.push(`// Hierarchy: ${hierarchy.name} | ${hierarchy.datasource} | ${hierarchy.workbook}\n`);

            // List fields in hierarchy
            if (hierarchy.fields.length > 0) {
                hierarchiesSection.push(`//   Fields: ${hierarchy.fields.join(' → ')}\n`);
            }
        }
    } else {
        hierarchiesSection.push('// (No hierarchies found)\n');
    }
    hierarchiesSection.push('\n');

    // 8. Build fields section (using JSDoc format for declaration file compatibility)
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

    // 9. Build calculations section
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
        parametersSection.join('') +
        filtersSection.join('') +
        dashboardsSection.join('') +
        worksheetsSection.join('') +
        hierarchiesSection.join('') +
        fieldsSection.join('') +
        calculationsSection.join('');

    // 10. Write file
    try {
        const uri = Uri.file(options.outputPath);
        const buffer = Buffer.from(content, 'utf8');
        await workspace.fs.writeFile(uri, buffer);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to write output file: ${message}`);
    }

    // 11. Auto-open if requested
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
