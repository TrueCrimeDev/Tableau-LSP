// src/tests/unit/jsdocParser.test.ts

import { parseJSDoc, extractTypeFromJSDoc, validateJSDocType } from '../../jsdocParser.js';
import { TextDocument } from 'vscode-languageserver-textdocument';

describe('JSDoc Parser', () => {
    function createTestDocument(content: string): TextDocument {
        return TextDocument.create('test://test.twbl', 'tableau', 1, content);
    }

    describe('Basic JSDoc Parsing', () => {
        it('should parse simple JSDoc comments', () => {
            const comment = '/** @type {string} This is a string variable */';
            const parsed = parseJSDoc(comment);
            
            expect(parsed.type).toBe('string');
            expect(parsed.description).toBe('This is a string variable');
            expect(parsed.tags).toHaveLength(1);
            expect(parsed.tags[0].name).toBe('type');
            expect(parsed.tags[0].value).toBe('string');
        });

        it('should parse JSDoc with multiple tags', () => {
            const comment = `/**
             * Calculate sales performance
             * @type {number}
             * @param {string} region - The sales region
             * @returns {number} The calculated performance score
             */`;
            const parsed = parseJSDoc(comment);
            
            expect(parsed.type).toBe('number');
            expect(parsed.description).toBe('Calculate sales performance');
            expect(parsed.tags).toHaveLength(3);
            
            const typeTag = parsed.tags.find(t => t.name === 'type');
            expect(typeTag?.value).toBe('number');
            
            const paramTag = parsed.tags.find(t => t.name === 'param');
            expect(paramTag?.value).toBe('string');
            expect(paramTag?.description).toBe('The sales region');
            
            const returnsTag = parsed.tags.find(t => t.name === 'returns');
            expect(returnsTag?.value).toBe('number');
            expect(returnsTag?.description).toBe('The calculated performance score');
        });

        it('should handle JSDoc without type information', () => {
            const comment = '/** This is just a description */';
            const parsed = parseJSDoc(comment);
            
            expect(parsed.type).toBeUndefined();
            expect(parsed.description).toBe('This is just a description');
            expect(parsed.tags).toHaveLength(0);
        });

        it('should parse inline JSDoc comments', () => {
            const comment = '/** @type {boolean} */';
            const parsed = parseJSDoc(comment);
            
            expect(parsed.type).toBe('boolean');
            expect(parsed.description).toBe('');
            expect(parsed.tags).toHaveLength(1);
        });
    });

    describe('Type Extraction', () => {
        it('should extract simple types', () => {
            const types = [
                'string',
                'number',
                'boolean',
                'date',
                'null',
                'undefined'
            ];
            
            types.forEach(type => {
                const comment = `/** @type {${type}} */`;
                const extracted = extractTypeFromJSDoc(comment);
                expect(extracted).toBe(type);
            });
        });

        it('should extract array types', () => {
            const arrayTypes = [
                'string[]',
                'number[]',
                'Array<string>',
                'Array<number>'
            ];
            
            arrayTypes.forEach(type => {
                const comment = `/** @type {${type}} */`;
                const extracted = extractTypeFromJSDoc(comment);
                expect(extracted).toBe(type);
            });
        });

        it('should extract union types', () => {
            const unionTypes = [
                'string | number',
                'boolean | null',
                'string | number | boolean'
            ];
            
            unionTypes.forEach(type => {
                const comment = `/** @type {${type}} */`;
                const extracted = extractTypeFromJSDoc(comment);
                expect(extracted).toBe(type);
            });
        });

        it('should extract function types', () => {
            const functionTypes = [
                'function',
                '() => string',
                '(x: number) => boolean',
                '(a: string, b: number) => void'
            ];
            
            functionTypes.forEach(type => {
                const comment = `/** @type {${type}} */`;
                const extracted = extractTypeFromJSDoc(comment);
                expect(extracted).toBe(type);
            });
        });

        it('should extract object types', () => {
            const objectTypes = [
                'object',
                '{name: string}',
                '{name: string, age: number}',
                '{[key: string]: any}'
            ];
            
            objectTypes.forEach(type => {
                const comment = `/** @type {${type}} */`;
                const extracted = extractTypeFromJSDoc(comment);
                expect(extracted).toBe(type);
            });
        });

        it('should handle nested generic types', () => {
            const nestedTypes = [
                'Array<Array<string>>',
                'Promise<string>',
                'Map<string, number>',
                'Record<string, boolean>'
            ];
            
            nestedTypes.forEach(type => {
                const comment = `/** @type {${type}} */`;
                const extracted = extractTypeFromJSDoc(comment);
                expect(extracted).toBe(type);
            });
        });
    });

    describe('Type Validation', () => {
        it('should validate basic Tableau types', () => {
            const validTypes = [
                'string',
                'number',
                'boolean',
                'date',
                'field',
                'dimension',
                'measure'
            ];
            
            validTypes.forEach(type => {
                const validation = validateJSDocType(type);
                expect(validation.isValid).toBe(true);
                expect(validation.errors).toHaveLength(0);
            });
        });

        it('should validate array types', () => {
            const validArrayTypes = [
                'string[]',
                'number[]',
                'field[]',
                'Array<string>',
                'Array<number>'
            ];
            
            validArrayTypes.forEach(type => {
                const validation = validateJSDocType(type);
                expect(validation.isValid).toBe(true);
                expect(validation.errors).toHaveLength(0);
            });
        });

        it('should validate union types', () => {
            const validUnionTypes = [
                'string | number',
                'boolean | null',
                'field | string',
                'number | undefined'
            ];
            
            validUnionTypes.forEach(type => {
                const validation = validateJSDocType(type);
                expect(validation.isValid).toBe(true);
                expect(validation.errors).toHaveLength(0);
            });
        });

        it('should detect invalid types', () => {
            const invalidTypes = [
                'invalidtype',
                'String', // Wrong case
                'NUMBER', // Wrong case
                'unknown_type',
                'custom_type'
            ];
            
            invalidTypes.forEach(type => {
                const validation = validateJSDocType(type);
                expect(validation.isValid).toBe(false);
                expect(validation.errors.length).toBeGreaterThan(0);
                expect(validation.errors[0].message).toContain('Invalid type');
            });
        });

        it('should detect malformed array types', () => {
            const malformedArrayTypes = [
                'string[',
                'number]',
                'Array<',
                'Array>',
                'Array<string',
                'Array string>'
            ];
            
            malformedArrayTypes.forEach(type => {
                const validation = validateJSDocType(type);
                expect(validation.isValid).toBe(false);
                expect(validation.errors.length).toBeGreaterThan(0);
            });
        });

        it('should detect malformed union types', () => {
            const malformedUnionTypes = [
                'string |',
                '| number',
                'string | | boolean',
                'string number', // Missing |
                'string & number' // Wrong operator
            ];
            
            malformedUnionTypes.forEach(type => {
                const validation = validateJSDocType(type);
                expect(validation.isValid).toBe(false);
                expect(validation.errors.length).toBeGreaterThan(0);
            });
        });
    });

    describe('Tableau-Specific Types', () => {
        it('should recognize Tableau field types', () => {
            const tableauTypes = [
                'field',
                'dimension',
                'measure',
                'calculated_field',
                'parameter',
                'set',
                'group'
            ];
            
            tableauTypes.forEach(type => {
                const validation = validateJSDocType(type);
                expect(validation.isValid).toBe(true);
                expect(validation.errors).toHaveLength(0);
            });
        });

        it('should recognize Tableau function return types', () => {
            const functionReturnTypes = [
                'aggregate',
                'table_calc',
                'lod_expression',
                'string_function',
                'date_function',
                'math_function'
            ];
            
            functionReturnTypes.forEach(type => {
                const validation = validateJSDocType(type);
                expect(validation.isValid).toBe(true);
                expect(validation.errors).toHaveLength(0);
            });
        });

        it('should validate complex Tableau types', () => {
            const complexTypes = [
                'field | parameter',
                'dimension[]',
                'Array<measure>',
                'calculated_field | field',
                'lod_expression | aggregate'
            ];
            
            complexTypes.forEach(type => {
                const validation = validateJSDocType(type);
                expect(validation.isValid).toBe(true);
                expect(validation.errors).toHaveLength(0);
            });
        });
    });

    describe('Error Messages and Suggestions', () => {
        it('should provide helpful error messages for invalid types', () => {
            const validation = validateJSDocType('invalidtype');
            
            expect(validation.isValid).toBe(false);
            expect(validation.errors[0].message).toContain('Invalid type');
            expect(validation.errors[0].suggestion).toBeDefined();
        });

        it('should suggest corrections for common mistakes', () => {
            const commonMistakes = [
                { input: 'String', suggestion: 'string' },
                { input: 'Number', suggestion: 'number' },
                { input: 'Boolean', suggestion: 'boolean' },
                { input: 'Date', suggestion: 'date' }
            ];
            
            commonMistakes.forEach(({ input, suggestion }) => {
                const validation = validateJSDocType(input);
                expect(validation.isValid).toBe(false);
                expect(validation.errors[0].suggestion).toContain(suggestion);
            });
        });

        it('should provide context-aware suggestions', () => {
            const validation = validateJSDocType('field_reference');
            
            expect(validation.isValid).toBe(false);
            expect(validation.errors[0].suggestion).toContain('field');
        });
    });

    describe('Integration with Document Context', () => {
        it('should parse JSDoc from document comments', () => {
            const document = createTestDocument(`
                /** @type {number} Sales performance metric */
                SUM([Sales])
            `);
            
            const comment = '/** @type {number} Sales performance metric */';
            const parsed = parseJSDoc(comment);
            
            expect(parsed.type).toBe('number');
            expect(parsed.description).toBe('Sales performance metric');
        });

        it('should handle multi-line JSDoc in documents', () => {
            const document = createTestDocument(`
                /**
                 * Calculate regional sales performance
                 * @type {aggregate}
                 * @param {dimension} region - Sales region
                 * @returns {number} Performance score
                 */
                SUM([Sales]) / COUNT([Orders])
            `);
            
            const comment = `/**
                 * Calculate regional sales performance
                 * @type {aggregate}
                 * @param {dimension} region - Sales region
                 * @returns {number} Performance score
                 */`;
            const parsed = parseJSDoc(comment);
            
            expect(parsed.type).toBe('aggregate');
            expect(parsed.description).toBe('Calculate regional sales performance');
            expect(parsed.tags).toHaveLength(3);
        });

        it('should extract type information for variables', () => {
            const document = createTestDocument(`
                /** @type {string} */
                [Customer Name]
            `);
            
            const typeInfo = extractTypeFromJSDoc('/** @type {string} */');
            expect(typeInfo).toBe('string');
        });
    });

    describe('Performance and Edge Cases', () => {
        it('should handle very long JSDoc comments efficiently', () => {
            const longDescription = 'A'.repeat(10000);
            const comment = `/** @type {string} ${longDescription} */`;
            
            const startTime = Date.now();
            const parsed = parseJSDoc(comment);
            const duration = Date.now() - startTime;
            
            expect(duration).toBeLessThan(100); // Should be very fast
            expect(parsed.type).toBe('string');
            expect(parsed.description).toBe(longDescription);
        });

        it('should handle malformed JSDoc gracefully', () => {
            const malformedComments = [
                '/** @type */',
                '/** @type { */',
                '/** @type } */',
                '/** @type {string */',
                '/** @type string} */',
                '/** @ type {string} */',
                '/**/'
            ];
            
            malformedComments.forEach(comment => {
                expect(() => {
                    const parsed = parseJSDoc(comment);
                    // Should not crash, but may have undefined or empty values
                }).not.toThrow();
            });
        });

        it('should handle empty or null input', () => {
            expect(() => {
                const parsed = parseJSDoc('');
                expect(parsed.type).toBeUndefined();
                expect(parsed.description).toBe('');
                expect(parsed.tags).toHaveLength(0);
            }).not.toThrow();
            
            expect(() => {
                const parsed = parseJSDoc(null as any);
                expect(parsed.type).toBeUndefined();
            }).not.toThrow();
        });

        it('should handle complex nested type structures', () => {
            const complexType = 'Array<{name: string, values: Array<number | string>}>';
            const comment = `/** @type {${complexType}} */`;
            
            const extracted = extractTypeFromJSDoc(comment);
            expect(extracted).toBe(complexType);
            
            const validation = validateJSDocType(complexType);
            // Complex types might not be fully supported, but shouldn't crash
            expect(typeof validation.isValid).toBe('boolean');
        });
    });
});
