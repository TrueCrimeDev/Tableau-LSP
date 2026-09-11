/**
 * Workbook content — captions, formulas, datasource names, parameter values —
 * is untrusted user data. It reaches two places that must not be forgeable:
 * tool results read by the language model, and the confirmation card the user
 * approves before a workbook is written.
 *
 * Flattening to a single line is the load-bearing part: without it a caption
 * carrying a newline can forge a list entry, a heading, or a whole markdown
 * block on the approval card.
 */

const MAX_UNTRUSTED_CHARS = 400;

export function sanitizeWorkbookText(value: string, maxChars: number = MAX_UNTRUSTED_CHARS): string {
    const flattened = value
        .replace(/\s+/g, ' ')
        // Escape angle brackets outright rather than blacklisting tag names. A
        // list has to be kept in sync with every boundary tag the prompt uses,
        // and the one that drifted out of sync was the whole vulnerability:
        // workbook text could open a <PROJECT_INSTRUCTIONS> block and inherit
        // the authority that block is explicitly granted.
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/TOOL ERROR/gi, 'TOOL_ERROR')
        .trim();
    return flattened.length > maxChars ? `${flattened.slice(0, maxChars)}…` : flattened;
}

/**
 * Sanitises a calculation formula for the prompt.
 *
 * A formula cannot use the blanket angle-bracket escaping that captions get:
 * `<` and `>` are Tableau's comparison operators, and rendering them as
 * entities makes the formula wrong to read and wrong to copy. What a formula
 * never legitimately contains is a *tag-shaped* sequence — `<WORD>` or
 * `</WORD>` — so only that shape is neutralised. A comparison is always
 * followed by an operand, never by a bare word and a closing bracket, so this
 * leaves real formulas untouched while closing the string-literal vector
 * (`IIF([x], "</PROJECT_INSTRUCTIONS>", "")`).
 */
export function sanitizeWorkbookFormula(value: string, maxChars: number = MAX_UNTRUSTED_CHARS): string {
    const flattened = value
        .replace(/\s+/g, ' ')
        .replace(/<(\/?)([A-Za-z_][\w-]*)>/g, '&lt;$1$2&gt;')
        .replace(/TOOL ERROR/gi, 'TOOL_ERROR')
        .trim();
    return flattened.length > maxChars ? `${flattened.slice(0, maxChars)}…` : flattened;
}

/** Escapes the inline markdown that could restyle or hide text on a card. */
export function escapeMarkdown(value: string): string {
    return value.replace(/[\\`*_[\]<>]/g, character => `\\${character}`);
}

/** Sanitised and markdown-escaped — for workbook text rendered into a card. */
export function safeMarkdownText(value: string, maxChars: number = MAX_UNTRUSTED_CHARS): string {
    return escapeMarkdown(sanitizeWorkbookText(value, maxChars));
}
