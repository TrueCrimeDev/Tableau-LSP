import {
    WorkbookFieldDefinition,
    WorkbookFieldKind,
} from './fieldContextProtocol.js';
import { cleanXmlContent } from '../extract/xmlCleaner.js';
import { extractFieldsFromXml } from '../extract/xml.js';
import { mapDatatype } from '../extract/fieldDefsGenerator.js';

export {
    WorkbookFieldDefinition,
    WorkbookFieldKind,
    WORKBOOK_FIELD_CONTEXT_NOTIFICATION,
} from './fieldContextProtocol.js';

/** A field exactly as it appears in one Tableau datasource. */
export interface WorkbookDataField {
    name: string;
    internalName: string;
    type: string;
    datatype: string;
    role: string;
    datasource: string;
    workbook: string;
    kind: WorkbookFieldKind;
    description: string;
    sourceUri?: string;
    sourceLine?: number;
    sourceCharacter?: number;
}

/**
 * Flattened field definition sent to the language server. Tableau calculations
 * reference fields by caption, so fields with the same caption in multiple
 * datasources are represented by one definition whose metadata names every
 * matching datasource.
 */
export interface WorkbookFieldContext {
    workbook: string;
    sourceUri?: string;
    fields: WorkbookDataField[];
    definitions: WorkbookFieldDefinition[];
}

function decodeXmlEntities(value: string): string {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&');
}

function stripBrackets(value: string): string {
    return value.replace(/^\[|\]$/g, '');
}

function attributeOf(tag: string, attribute: string): string | undefined {
    const match = new RegExp(`\\b${attribute}=(['"])([\\s\\S]*?)\\1`, 'i').exec(tag);
    return match ? decodeXmlEntities(match[2]) : undefined;
}

/** Hide literal XML embedded in CDATA/comments without changing source offsets. */
function maskEmbeddedXml(xml: string): string {
    return xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->/g, match =>
        match.replace(/[^\r\n]/g, ' ')
    );
}

interface FieldLocations {
    captions: Map<string, { line: number; character: number }>;
    names: Map<string, { line: number; character: number }>;
    metadataNames: Map<string, { line: number; character: number }>;
}

interface FieldSourceIndex {
    global: FieldLocations;
    datasources: Map<string, FieldLocations>;
}

/** Build source locations once; per-field XML rescans become quadratic on wide workbooks. */
function buildFieldSourceIndex(xml: string): FieldSourceIndex {
    const searchableXml = maskEmbeddedXml(xml);
    const lineStarts = [0];
    for (let index = xml.indexOf('\n'); index !== -1; index = xml.indexOf('\n', index + 1)) {
        lineStarts.push(index + 1);
    }
    const positionAt = (index: number): { line: number; character: number } => {
        let low = 0;
        let high = lineStarts.length;
        while (low < high) {
            const middle = Math.floor((low + high) / 2);
            if (lineStarts[middle] <= index) {
                low = middle + 1;
            } else {
                high = middle;
            }
        }
        const line = Math.max(0, low - 1);
        return { line, character: index - lineStarts[line] };
    };

    const indexFragment = (fragment: string, baseOffset: number): FieldLocations => {
        const captions = new Map<string, { line: number; character: number }>();
        const names = new Map<string, { line: number; character: number }>();
        const metadataNames = new Map<string, { line: number; character: number }>();
        const columnTag = /<column(?=[\s/>])[^>]*>/gi;
        let match: RegExpExecArray | null;
        while ((match = columnTag.exec(fragment)) !== null) {
            const location = positionAt(baseOffset + match.index);
            const caption = stripBrackets(attributeOf(match[0], 'caption') ?? '').toLowerCase();
            const name = stripBrackets(attributeOf(match[0], 'name') ?? '').toLowerCase();
            if (caption && !captions.has(caption)) {
                captions.set(caption, location);
            }
            if (name && !names.has(name)) {
                names.set(name, location);
            }
        }

        const metadataRecord = /<metadata-record(?=[\s>])[^>]*>[\s\S]*?<\/metadata-record>/gi;
        while ((match = metadataRecord.exec(fragment)) !== null) {
            const localName = /<local-name>([\s\S]*?)<\/local-name>/i.exec(match[0]);
            if (!localName) {
                continue;
            }
            const name = stripBrackets(decodeXmlEntities(localName[1])).toLowerCase();
            if (name && !metadataNames.has(name)) {
                metadataNames.set(name, positionAt(baseOffset + match.index + localName.index));
            }
        }
        return { captions, metadataNames, names };
    };

    const mergeLocations = (target: FieldLocations, source: FieldLocations): void => {
        for (const mapName of ['captions', 'names', 'metadataNames'] as const) {
            for (const [name, location] of source[mapName]) {
                if (!target[mapName].has(name)) {
                    target[mapName].set(name, location);
                }
            }
        }
    };

    const global = indexFragment(searchableXml, 0);
    const datasources = new Map<string, FieldLocations>();
    const datasourceBlock = /<datasource(?=[\s>])[^>]*>[\s\S]*?<\/datasource>/gi;
    let datasourceMatch: RegExpExecArray | null;
    while ((datasourceMatch = datasourceBlock.exec(searchableXml)) !== null) {
        const openingTag = /^<datasource(?=[\s>])[^>]*>/i.exec(datasourceMatch[0])?.[0] ?? '';
        const label = stripBrackets(
            attributeOf(openingTag, 'caption') ?? attributeOf(openingTag, 'name') ?? 'Unknown Datasource'
        ).trim();
        const locations = indexFragment(datasourceMatch[0], datasourceMatch.index);
        const key = label.toLowerCase();
        const existing = datasources.get(key);
        if (existing) {
            mergeLocations(existing, locations);
        } else {
            datasources.set(key, locations);
        }
    }
    return { datasources, global };
}

/** Locate the source declaration so go-to-definition can open the workbook. */
function findFieldSource(
    sourceIndex: FieldSourceIndex,
    datasource: string,
    displayName: string,
    internalName: string
): { line: number; character: number } | undefined {
    const display = stripBrackets(displayName).toLowerCase();
    const internal = stripBrackets(internalName).toLowerCase();
    const locations = sourceIndex.datasources.get(datasource.toLowerCase()) ?? sourceIndex.global;
    return locations.captions.get(display) ??
        locations.names.get(internal) ??
        locations.names.get(display) ??
        locations.metadataNames.get(internal) ??
        locations.metadataNames.get(display);
}

function fieldKind(isCalculation: boolean | undefined, isParameter: boolean | undefined): WorkbookFieldKind {
    if (isParameter) {
        return 'parameter';
    }
    return isCalculation ? 'calculation' : 'field';
}

function fieldDescription(field: WorkbookDataField): string {
    const label = field.kind === 'calculation'
        ? 'Calculated field'
        : field.kind === 'parameter'
            ? 'Parameter'
            : 'Datasource field';
    const details = [
        `${label} from ${field.datasource}`,
        field.datatype ? `Tableau datatype: ${field.datatype}` : '',
        field.role ? `role: ${field.role}` : '',
        `workbook: ${field.workbook}`,
    ].filter(Boolean);
    return `${details.join('; ')}.`;
}

/**
 * Converts the workbook XML's datasource metadata into the same field model
 * consumed by hover, completion and go-to-definition.
 */
export function buildWorkbookFieldContext(
    xml: string,
    workbook: string,
    sourceUri?: string
): WorkbookFieldContext {
    let processedXml = xml;
    try {
        processedXml = cleanXmlContent(processedXml);
    } catch {
        // The extractor can still handle many workbooks without the cleaner.
    }
    const seen = new Set<string>();
    const fields: WorkbookDataField[] = [];
    const sourceIndex = buildFieldSourceIndex(xml);
    for (const extracted of extractFieldsFromXml(processedXml, workbook)) {
        const name = (extracted.caption ?? extracted.name).trim();
        const internalName = extracted.name.trim();
        const datatype = (extracted.datatype ?? '').trim();
        if (!name || name.includes(']') || internalName.includes('__tableau_internal') || datatype === 'table') {
            continue;
        }
        const datasource = (extracted.datasource || 'Unknown Datasource').trim();
        const key = `${datasource}::${name}`.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);

        const source = findFieldSource(sourceIndex, datasource, name, internalName);
        const field: WorkbookDataField = {
            name,
            internalName,
            type: mapDatatype(datatype),
            datatype,
            role: (extracted.role ?? '').trim(),
            datasource,
            workbook,
            kind: fieldKind(extracted.isCalculation, extracted.isParameter),
            description: '',
            sourceUri,
            sourceLine: source?.line,
            sourceCharacter: source?.character,
        };
        field.description = fieldDescription(field);
        fields.push(field);
    }

    return {
        workbook,
        sourceUri,
        fields,
        definitions: buildFieldDefinitions(fields),
    };
}

/** Collapse duplicate captions while retaining their datasource/type metadata. */
export function buildFieldDefinitions(fields: WorkbookDataField[]): WorkbookFieldDefinition[] {
    const groups = new Map<string, WorkbookDataField[]>();
    for (const field of fields) {
        const key = field.name.toUpperCase();
        const group = groups.get(key) ?? [];
        group.push(field);
        groups.set(key, group);
    }

    const definitions: WorkbookFieldDefinition[] = [];
    for (const group of groups.values()) {
        const first = group[0];
        const types = [...new Set(group.map(field => field.type).filter(Boolean))];
        const datatypes = [...new Set(group.map(field => field.datatype).filter(Boolean))];
        const roles = [...new Set(group.map(field => field.role).filter(Boolean))];
        const datasources = [...new Set(group.map(field => field.datasource).filter(Boolean))];
        const kinds = [...new Set(group.map(field => field.kind))];
        const description = group.length === 1
            ? first.description
            : `Workbook field found in ${String(datasources.length)} datasources: ${group.map(field =>
                `${field.datasource} (${field.datatype || 'unknown'}${field.role ? `, ${field.role}` : ''})`
            ).join('; ')}. Workbook: ${first.workbook}.`;
        definitions.push({
            name: first.name,
            type: types.join(' | ') || 'String',
            description,
            datatype: datatypes.join(' | '),
            role: roles.join(' | '),
            datasource: datasources.join(' | '),
            workbook: first.workbook,
            kind: kinds.length === 1 ? kinds[0] : undefined,
            sourceUri: first.sourceUri,
            sourceLine: first.sourceLine,
            sourceCharacter: first.sourceCharacter,
        });
    }
    return definitions.sort((left, right) => left.name.localeCompare(right.name));
}
