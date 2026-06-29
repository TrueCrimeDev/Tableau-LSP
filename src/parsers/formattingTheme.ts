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

// ── Tableau-native → panel-vocabulary read mapping ───────────────────────────
// A real .twb stores borders/dividers/shading under Tableau's own element and
// attribute names (table-div, header-div, stroke-*, border-*, band-color) and
// distinguishes rows vs columns via a `scope` attribute on each <format>. The
// panel/sidebar use an idealized vocabulary (row-divider, column-divider,
// line-*, *-banding). These rules translate the former into the latter so real
// workbooks actually populate the fields.

type ReadScope = 'rows' | 'cols' | 'any';
interface ReadRule {
    from: string;                  // Tableau style-rule element
    scope?: ReadScope;             // only match <format> with this scope ('any'/omitted = ignore scope)
    to: string;                    // panel element
    attrs: Record<string, string>; // Tableau attr -> panel attr
}

// Line/divider attributes. Identity entries (line-color -> line-color) keep the
// panel's own exported vocabulary readable too, so round-tripping still works.
const LINE_ATTRS: Record<string, string> = {
    'stroke-color': 'line-color', 'line-color': 'line-color',
    'stroke-size': 'line-width', 'line-width': 'line-width',
    'line-pattern-only': 'line-pattern', 'line-pattern': 'line-pattern',
    'line-visibility': 'line-visibility',
};
// Cell/table border attributes mapped onto the panel's line vocabulary.
const BORDER_AS_LINE: Record<string, string> = {
    'border-color': 'line-color',
    'border-width': 'line-width',
    'border-style': 'line-pattern',
};
// Font/text attributes (`color` is Tableau's text colour).
const FONT_ATTRS: Record<string, string> = {
    'color': 'font-color', 'font-color': 'font-color',
    'font-family': 'font-family',
    'font-size': 'font-size',
    'font-weight': 'font-weight',
    'background-color': 'background-color',
};
// Shading: Tableau row/column banding lives in `band-color`.
const SHADE_ATTRS: Record<string, string> = { 'band-color': 'background-color', 'background-color': 'background-color' };

const READ_RULES: ReadRule[] = [
    // Fonts / text
    { from: 'all', to: 'all', attrs: FONT_ATTRS },
    { from: 'worksheet', to: 'worksheet', attrs: FONT_ATTRS },
    { from: 'title', to: 'worksheet-title', attrs: FONT_ATTRS },
    { from: 'tooltip', to: 'tooltip', attrs: FONT_ATTRS },
    { from: 'dash-title', to: 'dashboard-title', attrs: FONT_ATTRS },
    { from: 'story-title', to: 'story-title', attrs: FONT_ATTRS },
    { from: 'header', to: 'header', attrs: FONT_ATTRS },
    { from: 'legend', to: 'legend', attrs: FONT_ATTRS },
    // Marks
    { from: 'mark', to: 'mark', attrs: { 'mark-color': 'mark-color', 'color': 'mark-color' } },
    // Lines
    { from: 'gridline', to: 'gridline', attrs: LINE_ATTRS },
    { from: 'zeroline', to: 'zeroline', attrs: LINE_ATTRS },
    // Dividers — Tableau encodes rows vs columns via scope
    { from: 'table-div',  scope: 'rows', to: 'row-divider',    attrs: LINE_ATTRS },
    { from: 'table-div',  scope: 'cols', to: 'column-divider', attrs: LINE_ATTRS },
    { from: 'header-div', scope: 'rows', to: 'row-divider',    attrs: LINE_ATTRS },
    { from: 'header-div', scope: 'cols', to: 'column-divider', attrs: LINE_ATTRS },
    // Table border (pane outline)
    { from: 'pane', to: 'table-border', attrs: BORDER_AS_LINE },
    // Shading / banding
    { from: 'pane',   scope: 'rows', to: 'inner-row-banding',    attrs: SHADE_ATTRS },
    { from: 'pane',   scope: 'cols', to: 'inner-column-banding', attrs: SHADE_ATTRS },
    { from: 'header', scope: 'rows', to: 'outer-row-banding',    attrs: SHADE_ATTRS },
    { from: 'header', scope: 'cols', to: 'outer-column-banding', attrs: SHADE_ATTRS },
    { from: 'pane', to: 'pane', attrs: { 'background-color': 'background-color' } },
    { from: 'view', to: 'view', attrs: { 'background-color': 'background-color' } },
];

export function readThemeFromXml(xml: string): WorkbookTheme {
    const theme: WorkbookTheme = {};
    const set = (el: string, attr: string, value: string): void => {
        if (!theme[el]) { theme[el] = {}; }
        // first write wins: the top-most (workbook-level) <style> block takes priority
        if (theme[el][attr] === undefined || theme[el][attr] === null) { theme[el][attr] = value; }
    };

    const blockRe = /<style-rule[^>]*element=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/style-rule>/g;
    let bm: RegExpExecArray | null;
    while ((bm = blockRe.exec(xml)) !== null) {
        const srcEl = bm[1];
        const body = bm[2];
        const fmtRe = /<format\b([^>]*)>/g;
        let fm: RegExpExecArray | null;
        while ((fm = fmtRe.exec(body)) !== null) {
            const node = fm[1];
            const aM = /\battr=['"]([^'"]+)['"]/.exec(node);
            const vM = /\bvalue=['"]([^'"]*)['"]/.exec(node);
            if (!aM || !vM) { continue; }
            const attr = aM[1];
            const value = vM[1];
            const sM = /\bscope=['"]([^'"]+)['"]/.exec(node);
            const scope = sM ? sM[1] : '';

            // 1) Identity: element already uses the panel vocabulary — keep known attrs.
            if (KNOWN_ELEMENTS[srcEl]?.includes(attr)) { set(srcEl, attr, value); }

            // 2) Tableau-native translation.
            for (const rule of READ_RULES) {
                if (rule.from !== srcEl) { continue; }
                if (rule.scope && rule.scope !== 'any' && rule.scope !== scope) { continue; }
                const panelAttr = rule.attrs[attr];
                if (panelAttr) { set(rule.to, panelAttr, value); }
            }
        }
    }

    for (const el of Object.keys(theme)) {
        if (Object.keys(theme[el]).length === 0) { delete theme[el]; }
    }
    return theme;
}

// ── Panel-vocabulary → Tableau-native write mapping ──────────────────────────
// Inverse of READ_RULES: when the user edits a panel field, translate it back to
// the element/attr/scope names Tableau actually stores, so edits survive a reload
// and stay valid for Tableau Desktop. Elements without a rule are written as-is
// (fonts already round-trip through the identity entries in READ_RULES).

interface WriteRule { to: string; scope?: 'rows' | 'cols'; attrs: Record<string, string>; }

const STROKE_FROM_LINE: Record<string, string> = {
    'line-color': 'stroke-color',
    'line-width': 'stroke-size',
    'line-pattern': 'line-pattern-only',
    'line-visibility': 'line-visibility',
};
const BORDER_FROM_LINE: Record<string, string> = {
    'line-color': 'border-color',
    'line-width': 'border-width',
    'line-pattern': 'border-style',
    'line-visibility': 'line-visibility',
};
const BAND_FROM_BG: Record<string, string> = { 'background-color': 'band-color' };

const WRITE_RULES: Record<string, WriteRule> = {
    'gridline':             { to: 'gridline',   attrs: STROKE_FROM_LINE },
    'zeroline':             { to: 'zeroline',   attrs: STROKE_FROM_LINE },
    'row-divider':          { to: 'table-div',  scope: 'rows', attrs: STROKE_FROM_LINE },
    'column-divider':       { to: 'table-div',  scope: 'cols', attrs: STROKE_FROM_LINE },
    'table-border':         { to: 'pane',       attrs: BORDER_FROM_LINE },
    'inner-row-banding':    { to: 'pane',       scope: 'rows', attrs: BAND_FROM_BG },
    'inner-column-banding': { to: 'pane',       scope: 'cols', attrs: BAND_FROM_BG },
    'outer-row-banding':    { to: 'header',     scope: 'rows', attrs: BAND_FROM_BG },
    'outer-column-banding': { to: 'header',     scope: 'cols', attrs: BAND_FROM_BG },
    'worksheet-title':      { to: 'title',      attrs: {} },
    'dashboard-title':      { to: 'dash-title', attrs: {} },
};

function resolveWriteTarget(element: string, attr: string): { element: string; attr: string; scope?: 'rows' | 'cols' } {
    const rule = WRITE_RULES[element];
    if (!rule) { return { element, attr }; }
    return { element: rule.to, attr: rule.attrs[attr] ?? attr, scope: rule.scope };
}

// Match a <format> by attr. A scoped target matches the same scope; an unscoped
// target matches the first <format> with that attr regardless of scope, which
// mirrors readThemeFromXml's first-write-wins so reads and writes stay aligned.
function formatNodeRe(attr: string, scope?: 'rows' | 'cols'): RegExp {
    const attrLA = `(?=[^>]*\\battr=['"]${escapeRegex(attr)}['"])`;
    const scopeLA = scope ? `(?=[^>]*\\bscope=['"]${scope}['"])` : '';
    return new RegExp(`[ \\t]*<format\\b${attrLA}${scopeLA}[^>]*\\/>[\\r\\n]?`);
}

function applyOneEdit(xml: string, panelElement: string, panelAttr: string, value: string | null): string {
    const { element, attr, scope } = resolveWriteTarget(panelElement, panelAttr);
    const scopeAttr = scope ? ` scope='${scope}'` : '';
    const blockRe = new RegExp(
        `(<style-rule[^>]*element=['"]${escapeRegex(element)}['"][^>]*>)([\\s\\S]*?)(<\\/style-rule>)`
    );
    const blockMatch = xml.match(blockRe);

    if (!blockMatch) {
        if (value === null) { return xml; }
        const newBlock = `    <style-rule element='${element}'>\n        <format attr='${attr}'${scopeAttr} value='${value}' />\n    </style-rule>\n`;
        return xml.includes('</workbook>')
            ? xml.replace('</workbook>', newBlock + '</workbook>')
            : xml + '\n' + newBlock;
    }

    const [, , inner] = blockMatch;
    const nodeRe = formatNodeRe(attr, scope);

    if (value === null) {
        return xml.replace(blockRe, `$1${inner.replace(nodeRe, '')}$3`);
    }

    if (nodeRe.test(inner)) {
        const updatedInner = inner.replace(nodeRe, (node) =>
            node.replace(/value=['"][^'"]*['"]/, `value='${value}'`)
        );
        return xml.replace(blockRe, `$1${updatedInner}$3`);
    }

    const newInner = inner.trimEnd() + `\n        <format attr='${attr}'${scopeAttr} value='${value}' />\n    `;
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

export function getXmlElementName(panelElement: string): string {
    return WRITE_RULES[panelElement]?.to ?? panelElement;
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
