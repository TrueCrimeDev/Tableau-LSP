import {
    TableauCalculationDatatype,
    validateCalculationFormula,
} from '../parsers/workbookCalculations.js';

export const MAX_COMMON_CALCULATIONS = 10;

export interface CommonCalculation {
    name: string;
    formula: string;
    datatype: TableauCalculationDatatype;
}

export const DEFAULT_COMMON_CALCULATIONS: CommonCalculation[] = [{
    name: 'Profit Ratio',
    formula: 'SUM([Profit]) / SUM([Sales])',
    datatype: 'real',
}];

export class CommonCalculationError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'CommonCalculationError';
    }
}

const DATATYPES = new Set<TableauCalculationDatatype>([
    'string',
    'real',
    'integer',
    'boolean',
    'date',
    'datetime',
]);

export function coerceCommonCalculation(value: unknown): CommonCalculation | undefined {
    if (!value || typeof value !== 'object') {
        return undefined;
    }
    const candidate = value as Record<string, unknown>;
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    const formula = typeof candidate.formula === 'string' ? candidate.formula.trim() : '';
    const datatype = typeof candidate.datatype === 'string'
        ? candidate.datatype as TableauCalculationDatatype
        : undefined;
    if (!name || !formula || !datatype || !DATATYPES.has(datatype)) {
        return undefined;
    }
    return { name, formula, datatype };
}

export function normalizeCommonCalculations(value: unknown): CommonCalculation[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const seen = new Set<string>();
    const normalized: CommonCalculation[] = [];
    for (const item of value) {
        const calculation = coerceCommonCalculation(item);
        const key = calculation?.name.toLowerCase();
        if (!calculation || !key || seen.has(key)) {
            continue;
        }
        seen.add(key);
        normalized.push(calculation);
        if (normalized.length === MAX_COMMON_CALCULATIONS) {
            break;
        }
    }
    return normalized;
}

export function upsertCommonCalculation(
    current: readonly CommonCalculation[],
    rawCalculation: unknown
): { calculations: CommonCalculation[]; action: 'added' | 'updated' } {
    const calculation = coerceCommonCalculation(rawCalculation);
    if (!calculation) {
        throw new CommonCalculationError('Enter a calculation name, formula, and valid result datatype.');
    }
    if (/\r|\n|\[|\]/.test(calculation.name)) {
        throw new CommonCalculationError('Common calculation names cannot contain brackets or line breaks.');
    }
    const formulaErrors = validateCalculationFormula(calculation.formula);
    if (formulaErrors.length > 0) {
        throw new CommonCalculationError(formulaErrors.join(' '));
    }
    const calculations = normalizeCommonCalculations(current);
    const index = calculations.findIndex(item =>
        item.name.toLowerCase() === calculation.name.toLowerCase()
    );
    if (index >= 0) {
        calculations[index] = calculation;
        return { calculations, action: 'updated' };
    }
    if (calculations.length >= MAX_COMMON_CALCULATIONS) {
        throw new CommonCalculationError(`Common Calculations is limited to ${String(MAX_COMMON_CALCULATIONS)} entries.`);
    }
    calculations.push(calculation);
    return { calculations, action: 'added' };
}

export function removeCommonCalculation(
    current: readonly CommonCalculation[],
    name: string
): CommonCalculation[] {
    const target = name.trim().toLowerCase();
    return normalizeCommonCalculations(current).filter(item => item.name.toLowerCase() !== target);
}
