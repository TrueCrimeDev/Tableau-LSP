# Formatting Panel — Locate in File — Design Spec

**Date:** 2026-06-29
**Status:** Approved for implementation planning

---

## Summary

Add a "locate in file" button to each element row in the Formatting Panel's Inspect & Edit tab. Clicking it opens the active `.twb` file in VS Code's text editor and navigates to the `<style-rule>` XML node that corresponds to that panel element.

---

## Motivation

The panel lets users read and edit formatting values, but gives no indication of where those values live in the raw XML. Power users want to verify or hand-edit the XML alongside the panel UI. The button closes that gap with one click.

---

## Architecture

### Files Changed

| File | Change |
|---|---|
| `src/parsers/formattingTheme.ts` | Export `getXmlElementName(panelElement)` helper |
| `src/views/formattingPanel.ts` | Add `locateElement` message handler |
| `media/formattingPanel.js` | Add locate button per row; post `locateElement` message |

No new files. No schema changes.

---

## `getXmlElementName` helper

```typescript
export function getXmlElementName(panelElement: string): string {
    return WRITE_RULES[panelElement]?.to ?? panelElement;
}
```

Uses the existing `WRITE_RULES` map which already encodes the panel-to-XML-element translation.

Examples:
- `worksheet-title` → `title`
- `dashboard-title` → `dash-title`
- `row-divider` → `table-div`
- `column-divider` → `table-div`
- `gridline` → `gridline` (identity)
- `all`, `worksheet`, `mark`, `view`, `pane` → identity

---

## Message Protocol

Webview → extension: `{ type: 'locateElement', element: string }`

No response message needed. The handler opens the editor as a side effect.

---

## Extension Handler

New `case 'locateElement'` in `formattingPanel.ts`:

1. Get the active `.twb` URI via `getWorkbookUri()` — if none, silently return
2. Call `getXmlElementName(msg.element)` to resolve the XML element name
3. Open the file with `vscode.window.showTextDocument(uri, { preview: false, viewColumn: vscode.ViewColumn.Beside })`
4. Search the document text line-by-line for `<style-rule` containing `element='<xmlElement>'` or `element="<xmlElement>"`
5. If found: set `editor.selection` to that line and call `editor.revealRange(range, vscode.TextEditorRevealType.InCenter)`
6. If not found: no-op (element has no `<style-rule>` block — button will be disabled anyway, so this is a fallback only)

---

## Webview Button

One locate button per element row, appended after all attr-groups.

**Enabled:** when `state.elements[element]` exists and has at least one non-null value.

**Disabled:** when the element has no data loaded from the workbook (dimmed, `cursor: default`).

**Appearance:** small secondary icon button, label `{ }`, title attribute `"Locate in .twb file"`.

**Click handler:** `vscode.postMessage({ type: 'locateElement', element })`

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| No active `.twb` | Handler returns silently (button is only visible when panel has a workbook loaded) |
| `.twbx` file | Already unsupported by the panel — not reachable |
| `row-divider` / `column-divider` | Both map to `table-div`; button navigates to the shared `<style-rule element='table-div'>` open tag — correct, since scope is an attribute of child `<format>` nodes |
| Element has no `<style-rule>` block | Button is disabled; handler no-ops as fallback |
| Multiple `<style-rule>` blocks with same element | Navigate to the first match (matches `readThemeFromXml`'s first-write-wins behaviour) |

---

## Out of Scope

- Highlighting the specific `<format attr='...'>` child node (navigating to the `<style-rule>` open tag is sufficient)
- `.twbx` support
- Auto-syncing edits made in the editor back to the panel
