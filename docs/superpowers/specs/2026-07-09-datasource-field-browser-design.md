# Datasource Field Browser — Design

**Date:** 2026-07-09
**Status:** Approved (user-approved in session; bracketed copy format chosen)

## Summary

Clicking a datasource row in the sidebar's Workbook section expands a dropdown
listing its plain fields (calculations, parameters, internal object-model and
file-relation columns excluded) with each field's datatype. Clicking a field
copies `[Field Name]` to the clipboard, ready to paste into a Tableau
calculation. A copy-all button on the datasource row copies every field name,
bracketed, one per line. The existing `fields.d.twbl` button is unchanged.

## Changes

- `src/extract/types.ts` — `ExtractedField` gains `isCalculation` /
  `isParameter` flags.
- `src/extract/xml.ts` — `extractFieldsFromXml` now walks the whole datasource
  subtree recursively: ordinary fields live inside `<connection><relation>`
  (often FCP-mangled tags), not as direct datasource children, and
  metadata-records fill in fields with no `<column>` element. Duplicate
  declarations dedupe per datasource, preferring the captioned (renamed) one.
- `src/types/workbook.ts` — `RichWorkbookData.datasources[]` entries gain a
  `fields` array (name/datatype/role), filtered and deduped extension-side in
  `postWorkbookData`.
- `src/views/parsingGuideView.ts` — grouping + filtering in the payload;
  dropdown CSS; new `i-copy` sprite.
- `media/parsingGuideSidebar.js` — `renderDatasources` renders the chevroned
  row, copy-all button, and hidden fields panel; delegation gains
  `toggle-ds-fields`, `copy-ds-fields`, `copy-field` actions reusing the
  `copyFormula` message and status toast.

## Validation

- `extractFields.test.ts`: flag detection, FCP-nested relation columns,
  metadata-record fallback, captioned-declaration dedupe.
- Grouping simulated against real workbooks: Test.twb 1→6 fields,
  Tableau.twb per-datasource 54/43/58, file-relation `table` columns excluded.
