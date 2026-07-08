# Calc Field Click-to-Copy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Clicking a Calculated Field row in the sidebar copies `// {caption}\n{formula}` to clipboard.

**Architecture:** Two edits to `media/parsingGuideSidebar.js` — add `data-action="copy-calc"` to each `.tree-item` div in `renderCalcFields`, then handle that action in the existing `workbookSbEl` click event delegation. No backend changes; the existing `copyFormula` message handler already writes any string to clipboard.

**Tech Stack:** Vanilla JS webview (VS Code WebviewViewProvider), event delegation pattern, `vscode.postMessage` bridge.

---

### Task 1: Add `data-action` to the calc tree-item row

**Files:**
- Modify: `media/parsingGuideSidebar.js:1147`

**Step 1: Make the edit**

In `renderCalcFields` (line 1147), change:

```js
return '<div class="tree-item">' +
```

to:

```js
return '<div class="tree-item" data-action="copy-calc" data-index="' + idx + '" title="Click to copy with header">' +
```

The full updated `renderCalcFields` innerHTML mapping block (lines 1141–1157) becomes:

```js
el.innerHTML = calcs.map((calc, idx) => {
    const caption = escapeHtml(calc.caption || 'Unnamed');
    const formula = calc.formula || '';
    const firstLine = formula.split('\n')[0].slice(0, 120);
    const highlighted = highlightFormula(firstLine);
    const dtBadge = calc.datatype ? '<span class="ti-badge">' + escapeHtml(calc.datatype) + '</span>' : '';
    return '<div class="tree-item" data-action="copy-calc" data-index="' + idx + '" title="Click to copy with header">' +
        '<span class="ti-icon"><svg class="ic"><use href="#i-fx"/></svg></span>' +
        '<span class="ti-label">' + caption + '</span>' +
        dtBadge +
        '<div class="ti-actions">' +
          '<button class="ib" data-action="copy-formula" data-index="' + idx + '" title="Copy Formula"><svg class="ic"><use href="#i-files"/></svg></button>' +
          '<button class="ib" data-action="insert-formula" data-index="' + idx + '" title="Insert into Editor"><svg class="ic"><use href="#i-arrow"/></svg></button>' +
        '</div>' +
    '</div>' +
    '<div class="tree-formula">' + highlighted + '</div>';
}).join('');
```

**Step 2: Commit**

```bash
git add media/parsingGuideSidebar.js
git commit -m "feat(sidebar): add copy-calc action attribute to calc field rows"
```

---

### Task 2: Handle `copy-calc` in the click event delegation

**Files:**
- Modify: `media/parsingGuideSidebar.js:800–810`

**Step 1: Locate the handler**

Find this block (around line 800):

```js
} else if (action === 'copy-formula') {
    if (!data.calculations) { return; }
    const calc = data.calculations[idx];
    if (!calc) { return; }
    vscode.postMessage({ type: 'copyFormula', formula: calc.formula });
} else if (action === 'insert-formula') {
```

**Step 2: Add the new branch BEFORE `copy-formula`**

Insert a new `else if` branch so that clicking the row (not a button within it) triggers the copy-with-header behavior. The button guard ensures that clicking 📋 or → inside the row doesn't also fire `copy-calc`:

```js
} else if (action === 'copy-calc') {
    // Guard: ignore if the actual click target was inside a button
    // (the button has its own data-action and will be handled below)
    if (target.closest('button')) { return; }
    if (!data.calculations) { return; }
    const calc = data.calculations[idx];
    if (!calc) { return; }
    const rawCaption = calc.caption || 'Unnamed';
    const header = '// ' + rawCaption;
    vscode.postMessage({ type: 'copyFormula', formula: header + '\n' + (calc.formula || '') });
    setStatus('Copied \u201c' + rawCaption + '\u201d', 'success');
} else if (action === 'copy-formula') {
```

The full updated handler block (lines ~790–811):

```js
if (action === 'import-workbook') {
    if (!data.palettes) { return; }
    const palette = data.palettes[idx];
    if (!palette) { return; }
    const colors = normalizeColorList(palette.colors).filter(Boolean);
    vscode.postMessage({
        type: 'importWorkbookPalette',
        palette: { name: palette.name, type: palette.type, colors }
    });
    setStatus('Importing \u201c' + escapeHtml(palette.name) + '\u201d\u2026', 'info');
} else if (action === 'copy-calc') {
    if (target.closest('button')) { return; }
    if (!data.calculations) { return; }
    const calc = data.calculations[idx];
    if (!calc) { return; }
    const rawCaption = calc.caption || 'Unnamed';
    const header = '// ' + rawCaption;
    vscode.postMessage({ type: 'copyFormula', formula: header + '\n' + (calc.formula || '') });
    setStatus('Copied \u201c' + rawCaption + '\u201d', 'success');
} else if (action === 'copy-formula') {
    if (!data.calculations) { return; }
    const calc = data.calculations[idx];
    if (!calc) { return; }
    vscode.postMessage({ type: 'copyFormula', formula: calc.formula });
} else if (action === 'insert-formula') {
    if (!data.calculations) { return; }
    const calc = data.calculations[idx];
    if (!calc) { return; }
    vscode.postMessage({ type: 'insertFormula', formula: calc.formula });
}
```

**Step 3: Manual test in VS Code**

1. Press `F5` to launch the extension host (or use the Compile and Reload command)
2. Open a `.twb` or `.twbx` file
3. Open the Tableau LSP sidebar panel
4. Expand the **Workbook** section → **Calculated Fields**
5. Click a calc field row (not on the 📋 or → buttons)
6. Paste clipboard into any editor — should be:
   ```
   // {calc caption}
   {formula}
   ```
7. Verify the status bar shows `Copied "{caption}"`
8. Click the 📋 button — should still copy just the raw formula (no header)
9. Click the → button — should still insert just the raw formula into the active editor

**Step 4: Commit**

```bash
git add media/parsingGuideSidebar.js
git commit -m "feat(sidebar): click calc field row to copy formula with // header"
```
