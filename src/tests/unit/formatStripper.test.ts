import { stripFormattingXml, scanFormattingXml, suppressInheritedBorders, FormatStripOptions } from '../../parsers/formatStripper.js';

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

    it('sets div-level value to 0', () => {
        const xml = `<format attr='div-level' scope='rows' value='2' />`;
        const result = stripFormattingXml(xml, { ...none, borders: true });
        expect(result).toBe(`<format attr='div-level' scope='rows' value='0' />`);
    });

    it('sets div-level to 0 for cols scope', () => {
        const xml = `<format attr='div-level' scope='cols' value='1' />`;
        const result = stripFormattingXml(xml, { ...none, borders: true });
        expect(result).toBe(`<format attr='div-level' scope='cols' value='0' />`);
    });

    it('sets stroke-color scope=rows to none', () => {
        const xml = `<format attr='stroke-color' scope='rows' value='#000000' />`;
        const result = stripFormattingXml(xml, { ...none, borders: true });
        expect(result).toBe(`<format attr='stroke-color' scope='rows' value='none' />`);
    });

    it('sets stroke-color scope=cols to none', () => {
        const xml = `<format attr='stroke-color' scope='cols' value='#000000' />`;
        const result = stripFormattingXml(xml, { ...none, borders: true });
        expect(result).toBe(`<format attr='stroke-color' scope='cols' value='none' />`);
    });

    it('does NOT touch stroke-color without row/col scope (axis/gridline lines)', () => {
        const xml = `            <format attr='stroke-color' value='#e6e6e681' />\n`;
        const result = stripFormattingXml(xml, { ...none, borders: true });
        expect(result).toBe(xml);
    });

    it('strips a realistic table-div block', () => {
        const xml = [
            `          <style-rule element='table-div'>`,
            `            <format attr='stroke-color' scope='rows' value='#000000' />`,
            `            <format attr='stroke-color' scope='cols' value='#000000' />`,
            `            <format attr='div-level' scope='cols' value='1' />`,
            `            <format attr='div-level' scope='rows' value='2' />`,
            `          </style-rule>`,
        ].join('\n') + '\n';

        const result = stripFormattingXml(xml, { ...none, borders: true });

        expect(result).toContain(`attr='stroke-color' scope='rows' value='none'`);
        expect(result).toContain(`attr='stroke-color' scope='cols' value='none'`);
        expect(result).toContain(`attr='div-level' scope='cols' value='0'`);
        expect(result).toContain(`attr='div-level' scope='rows' value='0'`);
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

describe('scanFormattingXml — borders', () => {
    it('counts border-style nodes and collects unique values', () => {
        const xml = [
            `<format attr='border-style' value='solid' />`,
            `<format attr='border-style' value='none' />`,
            `<format attr='border-style' value='solid' />`,
        ].join('\n');
        const result = scanFormattingXml(xml);
        expect(result.borders.count).toBe(3);
        expect(result.borders.values).toEqual(['none', 'solid']);
    });

    it('counts border-width, border-color, div-level nodes', () => {
        const xml = [
            `<format attr='border-width' scope='cols' value='2' />`,
            `<format attr='border-color' value='#e6e6e6' />`,
            `<format attr='div-level' scope='rows' value='1' />`,
        ].join('\n');
        const result = scanFormattingXml(xml);
        expect(result.borders.count).toBe(3);
        expect(result.borders.values).toContain('2');
        expect(result.borders.values).toContain('#e6e6e6');
        expect(result.borders.values).toContain('1');
    });

    it('counts scoped stroke-color nodes (rows/cols)', () => {
        const xml = [
            `<format attr='stroke-color' scope='rows' value='#000000' />`,
            `<format attr='stroke-color' scope='cols' value='#000000' />`,
        ].join('\n');
        const result = scanFormattingXml(xml);
        expect(result.borders.count).toBe(2);
        expect(result.borders.values).toEqual(['#000000']);
    });

    it('does NOT count unscoped stroke-color (axis/gridline)', () => {
        const xml = `<format attr='stroke-color' value='#e6e6e681' />`;
        const result = scanFormattingXml(xml);
        expect(result.borders.count).toBe(0);
    });

    it('returns count 0 and empty values when no border nodes present', () => {
        const xml = `<format attr='font-bold' value='true' />`;
        const result = scanFormattingXml(xml);
        expect(result.borders.count).toBe(0);
        expect(result.borders.values).toEqual([]);
    });
});

describe('scanFormattingXml — bold', () => {
    it('counts font-bold nodes and collects unique values', () => {
        const xml = [
            `<format attr='font-bold' value='true' />`,
            `<format attr='font-bold' value='true' />`,
        ].join('\n');
        const result = scanFormattingXml(xml);
        expect(result.bold.count).toBe(2);
        expect(result.bold.values).toEqual(['true']);
    });
});

describe('scanFormattingXml — fontSize', () => {
    it('counts font-size nodes and collects unique values', () => {
        const xml = [
            `<format attr='font-size' value='9' />`,
            `<format attr='font-size' value='10' />`,
            `<format attr='font-size' value='10' />`,
        ].join('\n');
        const result = scanFormattingXml(xml);
        expect(result.fontSize.count).toBe(3);
        expect(result.fontSize.values).toEqual(['10', '9']);
    });
});

describe('scanFormattingXml — fontColor', () => {
    it('counts font-color nodes', () => {
        const xml = [
            `<format attr='font-color' value='#333333' />`,
            `<format attr='font-color' value='#555555' />`,
        ].join('\n');
        const result = scanFormattingXml(xml);
        expect(result.fontColor.count).toBe(2);
        expect(result.fontColor.values).toEqual(['#333333', '#555555']);
    });

    it('counts attr=color format nodes', () => {
        const xml = `<format attr='color' data-class='subtotal' value='#555555' />`;
        const result = scanFormattingXml(xml);
        expect(result.fontColor.count).toBe(1);
        expect(result.fontColor.values).toEqual(['#555555']);
    });

    it('does NOT count palette <color> entries', () => {
        const xml = `    <color>#ff0000</color>`;
        const result = scanFormattingXml(xml);
        expect(result.fontColor.count).toBe(0);
    });

    it('does NOT count field color encoding nodes', () => {
        const xml = `<color column='[sqlproxy.abc].[none:Case Type:nk]' />`;
        const result = scanFormattingXml(xml);
        expect(result.fontColor.count).toBe(0);
    });
});

describe('scanFormattingXml — mixed document', () => {
    it('scans all four categories independently', () => {
        const xml = [
            `<format attr='border-style' value='solid' />`,
            `<format attr='font-bold' value='true' />`,
            `<format attr='font-size' value='10' />`,
            `<format attr='font-color' value='#333333' />`,
        ].join('\n');
        const result = scanFormattingXml(xml);
        expect(result.borders.count).toBe(1);
        expect(result.bold.count).toBe(1);
        expect(result.fontSize.count).toBe(1);
        expect(result.fontColor.count).toBe(1);
    });
});

describe('suppressInheritedBorders', () => {
    const LF = '\n';

    function worksheet(tableInner: string): string {
        return [
            `<worksheet name='Sheet 1'>`,
            `  <table>`,
            tableInner,
            `  </table>`,
            `</worksheet>`,
        ].join(LF);
    }

    it('inserts a full style block when the table has none', () => {
        const xml = worksheet(`    <view />${LF}    <panes>${LF}      <pane>${LF}        <style>${LF}          <style-rule element='pane'>${LF}            <format attr='minwidth' value='-1' />${LF}          </style-rule>${LF}        </style>${LF}      </pane>${LF}    </panes>`);
        const result = suppressInheritedBorders(xml);
        expect(result).toContain(`<style-rule element='cell'>`);
        expect(result).toContain(`<style-rule element='header'>`);
        expect(result).toContain(`<style-rule element='table-div'>`);
        expect(result).toContain(`<format attr='border-style' value='none' />`);
        expect(result).toContain(`<format attr='border-width' value='0' />`);
        expect(result).toContain(`<format attr='div-level' scope='cols' value='0' />`);
        expect(result).toContain(`<format attr='div-level' scope='rows' value='0' />`);
        // The new style block must precede <panes>, and the pane-level style is untouched
        expect(result.indexOf(`<style-rule element='cell'>`)).toBeLessThan(result.indexOf('<panes>'));
        expect(result).toContain(`<format attr='minwidth' value='-1' />`);
    });

    it('adds missing formats into an existing style-rule without duplicating', () => {
        const xml = worksheet([
            `    <style>`,
            `      <style-rule element='cell'>`,
            `        <format attr='width' value='66' />`,
            `      </style-rule>`,
            `    </style>`,
        ].join(LF));
        const result = suppressInheritedBorders(xml);
        // border-style inserted into the existing cell rule
        const cellRule = result.match(/<style-rule element='cell'>[\s\S]*?<\/style-rule>/)?.[0] ?? '';
        expect(cellRule).toContain(`<format attr='border-style' value='none' />`);
        expect(cellRule).toContain(`<format attr='width' value='66' />`);
        // header/pane/table-div rules appended
        expect(result).toContain(`<style-rule element='header'>`);
        expect(result).toContain(`<style-rule element='pane'>`);
        expect(result).toContain(`<style-rule element='table-div'>`);
        // exactly one cell rule
        expect(result.match(/<style-rule element='cell'>/g)).toHaveLength(1);
    });

    it('leaves existing explicit border values alone (strip regexes handle them)', () => {
        const xml = worksheet([
            `    <style>`,
            `      <style-rule element='cell'>`,
            `        <format attr='border-style' value='solid' />`,
            `      </style-rule>`,
            `    </style>`,
        ].join(LF));
        const result = suppressInheritedBorders(xml);
        expect(result.match(/attr='border-style'/g)).toHaveLength(3); // cell(existing) + header + pane
        expect(result).toContain(`<format attr='border-style' value='solid' />`);
    });

    it('processes every worksheet independently', () => {
        const xml = [
            worksheet(`    <style>${LF}    </style>`),
            worksheet(`    <style>${LF}    </style>`).replace("Sheet 1", "Sheet 2"),
        ].join(LF);
        const result = suppressInheritedBorders(xml);
        expect(result.match(/<style-rule element='table-div'>/g)).toHaveLength(2);
    });

    it('does not touch workbook-level style outside worksheets', () => {
        const workbookStyle = [
            `<style>`,
            `  <style-rule element='cell'>`,
            `    <format attr='background-color' value='#ffffff' />`,
            `  </style-rule>`,
            `</style>`,
        ].join(LF);
        const xml = `${workbookStyle}${LF}${worksheet(`    <style>${LF}    </style>`)}`;
        const result = suppressInheritedBorders(xml);
        const wbStyleAfter = result.slice(0, result.indexOf('<worksheet'));
        expect(wbStyleAfter).not.toContain('border-style');
    });

    it('preserves CRLF line endings', () => {
        const xml = worksheet(`    <style>${LF}    </style>`).replace(/\n/g, '\r\n');
        const result = suppressInheritedBorders(xml);
        expect(result).toContain(`<format attr='border-style' value='none' />\r\n`);
        expect(result.replace(/\r\n/g, '')).not.toContain('\n');
    });

    it('runs as part of stripFormattingXml borders pass', () => {
        const xml = worksheet(`    <style>${LF}    </style>`);
        const result = stripFormattingXml(xml, { borders: true, bold: false, fontSize: false, fontColor: false });
        expect(result).toContain(`<format attr='border-style' value='none' />`);
        expect(result).toContain(`<format attr='div-level' scope='rows' value='0' />`);
    });
});

describe('stripFormattingXml — regex gap fixes', () => {
    const bordersOnly: FormatStripOptions = { borders: true, bold: false, fontSize: false, fontColor: false };

    it('strips stroke-color when value precedes scope', () => {
        const xml = `<format attr='stroke-color' value='#000000' scope='rows' />`;
        const result = stripFormattingXml(xml, bordersOnly);
        expect(result).toBe(`<format attr='stroke-color' value='none' scope='rows' />`);
    });

    it('removes non-self-closing border-color nodes', () => {
        const xml = `  <format attr='border-color' value='#000000'></format>\nrest`;
        const result = stripFormattingXml(xml, bordersOnly);
        expect(result).toBe('rest');
    });

    it('still leaves unscoped stroke-color untouched', () => {
        const xml = `<format attr='stroke-color' value='#000000' />`;
        const result = stripFormattingXml(xml, bordersOnly);
        expect(result).toBe(xml);
    });
});
