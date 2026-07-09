# Field-Swap Hover — Design

**Date:** 2026-07-09
**Status:** Approved (user-approved in session; same-type-first list chosen)

## Summary

Hovering a `[Field]` reference in a `.twbl` calculation shows the field's
datatype/role/datasource plus clickable links to swap the reference for
another datasource field, in place. Fields sharing the hovered field's
datatype lead the list (6 max), then a short "other fields" row (4 max),
with `+N more` overflow. Clicking a link replaces the `[...]` token via a
WorkspaceEdit (single undo step).

## Why client-side

The LSP server provides the existing function/keyword hovers, but LSP hover
markdown is untrusted — command links will not execute. This feature is a
second, client-side `HoverProvider` (VS Code merges both into one popup)
returning a `MarkdownString` with `isTrusted: { enabledCommands: [swap] }`,
so only the swap command is executable from the hover.

## Components

- `src/services/fieldCatalog.ts` — module-level catalog of plain fields
  (name/datatype/role/datasource), deduped by datasource+name.
  `parseFieldDefs` parses generated `fields.d.twbl` declarations as fallback.
- `src/providers/fieldSwapHover.ts` — `findBracketToken` (token under
  cursor), `orderSwapCandidates` (same-type-first split), hover provider,
  and the `tableau-language-support.swapFieldReference` command
  (args: uri, line, start, end, replacement name).
- `src/views/parsingGuideView.ts` — pushes the catalog on every workbook
  parse using the same plain-field filter as the datasource field browser.
- `src/extension.ts` — `registerFieldSwapFeature(context)`.

## Catalog sourcing

1. Live: last workbook parsed by the sidebar (richest — datatypes + roles).
2. Fallback: `**/fields.d.twbl` in the workspace, parsed on first hover.
3. Neither available → no swap hover (server hovers unaffected).

## Testing

`src/tests/unit/fieldSwapHover.test.ts`: token detection incl. bracket
edges, same-type-first ordering and self-exclusion, unknown-field behavior,
`parseFieldDefs` round-trip against `generateFieldDefsSection` output,
catalog dedupe. The hover/command adapter is covered by typecheck and the
manual checklist (hover in a .twbl, click a link, verify replacement+undo).
