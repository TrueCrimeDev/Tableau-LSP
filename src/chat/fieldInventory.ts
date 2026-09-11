import { ParamInfo, collectParameters } from './workbookDigest.js';
import { WorkbookDataField, buildWorkbookFieldContext } from '../services/workbookFieldContext.js';
import { listWorkbookDatasources } from '../parsers/workbookCalculations.js';
import { resolveNames } from '../extract/nameResolver.js';
import { sanitizeWorkbookText, sanitizeWorkbookFormula } from './untrustedText.js';

/**
 * The complete, uncapped field inventory for a workbook.
 *
 * The chat digest caps its field list so every section survives the prompt
 * budget. Authoring a calculation needs the opposite: exhaustive, exact names,
 * because a field the model cannot see is a field it will invent. This module
 * backs the `tableau_listFields` tool, which the model calls on demand.
 */

export type FieldInventoryKind = 'field' | 'calculation' | 'parameter' | 'all';

export interface FieldInventoryFilter {
    datasource?: string;
    kind?: FieldInventoryKind;
    nameContains?: string;
}

export interface FieldInventoryOptions extends FieldInventoryFilter {
    /** Character ceiling for the rendered inventory. Truncation is announced. */
    maxChars?: number;
}

const DEFAULT_MAX_CHARS = 48000;

function sanitize(value: string, maxChars?: number): string {
    return sanitizeWorkbookText(value, maxChars);
}

function matchesDatasource(candidate: string, query: string | undefined): boolean {
    if (!query?.trim()) {
        return true;
    }
    const wanted = query.trim().toLowerCase().replace(/^\[|\]$/g, '');
    const actual = candidate.toLowerCase().replace(/^\[|\]$/g, '');
    return actual === wanted || actual.includes(wanted);
}

function matchesName(name: string, query: string | undefined): boolean {
    if (!query?.trim()) {
        return true;
    }
    return name.toLowerCase().includes(query.trim().toLowerCase());
}

/** Internal datasource names, keyed by caption — the write tool accepts either. */
function internalNamesByCaption(xml: string): Map<string, string> {
    const names = new Map<string, string>();
    try {
        for (const datasource of listWorkbookDatasources(xml)) {
            names.set(datasource.caption.toLowerCase(), datasource.name);
        }
    } catch {
        // A workbook the strict parser rejects still yields a useful field list.
    }
    return names;
}

function attributeOf(tag: string, name: string): string | undefined {
    const match = new RegExp(`\\b${name}=(['"])([\\s\\S]*?)\\1`, 'i').exec(tag);
    return match?.[2];
}

function decodeEntities(text: string): string {
    return text
        .replace(/&#13;/g, '')
        .replace(/&#10;/g, '\n')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&');
}

function stripBrackets(value: string): string {
    return value.replace(/^\[|\]$/g, '');
}

/**
 * Calculation formulas keyed by `datasource::name`, under BOTH the caption and
 * the bracket-stripped internal name. Two datasources routinely reuse a caption
 * with different formulas, and a captionless calculated column is only findable
 * by its internal name — keying on caption alone gets both cases wrong.
 */
function formulaIndex(xml: string): Map<string, string> {
    let resolved = xml;
    try {
        resolved = resolveNames(xml);
    } catch {
        // Fall back to unresolved [Calculation_…] references in formulas.
    }
    const formulas = new Map<string, string>();
    const datasourceRe = /<datasource\b([^>]*)>([\s\S]*?)<\/datasource>/gi;
    let datasourceMatch: RegExpExecArray | null;
    while ((datasourceMatch = datasourceRe.exec(resolved)) !== null) {
        const label = stripBrackets(decodeEntities(
            attributeOf(datasourceMatch[1], 'caption') ?? attributeOf(datasourceMatch[1], 'name') ?? ''
        )).trim().toLowerCase();
        const columnRe = /<column\b[^>]*?\/>|<column\b([^>]*)>([\s\S]*?)<\/column>/g;
        let columnMatch: RegExpExecArray | null;
        while ((columnMatch = columnRe.exec(datasourceMatch[2])) !== null) {
            // The self-closing alternative matched: no <calculation> child.
            if (/\/>\s*$/.test(columnMatch[0])) { continue; }
            if (columnMatch[1].includes('param-domain-type=')) { continue; }
            const formulaTag = /<calculation\b[^>]*formula=(['"])([\s\S]*?)\1/.exec(columnMatch[2]);
            if (!formulaTag) { continue; }
            const formula = decodeEntities(formulaTag[2]);
            for (const attribute of ['caption', 'name'] as const) {
                const raw = attributeOf(columnMatch[1], attribute);
                if (!raw) { continue; }
                const key = `${label}::${stripBrackets(decodeEntities(raw)).toLowerCase()}`;
                if (!formulas.has(key)) {
                    formulas.set(key, formula);
                }
            }
        }
    }
    return formulas;
}

interface DatasourceGroup {
    caption: string;
    internalName?: string;
    fields: WorkbookDataField[];
    calculations: WorkbookDataField[];
}

function groupByDatasource(fields: WorkbookDataField[], internalNames: Map<string, string>): DatasourceGroup[] {
    const groups = new Map<string, DatasourceGroup>();
    for (const field of fields) {
        const key = field.datasource.toLowerCase();
        const group = groups.get(key) ?? {
            caption: field.datasource,
            internalName: internalNames.get(key),
            fields: [],
            calculations: [],
        };
        if (field.kind === 'calculation') {
            group.calculations.push(field);
        } else if (field.kind === 'field') {
            group.fields.push(field);
        }
        groups.set(key, group);
    }
    return [...groups.values()];
}

function describeField(field: WorkbookDataField): string {
    const facets = [sanitize(field.datatype, 40) || 'unknown', sanitize(field.role, 40)].filter(Boolean).join(', ');
    return `- [${sanitize(field.name, 200)}] — ${facets}`;
}

function describeCalculation(field: WorkbookDataField, formulas: Map<string, string>): string[] {
    const lines = [describeField(field)];
    const datasource = field.datasource.toLowerCase();
    const formula = formulas.get(`${datasource}::${field.name.toLowerCase()}`) ??
        formulas.get(`${datasource}::${stripBrackets(field.internalName).toLowerCase()}`);
    if (formula) {
        lines.push(`  ${sanitizeWorkbookFormula(formula, 600)}`);
    }
    return lines;
}

function describeParameter(parameter: ParamInfo): string {
    const value = parameter.value ? ` = ${sanitize(parameter.value, 120)}` : '';
    return `- [${sanitize(parameter.caption, 200)}] — ` +
        `${sanitize(parameter.datatype, 40)}, ${sanitize(parameter.domainType, 40)} parameter${value}`;
}

/**
 * Trims whole lines off the end of the datasource listing until the whole
 * document fits. Never drops the parameters section: silently losing it while
 * the header claims completeness is worse than a shorter field list.
 */
function fitToBudget(head: string[], body: string[], tail: string[], maxChars: number): {
    lines: string[];
    droppedLines: number;
} {
    const fixed = [...head, ...tail].reduce((total, line) => total + line.length + 1, 0);
    let budget = maxChars - fixed;
    let kept = body.length;
    let used = 0;
    for (let index = 0; index < body.length; index += 1) {
        used += body[index].length + 1;
        if (used > budget) {
            kept = index;
            break;
        }
    }
    if (kept === body.length) {
        return { lines: [...body, ...tail], droppedLines: 0 };
    }
    const note = (dropped: number): string =>
        `- [${String(dropped)} more lines omitted at the ${String(maxChars)}-character ceiling — ` +
        're-run with the datasource or nameContains filter to see them]';
    budget -= note(body.length).length + 1;
    while (kept > 0 && used > budget) {
        kept -= 1;
        used -= body[kept].length + 1;
    }
    const dropped = body.length - kept;
    return {
        lines: [...body.slice(0, kept), note(dropped), ...tail],
        droppedLines: dropped,
    };
}

/**
 * Renders every field, calculated field and parameter the workbook exposes,
 * grouped by datasource and filtered by the caller's query.
 */
export function buildFieldInventory(
    xml: string,
    workbookName: string,
    options: FieldInventoryOptions = {}
): string {
    const kind = options.kind ?? 'all';
    const context = buildWorkbookFieldContext(xml, workbookName);
    const internalNames = internalNamesByCaption(xml);
    const formulas = formulaIndex(xml);

    const selected = context.fields.filter(field =>
        field.kind !== 'parameter' &&
        matchesDatasource(field.datasource, options.datasource) &&
        matchesName(field.name, options.nameContains)
    );
    const groups = groupByDatasource(selected, internalNames);

    const body: string[] = [];
    if (!groups.length) {
        body.push('', '(no matching fields — check the datasource or name filter)');
    }
    for (const group of groups) {
        body.push('', `## ${sanitize(group.caption, 200)}`);
        if (group.internalName && group.internalName !== group.caption) {
            body.push(
                'Internal name (accepted by `tableau_addCalculation`): ' +
                `\`${sanitize(group.internalName, 200)}\``
            );
        }
        body.push(`${String(group.fields.length)} fields, ${String(group.calculations.length)} calculated fields.`);

        if (kind === 'all' || kind === 'field') {
            body.push('', `### Fields (${String(group.fields.length)})`);
            body.push(...(group.fields.length ? group.fields.map(describeField) : ['(none)']));
        }
        if (kind === 'all' || kind === 'calculation') {
            body.push('', `### Calculated fields (${String(group.calculations.length)})`);
            body.push(...(group.calculations.length
                ? group.calculations.flatMap(field => describeCalculation(field, formulas))
                : ['(none)']));
        }
    }

    const tail: string[] = [];
    if (kind === 'all' || kind === 'parameter') {
        const parameters = collectParameters(xml).filter(parameter =>
            matchesName(parameter.caption, options.nameContains)
        );
        tail.push('', `## Parameters (${String(parameters.length)})`);
        tail.push(...(parameters.length ? parameters.map(describeParameter) : ['(none)']));
    }

    const filters = [
        options.datasource ? `datasource "${sanitize(options.datasource, 120)}"` : '',
        kind !== 'all' ? `kind "${kind}"` : '',
        options.nameContains ? `name containing "${sanitize(options.nameContains, 120)}"` : '',
    ].filter(Boolean);
    const scope = filters.length ? `Filtered by ${filters.join(', ')}.` : 'Every field in the workbook.';
    const headFor = (headline: string): string[] => [
        `# Field inventory — ${sanitize(workbookName, 200)}`,
        headline,
        'Reference a field in a Tableau formula by its bracketed caption, e.g. `[Sales]`.',
    ];

    // The completeness claim in the header depends on whether the body fits,
    // and the two headlines differ in length — so a truncated render is fitted
    // a second time against the header it will actually ship with.
    const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
    const complete = `${scope} Nothing is capped or omitted.`;
    let head = headFor(complete);
    let fitted = fitToBudget(head, body, tail, maxChars);
    if (fitted.droppedLines) {
        head = headFor(`${scope} This listing is INCOMPLETE — see the omitted-lines note below.`);
        fitted = fitToBudget(head, body, tail, maxChars);
    }
    return [...head, ...fitted.lines].join('\n');
}
