// Basic normalization & filtering utilities (initial stub)
import { ExtractedCalculation } from './types';

const KEYWORDS = [
    'IF', 'THEN', 'ELSE', 'ELSEIF', 'END', 'CASE', 'WHEN', 'DATE', 'AND', 'OR', 'NOT', 'NULL'
];

export function normalize(calcs: ExtractedCalculation[]): ExtractedCalculation[] {
    return calcs.map(c => ({
        ...c,
        formula: uppercaseKeywords(condenseWhitespace(c.formula))
    }));
}

export function filterAndDedupe(calcs: ExtractedCalculation[]): ExtractedCalculation[] {
    const seen = new Map<string, string>();
    const out: ExtractedCalculation[] = [];
    for (const c of calcs) {
        const norm = c.formula.trim().toUpperCase();
        if (isTrivial(c.formula)) continue;
        if (!seen.has(norm)) {
            seen.set(norm, c.title);
            out.push(c);
        }
    }
    return out;
}

function isTrivial(f: string): boolean {
    const t = f.trim();
    if (!t) return true;
    if (/^"[^"]*"$/.test(t)) return true; // pure quoted string
    if (/^\d+$/.test(t)) return true; // integer only
    if (/^\[[^\]]+\]$/.test(t)) return true; // single field ref
    return false;
}

function condenseWhitespace(s: string): string {
    return s.replace(/\r\n?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[\t ]{2,}/g, ' ')
        .trim();
}

function uppercaseKeywords(s: string): string {
    return s.replace(/\b([A-Za-z_]+)\b/g, (m, w) => {
        if (KEYWORDS.includes(w.toUpperCase())) return w.toUpperCase();
        return m;
    });
}
