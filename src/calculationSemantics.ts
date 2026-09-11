import { Token, TokenType as T, tokenize } from './lexer.js';

type ValueType = 'number' | 'string' | 'boolean' | 'date' | 'null' | 'unknown';
type Aggregation = 'constant' | 'row' | 'aggregate' | 'unknown';
interface Value { type: ValueType; aggregation: Aggregation; }
export interface SemanticField {
    datatype?: string;
    type?: string;
    kind?: 'field' | 'calculation' | 'parameter';
}
export interface CalculationSemanticContext {
    resolveField?: (name: string, datasource?: string) => SemanticField | undefined;
}
export interface CalculationSemanticIssue {
    code: 'MIXED_AGGREGATION' | 'INCOMPATIBLE_TYPES' | 'INCOMPATIBLE_BRANCH_TYPES';
    message: string;
    start: number;
    end: number;
}

const unknown = (): Value => ({ type: 'unknown', aggregation: 'unknown' });
const aggregateFunctions = new Set('SUM AVG COUNT COUNTD MEDIAN STDEV STDEVP VAR VARP PERCENTILE ATTR CORR COVAR COVARP COLLECT'.split(' '));
const numberFunctions = new Set('ABS ACOS ASIN ATAN ATAN2 CEILING COS COT DEGREES DIV EXP FLOOR HEXBINX HEXBINY INT FLOAT LN LOG PI POWER RADIANS ROUND SIGN SIN SQRT SQUARE TAN ZN LEN FIND FINDNTH ASCII DATEPART DATEDIFF DAY MONTH QUARTER WEEK YEAR'.split(' '));
const stringFunctions = new Set('STR CHAR LEFT RIGHT MID LOWER UPPER TRIM LTRIM RTRIM REPLACE SPLIT SPACE REPEAT DATENAME REGEXP_REPLACE REGEXP_EXTRACT'.split(' '));
const booleanFunctions = new Set('ISNULL ISDATE ISFULLNAME ISMEMBEROF ISUSERNAME CONTAINS STARTSWITH ENDSWITH REGEXP_MATCH'.split(' '));
const dateFunctions = new Set('DATE DATETIME DATEADD DATETRUNC MAKEDATE MAKEDATETIME DATEPARSE TODAY NOW'.split(' '));
const tableFunctions = new Set([
    ...'TOTAL LOOKUP PREVIOUS_VALUE FIRST LAST INDEX SIZE RANK RANK_DENSE RANK_MODIFIED RANK_PERCENTILE RANK_UNIQUE'.split(' '),
    ...'SUM AVG COUNT MIN MAX'.split(' ').map(name => `RUNNING_${name}`),
    ...'SUM AVG COUNT MIN MAX MEDIAN STDEV STDEVP VAR VARP PERCENTILE CORR COVAR COVARP'.split(' ').map(name => `WINDOW_${name}`),
]);
const precedence = new Map<T, number>([
    [T.Or, 1], [T.And, 2], [T.Equal, 3], [T.EqualEqual, 3], [T.BangEqual, 3],
    [T.Greater, 3], [T.GreaterEqual, 3], [T.Less, 3], [T.LessEqual, 3], [T.In, 3],
    [T.Plus, 4], [T.Minus, 4], [T.Star, 5], [T.Slash, 5], [T.Percent, 5], [T.Caret, 6],
]);

function valueType(type: string | undefined): ValueType {
    switch (type?.toLowerCase()) {
        case 'real': case 'integer': case 'number': case 'float': return 'number';
        case 'string': return 'string';
        case 'boolean': case 'bool': return 'boolean';
        case 'date': case 'datetime': return 'date';
        default: return 'unknown';
    }
}

/**
 * Deliberately partial inference, not a Tableau compiler. Unsupported syntax,
 * unknown function signatures, and calculated fields without aggregation
 * metadata do not become guessed errors. Offsets address the original formula.
 */
export function validateCalculationSemantics(
    formula: string,
    context: CalculationSemanticContext = {},
): CalculationSemanticIssue[] {
    const tokens = tokenize(formula).filter(token => token.type !== T.Comment && token.type !== T.Whitespace);
    if (tokens.length > 20000) { return []; }
    let position = 0;
    let depth = 0;
    const issues: CalculationSemanticIssue[] = [];
    const peek = (): Token => tokens[position] ?? tokens[tokens.length - 1];
    const take = (): Token => tokens[position++];
    const accept = (type: T): boolean => peek().type === type && Boolean(take());
    const expect = (type: T): void => { if (!accept(type)) { throw new Error('Outside supported expression grammar'); } };
    const issue = (token: Token, code: CalculationSemanticIssue['code'], message: string): void => {
        issues.push({ code, message, start: token.start, end: token.end });
    };
    const known = (type: ValueType): boolean => type !== 'unknown' && type !== 'null';
    const mergeAggregation = (values: Value[], token: Token): Aggregation => {
        const levels = new Set(values.map(value => value.aggregation));
        if (levels.has('aggregate') && levels.has('row')) {
            issue(token, 'MIXED_AGGREGATION', 'Cannot mix aggregate and row-level expressions. Aggregate the row-level field or change the calculation level.');
            return 'unknown';
        }
        if (levels.has('unknown')) { return 'unknown'; }
        return levels.has('aggregate') ? 'aggregate' : levels.has('row') ? 'row' : 'constant';
    };
    const branchType = (values: Value[], token: Token): ValueType => {
        const types = new Set(values.map(value => value.type).filter(known));
        if (types.size > 1) {
            issue(token, 'INCOMPATIBLE_BRANCH_TYPES', `Calculation branches have incompatible types: ${[...types].join(' and ')}.`);
            return 'unknown';
        }
        return values.some(value => value.type === 'unknown') ? 'unknown' : [...types][0] ?? 'null';
    };
    const condition = (value: Value, token: Token): void => {
        if (known(value.type) && value.type !== 'boolean') {
            issue(token, 'INCOMPATIBLE_TYPES', `The condition must have boolean type, not ${value.type}.`);
        }
    };

    function binary(left: Value, right: Value, operator: Token): Value {
        const aggregation = mergeAggregation([left, right], operator);
        const op = operator.type;
        let type: ValueType = 'unknown';
        let compatible = true;
        if (op === T.And || op === T.Or) {
            condition(left, operator); condition(right, operator); type = 'boolean';
        } else if ((precedence.get(op) ?? 0) === 3) {
            type = 'boolean';
            compatible = op === T.In || left.type === right.type;
        } else {
            const bothNumber = left.type === 'number' && right.type === 'number';
            const stringAddition = op === T.Plus && left.type === 'string' && right.type === 'string';
            const dateShift = (op === T.Plus || op === T.Minus) && left.type === 'date' && right.type === 'number';
            const reverseDateShift = op === T.Plus && left.type === 'number' && right.type === 'date';
            const dateDifference = op === T.Minus && left.type === 'date' && right.type === 'date';
            compatible = bothNumber || stringAddition || dateShift || reverseDateShift || dateDifference;
            type = bothNumber || dateDifference ? 'number' : stringAddition ? 'string' : dateShift || reverseDateShift ? 'date' : 'unknown';
        }
        if (!compatible && known(left.type) && known(right.type)) {
            issue(operator, 'INCOMPATIBLE_TYPES', `Operator ${operator.value} cannot combine ${left.type} and ${right.type} types.`);
        }
        return { type, aggregation };
    }

    function expression(minimum = 0): Value {
        if (++depth > 128) { throw new Error('Expression nesting limit'); }
        let value = primary();
        while ((precedence.get(peek().type) ?? -1) >= minimum) {
            const operator = take();
            const level = precedence.get(operator.type)!;
            const right = expression(level + (operator.type === T.Caret ? 0 : 1));
            value = binary(value, right, operator);
        }
        depth--;
        return value;
    }

    function primary(): Value {
        const token = take();
        if (!token) { throw new Error('Missing expression'); }
        if (token.type === T.Number) { return { type: 'number', aggregation: 'constant' }; }
        if (token.type === T.String) { return { type: 'string', aggregation: 'constant' }; }
        if (token.type === T.DateLiteral) { return { type: 'date', aggregation: 'constant' }; }
        if (token.type === T.True || token.type === T.False) { return { type: 'boolean', aggregation: 'constant' }; }
        if (token.type === T.Null) { return { type: 'null', aggregation: 'constant' }; }
        if (token.type === T.Not || token.type === T.Plus || token.type === T.Minus) {
            const value = expression(token.type === T.Not ? 3 : 6);
            if (token.type === T.Not) { condition(value, token); return { ...value, type: 'boolean' }; }
            if (known(value.type) && value.type !== 'number') {
                issue(token, 'INCOMPATIBLE_TYPES', `Unary ${token.value} requires a number type, not ${value.type}.`);
            }
            return value;
        }
        if (token.type === T.FieldReference) {
            let name = token.value.slice(1, -1).replace(/\]\]/g, ']');
            let datasource: string | undefined;
            if (peek().value === '.' && tokens[position + 1]?.type === T.FieldReference) {
                take(); datasource = name; name = take().value.slice(1, -1).replace(/\]\]/g, ']');
            }
            const field = context.resolveField?.(name, datasource);
            if (!field) { return unknown(); }
            return { type: valueType(field.datatype ?? field.type), aggregation: field.kind === 'parameter' ? 'constant' : field.kind === 'calculation' ? 'unknown' : 'row' };
        }
        if (token.type === T.LParen) {
            const value = expression();
            if (accept(T.Comma)) {
                do { expression(); } while (accept(T.Comma));
                expect(T.RParen); return unknown(); // IN lists are not scalar expressions.
            }
            expect(T.RParen); return value;
        }
        if (token.type === T.LBrace) {
            if ([T.Fixed, T.Include, T.Exclude].includes(peek().type)) {
                take();
                if (peek().type !== T.Colon) { do { expression(); } while (accept(T.Comma)); }
                expect(T.Colon);
            }
            const value = expression(); expect(T.RBrace);
            return { ...value, aggregation: 'unknown' }; // LOD granularity depends on the view.
        }
        if (token.type === T.If) {
            const conditions: Value[] = [];
            const results: Value[] = [];
            do {
                const test = expression(); condition(test, token); conditions.push(test);
                expect(T.Then); results.push(expression());
            } while (accept(T.Elseif));
            if (accept(T.Else)) { results.push(expression()); }
            expect(T.End);
            return { type: branchType(results, token), aggregation: mergeAggregation([...conditions, ...results], token) };
        }
        if (token.type === T.Case) {
            const selector = expression();
            const values = [selector];
            const results: Value[] = [];
            while (accept(T.When)) {
                const match = expression(); values.push(match);
                if (known(selector.type) && known(match.type) && selector.type !== match.type) {
                    issue(token, 'INCOMPATIBLE_TYPES', `CASE and WHEN have incompatible ${selector.type} and ${match.type} types.`);
                }
                expect(T.Then); results.push(expression());
            }
            if (accept(T.Else)) { results.push(expression()); }
            expect(T.End);
            return { type: branchType(results, token), aggregation: mergeAggregation([...values, ...results], token) };
        }
        if (token.type === T.Identifier && accept(T.LParen)) {
            const args: Value[] = [];
            if (peek().type !== T.RParen) { do { args.push(expression()); } while (accept(T.Comma)); }
            expect(T.RParen);
            return call(token, args);
        }
        throw new Error('Outside supported expression grammar');
    }

    function call(token: Token, args: Value[]): Value {
        const name = token.value.toUpperCase();
        if (name === 'IIF' && args.length >= 3) {
            condition(args[0], token);
            return { type: branchType(args.slice(1), token), aggregation: mergeAggregation(args, token) };
        }
        if (name === 'IFNULL' && args.length === 2) {
            return { type: branchType(args, token), aggregation: mergeAggregation(args, token) };
        }
        if (aggregateFunctions.has(name) || ((name === 'MIN' || name === 'MAX') && args.length === 1)) {
            const type = ['MIN', 'MAX', 'ATTR'].includes(name) ? args[0]?.type ?? 'unknown' : name === 'COLLECT' ? 'unknown' : 'number';
            return { type, aggregation: 'aggregate' };
        }
        if (tableFunctions.has(name)) {
            return { type: ['LOOKUP', 'PREVIOUS_VALUE'].includes(name) || /_(MIN|MAX)$/.test(name) ? args[0]?.type ?? 'unknown' : 'number', aggregation: 'aggregate' };
        }
        if ((name === 'MIN' || name === 'MAX') && args.length === 2) {
            return { type: branchType(args, token), aggregation: mergeAggregation(args, token) };
        }
        const type: ValueType = numberFunctions.has(name) ? 'number' : stringFunctions.has(name) ? 'string' : booleanFunctions.has(name) ? 'boolean' : dateFunctions.has(name) ? 'date' : 'unknown';
        return type === 'unknown' ? unknown() : { type, aggregation: mergeAggregation(args, token) };
    }

    try {
        expression();
        accept(T.Semicolon);
        if (peek().type !== T.EOF) { return []; }
        return issues;
    } catch {
        // Existing syntax diagnostics own incomplete or unsupported expressions.
        return [];
    }
}
