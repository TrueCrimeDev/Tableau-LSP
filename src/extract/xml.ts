import { XMLParser } from 'fast-xml-parser';
import { ExtractedCalculation, ExtractedDatasource, ExtractedField } from './types.js';

const parserOptions = {
    ignoreAttributes: false,
    attributeNamePrefix: '',
    allowBooleanAttributes: true,
    trimValues: false
};

interface XmlNode {
    [key: string]: unknown;
}

/**
 * Optional XML preprocessor for cleaning and transforming XML before parsing
 */
export interface XmlPreprocessor {
    clean?: (xml: string) => string;
    resolveNames?: (xml: string) => string;
}

/**
 * Extracts calculations from Tableau workbook XML
 *
 * @param xml - The XML content to parse
 * @param workbookName - The name of the workbook file
 * @param preprocessor - Optional preprocessor for cleaning/transforming XML
 * @returns Array of extracted calculations
 */
export function extractCalcsFromXml(
    xml: string,
    workbookName: string,
    preprocessor?: XmlPreprocessor
): ExtractedCalculation[] {
    let processedXml = xml.trim();
    if (!processedXml) {
        return [];
    }

    // Apply preprocessing pipeline if provided
    if (preprocessor) {
        if (preprocessor.clean) {
            processedXml = preprocessor.clean(processedXml);
        }
        if (preprocessor.resolveNames) {
            processedXml = preprocessor.resolveNames(processedXml);
        }
    }

    let parsed: unknown;
    try {
        const parser = new XMLParser(parserOptions);
        parsed = parser.parse(processedXml);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to parse Tableau workbook XML: ${message}`);
    }

    const root = toNode(parsed);
    if (!root) {
        return [];
    }

    const workbookNode = toNode(root.workbook) ?? toNode(root.Workbook) ?? root;
    const workbookLabel = coalesceString(
        getString(workbookNode, 'title'),
        getString(workbookNode, 'name'),
        getString(workbookNode, 'caption'),
        workbookName
    );

    const calculations: ExtractedCalculation[] = [];

    // Extract calculations from datasources
    const datasourceContainer = toNode(workbookNode.datasources) ?? toNode(workbookNode.Datasources);
    const datasources = getChildNodes(datasourceContainer, 'datasource');

    for (const datasource of datasources) {
        const datasourceLabel = coalesceString(
            getString(datasource, 'caption'),
            stripBrackets(getString(datasource, 'name')),
            'Unknown Datasource'
        );

        for (const column of getChildNodes(datasource, 'column')) {
            const columnTitle = deriveColumnTitle(column);
            for (const calculation of getChildNodes(column, 'calculation')) {
                const rawFormula = extractFormula(calculation);
                if (!rawFormula) {
                    continue;
                }

                const normalized = rawFormula.trim();
                if (!normalized) {
                    continue;
                }

                calculations.push({
                    workbook: workbookLabel,
                    datasource: datasourceLabel,
                    title: columnTitle,
                    formula: normalized,
                    raw: rawFormula
                });
            }
        }
    }

    // Extract worksheet-level calculations (columns outside datasources)
    // This handles calculated fields defined at the worksheet level
    const allColumns = findAllColumns(workbookNode);

    for (const column of allColumns) {
        // Skip columns that are already within a datasource (already processed above)
        if (isColumnInDatasource(column, datasources)) {
            continue;
        }

        const columnTitle = deriveColumnTitle(column);
        const datasourceRef = getString(column, 'datasource');
        const datasourceName = resolveDatasourceName(datasourceRef, datasources);

        for (const calculation of getChildNodes(column, 'calculation')) {
            // Only process Tableau calculations (class='tableau')
            const calcClass = getString(calculation, 'class');
            if (calcClass !== 'tableau') {
                continue;
            }

            const rawFormula = extractFormula(calculation);
            if (!rawFormula) {
                continue;
            }

            const normalized = rawFormula.trim();
            if (!normalized) {
                continue;
            }

            calculations.push({
                workbook: workbookLabel,
                datasource: datasourceName,
                title: columnTitle,
                formula: normalized,
                raw: rawFormula
            });
        }
    }

    return calculations;
}

function toNode(value: unknown): XmlNode | undefined {
    if (Array.isArray(value)) {
        return undefined;
    }
    if (typeof value === 'object' && value !== null) {
        return value as XmlNode;
    }
    return undefined;
}

function getChildNodes(node: XmlNode | undefined, key: string): XmlNode[] {
    if (!node) {
        return [];
    }
    return toNodeArray(node[key]);
}

function toNodeArray(value: unknown): XmlNode[] {
    if (!value) {
        return [];
    }
    if (Array.isArray(value)) {
        return value.map(toNode).filter((item): item is XmlNode => Boolean(item));
    }
    const single = toNode(value);
    return single ? [single] : [];
}

function getString(node: XmlNode | undefined, key: string): string | undefined {
    if (!node) {
        return undefined;
    }
    return toStringValue(node[key]);
}

function extractFormula(node: XmlNode): string | undefined {
    const fromAttribute = toStringValue(node['formula']);
    if (fromAttribute) {
        return fromAttribute;
    }

    const nestedNode = toNode(node['formula']);
    if (nestedNode) {
        const nested = toStringValue(nestedNode['formula'])
            ?? toStringValue(nestedNode['#text'])
            ?? toStringValue(nestedNode['text']);
        if (nested) {
            return nested;
        }
    }

    return toStringValue(node['#text']) ?? toStringValue(node['text']);
}

function deriveColumnTitle(column: XmlNode): string {
    const caption = coalesceString(getString(column, 'caption'), getString(column, 'alias'));
    if (caption) {
        return caption;
    }

    const name = getString(column, 'name');
    if (name) {
        const cleaned = stripBrackets(name);
        return cleaned || name;
    }

    return 'Unnamed Calculation';
}

function stripBrackets(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }
    const trimmed = value.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        return trimmed.substring(1, trimmed.length - 1);
    }
    return trimmed;
}

function coalesceString(...values: Array<string | undefined>): string {
    for (const value of values) {
        if (value && value.trim()) {
            return value.trim();
        }
    }
    return '';
}

function toStringValue(value: unknown): string | undefined {
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (Array.isArray(value)) {
        for (const entry of value) {
            const stringValue = toStringValue(entry);
            if (stringValue) {
                return stringValue;
            }
        }
        return undefined;
    }
    if (typeof value === 'object' && value !== null) {
        const record = value as XmlNode;
        return toStringValue(record['#text'])
            ?? toStringValue(record['$text'])
            ?? toStringValue(record['text'])
            ?? undefined;
    }
    return undefined;
}

/**
 * Recursively finds all column nodes in the workbook XML tree
 */
function findAllColumns(node: XmlNode): XmlNode[] {
    const columns: XmlNode[] = [];

    // Get direct child columns
    columns.push(...getChildNodes(node, 'column'));

    // Recursively search all child nodes
    for (const key of Object.keys(node)) {
        const value = node[key];
        if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
                for (const item of value) {
                    const itemNode = toNode(item);
                    if (itemNode) {
                        columns.push(...findAllColumns(itemNode));
                    }
                }
            } else {
                const childNode = toNode(value);
                if (childNode) {
                    columns.push(...findAllColumns(childNode));
                }
            }
        }
    }

    return columns;
}

/**
 * Checks if a column is already within a datasource (to avoid duplicates)
 * We do a simple check: see if the column object reference appears in any datasource's columns
 */
function isColumnInDatasource(column: XmlNode, datasources: XmlNode[]): boolean {
    for (const datasource of datasources) {
        const datasourceColumns = getChildNodes(datasource, 'column');
        // Simple reference equality check
        if (datasourceColumns.includes(column)) {
            return true;
        }
    }
    return false;
}

/**
 * Resolves a datasource reference to its human-readable name
 * Tries to find the datasource by name or caption attribute
 */
function resolveDatasourceName(ref: string | undefined, datasources: XmlNode[]): string {
    if (!ref) {
        return 'Unknown';
    }

    // Try to find matching datasource by name or caption
    for (const datasource of datasources) {
        const name = getString(datasource, 'name');
        const caption = getString(datasource, 'caption');

        // Check if ref matches either the name or caption
        if (name === ref || caption === ref) {
            // Prefer caption over name
            return caption || name || 'Unknown';
        }
    }

    // If no match found, return the reference itself
    return ref;
}

/**
 * Extracts all datasources from Tableau workbook XML
 *
 * @param xml - The XML content to parse
 * @param workbookName - The name of the workbook file
 * @param preprocessor - Optional preprocessor for cleaning/transforming XML
 * @returns Array of extracted datasources
 */
export function extractDatasourcesFromXml(
    xml: string,
    workbookName: string,
    preprocessor?: XmlPreprocessor
): ExtractedDatasource[] {
    let processedXml = xml.trim();
    if (!processedXml) {
        return [];
    }

    // Apply preprocessing pipeline if provided
    if (preprocessor) {
        if (preprocessor.clean) {
            processedXml = preprocessor.clean(processedXml);
        }
        if (preprocessor.resolveNames) {
            processedXml = preprocessor.resolveNames(processedXml);
        }
    }

    let parsed: unknown;
    try {
        const parser = new XMLParser(parserOptions);
        parsed = parser.parse(processedXml);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to parse Tableau workbook XML: ${message}`);
    }

    const root = toNode(parsed);
    if (!root) {
        return [];
    }

    const workbookNode = toNode(root.workbook) ?? toNode(root.Workbook) ?? root;
    const workbookLabel = coalesceString(
        getString(workbookNode, 'title'),
        getString(workbookNode, 'name'),
        getString(workbookNode, 'caption'),
        workbookName
    );

    const datasources: ExtractedDatasource[] = [];

    // Extract datasources
    const datasourceContainer = toNode(workbookNode.datasources) ?? toNode(workbookNode.Datasources);
    const datasourceNodes = getChildNodes(datasourceContainer, 'datasource');

    for (const datasource of datasourceNodes) {
        const name = getString(datasource, 'name');
        const caption = getString(datasource, 'caption');

        if (name || caption) {
            datasources.push({
                workbook: workbookLabel,
                name: stripBrackets(name) || caption || 'Unknown',
                caption: caption
            });
        }
    }

    return datasources;
}

/**
 * Extracts all fields (columns) from Tableau workbook XML
 *
 * @param xml - The XML content to parse
 * @param workbookName - The name of the workbook file
 * @param preprocessor - Optional preprocessor for cleaning/transforming XML
 * @returns Array of extracted fields
 */
export function extractFieldsFromXml(
    xml: string,
    workbookName: string,
    preprocessor?: XmlPreprocessor
): ExtractedField[] {
    let processedXml = xml.trim();
    if (!processedXml) {
        return [];
    }

    // Apply preprocessing pipeline if provided
    if (preprocessor) {
        if (preprocessor.clean) {
            processedXml = preprocessor.clean(processedXml);
        }
        if (preprocessor.resolveNames) {
            processedXml = preprocessor.resolveNames(processedXml);
        }
    }

    let parsed: unknown;
    try {
        const parser = new XMLParser(parserOptions);
        parsed = parser.parse(processedXml);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to parse Tableau workbook XML: ${message}`);
    }

    const root = toNode(parsed);
    if (!root) {
        return [];
    }

    const workbookNode = toNode(root.workbook) ?? toNode(root.Workbook) ?? root;
    const workbookLabel = coalesceString(
        getString(workbookNode, 'title'),
        getString(workbookNode, 'name'),
        getString(workbookNode, 'caption'),
        workbookName
    );

    const fields: ExtractedField[] = [];

    // Extract fields from datasources
    const datasourceContainer = toNode(workbookNode.datasources) ?? toNode(workbookNode.Datasources);
    const datasources = getChildNodes(datasourceContainer, 'datasource');

    for (const datasource of datasources) {
        const datasourceLabel = coalesceString(
            getString(datasource, 'caption'),
            stripBrackets(getString(datasource, 'name')),
            'Unknown Datasource'
        );

        for (const column of getChildNodes(datasource, 'column')) {
            const name = getString(column, 'name');
            const caption = getString(column, 'caption');
            const datatype = getString(column, 'datatype');
            const role = getString(column, 'role');

            if (name || caption) {
                fields.push({
                    workbook: workbookLabel,
                    datasource: datasourceLabel,
                    name: stripBrackets(name) || caption || 'Unknown',
                    caption: caption,
                    datatype: datatype,
                    role: role
                });
            }
        }
    }

    return fields;
}
