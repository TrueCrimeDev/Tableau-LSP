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
    DashboardZone,
    WorksheetFieldUsage
} from './types.js';

const parserOptions = {
    ignoreAttributes: false,
    attributeNamePrefix: '',
    allowBooleanAttributes: true,
    trimValues: false
};

export interface XmlNode {
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
 * Parses workbook XML into the node tree shared by all extractors.
 *
 * Callers that run several extractors over the same XML should call this once
 * and hand the returned root to each extractor's `parsedRoot` parameter, so
 * the (potentially multi-MB) document is only parsed a single time.
 *
 * @param xml - The XML content to parse (already cleaned/resolved as needed)
 * @returns The parsed root node, or undefined for blank input
 */
export function parseWorkbookXml(xml: string): XmlNode | undefined {
    const trimmed = xml.trim();
    if (!trimmed) {
        return undefined;
    }
    let parsed: unknown;
    try {
        const parser = new XMLParser(parserOptions);
        parsed = parser.parse(trimmed);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to parse Tableau workbook XML: ${message}`);
    }
    return toNode(parsed);
}

/**
 * Shared extractor entry point: applies the optional preprocessor pipeline to
 * the XML string and parses it. Kept separate from parseWorkbookXml so the
 * string-based extractor signatures behave exactly as before.
 */
function parsePreprocessedXml(xml: string, preprocessor?: XmlPreprocessor): XmlNode | undefined {
    let processedXml = xml.trim();
    if (!processedXml) {
        return undefined;
    }
    if (preprocessor) {
        if (preprocessor.clean) {
            processedXml = preprocessor.clean(processedXml);
        }
        if (preprocessor.resolveNames) {
            processedXml = preprocessor.resolveNames(processedXml);
        }
    }
    return parseWorkbookXml(processedXml);
}

/**
 * Extracts calculations from Tableau workbook XML
 *
 * @param xml - The XML content to parse
 * @param workbookName - The name of the workbook file
 * @param preprocessor - Optional preprocessor for cleaning/transforming XML
 * @param parsedRoot - Optional pre-parsed root (see parseWorkbookXml); skips string parsing entirely
 * @returns Array of extracted calculations
 */
export function extractCalcsFromXml(
    xml: string,
    workbookName: string,
    preprocessor?: XmlPreprocessor,
    parsedRoot?: XmlNode
): ExtractedCalculation[] {
    const root = parsedRoot ?? parsePreprocessedXml(xml, preprocessor);
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

function firstFiniteNumber(...values: Array<string | undefined>): number | undefined {
    for (const value of values) {
        if (value === undefined) {
            continue;
        }
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return undefined;
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
 * @param parsedRoot - Optional pre-parsed root (see parseWorkbookXml); skips string parsing entirely
 * @returns Array of extracted datasources
 */
export function extractDatasourcesFromXml(
    xml: string,
    workbookName: string,
    preprocessor?: XmlPreprocessor,
    parsedRoot?: XmlNode
): ExtractedDatasource[] {
    const root = parsedRoot ?? parsePreprocessedXml(xml, preprocessor);
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
 * @param parsedRoot - Optional pre-parsed root (see parseWorkbookXml); skips string parsing entirely
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
    preprocessor?: XmlPreprocessor,
    parsedRoot?: XmlNode
): ExtractedField[] {
    const root = parsedRoot ?? parsePreprocessedXml(xml, preprocessor);
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
 * @param parsedRoot - Optional pre-parsed root (see parseWorkbookXml); skips string parsing entirely
 * @returns Array of extracted parameters
 */
export function extractParametersFromXml(
    xml: string,
    workbookName: string,
    preprocessor?: XmlPreprocessor,
    parsedRoot?: XmlNode
): ExtractedParameter[] {
    const root = parsedRoot ?? parsePreprocessedXml(xml, preprocessor);
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
 * @param parsedRoot - Optional pre-parsed root (see parseWorkbookXml); skips string parsing entirely
 * @returns Array of extracted filters
 */
export function extractFiltersFromXml(
    xml: string,
    workbookName: string,
    preprocessor?: XmlPreprocessor,
    parsedRoot?: XmlNode
): ExtractedFilter[] {
    const root = parsedRoot ?? parsePreprocessedXml(xml, preprocessor);
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
 * @param parsedRoot - Optional pre-parsed root (see parseWorkbookXml); skips string parsing entirely
 * @returns Array of extracted dashboards
 */
export function extractDashboardsFromXml(
    xml: string,
    workbookName: string,
    preprocessor?: XmlPreprocessor,
    parsedRoot?: XmlNode
): ExtractedDashboard[] {
    const root = parsedRoot ?? parsePreprocessedXml(xml, preprocessor);
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

        // Extract size (fixed sizes may use maxwidth/maxheight instead)
        const sizeNode = toNode(dashboard.size);
        const width = sizeNode
            ? firstFiniteNumber(getString(sizeNode, 'width'), getString(sizeNode, 'maxwidth'))
            : undefined;
        const height = sizeNode
            ? firstFiniteNumber(getString(sizeNode, 'height'), getString(sizeNode, 'maxheight'))
            : undefined;

        // Extract zones
        const zones: DashboardZone[] = [];
        const extractZones = (node: XmlNode): void => {
            const zoneNodes = getChildNodes(node, 'zone');
            for (const zone of zoneNodes) {
                const zoneName = getString(zone, 'name');
                // Modern workbooks write the zone type to 'type-v2'
                // (layout-basic, layout-flow, text, ...); worksheet zones
                // carry a name but no type attribute at all.
                const zoneType = getString(zone, 'type') || getString(zone, 'type-v2') || 'unknown';
                const x = Number(getString(zone, 'x')) || 0;
                const y = Number(getString(zone, 'y')) || 0;
                const w = Number(getString(zone, 'w')) || 0;
                const h = Number(getString(zone, 'h')) || 0;

                // A named zone with no recognizable type is a worksheet zone.
                const isWorksheetZone = zoneType === 'worksheet'
                    || (Boolean(zoneName) && zoneType === 'unknown');

                zones.push({
                    name: zoneName,
                    type: zoneType,
                    x: x,
                    y: y,
                    w: w,
                    h: h,
                    worksheet: isWorksheetZone ? zoneName : undefined
                });

                // Recursively extract nested zones
                extractZones(zone);
            }
        };

        extractZones(dashboard);
        // Modern workbooks nest zones under a <zones> wrapper element.
        const zonesWrapper = toNode(dashboard.zones);
        if (zonesWrapper) {
            extractZones(zonesWrapper);
        }

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
 * @param parsedRoot - Optional pre-parsed root (see parseWorkbookXml); skips string parsing entirely
 * @returns Array of extracted worksheets
 */
export function extractWorksheetsFromXml(
    xml: string,
    workbookName: string,
    preprocessor?: XmlPreprocessor,
    parsedRoot?: XmlNode
): ExtractedWorksheet[] {
    const root = parsedRoot ?? parsePreprocessedXml(xml, preprocessor);
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
 * @param parsedRoot - Optional pre-parsed root (see parseWorkbookXml); skips string parsing entirely
 * @returns Array of extracted hierarchies
 */
export function extractHierarchiesFromXml(
    xml: string,
    workbookName: string,
    preprocessor?: XmlPreprocessor,
    parsedRoot?: XmlNode
): ExtractedHierarchy[] {
    const root = parsedRoot ?? parsePreprocessedXml(xml, preprocessor);
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
 * @param parsedRoot - Optional pre-parsed root (see parseWorkbookXml); skips string parsing entirely
 * @returns Array of extracted datasources with connection information
 */
export function extractDatasourcesWithConnectionsFromXml(
    xml: string,
    workbookName: string,
    preprocessor?: XmlPreprocessor,
    parsedRoot?: XmlNode
): ExtractedDatasource[] {
    const root = parsedRoot ?? parsePreprocessedXml(xml, preprocessor);
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

/**
 * Recursively collects nodes with a given tag name anywhere under a node.
 * Mirrors collectColumnNodes: FCP-mangled wrappers can bury the target tag
 * under unexpected intermediate elements, so walk everything.
 */
function collectNodesByKey(node: XmlNode, key: string, out: XmlNode[]): void {
    for (const childKey of Object.keys(node)) {
        const value = node[childKey];
        if (childKey === key) {
            out.push(...toNodeArray(value));
            continue;
        }
        if (typeof value === 'object' && value !== null) {
            for (const child of toNodeArray(value)) {
                collectNodesByKey(child, key, out);
            }
        }
    }
}

/**
 * Extracts, per worksheet and datasource, the field names the worksheet
 * references. Source: each <worksheet><table><view><datasource-dependencies
 * datasource='DS'> block — field names come from its <column> children
 * (caption > bracket-stripped name, same precedence as deriveColumnTitle)
 * and from <column-instance column='[Field]'> attributes (the instance
 * grammar '[agg:Field:nk]' lives in name=, while column= holds the plain
 * field reference).
 *
 * @param xml - The XML content to parse
 * @param preprocessor - Optional preprocessor for cleaning/transforming XML
 * @param parsedRoot - Optional pre-parsed root (see parseWorkbookXml); skips string parsing entirely
 * @returns One entry per worksheet + datasource pair, fields deduped
 */
export function extractWorksheetFieldUsage(
    xml: string,
    preprocessor?: XmlPreprocessor,
    parsedRoot?: XmlNode
): WorksheetFieldUsage[] {
    const root = parsedRoot ?? parsePreprocessedXml(xml, preprocessor);
    if (!root) {
        return [];
    }

    const workbookNode = toNode(root.workbook) ?? toNode(root.Workbook) ?? root;

    const usages: WorksheetFieldUsage[] = [];

    const worksheetsContainer = toNode(workbookNode.worksheets) ?? toNode(workbookNode.Worksheets);
    const worksheetNodes = getChildNodes(worksheetsContainer, 'worksheet');

    for (const worksheet of worksheetNodes) {
        const worksheetName = getString(worksheet, 'name') || 'Unknown Worksheet';

        // FCP-tolerant: find dependency blocks anywhere under the worksheet
        // rather than assuming the exact table/view nesting survived cleaning.
        const depNodes: XmlNode[] = [];
        collectNodesByKey(worksheet, 'datasource-dependencies', depNodes);

        // One output entry per datasource, even when a datasource appears in
        // several dependency blocks; fields deduped case-insensitively.
        const byDatasource = new Map<string, { datasource: string; seen: Set<string>; fields: string[] }>();

        for (const dep of depNodes) {
            const datasource = stripBrackets(getString(dep, 'datasource')) || 'Unknown';
            const dsKey = datasource.toLowerCase();
            let existing = byDatasource.get(dsKey);
            if (!existing) {
                existing = { datasource, seen: new Set<string>(), fields: [] };
                byDatasource.set(dsKey, existing);
            }
            const entry = existing;

            const addField = (fieldName: string | undefined): void => {
                if (!fieldName) {
                    return;
                }
                const key = fieldName.toLowerCase();
                if (entry.seen.has(key)) {
                    return;
                }
                entry.seen.add(key);
                entry.fields.push(fieldName);
            };

            for (const column of getChildNodes(dep, 'column')) {
                // Same precedence as deriveColumnTitle, but skip anonymous columns
                // instead of emitting its 'Unnamed Calculation' placeholder.
                if (!getString(column, 'caption') && !getString(column, 'alias') && !getString(column, 'name')) {
                    continue;
                }
                addField(deriveColumnTitle(column));
            }

            for (const instance of getChildNodes(dep, 'column-instance')) {
                addField(stripBrackets(getString(instance, 'column')));
            }
        }

        for (const entry of byDatasource.values()) {
            usages.push({
                worksheet: worksheetName,
                datasource: entry.datasource,
                fields: entry.fields
            });
        }
    }

    return usages;
}
