# Format Stripper — Scan & Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `scanFormattingXml` pure function and wire it so each checkbox label in the Format Stripper sidebar section automatically shows live counts and unique values from the active `.twb` file.

**Architecture:** New pure function in the existing `formatStripper.ts` parser module; new `scanWorkbookFormatting()` private method in `ParsingGuideViewProvider`; three trigger points (sidebar open, active editor change, after successful strip); frontend label update via `formatStripScan` message type.

**Tech Stack:** TypeScript (VS Code extension host), plain JS (webview), Jest (unit tests), VS Code WebviewView messaging API.

---

## File Map

| File | Change |
|---|---|
| `src/parsers/formatStripper.ts` | Add `FormatCategoryScan`, `FormatScanResult` interfaces and `scanFormattingXml` export |
| `src/tests/unit/formatStripper.test.ts` | Add `describe` block for `scanFormattingXml` |
| `src/views/parsingGuideView.ts` | Update import, add `scanWorkbookFormatting()`, wire 3 triggers, update 4 HTML labels |
| `media/parsingGuideSidebar.js` | Add `formatStripScan` message handler, `updateStripLabels`, `setStripLabelInfo` functions |

---

### Task 1: Add `scanFormattingXml` to the parser module

**Files:**
- Modify: `src/parsers/formatStripper.ts`

- [ ] **Step 1: Add interfaces and function stub at end of file**

Append to `src/parsers/formatStripper.ts` after the `stripFormattingXml` function:

```typescript
export interface FormatCategoryScan {
    count: number;
    values: string[];
}

export interface FormatScanResult {
    borders:   FormatCategoryScan;
    bold:      FormatCategoryScan;
    fontSize:  FormatCategoryScan;
    fontColor: FormatCategoryScan;
}

export function scanFormattingXml(xml: string): FormatScanResult {
    function collect(patterns: RegExp[]): FormatCategoryScan {
        const found: string[] = [];
        for (const pat of patterns) {
            let m: RegExpExecArray | null;
            const re = new RegExp(pat.source, 'g');
            while ((m = re.exec(xml)) !== null) {
                const val = m[1];
                if (val !== undefined) { found.push(val); }
            }
        }
        const unique = [...new Set(found)].sort();
        return { count: found.length, values: unique };
    }

    return {
        borders: collect([
            /attr=['"]border-style['"][^>]*value=['"]([^'"]*)['"]/g,
            /attr=['"]border-width['"][^>]*value=['"]([^'"]*)['"]/g,
            /attr=['"]border-color['"][^>]*value=['"]([^'"]*)['"]/g,
            /attr=['"]div-level['"][^>]*value=['"]([^'"]*)['"]/g,
            /attr=['"]stroke-color['"][^>]*scope=['"](?:rows|cols)['"][^>]*value=['"]([^'"]*)['"]/g,
            /attr=['"]stroke-color['"][^>]*value=['"]([^'"]*)['"][^>]*scope=['"](?:rows|cols)['"]/g,
        ]),
        bold: collect([
            /attr=['"]font-bold['"][^>]*value=['"]([^'"]*)['"]/g,
        ]),
        fontSize: collect([
            /attr=['"]font-size['"][^>]*value=['"]([^'"]*)['"]/g,
        ]),
        fontColor: collect([
            /attr=['"]font-color['"][^>]*value=['"]([^'"]*)['"]/g,
            /<format\s[^>]*attr=['"]color['"][^>]*value=['"]([^'"]*)['"]/g,
        ]),
    };
}
```

---

### Task 2: Unit tests for `scanFormattingXml`

**Files:**
- Modify: `src/tests/unit/formatStripper.test.ts`

- [ ] **Step 1: Write failing tests**

Add this `describe` block at the end of `src/tests/unit/formatStripper.test.ts`:

```typescript
import { scanFormattingXml, FormatScanResult } from '../../parsers/formatStripper.js';

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
```

- [ ] **Step 2: Run tests — expect new tests to fail (function not yet imported)**

```bash
npx jest src/tests/unit/formatStripper.test.ts --no-coverage 2>&1 | tail -20
```

Expected: failures on `scanFormattingXml` tests (the import will fail because the function is not exported yet if Task 1 not done, or tests may pass if Task 1 is already done).

- [ ] **Step 3: Run tests after Task 1 implementation — expect all to pass**

```bash
npx jest src/tests/unit/formatStripper.test.ts --no-coverage 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/parsers/formatStripper.ts src/tests/unit/formatStripper.test.ts
git commit -m "feat(format-stripper): add scanFormattingXml pure function with unit tests"
```

---

### Task 3: Backend — `scanWorkbookFormatting` method and import update

**Files:**
- Modify: `src/views/parsingGuideView.ts`

- [ ] **Step 1: Update the import line for `formatStripper.ts`**

Find line 20 in `src/views/parsingGuideView.ts`:
```typescript
import { stripFormattingXml, FormatStripOptions } from '../parsers/formatStripper.js';
```

Replace with:
```typescript
import { stripFormattingXml, scanFormattingXml, FormatStripOptions } from '../parsers/formatStripper.js';
```

- [ ] **Step 2: Add `scanWorkbookFormatting` method**

In `src/views/parsingGuideView.ts`, add the following private method directly after the closing brace of `stripWorkbookFormatting` (around line 605):

```typescript
private async scanWorkbookFormatting(): Promise<void> {
    if (!this.view) { return; }
    let workbookUri: vscode.Uri | undefined;
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        const p = activeEditor.document.uri.path.toLowerCase();
        if (p.endsWith('.twb')) { workbookUri = activeEditor.document.uri; }
    }
    if (!workbookUri && this.lastWorkbookUri) {
        const p = this.lastWorkbookUri.path.toLowerCase();
        if (p.endsWith('.twb')) { workbookUri = this.lastWorkbookUri; }
    }
    if (!workbookUri) { return; }
    try {
        const parser = new TWBParser();
        const workbookDoc = await parser.parseWorkbook(workbookUri);
        const result = scanFormattingXml(workbookDoc.xml);
        await this.view.webview.postMessage({ type: 'formatStripScan', result });
    } catch {
        // scan is background/read-only; swallow errors silently
    }
}
```

- [ ] **Step 3: Wire trigger 1 — sidebar open**

In `resolveWebviewView`, find the block that ends with `if (!this.lastWorkbookUri) { log.info(...) }` (around line 165). Add the scan call immediately after that block, before the `vscode.window.onDidChangeActiveTextEditor` subscription:

```typescript
void this.scanWorkbookFormatting();
```

- [ ] **Step 4: Wire trigger 2 — active editor change**

In the `onDidChangeActiveTextEditor` callback (around line 172-180), add a scan call after `void this.postWorkbookData()`:

```typescript
void this.scanWorkbookFormatting();
```

The block should look like:
```typescript
vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
        const p = editor.document.uri.path.toLowerCase();
        if (p.endsWith('.twb') || p.endsWith('.twbx')) {
            this.lastWorkbookUri = editor.document.uri;
            void this.postWorkbookData();
            void this.scanWorkbookFormatting();
        }
    }
})
```

- [ ] **Step 5: Wire trigger 3 — after successful strip**

In `stripWorkbookFormatting`, find the line:
```typescript
await this.postFormatStripStatus('Formatting stripped successfully.', 'success');
```

Add the scan call on the next line:
```typescript
void this.scanWorkbookFormatting();
```

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -i error | head -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/views/parsingGuideView.ts
git commit -m "feat(format-stripper): add scanWorkbookFormatting method with 3 trigger points"
```

---

### Task 4: HTML — add info spans to checkbox labels

**Files:**
- Modify: `src/views/parsingGuideView.ts` (HTML template, around lines 1675-1678)

- [ ] **Step 1: Update the four checkbox labels**

Find the current labels block:
```html
<label style="display:block;padding:2px 0"><input type="checkbox" id="strip-borders"> Borders</label>
<label style="display:block;padding:2px 0"><input type="checkbox" id="strip-bold"> Bold</label>
<label style="display:block;padding:2px 0"><input type="checkbox" id="strip-font-size"> Font Size</label>
<label style="display:block;padding:2px 0"><input type="checkbox" id="strip-font-color"> Font Color</label>
```

Replace with:
```html
<label style="display:block;padding:2px 0"><input type="checkbox" id="strip-borders"> Borders<span id="strip-borders-info" style="color:var(--vscode-descriptionForeground);font-size:11px;margin-left:4px"></span></label>
<label style="display:block;padding:2px 0"><input type="checkbox" id="strip-bold"> Bold<span id="strip-bold-info" style="color:var(--vscode-descriptionForeground);font-size:11px;margin-left:4px"></span></label>
<label style="display:block;padding:2px 0"><input type="checkbox" id="strip-font-size"> Font Size<span id="strip-font-size-info" style="color:var(--vscode-descriptionForeground);font-size:11px;margin-left:4px"></span></label>
<label style="display:block;padding:2px 0"><input type="checkbox" id="strip-font-color"> Font Color<span id="strip-font-color-info" style="color:var(--vscode-descriptionForeground);font-size:11px;margin-left:4px"></span></label>
```

- [ ] **Step 2: Commit**

```bash
git add src/views/parsingGuideView.ts
git commit -m "feat(format-stripper): add inline info spans to checkbox labels"
```

---

### Task 5: Frontend JS — message handler and label update functions

**Files:**
- Modify: `media/parsingGuideSidebar.js`

- [ ] **Step 1: Add `updateStripLabels` and `setStripLabelInfo` functions**

In `media/parsingGuideSidebar.js`, add these two functions directly after the closing brace of `setFormatStripStatus` (around line 2026):

```javascript
function updateStripLabels(result) {
  setStripLabelInfo('strip-borders-info',    result.borders)
  setStripLabelInfo('strip-bold-info',       result.bold)
  setStripLabelInfo('strip-font-size-info',  result.fontSize)
  setStripLabelInfo('strip-font-color-info', result.fontColor)
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
  const valStr = shown.join(', ') + (extra > 0 ? ` \u2026 +${extra} more` : '')
  el.textContent = `(${count}) ${valStr}`
}
```

- [ ] **Step 2: Add `formatStripScan` message handler**

Find the existing `formatStripStatus` handler (around line 1212):
```javascript
if (message.type === 'formatStripStatus') {
  setFormatStripStatus(message.message || '', message.tone || 'info')
}
```

Add the new handler immediately after it:
```javascript
if (message.type === 'formatStripScan') {
  updateStripLabels(message.result)
}
```

- [ ] **Step 3: Build and verify no syntax errors**

```bash
npx esbuild --bundle --external:vscode src/extension.ts --outdir=out --platform=node --target=node20 --format=cjs 2>&1 | tail -10
```

Expected: build completes with no errors (warnings about unrelated packages are acceptable).

- [ ] **Step 4: Commit**

```bash
git add media/parsingGuideSidebar.js
git commit -m "feat(format-stripper): add formatStripScan message handler and label update functions"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: all tests pass, no regressions.

- [ ] **Step 2: Build full extension**

```bash
npx vsce package 2>&1 | tail -20
```

Expected: VSIX built successfully, file size reported.
