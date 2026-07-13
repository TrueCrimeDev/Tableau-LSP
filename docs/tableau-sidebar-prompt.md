# Tableau Tools Sidebar Implementation Prompt

You are implementing a WebView sidebar panel for the **Tableau-LSP** VS Code extension. The sidebar is registered in the activity bar under a palette icon and renders as a single-page HTML WebView with four collapsible top-level sections. Every visual element must use native `--vscode-*` CSS custom properties for full theme compliance (light, dark, high contrast). Reference the design mockup at `docs/plans/tableau-sidebar-mockup.html` for exact layout, spacing, and interaction patterns.

## Architecture

The sidebar is a single `WebviewViewProvider` registered in `package.json` under `views.tableauTools`. The HTML is generated server-side in TypeScript and injected into the WebView. All communication between the WebView and the extension host uses `postMessage` / `onDidReceiveMessage`.

Organize the source into:

```
src/
  sidebar/
    SidebarProvider.ts        # WebviewViewProvider, message router
    workbookParser.ts         # .twb/.twbx XML parsing logic
    paletteLibrary.ts         # Palette CRUD, Preferences.tps read/write
    builderTools.ts           # Gradient generators, palette editor state
    commandReference.ts       # Static command list data
    html/
      sidebar.ts              # Main HTML template assembly
      sections/
        workbook.ts           # Workbook section HTML
        paletteLibrary.ts     # Palette Library section HTML
        builderTools.ts       # Builder Tools section HTML
        commands.ts           # Commands & Reference section HTML
      styles.ts               # All CSS as a template literal
      icons.ts                # SVG sprite sheet as a template literal
```

## Section Order (top to bottom)

1. **Workbook** - .twb/.twbx file parser and inspector
2. **Palette Library** - Saved palette collection
3. **Builder Tools** - Palette editor, gradient generators, theme vault, file actions
4. **Commands & Reference** - Quick command links and .twbl tips

---

## Section 1: Workbook

This is the first and most important section. It parses the active `.twb` or `.twbx` file and displays its contents.

### Active File Card

At the top of the section body, render a file indicator card:

- Left: document icon (16x16 SVG)
- Center: filename (13px, font-weight 600) + metadata line (11px, `--vscode-descriptionForeground`). Metadata format: `Tableau {version} · {n} datasource(s) · {n} calc(s) · {n} sheet(s)`
- Right: icon button to reveal the file in Explorer
- Card styling: `--vscode-input-background` background, 3px `--vscode-focusBorder` left border, 6px 12px padding, 3px border-radius, 4px 8px outer margin

Parse the Tableau version from the `source-build` attribute on the root `<workbook>` element (e.g. `source-build='2023.2.0 (20232.23.0611.2007)'` becomes `2023.2`).

### Extract Calculations Button

Below the file card, render a full-width primary button (`--vscode-button-background`) labeled "Extract Calculations" with an export/upload icon. On click, it:

1. Parses all `<column>` elements that have a `<calculation class='tableau'>` child across all `<datasource>` elements
2. Builds a name resolution map from each column's `name` attribute to its `caption` attribute
3. Resolves internal field references in formulas (e.g. `[Calculation_5008002792316035072]` to the human-readable caption)
4. Strips `[sqlproxy.xxx].` prefixes from field references
5. Uppercases Tableau keywords: IF, THEN, ELSE, ELSEIF, END, CASE, WHEN, AND, OR, NOT, TRUE, FALSE, NULL
6. Filters trivial formulas: bare field references (`[FieldName]`), bare string literals, bare integers
7. Writes output in `.twbl`-compatible format:
   ```
   // Caption | DatasourceName | filename.twb
   FORMULA_EXPRESSION
   ```
8. Shows confirmation state: button text changes to "Extracted {n} calculations" with a checkmark icon, reverts after 2.5 seconds

### Subsections (all collapsible)

Each subsection header is 11px, font-weight 600, `--vscode-descriptionForeground`, with a chevron and a right-aligned item count.

#### Datasources

List each `<datasource>` element using its `caption` attribute as the label. Derive the connection type from the `<connection class='...'>` attribute inside `<named-connections>`:

| Connection class | Display label |
|---|---|
| `excel-direct` | Excel |
| `sqlserver` | SQL Server |
| `postgres` | PostgreSQL |
| `snowflake` | Snowflake |
| `textscan` | CSV/Text |
| Other | The raw class value |

Each row is a tree item: 22px height, 28px left padding, database icon (16x14), label, right-aligned type badge (10px uppercase, `--vscode-descriptionForeground`).

#### Calculated Fields

List every `<column>` that has a `<calculation class='tableau'>` child. For each:

- Tree item row: fx icon, caption as label, datatype badge (`string`, `integer`, `real`, `boolean`, `date`, `datetime`) styled as inline code (11px mono, `--vscode-input-background` pill, 3px radius)
- Formula preview row below: 18px height, 50px left padding, 11px monospace, `--vscode-descriptionForeground`. Apply syntax coloring:
  - Functions: `#dcdcaa`
  - Field references `[...]`: `#9cdcfe`
  - Keywords: `#569cd6`
  - Strings: `#ce9178`
- Hover-reveal action buttons on the tree item row: "Copy Formula" (files icon), "Insert into Editor" (arrow-right icon)

#### Fields

List raw columns from `<metadata-record class='column'>` elements. Each row: field/table icon, column name (use `caption` if the column has one, otherwise `<remote-name>`), right-aligned type label from `<local-type>`.

#### Worksheets

List each `<worksheet name='...'>`. Each row: grid icon, worksheet name.

#### Custom Palettes

List `<color-palette>` elements from the workbook XML. If none exist, show italic empty state: "No custom palettes in this workbook." (`--vscode-disabledForeground`, 11px, 28px left padding).

### .twbx Support

A `.twbx` file is a ZIP archive. When the active file is `.twbx`, extract the `.twb` file from the archive root before parsing. Use the `jszip` or Node.js `zlib` module.

### Empty State

When no `.twb`/`.twbx` file is open, replace all subsections with a centered message: "Open a `.twb` file to inspect its palettes." with `.twb` as a link styled with `--vscode-textLink-foreground`.

---

## Section 2: Palette Library

Header actions (hover-reveal): "New Palette" (plus icon), "Import from File" (import icon). Badge shows total palette count.

### Row Pattern

Each palette is a 22px-height row:

- 60x10px gradient bar (border-radius 2px) showing the palette colors as a CSS `linear-gradient(90deg, ...)`
- Palette name (13px, flex:1, ellipsis overflow)
- Color count (12px, `--vscode-descriptionForeground`, right margin 4px) -- hidden on hover
- Hover-reveal actions: Edit (pen icon), Apply (arrow-right icon), More (dots icon)

Selected row uses `--vscode-list-activeSelectionBackground` and `--vscode-list-activeSelectionForeground`. Hover uses `--vscode-list-hoverBackground`.

### Data Source

Read palettes from `config/Preferences.tps` (XML format). Each `<color-palette>` element has attributes `name` and `type` (regular, ordered-diverging, ordered-sequential) and contains `<color>` child elements with hex values.

---

## Section 3: Builder Tools

No header actions. Contains five collapsible subsections separated by 1px `--vscode-separator` lines (4px 12px margin).

### 3a. Palette Editor

Form fields:

- **Palette name**: text input (full width)
- **Palette type**: dropdown with options: Categorical (regular), Diverging (ordered-diverging), Sequential (ordered-sequential)
- **Colors**: horizontal wrap of 22x22px color chips (3px radius, 1px `rgba(255,255,255,0.08)` border, hover brightens border). Last chip is a dashed-border "+" add button.
- **Action bar**: flex row with Save (primary, flex:2) + New/Archive/Delete (secondary icon buttons, flex:1 each). Delete button uses `--vscode-errorForeground` color.
- **Apply to Active Workbook**: full-width secondary button

When a palette is selected in the Library, the editor loads its data. Save writes back to `Preferences.tps`.

### 3b. Advanced Gradient Generator

Two-row compact layout:

**Row 1** (flex, 8px gap):
- Base Color (flex:1): 26x26px color preview square + hex text input (12px mono)
- Steps (72px fixed width): number input, min 2 max 20

**Row 2** (flex, 8px gap, align-items: flex-end):
- Easing Curve (flex:1): dropdown with Linear, Ease Out, Ease In, Ease In-Out
- Generate (72px fixed width): primary button, 26px height, 12px font, full width

**Output**: swatch strip fused with an apply button. The gradient swatches fill `flex:1` (equal-width segments, 24px height, left border-radius on first, no radius on last). A 28px-wide primary-colored arrow button caps the right end (right border-radius). Hover on any swatch shows a tooltip with the hex value (11px mono, `#383838` bg, `#505050` border, positioned above).

The generator takes the base color and produces a lightness scale using the selected easing curve across the specified number of steps.

### 3c. Multi-Stop Gradient

Three-row compact layout:

**Row 1** (flex, 8px gap):
- Start Color (flex:1): color preview + hex input
- End Color (flex:1): color preview + hex input
- Steps (72px fixed width): number input

**Row 2** (flex, 8px gap, align-items: flex-end):
- Easing Curve (flex:1): dropdown (Linear, Ease Out, Ease In)
- Color Space (flex:1): dropdown (LAB, RGB, HSL)
- Generate (72px fixed width): primary button, matched to row 1's Steps column

**Output**: identical swatch-apply combo as 3b.

The generator interpolates between start and end color in the selected color space using the easing curve.

### 3d. Theme Vault

Uses the **identical row pattern** as the Palette Library: 22px height, 60x10px gradient bar, name, color count, hover-reveal actions (Load and Apply icons). Theme vault stores multi-palette collections as named themes. Data lives in extension storage or a JSON file in the workspace `.vscode/` directory.

### 3e. File Actions

- Button row: Save (primary) + Reload (secondary), flex split
- Info banner: `rgba(0,120,212,0.08)` background, `rgba(0,120,212,0.25)` border, 3px radius, 12px font. Contains a check-circle icon (`#3794ff`) and status message.
- Source path line: 11px, `--vscode-descriptionForeground`

---

## Section 4: Commands & Reference

### Most Used Commands

List of clickable command rows (12px font, 3px radius, hover background). Each row: 16px icon + inline `<code>` label (11px mono, `--vscode-input-background` pill).

Commands to include:
- Format Tableau Expression (code icon)
- Validate Tableau Expression (check icon)
- Insert IF Statement (branch icon)
- Insert CASE Statement (list icon)
- Insert LOD Expression (layers icon)
- Show Function Help (help icon)
- Extract Calculations (export icon)

Each row calls `vscode.commands.executeCommand` with the corresponding command ID via postMessage.

### .twbl Parsing Tips

Static list of plain-text tips (12px, `--vscode-descriptionForeground`, 1.6 line-height). Content:

- Separate calculations with a blank line
- Header format: `// Name - description`
- Put IF, THEN, ELSE, END on own lines
- Align END with opening keyword
- Avoid non-ASCII characters (smart quotes, emoji)

---

## Design System Rules

### Sizing

| Element | Height |
|---|---|
| Section header | 22px |
| Subsection header | ~22px (4px vertical padding) |
| Tree item / palette row | 22px |
| Input / select / button | 26px |
| Icon button | 22x22px |
| Color chip | 22x22px |
| Swatch strip | 24px |
| Color preview square | 26x26px |

### Typography

| Context | Size |
|---|---|
| Body / labels / inputs | 13px |
| Field labels | 12px |
| Section headers | 11px uppercase, font-weight 700, letter-spacing 0.04em |
| Subsection headers | 11px, font-weight 600 |
| Metadata / badges | 10-11px |
| Code / mono | 11px, "SF Mono", "Cascadia Code", "Fira Code", "Consolas", monospace |

### Colors (all via CSS custom properties)

Never hardcode colors. Use `var(--vscode-*)` tokens:

- Surfaces: `sideBar-background`, `sideBar-foreground`, `sideBarSectionHeader-background`, `sideBarSectionHeader-foreground`, `input-background`, `editor-background`
- Interactive: `button-background` (primary), `button-secondaryBackground`, `list-hoverBackground`, `list-activeSelectionBackground`, `focusBorder`
- Text: `foreground`, `descriptionForeground`, `disabledForeground`, `errorForeground`, `textLink-foreground`
- Borders: `sideBar-border`, `input-border`, `dropdown-border`

### Inputs

- `border-radius: 0` (not rounded)
- Height 26px
- Focus: `border-color: var(--vscode-focusBorder)`
- Number inputs: hide native spinners, render custom dark SVG up/down arrows via `background-image`
- Select dropdowns: hide native arrow with `appearance: none`, render custom SVG caret

### Interactions

- Section headers: click toggles collapse. Chevron rotates -90deg when collapsed.
- Row items: hover shows `--vscode-list-hoverBackground`. Hover reveals action buttons (opacity 0 to 1). Hover hides the meta/count text.
- Icon buttons: 22x22px, transparent background, 3px border-radius, hover shows `rgba(90,93,94,0.31)` background.

### Scrollbar

Style the WebView scrollbar to match VS Code: 10px width, transparent track, `rgba(121,121,121,0.4)` thumb with 2px transparent border and `background-clip: content-box`, 10px border-radius.

---

## Message Protocol

### WebView to Extension Host

```typescript
type SidebarMessage =
  | { type: 'extractCalculations' }
  | { type: 'refreshWorkbook' }
  | { type: 'revealFile', path: string }
  | { type: 'copyFormula', formula: string }
  | { type: 'insertFormula', formula: string }
  | { type: 'selectPalette', index: number }
  | { type: 'savePalette', palette: PaletteData }
  | { type: 'newPalette' }
  | { type: 'deletePalette', index: number }
  | { type: 'archivePalette', index: number }
  | { type: 'applyPaletteToWorkbook', index: number }
  | { type: 'generateGradient', config: GradientConfig }
  | { type: 'generateMultiStop', config: MultiStopConfig }
  | { type: 'applyToEditor', colors: string[] }
  | { type: 'loadTheme', index: number }
  | { type: 'applyTheme', index: number }
  | { type: 'saveFile' }
  | { type: 'reloadFile' }
  | { type: 'executeCommand', commandId: string }
```

### Extension Host to WebView

```typescript
type HostMessage =
  | { type: 'workbookData', data: WorkbookData | null }
  | { type: 'paletteLibrary', palettes: PaletteData[] }
  | { type: 'themeVault', themes: ThemeData[] }
  | { type: 'gradientResult', colors: string[] }
  | { type: 'extractResult', count: number }
  | { type: 'statusMessage', text: string }
```

---

## .twb Parsing Details

A `.twb` file is XML. Key extraction paths:

### Workbook metadata
- Version: `/workbook/@source-build` - parse `YYYY.N` from the build string
- Datasource count: count `/workbook/datasources/datasource` elements
- Worksheet count: count `/workbook/worksheets/worksheet` elements
- Calculated field count: count `//column[calculation]` elements

### Datasources
- Path: `/workbook/datasources/datasource`
- Caption: `@caption` attribute
- Connection type: `datasource/connection/named-connections/named-connection/connection/@class`

### Calculated Fields
- Path: `//datasource//column[calculation[@class='tableau']]`
- Caption: `column/@caption`
- Datatype: `column/@datatype`
- Formula: `column/calculation/@formula`
- Parent datasource: traverse up to the containing `<datasource>` and read its `@caption`

### Fields (raw columns)
- Path: `//datasource/connection/metadata-records/metadata-record[@class='column']`
- Name: `remote-name` child element text, or use the column's `@caption` if one exists
- Type: `local-type` child element text

### Worksheets
- Path: `/workbook/worksheets/worksheet`
- Name: `@name` attribute

### Color Palettes
- Path: `/workbook/preferences/color-palette` (if present)
- Name: `@name`, Type: `@type`
- Colors: child `<color>` elements text content

### Name Resolution Map
Build a map of `column/@name` to `column/@caption` across all datasources. When processing formulas, replace any `[internal_name]` references with the resolved caption. Also strip `[sqlproxy.xxx].` prefixes from field references using regex: `/\[sqlproxy\.[^\]]+\]\./g` replaced with empty string.
