# Design: Calc Field Click-to-Copy with Header

**Date:** 2026-02-26

## Problem

Clicking a Calculated Field row in the Workbook Inspector sidebar does nothing. Users must click the small 📋 icon button to copy the formula, and that copy contains no identifying context (no title/name).

## Goal

Clicking anywhere on a Calculated Field row copies to clipboard with a `// Title` comment header prepended, making the snippet immediately usable in a `.twbl` file with attribution.

## Format

```
// {caption}
{formula}
```

- If `caption` contains ` - ` (e.g. `"Sales - Net revenue"`), the full caption is used: `// Sales - Net revenue`
- If no dash (e.g. `"Sales"`), still: `// Sales`
- The 📋 button's existing behavior (raw formula, no header) is unchanged

## Approach

Row-click action via event delegation. Add `data-action="copy-calc"` and `data-index` to each `.tree-item` div in `renderCalcFields`. The existing `workbookSbEl` click handler picks this up automatically.

Guard: if the click target is inside a `<button>`, skip the row action so button clicks don't double-fire.

## Files Changed

| File | Change |
|------|--------|
| `media/parsingGuideSidebar.js` | Add `data-action="copy-calc"` to `.tree-item` in `renderCalcFields`; add handler branch in `workbookSbEl` click listener |
| `src/views/parsingGuideView.ts` | No changes — existing `copyFormula` handler already writes any string to clipboard |

## Non-Goals

- No backend changes
- The 📋 button behavior is unchanged (copies raw formula only)
- No new message types needed
