# Workbook Format Stripper — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Format Stripper" sidebar section that removes border, bold, font-size, and font-color overrides from the active `.twb` file via targeted regex passes on the raw XML.

**Architecture:** A pure `stripFormattingXml(xml, options)` function handles all regex transformations and is unit-tested in isolation. The view wires it up via a new `stripWorkbookFormatting()` method and `case 'stripFormatting'` message handler. The HTML section and JS listener follow the exact same patterns already used by the palette editor.

**Tech Stack:** TypeScript (VS Code extension), vanilla JavaScript (webview), Jest (unit tests), regex-based XML manipulation (no new dependencies).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/parsers/formatStripper.ts` | **Create** | Pure `stripFormattingXml(xml, options)` function — all regex logic lives here |
| `src/tests/unit/formatStripper.test.ts` | **Create** | Unit tests for `stripFormattingXml` |
| `src/views/parsingGuideView.ts` | **Modify** | Add message case, backend method, status method, HTML section |
| `media/parsingGuideSidebar.js` | **Modify** | Add strip button listener, message handler, status helper |

---

## Task 1: Create the pure XML transformation function (TDD)

**Files:**
- Create: `src/parsers/formatStripper.ts`
- Create: `src/tests/unit/formatStripper.test.ts`

- [ ] **Step 1.1 — Write the failing tests**

Create `src/tests/unit/formatStripper.test.ts`:

```typescript
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
```

- [ ] **Step 1.2 — Run tests to confirm they all fail (module not found)**

```bash
cd /mnt/c/Users/dev/Documents/Design/Coding/Tableau-LSP
npx jest src/tests/unit/formatStripper.test.ts --no-coverage 2>&1 | tail -20
```

Expected: `Cannot find module '../../parsers/formatStripper.js'`

- [ ] **Step 1.3 — Implement `src/parsers/formatStripper.ts`**

Create `src/parsers/formatStripper.ts`:

```typescript
export interface FormatStripOptions {
    borders: boolean;
    bold: boolean;
    fontSize: boolean;
    fontColor: boolean;
}

/**
 * Strips formatting overrides from raw Tableau .twb XML.
 *
 * Borders are neutralised (set to none/0) rather than removed because Tableau
 * requires explicit none/0 nodes to suppress inherited workbook-level borders.
 * Bold, font-size, and font-color nodes are deleted entirely so sheets inherit
 * the application default.
 */
export function stripFormattingXml(xml: string, options: FormatStripOptions): string {
    let result = xml;

    if (options.borders) {
        // Set border-style → 'none'
        result = result.replace(
            /(<format\s[^>]*attr=['"]border-style['"][^>]*)value=['"][^'"]*['"]/g,
            "$1value='none'"
        );
        // Set border-width → '0'
        result = result.replace(
            /(<format\s[^>]*attr=['"]border-width['"][^>]*)value=['"][^'"]*['"]/g,
            "$1value='0'"
        );
        // Remove border-color lines entirely (leading indent + trailing newline)
        result = result.replace(
            /[ \t]*<format\s[^>]*attr=['"]border-color['"][^>]*\/>\r?\n?/g,
            ''
        );
    }

    if (options.bold) {
        result = result.replace(
            /[ \t]*<format\s[^>]*attr=['"]font-bold['"][^>]*\/>\r?\n?/g,
            ''
        );
    }

    if (options.fontSize) {
        result = result.replace(
            /[ \t]*<format\s[^>]*attr=['"]font-size['"][^>]*\/>\r?\n?/g,
            ''
        );
    }

    if (options.fontColor) {
        result = result.replace(
            /[ \t]*<format\s[^>]*attr=['"]font-color['"][^>]*\/>\r?\n?/g,
            ''
        );
        // attr='color' on <format> nodes (distinct from <color> palette entries
        // and <color column='...'> field encoding — those use a different tag name)
        result = result.replace(
            /[ \t]*<format\s[^>]*attr=['"]color['"][^>]*\/>\r?\n?/g,
            ''
        );
    }

    return result;
}
```

- [ ] **Step 1.4 — Run tests and confirm they all pass**

```bash
npx jest src/tests/unit/formatStripper.test.ts --no-coverage 2>&1 | tail -20
```

Expected: `Tests: 14 passed, 14 total` (all green)

- [ ] **Step 1.5 — Commit**

```bash
git add src/parsers/formatStripper.ts src/tests/unit/formatStripper.test.ts
git commit -m "feat(format-stripper): add pure XML transformation function with tests"
```

---

## Task 2: Wire backend — method, status poster, message handler

**Files:**
- Modify: `src/views/parsingGuideView.ts`

- [ ] **Step 2.1 — Update the payload type annotation to include `options`**

Find line 59 in `src/views/parsingGuideView.ts`:
```typescript
const payload = message as { type?: string; palettes?: unknown; palette?: unknown; paletteName?: unknown; path?: string; formula?: string };
```

Replace with:
```typescript
const payload = message as { type?: string; palettes?: unknown; palette?: unknown; paletteName?: unknown; path?: string; formula?: string; options?: unknown };
```

- [ ] **Step 2.2 — Add `case 'stripFormatting'` to the message switch**

Find the `case 'webviewDiag':` block (lines 123–127), which is the last case before `default`. Add the new case immediately before the `default:` line:

```typescript
                case 'stripFormatting':
                    void this.stripWorkbookFormatting(payload.options);
                    break;
                default:
                    break;
```

The surrounding context for the Edit tool (replace the `default` block):
```typescript
                default:
                    break;
            }
        });
```
→ replace with:
```typescript
                case 'stripFormatting':
                    void this.stripWorkbookFormatting(payload.options);
                    break;
                default:
                    break;
            }
        });
```

- [ ] **Step 2.3 — Add `postFormatStripStatus()` method after `postStatus()`**

Find the end of `postStatus` (the method ending after line 508):
```typescript
        await this.view.webview.postMessage({
            type: 'paletteStatus',
            message,
            tone
        });
    }
```

Add `postFormatStripStatus` immediately after:
```typescript
        await this.view.webview.postMessage({
            type: 'paletteStatus',
            message,
            tone
        });
    }

    private async postFormatStripStatus(message: string, tone: 'success' | 'error' | 'info'): Promise<void> {
        if (!this.view) {
            return;
        }
        await this.view.webview.postMessage({
            type: 'formatStripStatus',
            message,
            tone
        });
    }
```

- [ ] **Step 2.4 — Add `stripWorkbookFormatting()` method**

Add the new method after `postFormatStripStatus`. Find the line containing `private async postContextData():` and insert `stripWorkbookFormatting` before it:

```typescript
    private async stripWorkbookFormatting(rawOptions: unknown): Promise<void> {
        const options = coerceStripOptions(rawOptions);

        let workbookUri: vscode.Uri | undefined;
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const p = activeEditor.document.uri.path.toLowerCase();
            if (p.endsWith('.twb') || p.endsWith('.twbx')) {
                workbookUri = activeEditor.document.uri;
            }
        }
        if (!workbookUri && this.lastWorkbookUri) {
            workbookUri = this.lastWorkbookUri;
        }
        if (!workbookUri) {
            await this.postFormatStripStatus('No active workbook file. Open a .twb file first.', 'error');
            return;
        }
        if (workbookUri.path.toLowerCase().endsWith('.twbx')) {
            await this.postFormatStripStatus('Packaged workbooks (.twbx) are not yet supported.', 'error');
            return;
        }

        try {
            const parser = new TWBParser();
            const workbookDoc = await parser.parseWorkbook(workbookUri);
            const updatedXml = stripFormattingXml(workbookDoc.xml, options);

            if (updatedXml === workbookDoc.xml) {
                await this.postFormatStripStatus('No matching format attributes found.', 'info');
                return;
            }

            await parser.writeWorkbook(workbookUri, updatedXml);
            await this.postFormatStripStatus('Formatting stripped successfully.', 'success');
        } catch (error: unknown) {
            if (error instanceof WorkbookError) {
                await this.postFormatStripStatus(`Workbook error: ${error.message}`, 'error');
                return;
            }
            const message = error instanceof Error ? error.message : String(error);
            await this.postFormatStripStatus(`Failed to strip formatting: ${message}`, 'error');
        }
    }
```

- [ ] **Step 2.5 — Add the `coerceStripOptions` helper at the bottom of the file**

At the very end of `parsingGuideView.ts`, after the last existing helper function, add:

```typescript
function coerceStripOptions(raw: unknown): FormatStripOptions {
    if (!raw || typeof raw !== 'object') {
        return { borders: false, bold: false, fontSize: false, fontColor: false };
    }
    const obj = raw as Record<string, unknown>;
    return {
        borders: obj['borders'] === true,
        bold: obj['bold'] === true,
        fontSize: obj['fontSize'] === true,
        fontColor: obj['fontColor'] === true,
    };
}
```

- [ ] **Step 2.6 — Add the import for `stripFormattingXml` and `FormatStripOptions`**

Find the existing import block at the top of `parsingGuideView.ts`. After the `TWBParser` import line:
```typescript
import { TWBParser } from '../parsers/twbParser.js';
```

Add:
```typescript
import { stripFormattingXml, FormatStripOptions } from '../parsers/formatStripper.js';
```

- [ ] **Step 2.7 — TypeScript compile check**

```bash
cd /mnt/c/Users/dev/Documents/Design/Coding/Tableau-LSP
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing errors unrelated to your changes)

- [ ] **Step 2.8 — Commit**

```bash
git add src/views/parsingGuideView.ts
git commit -m "feat(format-stripper): wire backend method and message handler"
```

---

## Task 3: Add the HTML section to the sidebar

**Files:**
- Modify: `src/views/parsingGuideView.ts` (the `getGuideHtml` function, around line 1550)

- [ ] **Step 3.1 — Insert the Format Stripper section between Palette Library and Calculation Bank**

Find this exact line in `getGuideHtml()` (the Calculation Bank section header):
```html
    <!-- ====== CALCULATION BANK ====== -->
    <div class="sh">
```

Insert the entire Format Stripper block immediately before it:

```html
    <!-- ====== FORMAT STRIPPER ====== -->
    <div class="sh">
      <span class="cv"><svg class="ic" style="width:10px;height:10px"><use href="#i-chev-d"/></svg></span>
      Format Stripper
    </div>
    <div class="sb"><div class="fs">
      <div class="fg">
        <label class="fl" style="margin-bottom:4px">Strip from active workbook</label>
        <label style="display:block;padding:2px 0"><input type="checkbox" id="strip-borders"> Borders</label>
        <label style="display:block;padding:2px 0"><input type="checkbox" id="strip-bold"> Bold</label>
        <label style="display:block;padding:2px 0"><input type="checkbox" id="strip-font-size"> Font Size</label>
        <label style="display:block;padding:2px 0"><input type="checkbox" id="strip-font-color"> Font Color</label>
      </div>
      <button class="bt bp bf" id="strip-formatting-btn" style="margin-top:8px"><svg class="ic"><use href="#i-arrow"/></svg> Strip from Active Workbook</button>
      <div id="format-strip-status" class="ib2" style="display:none;margin-top:6px">
        <svg class="ic"><use href="#i-info"/></svg>
        <span id="format-strip-status-text"></span>
      </div>
    </div></div>

```

- [ ] **Step 3.2 — TypeScript compile check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 3.3 — Commit**

```bash
git add src/views/parsingGuideView.ts
git commit -m "feat(format-stripper): add Format Stripper section to sidebar HTML"
```

---

## Task 4: Add JavaScript for the strip button and status

**Files:**
- Modify: `media/parsingGuideSidebar.js`

- [ ] **Step 4.1 — Add `setFormatStripStatus` helper after `setStatus`**

Find the end of the `setStatus` function (around line 1968):
```javascript
  }
}

function normalizeHex(value) {
```

Insert `setFormatStripStatus` between `setStatus` and `normalizeHex`:

```javascript
  }
}

function setFormatStripStatus(message, tone) {
  const el = document.getElementById('format-strip-status')
  const textEl = document.getElementById('format-strip-status-text')
  if (!el || !textEl) {
    return
  }
  if (!message) {
    el.style.display = 'none'
    textEl.textContent = ''
    return
  }
  textEl.textContent = message
  el.style.display = ''
  const iconUse = el.querySelector('use')
  if (iconUse) {
    if (tone === 'error') {
      iconUse.setAttribute('href', '#i-info')
      el.style.background = 'rgba(241,76,76,0.08)'
      el.style.borderColor = 'rgba(241,76,76,0.4)'
    } else if (tone === 'success') {
      iconUse.setAttribute('href', '#i-check-c')
      el.style.background = 'rgba(0,120,212,0.08)'
      el.style.borderColor = 'rgba(0,120,212,0.25)'
    } else {
      iconUse.setAttribute('href', '#i-info')
      el.style.background = 'rgba(0,120,212,0.08)'
      el.style.borderColor = 'rgba(0,120,212,0.25)'
    }
  }
}

function normalizeHex(value) {
```

- [ ] **Step 4.2 — Add `formatStripStatus` message handler**

Find the existing `paletteStatus` message handler in the `window.addEventListener('message', ...)` block (around line 1185):
```javascript
    if (message.type === 'paletteStatus') {
      setStatus(message.message || 'Update complete.', message.tone || 'info')
    }
```

Add the new handler immediately after it:
```javascript
    if (message.type === 'paletteStatus') {
      setStatus(message.message || 'Update complete.', message.tone || 'info')
    }
    if (message.type === 'formatStripStatus') {
      setFormatStripStatus(message.message || '', message.tone || 'info')
    }
```

- [ ] **Step 4.3 — Add the strip button click listener**

Find the block that registers the `extractCalcsHeaderBtn` listener (around line 864):
```javascript
  const extractCalcsHeaderBtn = document.getElementById(
    'extract-calcs-header-btn',
  )
  if (extractCalcsHeaderBtn) {
    extractCalcsHeaderBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'extractCalculations' })
    })
  }
```

Add the strip button listener immediately after this block:

```javascript
  const stripFormattingBtn = document.getElementById('strip-formatting-btn')
  if (stripFormattingBtn) {
    stripFormattingBtn.addEventListener('click', () => {
      const options = {
        borders: /** @type {HTMLInputElement} */ (document.getElementById('strip-borders')).checked,
        bold: /** @type {HTMLInputElement} */ (document.getElementById('strip-bold')).checked,
        fontSize: /** @type {HTMLInputElement} */ (document.getElementById('strip-font-size')).checked,
        fontColor: /** @type {HTMLInputElement} */ (document.getElementById('strip-font-color')).checked,
      }
      if (!options.borders && !options.bold && !options.fontSize && !options.fontColor) {
        setFormatStripStatus('Select at least one option.', 'error')
        return
      }
      vscode.postMessage({ type: 'stripFormatting', options })
    })
  }
```

- [ ] **Step 4.4 — Commit**

```bash
git add media/parsingGuideSidebar.js
git commit -m "feat(format-stripper): add JS strip button listener and status handler"
```

---

## Task 5: Manual smoke test

- [ ] **Step 5.1 — Run the extension in development mode**

Press `F5` in VS Code (with the project open) to launch the Extension Development Host. In the host window, open `Tableau/Tableau.twb`.

- [ ] **Step 5.2 — Open the sidebar**

Open the Tableau LSP sidebar. Verify the "Format Stripper" section appears between Palette Library and Calculation Bank. It should be collapsed by default (matches other sections). Expand it and confirm four checkboxes and the "Strip from Active Workbook" button are visible.

- [ ] **Step 5.3 — Test no-option guard**

With no checkboxes checked, click "Strip from Active Workbook". Verify the status area shows "Select at least one option." in red.

- [ ] **Step 5.4 — Test borders strip**

Make a backup copy of `Tableau/Tableau.twb` first:
```bash
cp Tableau/Tableau.twb Tableau/Tableau.twb.bak
```

Check only "Borders". Click the button. Verify:
- Status shows "Formatting stripped successfully." in blue
- Open the `.twb` file and confirm `border-style` values are all `none`, `border-width` values are all `0`, and no `border-color` lines remain

```bash
grep "border-style" Tableau/Tableau.twb | grep -v "value='none'" | head -5
# Expected: no output (all border-style values are now 'none')
grep "border-color" Tableau/Tableau.twb | head -5
# Expected: no output (all border-color lines removed)
```

- [ ] **Step 5.5 — Restore backup and test all four options**

```bash
cp Tableau/Tableau.twb.bak Tableau/Tableau.twb
```

Check all four checkboxes. Click "Strip from Active Workbook". Verify success status and:

```bash
grep "border-style" Tableau/Tableau.twb | grep -v "value='none'" | head -5
# Expected: no output
grep "font-bold\|font-size\|font-color" Tableau/Tableau.twb | head -5
# Expected: no output
grep "border-color" Tableau/Tableau.twb | head -5
# Expected: no output
```

- [ ] **Step 5.6 — Verify palette colors untouched**

```bash
grep "<color>" Tableau/Tableau.twb | head -10
# Expected: palette <color>#hex</color> entries still present
```

- [ ] **Step 5.7 — Restore backup**

```bash
cp Tableau/Tableau.twb.bak Tableau/Tableau.twb && rm Tableau/Tableau.twb.bak
```

- [ ] **Step 5.8 — Run the full unit test suite**

```bash
npx jest --no-coverage 2>&1 | tail -15
```

Expected: `formatStripper` tests pass, no regressions elsewhere.

- [ ] **Step 5.9 — Final commit**

```bash
git add -p  # stage only intentional changes if anything is dirty
git commit -m "feat(format-stripper): complete workbook format stripper feature"
```

---

## Self-Review Notes

- **spec § borders set vs removed** → Task 1 tests cover `border-style`→`none`, `border-width`→`0`, `border-color` removed ✓
- **spec § font-color `<color>` guard** → Task 1 tests explicitly assert `<color>` palette entries and `<color column=.../>` encoding nodes are untouched ✓
- **spec § `postFormatStripStatus` separate from `postStatus`** → Task 2 adds a dedicated method posting `type: 'formatStripStatus'` ✓
- **spec § lastWorkbookUri resolution** → `stripWorkbookFormatting` uses identical resolution logic to `applyPaletteToWorkbook` ✓
- **spec § `.twbx` rejection** → present in `stripWorkbookFormatting` ✓
- **spec § no changes found** → `updatedXml === workbookDoc.xml` guard posts `'info'` status ✓
- **Type consistency** — `FormatStripOptions` defined once in `formatStripper.ts`, imported into `parsingGuideView.ts`, and `coerceStripOptions` returns the same type ✓
