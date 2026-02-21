# Palette Sidebar Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the sidebar webview so the palette library is the first visible element, with all builder tools collapsed below it, and compact palette cards that show action buttons directly.

**Architecture:** All changes are confined to the `getGuideHtml()` function in `src/views/parsingGuideView.ts` — the HTML string, its embedded CSS, and the embedded JS. No backend TypeScript changes. No new files. No message protocol changes.

**Tech Stack:** VS Code Webview API, VS Code Webview UI Toolkit (`vscode-button`, `vscode-dropdown`, `vscode-text-field`, `vscode-divider`), plain HTML/CSS/JS embedded in a TypeScript template literal.

---

## Context

The only file that changes is:
- **Modify:** `src/views/parsingGuideView.ts` — specifically the `getGuideHtml()` function starting at line 362.

The function returns one large HTML string. It has three parts:
1. `<style>` block (lines ~376–885)
2. `<body>` HTML (lines ~887–1126)
3. `<script>` block (lines ~1127–end)

All four tasks below touch different parts of this one function.

---

## Task 1: Remove preamble — hero block and nav menu

**Files:**
- Modify: `src/views/parsingGuideView.ts`

The hero block (lines ~930–934) and the nav menu (lines ~936–941) appear before any palette content and waste significant vertical space. Remove both from the HTML and their associated CSS rules.

**Step 1: Delete the hero HTML block**

Find and delete this exact HTML in `getGuideHtml()`:

```html
        <header class="hero">
            <div class="eyebrow">Tableau</div>
            <h1>Tableau Tools</h1>
            <p class="subtitle">Color palette builder, workbook extraction, and .twbl language support.</p>
        </header>
```

**Step 2: Delete the nav menu HTML block**

Find and delete:

```html
        <nav class="menu">
            <div class="menu-title">Tools</div>
            <a href="#palettes">Color Palettes</a>
            <a href="#commands">Commands</a>
            <a href="#guide">Reference Guide</a>
        </nav>
```

**Step 3: Delete the associated CSS rules**

Remove these CSS rule blocks from the `<style>` section:

```css
        .hero {
            padding: 12px 0;
            margin-bottom: 16px;
        }

        .eyebrow {
            text-transform: uppercase;
            letter-spacing: 0.1em;
            font-size: 0.75rem;
            opacity: 0.8;
            margin-bottom: 4px;
        }

        h1 {
            margin: 4px 0;
            font-size: 1.2rem;
            font-weight: 600;
        }

        .subtitle {
            font-size: 0.9rem;
            opacity: 0.8;
            margin: 4px 0 0 0;
        }

        .menu {
            display: flex;
            flex-direction: column;
            gap: 4px;
            margin-bottom: 16px;
        }

        .menu-title {
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            opacity: 0.6;
            margin-bottom: 4px;
        }

        .menu a {
            text-decoration: none;
            color: var(--vscode-textLink-foreground);
            padding: 6px 8px;
            border-radius: 4px;
            transition: background-color 0.1s ease, color 0.1s ease;
        }

        .menu a:hover {
            background-color: var(--vscode-list-hoverBackground);
            color: var(--vscode-textLink-activeForeground);
        }
```

**Step 4: Check TypeScript compiles**

```bash
cd /mnt/c/Users/dev/Documents/Design/Coding/Tableau-LSP && yarn typecheck
```

Expected: no errors.

**Step 5: Commit**

```bash
git add src/views/parsingGuideView.ts
git commit -m "refactor(sidebar): remove hero block and nav menu preamble"
```

---

## Task 2: Hoist palette library section with library header

**Files:**
- Modify: `src/views/parsingGuideView.ts`

Currently the palette list sits inside a deeply nested `<section class="card">` → `<div class="palette-grid">` → `<div class="panel-block">`. Move it to the top level of `.shell`, directly after `<div class="shell">` opens, before `<main>`.

**Step 1: Remove the palette list's current location**

Find and delete the `panel-block` div that wraps the palette list (keep the `palette-list` div ID, just unwrap it from its current container), and the `<span class="chip">Color Palettes</span>` and `<h2>Preferences.tps Builder</h2>` heading and description paragraph and bullet list that precede it.

The block to remove starts here (inside `<section class="card" id="palettes">`):

```html
                <span class="chip">Color Palettes</span>
                <h2>Preferences.tps Builder</h2>
                <p>Build palettes here, save them to <code>config/Preferences.tps</code>, then copy to your Tableau repository.</p>
                <ul>
                    <li><code>regular</code> for categorical palettes.</li>
                    <li><code>ordered-sequential</code> for sequential palettes.</li>
                    <li><code>ordered-diverging</code> for diverging palettes.</li>
                    <li>Use hex colors in the builder.</li>
                </ul>
                <div class="palette-grid">
                    <div class="panel-block">
                        <div class="panel-title">Palette Library</div>
                        <div class="palette-list" id="palette-list"></div>
                    </div>

                    <vscode-divider></vscode-divider>
```

Replace it with just:
```html
                <div class="palette-grid">
```

(The `vscode-divider` after the removed block is also deleted — the section now opens directly into the editor panel-block.)

**Step 2: Add the library header section above `<main>`**

After `<div class="shell">` and before `<main>`, insert:

```html
        <section class="library-section">
            <div class="library-header">
                <span class="library-title">Palette Library</span>
                <div class="library-header-actions">
                    <vscode-button id="new-palette-add" appearance="icon" title="Add palette">+</vscode-button>
                    <a class="library-help" href="#guide" title="Reference guide">?</a>
                </div>
            </div>
            <div class="palette-list" id="palette-list"></div>
        </section>
```

**Step 3: Add CSS for the library header**

Add these rules to the `<style>` block (after the existing `.palette-grid` rule):

```css
        .library-section {
            padding: 8px 0 0 0;
        }

        .library-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 0 6px 0;
        }

        .library-title {
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            opacity: 0.7;
            font-weight: 600;
        }

        .library-header-actions {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .library-help {
            font-size: 0.8rem;
            font-weight: 700;
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            opacity: 0.7;
        }

        .library-help:hover {
            opacity: 1;
            background-color: var(--vscode-list-hoverBackground);
        }
```

**Step 4: Remove the now-orphaned `palette-list` DOM reference guard**

In the `<script>` block, `paletteList` is already obtained by `document.getElementById('palette-list')` — this still works since the element with that ID exists. No JS change needed.

**Step 5: Check TypeScript compiles**

```bash
yarn typecheck
```

Expected: no errors.

**Step 6: Commit**

```bash
git add src/views/parsingGuideView.ts
git commit -m "refactor(sidebar): hoist palette library to top with header row"
```

---

## Task 3: Rebuild palette cards — taller bar, no swatches, action buttons

**Files:**
- Modify: `src/views/parsingGuideView.ts`

Each palette card currently shows: name → meta (type + count) → gradient bar → circular swatches. We want: gradient bar → name + action buttons → meta. Drop the circular swatches entirely.

**Step 1: Update `renderPaletteList()` in the script block**

Find `renderPaletteList()` (around line 1766). Replace the card HTML template:

Current:
```javascript
                return [
                    '<div class="palette-item' + activeClass + '" data-index="' + index + '" role="button" tabindex="0">',
                    '    <div class="palette-name">' + paletteName + '</div>',
                    '    <div class="palette-meta">',
                    '        <span>' + paletteType + '</span>',
                    '        <span>' + colors.length + ' colors</span>',
                    '    </div>',
                    '    <div class="palette-bar" style="background:' + gradient + ';"></div>',
                    '    <div class="palette-chips">' + chips + '</div>',
                    '</div>'
                ].join('');
```

Replace with:
```javascript
                return [
                    '<div class="palette-item' + activeClass + '" data-index="' + index + '" role="button" tabindex="0">',
                    '    <div class="palette-bar" style="background:' + gradient + ';"></div>',
                    '    <div class="palette-row">',
                    '        <span class="palette-name">' + paletteName + '</span>',
                    '        <div class="palette-actions">',
                    '            <vscode-button class="action-apply" data-action="apply" data-index="' + index + '" appearance="icon" title="Apply to workbook">⚡</vscode-button>',
                    '            <vscode-button class="action-edit" data-action="edit" data-index="' + index + '" appearance="icon" title="Edit palette">✎</vscode-button>',
                    '            <vscode-button class="action-archive" data-action="archive" data-index="' + index + '" appearance="icon" title="Archive palette">⋯</vscode-button>',
                    '        </div>',
                    '    </div>',
                    '    <div class="palette-meta">',
                    '        <span>' + paletteType + '</span>',
                    '        <span>·</span>',
                    '        <span>' + colors.length + ' colors</span>',
                    '    </div>',
                    '</div>'
                ].join('');
```

Also remove the `chips` variable — it is no longer used:
```javascript
// DELETE these lines:
                const chips = colors.slice(0, 8).map(color => {
                    const safeColor = sanitizeColor(color);
                    return '<span class="chip-color" style="background:' + safeColor + ';"></span>';
                }).join('');
```

**Step 2: Add action button click handlers**

Find the `paletteList.addEventListener('click', ...)` block (around line 1282). The current handler loads a palette into the editor when any part of the card is clicked. Replace it with a handler that distinguishes between button clicks and card clicks:

```javascript
            paletteList.addEventListener('click', event => {
                const target = event.target;
                if (!(target instanceof HTMLElement)) {
                    return;
                }

                // Check if a card action button was clicked
                const actionButton = target.closest('[data-action]');
                if (actionButton instanceof HTMLElement) {
                    event.stopPropagation();
                    const idx = Number(actionButton.dataset.index);
                    const palette = state.palettes[idx];
                    if (!palette) {
                        return;
                    }
                    const action = actionButton.dataset.action;
                    if (action === 'apply') {
                        const colors = normalizeColorList(palette.colors).filter(Boolean);
                        vscode.postMessage({
                            type: 'applyToWorkbook',
                            palette: { name: palette.name, type: palette.type, colors }
                        });
                        setStatus('Applying \u201c' + escapeHtml(palette.name) + '\u201d to workbook\u2026', 'info');
                    } else if (action === 'edit') {
                        state.selectedName = palette.name;
                        state.editor = { name: palette.name, type: palette.type, colors: palette.colors.slice() };
                        const builderDetails = document.getElementById('builder-tools');
                        if (builderDetails instanceof HTMLDetailsElement) {
                            builderDetails.open = true;
                        }
                        renderAll();
                        builderDetails && builderDetails.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    } else if (action === 'archive') {
                        vscode.postMessage({ type: 'archivePalette', paletteName: palette.name });
                    }
                    return;
                }

                // Fall through: clicking the card body selects the palette
                const item = target.closest('.palette-item');
                if (!item) {
                    return;
                }
                const index = Number(item.dataset.index);
                const palette = state.palettes[index];
                if (!palette) {
                    return;
                }
                state.selectedName = palette.name;
                state.editor = {
                    name: palette.name,
                    type: palette.type,
                    colors: palette.colors.slice()
                };
                renderAll();
            });
```

**Step 3: Wire up the "+ Add" header button**

Find where `newPaletteButton` is declared in the script (around line 1132):
```javascript
        const newPaletteButton = document.getElementById('new-palette');
```

Add a new declaration below it:
```javascript
        const newPaletteAddButton = document.getElementById('new-palette-add');
```

After the existing `newPaletteButton.addEventListener('click', ...)` block, add:
```javascript
            if (newPaletteAddButton) {
                newPaletteAddButton.addEventListener('click', () => {
                    state.selectedName = '';
                    state.editor = { name: '', type: 'regular', colors: [] };
                    if (paletteNameInput) {
                        paletteNameInput.value = '';
                    }
                    if (paletteTypeSelect) {
                        paletteTypeSelect.value = 'regular';
                    }
                    const builderDetails = document.getElementById('builder-tools');
                    if (builderDetails instanceof HTMLDetailsElement) {
                        builderDetails.open = true;
                    }
                    renderAll();
                    builderDetails && builderDetails.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    setStatus('New palette ready.', 'info');
                });
            }
```

**Step 4: Update CSS**

In the `<style>` block:

Increase the gradient bar height (find `.palette-bar, .theme-bar` and change `height: 12px` to `height: 16px`):
```css
        .palette-bar,
        .theme-bar {
            height: 16px;
            border-radius: 4px;
        }
```

Add new layout rules for the card row:
```css
        .palette-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 4px;
        }

        .palette-actions {
            display: flex;
            gap: 0;
            flex-shrink: 0;
        }
```

Remove the now-unused `.palette-chips` and `.chip-color` rules:
```css
/* DELETE these: */
        .palette-chips {
            display: flex;
            gap: 4px;
            flex-wrap: wrap;
        }

        .chip-color {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            border: 1px solid var(--vscode-input-border);
        }
```

**Step 5: Check TypeScript compiles**

```bash
yarn typecheck
```

Expected: no errors.

**Step 6: Commit**

```bash
git add src/views/parsingGuideView.ts
git commit -m "refactor(sidebar): rebuild palette cards with action buttons, remove swatches"
```

---

## Task 4: Collapse builder tools into a `<details>` disclosure

**Files:**
- Modify: `src/views/parsingGuideView.ts`

Wrap everything inside `<section class="card" id="palettes">` (which now contains just the editor, generators, theme vault, and file actions) in a `<details id="builder-tools">` element.

**Step 1: Replace the section opening**

Find:
```html
            <section class="card" id="palettes" style="--delay: 0.05s;">
                <div class="palette-grid">
```

Replace with:
```html
            <details id="builder-tools">
                <summary class="builder-summary">Builder Tools</summary>
                <section class="card" id="palettes">
                <div class="palette-grid">
```

**Step 2: Close the new elements**

Find the closing `</section>` that matches the `<section class="card" id="palettes">` (near line 1098 currently) and add a `</details>` close tag after it:

```html
                </section>
            </details>
```

**Step 3: Add CSS for the summary**

Add to `<style>`:
```css
        .builder-summary {
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            opacity: 0.7;
            font-weight: 600;
            padding: 8px 0;
            cursor: pointer;
            list-style: none;
            display: flex;
            align-items: center;
            gap: 6px;
            border-radius: 4px;
            transition: opacity 0.1s ease;
        }

        .builder-summary:hover {
            opacity: 1;
            background-color: var(--vscode-list-hoverBackground);
        }

        .builder-summary::before {
            content: '▶';
            font-size: 0.6rem;
            transition: transform 0.15s ease;
            display: inline-block;
        }

        details[open] > .builder-summary::before {
            transform: rotate(90deg);
        }
```

Note: The existing `summary` CSS rule styles `<summary>` globally. Make `.builder-summary` override the key properties rather than fighting the existing rule. Check if the global `summary` rule conflicts (it sets `padding: 8px`, `font-weight: 600`, `margin-bottom: 8px`) — since `.builder-summary` is more specific, the explicit properties above will win.

**Step 4: Check TypeScript compiles**

```bash
yarn typecheck
```

Expected: no errors.

**Step 5: Commit**

```bash
git add src/views/parsingGuideView.ts
git commit -m "refactor(sidebar): collapse builder tools into details disclosure"
```

---

## Task 5: Build and visual verification

**Step 1: Run full typecheck and build**

```bash
cd /mnt/c/Users/dev/Documents/Design/Coding/Tableau-LSP
yarn typecheck && yarn build
```

Expected: exits 0 with no errors.

**Step 2: Launch extension in VS Code**

Press `F5` in VS Code to open an Extension Development Host window, then open the Tableau LSP sidebar.

**Verify this checklist:**
- [ ] Palette library is the first element visible (no scrolling needed)
- [ ] "PALETTE LIBRARY" heading appears with `+` button and `?` link flush-right
- [ ] Each palette card shows: gradient bar (taller) → name + 3 icon buttons → type · N colors
- [ ] No circular color swatches appear below the gradient bar
- [ ] Clicking ⚡ on a card shows "Applying…" status and triggers apply
- [ ] Clicking ✎ on a card opens Builder Tools disclosure and loads palette into editor
- [ ] Clicking ⋯ on a card archives the palette
- [ ] Clicking `+` opens Builder Tools and resets the editor
- [ ] Builder Tools is collapsed by default and can be toggled open
- [ ] Commands & Reference section still works (collapsed at bottom)

**Step 3: Commit if any final tweaks were needed**

```bash
git add src/views/parsingGuideView.ts
git commit -m "fix(sidebar): visual tweaks from verification pass"
```

---

## Summary of All Changes

| What | Where | Lines (approx) |
|---|---|---|
| Delete hero CSS | `<style>` | Remove `.hero`, `.eyebrow`, `h1`, `.subtitle` |
| Delete nav CSS | `<style>` | Remove `.menu`, `.menu-title`, `.menu a` |
| Delete swatches CSS | `<style>` | Remove `.palette-chips`, `.chip-color` |
| Increase bar height | `<style>` | `.palette-bar` height 12→16px |
| Add new layout CSS | `<style>` | `.library-section`, `.library-header`, `.library-title`, `.library-header-actions`, `.library-help`, `.palette-row`, `.palette-actions`, `.builder-summary` |
| Delete hero HTML | `<body>` | `<header class="hero">…</header>` |
| Delete nav HTML | `<body>` | `<nav class="menu">…</nav>` |
| Add library section | `<body>` | New `<section class="library-section">` before `<main>` |
| Wrap builder in details | `<body>` | `<details id="builder-tools">` around `<section class="card">` |
| Rebuild card template | `<script>` | `renderPaletteList()` — remove chips, add `.palette-row` + action buttons |
| Rebuild click handler | `<script>` | Replace `paletteList` click listener |
| Wire "+ Add" button | `<script>` | Add `newPaletteAddButton` handler |
