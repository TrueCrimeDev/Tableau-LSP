export interface FormatStripOptions {
    borders: boolean;
    bold: boolean;
    fontSize: boolean;
    fontColor: boolean;
}

/**
 * Strips formatting overrides from raw Tableau .twb XML.
 *
 * Borders are neutralised (set to none/0) rather than removed because Tableau
 * requires explicit none/0 nodes to suppress inherited workbook-level borders.
 * Worksheets carrying no explicit border nodes get neutralising nodes inserted
 * (see suppressInheritedBorders) — otherwise their default borders survive.
 * Bold, font-size, and font-color nodes are deleted entirely so sheets inherit
 * the application default.
 */
export function stripFormattingXml(xml: string, options: FormatStripOptions): string {
    let result = xml;

    if (options.borders) {
        result = suppressInheritedBorders(result);
        // Set border-style → 'none'
        result = result.replace(
            /(<format\s[^>]*attr=['"]border-style['"][^>]*)value=['"][^'"]*['"]/g,
            "$1value='none'"
        );
        // Set border-width → '0'
        result = result.replace(
            /(<format\s[^>]*attr=['"]border-width['"][^>]*)value=['"][^'"]*['"]/g,
            "$1value='0'"
        );
        // Remove border-color lines entirely (leading indent + trailing newline)
        result = result.replace(
            /[ \t]*<format\s[^>]*attr=['"]border-color['"][^>]*\/>\r?\n?/g,
            ''
        );
        // Set div-level → '0' to disable table row/col divider lines.
        // These live in <style-rule element='table-div'> and are separate from
        // border-* attrs but produce the same visible dividing lines in crosstabs.
        result = result.replace(
            /(<format\s[^>]*attr=['"]div-level['"][^>]*)value=['"][^'"]*['"]/g,
            "$1value='0'"
        );
        // Set stroke-color to 'none' for row/col scopes (table divider line color).
        // Limiting to scope='rows'/'cols' avoids touching axis/gridline stroke-color.
        // We SET rather than remove so Tableau doesn't fall back to a default color.
        result = result.replace(
            /(<format\s[^>]*attr=['"]stroke-color['"][^>]*scope=['"](?:rows|cols)['"][^>]*)value=['"][^'"]*['"]/g,
            "$1value='none'"
        );
        result = result.replace(
            /(<format\s[^>]*scope=['"](?:rows|cols)['"][^>]*attr=['"]stroke-color['"][^>]*)value=['"][^'"]*['"]/g,
            "$1value='none'"
        );
        // Third attribute order: attr … value … scope
        result = result.replace(
            /(<format\s[^>]*attr=['"]stroke-color['"][^>]*)value=['"][^'"]*['"]([^>]*scope=['"](?:rows|cols)['"])/g,
            "$1value='none'$2"
        );
        // Remove non-self-closing border-color nodes (<format ...></format>)
        result = result.replace(
            /[ \t]*<format\s[^>]*attr=['"]border-color['"][^>]*>\s*<\/format>\r?\n?/g,
            ''
        );
    }

    if (options.bold) {
        result = result.replace(
            /[ \t]*<format\s[^>]*attr=['"]font-bold['"][^>]*\/>\r?\n?/g,
            ''
        );
    }

    if (options.fontSize) {
        result = result.replace(
            /[ \t]*<format\s[^>]*attr=['"]font-size['"][^>]*\/>\r?\n?/g,
            ''
        );
    }

    if (options.fontColor) {
        result = result.replace(
            /[ \t]*<format\s[^>]*attr=['"]font-color['"][^>]*\/>\r?\n?/g,
            ''
        );
        // attr='color' on <format> nodes (distinct from <color> palette entries
        // and <color column='...'> field encoding — those use a different tag name)
        result = result.replace(
            /[ \t]*<format\s[^>]*attr=['"]color['"][^>]*\/>\r?\n?/g,
            ''
        );
    }

    return result;
}

interface RequiredFormat {
    present: RegExp;
    node: string;
}

interface RequiredRule {
    element: string;
    formats: RequiredFormat[];
}

const REQUIRED_BORDER_RULES: RequiredRule[] = [
    {
        element: 'cell',
        formats: [
            { present: /attr=['"]border-style['"]/, node: "<format attr='border-style' value='none' />" },
        ],
    },
    {
        element: 'header',
        formats: [
            { present: /attr=['"]border-style['"]/, node: "<format attr='border-style' value='none' />" },
        ],
    },
    {
        element: 'pane',
        formats: [
            { present: /attr=['"]border-style['"]/, node: "<format attr='border-style' value='none' />" },
            { present: /attr=['"]border-width['"]/, node: "<format attr='border-width' value='0' />" },
        ],
    },
    {
        element: 'table-div',
        formats: [
            {
                present: /attr=['"]div-level['"][^>]*scope=['"]cols['"]|scope=['"]cols['"][^>]*attr=['"]div-level['"]/,
                node: "<format attr='div-level' scope='cols' value='0' />",
            },
            {
                present: /attr=['"]div-level['"][^>]*scope=['"]rows['"]|scope=['"]rows['"][^>]*attr=['"]div-level['"]/,
                node: "<format attr='div-level' scope='rows' value='0' />",
            },
        ],
    },
];

/**
 * Ensures every worksheet's <table><style> carries explicit border-suppressing
 * nodes. Tableau only writes <format attr='border-*'> when a setting differs
 * from the default, so a sheet on default borders has nothing for the strip
 * regexes to rewrite — its borders would survive. Inserting explicit none/0
 * nodes overrides the inherited/default styling.
 */
export function suppressInheritedBorders(xml: string): string {
    const eol = xml.includes('\r\n') ? '\r\n' : '\n';
    return xml.replace(/<worksheet\b[^>]*>[\s\S]*?<\/worksheet>/g, worksheet =>
        worksheet.replace(/<table\b[^>]*>[\s\S]*?<\/table>/, table =>
            ensureTableStyle(table, eol)
        )
    );
}

function ensureTableStyle(table: string, eol: string): string {
    // The table's own <style> precedes <panes>/<rows>/<cols>; restrict the
    // search there so pane-level <style> blocks are never mistaken for it.
    const tailMatch = table.match(/[ \t]*<(?:panes|rows|cols)[\s>]/);
    const tailStart = tailMatch?.index ?? table.lastIndexOf('</table>');
    const head = table.slice(0, tailStart);
    const tail = table.slice(tailStart);

    const styleMatch = head.match(/([ \t]*)<style>([\s\S]*?)<\/style>/);
    if (styleMatch && styleMatch.index !== undefined) {
        const indent = styleMatch[1];
        const updatedBody = ensureStyleRules(styleMatch[2], indent, eol);
        const updatedStyle = `${indent}<style>${updatedBody}${indent}</style>`;
        return head.slice(0, styleMatch.index) + updatedStyle
            + head.slice(styleMatch.index + styleMatch[0].length) + tail;
    }

    // Self-closing or missing <style>: build a full block from scratch.
    const indent = tailMatch ? (tail.match(/^[ \t]*/)?.[0] ?? '        ') : '        ';
    const body = ensureStyleRules(eol, indent, eol);
    const block = `${indent}<style>${body}${indent}</style>${eol}`;
    const selfClosing = head.match(/[ \t]*<style\s*\/>\r?\n?/);
    if (selfClosing && selfClosing.index !== undefined) {
        return head.slice(0, selfClosing.index) + block
            + head.slice(selfClosing.index + selfClosing[0].length) + tail;
    }
    return head + block + tail;
}

function ensureStyleRules(styleBody: string, styleIndent: string, eol: string): string {
    const ruleIndent = styleIndent + '  ';
    const formatIndent = styleIndent + '    ';
    let body = styleBody;

    for (const rule of REQUIRED_BORDER_RULES) {
        const ruleRe = new RegExp(
            `([ \\t]*)<style-rule\\s+element=['"]${rule.element}['"]\\s*>([\\s\\S]*?)</style-rule>`
        );
        const existing = body.match(ruleRe);
        if (existing && existing.index !== undefined) {
            let ruleBody = existing[2];
            const innerIndent = existing[1] + '  ';
            for (const fmt of rule.formats) {
                if (!fmt.present.test(ruleBody)) {
                    const rest = ruleBody.replace(/^\r?\n/, '');
                    ruleBody = `${eol}${innerIndent}${fmt.node}${eol}${rest}`;
                }
            }
            body = body.slice(0, existing.index)
                + `${existing[1]}<style-rule element='${rule.element}'>${ruleBody}</style-rule>`
                + body.slice(existing.index + existing[0].length);
        } else {
            const nodes = rule.formats
                .map(f => `${formatIndent}${f.node}`)
                .join(eol);
            const block = `${ruleIndent}<style-rule element='${rule.element}'>${eol}${nodes}${eol}${ruleIndent}</style-rule>${eol}`;
            const trimmed = body.replace(/[ \t]+$/, '');
            body = trimmed.endsWith(eol) || trimmed === '' ? trimmed + block : trimmed + eol + block;
        }
    }
    return body;
}

export interface FormatCategoryScan {
    count: number;
    values: string[];
}

export interface FormatScanResult {
    borders:   FormatCategoryScan;
    bold:      FormatCategoryScan;
    fontSize:  FormatCategoryScan;
    fontColor: FormatCategoryScan;
}

export function scanFormattingXml(xml: string): FormatScanResult {
    function collect(patterns: RegExp[]): FormatCategoryScan {
        const found: string[] = [];
        for (const pat of patterns) {
            let m: RegExpExecArray | null;
            const re = new RegExp(pat.source, 'g');
            while ((m = re.exec(xml)) !== null) {
                const val = m[1];
                if (val !== undefined) { found.push(val); }
            }
        }
        const unique = [...new Set(found)].sort();
        return { count: found.length, values: unique };
    }

    return {
        borders: collect([
            /attr=['"]border-style['"][^>]*value=['"]([^'"]*)['"]/,
            /attr=['"]border-width['"][^>]*value=['"]([^'"]*)['"]/,
            /attr=['"]border-color['"][^>]*value=['"]([^'"]*)['"]/,
            /attr=['"]div-level['"][^>]*value=['"]([^'"]*)['"]/,
            /attr=['"]stroke-color['"][^>]*scope=['"](?:rows|cols)['"][^>]*value=['"]([^'"]*)['"]/,
            /attr=['"]stroke-color['"][^>]*value=['"]([^'"]*)['"][^>]*scope=['"](?:rows|cols)['"]/,
        ]),
        bold: collect([
            /attr=['"]font-bold['"][^>]*value=['"]([^'"]*)['"]/,
        ]),
        fontSize: collect([
            /attr=['"]font-size['"][^>]*value=['"]([^'"]*)['"]/,
        ]),
        fontColor: collect([
            /attr=['"]font-color['"][^>]*value=['"]([^'"]*)['"]/,
            /<format\s[^>]*attr=['"]color['"][^>]*value=['"]([^'"]*)['"]/,
        ]),
    };
}
