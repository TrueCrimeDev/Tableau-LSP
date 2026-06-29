import { parsePalettes } from '../../preferences/preferencesFile.js';

// ── parsePalettes ────────────────────────────────────────────────────────────

describe('parsePalettes', () => {
    it('parses a single-quoted palette from a .twb workbook', () => {
        const xml = `
            <color-palette custom='true' name='CrossRegional' type='regular'>
                <color>#3597d4</color>
                <color>#f49d1c</color>
                <color>#20a286</color>
            </color-palette>`;
        const result = parsePalettes(xml);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('CrossRegional');
        expect(result[0].type).toBe('regular');
        expect(result[0].colors).toEqual(['#3597D4', '#F49D1C', '#20A286']);
    });

    it('parses a double-quoted palette from a Preferences.tps file', () => {
        const xml = `
            <color-palette name="MyPalette" type="ordered-sequential">
                <color>#ff0000</color>
                <color>#00ff00</color>
            </color-palette>`;
        const result = parsePalettes(xml);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('MyPalette');
        expect(result[0].type).toBe('ordered-sequential');
    });

    it('parses multiple palettes with mixed quote styles', () => {
        const xml = `
            <color-palette custom='true' name='CrossRegional' type='regular'>
                <color>#3597d4</color>
                <color>#f49d1c</color>
            </color-palette>
            <color-palette custom='true' name='RedBlackBlackBlackGreen' type='ordered-diverging'>
                <color>#ff0000</color>
                <color>#000000</color>
                <color>#00be02</color>
            </color-palette>`;
        const result = parsePalettes(xml);
        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('CrossRegional');
        expect(result[0].colors).toHaveLength(2);
        expect(result[1].name).toBe('RedBlackBlackBlackGreen');
        expect(result[1].type).toBe('ordered-diverging');
        expect(result[1].colors).toHaveLength(3);
    });

    it('returns empty array when no palettes present', () => {
        expect(parsePalettes('<workbook></workbook>')).toEqual([]);
        expect(parsePalettes('')).toEqual([]);
    });

    it('skips palette blocks with no name attribute', () => {
        const xml = `
            <color-palette type='regular'>
                <color>#aabbcc</color>
            </color-palette>
            <color-palette name='Valid' type='regular'>
                <color>#112233</color>
            </color-palette>`;
        const result = parsePalettes(xml);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Valid');
    });

    it('handles a palette with no colors', () => {
        const xml = `<color-palette name='Empty' type='regular'></color-palette>`;
        const result = parsePalettes(xml);
        expect(result).toHaveLength(1);
        expect(result[0].colors).toEqual([]);
    });

    it('is case-insensitive on attribute names', () => {
        const xml = `<color-palette NAME='CaseTest' TYPE='regular'><color>#abcdef</color></color-palette>`;
        const result = parsePalettes(xml);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('CaseTest');
    });
});
