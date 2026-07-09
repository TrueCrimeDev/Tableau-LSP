import { resolveNames } from '../extract/nameResolver.js';
import { scanFormattingXml } from '../parsers/formatStripper.js';

export type DigestFocus = 'borders' | 'calcs' | 'fields';

const MAX_DIGEST_CHARS = 12000;
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

interface StyleRuleSummary {
    element: string;
    formats: string[];
}

/** Lists the style-rules inside one <style> body. */
function summariseStyleBody(styleBody: string): StyleRuleSummary[] {
    const rules: StyleRuleSummary[] = [];
    const ruleRe = /<style-rule\s+[^>]*element=(['"])(.*?)\1[^>]*>([\s\S]*?)<\/style-rule>/g;
    let m: RegExpExecArray | null;
    while ((m = ruleRe.exec(styleBody)) !== null) {
        const formats: string[] = [];
        const fmtRe = /<format\s+([^>]*?)\/?>/g;
        let f: RegExpExecArray | null;
        while ((f = fmtRe.exec(m[3])) !== null) {
            const attrs = f[1];
            const attr = attrOf(attrs, 'attr');
            const value = attrOf(attrs, 'value');
            const scope = attrOf(attrs, 'scope');
            if (attr) {
                formats.push(`${attr}${scope ? ` (${scope})` : ''}=${value ?? '?'}`);
            }
        }
        rules.push({ element: m[2], formats });
    }
    return rules;
}

/** The worksheet's own table <style> — the region before panes/rows/cols. */
function worksheetTableStyle(worksheetXml: string): StyleRuleSummary[] {
    const table = worksheetXml.match(/<table\b[^>]*>[\s\S]*?<\/table>/)?.[0];
    if (!table) { return []; }
    const tailMatch = table.match(/<(?:panes|rows|cols)[\s>]/);
    const head = table.slice(0, tailMatch?.index ?? table.length);
    const style = head.match(/<style>([\s\S]*?)<\/style>/);
    return style ? summariseStyleBody(style[1]) : [];
}

interface WorksheetInfo {
    name: string;
    styleRules: StyleRuleSummary[];
}

function collectWorksheets(xml: string): WorksheetInfo[] {
    const sheets: WorksheetInfo[] = [];
    const wsRe = /<worksheet\b[^>]*>[\s\S]*?<\/worksheet>/g;
    let m: RegExpExecArray | null;
    while ((m = wsRe.exec(xml)) !== null) {
        const openTag = m[0].slice(0, m[0].indexOf('>') + 1);
        const name = attrOf(openTag, 'name') ?? '(unnamed)';
        sheets.push({ name, styleRules: worksheetTableStyle(m[0]) });
    }
    return sheets;
}

/** Workbook-level <style> lives before <worksheets>; FCP-mangled names count. */
function workbookLevelStyle(xml: string): StyleRuleSummary[] {
    const beforeSheets = xml.slice(0, xml.search(/<worksheets[\s>]/) >= 0 ? xml.search(/<worksheets[\s>]/) : xml.length);
    const style = beforeSheets.match(/<(_\.fcp\.[^>]*?\.)?style>([\s\S]*?)<\/(?:_\.fcp\.[^>]*?\.)?style>/);
    return style ? summariseStyleBody(style[2]) : [];
}

interface CalcInfo {
    caption: string;
    formula: string;
}

function collectCalculations(xml: string): CalcInfo[] {
    // resolveNames swaps [Calculation_x] references for their captions.
    let resolved: string;
    try {
        resolved = resolveNames(xml);
    } catch {
        resolved = xml;
    }
    const calcs: CalcInfo[] = [];
    // Self-closing alternative first, so a bare <column … /> can never swallow
    // the following column's body.
    const colRe = /<column\b[^>]*?\/>|<column\b([^>]*)>([\s\S]*?)<\/column>/g;
    let m: RegExpExecArray | null;
    while ((m = colRe.exec(resolved)) !== null) {
        if (m[1] === undefined) { continue; }
        const formulaTag = m[2].match(/<calculation\b[^>]*formula=(['"])([\s\S]*?)\1/);
        if (!formulaTag) { continue; }
        const caption = attrOf(m[1], 'caption') ?? attrOf(m[1], 'name') ?? '(unnamed)';
        calcs.push({ caption, formula: decodeEntities(formulaTag[2]) });
    }
    return calcs;
}

interface FieldInfo {
    caption: string;
    datatype: string;
    role: string;
}

function collectFields(xml: string): FieldInfo[] {
    const sheetsAt = xml.search(/<worksheets[\s>]/);
    const datasources = sheetsAt >= 0 ? xml.slice(0, sheetsAt) : xml;
    const fields: FieldInfo[] = [];
    const colRe = /<column\b([^>]*?)\/>|<column\b([^>]*)>([\s\S]*?)<\/column>/g;
    let m: RegExpExecArray | null;
    while ((m = colRe.exec(datasources)) !== null) {
        const attrs = m[1] ?? m[2] ?? '';
        const body = m[3] ?? '';
        if (/<calculation\b/.test(body)) { continue; }
        const caption = attrOf(attrs, 'caption');
        const datatype = attrOf(attrs, 'datatype');
        if (!caption || !datatype) { continue; }
        fields.push({ caption, datatype, role: attrOf(attrs, 'role') ?? '' });
    }
    return fields;
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
            name: attrOf(m[1], 'name') ?? '(unnamed)',
            width: attrOf(m[1], 'width') ?? '?',
            height: attrOf(m[1], 'height') ?? '?',
            approxKb: Math.round((base64Len * 3) / 4 / 1024),
        });
    }
    return thumbs;
}

function ruleLines(rules: StyleRuleSummary[], indent: string): string[] {
    return rules.map(r => `${indent}- style-rule ${r.element}: ${r.formats.length ? r.formats.join(', ') : '(empty)'}`);
}

export function buildWorkbookDigest(xml: string, focus?: DigestFocus): string {
    const parts: string[] = ['# Workbook digest'];
    const sheets = collectWorksheets(xml);

    if (!focus || focus === 'borders') {
        parts.push(`\n## Worksheets (${sheets.length})`);
        parts.push(...sheets.map(s => `- ${s.name}`));

        const wbStyle = workbookLevelStyle(xml);
        parts.push('\n## Workbook-level style');
        parts.push(...(wbStyle.length ? ruleLines(wbStyle, '') : ['(none — worksheets inherit Tableau defaults)']));

        parts.push('\n## Worksheet table styles');
        for (const s of sheets) {
            parts.push(`### ${s.name}`);
            parts.push(...(s.styleRules.length ? ruleLines(s.styleRules, '') : ['(no explicit style — inherits defaults)']));
        }

        const scan = scanFormattingXml(xml);
        parts.push('\n## Formatting scan (strippable overrides)');
        parts.push(`- borders: ${scan.borders.count}${scan.borders.values.length ? ` — ${scan.borders.values.join(', ')}` : ''}`);
        parts.push(`- bold: ${scan.bold.count}${scan.bold.values.length ? ` — ${scan.bold.values.join(', ')}` : ''}`);
        parts.push(`- font-size: ${scan.fontSize.count}${scan.fontSize.values.length ? ` — ${scan.fontSize.values.join(', ')}` : ''}`);
        parts.push(`- font-color: ${scan.fontColor.count}${scan.fontColor.values.length ? ` — ${scan.fontColor.values.join(', ')}` : ''}`);
    }

    if (!focus || focus === 'calcs') {
        const calcs = collectCalculations(xml);
        const cap = focus === 'calcs' ? calcs.length : MAX_CALCS_DEFAULT;
        const maxFormula = focus === 'calcs' ? Number.POSITIVE_INFINITY : MAX_FORMULA_CHARS_DEFAULT;
        parts.push(`\n## Calculations (${calcs.length})`);
        for (const c of calcs.slice(0, cap)) {
            const formula = c.formula.length > maxFormula
                ? c.formula.slice(0, MAX_FORMULA_CHARS_DEFAULT) + '…'
                : c.formula;
            parts.push(`- **${c.caption}**: \`${formula.replace(/\n/g, ' ')}\``);
        }
        if (calcs.length > cap) {
            parts.push(`- [${calcs.length - cap} more calculations omitted — use /calcs for the full list]`);
        }
    }

    if (!focus || focus === 'fields') {
        const fields = collectFields(xml);
        parts.push(`\n## Datasource fields (${fields.length})`);
        for (const f of fields.slice(0, MAX_FIELDS)) {
            parts.push(`- ${f.caption} (${f.datatype}${f.role ? `, ${f.role}` : ''})`);
        }
        if (fields.length > MAX_FIELDS) {
            parts.push(`- [${fields.length - MAX_FIELDS} more fields omitted]`);
        }
    }

    if (!focus) {
        const thumbs = collectThumbnails(xml);
        parts.push(`\n## Thumbnails (${thumbs.length})`);
        parts.push(...thumbs.map(t => `- ${t.name}: ${t.width}x${t.height}, ~${t.approxKb} KB PNG (base64, regenerated on save)`));
    }

    let digest = parts.join('\n');
    if (digest.length > MAX_DIGEST_CHARS) {
        digest = digest.slice(0, MAX_DIGEST_CHARS)
            + '\n\n[digest truncated at 12k chars — ask a focused question or use /borders, /calcs, /fields]';
    }
    return digest;
}
