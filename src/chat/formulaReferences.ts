import { WorkbookDataField } from '../services/workbookFieldContext.js';
import { stripCommentsAndStrings } from '../services/workbookInsights.js';

/**
 * Checks that every field a formula references actually exists.
 *
 * `validateCalculationFormula` is a lexer-level check — balanced parens, IF/END
 * matching. It says nothing about whether `[Salez]` is a real field, so a
 * single transposed letter sails through validation, past the confirmation
 * card, and into the workbook, where Tableau shows it as an invalid
 * calculation. This is the check that closes that gap.
 */

export interface FieldReference {
    /** Field name with the brackets removed and `]]` unescaped. */
    name: string;
    /** Datasource qualifier from `[Datasource].[Field]`, if written that way. */
    qualifier?: string;
}

export interface ReferenceProblem {
    name: string;
    qualifier?: string;
    /** Existing names close enough to be worth offering. */
    suggestions: string[];
}

/**
 * Bracketed tokens in a formula, with `]]` treated as an escaped `]` the way
 * Tableau's own lexer does. Runs over the comment- and string-stripped text so
 * bracket-like content inside `"…"` or after `//` is never mistaken for a
 * reference.
 */
export function extractFieldReferences(formula: string): FieldReference[] {
    const source = stripCommentsAndStrings(formula);
    const references: FieldReference[] = [];
    let index = 0;

    const readBracketed = (start: number): { name: string; end: number } | undefined => {
        if (source[start] !== '[') {
            return undefined;
        }
        let name = '';
        let cursor = start + 1;
        while (cursor < source.length) {
            if (source[cursor] === ']') {
                if (source[cursor + 1] === ']') {
                    name += ']';
                    cursor += 2;
                    continue;
                }
                return { name, end: cursor + 1 };
            }
            name += source[cursor];
            cursor += 1;
        }
        return undefined; // Unterminated — the formula validator reports it.
    };

    while (index < source.length) {
        if (source[index] !== '[') {
            index += 1;
            continue;
        }
        const first = readBracketed(index);
        if (!first) {
            break;
        }
        // `[Datasource].[Field]` — whitespace around the dot is legal.
        let after = first.end;
        while (after < source.length && /\s/.test(source[after])) { after += 1; }
        if (source[after] === '.') {
            let qualified = after + 1;
            while (qualified < source.length && /\s/.test(source[qualified])) { qualified += 1; }
            const second = readBracketed(qualified);
            if (second) {
                references.push({ name: second.name.trim(), qualifier: first.name.trim() });
                index = second.end;
                continue;
            }
        }
        references.push({ name: first.name.trim() });
        index = first.end;
    }
    return references;
}

/** Loose key so "Order Date" and "order_date" are treated as near-misses. */
function loosen(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function editDistanceWithin(left: string, right: string, limit: number): boolean {
    if (Math.abs(left.length - right.length) > limit) {
        return false;
    }
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i += 1) {
        const current = [i];
        for (let j = 1; j <= right.length; j += 1) {
            current[j] = left[i - 1] === right[j - 1]
                ? previous[j - 1]
                : 1 + Math.min(previous[j - 1], previous[j], current[j - 1]);
        }
        previous = current;
    }
    return previous[right.length] <= limit;
}

function suggestionsFor(name: string, known: readonly string[]): string[] {
    const loose = loosen(name);
    const lower = name.toLowerCase();
    const scored = known.filter(candidate => {
        const candidateLoose = loosen(candidate);
        return candidateLoose === loose ||
            candidateLoose.includes(loose) ||
            loose.includes(candidateLoose) ||
            editDistanceWithin(lower, candidate.toLowerCase(), lower.length <= 4 ? 1 : 2);
    });
    return scored.slice(0, 5);
}

export interface ReferenceCheckInput {
    formula: string;
    /** Fields of the datasource being written to, plus every parameter. */
    knownNames: readonly string[];
    /** Datasource caption and internal name, for qualified references. */
    datasourceAliases: readonly string[];
    /** The calculation's own name, so replacing a self-referencing calc works. */
    selfName?: string;
}

/**
 * Field references the workbook cannot satisfy. An empty result means every
 * name resolves; it does NOT mean the formula is otherwise correct.
 */
export function findUnknownReferences(input: ReferenceCheckInput): ReferenceProblem[] {
    // An empty catalogue means extraction failed, not that the workbook has no
    // fields. Blocking every write on that would be worse than not checking.
    if (input.knownNames.length === 0) {
        return [];
    }
    const known = new Set(input.knownNames.map(name => name.toLowerCase()));
    if (input.selfName) {
        known.add(input.selfName.toLowerCase());
    }
    const aliases = new Set([
        ...input.datasourceAliases.map(alias => alias.toLowerCase().replace(/^\[|\]$/g, '')),
        'parameters',
    ]);

    const problems: ReferenceProblem[] = [];
    const reported = new Set<string>();
    for (const reference of extractFieldReferences(input.formula)) {
        if (!reference.name) {
            continue;
        }
        // A qualifier naming another datasource is its own error: Tableau
        // calculations can only reference fields in their own datasource.
        const qualifier = reference.qualifier?.toLowerCase().replace(/^\[|\]$/g, '');
        const qualifierIsForeign = qualifier !== undefined && !aliases.has(qualifier);
        if (!qualifierIsForeign && known.has(reference.name.toLowerCase())) {
            continue;
        }
        const key = `${qualifier ?? ''}::${reference.name.toLowerCase()}`;
        if (reported.has(key)) {
            continue;
        }
        reported.add(key);
        problems.push({
            name: reference.name,
            qualifier: reference.qualifier,
            suggestions: suggestionsFor(reference.name, input.knownNames),
        });
    }
    return problems;
}

/** Names the target datasource exposes to a formula. */
export function knownReferenceNames(
    fields: readonly WorkbookDataField[],
    datasourceCaption: string
): string[] {
    const wanted = datasourceCaption.toLowerCase();
    const names = new Set<string>();
    for (const field of fields) {
        // Parameters live in their own pseudo-datasource but are referencable
        // from a calculation in any datasource.
        if (field.kind === 'parameter' || field.datasource.toLowerCase() === wanted) {
            names.add(field.name);
        }
    }
    return [...names];
}

/** The message handed back to the model when a reference does not resolve. */
export function describeUnknownReferences(
    problems: readonly ReferenceProblem[],
    datasourceCaption: string
): string {
    const detail = problems.map(problem => {
        const shown = problem.qualifier ? `[${problem.qualifier}].[${problem.name}]` : `[${problem.name}]`;
        const hint = problem.suggestions.length
            ? ` — did you mean ${problem.suggestions.map(name => `[${name}]`).join(', ')}?`
            : '';
        return `${shown}${hint}`;
    }).join('; ');
    return `The formula references ${problems.length === 1 ? 'a field' : 'fields'} that ` +
        `"${datasourceCaption}" does not have: ${detail} ` +
        'Call tableau_listFields for this datasource and use the exact names it returns. ' +
        'Nothing was written.';
}
