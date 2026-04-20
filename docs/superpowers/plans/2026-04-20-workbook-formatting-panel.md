# Workbook Formatting Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated VS Code WebviewPanel with three tabs (Inspect & Edit, Apply Theme, Export Theme) that lets users view, edit, import, and export Tableau workbook formatting as a property editor.

**Architecture:** Four pure functions in a new `formattingTheme.ts` parser handle all XML ↔ theme data transformation; a `FormattingPanelProvider` in `formattingPanel.ts` owns the WebviewPanel lifecycle and message routing; the webview (`formattingPanel.js` + `formattingPanel.css`) renders the three-tab UI. The existing Format Stripper sidebar section is removed.

**Tech Stack:** TypeScript (VS Code extension host), vanilla JS + CSS (webview), Jest (unit tests), VS Code WebviewPanel API.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/parsers/formattingTheme.ts` | **Create** | All pure functions: read, edit, export, import theme data |
| `src/tests/unit/formattingTheme.test.ts` | **Create** | Unit tests for all four pure functions |
| `src/views/formattingPanel.ts` | **Create** | Panel provider, command registration, message routing |
| `media/formattingPanel.js` | **Create** | Webview JS: tab switching, edit staging, rendering, messaging |
| `media/formattingPanel.css` | **Create** | Panel styles |
| `src/extension.ts` | **Modify** | Import and call `registerFormattingPanel` |
| `package.json` | **Modify** | Add `tableauLanguageSupport.openFormattingPanel` command entry |
| `src/views/parsingGuideView.ts` | **Modify** | Remove FORMAT STRIPPER HTML section and its message handlers |
| `media/parsingGuideSidebar.js` | **Modify** | Remove strip button listener, `setFormatStripStatus`, and `formatStripStatus` handler |

---

### Task 1: `formattingTheme.ts` — types, constants, and `readThemeFromXml`

**Files:**
- Create: `src/parsers/formattingTheme.ts`
- Create: `src/tests/unit/formattingTheme.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/tests/unit/formattingTheme.test.ts`:

```typescript
import { readThemeFromXml, WorkbookTheme } from '../../parsers/formattingTheme.js';

describe('readThemeFromXml', () => {
    it('reads font-size and font-color from a worksheet style-rule', () => {
        const xml = `
            <style-rule element='worksheet'>
                <format attr='font-size' value='14' />
                <format attr='font-color' value='#d16302' />
            </style-rule>`;
        const result = readThemeFromXml(xml);
        expect(result['worksheet']).toEqual({ 'font-size': '14', 'font-color': '#d16302' });
    });

    it('reads multiple elements independently', () => {
        const xml = `
            <style-rule element='tooltip'>
                <format attr='font-size' value='10' />
            </style-rule>
            <style-rule element='header'>
                <format attr='font-color' value='#333333' />
            </style-rule>`;
        const result = readThemeFromXml(xml);
        expect(result['tooltip']?.['font-size']).toBe('10');
        expect(result['header']?.['font-color']).toBe('#333333');
        expect(result['worksheet']).toBeUndefined();
    });

    it('returns empty object when no style-rules present', () => {
        const result = readThemeFromXml('<workbook></workbook>');
        expect(Object.keys(result)).toHaveLength(0);
    });

    it('ignores format nodes for unknown elements', () => {
        const xml = `<style-rule element='unknown-element'><format attr='font-size' value='9' /></style-rule>`;
        const result = readThemeFromXml(xml);
        expect(result['unknown-element']).toBeUndefined();
    });

    it('reads gridline line attributes', () => {
        const xml = `
            <style-rule element='gridline'>
                <format attr='line-color' value='#e6e6e6' />
                <format attr='line-width' value='1' />
            </style-rule>`;
        const result = readThemeFromXml(xml);
        expect(result['gridline']).toEqual({ 'line-color': '#e6e6e6', 'line-width': '1' });
    });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npx jest src/tests/unit/formattingTheme.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../../parsers/formattingTheme.js'`

- [ ] **Step 3: Create `src/parsers/formattingTheme.ts` with types, constants, and `readThemeFromXml`**

```typescript
export interface StyleElementValues {
    [attr: string]: string | null;
}

export interface WorkbookTheme {
    [element: string]: StyleElementValues;
}

export const KNOWN_ELEMENTS: Record<string, string[]> = {
    'all':                   ['font-color', 'font-family'],
    'worksheet':             ['font-color', 'font-family', 'font-size'],
    'worksheet-title':       ['font-color', 'font-family', 'font-size'],
    'tooltip':               ['font-color', 'font-family', 'font-size'],
    'dashboard-title':       ['font-color', 'font-family', 'font-size', 'font-weight'],
    'story-title':           ['font-color', 'font-family', 'font-size'],
    'header':                ['font-color', 'font-family'],
    'legend':                ['font-color', 'font-family', 'font-size', 'background-color'],
    'legend-title':          ['font-color', 'font-family', 'font-size'],
    'filter':                ['font-color', 'font-family', 'font-size', 'background-color'],
    'filter-title':          ['font-color', 'font-family', 'font-size'],
    'parameter-ctrl':        ['font-color', 'font-family', 'font-size', 'background-color'],
    'parameter-ctrl-title':  ['font-color', 'font-family', 'font-size'],
    'highlighter':           ['font-color', 'font-family', 'font-size', 'background-color'],
    'highlighter-title':     ['font-color', 'font-family', 'font-size'],
    'page-ctrl-title':       ['font-color', 'font-family', 'font-size'],
    'gridline':              ['line-visibility', 'line-pattern', 'line-width', 'line-color'],
    'zeroline':              ['line-visibility', 'line-pattern', 'line-width', 'line-color'],
    'mark':                  ['mark-color'],
    'view':                  ['background-color'],
};

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function readThemeFromXml(xml: string): WorkbookTheme {
    const theme: WorkbookTheme = {};
    for (const element of Object.keys(KNOWN_ELEMENTS)) {
        const blockRe = new RegExp(
            `<style-rule[^>]*element=['"]${escapeRegex(element)}['"][^>]*>([\\s\\S]*?)<\\/style-rule>`
        );
        const blockMatch = xml.match(blockRe);
        if (!blockMatch) { continue; }
        const block = blockMatch[1];
        const attrs: StyleElementValues = {};
        const attrRe = /<format\s[^>]*attr=['"]([^'"]+)['"][^>]*value=['"]([^'"]*)['"]/g;
        let m: RegExpExecArray | null;
        while ((m = attrRe.exec(block)) !== null) {
            attrs[m[1]] = m[2];
        }
        if (Object.keys(attrs).length > 0) {
            theme[element] = attrs;
        }
    }
    return theme;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx jest src/tests/unit/formattingTheme.test.ts --no-coverage 2>&1 | tail -10
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parsers/formattingTheme.ts src/tests/unit/formattingTheme.test.ts
git commit -m "feat(formatting-panel): add formattingTheme parser with readThemeFromXml"
```

---

### Task 2: `applyThemeEditsToXml`

**Files:**
- Modify: `src/parsers/formattingTheme.ts`
- Modify: `src/tests/unit/formattingTheme.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/tests/unit/formattingTheme.test.ts`:

```typescript
import { applyThemeEditsToXml } from '../../parsers/formattingTheme.js';

describe('applyThemeEditsToXml', () => {
    it('updates an existing format node value', () => {
        const xml = `<style-rule element='worksheet'>\n    <format attr='font-size' value='10' />\n</style-rule>`;
        const result = applyThemeEditsToXml(xml, { worksheet: { 'font-size': '14' } });
        expect(result).toContain(`attr='font-size' value='14'`);
        expect(result).not.toContain(`value='10'`);
    });

    it('adds a new format node to an existing style-rule', () => {
        const xml = `<style-rule element='worksheet'>\n    <format attr='font-size' value='10' />\n</style-rule>`;
        const result = applyThemeEditsToXml(xml, { worksheet: { 'font-color': '#d16302' } });
        expect(result).toContain(`attr='font-color' value='#d16302'`);
        expect(result).toContain(`attr='font-size' value='10'`);
    });

    it('creates a new style-rule block when element does not exist', () => {
        const xml = `<workbook><other /></workbook>`;
        const result = applyThemeEditsToXml(xml, { tooltip: { 'font-size': '12' } });
        expect(result).toContain(`element='tooltip'`);
        expect(result).toContain(`attr='font-size' value='12'`);
    });

    it('removes a format node when value is null', () => {
        const xml = `<style-rule element='worksheet'>\n    <format attr='font-size' value='14' />\n    <format attr='font-color' value='#333' />\n</style-rule>`;
        const result = applyThemeEditsToXml(xml, { worksheet: { 'font-size': null } });
        expect(result).not.toContain(`attr='font-size'`);
        expect(result).toContain(`attr='font-color'`);
    });

    it('is a no-op when removing a value that does not exist', () => {
        const xml = `<workbook></workbook>`;
        const result = applyThemeEditsToXml(xml, { worksheet: { 'font-size': null } });
        expect(result).toBe(xml);
    });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npx jest src/tests/unit/formattingTheme.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `applyThemeEditsToXml is not a function`

- [ ] **Step 3: Implement `applyThemeEditsToXml` and helper in `formattingTheme.ts`**

Append after `readThemeFromXml`:

```typescript
function applyOneEdit(xml: string, element: string, attr: string, value: string | null): string {
    const blockRe = new RegExp(
        `(<style-rule[^>]*element=['"]${escapeRegex(element)}['"][^>]*>)([\\s\\S]*?)(<\\/style-rule>)`
    );
    const blockMatch = xml.match(blockRe);

    if (!blockMatch) {
        if (value === null) { return xml; }
        const newBlock = `    <style-rule element='${element}'>\n        <format attr='${attr}' value='${value}' />\n    </style-rule>\n`;
        return xml.includes('</workbook>')
            ? xml.replace('</workbook>', newBlock + '</workbook>')
            : xml + '\n' + newBlock;
    }

    const [, open, inner, close] = blockMatch;
    const nodeRe = new RegExp(`[ \\t]*<format[^>]*attr=['"]${escapeRegex(attr)}['"][^>]*\\/>[\\r\\n]?`);

    if (value === null) {
        return xml.replace(blockRe, `$1${inner.replace(nodeRe, '')}$3`);
    }

    if (nodeRe.test(inner)) {
        const updatedInner = inner.replace(
            new RegExp(`(<format[^>]*attr=['"]${escapeRegex(attr)}['"][^>]*)value=['"][^'"]*['"]`),
            `$1value='${value}'`
        );
        return xml.replace(blockRe, `$1${updatedInner}$3`);
    }

    const newInner = inner.trimEnd() + `\n        <format attr='${attr}' value='${value}' />\n    `;
    return xml.replace(blockRe, `$1${newInner}$3`);
}

export function applyThemeEditsToXml(xml: string, edits: WorkbookTheme): string {
    let result = xml;
    for (const [element, attrs] of Object.entries(edits)) {
        for (const [attr, value] of Object.entries(attrs)) {
            result = applyOneEdit(result, element, attr, value);
        }
    }
    return result;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx jest src/tests/unit/formattingTheme.test.ts --no-coverage 2>&1 | tail -10
```

Expected: all 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parsers/formattingTheme.ts src/tests/unit/formattingTheme.test.ts
git commit -m "feat(formatting-panel): add applyThemeEditsToXml"
```

---

### Task 3: `xmlToThemeJson` and `validateThemeJson`

**Files:**
- Modify: `src/parsers/formattingTheme.ts`
- Modify: `src/tests/unit/formattingTheme.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/tests/unit/formattingTheme.test.ts`:

```typescript
import { xmlToThemeJson, validateThemeJson } from '../../parsers/formattingTheme.js';

describe('xmlToThemeJson', () => {
    it('generates a valid theme JSON object from XML', () => {
        const xml = `
            <style-rule element='worksheet'>
                <format attr='font-size' value='14' />
                <format attr='font-color' value='#d16302' />
            </style-rule>`;
        const result = xmlToThemeJson(xml) as Record<string, unknown>;
        expect(result['version']).toBe('1.0.0');
        expect(result['base-theme']).toBe('smooth');
        const styles = result['styles'] as Record<string, unknown>;
        expect(styles['worksheet']).toEqual({ 'font-size': 14, 'font-color': '#d16302' });
    });

    it('casts font-size and line-width to integers', () => {
        const xml = `<style-rule element='gridline'><format attr='line-width' value='2' /></style-rule>`;
        const result = xmlToThemeJson(xml) as { styles: Record<string, Record<string, unknown>> };
        expect(result.styles['gridline']['line-width']).toBe(2);
        expect(typeof result.styles['gridline']['line-width']).toBe('number');
    });

    it('omits elements with no set attributes', () => {
        const xml = `<workbook></workbook>`;
        const result = xmlToThemeJson(xml) as { styles: Record<string, unknown> };
        expect(Object.keys(result.styles)).toHaveLength(0);
    });
});

describe('validateThemeJson', () => {
    it('returns null for a valid theme', () => {
        const theme = { version: '1.0.0', 'base-theme': 'smooth', styles: { worksheet: { 'font-size': 14 } } };
        expect(validateThemeJson(theme)).toBeNull();
    });

    it('rejects missing version', () => {
        expect(validateThemeJson({ 'base-theme': 'smooth', styles: {} })).toMatch(/version/);
    });

    it('rejects unknown style element', () => {
        const theme = { version: '1.0.0', 'base-theme': 'smooth', styles: { 'made-up': { 'font-size': 10 } } };
        expect(validateThemeJson(theme)).toMatch(/made-up/);
    });

    it('rejects non-integer font-size', () => {
        const theme = { version: '1.0.0', 'base-theme': 'smooth', styles: { worksheet: { 'font-size': '14' } } };
        expect(validateThemeJson(theme)).toMatch(/integer/);
    });

    it('rejects invalid hex color', () => {
        const theme = { version: '1.0.0', 'base-theme': 'smooth', styles: { worksheet: { 'font-color': 'red' } } };
        expect(validateThemeJson(theme)).toMatch(/hex/);
    });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npx jest src/tests/unit/formattingTheme.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL on new tests.

- [ ] **Step 3: Implement `xmlToThemeJson` and `validateThemeJson`**

Append to `src/parsers/formattingTheme.ts`:

```typescript
const INTEGER_ATTRS = new Set(['font-size', 'line-width']);
const HEX_ATTRS = new Set(['font-color', 'background-color', 'line-color', 'mark-color']);
const HEX_RE = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
const VALID_BASE_THEMES = ['smooth', 'clean', 'modern', 'classic'];

export function xmlToThemeJson(xml: string): object {
    const theme = readThemeFromXml(xml);
    const styles: Record<string, Record<string, string | number>> = {};
    for (const [element, attrs] of Object.entries(theme)) {
        const row: Record<string, string | number> = {};
        for (const [attr, value] of Object.entries(attrs)) {
            if (value === null) { continue; }
            row[attr] = INTEGER_ATTRS.has(attr) ? Number(value) : value;
        }
        if (Object.keys(row).length > 0) {
            styles[element] = row;
        }
    }
    return { version: '1.0.0', 'base-theme': 'smooth', styles };
}

export function validateThemeJson(theme: unknown): string | null {
    if (typeof theme !== 'object' || theme === null) { return 'Theme must be a JSON object'; }
    const t = theme as Record<string, unknown>;
    if (t['version'] !== '1.0.0') { return 'version must be "1.0.0"'; }
    if (!VALID_BASE_THEMES.includes(t['base-theme'] as string)) {
        return `base-theme must be one of: ${VALID_BASE_THEMES.join(', ')}`;
    }
    if (t['styles'] && typeof t['styles'] === 'object') {
        for (const [elem, attrs] of Object.entries(t['styles'] as object)) {
            if (!(elem in KNOWN_ELEMENTS)) { return `Unknown style element: "${elem}"`; }
            for (const [attr, val] of Object.entries(attrs as object)) {
                if (!KNOWN_ELEMENTS[elem].includes(attr)) {
                    return `"${attr}" is not a valid attribute for "${elem}"`;
                }
                if (INTEGER_ATTRS.has(attr) && !Number.isInteger(val)) {
                    return `"${attr}" must be an integer`;
                }
                if (HEX_ATTRS.has(attr) && (typeof val !== 'string' || !HEX_RE.test(val))) {
                    return `"${attr}" must be a hex color like #FF0000`;
                }
            }
        }
    }
    return null;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx jest src/tests/unit/formattingTheme.test.ts --no-coverage 2>&1 | tail -10
```

Expected: all 18 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parsers/formattingTheme.ts src/tests/unit/formattingTheme.test.ts
git commit -m "feat(formatting-panel): add xmlToThemeJson and validateThemeJson"
```

---

### Task 4: `applyThemeJsonToXml`

**Files:**
- Modify: `src/parsers/formattingTheme.ts`
- Modify: `src/tests/unit/formattingTheme.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/tests/unit/formattingTheme.test.ts`:

```typescript
import { applyThemeJsonToXml } from '../../parsers/formattingTheme.js';

describe('applyThemeJsonToXml', () => {
    const theme = {
        version: '1.0.0',
        'base-theme': 'smooth',
        styles: { worksheet: { 'font-size': 14, 'font-color': '#d16302' } }
    };

    it('applies theme values to XML in override mode', () => {
        const xml = `<style-rule element='worksheet'><format attr='font-size' value='10' /></style-rule>`;
        const result = applyThemeJsonToXml(xml, theme, 'override');
        expect(result).toContain(`attr='font-size' value='14'`);
        expect(result).toContain(`attr='font-color' value='#d16302'`);
    });

    it('skips existing values in preserve mode', () => {
        const xml = `<style-rule element='worksheet'><format attr='font-size' value='10' /></style-rule>`;
        const result = applyThemeJsonToXml(xml, theme, 'preserve');
        expect(result).toContain(`attr='font-size' value='10'`);
        expect(result).toContain(`attr='font-color' value='#d16302'`);
    });

    it('applies values not present in XML even in preserve mode', () => {
        const xml = `<workbook></workbook>`;
        const result = applyThemeJsonToXml(xml, theme, 'preserve');
        expect(result).toContain(`attr='font-size' value='14'`);
    });

    it('returns xml unchanged when theme has no styles', () => {
        const xml = `<workbook></workbook>`;
        const result = applyThemeJsonToXml(xml, { version: '1.0.0', 'base-theme': 'smooth', styles: {} }, 'override');
        expect(result).toBe(xml);
    });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npx jest src/tests/unit/formattingTheme.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL on new tests.

- [ ] **Step 3: Implement `applyThemeJsonToXml`**

Append to `src/parsers/formattingTheme.ts`:

```typescript
export function applyThemeJsonToXml(
    xml: string,
    theme: object,
    mode: 'override' | 'preserve'
): string {
    const t = theme as { styles?: Record<string, Record<string, string | number>> };
    if (!t.styles) { return xml; }

    const current = mode === 'preserve' ? readThemeFromXml(xml) : {};
    let result = xml;

    for (const [element, attrs] of Object.entries(t.styles)) {
        for (const [attr, value] of Object.entries(attrs)) {
            if (mode === 'preserve' && current[element]?.[attr] != null) { continue; }
            result = applyOneEdit(result, element, attr, String(value));
        }
    }
    return result;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx jest src/tests/unit/formattingTheme.test.ts --no-coverage 2>&1 | tail -10
```

Expected: all 22 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parsers/formattingTheme.ts src/tests/unit/formattingTheme.test.ts
git commit -m "feat(formatting-panel): add applyThemeJsonToXml"
```

---

### Task 5: Panel skeleton — `formattingPanel.ts`, command, HTML frame

**Files:**
- Create: `src/views/formattingPanel.ts`
- Create: `media/formattingPanel.css`
- Create: `media/formattingPanel.js`
- Modify: `src/extension.ts`
- Modify: `package.json`

- [ ] **Step 1: Create `media/formattingPanel.css`**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
.tabs { display: flex; border-bottom: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background); position: sticky; top: 0; z-index: 10; }
.tab { padding: 10px 20px; cursor: pointer; color: var(--vscode-foreground); opacity: 0.6; border-bottom: 2px solid transparent; font-size: 13px; }
.tab.active { opacity: 1; border-bottom-color: var(--vscode-focusBorder); }
.tab-content { display: none; padding: 16px; }
.tab-content.active { display: block; }
.group-header { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--vscode-descriptionForeground); padding: 12px 0 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
.element-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--vscode-widget-border); }
.element-row.dirty { border-left: 3px solid var(--vscode-focusBorder); padding-left: 8px; }
.element-name { min-width: 160px; font-size: 12px; color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family); }
.attr-group { display: flex; align-items: center; gap: 4px; }
.attr-label { font-size: 11px; color: var(--vscode-descriptionForeground); white-space: nowrap; }
.color-swatch { width: 20px; height: 20px; border-radius: 4px; border: 1px solid var(--vscode-widget-border); cursor: pointer; flex-shrink: 0; }
input[type="text"], input[type="number"] { background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); color: var(--vscode-input-foreground); padding: 3px 6px; border-radius: 3px; font-size: 12px; }
input[type="text"] { width: 120px; }
input[type="number"] { width: 60px; }
select { background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border); color: var(--vscode-dropdown-foreground); padding: 3px 6px; border-radius: 3px; font-size: 12px; }
.clear-btn { background: none; border: none; color: var(--vscode-descriptionForeground); cursor: pointer; font-size: 14px; line-height: 1; padding: 0 2px; }
.clear-btn:hover { color: var(--vscode-foreground); }
.action-bar { position: sticky; bottom: 0; background: var(--vscode-editor-background); border-top: 1px solid var(--vscode-panel-border); padding: 12px 16px; display: flex; gap: 8px; }
.btn { padding: 6px 14px; border-radius: 4px; border: none; cursor: pointer; font-size: 13px; }
.btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.btn-primary:disabled { opacity: 0.4; cursor: default; }
.btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
.status-msg { padding: 8px 12px; border-radius: 4px; font-size: 12px; margin-top: 8px; }
.status-msg.error { background: rgba(220,53,69,0.1); border: 1px solid rgba(220,53,69,0.4); color: #dc3545; }
.status-msg.success { background: rgba(0,120,212,0.08); border: 1px solid rgba(0,120,212,0.25); }
.status-msg.hidden { display: none; }
.file-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.filename { font-size: 12px; color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family); }
.radio-group { display: flex; gap: 16px; margin-bottom: 12px; }
.json-preview { background: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-widget-border); border-radius: 4px; padding: 12px; font-family: var(--vscode-editor-font-family); font-size: 12px; white-space: pre; overflow: auto; max-height: 400px; }
.placeholder { padding: 24px; text-align: center; color: var(--vscode-descriptionForeground); }
```

- [ ] **Step 2: Create `media/formattingPanel.js` with tab switching skeleton**

```javascript
// @ts-check
(function() {
    const vscode = acquireVsCodeApi()
    let state = { elements: {}, pendingEdits: {}, jsonPreview: null, applyMode: 'override' }

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'))
            tab.classList.add('active')
            const target = tab.getAttribute('data-tab')
            if (target) { document.getElementById(target)?.classList.add('active') }
            if (target === 'tab-export') { vscode.postMessage({ type: 'requestExport' }) }
        })
    })

    window.addEventListener('message', message => {
        const msg = message.data
        if (msg.type === 'formattingLoaded') {
            state.elements = msg.elements
            state.pendingEdits = {}
            renderInspect()
        }
        if (msg.type === 'themeJsonReady') {
            state.jsonPreview = msg.json
            renderExport()
        }
        if (msg.type === 'formattingError') {
            showStatus(msg.tab, msg.message, 'error')
        }
        if (msg.type === 'formattingSuccess') {
            showStatus(msg.tab, msg.message, 'success')
            if (msg.elements) { state.elements = msg.elements; state.pendingEdits = {}; renderInspect() }
        }
    })

    function showStatus(tabId, message, tone) {
        const el = document.getElementById(tabId + '-status')
        if (!el) { return }
        el.textContent = message
        el.className = 'status-msg ' + tone
    }

    function renderInspect() { /* implemented in Task 6 */ }
    function renderExport() { /* implemented in Task 9 */ }
})()
```

- [ ] **Step 3: Create `src/views/formattingPanel.ts`**

```typescript
import * as vscode from 'vscode';
import { basename } from 'path';
import { TWBParser } from '../parsers/twbParser.js';
import {
    readThemeFromXml,
    applyThemeEditsToXml,
    xmlToThemeJson,
    applyThemeJsonToXml,
    validateThemeJson,
    WorkbookTheme,
} from '../parsers/formattingTheme.js';

let panel: vscode.WebviewPanel | undefined;

export function registerFormattingPanel(context: vscode.ExtensionContext): void {
    const cmd = vscode.commands.registerCommand(
        'tableauLanguageSupport.openFormattingPanel',
        () => openOrReveal(context)
    );
    context.subscriptions.push(cmd);

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (!panel || !editor) { return; }
            const p = editor.document.uri.path.toLowerCase();
            if (p.endsWith('.twb')) { void refreshPanel(editor.document.uri); }
        })
    );
}

function openOrReveal(context: vscode.ExtensionContext): void {
    if (panel) { panel.reveal(); return; }

    panel = vscode.window.createWebviewPanel(
        'tableauFormattingPanel',
        'Workbook Formatting',
        vscode.ViewColumn.One,
        { enableScripts: true, localResourceRoots: [context.extensionUri] }
    );

    panel.webview.html = getPanelHtml(panel.webview, context);

    panel.webview.onDidReceiveMessage(async msg => {
        switch (msg.type) {
            case 'applyEdits': await handleApplyEdits(msg.edits as WorkbookTheme); break;
            case 'importTheme': await handleImportTheme(msg.filePath as string, msg.mode as 'override' | 'preserve'); break;
            case 'requestExport': await handleRequestExport(); break;
            case 'saveJson': await handleSaveJson(msg.json as string); break;
            case 'pickImportFile': await handlePickImportFile(); break;
        }
    });

    panel.onDidDispose(() => { panel = undefined; });

    const active = vscode.window.activeTextEditor;
    if (active) {
        const p = active.document.uri.path.toLowerCase();
        if (p.endsWith('.twb')) { void refreshPanel(active.document.uri); }
    }
}

function getWorkbookUri(): vscode.Uri | undefined {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const p = editor.document.uri.path.toLowerCase();
        if (p.endsWith('.twb')) { return editor.document.uri; }
    }
    return undefined;
}

async function refreshPanel(uri: vscode.Uri): Promise<void> {
    if (!panel) { return; }
    try {
        const parser = new TWBParser();
        const doc = await parser.parseWorkbook(uri);
        const elements = readThemeFromXml(doc.xml);
        panel.title = `Workbook Formatting — ${basename(uri.fsPath)}`;
        await panel.webview.postMessage({ type: 'formattingLoaded', elements });
    } catch { /* silently ignore read errors */ }
}

async function handleApplyEdits(edits: WorkbookTheme): Promise<void> {
    const uri = getWorkbookUri();
    if (!uri) { await postError('inspect', 'No active .twb file.'); return; }
    try {
        const parser = new TWBParser();
        const doc = await parser.parseWorkbook(uri);
        const updated = applyThemeEditsToXml(doc.xml, edits);
        await parser.writeWorkbook(uri, updated);
        const elements = readThemeFromXml(updated);
        await panel?.webview.postMessage({ type: 'formattingSuccess', tab: 'inspect', message: 'Changes applied.', elements });
    } catch (e) {
        await postError('inspect', `Write failed: ${e instanceof Error ? e.message : String(e)}`);
    }
}

async function handlePickImportFile(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({ filters: { 'JSON Theme': ['json'] }, canSelectMany: false });
    if (uris?.[0]) {
        await panel?.webview.postMessage({ type: 'importFilePicked', filePath: uris[0].fsPath });
    }
}

async function handleImportTheme(filePath: string, mode: 'override' | 'preserve'): Promise<void> {
    const uri = getWorkbookUri();
    if (!uri) { await postError('apply', 'No active .twb file.'); return; }
    try {
        const raw = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(filePath))).toString('utf8');
        const theme = JSON.parse(raw) as object;
        const err = validateThemeJson(theme);
        if (err) { await postError('apply', `Invalid theme: ${err}`); return; }
        const parser = new TWBParser();
        const doc = await parser.parseWorkbook(uri);
        const updated = applyThemeJsonToXml(doc.xml, theme, mode);
        await parser.writeWorkbook(uri, updated);
        await panel?.webview.postMessage({ type: 'formattingSuccess', tab: 'apply', message: 'Theme applied.' });
    } catch (e) {
        await postError('apply', `Failed: ${e instanceof Error ? e.message : String(e)}`);
    }
}

async function handleRequestExport(): Promise<void> {
    const uri = getWorkbookUri();
    if (!uri) { await panel?.webview.postMessage({ type: 'themeJsonReady', json: null }); return; }
    try {
        const parser = new TWBParser();
        const doc = await parser.parseWorkbook(uri);
        const json = JSON.stringify(xmlToThemeJson(doc.xml), null, 4);
        await panel?.webview.postMessage({ type: 'themeJsonReady', json });
    } catch { await panel?.webview.postMessage({ type: 'themeJsonReady', json: null }); }
}

async function handleSaveJson(json: string): Promise<void> {
    const uri = getWorkbookUri();
    const defaultName = uri ? basename(uri.fsPath, '.twb') + '-theme.json' : 'theme.json';
    const dest = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(defaultName), filters: { JSON: ['json'] } });
    if (!dest) { return; }
    await vscode.workspace.fs.writeFile(dest, Buffer.from(json, 'utf8'));
    await panel?.webview.postMessage({ type: 'formattingSuccess', tab: 'export', message: `Saved to ${basename(dest.fsPath)}` });
}

async function postError(tab: string, message: string): Promise<void> {
    await panel?.webview.postMessage({ type: 'formattingError', tab, message });
}

function getPanelHtml(webview: vscode.Webview, context: vscode.ExtensionContext): string {
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'formattingPanel.js'));
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'formattingPanel.css'));
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="${cssUri}">
    <title>Workbook Formatting</title>
</head>
<body>
    <div class="tabs">
        <div class="tab active" data-tab="tab-inspect">Inspect &amp; Edit</div>
        <div class="tab" data-tab="tab-apply">Apply Theme</div>
        <div class="tab" data-tab="tab-export">Export Theme</div>
    </div>
    <div id="tab-inspect" class="tab-content active">
        <div id="inspect-groups"></div>
        <div class="action-bar">
            <button class="btn btn-primary" id="apply-edits-btn" disabled>Apply Changes</button>
            <button class="btn btn-secondary" id="reset-edits-btn">Reset</button>
        </div>
        <div id="inspect-status" class="status-msg hidden"></div>
    </div>
    <div id="tab-apply" class="tab-content">
        <div class="file-row">
            <button class="btn btn-secondary" id="browse-btn">Browse…</button>
            <span class="filename" id="import-filename">No file selected</span>
        </div>
        <div class="radio-group" id="apply-mode-row" style="display:none">
            <label><input type="radio" name="apply-mode" value="override" checked> Override</label>
            <label><input type="radio" name="apply-mode" value="preserve"> Preserve</label>
        </div>
        <button class="btn btn-primary" id="apply-theme-btn" disabled>Apply Theme</button>
        <div id="apply-status" class="status-msg hidden"></div>
    </div>
    <div id="tab-export" class="tab-content">
        <div id="export-placeholder" class="placeholder">Loading…</div>
        <pre id="json-preview" class="json-preview" style="display:none"></pre>
        <div class="action-bar" id="export-actions" style="display:none">
            <button class="btn btn-primary" id="save-json-btn">Save to File…</button>
            <button class="btn btn-secondary" id="copy-json-btn">Copy to Clipboard</button>
        </div>
        <div id="export-status" class="status-msg hidden"></div>
    </div>
    <script src="${jsUri}"></script>
</body>
</html>`;
}
```

- [ ] **Step 4: Add command to `package.json`**

Find the `"commands"` array in `package.json` and add this entry:

```json
{
    "command": "tableauLanguageSupport.openFormattingPanel",
    "title": "Tableau: Open Formatting Panel"
}
```

- [ ] **Step 5: Register in `src/extension.ts`**

Add the import near the top with the other view imports:
```typescript
import { registerFormattingPanel } from './views/formattingPanel.js';
```

Inside `registerAdditionalComponents`, after the `extractPythonCommand` registration:
```typescript
registerFormattingPanel(context);
```

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -i error | head -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/views/formattingPanel.ts media/formattingPanel.js media/formattingPanel.css src/extension.ts package.json
git commit -m "feat(formatting-panel): add panel skeleton with 3-tab HTML and command registration"
```

---

### Task 6: Inspect & Edit tab — render element rows

**Files:**
- Modify: `media/formattingPanel.js`

- [ ] **Step 1: Implement `renderInspect` in `media/formattingPanel.js`**

Replace the `function renderInspect() { /* implemented in Task 6 */ }` placeholder with:

```javascript
const GROUPS = {
    'Fonts': ['all','worksheet','worksheet-title','tooltip','dashboard-title','story-title','header','legend','legend-title','filter','filter-title','parameter-ctrl','parameter-ctrl-title','highlighter','highlighter-title','page-ctrl-title'],
    'Lines': ['gridline','zeroline'],
    'Mark & View': ['mark','view'],
}

const ELEMENT_ATTRS = {
    'all':                  ['font-color','font-family'],
    'worksheet':            ['font-color','font-family','font-size'],
    'worksheet-title':      ['font-color','font-family','font-size'],
    'tooltip':              ['font-color','font-family','font-size'],
    'dashboard-title':      ['font-color','font-family','font-size','font-weight'],
    'story-title':          ['font-color','font-family','font-size'],
    'header':               ['font-color','font-family'],
    'legend':               ['font-color','font-family','font-size','background-color'],
    'legend-title':         ['font-color','font-family','font-size'],
    'filter':               ['font-color','font-family','font-size','background-color'],
    'filter-title':         ['font-color','font-family','font-size'],
    'parameter-ctrl':       ['font-color','font-family','font-size','background-color'],
    'parameter-ctrl-title': ['font-color','font-family','font-size'],
    'highlighter':          ['font-color','font-family','font-size','background-color'],
    'highlighter-title':    ['font-color','font-family','font-size'],
    'page-ctrl-title':      ['font-color','font-family','font-size'],
    'gridline':             ['line-visibility','line-pattern','line-width','line-color'],
    'zeroline':             ['line-visibility','line-pattern','line-width','line-color'],
    'mark':                 ['mark-color'],
    'view':                 ['background-color'],
}

const COLOR_ATTRS = new Set(['font-color','background-color','line-color','mark-color'])
const NUMBER_ATTRS = new Set(['font-size','line-width'])
const SELECT_ATTRS = {
    'font-weight':      ['normal','bold'],
    'line-visibility':  ['on','off'],
    'line-pattern':     ['solid','dashed','dotted'],
}

function renderInspect() {
    const container = document.getElementById('inspect-groups')
    if (!container) { return }
    container.innerHTML = ''

    for (const [groupName, elements] of Object.entries(GROUPS)) {
        const header = document.createElement('div')
        header.className = 'group-header'
        header.textContent = groupName
        container.appendChild(header)

        for (const element of elements) {
            const attrs = ELEMENT_ATTRS[element] || []
            const row = document.createElement('div')
            row.className = 'element-row'
            row.dataset.element = element

            const nameEl = document.createElement('span')
            nameEl.className = 'element-name'
            nameEl.textContent = element
            row.appendChild(nameEl)

            for (const attr of attrs) {
                const currentVal = (state.pendingEdits[element]?.[attr] !== undefined)
                    ? state.pendingEdits[element][attr]
                    : (state.elements[element]?.[attr] ?? null)

                const group = document.createElement('div')
                group.className = 'attr-group'

                const label = document.createElement('span')
                label.className = 'attr-label'
                label.textContent = attr
                group.appendChild(label)

                if (COLOR_ATTRS.has(attr)) {
                    const swatch = document.createElement('div')
                    swatch.className = 'color-swatch'
                    swatch.style.background = currentVal || '#888888'
                    const input = document.createElement('input')
                    input.type = 'text'
                    input.value = currentVal || ''
                    input.placeholder = '#000000'
                    input.style.width = '90px'
                    input.addEventListener('input', () => {
                        swatch.style.background = input.value
                        stageEdit(element, attr, input.value || null)
                        markRowDirty(row, element)
                    })
                    swatch.addEventListener('click', () => input.focus())
                    group.appendChild(swatch)
                    group.appendChild(input)
                } else if (NUMBER_ATTRS.has(attr)) {
                    const input = document.createElement('input')
                    input.type = 'number'
                    input.value = currentVal !== null ? String(currentVal) : ''
                    input.min = '1'; input.max = '99'
                    input.addEventListener('input', () => {
                        stageEdit(element, attr, input.value || null)
                        markRowDirty(row, element)
                    })
                    group.appendChild(input)
                } else if (SELECT_ATTRS[attr]) {
                    const sel = document.createElement('select')
                    const empty = document.createElement('option')
                    empty.value = ''; empty.textContent = '—'
                    sel.appendChild(empty)
                    for (const opt of SELECT_ATTRS[attr]) {
                        const o = document.createElement('option')
                        o.value = opt; o.textContent = opt
                        if (currentVal === opt) { o.selected = true }
                        sel.appendChild(o)
                    }
                    sel.addEventListener('change', () => {
                        stageEdit(element, attr, sel.value || null)
                        markRowDirty(row, element)
                    })
                    group.appendChild(sel)
                } else {
                    const input = document.createElement('input')
                    input.type = 'text'
                    input.value = currentVal || ''
                    input.addEventListener('input', () => {
                        stageEdit(element, attr, input.value || null)
                        markRowDirty(row, element)
                    })
                    group.appendChild(input)
                }

                const clearBtn = document.createElement('button')
                clearBtn.className = 'clear-btn'
                clearBtn.title = 'Clear this override'
                clearBtn.textContent = '×'
                clearBtn.addEventListener('click', () => {
                    stageEdit(element, attr, null)
                    markRowDirty(row, element)
                    renderInspect()
                })
                group.appendChild(clearBtn)
                row.appendChild(group)
            }
            container.appendChild(row)
        }
    }
    updateApplyBtn()
}

function stageEdit(element, attr, value) {
    if (!state.pendingEdits[element]) { state.pendingEdits[element] = {} }
    state.pendingEdits[element][attr] = value
}

function markRowDirty(row, element) {
    const hasPending = Object.keys(state.pendingEdits[element] || {}).length > 0
    row.classList.toggle('dirty', hasPending)
    updateApplyBtn()
}

function updateApplyBtn() {
    const btn = document.getElementById('apply-edits-btn')
    if (btn) { btn.disabled = Object.keys(state.pendingEdits).length === 0 }
}
```

- [ ] **Step 2: Wire Apply and Reset buttons in `media/formattingPanel.js`**

Add inside the IIFE after the tab click listeners:

```javascript
document.getElementById('apply-edits-btn')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'applyEdits', edits: state.pendingEdits })
})

document.getElementById('reset-edits-btn')?.addEventListener('click', () => {
    state.pendingEdits = {}
    renderInspect()
})
```

- [ ] **Step 3: Build and verify no errors**

```bash
npx esbuild --bundle --external:vscode src/extension.ts --outdir=out --platform=node --target=node20 --format=cjs 2>&1 | tail -5
```

Expected: build completes, no errors.

- [ ] **Step 4: Commit**

```bash
git add media/formattingPanel.js
git commit -m "feat(formatting-panel): implement Inspect & Edit tab rendering and edit staging"
```

---

### Task 7: Apply Theme tab wiring

**Files:**
- Modify: `media/formattingPanel.js`

- [ ] **Step 1: Add Apply Theme tab logic in `media/formattingPanel.js`**

Add inside the IIFE after the Reset button listener:

```javascript
let importFilePath = null

document.getElementById('browse-btn')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'pickImportFile' })
})

window.addEventListener('message', message => {
    const msg = message.data
    if (msg.type === 'importFilePicked') {
        importFilePath = msg.filePath
        const el = document.getElementById('import-filename')
        if (el) { el.textContent = msg.filePath.split(/[\\/]/).pop() || msg.filePath }
        const modeRow = document.getElementById('apply-mode-row')
        if (modeRow) { modeRow.style.display = 'flex' }
        const btn = document.getElementById('apply-theme-btn')
        if (btn) { btn.disabled = false }
    }
})

document.getElementById('apply-theme-btn')?.addEventListener('click', () => {
    if (!importFilePath) { return }
    const modeInput = /** @type {HTMLInputElement|null} */ (document.querySelector('input[name="apply-mode"]:checked'))
    const mode = modeInput?.value || 'override'
    vscode.postMessage({ type: 'importTheme', filePath: importFilePath, mode })
})
```

- [ ] **Step 2: Commit**

```bash
git add media/formattingPanel.js
git commit -m "feat(formatting-panel): implement Apply Theme tab"
```

---

### Task 8: Export Theme tab wiring

**Files:**
- Modify: `media/formattingPanel.js`

- [ ] **Step 1: Implement `renderExport` in `media/formattingPanel.js`**

Replace the `function renderExport() { /* implemented in Task 9 */ }` placeholder with:

```javascript
function renderExport() {
    const placeholder = document.getElementById('export-placeholder')
    const preview = document.getElementById('json-preview')
    const actions = document.getElementById('export-actions')
    if (!placeholder || !preview || !actions) { return }

    if (!state.jsonPreview) {
        placeholder.textContent = 'No active .twb file or no formatting set.'
        placeholder.style.display = ''
        preview.style.display = 'none'
        actions.style.display = 'none'
        return
    }

    placeholder.style.display = 'none'
    preview.textContent = state.jsonPreview
    preview.style.display = 'block'
    actions.style.display = 'flex'
}
```

- [ ] **Step 2: Wire Save and Copy buttons in `media/formattingPanel.js`**

Add inside the IIFE:

```javascript
document.getElementById('save-json-btn')?.addEventListener('click', () => {
    if (state.jsonPreview) { vscode.postMessage({ type: 'saveJson', json: state.jsonPreview }) }
})

document.getElementById('copy-json-btn')?.addEventListener('click', () => {
    if (state.jsonPreview) { navigator.clipboard.writeText(state.jsonPreview) }
})
```

- [ ] **Step 3: Commit**

```bash
git add media/formattingPanel.js
git commit -m "feat(formatting-panel): implement Export Theme tab"
```

---

### Task 9: Remove Format Stripper from sidebar

**Files:**
- Modify: `src/views/parsingGuideView.ts`
- Modify: `media/parsingGuideSidebar.js`

- [ ] **Step 1: Remove the FORMAT STRIPPER HTML section from `parsingGuideView.ts`**

Find and remove this entire block (around lines 1667–1685):

```html
    <!-- ====== FORMAT STRIPPER ====== -->
    <div class="sh">
      <span class="cv"><svg class="ic" style="width:10px;height:10px"><use href="#i-chev-d"/></svg></span>
      Format Stripper
    </div>
    <div class="sb"><div class="fs">
      <div class="fg">
        <label class="fl" style="margin-bottom:4px">Strip from active workbook</label>
        <label style="display:block;padding:2px 0"><input type="checkbox" id="strip-borders"> Borders<span id="strip-borders-info" style="color:var(--vscode-descriptionForeground);font-size:11px;margin-left:4px"></span></label>
        <label style="display:block;padding:2px 0"><input type="checkbox" id="strip-bold"> Bold<span id="strip-bold-info" style="color:var(--vscode-descriptionForeground);font-size:11px;margin-left:4px"></span></label>
        <label style="display:block;padding:2px 0"><input type="checkbox" id="strip-font-size"> Font Size<span id="strip-font-size-info" style="color:var(--vscode-descriptionForeground);font-size:11px;margin-left:4px"></span></label>
        <label style="display:block;padding:2px 0"><input type="checkbox" id="strip-font-color"> Font Color<span id="strip-font-color-info" style="color:var(--vscode-descriptionForeground);font-size:11px;margin-left:4px"></span></label>
      </div>
      <button class="bt bs bf" id="strip-formatting-btn" style="margin-top:8px"><svg class="ic"><use href="#i-arrow"/></svg> Strip from Active Workbook</button>
      <div id="format-strip-status" class="ib2" style="display:none;margin-top:6px">
        <svg class="ic"><use href="#i-info"/></svg>
        <span id="format-strip-status-text"></span>
      </div>
    </div></div>
```

- [ ] **Step 2: Remove the `stripFormatting` message handler from `parsingGuideView.ts`**

Find and remove this case from the `switch` statement (around line 134):
```typescript
case 'stripFormatting':
    void this.stripWorkbookFormatting(payload.options);
    break;
```

- [ ] **Step 3: Remove the `openInTableau` case from the switch (only if no longer used elsewhere)**

Check if `openInTableau` is still used. If the case still exists in the switch, leave it. Only remove if the FORMAT STRIPPER was the only trigger.

- [ ] **Step 4: Remove strip-related JS from `parsingGuideSidebar.js`**

Remove the strip button listener block (around lines 880–895):
```javascript
const stripFormattingBtn = document.getElementById('strip-formatting-btn')
if (stripFormattingBtn) {
    stripFormattingBtn.addEventListener('click', () => {
        ...
    })
}
```

Remove the `formatStripStatus` message handler (around line 1212):
```javascript
if (message.type === 'formatStripStatus') {
    setFormatStripStatus(message.message || '', message.tone || 'info')
}
```

Remove the `formatStripScan` message handler (the one added in the previous feature):
```javascript
if (message.type === 'formatStripScan') {
    updateStripLabels(message.result)
}
```

Remove the `setFormatStripStatus`, `updateStripLabels`, and `setStripLabelInfo` functions.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -i error | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/views/parsingGuideView.ts media/parsingGuideSidebar.js
git commit -m "feat(formatting-panel): remove Format Stripper sidebar section"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npx jest --no-coverage 2>&1 | grep -E "Tests:|Test Suites:" | tail -4
```

Expected: `formattingTheme` tests all pass; no new failures vs. baseline (39 suites were pre-existing failures before this feature).

- [ ] **Step 2: Build VSIX**

```bash
npx vsce package 2>&1 | tail -5
```

Expected: `DONE  Packaged: ...tableau-language-support-1.5.7.vsix`

- [ ] **Step 3: Bump version and publish**

```bash
# In package.json, bump "version" to "1.5.8"
git add package.json
git commit -m "chore: bump version to 1.5.8"
VSCE_TOKEN=$(grep -m1 'vsce_token=' .env | cut -d'=' -f2 | tr -d ' "')
npx vsce publish --pat "$VSCE_TOKEN" 2>&1 | tail -5
```

Expected: `DONE  Published TrueCrimeAudit.tableau-language-support v1.5.8.`
