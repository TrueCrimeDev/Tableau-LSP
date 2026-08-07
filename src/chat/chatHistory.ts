/**
 * Prior turns of the @tableau conversation, replayed to the model.
 *
 * Without this every turn is stateless, which breaks the thing the agent most
 * obviously should do: ask a clarifying question and then use the answer. It
 * also breaks "now make that a percentage" — the follow-up arrives with no
 * idea what "that" was.
 *
 * The turn shape is duck-typed rather than tested with `instanceof`, so this
 * stays a pure function: VS Code's ChatRequestTurn carries a `prompt`, its
 * ChatResponseTurn carries a `response`.
 */

export interface HistoryTurn {
    role: 'user' | 'assistant';
    text: string;
}

/** Newest turns are the ones worth keeping when the budget runs out. */
export const MAX_HISTORY_TURNS = 8;
export const MAX_HISTORY_CHARS = 6000;

interface RequestTurnLike {
    prompt?: unknown;
    command?: unknown;
}

interface ResponseTurnLike {
    response?: unknown;
}

function markdownTextOf(part: unknown): string {
    if (typeof part !== 'object' || part === null || !('value' in part)) {
        return '';
    }
    const value = (part as { value: unknown }).value;
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'object' && value !== null && 'value' in value) {
        const inner = (value as { value: unknown }).value;
        return typeof inner === 'string' ? inner : '';
    }
    return '';
}

/**
 * Flattens VS Code's history into plain turns. Non-markdown response parts
 * (file trees, anchors, command buttons) carry no text worth replaying and are
 * dropped.
 */
export function normalizeHistory(history: readonly unknown[]): HistoryTurn[] {
    const turns: HistoryTurn[] = [];
    for (const entry of history) {
        if (typeof entry !== 'object' || entry === null) {
            continue;
        }
        if (typeof (entry as RequestTurnLike).prompt === 'string') {
            const turn = entry as RequestTurnLike;
            const command = typeof turn.command === 'string' && turn.command ? `/${turn.command} ` : '';
            const text = `${command}${String(turn.prompt)}`.trim();
            if (text) {
                turns.push({ role: 'user', text });
            }
            continue;
        }
        const response = (entry as ResponseTurnLike).response;
        if (Array.isArray(response)) {
            const text = response.map(markdownTextOf).join('').trim();
            if (text) {
                turns.push({ role: 'assistant', text });
            }
        }
    }
    return turns;
}

/**
 * Trims to the most recent turns inside a character budget, and never opens
 * with an assistant turn — a reply whose question was dropped reads as the
 * model talking to itself.
 */
export function trimHistory(
    turns: readonly HistoryTurn[],
    maxTurns: number = MAX_HISTORY_TURNS,
    maxChars: number = MAX_HISTORY_CHARS
): HistoryTurn[] {
    const recent = turns.slice(-maxTurns);
    const kept: HistoryTurn[] = [];
    let used = 0;
    for (let index = recent.length - 1; index >= 0; index -= 1) {
        const turn = recent[index];
        // One long turn should be clipped, not silently drop the whole history.
        const text = turn.text.length > maxChars
            ? `${turn.text.slice(0, maxChars)}…`
            : turn.text;
        if (used + text.length > maxChars && kept.length > 0) {
            break;
        }
        kept.unshift({ role: turn.role, text });
        used += text.length;
    }
    while (kept.length > 0 && kept[0].role === 'assistant') {
        kept.shift();
    }
    return kept;
}

export function conversationHistory(
    history: readonly unknown[],
    maxTurns?: number,
    maxChars?: number
): HistoryTurn[] {
    return trimHistory(normalizeHistory(history), maxTurns, maxChars);
}
