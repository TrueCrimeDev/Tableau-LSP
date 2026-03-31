import { stripFormattingXml, FormatStripOptions } from '../../parsers/formatStripper.js';

const none: FormatStripOptions = { borders: false, bold: false, fontSize: false, fontColor: false };

describe('stripFormattingXml — borders', () => {
    it('sets border-style value to none', () => {
        const xml = `<format attr='border-style' value='solid' />`;
        const result = stripFormattingXml(xml, { ...none, borders: true });
        expect(result).toBe(`<format attr='border-style' value='none' />`);
    });

    it('sets border-style to none when scope qualifier is present', () => {
        const xml = `<format attr='border-style' scope='rows' value='solid' />`;
        const result = stripFormattingXml(xml, { ...none, borders: true });
        expect(result).toBe(`<format attr='border-style' scope='rows' value='none' />`);
    });

    it('sets border-style to none when data-class qualifier is present', () => {
        const xml = `<format attr='border-style' data-class='total' value='solid' />`;
        const result = stripFormattingXml(xml, { ...none, borders: true });
        expect(result).toBe(`<format attr='border-style' data-class='total' value='none' />`);
    });

    it('sets border-width value to 0', () => {
        const xml = `<format attr='border-width' scope='cols' value='2' />`;
        const result = stripFormattingXml(xml, { ...none, borders: true });
        expect(result).toBe(`<format attr='border-width' scope='cols' value='0' />`);
    });

    it('removes border-color lines', () => {
        const xml = `            <format attr='border-color' value='#e6e6e6' />\n`;
        const result = stripFormattingXml(xml, { ...none, borders: true });
        expect(result).toBe('');
    });

    it('does not touch border attrs when borders option is false', () => {
        const xml = `<format attr='border-style' value='solid' />`;
        const result = stripFormattingXml(xml, none);
        expect(result).toBe(xml);
    });
});

describe('stripFormattingXml — bold', () => {
    it('removes font-bold lines', () => {
        const xml = `            <format attr='font-bold' value='true' />\n`;
        const result = stripFormattingXml(xml, { ...none, bold: true });
        expect(result).toBe('');
    });

    it('does not remove font-bold when bold option is false', () => {
        const xml = `<format attr='font-bold' value='true' />`;
        const result = stripFormattingXml(xml, none);
        expect(result).toBe(xml);
    });
});

describe('stripFormattingXml — fontSize', () => {
    it('removes font-size lines', () => {
        const xml = `            <format attr='font-size' value='10' />\n`;
        const result = stripFormattingXml(xml, { ...none, fontSize: true });
        expect(result).toBe('');
    });

    it('removes font-size with field qualifier', () => {
        const xml = `            <format attr='font-size' field='[sqlproxy.abc].[mn:Date:ok]' value='9' />\n`;
        const result = stripFormattingXml(xml, { ...none, fontSize: true });
        expect(result).toBe('');
    });
});

describe('stripFormattingXml — fontColor', () => {
    it('removes font-color lines', () => {
        const xml = `            <format attr='font-color' value='#333333' />\n`;
        const result = stripFormattingXml(xml, { ...none, fontColor: true });
        expect(result).toBe('');
    });

    it('removes color attr lines', () => {
        const xml = `            <format attr='color' data-class='subtotal' value='#555555' />\n`;
        const result = stripFormattingXml(xml, { ...none, fontColor: true });
        expect(result).toBe('');
    });

    it('does NOT remove palette <color> entries', () => {
        const xml = `    <color>#ff0000</color>\n`;
        const result = stripFormattingXml(xml, { ...none, fontColor: true });
        expect(result).toBe(xml);
    });

    it('does NOT remove field color encoding nodes', () => {
        const xml = `<color column='[sqlproxy.abc].[none:Case Type:nk]' />`;
        const result = stripFormattingXml(xml, { ...none, fontColor: true });
        expect(result).toBe(xml);
    });
});

describe('stripFormattingXml — no-op when all options false', () => {
    it('returns the xml unchanged', () => {
        const xml = `<format attr='border-style' value='solid' />\n<format attr='font-bold' value='true' />`;
        expect(stripFormattingXml(xml, none)).toBe(xml);
    });
});

describe('stripFormattingXml — realistic multi-line block', () => {
    it('strips all four categories in one pass', () => {
        const xml = [
            `            <format attr='border-style' value='solid' />`,
            `            <format attr='border-width' scope='cols' value='2' />`,
            `            <format attr='border-color' value='#e6e6e6' />`,
            `            <format attr='font-bold' value='true' />`,
            `            <format attr='font-size' value='10' />`,
            `            <format attr='font-color' value='#333333' />`,
        ].join('\n') + '\n';

        const result = stripFormattingXml(xml, { borders: true, bold: true, fontSize: true, fontColor: true });

        expect(result).toContain(`value='none'`);    // border-style
        expect(result).toContain(`value='0'`);       // border-width
        expect(result).not.toContain('border-color');
        expect(result).not.toContain('font-bold');
        expect(result).not.toContain('font-size');
        expect(result).not.toContain('font-color');
    });
});
