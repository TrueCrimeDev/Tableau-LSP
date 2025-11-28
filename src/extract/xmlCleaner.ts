/**
 * XML Cleaner Module
 *
 * Preprocesses raw XML content to handle malformed or invalid XML that may appear
 * in Tableau workbook files. This ensures the XML parser can successfully parse
 * the content.
 */

/**
 * Cleans XML content by removing invalid characters and fixing common XML issues.
 *
 * Performs the following operations:
 * 1. Removes invalid XML control characters (e.g., \x00-\x08, \x0B, \x0C, \x0E-\x1F, \x7F)
 * 2. Fixes unescaped ampersands (& -> &amp;) except when already part of a valid entity
 * 3. Removes XML declaration if present (to avoid issues with string replacements later)
 *
 * @param xml - The raw XML content to clean
 * @returns Cleaned XML content safe for parsing
 */
export function cleanXmlContent(xml: string): string {
    // 1. Remove invalid XML control characters
    // Valid XML chars: https://www.w3.org/TR/xml/#charsets
    // Allowed: \x09 (tab), \x0A (LF), \x0D (CR), and \x20-\uD7FF, \uE000-\uFFFD
    // Removing: \x00-\x08, \x0B, \x0C, \x0E-\x1F, \x7F
    const invalidChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
    let cleaned = xml.replace(invalidChars, '');

    // 2. Fix unescaped ampersands
    // Pattern: & not followed by (word chars + ; OR #digits; OR #xhex;)
    // This preserves valid XML entities like &amp; &lt; &gt; &quot; &apos; &#123; &#xAB;
    cleaned = cleaned.replace(/&(?!(?:[a-zA-Z]+|#\d+|#x[\da-fA-F]+);)/g, '&amp;');

    // 3. Remove XML declaration if present
    // The Python script removes this to avoid issues during string replacements
    // Format: <?xml version="1.0" encoding="UTF-8"?>
    if (cleaned.startsWith('<?xml')) {
        const endOfDeclaration = cleaned.indexOf('?>');
        if (endOfDeclaration !== -1) {
            cleaned = cleaned.substring(endOfDeclaration + 2).trimStart();
        }
    }

    return cleaned;
}

/**
 * Statistics about XML cleaning operations (useful for debugging/logging)
 */
export interface CleaningStats {
    invalidCharsRemoved: number;
    ampersandsFixed: number;
    declarationRemoved: boolean;
}

/**
 * Cleans XML content and returns both the cleaned content and statistics.
 *
 * @param xml - The raw XML content to clean
 * @returns Object containing cleaned XML and statistics
 */
export function cleanXmlContentWithStats(xml: string): { cleaned: string; stats: CleaningStats } {
    const stats: CleaningStats = {
        invalidCharsRemoved: 0,
        ampersandsFixed: 0,
        declarationRemoved: false
    };

    // Count invalid chars before removal
    const invalidChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
    const invalidMatches = xml.match(invalidChars);
    stats.invalidCharsRemoved = invalidMatches ? invalidMatches.length : 0;

    let cleaned = xml.replace(invalidChars, '');

    // Count unescaped ampersands before fixing
    const unescapedAmpersands = /&(?!(?:[a-zA-Z]+|#\d+|#x[\da-fA-F]+);)/g;
    const ampersandMatches = cleaned.match(unescapedAmpersands);
    stats.ampersandsFixed = ampersandMatches ? ampersandMatches.length : 0;

    cleaned = cleaned.replace(unescapedAmpersands, '&amp;');

    // Check and remove XML declaration
    if (cleaned.startsWith('<?xml')) {
        const endOfDeclaration = cleaned.indexOf('?>');
        if (endOfDeclaration !== -1) {
            cleaned = cleaned.substring(endOfDeclaration + 2).trimStart();
            stats.declarationRemoved = true;
        }
    }

    return { cleaned, stats };
}
