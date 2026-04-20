# Workbook Formatting Panel — Design Spec

**Date:** 2026-04-20
**Status:** Approved for implementation planning

---

## Summary

Replace the existing Format Stripper sidebar section with a full-featured **Workbook Formatting Panel** — a dedicated `vscode.WebviewPanel` that acts as a property viewer and editor for all Tableau formatting style elements. The panel supports three workflows: inspect and edit formatting values inline, apply an external JSON theme file, and create/export a theme JSON from the current workbook.

---

## Motivation

The Format Stripper only handled 4 formatting attributes (borders, bold, font-size, font-color) and had no way to set values — only clear them. Tableau 2025.1 introduced a full JSON custom theme system covering ~20 style elements with rich attributes. The new panel surfaces all of these in a usable UI, making the extension the primary formatting tool for Tableau workbooks in VS Code.

---

## Architecture

### New Files

| File | Responsibility |
|---|---|
| `src/views/formattingPanel.ts` | `FormattingPanelProvider` — opens/manages the WebviewPanel, handles all message routing, reads/writes the active `.twb` via `TWBParser` |
| `src/parsers/formattingTheme.ts` | Pure functions: `readThemeFromXml`, `applyThemeEditsToXml`, `xmlToThemeJson`, `applyThemeJsonToXml` |
| `media/formattingPanel.js` | Webview JS — tab switching, edit staging, color inputs, message passing |
| `media/formattingPanel.css` | Panel styles (separate from sidebar CSS) |

### Modified Files

| File | Change |
|---|---|
| `src/extension.ts` | Register `tableauLanguageSupport.openFormattingPanel` command and `FormattingPanelProvider` |
| `src/views/parsingGuideView.ts` | Remove the FORMAT STRIPPER HTML section and its message handlers; the sidebar scan info spans stay but the Strip button is removed |
| `media/parsingGuideSidebar.js` | Remove strip button listener and `setFormatStripStatus` handler |
| `package.json` | Add command entry for `openFormattingPanel` |

### Reused

- `TWBParser` — file I/O for `.twb` files
- `scanFormattingXml` — continues powering the sidebar scan info spans

---

## Command

`tableauLanguageSupport.openFormattingPanel`

- Registered in `package.json` with title `"Tableau: Open Formatting Panel"`
- Opens or focuses the existing panel if already open
- Available via Command Palette and optionally a toolbar button in the sidebar header

---

## Panel Layout

Single `vscode.WebviewPanel` with three tabs across the top:

```
[ Inspect & Edit ]  [ Apply Theme ]  [ Export Theme ]
```

Active tab is underlined with the accent color. Panel title: `"Workbook Formatting — <filename.twb>"`, updates when the active workbook changes.

---

## Tab 1: Inspect & Edit

### Load Behavior

On open and on active `.twb` change, the backend calls `readThemeFromXml(xml)` and posts `{ type: 'formattingLoaded', elements }` to the webview. Each style element carries its current attribute values (or `null` if not set in the workbook).

### Groups and Elements

Style elements are organized into four collapsible groups:

**Fonts**
`all`, `worksheet`, `worksheet-title`, `tooltip`, `dashboard-title`, `story-title`, `header`, `legend`, `legend-title`, `filter`, `filter-title`, `parameter-ctrl`, `parameter-ctrl-title`, `highlighter`, `highlighter-title`, `page-ctrl-title`

**Lines**
`gridline`, `zeroline`

**Mark & View**
`mark` (mark-color), `view` (background-color)

**Control Backgrounds**
`legend`, `filter`, `parameter-ctrl`, `highlighter` — background-color attributes only, surfaced separately for clarity

### Row Layout

Each element row:
```
worksheet-title    font-color [■ #d16302 ___________] [×]   font-family [Tableau Bold ▾] [×]   font-size [14 ___] [×]
```

- Color attributes: color swatch (clickable, opens VS Code color picker via existing `openColorPicker`) + hex text input
- Font-family: text input (free-form string, max 50 chars)
- Font-size: number input (1–99)
- Font-weight: dropdown `normal | bold`
- Line-visibility: toggle `on | off`
- Line-pattern: dropdown `solid | dashed | dotted`
- Line-width: number input (1–99)
- Line-color: color swatch + hex input
- **×** per attribute: stages a "clear this override" (sets to null in pending edits)
- Rows with any staged edit are highlighted with a left accent stripe

### Staging and Apply

All edits are held in a JS `pendingEdits` map — nothing is written until the user clicks **Apply Changes**.

- **Apply Changes** button — active only when `pendingEdits` is non-empty; posts `{ type: 'applyEdits', edits: pendingEdits }` to the backend
- **Reset** button — clears `pendingEdits` and re-renders from last loaded values
- On apply success, backend re-reads the XML and posts `formattingLoaded` to refresh the view

---

## Tab 2: Apply Theme

### Flow

1. **Browse…** button — opens `vscode.window.showOpenDialog` filtered to `*.json`; selected filename displayed inline
2. **Override / Preserve** radio buttons appear after file selection:
   - **Override** — theme values replace any existing formatting for the attrs present in the JSON
   - **Preserve** — theme values only apply where the workbook has no existing override
3. **Apply Theme** button — validates the JSON against the Tableau theme schema, then calls `applyThemeJsonToXml(xml, json, mode)` and writes the result
4. On success: Inspect & Edit tab refreshes, status message shown
5. On error: inline error with specific reason (invalid JSON, unknown key `x`, bad value type for `font-size`, no active `.twb`, etc.)

### Validation Rules

- Must have `"version": "1.0.0"`
- Must have `"base-theme"` with value `smooth | clean | modern | classic`
- `styles` keys must match known style elements
- Attribute values must match their declared input type (string/integer) and constraints (hex color format, max string length 50, integer range 1–99)
- Unknown keys are rejected with a specific error naming the unknown key

---

## Tab 3: Export Theme

### Flow

1. On tab open, backend calls `xmlToThemeJson(xml)` and posts the result to the webview
2. Panel displays a read-only JSON preview in a styled `<pre>` block
3. The generated JSON includes only style elements that have at least one attribute set in the workbook
4. `"version": "1.0.0"` and `"base-theme": "smooth"` are always included as the header
5. **Save to File…** button — opens `vscode.window.showSaveDialog` with default filename `<workbookname>-theme.json`
6. **Copy to Clipboard** button — copies the JSON string

---

## `formattingTheme.ts` — Pure Functions

```typescript
export interface StyleElementValues {
    [attr: string]: string | number | null;
}

export interface WorkbookTheme {
    [element: string]: StyleElementValues;
}

// Read all known style element values from .twb XML
export function readThemeFromXml(xml: string): WorkbookTheme

// Write staged edits back to XML (null value = remove override)
export function applyThemeEditsToXml(xml: string, edits: WorkbookTheme): string

// Generate a Tableau-compatible theme JSON object from XML
export function xmlToThemeJson(xml: string): object

// Apply a parsed theme JSON to XML with override or preserve mode
export function applyThemeJsonToXml(xml: string, theme: object, mode: 'override' | 'preserve'): string
```

All functions are pure — no file I/O, no VS Code API calls.

---

## Style Elements Reference

| Element | Attributes |
|---|---|
| `all` | font-color, font-family |
| `worksheet` | font-color, font-family, font-size |
| `worksheet-title` | font-color, font-family, font-size |
| `tooltip` | font-color, font-family, font-size |
| `dashboard-title` | font-color, font-family, font-size, font-weight |
| `story-title` | font-color, font-family, font-size |
| `header` | font-color, font-family |
| `legend` | font-color, font-family, font-size, background-color |
| `legend-title` | font-color, font-family, font-size |
| `filter` | font-color, font-family, font-size, background-color |
| `filter-title` | font-color, font-family, font-size |
| `parameter-ctrl` | font-color, font-family, font-size, background-color |
| `parameter-ctrl-title` | font-color, font-family, font-size |
| `highlighter` | font-color, font-family, font-size, background-color |
| `highlighter-title` | font-color, font-family, font-size |
| `page-ctrl-title` | font-color, font-family, font-size |
| `gridline` | line-visibility, line-pattern, line-width, line-color |
| `zeroline` | line-visibility, line-pattern, line-width, line-color |
| `mark` | mark-color |
| `view` | background-color |

---

## Error Handling

| Scenario | Behavior |
|---|---|
| No active `.twb` | Panel shows "No active workbook — open a .twb file" placeholder in all tabs |
| Active file is `.twbx` | Panel shows "Packaged workbooks (.twbx) are not supported" |
| File read error | Inline error message, panel stays open |
| Apply edits write error | Inline error, staged edits preserved so user can retry |
| Invalid theme JSON on import | Specific validation error shown inline, file not applied |

---

## Sidebar Changes

The existing Format Stripper section in the sidebar is **removed**. The scan info spans (`strip-*-info`) are also removed. The sidebar gains a toolbar button in the panel header area that opens the Formatting Panel via the command.

The `scanFormattingXml` function and its tests are **kept** — they may be reused by `readThemeFromXml` internally.

---

## Out of Scope

- Per-worksheet formatting (all edits apply workbook-wide)
- Live preview of how formatting will look (read + edit only)
- `.twbx` support
- Undo/redo beyond the Reset button
- Syncing edits back to a JSON theme file automatically
