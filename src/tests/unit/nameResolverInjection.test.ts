/**
 * Regression test: a field caption is used as the *replacement string* of
 * String.replace, where `$\`` and `$&` are substitution patterns. A caption is
 * workbook-controlled, so a crafted one made the resolved XML grow
 * multiplicatively on each mapping — 3 KB of input reached hundreds of MB and
 * hung the extension host.
 */
import { resolveNames } from '../../extract/nameResolver.js';

function workbookWithCalcCaptions(captions: string[]): string {
    const columns = captions
        .map(
            (caption, i) =>
                `<column caption='${caption}' datatype='real' name='[Calculation_${String(i + 1)}]' role='measure'>` +
                `<calculation class='tableau' formula='[Calculation_${String(i + 1)}] + [Calculation_${String(i + 1)}]' />` +
                `</column>`
        )
        .join('\n      ');
    return `<?xml version='1.0' encoding='utf-8' ?>
<workbook version='18.1'>
  <datasources>
    <datasource caption='Sample' name='federated.abc'>
      ${columns}
    </datasource>
  </datasources>
  <worksheets />
</workbook>`;
}

describe('resolveNames with hostile captions', () => {
    it('does not amplify output when a caption contains a $ substitution pattern', () => {
        const xml = workbookWithCalcCaptions(['$`', '$`', '$`', '$`']);
        const resolved = resolveNames(xml);
        // Some growth is legitimate (a name is longer than [Calculation_N]).
        // Anything near an order of magnitude is the substitution bug.
        expect(resolved.length).toBeLessThan(xml.length * 3);
    });

    it('preserves a literal $ in a caption', () => {
        const xml = workbookWithCalcCaptions(['Total $ Sales']);
        expect(resolveNames(xml)).toContain('Total $ Sales');
    });
});
