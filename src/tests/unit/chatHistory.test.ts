import { HistoryTurn, conversationHistory, normalizeHistory, trimHistory } from '../../chat/chatHistory.js';

/** Shapes matching VS Code's ChatRequestTurn / ChatResponseTurn. */
function ask(prompt: string, command?: string): unknown {
    return { prompt, command, participant: 'tableau-language-support.tableau' };
}
function reply(...markdown: string[]): unknown {
    return {
        response: markdown.map(value => ({ value: { value } })),
        result: {},
        participant: 'tableau-language-support.tableau',
    };
}

describe('normalizeHistory', () => {
    it('flattens alternating turns', () => {
        expect(normalizeHistory([ask('what borders?'), reply('Sheet A uses solid borders.')])).toEqual([
            { role: 'user', text: 'what borders?' },
            { role: 'assistant', text: 'Sheet A uses solid borders.' },
        ]);
    });

    it('joins a streamed reply back into one turn', () => {
        expect(normalizeHistory([reply('Added ', '"Profit Ratio"', ' to the workbook.')]))
            .toEqual([{ role: 'assistant', text: 'Added "Profit Ratio" to the workbook.' }]);
    });

    it('keeps the slash command, which changes what the turn meant', () => {
        expect(normalizeHistory([ask('a margin measure', 'new')]))
            .toEqual([{ role: 'user', text: '/new a margin measure' }]);
    });

    it('accepts a markdown part whose value is a plain string', () => {
        expect(normalizeHistory([{ response: [{ value: 'plain' }], result: {} }]))
            .toEqual([{ role: 'assistant', text: 'plain' }]);
    });

    it('drops empty turns and non-markdown response parts', () => {
        expect(normalizeHistory([
            ask('   '),
            { response: [{ uri: 'file:///x' }], result: {} },
            reply(''),
        ])).toEqual([]);
    });

    it('ignores entries that are neither turn shape', () => {
        expect(normalizeHistory([null, undefined, 42, 'text', {}])).toEqual([]);
    });
});

describe('trimHistory', () => {
    const turns: HistoryTurn[] = [
        { role: 'user', text: 'one' },
        { role: 'assistant', text: 'two' },
        { role: 'user', text: 'three' },
        { role: 'assistant', text: 'four' },
    ];

    it('keeps the most recent turns', () => {
        expect(trimHistory(turns, 2).map(turn => turn.text)).toEqual(['three', 'four']);
    });

    it('never opens on an assistant turn', () => {
        // A reply whose question was trimmed away reads as the model talking
        // to itself.
        expect(trimHistory(turns, 3)[0].role).toBe('user');
        expect(trimHistory(turns, 3).map(turn => turn.text)).toEqual(['three', 'four']);
    });

    it('drops older turns to stay inside the character budget', () => {
        const long: HistoryTurn[] = [
            { role: 'user', text: 'x'.repeat(400) },
            { role: 'assistant', text: 'y'.repeat(400) },
            { role: 'user', text: 'recent' },
        ];
        expect(trimHistory(long, 10, 500).map(turn => turn.text)).toEqual(['recent']);
    });

    it('clips one oversized turn instead of losing the whole history', () => {
        const kept = trimHistory([{ role: 'user', text: 'z'.repeat(5000) }], 10, 100);
        expect(kept).toHaveLength(1);
        expect(kept[0].text).toHaveLength(101);
        expect(kept[0].text.endsWith('…')).toBe(true);
    });

    it('returns nothing for an empty history', () => {
        expect(trimHistory([])).toEqual([]);
    });
});

describe('conversationHistory', () => {
    it('supports the clarify-then-answer flow /new advertises', () => {
        const history = [
            ask('', 'new'),
            reply('Which measure should the ratio use — Profit or Margin?'),
        ];
        expect(conversationHistory(history)).toEqual([
            { role: 'user', text: '/new' },
            { role: 'assistant', text: 'Which measure should the ratio use — Profit or Margin?' },
        ]);
    });
});
