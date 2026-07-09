import { resolveNames } from '../extract/nameResolver.js';
import { scanFormattingXml } from '../parsers/formatStripper.js';
import { buildWorkbookFieldContext, WorkbookDataField } from '../services/workbookFieldContext.js';

export type DigestFocus = 'borders' | 'calcs' | 'fields';

const MAX_DIGEST_CHARS = 14000;
const MAX_CALCS_DEFAULT = 50;
const MAX_FORMULA_CHARS_DEFAULT = 200;
const MAX_FIELDS = 60;

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

function attrOf(tag: string, name: string): string | undefined {
    const m = tag.match(new RegExp(`${name}=(['"])(.*?)\\1`));
    return m?.[2];
}

function stripBrackets(name: string): string {
    return name.replace(/^\[|\]$/g, '');
}

/** The <datasources> region — everything before <worksheets>. */
function datasourcesRegion(xml: string): string {
    const at = xml.search(/<worksheets[\s>]/);
    return at >= 0 ? xml.slice(0, at) : xml;
}

interface StyleRuleSummary {
    element: string;
    formats: string[];
}

/**
 * Lists the style-rules inside one <style> body. Tolerates FCP-mangled tag
 * names like <_.fcp.Flag.true...style-rule>.
 */
function summariseStyleBody(styleBody: string): StyleRuleSummary[] {
    const rules: StyleRuleSummary[] = [];
    const ruleRe = /<(?:[-\w.]*\.)?style-rule\s+[^>]*element=(['"])(.*?)\1[^>]*>([\s\S]*?)<\/(?:[-\w.]*\.)?style-rule>/g;
    let m: RegExpExecArray | null;
    while ((m = ruleRe.exec(styleBody)) !== null) {
        const formats: string[] = [];
        const fmtRe = /<(?:[-\w.]*\.)?format\s+([^>]*?)\/?>/g;
        let f: RegExpExecArray | null;
        while ((f = fmtRe.exec(m[3])) !== null) {
            const attrs = f[1];
            const attr = attrOf(attrs, 'attr');
            const value = attrOf(attrs, 'value');
            const scope = attrOf(attrs, 'scope');
            const field = attrOf(attrs, 'field');
            if (attr) {
                const fieldTail = field ? ` [${decodeEntities(field.split('].[').pop() ?? field).replace(/^\[|\]$/g, '')}]` : '';
                formats.push(`${attr}${scope ? ` (${scope})` : ''}${fieldTail}=${value !== undefined ? decodeEntities(value) : '?'}`);
            }
        }
        rules.push({ element: m[2], formats });
    }
    return rules;
}

/** The worksheet's own table <style> — the region before panes/rows/cols. */
function worksheetTableStyle(tableXml: string): StyleRuleSummary[] {
    const tailMatch = tableXml.match(/<(?:panes|rows|cols)[\s>]/);
    const head = tableXml.slice(0, tailMatch?.index ?? tableXml.length);
    const style = head.match(/<style>([\s\S]*?)<\/style>/);
    return style ? summariseStyleBody(style[1]) : [];
}

/** Style rules from every <pane><style> in the worksheet's <panes> block. */
function worksheetPaneStyles(tableXml: string): StyleRuleSummary[] {
    const panes = tableXml.match(/<panes>[\s\S]*?<\/panes>/)?.[0];
    if (!panes) { return []; }
    const rules: StyleRuleSummary[] = [];
    const styleRe = /<style>([\s\S]*?)<\/style>/g;
    let m: RegExpExecArray | null;
    while ((m = styleRe.exec(panes)) !== null) {
        rules.push(...summariseStyleBody(m[1]));
    }
    return rules;
}

interface WorksheetInfo {
    name: string;
    styleRules: StyleRuleSummary[];
    paneRules: StyleRuleSummary[];
}

function collectWorksheets(xml: string): WorksheetInfo[] {
    const sheets: WorksheetInfo[] = [];
    const wsRe = /<worksheet\b[^>]*>[\s\S]*?<\/worksheet>/g;
    let m: RegExpExecArray | null;
    while ((m = wsRe.exec(xml)) !== null) {
        const openTag = m[0].slice(0, m[0].indexOf('>') + 1);
        const name = attrOf(openTag, 'name') ?? '(unnamed)';
        const table = m[0].match(/<table\b[^>]*>[\s\S]*?<\/table>/)?.[0] ?? '';
        sheets.push({
            name: decodeEntities(name),
            styleRules: worksheetTableStyle(table),
            paneRules: worksheetPaneStyles(table),
        });
    }
    return sheets;
}

/** Workbook-level <style> lives before <worksheets>; FCP-mangled names count. */
function workbookLevelStyle(xml: string): StyleRuleSummary[] {
    const beforeSheets = datasourcesRegion(xml);
    const style = beforeSheets.match(/<(_\.fcp\.[^>]*?\.)?style>([\s\S]*?)<\/(?:_\.fcp\.[^>]*?\.)?style>/);
    return style ? summariseStyleBody(style[2]) : [];
}

/** Dashboard <zone-style> formats, per dashboard. */
function collectDashboardStyles(xml: string): Array<{ name: string; formats: string[] }> {
    const dashboards = xml.match(/<dashboards>[\s\S]*?<\/dashboards>/)?.[0];
    if (!dashboards) { return []; }
    const out: Array<{ name: string; formats: string[] }> = [];
    const dashRe = /<dashboard\b([^>]*)>([\s\S]*?)<\/dashboard>/g;
    let m: RegExpExecArray | null;
    while ((m = dashRe.exec(dashboards)) !== null) {
        const formats: string[] = [];
        const zoneRe = /<zone-style>([\s\S]*?)<\/zone-style>/g;
        let z: RegExpExecArray | null;
        while ((z = zoneRe.exec(m[2])) !== null) {
            const fmtRe = /<format\s+([^>]*?)\/?>/g;
            let f: RegExpExecArray | null;
            while ((f = fmtRe.exec(z[1])) !== null) {
                const attr = attrOf(f[1], 'attr');
                const value = attrOf(f[1], 'value');
                if (attr) { formats.push(`${attr}=${value !== undefined ? decodeEntities(value) : '?'}`); }
            }
        }
        if (formats.length) {
            out.push({ name: decodeEntities(attrOf(m[1], 'name') ?? '(unnamed)'), formats });
        }
    }
    return out;
}

interface CalcInfo {
    caption: string;
    formula: string;
}

function collectCalculations(xml: string): CalcInfo[] {
    // Only the datasources section — worksheets redeclare used columns inside
    // <datasource-dependencies>, which would double-count every calc.
    let resolved = xml;
    try {
        resolved = resolveNames(xml);
    } catch {
        // fall back to unresolved names
    }
    const region = datasourcesRegion(resolved);
    const calcs: CalcInfo[] = [];
    const seen = new Set<string>();
    // Self-closing alternative first, so a bare <column … /> can never swallow
    // the following column's body.
    const colRe = /<column\b[^>]*?\/>|<column\b([^>]*)>([\s\S]*?)<\/column>/g;
    let m: RegExpExecArray | null;
    while ((m = colRe.exec(region)) !== null) {
        if (m[1] === undefined) { continue; }
        if (/param-domain-type=/.test(m[1])) { continue; } // parameters are not calcs
        const formulaTag = m[2].match(/<calculation\b[^>]*formula=(['"])([\s\S]*?)\1/);
        if (!formulaTag) { continue; }
        const caption = decodeEntities(attrOf(m[1], 'caption') ?? attrOf(m[1], 'name') ?? '(unnamed)');
        const formula = decodeEntities(formulaTag[2]);
        const key = `${caption}|${formula}`;
        if (seen.has(key)) { continue; } // cross-datasource redeclarations
        seen.add(key);
        calcs.push({ caption, formula });
    }
    return calcs;
}

interface ParamInfo {
    caption: string;
    datatype: string;
    domainType: string;
    value: string;
}

function collectParameters(xml: string): ParamInfo[] {
    const region = datasourcesRegion(xml);
    const params: ParamInfo[] = [];
    const seen = new Set<string>();
    const colRe = /<column\b([^>]*?)(?:\/>|>)/g;
    let m: RegExpExecArray | null;
    while ((m = colRe.exec(region)) !== null) {
        const domainType = attrOf(m[1], 'param-domain-type');
        if (!domainType) { continue; }
        const caption = decodeEntities(attrOf(m[1], 'caption') ?? stripBrackets(attrOf(m[1], 'name') ?? '(unnamed)'));
        if (seen.has(caption)) { continue; }
        seen.add(caption);
        params.push({
            caption,
            datatype: attrOf(m[1], 'datatype') ?? '?',
            domainType,
            value: decodeEntities(attrOf(m[1], 'value') ?? ''),
        });
    }
    return params;
}

interface ThumbnailInfo {
    name: string;
    width: string;
    height: string;
    approxKb: number;
}

function collectThumbnails(xml: string): ThumbnailInfo[] {
    const thumbs: ThumbnailInfo[] = [];
    const re = /<thumbnail\b([^>]*)>([\s\S]*?)<\/thumbnail>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
        const base64Len = m[2].replace(/\s/g, '').length;
        thumbs.push({
            name: decodeEntities(attrOf(m[1], 'name') ?? '(unnamed)'),
            width: attrOf(m[1], 'width') ?? '?',
            height: attrOf(m[1], 'height') ?? '?',
            approxKb: Math.round((base64Len * 3) / 4 / 1024),
        });
    }
    return thumbs;
}

function ruleLines(rules: StyleRuleSummary[], label?: string): string[] {
    return rules.map(r => `- ${label ? `${label} ` : ''}style-rule ${r.element}: ${r.formats.length ? r.formats.join(', ') : '(empty)'}`);
}

/**
 * Caps a section's lines to a character budget, dropping whole lines from the
 * end and appending a note. Keeps the default digest's small sections alive on
 * large workbooks instead of letting one section swallow the whole cap.
 */
function capLines(lines: string[], budget: number, note: string): string[] {
    let total = 0;
    for (let i = 0; i < lines.length; i++) {
        total += lines[i].length + 1;
        if (total > budget) {
            return [...lines.slice(0, Math.max(1, i)), note];
        }
    }
    return lines;
}

export function buildWorkbookDigest(
    xml: string,
    focus?: DigestFocus,
    workbookName: string = 'Workbook.twb',
    sourceUri?: string,
    query: string = ''
): string {
    const parts: string[] = ['# Workbook digest'];
    const sheets = collectWorksheets(xml);
    // Focused digests get the full 12k for their one topic; the default digest
    // splits it so every section survives.
    const styleBudget = focus ? MAX_DIGEST_CHARS : 3500;

    if (!focus || focus === 'borders') {
        parts.push(`\n## Worksheets (${sheets.length})`);
        parts.push(...capLines(sheets.map(s => `- ${s.name}`), 700, '- [more worksheets omitted]'));

        const wbStyle = workbookLevelStyle(xml);
        parts.push('\n## Workbook-level style');
        parts.push(...(wbStyle.length ? ruleLines(wbStyle) : ['(none — worksheets inherit Tableau defaults)']));

        parts.push('\n## Worksheet table styles');
        const styleLines: string[] = [];
        for (const s of sheets) {
            styleLines.push(`### ${s.name}`);
            const lines = [
                ...ruleLines(s.styleRules),
                ...ruleLines(s.paneRules, 'pane'),
            ];
            styleLines.push(...(lines.length ? lines : ['(no explicit style — inherits defaults)']));
        }
        parts.push(...capLines(styleLines, styleBudget, '[more worksheet styles omitted — use /borders]'));

        const dashStyles = collectDashboardStyles(xml);
        if (dashStyles.length) {
            parts.push('\n## Dashboard zone styles');
            parts.push(...capLines(dashStyles.map(d => `- ${d.name}: ${d.formats.join(', ')}`), focus ? MAX_DIGEST_CHARS : 700, '- [more dashboards omitted — use /borders]'));
        }

        const scan = scanFormattingXml(xml);
        parts.push('\n## Formatting scan (strippable overrides)');
        parts.push(`- borders: ${scan.borders.count}${scan.borders.values.length ? ` — ${scan.borders.values.join(', ')}` : ''}`);
        parts.push(`- bold: ${scan.bold.count}${scan.bold.values.length ? ` — ${scan.bold.values.join(', ')}` : ''}`);
        parts.push(`- font-size: ${scan.fontSize.count}${scan.fontSize.values.length ? ` — ${scan.fontSize.values.join(', ')}` : ''}`);
        parts.push(`- font-color: ${scan.fontColor.count}${scan.fontColor.values.length ? ` — ${scan.fontColor.values.join(', ')}` : ''}`);
    }

    // Fields/parameters come before calculations: on large workbooks the calc
    // list is what hits the 12k cap, and it must not push the small sections
    // past the truncation point in the default digest.
    if (!focus || focus === 'fields') {
        const fieldContext = buildWorkbookFieldContext(xml, workbookName, sourceUri);
        const fields = fieldContext.fields.filter(field => field.kind === 'field');
        parts.push(`\n## Datasource fields (${fields.length})`);

        // Put explicitly named fields first so a large workbook can still
        // answer a targeted question even when the general inventory is capped.
        const lowerQuery = query.toLowerCase();
        const ordered = [
            ...fields.filter(field => lowerQuery && lowerQuery.includes(field.name.toLowerCase())),
            ...fields.filter(field => !lowerQuery || !lowerQuery.includes(field.name.toLowerCase())),
        ];
        const selected = ordered.slice(0, focus === 'fields' ? ordered.length : MAX_FIELDS);
        const grouped = new Map<string, WorkbookDataField[]>();
        for (const field of selected) {
            const group = grouped.get(field.datasource) ?? [];
            group.push(field);
            grouped.set(field.datasource, group);
        }
        for (const [datasource, datasourceFields] of grouped) {
            const totalForDatasource = fields.filter(field => field.datasource === datasource).length;
            parts.push(`### ${datasource} (${totalForDatasource})`);
            for (const field of datasourceFields) {
                parts.push(`- ${field.name} (${field.datatype || 'unknown'}${field.role ? `, ${field.role}` : ''})`);
            }
        }
        if (fields.length > selected.length) {
            parts.push(`- [${fields.length - selected.length} more fields omitted — ask about one by name or use /fields]`);
        }

        const params = collectParameters(xml);
        if (params.length) {
            parts.push(`\n## Parameters (${params.length})`);
            parts.push(...params.map(p => `- ${p.caption} (${p.datatype}, ${p.domainType})${p.value ? ` = ${p.value}` : ''}`));
        }
    }

    if (!focus || focus === 'calcs') {
        const calcs = collectCalculations(xml);
        const cap = focus === 'calcs' ? calcs.length : MAX_CALCS_DEFAULT;
        const maxFormula = focus === 'calcs' ? Number.POSITIVE_INFINITY : MAX_FORMULA_CHARS_DEFAULT;
        parts.push(`\n## Calculations (${calcs.length})`);
        const calcLines: string[] = [];
        for (const c of calcs.slice(0, cap)) {
            const formula = c.formula.length > maxFormula
                ? c.formula.slice(0, MAX_FORMULA_CHARS_DEFAULT) + '…'
                : c.formula;
            calcLines.push(`- **${c.caption}**: \`${formula.replace(/\n/g, ' ')}\``);
        }
        if (calcs.length > cap) {
            calcLines.push(`- [${calcs.length - cap} more calculations omitted — /calcs shows more, or ask about one by name]`);
        }
        parts.push(...(focus
            ? calcLines
            : capLines(calcLines, 4000, '- [more calculations omitted — /calcs shows more, or ask about one by name]')));
    }

    if (!focus) {
        const thumbs = collectThumbnails(xml);
        parts.push(`\n## Thumbnails (${thumbs.length})`);
        parts.push(...capLines(
            thumbs.map(t => `- ${t.name}: ${t.width}x${t.height}, ~${t.approxKb} KB PNG (base64, regenerated on save)`),
            700,
            '- [more thumbnails omitted]'
        ));
    }

    let digest = parts.join('\n');
    if (digest.length > MAX_DIGEST_CHARS) {
        const note = focus
            ? '\n\n[digest truncated — this workbook is large; ask about a specific item by name]'
            : '\n\n[digest truncated — use /borders, /calcs, or /fields to focus]';
        digest = digest.slice(0, MAX_DIGEST_CHARS) + note;
    }
    return digest;
}
