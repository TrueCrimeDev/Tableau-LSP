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
