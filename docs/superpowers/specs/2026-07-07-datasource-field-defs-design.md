# Datasource → Field Definitions (fields.d.twbl) — Design

**Date:** 2026-07-07
**Status:** Approved (implemented same day)

## Goal

Click a datasource in the Tableau Tools sidebar and generate a workspace
`fields.d.twbl` from that datasource's fields, in the exact format the LSP's
`FieldParser` consumes — so hover, completion, and lint become aware of the
workbook's real fields ("full loop", per user decision).

## Components

1. **Sidebar UI** (`media/parsingGuideSidebar.js`)
   Each datasource row in Workbook → Datasources gets a hover action button
   (`#i-field` icon, `data-action="generate-field-defs"`). Click posts
   `{ type: 'generateFieldDefs', datasource: <caption> }`.

2. **Generator** (`src/extract/fieldDefsGenerator.ts`)
   Pure functions, unit-tested:
   - `mapDatatype`: integer/real→Number, string→String, boolean→Boolean,
     date→Date, datetime→DateTime, spatial→Spatial, else String.
   - `generateFieldDefsSection`: JSDoc description + `[Name] = Type` per
     field; dedupe by display name (case-insensitive); skip names containing
     `]`; caption preferred over internal name.
   - `upsertDatasourceSection`: per-datasource marker sections
     (`// === Datasource: X ===` … `// === End: X ===`); regenerating one
     datasource replaces only its own section.

3. **View handler** (`src/views/parsingGuideView.ts`)
   `postWorkbookData` caches the extracted fields; `generateFieldDefinitions`
   filters by datasource label, upserts `<workspaceRoot>/fields.d.twbl`,
   opens the file, reports status in the sidebar.

4. **Server integration** (`src/fieldParser.ts`, `src/server.ts`)
   - `FieldParser.setOverlayPath`: a second definition file parsed after the
     bundled one, so workspace definitions win on name clashes; missing file
     is skipped silently.
   - `onInitialize` resolves the first workspace folder and calls
     `setupWorkspaceFieldDefinitions`: sets the overlay and watches the
     workspace root (debounced 100 ms) so edits — or the file first
     appearing — reload definitions and clear hover/completion caches
     without a restart.

## Constraints honored

- `.d.twbl` files are already excluded from diagnostics and the Copy CodeLens.
- No re-parse on click: fields come from the cached sidebar extraction.
- Errors surface as sidebar status messages (no workbook / no folder / write
  failure).

## Testing

`src/extract/fieldDefsGenerator.test.ts`: format, type mapping, dedupe,
skip rules, section create/append/replace. Existing `fieldParser` unit tests
confirm the overlay change doesn't regress parsing.
