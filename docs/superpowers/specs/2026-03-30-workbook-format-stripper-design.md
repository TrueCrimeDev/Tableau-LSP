# Workbook Format Stripper — Design Spec

**Date:** 2026-03-30
**Status:** Approved for implementation planning

---

## Summary

A new "Format Stripper" panel section in the sidebar that lets you select one or more formatting categories (borders, bold, font size, font color) and remove/neutralize those overrides from the currently active `.twb` file via targeted regex passes on the raw XML.

---

## Motivation

Tableau workbooks accumulate inline formatting overrides (`<format attr='...'>` nodes) inside `<style-rule>` and `<zone-style>` blocks. Stripping these manually requires editing raw XML. This feature exposes a one-click UI for the most common cleanup operations directly in the existing sidebar.

---

## XML Background

All targeted attributes live in self-closing `<format attr='...' ... value='...' />` elements. They appear in two structural contexts:

### 1. Worksheet style rules (`<style-rule>` inside `<style>`)
```xml
<style-rule element='cell'>
  <format attr='border-style' value='solid' />
  <format attr='border-style' scope='rows' value='solid' />
  <format attr='border-width' scope='cols' value='2' />
  <format attr='border-color' value='#e6e6e6' />
  <format attr='font-bold' value='true' />
  <format attr='font-size' value='10' />
  <format attr='font-color' value='#333333' />
</style-rule>
```

Format nodes may carry optional qualifier attributes (`scope`, `data-class`, `field`) but the `attr` name is always the discriminator.

### 2. Dashboard zone styles (`<zone-style>`)
```xml
<zone-style>
  <format attr='border-color' value='#000000' />
  <format attr='border-style' value='none' />
  <format attr='border-width' value='0' />
</zone-style>
```

### What is NOT affected

- `<color>#hex</color>` — palette color entries (text content, not `attr` nodes)
- `<color column='...' />` — field color encoding nodes
- `<color-palette>` — palette definition blocks
- Datasource/field metadata elements that happen to contain `<format name='...'>` (different attribute name)

---

## Feature Behavior

### Options

| Checkbox label | XML attrs targeted | Strip action |
|---|---|---|
| **Borders** | `border-style`, `border-width`, `border-color` | Set `border-style` value → `none`; set `border-width` value → `0`; remove `border-color` lines entirely |
| **Bold** | `font-bold` | Remove the `<format>` line entirely |
| **Font Size** | `font-size` | Remove the `<format>` line entirely |
| **Font Color** | `font-color`, `color` (within format nodes) | Remove the `<format>` line entirely |

**Why borders are set rather than removed:** Tableau uses `border-style='none'` and `border-width='0'` as the explicit "no border" state; removing the node causes the sheet to inherit the workbook-level default (which may still render a border).

**Why bold/size/color are removed:** These are pure overrides. Removing the node inherits the Tableau application default, which is the correct reset behavior.

### Scope

Operates on the **active `.twb`** file — determined by the same `lastWorkbookUri` resolution already used by `applyPaletteToWorkbook`:
1. Active text editor URI (if `.twb`)
2. Fall back to `this.lastWorkbookUri`
3. Error if neither resolves

`.twbx` files are rejected with the existing "packaged workbooks not yet supported" message.

---

## Implementation Plan

### 1. Regex passes

Each pass is a global replace over the full raw XML string.

**Borders — value replacement (not node removal):**
```
/(<format\s[^>]*attr=['"]border-style['"][^>]*)value=['"][^'"]*['"]/g
→ replace value with: value='none'

/(<format\s[^>]*attr=['"]border-width['"][^>]*)value=['"][^'"]*['"]/g
→ replace value with: value='0'
```

**Border-color / font-bold / font-size / font-color — full node removal:**
```
/[ \t]*<format\s[^>]*attr=['"]border-color['"][^>]*\/>\r?\n?/g  → ''
/[ \t]*<format\s[^>]*attr=['"]font-bold['"][^>]*\/>\r?\n?/g     → ''
/[ \t]*<format\s[^>]*attr=['"]font-size['"][^>]*\/>\r?\n?/g     → ''
/[ \t]*<format\s[^>]*attr=['"]font-color['"][^>]*\/>\r?\n?/g    → ''
```

**Font color via `attr='color'`** — must exclude `<color>` and `<color-palette>` tags, which have a different tag name. The regex `<format\s[^>]*attr=['"]color['"]` is safely distinct.

**Quote style note:** Tableau `.twb` XML uses single quotes for attribute values (e.g., `attr='border-style'`), but the regex uses `['"]` to handle both for robustness.

### 2. New method: `stripWorkbookFormatting`

Location: `src/views/parsingGuideView.ts`

```typescript
private async stripWorkbookFormatting(options: {
    borders: boolean;
    bold: boolean;
    fontSize: boolean;
    fontColor: boolean;
}): Promise<void>
```

Flow:
1. Resolve `workbookUri` (same pattern as `applyPaletteToWorkbook`)
2. Reject `.twbx`
3. `parseWorkbook(workbookUri)` — reuses existing error handling
4. Run selected regex passes on `workbookDoc.xml`
5. If no changes: `postStatus('No matching format attributes found.', 'info')`
6. `writeWorkbook(workbookUri, updatedXml)`
7. `postStatus('Formatting stripped successfully.', 'success')`

### 3. Backend status posting

The existing `postStatus` method always posts `type: 'paletteStatus'`, which is displayed in the `#palette-status` div inside the Palette Library section. The Format Stripper needs its own status div and message type so feedback appears in the right section.

Add a dedicated private method:

```typescript
private async postFormatStripStatus(message: string, tone: 'success' | 'error' | 'info'): Promise<void> {
    if (!this.view) { return; }
    await this.view.webview.postMessage({ type: 'formatStripStatus', message, tone });
}
```

Replace all `postStatus` calls inside `stripWorkbookFormatting` with `postFormatStripStatus`.

### 4. Message handler

Add `case 'stripFormatting'` to the `onDidReceiveMessage` switch in `resolveWebviewView`:

```typescript
case 'stripFormatting':
    void this.stripWorkbookFormatting(payload.options);
    break;
```

### 5. HTML section

New top-level section added to `getGuideHtml()` between the Palette Library `</div>` and Calculation Bank section:

```html
<!-- ====== FORMAT STRIPPER ====== -->
<div class="sh">
  <span class="cv"><svg class="ic" style="width:10px;height:10px"><use href="#i-chev-d"/></svg></span>
  Format Stripper
</div>
<div class="sb"><div class="fs">
  <div class="fg">
    <label class="fl">Strip from active workbook</label>
    <label><input type="checkbox" id="strip-borders"> Borders</label>
    <label><input type="checkbox" id="strip-bold"> Bold</label>
    <label><input type="checkbox" id="strip-font-size"> Font Size</label>
    <label><input type="checkbox" id="strip-font-color"> Font Color</label>
  </div>
  <button class="bt bp bf" id="strip-formatting-btn">
    <svg class="ic"><use href="#i-arrow"/></svg> Strip from Active Workbook
  </button>
  <div id="format-strip-status" class="ib2" style="display:none">
    <svg class="ic"><use href="#i-info"/></svg>
    <span id="format-strip-status-text"></span>
  </div>
</div></div>
```

Uses existing CSS classes only — no new styles needed.

### 6. JavaScript (`media/parsingGuideSidebar.js`)

**New event listener** on the strip button:
```javascript
document.getElementById('strip-formatting-btn').addEventListener('click', () => {
    const options = {
        borders: document.getElementById('strip-borders').checked,
        bold: document.getElementById('strip-bold').checked,
        fontSize: document.getElementById('strip-font-size').checked,
        fontColor: document.getElementById('strip-font-color').checked
    };
    if (!options.borders && !options.bold && !options.fontSize && !options.fontColor) {
        setFormatStripStatus('Select at least one option.', 'error');
        return;
    }
    vscode.postMessage({ type: 'stripFormatting', options });
});
```

**New message handler** in the `window.addEventListener('message', ...)` block:
```javascript
if (message.type === 'formatStripStatus') {
    setFormatStripStatus(message.message || '', message.tone || 'info');
}
```

**New status helper** (mirrors `setStatus` but targets the Format Stripper div):
```javascript
function setFormatStripStatus(message, tone) {
    const el = document.getElementById('format-strip-status');
    const textEl = document.getElementById('format-strip-status-text');
    if (!el || !textEl) { return; }
    // same tone/icon/color logic as setStatus
}
```

---

## Error Handling

| Condition | Response |
|---|---|
| No active `.twb` | `postStatus('No active workbook file. Open a .twb file first.', 'error')` |
| Active file is `.twbx` | `postStatus('Packaged workbooks (.twbx) are not yet supported.', 'error')` |
| No checkboxes checked | Client-side guard; button disabled or early return with status |
| No matching attrs found | `postStatus('No matching format attributes found.', 'info')` |
| File read/write failure | `postStatus('Failed to strip formatting: <message>', 'error')` |
| Success | `postStatus('Formatting stripped successfully.', 'success')` |

---

## Out of Scope

- `.twbx` support (existing limitation, not introduced here)
- Preview / diff view before applying
- Undo (VS Code's file undo handles this once the file is written)
- Per-worksheet or per-dashboard targeting
- Stripping font family (`font-family` attribute)

---

## Files Changed

| File | Change |
|---|---|
| `src/views/parsingGuideView.ts` | Add `stripWorkbookFormatting()` method, add `postFormatStripStatus()` method, add `case 'stripFormatting'` handler, add HTML section |
| `media/parsingGuideSidebar.js` | Add strip button listener, add `formatStripStatus` message handler, add `setFormatStripStatus()` helper |
