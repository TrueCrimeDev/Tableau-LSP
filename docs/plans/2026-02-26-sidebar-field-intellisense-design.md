# Sidebar Fix + Field Definition IntelliSense Design

**Date:** 2026-02-26
**Goal:** Fix the sidebar script-not-loading issue and add workbook-driven IntelliSense for Tableau field names.

---

## Background

### Script Not Loading
The `parsingGuideView.ts` was modified to load the sidebar JS from `media/parsingGuideSidebar.js` via `webview.asWebviewUri()`. However, `out/extension.js` (built by esbuild) is stale and still embeds the old inline script. VS Code's HTTP-level CSP for WebviewView panels blocks inline scripts. The fix is to commit all modified/untracked files and rebuild.

### Field IntelliSense
The LSP server reads `syntaxes/fields.d.twbl` for custom field completions (format: `[FieldName] = Type`). This file has hardcoded Superstore samples. Users want workbook-specific field completions without touching the shared `fields.d.twbl`.

---

## Architecture

### Data Flow

```
[Sidebar "Generate Defs" button]
  → webview posts { type: 'generateFieldDefinitions' }
  → parsingGuideView.extractFieldDefinitionsToFile()
      → extracts fields from current workbook XML (reuses extractFieldsFromXml + extractCalcsFromXml)
      → writes {workbook-dir}/{workbook-name}.fields.d.twbl
      → commands.executeCommand('tableau-language-support.loadFieldDefinitions', filePath)
  → extension.ts command handler
      → client.sendNotification('tableauLSP/loadFieldDefinitions', { path: filePath })
  → server.ts notification handler
      → fieldParser.loadAdditionalFile(filePath)
      → CompletionPerformanceAPI.clearCache()
      → HoverPerformanceAPI.clearCaches()
  → IntelliSense now provides [FieldName] completions from the workbook
```

### Files Changed

| File | Change |
|---|---|
| `src/views/parsingGuideView.ts` | Add `generateFieldDefinitions` message handler + `extractFieldDefinitionsToFile()` |
| `media/parsingGuideSidebar.js` | Add "Generate Field Defs" button to workbook inspector header |
| `src/fieldParser.ts` | Add `loadAdditionalFile(path: string): void` public method |
| `src/server.ts` | Add `connection.onNotification('tableauLSP/loadFieldDefinitions', ...)` handler |
| `src/extension.ts` | Register `tableau-language-support.loadFieldDefinitions` command bridge |

---

## Generated File Format

File name: `{workbook-name}.fields.d.twbl`
Location: Same directory as the `.twb` workbook file

```twbl
/**
 * Auto-generated field definitions from MyWorkbook.twb
 * Generated: 2026-02-26
 * Regenerate from the Tableau LSP sidebar — do not edit manually.
 */

// === FIELDS (DataTable) ===

/**
 * Firstname - dimension (DataTable)
 */
[Firstname] = String

/**
 * Age - dimension (DataTable)
 */
[Age] = String

// === CALCULATED FIELDS (DataTable) ===

/**
 * !Age - DataTable
 */
[!Age] = String
```

### Type Mapping

| Tableau datatype | LSP type |
|---|---|
| `string` | `String` |
| `integer` / `real` | `Number` |
| `date` | `Date` |
| `datetime` | `DateTime` |
| `boolean` | `Boolean` |
| anything else | `String` |

---

## Sidebar UI

Workbook inspector section header (visible on hover):
```
Workbook (v6-2026-02-24)    [field icon: Generate Defs] [↗ Extract Calcs] [↺ Refresh]
```

- **Generate Defs button**: Uses existing icon-button (`.ib`) pattern with `#i-field` SVG icon
- **Tooltip**: "Generate Field Definitions"
- **On success**: Brief toast in the section — *"Generated 12 field definitions"*
- **On failure**: Status message via existing `postStatus()` flow

---

## Implementation Details

### `FieldParser.loadAdditionalFile(path)`
Loads fields from a second file into the SAME `fieldMap`. Since `parseFields()` adds to the map (not replaces), calling it with a second file accumulates fields. No deduplication needed — later entries overwrite earlier ones for the same name.

```ts
public loadAdditionalFile(filePath: string): void {
    try {
        const content = readFileSync(filePath, 'utf-8');
        this.parseFields(content);
    } catch {
        // File not found or unreadable — silently ignore
    }
}
```

### `extractFieldDefinitionsToFile()` in parsingGuideView.ts
Reuses the existing `extractFieldsFromXml()` and `extractCalcsFromXml()` pipeline (already used in `postWorkbookData()`). Groups by datasource, sorts alphabetically, generates the file content, writes to disk, then fires the command.

### Server Notification Handler
```ts
connection.onNotification('tableauLSP/loadFieldDefinitions', (params: { path: string }) => {
    if (fieldParser) {
        fieldParser.loadAdditionalFile(params.path);
        // Clear caches (same as existing hot-reload handler)
        CompletionPerformanceAPI.clearCache();
        HoverPerformanceAPI.clearCaches();
    }
});
```

### Extension Command Bridge
```ts
const loadFieldDefsCommand = commands.registerCommand(
    'tableau-language-support.loadFieldDefinitions',
    (filePath: string) => {
        client?.sendNotification('tableauLSP/loadFieldDefinitions', { path: filePath });
    }
);
```

---

## Key Decisions

- **Notification over scanning**: Direct notification after generation gives instant IntelliSense without startup overhead or polling.
- **`loadAdditionalFile` not `refresh`**: Using a separate "load additional" method preserves the built-in `syntaxes/fields.d.twbl` fields while adding workbook-specific ones.
- **No persistence**: The server doesn't persist the loaded workspace paths. If the server restarts, the user re-generates. This is acceptable since regeneration is a one-click action.
- **`*.fields.d.twbl` naming convention**: Clear separation from `*.twbl` calculation files. The `fields.d.twbl` suffix signals it's a type-declaration file.
