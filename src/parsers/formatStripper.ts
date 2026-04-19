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
 * Bold, font-size, and font-color nodes are deleted entirely so sheets inherit
 * the application default.
 */
export function stripFormattingXml(xml: string, options: FormatStripOptions): string {
    let result = xml;

    if (options.borders) {
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
