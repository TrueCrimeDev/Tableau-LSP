# Palette Sidebar Redesign

**Date:** 2026-02-21
**Status:** Approved

## Problem

The current sidebar buries the palette library under a large preamble block — a hero section, navigation links, and a bullet-point instruction list. The primary workflow (browsing and applying palettes) requires scrolling past content that is rarely needed. Each palette card also shows redundant information (gradient bar + circular swatches).

## Goal

Make the palette library the first and dominant element in the sidebar. Minimise chrome. All builder tools remain available but are secondary.

## Design

### Layout (top to bottom)

1. **Palette Library** — visible immediately, no scrolling required
   - Section heading: `Palette Library` flush-left, `+ Add` button flush-right
   - Palette list (see card spec below)

2. **Builder Tools** — collapsed `<details>` disclosure at the bottom
   - Contains: Advanced Gradient Generator, Multi-Stop Gradient, Theme Vault
   - File action buttons (Save, Reload, Open Template, Copy to Repository)

3. **Help** — single `?` icon in the section header area linking to the reference guide; replaces the navigation link block and the hero description

### Palette Card

```
┌──────────────────────────────────────────┐
│  ██████████████████████████████████████  │  ← gradient bar, 16px tall, border-radius 4px
│  Tableau LSP Categorical   regular  6 ·  │  ← name (bold) + type badge + count
│                        [⚡] [✎] [⋯]    │  ← Apply / Edit / Archive icons, always visible
└──────────────────────────────────────────┘
```

- Circular swatches below gradient bar are **removed**
- All three action icons are **always visible** (not hover-only) — sidebar is narrow, discoverability matters
- Active/selected state: `vscode-list-activeSelectionBackground` left border accent (unchanged)

### Removed Elements

| Element | Disposition |
|---|---|
| Hero block (eyebrow + h1 + subtitle) | Removed — panel title in VS Code header is sufficient |
| TOOLS navigation links (Color Palettes, Commands, Reference Guide) | Replaced by single `?` icon |
| Bullet-point instruction block | Moved into Builder Tools disclosure as a collapsed note |
| Circular color swatches under gradient bar | Removed — gradient bar carries the visual signal |

### What Does Not Change

- Gradient bar rendering logic
- Palette card click-to-select / active state
- All message types between webview and extension host
- Builder tools functionality (gradient generators, theme vault, file actions)
- CSS variables — continue using VS Code semantic tokens throughout

## Files Affected

- `src/views/parsingGuideView.ts` — the `getGuideHtml()` function is the only change surface; all backend logic is untouched

## Success Criteria

- Palette library is visible without any scrolling on a standard sidebar width
- Each palette card occupies ≤ 52px vertical space
- Apply / Edit / Archive actions are reachable in one click from the list
- Builder tools remain fully functional inside the collapsed disclosure
