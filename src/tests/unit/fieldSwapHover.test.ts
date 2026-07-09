import { findBracketToken, orderSwapCandidates, scopeSwapFields } from '../../providers/fieldSwapHover.js';
import { parseFieldDefs, setFieldCatalog, getFieldCatalog, CatalogField } from '../../services/fieldCatalog.js';
import { generateFieldDefsSection } from '../../extract/fieldDefsGenerator.js';

const FIELDS: CatalogField[] = [
    { name: 'Order Date', datatype: 'date', role: 'dimension', datasource: 'Orders' },
    { name: 'Ship Date', datatype: 'date', role: 'dimension', datasource: 'Orders' },
    { name: 'Due Date', datatype: 'date', role: 'dimension', datasource: 'Orders' },
    { name: 'City', datatype: 'string', role: 'dimension', datasource: 'Orders' },
    { name: 'Sales', datatype: 'real', role: 'measure', datasource: 'Orders' },
];

describe('findBracketToken', () => {
    const line = `DATEDIFF('day', [Order Date], [Ship Date])`;

    it('finds the token containing the cursor', () => {
        const t = findBracketToken(line, 20);
        expect(t).toEqual({ start: 16, end: 28, name: 'Order Date' });
    });

    it('finds the second token when hovered', () => {
        const t = findBracketToken(line, 33);
        expect(t?.name).toBe('Ship Date');
    });

    it('includes the bracket edges', () => {
        expect(findBracketToken(line, 16)?.name).toBe('Order Date');
        expect(findBracketToken(line, 28)?.name).toBe('Order Date');
    });

    it('returns null outside any token', () => {
        expect(findBracketToken(line, 5)).toBeNull();
        expect(findBracketToken('no brackets here', 3)).toBeNull();
    });

    it('ignores bracket-shaped text inside strings and comments', () => {
        expect(findBracketToken('"Label [Order Date]"', 10)).toBeNull();
        expect(findBracketToken('// [Order Date]', 5)).toBeNull();
    });
});

describe('orderSwapCandidates', () => {
    it('puts same-datatype fields first and excludes the hovered field', () => {
        const { current, sameType, other } = orderSwapCandidates('Order Date', FIELDS);
        expect(current?.datatype).toBe('date');
        expect(sameType.map(f => f.name)).toEqual(['Ship Date', 'Due Date']);
        expect(other.map(f => f.name)).toEqual(['City', 'Sales']);
    });

    it('is case-insensitive about the hovered name', () => {
        const { current } = orderSwapCandidates('ORDER DATE', FIELDS);
        expect(current?.name).toBe('Order Date');
    });

    it('treats unknown fields as typeless: everything is an option', () => {
        const { current, sameType, other } = orderSwapCandidates('Mystery', FIELDS);
        expect(current).toBeUndefined();
        expect(sameType).toEqual([]);
        expect(other).toHaveLength(5);
    });
});

describe('scopeSwapFields', () => {
    it('suppresses field swap links on a datasource qualifier', () => {
        const line = '[Orders].[Sales]';
        const token = findBracketToken(line, 3)!;

        expect(scopeSwapFields(line, token, FIELDS)).toBeNull();
    });

    it('limits swaps for a qualified field to that datasource', () => {
        const line = '[Orders].[Sales]';
        const token = findBracketToken(line, 12)!;
        const fields = [...FIELDS, {
            name: 'Return Reason',
            datatype: 'string',
            role: 'dimension',
            datasource: 'Returns',
        }];

        expect(scopeSwapFields(line, token, fields)?.map(field => field.name))
            .not.toContain('Return Reason');
    });
});

describe('parseFieldDefs — round-trip with generateFieldDefsSection', () => {
    it('recovers name, datatype, role and datasource from generated declarations', () => {
        const generated = generateFieldDefsSection(
            [
                { workbook: 'Book.twb', datasource: 'Orders', name: 'Order Date', caption: 'Order Date', datatype: 'date', role: 'dimension' },
                { workbook: 'Book.twb', datasource: 'Orders', name: 'Sales', caption: 'Sales', datatype: 'real', role: 'measure' },
            ],
            'Orders',
            'Book.twb'
        );
        const parsed = parseFieldDefs(generated);
        expect(parsed).toHaveLength(2);
        expect(parsed[0]).toEqual({ name: 'Order Date', datatype: 'date', role: 'dimension', datasource: 'Orders' });
        expect(parsed[1].name).toBe('Sales');
    });
});

describe('setFieldCatalog', () => {
    it('dedupes by datasource + name', () => {
        setFieldCatalog([...FIELDS, { ...FIELDS[0] }]);
        expect(getFieldCatalog()).toHaveLength(5);
    });
});
