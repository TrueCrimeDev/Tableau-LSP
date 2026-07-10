import {
    DEFAULT_COMMON_CALCULATIONS,
    MAX_COMMON_CALCULATIONS,
    normalizeCommonCalculations,
    removeCommonCalculation,
    upsertCommonCalculation,
} from '../../services/commonCalculations.js';

describe('common calculation library', () => {
    it('provides one usable base calculation', () => {
        expect(DEFAULT_COMMON_CALCULATIONS).toEqual([{
            name: 'Profit Ratio',
            formula: 'SUM([Profit]) / SUM([Sales])',
            datatype: 'real',
        }]);
    });

    it('normalizes, deduplicates, and caps stored calculations at ten', () => {
        const stored = Array.from({ length: 12 }, (_, index) => ({
            name: `Calculation ${String(index)}`,
            formula: `${String(index)} + 1`,
            datatype: 'integer',
        }));
        stored.splice(1, 0, { ...stored[0], name: 'calculation 0' });

        const result = normalizeCommonCalculations(stored);

        expect(result).toHaveLength(MAX_COMMON_CALCULATIONS);
        expect(result[0].name).toBe('Calculation 0');
        expect(result[1].name).toBe('Calculation 1');
    });

    it('adds and updates calculations case-insensitively', () => {
        const added = upsertCommonCalculation([], DEFAULT_COMMON_CALCULATIONS[0]);
        const updated = upsertCommonCalculation(added.calculations, {
            name: 'profit ratio',
            formula: 'SUM([Profit]) / NULLIF(SUM([Sales]), 0)',
            datatype: 'real',
        });

        expect(added.action).toBe('added');
        expect(updated.action).toBe('updated');
        expect(updated.calculations).toHaveLength(1);
        expect(updated.calculations[0].formula).toContain('NULLIF');
    });

    it('rejects malformed formulas and an eleventh calculation', () => {
        expect(() => upsertCommonCalculation([], {
            name: 'Broken',
            formula: 'SUM([Sales]',
            datatype: 'real',
        })).toThrow(/Unbalanced parentheses/);

        const full = Array.from({ length: MAX_COMMON_CALCULATIONS }, (_, index) => ({
            name: `Calculation ${String(index)}`,
            formula: `${String(index)} + 1`,
            datatype: 'integer' as const,
        }));
        expect(() => upsertCommonCalculation(full, {
            name: 'Calculation 11',
            formula: '11 + 1',
            datatype: 'integer',
        })).toThrow(/limited to 10/);
    });

    it('removes only the selected calculation', () => {
        expect(removeCommonCalculation([
            DEFAULT_COMMON_CALCULATIONS[0],
            { name: 'Row Count', formula: 'COUNT([Number of Records])', datatype: 'integer' },
        ], 'profit ratio')).toEqual([
            { name: 'Row Count', formula: 'COUNT([Number of Records])', datatype: 'integer' },
        ]);
    });
});
