# External Webview Script Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the ~1,600-line inline `<script>` block in the sidebar webview to an external JS file so VS Code's HTTP-level CSP allows it to execute.

**Architecture:** Extract the inline script from `getGuideHtml` into `src/webview/sidebarScript.js`. Pass the one dynamic value (`BUILD_STAMP`) via a tiny nonce-gated inline config object. Serve the external file via `webview.asWebviewUri()` and update the CSP to allow `webview.cspSource`.

**Tech Stack:** esbuild (existing bundler), plain JS (no TypeScript for webview script), VS Code Webview API.

---

## Background

VS Code 1.57+ enforces an HTTP-level CSP on `WebviewView` panels. `<meta>` CSP tags are ignored. All three `unsafe-inline` approaches tried have failed. The only supported approach for inline scripts is VS Code's own internal nonce (not accessible to extensions). External scripts from `webview.cspSource` are always allowed.

**Script location in current file:**
- `<script>` tag: `src/views/parsingGuideView.ts:1511`
- `</script>` tag: `src/views/parsingGuideView.ts:3132`
- JS content: lines 1512–3131
- One template substitution inside the script: `${BUILD_STAMP}` on line 1517

---

### Task 1: Extract Inline Script to External File

**Files:**
- Create: `src/webview/sidebarScript.js`

**Step 1: Extract the JS content**

Run this to capture the content:
```bash
sed -n '1512,3131p' src/views/parsingGuideView.ts > src/webview/sidebarScript.js
```

**Step 2: Fix the BUILD_STAMP substitution**

The extracted file will contain this line (originally line 1517):
```js
(function(){ var el = document.getElementById('wb-script-stamp'); if(el) el.textContent = '(${BUILD_STAMP})'; })();
```

`${BUILD_STAMP}` was a TypeScript template literal. In the external file it must read from a config object injected by the host page. Change it to:
```js
(function(){ var el = document.getElementById('wb-script-stamp'); if(el) el.textContent = '(' + ((window.__SIDEBAR_CONFIG__ && window.__SIDEBAR_CONFIG__.buildStamp) || '?') + ')'; })();
```

Use your editor to make this single-line change in `src/webview/sidebarScript.js`.

**Step 3: Verify the file exists and is not empty**

```bash
wc -l src/webview/sidebarScript.js
```
Expected: roughly 1620 lines.

**Step 4: Commit**

```bash
git add src/webview/sidebarScript.js
git commit -m "feat: extract webview sidebar script to external JS file"
```

---

### Task 2: Add Webview Build Step to package.json

**Files:**
- Modify: `package.json` (the `scripts` object, lines 486–518)

**Step 1: Add `build-webview` script**

In the `"scripts"` object, add a new entry after `"clean"`:
```json
"build-webview": "esbuild src/webview/sidebarScript.js --bundle=false --outdir=out/webview --platform=browser",
```

**Step 2: Update `build` script to also build the webview script**

Change:
```json
"build": "npm run build-base -- --sourcemap",
```
To:
```json
"build": "npm run build-base -- --sourcemap && npm run build-webview",
```

**Step 3: Update `vscode:prepublish` to minify the webview script**

Change:
```json
"vscode:prepublish": "npm run build-base -- --minify",
```
To:
```json
"vscode:prepublish": "npm run build-base -- --minify && npm run build-webview -- --minify",
```

**Step 4: Run the build to verify**

```bash
npm run build
```

Expected: exits 0. No errors. A new file `out/webview/sidebarScript.js` is created.

```bash
ls -lh out/webview/sidebarScript.js
```
Expected: file exists, ~50–80 KB.

**Step 5: Commit**

```bash
git add package.json
git commit -m "chore: add webview script build step to esbuild pipeline"
```

---

### Task 3: Update .vscodeignore

**Files:**
- Modify: `.vscodeignore`

**Step 1: Whitelist the webview output directory**

In `.vscodeignore`, find the `# Bundled extension entry points` section (currently line 17–19) and add the webview directory after it:

```
# Bundled extension entry points
!out/extension.js
!out/server.js

# Webview script
!out/webview/sidebarScript.js
```

**Step 2: Commit**

```bash
git add .vscodeignore
git commit -m "chore: include out/webview/sidebarScript.js in extension package"
```

---

### Task 4: Update getGuideHtml to Use External Script

**Files:**
- Modify: `src/views/parsingGuideView.ts:795–3135`

This task has five sub-changes to the `getGuideHtml` function. Make them in order.

**Step 1: Fix the function signature — rename `_context` to `context`**

At line 795, change:
```ts
function getGuideHtml(webview: vscode.Webview, _context: vscode.ExtensionContext, nonce: string): string {
    void webview;
```
To:
```ts
function getGuideHtml(webview: vscode.Webview, context: vscode.ExtensionContext, nonce: string): string {
```
(Remove the `void webview;` line entirely.)

**Step 2: Add scriptUri computation at the top of the function body**

Insert this after the opening `{` of `getGuideHtml` (after removing `void webview;`):
```ts
    const scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'out', 'webview', 'sidebarScript.js')
    );
```

**Step 3: Update the CSP meta tag**

At line 801, change:
```html
    <meta http-equiv="Content-Security-Policy" content="script-src 'unsafe-inline'; style-src 'unsafe-inline'; default-src *;">
```
To:
```html
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}';">
```

**Step 4: Replace the inline `<script>` block with a config script + external script tag**

The current block at lines 1511–3132 is:
```html
    <script>
        function tS(h){ ... }
        ...
        function escapeHtml(value) { ... }
    </script>
```

Replace the entire `<script>...</script>` block (lines 1511–3132) with these two lines:
```html
    <script nonce="${nonce}">window.__SIDEBAR_CONFIG__ = { buildStamp: "${BUILD_STAMP}" };</script>
    <script src="${scriptUri}"></script>
```

**Step 5: Verify TypeScript compiles cleanly**

```bash
npm run typecheck
```
Expected: No errors. If there are "unused parameter" errors on `nonce` or `context`, confirm they are used in the new CSP/config lines.

**Step 6: Build**

```bash
npm run build
```
Expected: exits 0.

**Step 7: Commit**

```bash
git add src/views/parsingGuideView.ts
git commit -m "fix(webview): load sidebar script as external file via webview.asWebviewUri"
```

---

### Task 5: Verify the Fix in the Extension Development Host

**Step 1: Open the Extension Development Host**

Press `F5` in VS Code (or run "Run Extension" from the Run panel). The Extension Development Host window opens.

**Step 2: Open the sidebar**

In the Extension Development Host, click the Tableau LSP icon in the Activity Bar to open the sidebar panel.

**Step 3: Confirm the script stamp**

Look for a small text element in the header area. It should now read `(v6-2026-02-24)` instead of `(js not loaded)`.

**Step 4: Open DevTools and check for errors**

In the Extension Development Host, run `Developer: Open Webview Developer Tools` from the Command Palette. Check the Console tab. There should be no CSP errors and no script errors.

**Step 5: Test a basic interaction**

Click any collapsible section header in the sidebar. It should expand/collapse (proving the JS toggle functions work).

---

## Summary of All Files Changed

| File | Change |
|---|---|
| `src/webview/sidebarScript.js` | **Create** — extracted JS, with `BUILD_STAMP` read from `window.__SIDEBAR_CONFIG__` |
| `src/views/parsingGuideView.ts` | **Modify** — update `getGuideHtml`: rename param, add `scriptUri`, update CSP, swap inline script for external |
| `package.json` | **Modify** — add `build-webview` script; update `build` and `vscode:prepublish` |
| `.vscodeignore` | **Modify** — whitelist `out/webview/sidebarScript.js` |

## Key Decisions

- **Plain JS, not TypeScript**: The webview script runs in the browser sandbox; using plain `.js` avoids a separate TypeScript compilation target and tsconfig complexity.
- **`--bundle=false` for esbuild**: The webview script has no imports; bundling is unnecessary. This keeps the output identical to input (modulo whitespace with `--minify`).
- **Nonce for config script only**: One tiny `<script nonce="...">` to pass `buildStamp`. The main external script needs no nonce — `webview.cspSource` covers it.
