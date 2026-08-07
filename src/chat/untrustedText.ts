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
        .replace(/<(\/?)TABLEAU_AGENT_INSTRUCTION>/gi, '&lt;$1TABLEAU_AGENT_INSTRUCTION&gt;')
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
