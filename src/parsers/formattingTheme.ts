export interface StyleElementValues {
    [attr: string]: string | null;
}

export interface WorkbookTheme {
    [element: string]: StyleElementValues;
}

export const KNOWN_ELEMENTS: Record<string, string[]> = {
    'all':                   ['font-color', 'font-family'],
    'worksheet':             ['font-color', 'font-family', 'font-size'],
    'worksheet-title':       ['font-color', 'font-family', 'font-size'],
    'tooltip':               ['font-color', 'font-family', 'font-size'],
    'dashboard-title':       ['font-color', 'font-family', 'font-size', 'font-weight'],
    'story-title':           ['font-color', 'font-family', 'font-size'],
    'header':                ['font-color', 'font-family', 'background-color'],
    'legend':                ['font-color', 'font-family', 'font-size', 'background-color'],
    'legend-title':          ['font-color', 'font-family', 'font-size'],
    'filter':                ['font-color', 'font-family', 'font-size', 'background-color'],
    'filter-title':          ['font-color', 'font-family', 'font-size'],
    'parameter-ctrl':        ['font-color', 'font-family', 'font-size', 'background-color'],
    'parameter-ctrl-title':  ['font-color', 'font-family', 'font-size'],
    'highlighter':           ['font-color', 'font-family', 'font-size', 'background-color'],
    'highlighter-title':     ['font-color', 'font-family', 'font-size'],
    'page-ctrl-title':       ['font-color', 'font-family', 'font-size'],
    'gridline':              ['line-visibility', 'line-pattern', 'line-width', 'line-color'],
    'zeroline':              ['line-visibility', 'line-pattern', 'line-width', 'line-color'],
    'row-divider':           ['line-visibility', 'line-pattern', 'line-width', 'line-color'],
    'column-divider':        ['line-visibility', 'line-pattern', 'line-width', 'line-color'],
    'table-border':          ['line-visibility', 'line-pattern', 'line-width', 'line-color'],
    'mark':                  ['mark-color'],
    'view':                  ['background-color'],
    'pane':                  ['background-color'],
    'inner-row-banding':     ['background-color'],
    'outer-row-banding':     ['background-color'],
    'inner-column-banding':  ['background-color'],
    'outer-column-banding':  ['background-color'],
};

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function readThemeFromXml(xml: string): WorkbookTheme {
    const theme: WorkbookTheme = {};
    for (const element of Object.keys(KNOWN_ELEMENTS)) {
        const blockRe = new RegExp(
            `<style-rule[^>]*element=['"]${escapeRegex(element)}['"][^>]*>([\\s\\S]*?)<\\/style-rule>`
        );
        const blockMatch = xml.match(blockRe);
        if (!blockMatch) { continue; }
        const block = blockMatch[1];
        const attrs: StyleElementValues = {};
        const attrRe = /<format\s[^>]*attr=['"]([^'"]+)['"][^>]*value=['"]([^'"]*)['"]/g;
        let m: RegExpExecArray | null;
        while ((m = attrRe.exec(block)) !== null) {
            attrs[m[1]] = m[2];
        }
        if (Object.keys(attrs).length > 0) {
            theme[element] = attrs;
        }
    }
    return theme;
}

function applyOneEdit(xml: string, element: string, attr: string, value: string | null): string {
    const blockRe = new RegExp(
        `(<style-rule[^>]*element=['"]${escapeRegex(element)}['"][^>]*>)([\\s\\S]*?)(<\\/style-rule>)`
    );
    const blockMatch = xml.match(blockRe);

    if (!blockMatch) {
        if (value === null) { return xml; }
        const newBlock = `    <style-rule element='${element}'>\n        <format attr='${attr}' value='${value}' />\n    </style-rule>\n`;
        return xml.includes('</workbook>')
            ? xml.replace('</workbook>', newBlock + '</workbook>')
            : xml + '\n' + newBlock;
    }

    const [, , inner] = blockMatch;
    const nodeRe = new RegExp(`[ \\t]*<format[^>]*attr=['"]${escapeRegex(attr)}['"][^>]*\\/>[\\r\\n]?`);

    if (value === null) {
        return xml.replace(blockRe, `$1${inner.replace(nodeRe, '')}$3`);
    }

    if (nodeRe.test(inner)) {
        const updatedInner = inner.replace(
            new RegExp(`(<format[^>]*attr=['"]${escapeRegex(attr)}['"][^>]*)value=['"][^'"]*['"]`),
            `$1value='${value}'`
        );
        return xml.replace(blockRe, `$1${updatedInner}$3`);
    }

    const newInner = inner.trimEnd() + `\n        <format attr='${attr}' value='${value}' />\n    `;
    return xml.replace(blockRe, `$1${newInner}$3`);
}

export function applyThemeEditsToXml(xml: string, edits: WorkbookTheme): string {
    let result = xml;
    for (const [element, attrs] of Object.entries(edits)) {
        for (const [attr, value] of Object.entries(attrs)) {
            result = applyOneEdit(result, element, attr, value);
        }
    }
    return result;
}

const INTEGER_ATTRS = new Set(['font-size', 'line-width']);
const HEX_ATTRS = new Set(['font-color', 'background-color', 'line-color', 'mark-color']);
const HEX_RE = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
const VALID_BASE_THEMES = ['smooth', 'clean', 'modern', 'classic'];

export function xmlToThemeJson(xml: string): object {
    const theme = readThemeFromXml(xml);
    const styles: Record<string, Record<string, string | number>> = {};
    for (const [element, attrs] of Object.entries(theme)) {
        const row: Record<string, string | number> = {};
        for (const [attr, value] of Object.entries(attrs)) {
            if (value === null) { continue; }
            row[attr] = INTEGER_ATTRS.has(attr) ? Number(value) : value;
        }
        if (Object.keys(row).length > 0) {
            styles[element] = row;
        }
    }
    return { version: '1.0.0', 'base-theme': 'smooth', styles };
}

export function validateThemeJson(theme: unknown): string | null {
    if (typeof theme !== 'object' || theme === null) { return 'Theme must be a JSON object'; }
    const t = theme as Record<string, unknown>;
    if (t['version'] !== '1.0.0') { return 'version must be "1.0.0"'; }
    if (!VALID_BASE_THEMES.includes(t['base-theme'] as string)) {
        return `base-theme must be one of: ${VALID_BASE_THEMES.join(', ')}`;
    }
    if (t['styles'] && typeof t['styles'] === 'object') {
        for (const [elem, attrs] of Object.entries(t['styles'] as object)) {
            if (!(elem in KNOWN_ELEMENTS)) { return `Unknown style element: "${elem}"`; }
            for (const [attr, val] of Object.entries(attrs as object)) {
                if (!KNOWN_ELEMENTS[elem].includes(attr)) {
                    return `"${attr}" is not a valid attribute for "${elem}"`;
                }
                if (INTEGER_ATTRS.has(attr) && !Number.isInteger(val)) {
                    return `"${attr}" must be an integer`;
                }
                if (HEX_ATTRS.has(attr) && (typeof val !== 'string' || !HEX_RE.test(val))) {
                    return `"${attr}" must be a hex color like #FF0000`;
                }
            }
        }
    }
    return null;
}

export function applyThemeJsonToXml(
    xml: string,
    theme: object,
    mode: 'override' | 'preserve'
): string {
    const t = theme as { styles?: Record<string, Record<string, string | number>> };
    if (!t.styles) { return xml; }

    const current = mode === 'preserve' ? readThemeFromXml(xml) : {};
    let result = xml;

    for (const [element, attrs] of Object.entries(t.styles)) {
        for (const [attr, value] of Object.entries(attrs)) {
            if (mode === 'preserve' && current[element]?.[attr] != null) { continue; }
            result = applyOneEdit(result, element, attr, String(value));
        }
    }
    return result;
}
