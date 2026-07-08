# Format Stripper — Scan & Display Current Values

**Date:** 2026-04-02
**Status:** Approved for implementation planning

---

## Summary

Enhance the existing Format Stripper sidebar section to automatically scan the active `.twb` file and display current formatting values inline next to each checkbox. The mental model shifts from a blind strip tool to a **format settings viewer** — you see what's set, then decide what to strip.

---

## Motivation

The current UI shows four checkboxes with no context about what's actually in the file. Users have to open the raw XML to know whether borders are set to `solid` or what font sizes are in use. The scan feature surfaces this information automatically so the strip action is informed, not guesswork.

---

## Desired UX

Each checkbox label shows count + unique values on the same line:

```
☑ Borders     (12) solid, none, #e6e6e6
☐ Bold        (5) true
☐ Font Size   (0)
☐ Font Color  (8) #333333, #555555 … +2 more
```

- Count is shown even when zero — confirms the scan ran
- Values truncated at 4 unique entries with `… +N more`
- Info text uses `var(--vscode-descriptionForeground)` at 11px — clearly secondary

---

## Trigger Points

The scan fires automatically in three situations:

1. **Sidebar opens** — `resolveWebviewView` fires the scan once
2. **Active editor changes** — the existing `onDidChangeActiveTextEditor` watcher (already used by the palette section) triggers a rescan when the new active file is a `.twb`
3. **After a successful strip** — `stripWorkbookFormatting` calls `scanWorkbookFormatting` so labels immediately reflect the post-strip state

No `.twbx` files, no active `.twb` → labels show no info (blank spans), no error in the scan path.

---

## New Pure Function: `scanFormattingXml`

Added to `src/parsers/formatStripper.ts`.

```typescript
export interface FormatCategoryScan {
    count: number;
    values: string[];   // unique value= strings, max 4 before truncation
}

export interface FormatScanResult {
    borders:   FormatCategoryScan;
    bold:      FormatCategoryScan;
    fontSize:  FormatCategoryScan;
    fontColor: FormatCategoryScan;
}

export function scanFormattingXml(xml: string): FormatScanResult
```

**Borders** — scans for `border-style`, `border-width`, `border-color`, `div-level`, and scoped `stroke-color` nodes. Count is total nodes across all five attrs; values are unique `value=` strings collected from all of them.

**Bold** — `font-bold` nodes. Values are the unique `value=` strings (typically just `true`).

**Font Size** — `font-size` nodes. Values are unique numeric strings (e.g. `9`, `10`, `12`).

**Font Color** — `font-color` and `attr='color'` on `<format>` nodes. Values are unique hex strings.

Each category: deduplicate values, sort, cap at 4 for display (caller handles truncation label).

---

## Backend: `scanWorkbookFormatting`

New private method in `parsingGuideView.ts`:

```typescript
private async scanWorkbookFormatting(): Promise<void>
```

Flow:
1. Resolve `workbookUri` (same pattern as `stripWorkbookFormatting`) — silently return if none
2. Skip `.twbx` silently (no error message, just no data)
3. Read XML via `TWBParser.parseWorkbook()`
4. Call `scanFormattingXml(workbookDoc.xml)`
5. Post `{ type: 'formatStripScan', result: FormatScanResult }` to the webview

Errors are swallowed silently — scan is a read-only background operation, failures should not surface noise to the user.

---

## Backend: Trigger Wiring

**On sidebar open** — at the end of `resolveWebviewView`, after the existing post-init calls:
```typescript
void this.scanWorkbookFormatting();
```

**On active editor change** — in the existing `onDidChangeActiveTextEditor` handler, add a scan call alongside the existing palette refresh:
```typescript
void this.scanWorkbookFormatting();
```

**After successful strip** — inside `stripWorkbookFormatting`, after `postFormatStripStatus('Formatting stripped successfully.', 'success')`:
```typescript
void this.scanWorkbookFormatting();
```

---

## HTML Changes

Each of the four checkbox labels gets an inline `<span>` for the annotation:

```html
<label style="display:block;padding:2px 0">
  <input type="checkbox" id="strip-borders"> Borders
  <span id="strip-borders-info" style="color:var(--vscode-descriptionForeground);font-size:11px;margin-left:4px"></span>
</label>
```

Same pattern for `strip-bold-info`, `strip-font-size-info`, `strip-font-color-info`.

---

## JS Changes

**New message handler** for `formatStripScan` in `window.addEventListener('message', ...)`:

```javascript
if (message.type === 'formatStripScan') {
  updateStripLabels(message.result)
}
```

**New `updateStripLabels(result)` function:**

```javascript
function updateStripLabels(result) {
  setStripLabelInfo('strip-borders-info',   result.borders)
  setStripLabelInfo('strip-bold-info',      result.bold)
  setStripLabelInfo('strip-font-size-info', result.fontSize)
  setStripLabelInfo('strip-font-color-info',result.fontColor)
}

function setStripLabelInfo(id, scan) {
  const el = document.getElementById(id)
  if (!el) { return }
  const { count, values } = scan
  if (count === 0) {
    el.textContent = '(0)'
    return
  }
  const shown = values.slice(0, 4)
  const extra = values.length - shown.length
  const valStr = shown.join(', ') + (extra > 0 ? ` … +${extra} more` : '')
  el.textContent = `(${count}) ${valStr}`
}
```

---

## Files Changed

| File | Change |
|---|---|
| `src/parsers/formatStripper.ts` | Add `scanFormattingXml`, `FormatCategoryScan`, `FormatScanResult` |
| `src/tests/unit/formatStripper.test.ts` | Add unit tests for `scanFormattingXml` |
| `src/views/parsingGuideView.ts` | Add `scanWorkbookFormatting()` method, wire triggers, update HTML labels |
| `media/parsingGuideSidebar.js` | Add `formatStripScan` handler, `updateStripLabels`, `setStripLabelInfo` |

---

## Out of Scope

- Editing values directly in the sidebar (read + strip only)
- Per-worksheet breakdown of values
- Showing which worksheets/dashboards contain each format node
