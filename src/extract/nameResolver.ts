/**
 * Name Resolution Module
 *
 * Replaces internal Tableau names (datasource names, calculation IDs) with
 * human-readable captions in formulas. This makes extracted calculations
 * more understandable by using the names visible in Tableau's UI.
 */

import { XMLParser } from 'fast-xml-parser';

/**
 * Name mappings extracted from the workbook XML
 */
export interface NameMappings {
    datasources: Map<string, string>;      // internal name -> caption
    calculations: Map<string, string>;     // [internal name] -> [caption]
    references: Map<string, string>;       // Calculation_ID patterns -> caption
}

/**
 * Escapes special HTML/XML characters in a string
 */
function escapeHtml(text: string): string {
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;'
    };
    return text.replace(/[&<>"']/g, char => map[char] || char);
}

/**
 * Escapes special regex characters in a string for use in RegExp
 */
function escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts a string value from an XML node
 */
function getStringValue(obj: any, key: string): string | undefined {
    if (!obj || typeof obj !== 'object') {
        return undefined;
    }
    const value = obj[key];
    if (typeof value === 'string') {
        return value;
    }
    return undefined;
}

/**
 * Gets all child nodes of a specific type, handling both single nodes and arrays
 */
function getNodes(parent: any, key: string): any[] {
    if (!parent || typeof parent !== 'object') {
        return [];
    }
    const value = parent[key];
    if (!value) {
        return [];
    }
    if (Array.isArray(value)) {
        return value;
    }
    return [value];
}

/**
 * Builds name mappings from XML content by parsing datasource and column elements
 *
 * @param xmlString - The XML content to parse
 * @returns Name mappings for datasources, calculations, and references
 */
export function buildNameMappings(xmlString: string): NameMappings {
    const mappings: NameMappings = {
        datasources: new Map(),
        calculations: new Map(),
        references: new Map()
    };

    try {
        // Parse XML
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '',
            allowBooleanAttributes: true,
            trimValues: false
        });
        const parsed = parser.parse(xmlString) as any;

        // Get root workbook node
        const root = parsed.workbook || parsed.Workbook || parsed;

        // Build datasource name mapping
        const datasources = getNodes(root.datasources || root.Datasources, 'datasource');
        for (const datasource of datasources) {
            const caption = getStringValue(datasource, 'caption');
            const name = getStringValue(datasource, 'name');
            if (caption && name) {
                const escapedCaption = escapeHtml(caption);
                mappings.datasources.set(name, escapedCaption);
            }
        }

        // Build calculation name mappings
        // Need to search all columns in the workbook
        const allColumns = findAllColumns(root);
        for (const column of allColumns) {
            const caption = getStringValue(column, 'caption');
            const name = getStringValue(column, 'name');

            if (caption && name) {
                const escapedCaption = escapeHtml(caption);

                // Map [internal name] -> [caption]
                if (name.startsWith('[')) {
                    mappings.calculations.set(name, `[${escapedCaption}]`);
                }

                // Extract calculation ID patterns (e.g., Calculation_123)
                // Format: name ends with _<number-with-optional-hyphens>
                if (name.includes('_')) {
                    const parts = name.split('_');
                    const idPart = parts[parts.length - 1];
                    // Check if ID part is numeric (allowing hyphens like -1234)
                    if (idPart && /^-?\d+$/.test(idPart.replace(/-/g, ''))) {
                        const calcId = parts[parts.length - 1];
                        // Create multiple mapping patterns
                        mappings.references.set(`Calculation_${calcId}`, escapedCaption);
                        mappings.references.set(`[Calculation_${calcId}]`, `[${escapedCaption}]`);
                        mappings.references.set(`[none:Calculation_${calcId}:nk]`, `[none:${escapedCaption}:nk]`);
                    }
                }
            }
        }

    } catch (error) {
        console.error('Error building name mappings:', error);
        // Return empty mappings on error
    }

    return mappings;
}

/**
 * Recursively finds all column nodes in the XML tree
 */
function findAllColumns(node: any): any[] {
    const columns: any[] = [];

    if (!node || typeof node !== 'object') {
        return columns;
    }

    // Check if this node has columns
    const nodeColumns = getNodes(node, 'column');
    columns.push(...nodeColumns);

    // Recursively search child nodes
    for (const key of Object.keys(node)) {
        const value = node[key];
        if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
                for (const item of value) {
                    columns.push(...findAllColumns(item));
                }
            } else {
                columns.push(...findAllColumns(value));
            }
        }
    }

    return columns;
}

/**
 * Applies name resolution to XML string by replacing internal names with captions
 *
 * @param xmlString - The XML content to process
 * @param mappings - The name mappings to apply
 * @returns XML string with names resolved
 */
export function applyNameResolution(xmlString: string, mappings: NameMappings): string {
    let resolved = xmlString;

    // 1. Replace datasource references
    for (const [oldName, newName] of mappings.datasources.entries()) {
        // Replace in datasource attributes
        resolved = resolved.replace(
            new RegExp(`datasource='${escapeRegex(oldName)}'`, 'g'),
            `datasource='${newName}'`
        );
        // Replace in field references like [datasource].field
        resolved = resolved.replace(
            new RegExp(`\\[${escapeRegex(oldName)}\\]\\.`, 'g'),
            `[${newName}].`
        );
        // Replace in quoted references
        resolved = resolved.replace(
            new RegExp(`'${escapeRegex(oldName)}'`, 'g'),
            `'${newName}'`
        );
    }

    // 2. Replace calculation name references
    for (const [oldName, newName] of mappings.calculations.entries()) {
        resolved = resolved.replace(
            new RegExp(escapeRegex(oldName), 'g'),
            newName
        );
    }

    // 3. Replace calculation ID patterns.
    // `Calculation_1` is a literal substring of `Calculation_18`/`Calculation_123`, so an
    // unanchored replace can corrupt a longer ID's occurrences if the shorter one runs first
    // (e.g. [Calculation_18] -> [<caption for _1>]8]). A trailing `\b` closes that gap for the
    // bare `Calculation_N` form (which ends in a word character, so `\b` disambiguates from a
    // longer run of digits) — but must NOT be added when oldName already ends in a non-word
    // delimiter like `]` (the bracketed/`:nk` forms), since `\b` can never match immediately
    // after a non-word character and would make the whole pattern fail to match anything.
    // Sorting longest-first is defense in depth on top of that.
    const referenceEntries = Array.from(mappings.references.entries())
        .sort((a, b) => b[0].length - a[0].length);
    for (const [oldName, newName] of referenceEntries) {
        const needsBoundary = /\w$/.test(oldName);
        resolved = resolved.replace(
            new RegExp(escapeRegex(oldName) + (needsBoundary ? '\\b' : ''), 'g'),
            newName
        );
    }

    // 4. Remove sqlproxy patterns: [sqlproxy.xxx].
    resolved = resolved.replace(/\[sqlproxy\.[^\]]+\]\./g, '');

    return resolved;
}

/**
 * Complete name resolution pipeline: builds mappings and applies them
 *
 * @param xml - The XML content to process
 * @returns XML string with all internal names resolved to captions
 */
export function resolveNames(xml: string): string {
    const mappings = buildNameMappings(xml);
    return applyNameResolution(xml, mappings);
}

/**
 * Statistics about name resolution operations (useful for debugging/logging)
 */
export interface ResolutionStats {
    datasourceMappings: number;
    calculationMappings: number;
    referenceMappings: number;
}

/**
 * Resolves names and returns both the resolved XML and statistics
 *
 * @param xml - The XML content to process
 * @returns Object containing resolved XML and statistics
 */
export function resolveNamesWithStats(xml: string): { resolved: string; stats: ResolutionStats } {
    const mappings = buildNameMappings(xml);

    const stats: ResolutionStats = {
        datasourceMappings: mappings.datasources.size,
        calculationMappings: mappings.calculations.size,
        referenceMappings: mappings.references.size
    };

    const resolved = applyNameResolution(xml, mappings);

    return { resolved, stats };
}
