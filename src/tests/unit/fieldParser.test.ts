// src/tests/unit/fieldParser.test.ts

import { FieldParser } from '../../fieldParser';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('fs');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('FieldParser', () => {
    const FIELD_DEFINITION_FIXTURE = `
        /** Revenue from primary fact table */
        [Sales] = Number
        /** Region extracted from dim table */
        [Region]: String // inline hint
        /** Ship mode stored as enum */
        [Ship Mode] => String
    `;

    beforeEach(() => {
        jest.clearAllMocks();
        mockFs.readFileSync.mockReturnValue(FIELD_DEFINITION_FIXTURE);
    });

    it('parses field definitions written with =, :, and =>', () => {
        const parser = new FieldParser('test://fields.d.twbl');

        expect(parser.getField('Sales')?.type).toBe('Number');
        expect(parser.getField('Region')?.type).toBe('String');
        expect(parser.getField('Ship Mode')?.type).toBe('String');
    });

    it('preserves JSDoc descriptions for each field', () => {
        const parser = new FieldParser('test://fields.d.twbl');

        expect(parser.getField('Sales')?.description).toContain('Revenue');
        expect(parser.getField('Region')?.description).toContain('Region');
        expect(parser.getField('Ship Mode')?.description).toContain('Ship mode');
    });

    it('strips inline comments from field definitions', () => {
        const parser = new FieldParser('test://fields.d.twbl');

        const region = parser.getField('Region');
        expect(region?.type).toBe('String');
        expect(region?.description).toContain('Region extracted');
    });

    it('exposes a case-insensitive lookup map via getAllFields', () => {
        const parser = new FieldParser('test://fields.d.twbl');

        const fields = parser.getAllFields();
        expect(fields.size).toBe(3);
        expect(fields.get('SALES')).toBeDefined();
        expect(fields.get('REGION')).toBeDefined();
        expect(fields.get('SHIP MODE')).toBeDefined();
    });

    it('clears cached values when refresh is called', () => {
        const parser = new FieldParser('test://fields.d.twbl');

        mockFs.readFileSync.mockReturnValue('[New Field] = Boolean');
        parser.refresh();

        expect(parser.getField('Sales')).toBeUndefined();
        expect(parser.getField('New Field')?.type).toBe('Boolean');
    });

    describe('findDefinitionFile', () => {
        it('returns the first matching path that exists', () => {
            const basePath = '/workspace/out';
            const expectedPath = path.resolve(basePath, '../syntaxes/fields.d.twbl');

            mockFs.readFileSync.mockImplementation((candidatePath: fs.PathOrFileDescriptor) => {
                if (typeof candidatePath === 'string' && candidatePath === expectedPath) {
                    return FIELD_DEFINITION_FIXTURE;
                }
                throw new Error('not found');
            });

            const resolved = FieldParser.findDefinitionFile(basePath);
            expect(resolved).toBe(expectedPath);
        });

        it('returns null when no definition file is found', () => {
            mockFs.readFileSync.mockImplementation(() => { throw new Error('not found'); });

            const resolved = FieldParser.findDefinitionFile('/workspace/out');
            expect(resolved).toBeNull();
        });
    });
});
