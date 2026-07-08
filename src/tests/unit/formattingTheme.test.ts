import * as fs from 'fs';
import * as path from 'path';
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

// ── readThemeFromXml: real Tableau-native schema ─────────────────────────────

describe('readThemeFromXml (Tableau-native schema)', () => {
    it('maps table-div scope=rows/cols to row-divider/column-divider', () => {
        const xml = `
            <style-rule element='table-div'>
                <format attr='line-visibility' scope='rows' value='on' />
                <format attr='line-pattern-only' scope='rows' value='solid' />
                <format attr='stroke-size' scope='rows' value='2' />
                <format attr='stroke-color' scope='rows' value='#e6e6e6' />
                <format attr='line-visibility' scope='cols' value='off' />
                <format attr='stroke-size' scope='cols' value='0' />
            </style-rule>`;
        const t = readThemeFromXml(xml);
        expect(t['row-divider']).toEqual({
            'line-visibility': 'on', 'line-pattern': 'solid', 'line-width': '2', 'line-color': '#e6e6e6',
        });
        expect(t['column-divider']).toEqual({ 'line-visibility': 'off', 'line-width': '0' });
    });

    it('maps gridline stroke-* to line-* attributes', () => {
        const xml = `
            <style-rule element='gridline'>
                <format attr='stroke-color' scope='rows' value='#c0c0c034' />
                <format attr='stroke-size' scope='rows' value='1' />
                <format attr='line-visibility' scope='rows' value='on' />
            </style-rule>`;
        expect(readThemeFromXml(xml)['gridline']).toEqual({
            'line-color': '#c0c0c034', 'line-width': '1', 'line-visibility': 'on',
        });
    });

    it('maps pane band-color to row banding and pane border-* to table-border', () => {
        const xml = `
            <style-rule element='pane'>
                <format attr='band-color' scope='rows' value='#eef0f2' />
                <format attr='border-color' value='#e6e6e6' />
                <format attr='border-width' value='1' />
                <format attr='border-style' value='solid' />
            </style-rule>`;
        const t = readThemeFromXml(xml);
        expect(t['inner-row-banding']).toEqual({ 'background-color': '#eef0f2' });
        expect(t['table-border']).toEqual({ 'line-color': '#e6e6e6', 'line-width': '1', 'line-pattern': 'solid' });
    });

    it('maps mark, all (color), and title element names', () => {
        const xml = `
            <style-rule element='mark'><format attr='mark-color' value='#e6e6e6' /></style-rule>
            <style-rule element='all'><format attr='color' value='#555555' /></style-rule>
            <style-rule element='title'><format attr='font-size' value='12' /></style-rule>`;
        const t = readThemeFromXml(xml);
        expect(t['mark']?.['mark-color']).toBe('#e6e6e6');
        expect(t['all']?.['font-color']).toBe('#555555');
        expect(t['worksheet-title']?.['font-size']).toBe('12');
    });

    it('populates borders/dividers/shading from the real Tableau.twb fixture', () => {
        const fixture = path.join(process.cwd(), 'Tableau', 'Tableau.twb');
        if (!fs.existsSync(fixture)) { return; } // skip when fixture is absent
        const t = readThemeFromXml(fs.readFileSync(fixture, 'utf8'));
        expect(t['row-divider']?.['line-color']).toBe('#e6e6e6');
        expect(t['gridline']?.['line-color']).toBeDefined();
        expect(t['mark']?.['mark-color']).toBeDefined();
        expect(t['table-border']?.['line-color']).toBeDefined();
        expect(t['inner-row-banding']?.['background-color']).toBeDefined();
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

// ── applyThemeEditsToXml: Tableau-native write-back ──────────────────────────

describe('applyThemeEditsToXml (Tableau-native write)', () => {
    it('writes a row-divider edit as table-div stroke-color scope=rows', () => {
        const xml = `<style-rule element='table-div'>\n    <format attr='stroke-color' scope='rows' value='#000000' />\n</style-rule>`;
        const out = applyThemeEditsToXml(xml, { 'row-divider': { 'line-color': '#ff0000' } });
        expect(out).toContain(`attr='stroke-color' scope='rows' value='#ff0000'`);
        expect(out).not.toContain(`element='row-divider'`);
    });

    it('adds a column-divider into the existing table-div block without duplicating it', () => {
        const xml = `<workbook><style-rule element='table-div'>\n    <format attr='stroke-color' scope='rows' value='#000' />\n</style-rule></workbook>`;
        const out = applyThemeEditsToXml(xml, { 'column-divider': { 'line-color': '#abcdef' } });
        expect(out).toContain(`scope='cols'`);
        expect((out.match(/element='table-div'/g) || []).length).toBe(1);
    });

    it('writes table-border via pane border-* and banding via pane band-color', () => {
        const out = applyThemeEditsToXml('<workbook></workbook>', {
            'table-border': { 'line-color': '#123456', 'line-width': '2' },
            'inner-row-banding': { 'background-color': '#eeeeee' },
        });
        expect(out).toContain(`element='pane'`);
        expect(out).toContain(`attr='border-color' value='#123456'`);
        expect(out).toContain(`attr='border-width' value='2'`);
        expect(out).toContain(`attr='band-color' scope='rows' value='#eeeeee'`);
    });

    it('round-trips edits: write panel values, read them back unchanged', () => {
        const edits: WorkbookTheme = {
            'row-divider': { 'line-color': '#ff0000', 'line-width': '3', 'line-pattern': 'solid' },
            'column-divider': { 'line-color': '#00ff00' },
            'table-border': { 'line-color': '#0000ff' },
            'gridline': { 'line-color': '#cccccc', 'line-visibility': 'on' },
            'inner-row-banding': { 'background-color': '#eeeeee' },
            'worksheet-title': { 'font-size': '18' },
        };
        const xml = applyThemeEditsToXml('<workbook></workbook>', edits);
        const back = readThemeFromXml(xml);
        expect(back['row-divider']).toMatchObject({ 'line-color': '#ff0000', 'line-width': '3', 'line-pattern': 'solid' });
        expect(back['column-divider']?.['line-color']).toBe('#00ff00');
        expect(back['table-border']?.['line-color']).toBe('#0000ff');
        expect(back['gridline']).toMatchObject({ 'line-color': '#cccccc', 'line-visibility': 'on' });
        expect(back['inner-row-banding']?.['background-color']).toBe('#eeeeee');
        expect(back['worksheet-title']?.['font-size']).toBe('18');
    });

    it('round-trips an edit through the real Tableau.twb fixture', () => {
        const fixture = path.join(process.cwd(), 'Tableau', 'Tableau.twb');
        if (!fs.existsSync(fixture)) { return; }
        const edited = applyThemeEditsToXml(fs.readFileSync(fixture, 'utf8'), { 'row-divider': { 'line-color': '#abcdef' } });
        expect(edited).toContain(`attr='stroke-color' scope='rows' value='#abcdef'`);
        expect(edited).not.toContain(`element='row-divider'`);
        expect(readThemeFromXml(edited)['row-divider']?.['line-color']).toBe('#abcdef');
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
