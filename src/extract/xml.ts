import { XMLParser } from 'fast-xml-parser';
import {
    ExtractedCalculation,
    ExtractedDatasource,
    ExtractedField,
    ExtractedParameter,
    ExtractedFilter,
    ExtractedDashboard,
    ExtractedWorksheet,
    ExtractedHierarchy,
    ExtractedConnection,
    DashboardZone
} from './types.js';

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
                    raw: rawFormula,
                    datatype: getString(column, 'datatype')
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
                raw: rawFormula,
                datatype: getString(column, 'datatype')
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
/**
 * Recursively collects <column> and <metadata-record> nodes anywhere under a
 * datasource. Ordinary fields usually live inside <connection><relation>
 * (often FCP-mangled tag names), not as direct datasource children.
 */
function collectColumnNodes(node: XmlNode, columns: XmlNode[], metaRecords: XmlNode[]): void {
    for (const key of Object.keys(node)) {
        const value = node[key];
        if (key === 'column') {
            columns.push(...toNodeArray(value));
            continue;
        }
        if (key === 'metadata-record') {
            metaRecords.push(...toNodeArray(value));
            continue;
        }
        if (typeof value === 'object' && value !== null) {
            for (const child of toNodeArray(value)) {
                collectColumnNodes(child, columns, metaRecords);
            }
        }
    }
}

function getTextValue(node: XmlNode, key: string): string | undefined {
    const direct = toStringValue(node[key]);
    if (direct !== undefined) {
        return direct;
    }
    const nested = toNode(node[key]);
    return nested ? toStringValue(nested['#text']) : undefined;
}

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

        const columnNodes: XmlNode[] = [];
        const metaRecords: XmlNode[] = [];
        collectColumnNodes(datasource, columnNodes, metaRecords);

        const byKey = new Map<string, ExtractedField>();
        for (const column of columnNodes) {
            const name = getString(column, 'name');
            const caption = getString(column, 'caption');
            if (!name && !caption) {
                continue;
            }
            const field: ExtractedField = {
                workbook: workbookLabel,
                datasource: datasourceLabel,
                name: stripBrackets(name) || caption || 'Unknown',
                caption: caption,
                datatype: getString(column, 'datatype'),
                role: getString(column, 'role'),
                isCalculation: getChildNodes(column, 'calculation').length > 0,
                isParameter: Boolean(getString(column, 'param-domain-type'))
            };
            const key = field.name.toLowerCase();
            const existing = byKey.get(key);
            // A captioned (renamed) declaration is richer than a bare relation column.
            if (!existing || (!existing.caption && caption)) {
                byKey.set(key, field);
            }
        }

        // metadata-records fill in fields that never got a <column> element.
        for (const record of metaRecords) {
            const recordClass = (getString(record, 'class') ?? '').toLowerCase();
            if (!['column', 'measure', 'dimension'].includes(recordClass)) {
                continue;
            }
            const localName = getTextValue(record, 'local-name');
            const localType = getTextValue(record, 'local-type');
            if (!localName || !localType) {
                continue;
            }
            const bareName = stripBrackets(localName) || localName;
            const key = bareName.toLowerCase();
            if (byKey.has(key)) {
                continue;
            }
            byKey.set(key, {
                workbook: workbookLabel,
                datasource: datasourceLabel,
                name: bareName,
                // local-name is Tableau's field name. remote-name is the
                // physical database/header name and must not replace it in
                // completions, hovers or generated declarations.
                caption: getTextValue(record, 'caption'),
                datatype: localType,
                role: recordClass === 'measure'
                    ? 'measure'
                    : recordClass === 'dimension'
                        ? 'dimension'
                        : undefined,
                isCalculation: false,
                isParameter: false
            });
        }

        fields.push(...byKey.values());
    }

    return fields;
}

/**
 * Extracts all parameters from Tableau workbook XML
 *
 * @param xml - The XML content to parse
 * @param workbookName - The name of the workbook file
 * @param preprocessor - Optional preprocessor for cleaning/transforming XML
 * @returns Array of extracted parameters
 */
export function extractParametersFromXml(
    xml: string,
    workbookName: string,
    preprocessor?: XmlPreprocessor
): ExtractedParameter[] {
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

    const parameters: ExtractedParameter[] = [];

    // Extract parameters from datasources (specifically the "Parameters" datasource)
    const datasourceContainer = toNode(workbookNode.datasources) ?? toNode(workbookNode.Datasources);
    const datasources = getChildNodes(datasourceContainer, 'datasource');

    for (const datasource of datasources) {
        const datasourceName = getString(datasource, 'name');
        const datasourceLabel = coalesceString(
            getString(datasource, 'caption'),
            stripBrackets(datasourceName),
            'Unknown Datasource'
        );

        // Parameters are typically in a datasource named 'Parameters'
        const isParameterDatasource = datasourceName?.toLowerCase().includes('parameter') ||
                                      datasourceLabel.toLowerCase().includes('parameter');

        for (const column of getChildNodes(datasource, 'column')) {
            const paramDomainType = getString(column, 'param-domain-type');

            // If it has param-domain-type, it's definitely a parameter
            if (paramDomainType || isParameterDatasource) {
                const name = getString(column, 'name');
                const caption = getString(column, 'caption');
                const datatype = getString(column, 'datatype');
                const value = getString(column, 'value');

                // Extract formula if present
                const calculations = getChildNodes(column, 'calculation');
                let formula: string | undefined;
                if (calculations.length > 0) {
                    formula = extractFormula(calculations[0]);
                }

                // Extract range values if present
                const rangeNode = toNode(column.range);
                const minValue = rangeNode ? getString(rangeNode, 'min') : undefined;
                const maxValue = rangeNode ? getString(rangeNode, 'max') : undefined;

                // Extract allowable values for list parameters
                const allowableValues: string[] = [];
                const membersNode = toNode(column.members) ?? toNode(column['calculation:members']);
                if (membersNode) {
                    const members = getChildNodes(membersNode, 'member');
                    for (const member of members) {
                        const memberValue = getString(member, 'value') ?? toStringValue(member);
                        if (memberValue) {
                            allowableValues.push(memberValue);
                        }
                    }
                }

                if (name || caption) {
                    parameters.push({
                        workbook: workbookLabel,
                        datasource: datasourceLabel,
                        name: stripBrackets(name) || caption || 'Unknown',
                        caption: caption,
                        datatype: datatype,
                        value: value,
                        domainType: paramDomainType as 'list' | 'range' | 'all' | undefined,
                        minValue: minValue,
                        maxValue: maxValue,
                        allowableValues: allowableValues.length > 0 ? allowableValues : undefined,
                        formula: formula
                    });
                }
            }
        }
    }

    return parameters;
}

/**
 * Extracts all filters from Tableau workbook XML
 *
 * @param xml - The XML content to parse
 * @param workbookName - The name of the workbook file
 * @param preprocessor - Optional preprocessor for cleaning/transforming XML
 * @returns Array of extracted filters
 */
export function extractFiltersFromXml(
    xml: string,
    workbookName: string,
    preprocessor?: XmlPreprocessor
): ExtractedFilter[] {
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

    const filters: ExtractedFilter[] = [];

    // Extract filters from worksheets
    const worksheetsContainer = toNode(workbookNode.worksheets) ?? toNode(workbookNode.Worksheets);
    const worksheets = getChildNodes(worksheetsContainer, 'worksheet');

    for (const worksheet of worksheets) {
        const worksheetName = getString(worksheet, 'name') || 'Unknown Worksheet';

        // Look for filters in view nodes
        const tableNode = toNode(worksheet.table);
        if (tableNode) {
            const viewNode = toNode(tableNode.view);
            if (viewNode) {
                const filterNodes = getChildNodes(viewNode, 'filter');

                for (const filter of filterNodes) {
                    const filterClass = getString(filter, 'class') || 'unknown';
                    const column = getString(filter, 'column') || 'Unknown Column';
                    const filterFunction = getString(filter, 'function');

                    // Extract filter members for categorical filters
                    const members: string[] = [];
                    const groupfilterNodes = getChildNodes(filter, 'groupfilter');
                    for (const groupfilter of groupfilterNodes) {
                        const member = getString(groupfilter, 'member');
                        if (member) {
                            members.push(member);
                        }
                    }

                    // Extract min/max for quantitative filters
                    const minValue = getString(filter, 'min');
                    const maxValue = getString(filter, 'max');

                    filters.push({
                        workbook: workbookLabel,
                        worksheet: worksheetName,
                        class: filterClass,
                        column: column,
                        function: filterFunction,
                        members: members.length > 0 ? members : undefined,
                        minValue: minValue,
                        maxValue: maxValue
                    });
                }
            }
        }
    }

    return filters;
}

/**
 * Extracts all dashboards from Tableau workbook XML
 *
 * @param xml - The XML content to parse
 * @param workbookName - The name of the workbook file
 * @param preprocessor - Optional preprocessor for cleaning/transforming XML
 * @returns Array of extracted dashboards
 */
export function extractDashboardsFromXml(
    xml: string,
    workbookName: string,
    preprocessor?: XmlPreprocessor
): ExtractedDashboard[] {
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

    const dashboards: ExtractedDashboard[] = [];

    // Extract dashboards
    const dashboardsContainer = toNode(workbookNode.dashboards) ?? toNode(workbookNode.Dashboards);
    const dashboardNodes = getChildNodes(dashboardsContainer, 'dashboard');

    for (const dashboard of dashboardNodes) {
        const name = getString(dashboard, 'name') || 'Unknown Dashboard';

        // Extract size
        const sizeNode = toNode(dashboard.size);
        const width = sizeNode ? Number(getString(sizeNode, 'width')) : undefined;
        const height = sizeNode ? Number(getString(sizeNode, 'height')) : undefined;

        // Extract zones
        const zones: DashboardZone[] = [];
        const extractZones = (node: XmlNode): void => {
            const zoneNodes = getChildNodes(node, 'zone');
            for (const zone of zoneNodes) {
                const zoneName = getString(zone, 'name');
                const zoneType = getString(zone, 'type') || 'unknown';
                const x = Number(getString(zone, 'x')) || 0;
                const y = Number(getString(zone, 'y')) || 0;
                const w = Number(getString(zone, 'w')) || 0;
                const h = Number(getString(zone, 'h')) || 0;

                zones.push({
                    name: zoneName,
                    type: zoneType,
                    x: x,
                    y: y,
                    w: w,
                    h: h,
                    worksheet: zoneType === 'worksheet' ? zoneName : undefined
                });

                // Recursively extract nested zones
                extractZones(zone);
            }
        };

        extractZones(dashboard);

        dashboards.push({
            workbook: workbookLabel,
            name: name,
            width: width,
            height: height,
            zones: zones.length > 0 ? zones : undefined
        });
    }

    return dashboards;
}

/**
 * Extracts all worksheets from Tableau workbook XML
 *
 * @param xml - The XML content to parse
 * @param workbookName - The name of the workbook file
 * @param preprocessor - Optional preprocessor for cleaning/transforming XML
 * @returns Array of extracted worksheets
 */
export function extractWorksheetsFromXml(
    xml: string,
    workbookName: string,
    preprocessor?: XmlPreprocessor
): ExtractedWorksheet[] {
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

    const worksheets: ExtractedWorksheet[] = [];

    // Extract worksheets
    const worksheetsContainer = toNode(workbookNode.worksheets) ?? toNode(workbookNode.Worksheets);
    const worksheetNodes = getChildNodes(worksheetsContainer, 'worksheet');

    for (const worksheet of worksheetNodes) {
        const name = getString(worksheet, 'name') || 'Unknown Worksheet';

        // Extract datasource references
        const datasources: string[] = [];
        const tableNode = toNode(worksheet.table);
        if (tableNode) {
            const viewNode = toNode(tableNode.view);
            if (viewNode) {
                const datasourcesContainer = toNode(viewNode.datasources);
                const datasourceNodes = getChildNodes(datasourcesContainer, 'datasource');

                for (const ds of datasourceNodes) {
                    const dsName = coalesceString(
                        getString(ds, 'caption'),
                        stripBrackets(getString(ds, 'name')),
                        'Unknown'
                    );
                    if (!datasources.includes(dsName)) {
                        datasources.push(dsName);
                    }
                }

                // Count filters
                const filterNodes = getChildNodes(viewNode, 'filter');
                const filterCount = filterNodes.length;

                // Count calculated fields (columns with calculations)
                const datasourceDepsNodes = getChildNodes(viewNode, 'datasource-dependencies');
                let calcFieldCount = 0;
                for (const depNode of datasourceDepsNodes) {
                    const columns = getChildNodes(depNode, 'column');
                    for (const column of columns) {
                        const calculations = getChildNodes(column, 'calculation');
                        if (calculations.length > 0) {
                            calcFieldCount++;
                        }
                    }
                }

                worksheets.push({
                    workbook: workbookLabel,
                    name: name,
                    datasources: datasources,
                    filters: filterCount > 0 ? filterCount : undefined,
                    calculated_fields: calcFieldCount > 0 ? calcFieldCount : undefined
                });

                continue;
            }
        }

        // Fallback if no table/view structure
        worksheets.push({
            workbook: workbookLabel,
            name: name,
            datasources: []
        });
    }

    return worksheets;
}

/**
 * Extracts all hierarchies from Tableau workbook XML
 *
 * @param xml - The XML content to parse
 * @param workbookName - The name of the workbook file
 * @param preprocessor - Optional preprocessor for cleaning/transforming XML
 * @returns Array of extracted hierarchies
 */
export function extractHierarchiesFromXml(
    xml: string,
    workbookName: string,
    preprocessor?: XmlPreprocessor
): ExtractedHierarchy[] {
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

    const hierarchies: ExtractedHierarchy[] = [];

    // Extract hierarchies from datasources
    const datasourceContainer = toNode(workbookNode.datasources) ?? toNode(workbookNode.Datasources);
    const datasources = getChildNodes(datasourceContainer, 'datasource');

    for (const datasource of datasources) {
        const datasourceLabel = coalesceString(
            getString(datasource, 'caption'),
            stripBrackets(getString(datasource, 'name')),
            'Unknown Datasource'
        );

        // Look for drill-path or hierarchy nodes
        const drillPaths = getChildNodes(datasource, 'drill-path');
        for (const drillPath of drillPaths) {
            const name = getString(drillPath, 'name') || 'Unknown Hierarchy';
            const caption = getString(drillPath, 'caption');

            const fields: string[] = [];
            const fieldNodes = getChildNodes(drillPath, 'field');
            for (const field of fieldNodes) {
                const fieldName = stripBrackets(getString(field, 'name') || toStringValue(field));
                if (fieldName) {
                    fields.push(fieldName);
                }
            }

            if (fields.length > 0) {
                hierarchies.push({
                    workbook: workbookLabel,
                    datasource: datasourceLabel,
                    name: name,
                    caption: caption,
                    fields: fields
                });
            }
        }

        // Also check for drill-paths in layout sections
        const layoutNode = toNode(datasource.layout);
        if (layoutNode) {
            const hierarchyNodes = getChildNodes(layoutNode, 'hierarchy');
            for (const hierarchy of hierarchyNodes) {
                const name = getString(hierarchy, 'name') || 'Unknown Hierarchy';
                const caption = getString(hierarchy, 'caption');

                const fields: string[] = [];
                const fieldNodes = getChildNodes(hierarchy, 'field');
                for (const field of fieldNodes) {
                    const fieldName = stripBrackets(getString(field, 'name') || toStringValue(field));
                    if (fieldName) {
                        fields.push(fieldName);
                    }
                }

                if (fields.length > 0) {
                    hierarchies.push({
                        workbook: workbookLabel,
                        datasource: datasourceLabel,
                        name: name,
                        caption: caption,
                        fields: fields
                    });
                }
            }
        }
    }

    return hierarchies;
}

/**
 * Enhanced datasource extraction with connection details
 *
 * @param xml - The XML content to parse
 * @param workbookName - The name of the workbook file
 * @param preprocessor - Optional preprocessor for cleaning/transforming XML
 * @returns Array of extracted datasources with connection information
 */
export function extractDatasourcesWithConnectionsFromXml(
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
            // Extract connection information
            let connection: ExtractedConnection | undefined;
            const connectionNode = toNode(datasource.connection);

            if (connectionNode) {
                const connClass = getString(connectionNode, 'class') || 'unknown';
                const server = getString(connectionNode, 'server');
                const dbname = getString(connectionNode, 'dbname');
                const username = getString(connectionNode, 'username');
                const filename = getString(connectionNode, 'filename');
                const schema = getString(connectionNode, 'schema');
                const authentication = getString(connectionNode, 'authentication');
                const port = getString(connectionNode, 'port');

                // Only create connection object if we have meaningful data
                if (connClass !== 'unknown' || server || dbname || filename) {
                    connection = {
                        class: connClass,
                        server: server,
                        dbname: dbname,
                        username: username,
                        filename: filename,
                        schema: schema,
                        authentication: authentication,
                        port: port
                    };
                }
            }

            datasources.push({
                workbook: workbookLabel,
                name: stripBrackets(name) || caption || 'Unknown',
                caption: caption,
                connection: connection
            });
        }
    }

    return datasources;
}
