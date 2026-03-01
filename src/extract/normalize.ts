// Normalization & filtering utilities - Python-style implementation
import { ExtractedCalculation } from './types.js';

// Complete list of 66 Tableau keywords (matching Python script)
const KEYWORDS = [
    // Math functions
    "ABS", "ACOS", "ASIN", "ATAN", "ATAN2", "CEILING", "COS", "COT", "DEGREES", "DIV", "EXP",
    "FLOOR", "SQUARE", "ZN",
    // String functions
    "LOWER", "UPPER", "ASCII", "CHAR", "CONTAINS", "ENDSWITH", "FIND",
    "LEFT", "RIGHT", "LEN", "TRIM", "LTRIM", "MAX", "MID", "REPLACE", "RTRIM", "SPACE", "SPLIT",
    "STARTSWITH",
    // User functions
    "USERNAME", "ISUSERNAME", "ISMEMBEROF", "USERDOMAIN", "FULLNAME", "ISFULLNAME",
    // Control flow
    "IF", "ELSE", "ELSEIF", "CASE", "AND", "OR", "NOT", "THEN", "WHEN", "END",
    // Aggregate functions
    "VAR", "VARP", "SUM", "STDEV", "STDEVP", "PERCENTILE", "MIN", "MEDIAN", "MAX",
    "COVARP", "COUNT", "COUNTD", "CORR", "COLLECT", "AVG", "ATTR",
    // Spatial functions
    "DISTANCE", "MAKELINE", "MAKEPOINT"
];

// Sort keywords by descending length to avoid substring replacement issues
// (e.g., ensure "ELSEIF" is replaced before "ELSE")
const SORTED_KEYWORDS = [...KEYWORDS].sort((a, b) => b.length - a.length);

/**
 * Normalizes formulas by uppercasing keywords and condensing whitespace
 */
export function normalize(calcs: ExtractedCalculation[]): ExtractedCalculation[] {
    return calcs.map(c => ({
        ...c,
        formula: uppercaseKeywords(normalizeFormula(c.formula))
    }));
}

/**
 * Filters trivial calculations and removes duplicates (case-insensitive)
 */
export function filterAndDedupe(calcs: ExtractedCalculation[]): ExtractedCalculation[] {
    const seen = new Map<string, string>();
    const out: ExtractedCalculation[] = [];

    for (const c of calcs) {
        // Normalize for comparison (case-insensitive deduplication)
        const normalized = normalizeFormula(c.formula);
        const key = normalized.toLowerCase();

        // Skip trivial calculations
        if (isTrivial(c.formula)) {
            continue;
        }

        // Skip duplicates
        if (!seen.has(key)) {
            seen.set(key, c.title);
            out.push(c);
        }
    }

    return out;
}

/**
 * Checks if a formula is trivial (should be filtered out)
 * Trivial formulas are:
 * - Pure quoted strings (e.g., "All Cases")
 * - Single field references (e.g., [Name])
 * - Single integers, including negative (e.g., 10, -5)
 */
function isTrivial(f: string): boolean {
    const t = f.trim();
    if (!t) return true;

    // Pure quoted string
    if (/^"[^"]*"$/.test(t)) return true;

    // Single integer (including negative)
    if (/^-?\d+$/.test(t)) return true;

    // Single field reference
    if (/^\[[^\]]+\]$/.test(t)) return true;

    return false;
}

/**
 * Normalizes formula whitespace exactly like Python:
 * - Decodes XML character references for CR/LF (Tableau encodes newlines as &#13;&#10; in attribute values)
 * - Strips whitespace from each line
 * - Removes blank lines completely
 * - Joins non-empty lines with single newline
 */
export function normalizeFormula(formula: string): string {
    // Decode XML numeric character references that Tableau uses for newlines inside attribute values
    const decoded = formula
        .replace(/&#13;/g, '\r')
        .replace(/&#10;/g, '\n')
        .replace(/&#xD;/gi, '\r')
        .replace(/&#xA;/gi, '\n');
    const lines = decoded.split(/\r?\n/);
    const nonEmptyLines = lines.map(l => l.trim()).filter(l => l !== '');
    return nonEmptyLines.join('\n');
}

/**
 * Uppercases Tableau keywords (case-insensitive, whole-word replacement)
 * Uses sorted keywords (longest first) to avoid substring issues
 */
export function uppercaseKeywords(formula: string): string {
    let result = formula;

    for (const keyword of SORTED_KEYWORDS) {
        // Word boundary pattern ensures whole-word matching
        const pattern = new RegExp(`\\b${keyword}\\b`, 'gi');
        result = result.replace(pattern, keyword);
    }

    return result;
}
