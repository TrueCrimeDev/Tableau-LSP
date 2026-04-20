import { readThemeFromXml, applyThemeEditsToXml, xmlToThemeJson, validateThemeJson, applyThemeJsonToXml, WorkbookTheme } from '../../parsers/formattingTheme.js';

// ── readThemeFromXml ─────────────────────────────────────────────────────────

describe('readThemeFromXml', () => {
    it('reads font-size and font-color from a worksheet style-rule', () => {
        const xml = `
            <style-rule element='worksheet'>
                <format attr='font-size' value='14' />
                <format attr='font-color' value='#d16302' />
            </style-rule>`;
        const result = readThemeFromXml(xml);
        expect(result['worksheet']).toEqual({ 'font-size': '14', 'font-color': '#d16302' });
    });

    it('reads multiple elements independently', () => {
        const xml = `
            <style-rule element='tooltip'>
                <format attr='font-size' value='10' />
            </style-rule>
            <style-rule element='header'>
                <format attr='font-color' value='#333333' />
            </style-rule>`;
        const result = readThemeFromXml(xml);
        expect(result['tooltip']?.['font-size']).toBe('10');
        expect(result['header']?.['font-color']).toBe('#333333');
        expect(result['worksheet']).toBeUndefined();
    });

    it('returns empty object when no style-rules present', () => {
        const result = readThemeFromXml('<workbook></workbook>');
        expect(Object.keys(result)).toHaveLength(0);
    });

    it('ignores format nodes for unknown elements', () => {
        const xml = `<style-rule element='unknown-element'><format attr='font-size' value='9' /></style-rule>`;
        const result = readThemeFromXml(xml);
        expect(result['unknown-element']).toBeUndefined();
    });

    it('reads gridline line attributes', () => {
        const xml = `
            <style-rule element='gridline'>
                <format attr='line-color' value='#e6e6e6' />
                <format attr='line-width' value='1' />
            </style-rule>`;
        const result = readThemeFromXml(xml);
        expect(result['gridline']).toEqual({ 'line-color': '#e6e6e6', 'line-width': '1' });
    });
});

// ── applyThemeEditsToXml ─────────────────────────────────────────────────────

describe('applyThemeEditsToXml', () => {
    it('updates an existing format node value', () => {
        const xml = `<style-rule element='worksheet'>\n    <format attr='font-size' value='10' />\n</style-rule>`;
        const result = applyThemeEditsToXml(xml, { worksheet: { 'font-size': '14' } });
        expect(result).toContain(`attr='font-size' value='14'`);
        expect(result).not.toContain(`value='10'`);
    });

    it('adds a new format node to an existing style-rule', () => {
        const xml = `<style-rule element='worksheet'>\n    <format attr='font-size' value='10' />\n</style-rule>`;
        const result = applyThemeEditsToXml(xml, { worksheet: { 'font-color': '#d16302' } });
        expect(result).toContain(`attr='font-color' value='#d16302'`);
        expect(result).toContain(`attr='font-size' value='10'`);
    });

    it('creates a new style-rule block when element does not exist', () => {
        const xml = `<workbook><other /></workbook>`;
        const result = applyThemeEditsToXml(xml, { tooltip: { 'font-size': '12' } });
        expect(result).toContain(`element='tooltip'`);
        expect(result).toContain(`attr='font-size' value='12'`);
    });

    it('removes a format node when value is null', () => {
        const xml = `<style-rule element='worksheet'>\n    <format attr='font-size' value='14' />\n    <format attr='font-color' value='#333' />\n</style-rule>`;
        const result = applyThemeEditsToXml(xml, { worksheet: { 'font-size': null } });
        expect(result).not.toContain(`attr='font-size'`);
        expect(result).toContain(`attr='font-color'`);
    });

    it('is a no-op when removing a value that does not exist', () => {
        const xml = `<workbook></workbook>`;
        const result = applyThemeEditsToXml(xml, { worksheet: { 'font-size': null } });
        expect(result).toBe(xml);
    });
});

// ── xmlToThemeJson ───────────────────────────────────────────────────────────

describe('xmlToThemeJson', () => {
    it('generates a valid theme JSON object from XML', () => {
        const xml = `
            <style-rule element='worksheet'>
                <format attr='font-size' value='14' />
                <format attr='font-color' value='#d16302' />
            </style-rule>`;
        const result = xmlToThemeJson(xml) as Record<string, unknown>;
        expect(result['version']).toBe('1.0.0');
        expect(result['base-theme']).toBe('smooth');
        const styles = result['styles'] as Record<string, unknown>;
        expect(styles['worksheet']).toEqual({ 'font-size': 14, 'font-color': '#d16302' });
    });

    it('casts font-size and line-width to integers', () => {
        const xml = `<style-rule element='gridline'><format attr='line-width' value='2' /></style-rule>`;
        const result = xmlToThemeJson(xml) as { styles: Record<string, Record<string, unknown>> };
        expect(result.styles['gridline']['line-width']).toBe(2);
        expect(typeof result.styles['gridline']['line-width']).toBe('number');
    });

    it('omits elements with no set attributes', () => {
        const xml = `<workbook></workbook>`;
        const result = xmlToThemeJson(xml) as { styles: Record<string, unknown> };
        expect(Object.keys(result.styles)).toHaveLength(0);
    });
});

// ── validateThemeJson ────────────────────────────────────────────────────────

describe('validateThemeJson', () => {
    it('returns null for a valid theme', () => {
        const theme = { version: '1.0.0', 'base-theme': 'smooth', styles: { worksheet: { 'font-size': 14 } } };
        expect(validateThemeJson(theme)).toBeNull();
    });

    it('rejects missing version', () => {
        expect(validateThemeJson({ 'base-theme': 'smooth', styles: {} })).toMatch(/version/);
    });

    it('rejects unknown style element', () => {
        const theme = { version: '1.0.0', 'base-theme': 'smooth', styles: { 'made-up': { 'font-size': 10 } } };
        expect(validateThemeJson(theme)).toMatch(/made-up/);
    });

    it('rejects non-integer font-size', () => {
        const theme = { version: '1.0.0', 'base-theme': 'smooth', styles: { worksheet: { 'font-size': '14' } } };
        expect(validateThemeJson(theme)).toMatch(/integer/);
    });

    it('rejects invalid hex color', () => {
        const theme = { version: '1.0.0', 'base-theme': 'smooth', styles: { worksheet: { 'font-color': 'red' } } };
        expect(validateThemeJson(theme)).toMatch(/hex/);
    });
});

// ── applyThemeJsonToXml ──────────────────────────────────────────────────────

describe('applyThemeJsonToXml', () => {
    const theme = {
        version: '1.0.0',
        'base-theme': 'smooth',
        styles: { worksheet: { 'font-size': 14, 'font-color': '#d16302' } }
    };

    it('applies theme values to XML in override mode', () => {
        const xml = `<style-rule element='worksheet'><format attr='font-size' value='10' /></style-rule>`;
        const result = applyThemeJsonToXml(xml, theme, 'override');
        expect(result).toContain(`attr='font-size' value='14'`);
        expect(result).toContain(`attr='font-color' value='#d16302'`);
    });

    it('skips existing values in preserve mode', () => {
        const xml = `<style-rule element='worksheet'><format attr='font-size' value='10' /></style-rule>`;
        const result = applyThemeJsonToXml(xml, theme, 'preserve');
        expect(result).toContain(`attr='font-size' value='10'`);
        expect(result).toContain(`attr='font-color' value='#d16302'`);
    });

    it('applies values not present in XML even in preserve mode', () => {
        const xml = `<workbook></workbook>`;
        const result = applyThemeJsonToXml(xml, theme, 'preserve');
        expect(result).toContain(`attr='font-size' value='14'`);
    });

    it('returns xml unchanged when theme has no styles', () => {
        const xml = `<workbook></workbook>`;
        const result = applyThemeJsonToXml(xml, { version: '1.0.0', 'base-theme': 'smooth', styles: {} }, 'override');
        expect(result).toBe(xml);
    });
});
