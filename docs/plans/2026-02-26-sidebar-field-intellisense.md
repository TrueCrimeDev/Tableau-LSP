# Sidebar Fix + Field Definition IntelliSense Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the sidebar script-not-loading issue (stale build) and add a one-click "Generate Field Definitions" feature that populates a workbook-specific `.fields.d.twbl` file and instantly activates IntelliSense completions for field names.

**Architecture:** Commit all uncommitted work to fix the stale `out/extension.js`. Add a `loadAdditionalFile()` method to `FieldParser` that merges fields from a second file into the existing map. Wire a sidebar button → extension command → LSP notification → server load, clearing caches for immediate IntelliSense.

**Tech Stack:** TypeScript + Node.js, VS Code WebviewView API, vscode-languageserver, esbuild (bundler), jest + ts-jest (tests).

---

## Background Context

### How the codebase is structured (read before starting)

- `src/views/parsingGuideView.ts` — VS Code extension WebviewView provider. The TypeScript side. Handles messages from the webview and posts data back. Built by esbuild into `out/extension.js`.
- `media/parsingGuideSidebar.js` — The sidebar UI. Plain JS (NOT TypeScript). Loaded in the webview via `webview.asWebviewUri()`. NOT bundled by esbuild — served directly from the `media/` directory.
- `src/fieldParser.ts` — Parses `[FieldName] = Type` definitions from `.fields.d.twbl` files. Used by the LSP server for completions and hover.
- `src/server.ts` — The Language Server Protocol server. Runs as a separate Node.js process. Communicates with VS Code via the LSP protocol. Built by esbuild into `out/server.js`.
- `src/extension.ts` — Extension activation. Starts the LSP client. Registers commands. Built into `out/extension.js`.
- `syntaxes/fields.d.twbl` — The built-in field definition file. Manually maintained. The LSP server loads this on startup.

### Why the sidebar script is not loading

`parsingGuideView.ts` was modified (working tree has external script approach) but `out/extension.js` was built from the old version that still embedded the script inline. VS Code's HTTP-level CSP blocks inline scripts in WebviewView panels, so nothing shows.

**Fix:** Commit all modified/untracked files. The build pipeline (esbuild) will include the updated code on next `npm run build`.

### How field completions work

1. `FieldParser.findDefinitionFile(__dirname)` finds `{ext-root}/syntaxes/fields.d.twbl`
2. `FieldParser` reads it and builds a `fieldMap: Map<string, CustomField>`
3. `completionProvider.ts` calls `fieldParser.getField()` / `fieldParser.getAllFields()` to populate `[FieldName]` completions in `.twbl` files
4. The server watches `fields.d.twbl` for changes and calls `fieldParser.refresh()` to hot-reload

### Notification protocol (new in this plan)

Extension sends `tableauLSP/loadFieldDefinitions` notification to server with `{ path: string }`. Server loads the specified file into `fieldParser` using the new `loadAdditionalFile()` method. Both `CompletionPerformanceAPI.clearCache()` and `HoverPerformanceAPI.clearCaches()` are called (same as hot-reload).

---

## Task 1: Commit All Existing Modified and Untracked Files

**Goal:** Fix the stale build. All the work-in-progress (new parsers, types, sidebar JS, modified views) needs to be committed so the next `npm run build` picks it all up.

**Files:**
- Modify (commit): All files shown in `git status` as `M` or `??`

**Step 1: Stage and commit all modified tracked files**

```bash
git add src/views/parsingGuideView.ts src/preferences/preferencesFile.ts src/extension.ts src/signatureProvider.ts src/extract/zip.ts src/extract/zip.test.ts src/types-shim.d.ts .vscodeignore package.json package-lock.json config/Preferences.tps
git commit -m "refactor: wip changes — workbook inspector and preferences updates"
```

**Step 2: Stage and commit new untracked source files**

```bash
git add src/parsers/twbParser.ts src/types/workbook.ts
git commit -m "feat: add TWBParser and workbook types"
```

**Step 3: Stage and commit the media script**

```bash
git add media/parsingGuideSidebar.js
git commit -m "feat: add external sidebar webview script"
```

**Step 4: Stage and commit test config files**

```bash
git add src/tests/edge/jest.edge.config.js src/tests/integration/jest.integration.config.js src/tests/performance/jest.performance.config.js
git commit -m "chore: update jest configs"
```

**Step 5: Verify git status is clean (only unneeded files remain untracked)**

```bash
git status
```
Expected: No `M` files. Untracked files should only be VS Code cache files (`.vscode/vscode-devdata/`), test result files, and Tableau workbook files (`.twb`, `.twbx`, `.twbl`).

---

## Task 2: Add `loadAdditionalFile()` to FieldParser (TDD)

**Goal:** FieldParser can load a second definition file, merging its fields into the existing map. Fields in the new file overwrite existing ones with the same name (case-insensitive).

**Files:**
- Modify: `src/fieldParser.ts`
- Test: `src/tests/unit/fieldParser.test.ts`

**Step 1: Write the failing test**

Open `src/tests/unit/fieldParser.test.ts`. The file uses `jest.mock('fs')` at the top. Add this test inside the existing `describe('FieldParser', ...)` block, after the existing tests:

```ts
describe('loadAdditionalFile', () => {
    it('merges fields from a second file into the existing map', () => {
        // First call (constructor): returns the base fixture
        mockFs.readFileSync
            .mockReturnValueOnce(FIELD_DEFINITION_FIXTURE)         // constructor
            .mockReturnValueOnce('[Revenue] = Number\n[Channel] = String'); // loadAdditionalFile

        const parser = new FieldParser('test://fields.d.twbl');
        parser.loadAdditionalFile('test://extra.fields.d.twbl');

        // Original fields still present
        expect(parser.getField('Sales')?.type).toBe('Number');
        // New fields added
        expect(parser.getField('Revenue')?.type).toBe('Number');
        expect(parser.getField('Channel')?.type).toBe('String');
    });

    it('overwrites an existing field when names collide (case-insensitive)', () => {
        mockFs.readFileSync
            .mockReturnValueOnce('[Sales] = Number')         // constructor
            .mockReturnValueOnce('[SALES] = String');        // loadAdditionalFile — overwrite

        const parser = new FieldParser('test://fields.d.twbl');
        parser.loadAdditionalFile('test://extra.fields.d.twbl');

        expect(parser.getField('Sales')?.type).toBe('String');
    });

    it('silently ignores a missing file', () => {
        mockFs.readFileSync
            .mockReturnValueOnce(FIELD_DEFINITION_FIXTURE)   // constructor
            .mockImplementationOnce(() => { throw new Error('ENOENT'); }); // missing file

        const parser = new FieldParser('test://fields.d.twbl');
        expect(() => parser.loadAdditionalFile('test://missing.fields.d.twbl')).not.toThrow();
        // Original fields still intact
        expect(parser.getField('Sales')?.type).toBe('Number');
    });
});
```

**Step 2: Run test to verify it fails**

```bash
npx jest src/tests/unit/fieldParser.test.ts --no-coverage
```
Expected: FAIL — "parser.loadAdditionalFile is not a function"

**Step 3: Implement `loadAdditionalFile()` in `src/fieldParser.ts`**

After the `refresh()` method (line 30), add:

```ts
/**
 * Load additional field definitions from a second file, merging into the existing map.
 * Fields in the additional file overwrite existing entries with the same name.
 * Silently ignores missing or unreadable files.
 */
public loadAdditionalFile(filePath: string): void {
    try {
        const content = readFileSync(filePath, 'utf-8');
        this.parseFields(content);
    } catch {
        // File not found or unreadable — not an error
    }
}
```

**Step 4: Run test to verify it passes**

```bash
npx jest src/tests/unit/fieldParser.test.ts --no-coverage
```
Expected: PASS — all tests pass including the new `loadAdditionalFile` tests.

**Step 5: Run the full unit test suite to check for regressions**

```bash
npm run test:unit
```
Expected: All existing tests pass.

**Step 6: Commit**

```bash
git add src/fieldParser.ts src/tests/unit/fieldParser.test.ts
git commit -m "feat(fieldParser): add loadAdditionalFile for merging workbook field definitions"
```

---

## Task 3: Add `tableauLSP/loadFieldDefinitions` Notification Handler to Server

**Goal:** The LSP server receives a notification with a file path, loads it into the FieldParser, and clears caches for immediate IntelliSense refresh.

**Files:**
- Modify: `src/server.ts`

**Background:** The server currently uses `require()` inside a try-catch block (at the top, after the `fieldParser` setup) to dynamically load `CompletionPerformanceAPI` and `HoverPerformanceAPI` for hot-reload. We follow the same pattern for consistency.

**Step 1: Find the right insertion point in `src/server.ts`**

Open `src/server.ts`. Find the block that starts around line 47:
```ts
// Optional: watch the field definition file for hot-reload
try {
    const fs = require('fs');
    ...
} catch (e) {
    console.warn('[Server] Field definition hot-reload disabled:', e);
}
```

The notification handler goes AFTER this block (after line ~72).

**Step 2: Add the notification handler**

After the hot-reload block, add:

```ts
// Handle 'tableauLSP/loadFieldDefinitions' notification from extension when
// a workbook-specific *.fields.d.twbl file is generated.
connection.onNotification('tableauLSP/loadFieldDefinitions', (params: { path: string }) => {
    if (!params?.path || !fieldParser) {
        return;
    }
    try {
        const { CompletionPerformanceAPI } = require('./completionProvider');
        const { HoverPerformanceAPI } = require('./hoverProvider');
        fieldParser.loadAdditionalFile(params.path);
        CompletionPerformanceAPI.clearCache();
        HoverPerformanceAPI.clearCaches();
        connection.console.log(`[Server] Loaded additional field definitions from ${params.path}`);
    } catch (e) {
        connection.console.error(`[Server] Failed to load field definitions: ${e}`);
    }
});
```

**Step 3: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```
Expected: No errors.

**Step 4: Commit**

```bash
git add src/server.ts
git commit -m "feat(server): handle tableauLSP/loadFieldDefinitions notification"
```

---

## Task 4: Register `tableau-language-support.loadFieldDefinitions` Command in extension.ts

**Goal:** Bridge between the sidebar extension and the LSP server. When invoked with a file path, sends the `tableauLSP/loadFieldDefinitions` notification to the server.

**Files:**
- Modify: `src/extension.ts`

**Background:** `client` is a module-level `let` variable in `extension.ts`. It's set during `activate()` before `registerAdditionalComponents()` is called. The command handler closes over `client` — if `client` is undefined (e.g., language server failed to start), the command does nothing gracefully.

**Step 1: Find the insertion point in `src/extension.ts`**

Open `src/extension.ts`. Find `registerAdditionalComponents()`. It currently ends with:
```ts
context.subscriptions.push(insertSnippetCommand, slashCommandDisposable);
```
(around line 139)

**Step 2: Add the command registration after the existing subscriptions push**

```ts
// Bridge: sidebar generates a *.fields.d.twbl and uses this command to notify the LSP server.
const loadFieldDefsCommand = commands.registerCommand(
    'tableau-language-support.loadFieldDefinitions',
    (filePath: string) => {
        client?.sendNotification('tableauLSP/loadFieldDefinitions', { path: filePath });
    }
);
context.subscriptions.push(loadFieldDefsCommand);
```

**Step 3: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```
Expected: No errors.

**Step 4: Commit**

```bash
git add src/extension.ts
git commit -m "feat(extension): register loadFieldDefinitions command for LSP bridge"
```

---

## Task 5: Add `extractFieldDefinitionsToFile()` to parsingGuideView.ts

**Goal:** Handle the `generateFieldDefinitions` webview message. Extract all fields and calculated fields from the current workbook XML. Write a `{workbook-name}.fields.d.twbl` file next to the workbook. Fire the LSP bridge command.

**Files:**
- Modify: `src/views/parsingGuideView.ts`

**Background:** Look at the existing `extractCalculationsToFile()` method (around line 698) as the direct model. It:
1. Guards on `this.view` existing
2. Gets the active editor URI
3. Validates it's a `.twb` or `.twbx`
4. Does the extraction
5. Posts a result message back to the webviewWe follow the exact same pattern.

**Tableau → LSP type mapping** (defined as a local function):
- `string` → `String`
- `integer` / `real` → `Number`
- `date` → `Date`
- `datetime` → `DateTime`
- `boolean` → `Boolean`
- anything else → `String`

**Step 1: Add the message handler to the switch statement**

In `resolveWebviewView()`, find the switch statement that handles webview messages (around line 60). Add a new case after `'extractCalculations'`:

```ts
case 'generateFieldDefinitions':
    void this.extractFieldDefinitionsToFile();
    break;
```

**Step 2: Add the `extractFieldDefinitionsToFile()` private method**

Add this method to the `ParsingGuideViewProvider` class, after `extractCalculationsToFile()`:

```ts
private async extractFieldDefinitionsToFile(): Promise<void> {
    if (!this.view) {
        return;
    }

    // Resolve the current workbook URI (same fallback chain as postWorkbookData)
    let uri: vscode.Uri | undefined;
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        const p = activeEditor.document.uri.path.toLowerCase();
        if (p.endsWith('.twb') || p.endsWith('.twbx')) {
            uri = activeEditor.document.uri;
        }
    }
    if (!uri && this.lastWorkbookUri) {
        uri = this.lastWorkbookUri;
    }

    if (!uri) {
        await this.postStatus('No active workbook file. Open a .twb or .twbx file first.', 'error');
        return;
    }

    const lowerPath = uri.path.toLowerCase();
    if (!lowerPath.endsWith('.twb') && !lowerPath.endsWith('.twbx')) {
        await this.postStatus('Active file is not a Tableau workbook (.twb or .twbx).', 'error');
        return;
    }

    try {
        // Read the workbook XML (same approach as postWorkbookData)
        let xml: string;
        if (lowerPath.endsWith('.twbx')) {
            const data = await vscode.workspace.fs.readFile(uri);
            const zip = await (await import('jszip')).default.loadAsync(Buffer.from(data));
            const twbEntry = Object.entries(zip.files).find(
                ([p]) => !zip.files[p].dir && p.toLowerCase().endsWith('.twb')
            );
            if (!twbEntry) {
                throw new Error('No .twb file found in the .twbx archive');
            }
            xml = await twbEntry[1].async('string');
        } else {
            const openDoc = vscode.workspace.textDocuments.find(
                d => d.uri.toString() === uri!.toString()
            );
            xml = openDoc ? openDoc.getText()
                : new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(uri));
        }

        const fileName = basename(uri.fsPath);
        const cleaned = cleanXmlContent(xml);
        const resolved = resolveNames(cleaned);
        const fields = extractFieldsFromXml(resolved, fileName);
        const calcs = extractCalcsFromXml(resolved, fileName);

        // Generate file content
        const workbookName = fileName.replace(/\.(twb|twbx)$/i, '');
        const lines: string[] = [
            `/**`,
            ` * Auto-generated field definitions from ${fileName}`,
            ` * Generated: ${new Date().toISOString().slice(0, 10)}`,
            ` * Regenerate from the Tableau LSP sidebar — do not edit manually.`,
            ` */`,
            ''
        ];

        const mapType = (datatype: string): string => {
            const t = (datatype || '').toLowerCase();
            if (t === 'integer' || t === 'real') { return 'Number'; }
            if (t === 'date') { return 'Date'; }
            if (t === 'datetime') { return 'DateTime'; }
            if (t === 'boolean') { return 'Boolean'; }
            return 'String';
        };

        // Group by datasource
        const fieldsByDs = new Map<string, typeof fields>();
        for (const f of fields) {
            const ds = f.datasource || 'Unknown';
            if (!fieldsByDs.has(ds)) { fieldsByDs.set(ds, []); }
            fieldsByDs.get(ds)!.push(f);
        }
        for (const [ds, dsFields] of fieldsByDs) {
            lines.push(`// === FIELDS (${ds}) ===`, '');
            const sorted = [...dsFields].sort((a, b) =>
                (a.caption ?? a.name).localeCompare(b.caption ?? b.name)
            );
            for (const f of sorted) {
                const displayName = f.caption ?? f.name;
                const role = f.role ? ` - ${f.role}` : '';
                lines.push(`/**`, ` * ${displayName}${role} (${ds})`, ` */`);
                lines.push(`[${displayName}] = ${mapType(f.datatype ?? '')}`, '');
            }
        }

        const calcsByDs = new Map<string, typeof calcs>();
        for (const c of calcs) {
            const ds = c.datasource || 'Unknown';
            if (!calcsByDs.has(ds)) { calcsByDs.set(ds, []); }
            calcsByDs.get(ds)!.push(c);
        }
        for (const [ds, dsCalcs] of calcsByDs) {
            lines.push(`// === CALCULATED FIELDS (${ds}) ===`, '');
            const sorted = [...dsCalcs].sort((a, b) => a.title.localeCompare(b.title));
            for (const c of sorted) {
                lines.push(`/**`, ` * ${c.title} (${ds})`, ` */`);
                lines.push(`[${c.title}] = String`, '');
            }
        }

        const outputPath = join(dirname(uri.fsPath), `${workbookName}.fields.d.twbl`);
        await vscode.workspace.fs.writeFile(
            vscode.Uri.file(outputPath),
            new TextEncoder().encode(lines.join('\n'))
        );

        const totalCount = fields.length + calcs.length;
        await this.view.webview.postMessage({
            type: 'fieldDefsGenerated',
            count: totalCount,
            path: outputPath
        });

        // Notify the LSP server to load the new definitions immediately
        await vscode.commands.executeCommand(
            'tableau-language-support.loadFieldDefinitions',
            outputPath
        );
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        await this.postStatus(`Failed to generate field definitions: ${message}`, 'error');
    }
}
```

**Step 3: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```
Expected: No errors.

**Step 4: Commit**

```bash
git add src/views/parsingGuideView.ts
git commit -m "feat(sidebar): add extractFieldDefinitionsToFile for workbook IntelliSense"
```

---

## Task 6: Add "Generate Field Definitions" Button to Sidebar JS

**Goal:** Add the UI button to the workbook inspector section header in `media/parsingGuideSidebar.js`. Handle the `fieldDefsGenerated` response with brief success feedback.

**Files:**
- Modify: `media/parsingGuideSidebar.js`

**Background:** The sidebar JS is plain JS (no TypeScript). It's served directly from `media/` and NOT processed by esbuild. The button follows the exact pattern of the existing `extract-calcs-header-btn` — same class (`.ib`), same icon approach (inline `<svg><use href="#i-field"/></svg>`), same placement in the `.ha` div. `#i-field` is already defined in the HTML SVG sprite.

**Step 1: Find the workbook header HTML in `media/parsingGuideSidebar.js`**

Search for `extract-calcs-header-btn`. You'll find it in the HTML that gets embedded into the webview (in `parsingGuideView.ts`, not the sidebar JS). Instead, look in the sidebar JS for the code that references `extract-calcs-header-btn` to add a click handler. Search for it:

```
grep -n "extract-calcs-header-btn" media/parsingGuideSidebar.js
```

You'll find where the existing button's click handler is set up. The "Generate Field Defs" button handler goes RIGHT AFTER the extract-calcs handler.

**Step 2: Add the new button to the HTML template in `src/views/parsingGuideView.ts`**

The workbook section header HTML is in `parsingGuideView.ts` around lines 1291–1298:
```html
<div class="sh" id="workbook-sh">
  <span class="cv">...</span>
  Workbook <span id="wb-script-stamp" ...>(js not loaded)</span>
  <div class="ha">
    <button class="ib" id="extract-calcs-header-btn" title="Extract Calculations"><svg class="ic"><use href="#i-export"/></svg></button>
    <button class="ib" id="parse-workbook-btn" title="Refresh"><svg class="ic"><use href="#i-refresh"/></svg></button>
  </div>
</div>
```

Add the new button BEFORE the extract-calcs button:
```html
<button class="ib" id="gen-field-defs-btn" title="Generate Field Definitions"><svg class="ic"><use href="#i-field"/></svg></button>
```

So the full `.ha` block becomes:
```html
<div class="ha">
    <button class="ib" id="gen-field-defs-btn" title="Generate Field Definitions"><svg class="ic"><use href="#i-field"/></svg></button>
    <button class="ib" id="extract-calcs-header-btn" title="Extract Calculations"><svg class="ic"><use href="#i-export"/></svg></button>
    <button class="ib" id="parse-workbook-btn" title="Refresh"><svg class="ic"><use href="#i-refresh"/></svg></button>
</div>
```

**Step 3: Wire the click handler in `media/parsingGuideSidebar.js`**

In `media/parsingGuideSidebar.js`, find where `extract-calcs-header-btn` click handler is set up. It looks similar to:

```js
const extractCalcsHeaderBtn = document.getElementById('extract-calcs-header-btn');
if (extractCalcsHeaderBtn) {
    extractCalcsHeaderBtn.addEventListener('click', function() {
        vscode.postMessage({ type: 'extractCalculations' });
    });
}
```

RIGHT AFTER that block, add:

```js
const genFieldDefsBtn = document.getElementById('gen-field-defs-btn');
if (genFieldDefsBtn) {
    genFieldDefsBtn.addEventListener('click', function() {
        vscode.postMessage({ type: 'generateFieldDefinitions' });
    });
}
```

**Step 4: Handle the `fieldDefsGenerated` response in the message handler**

In `media/parsingGuideSidebar.js`, find the `window.addEventListener('message', ...)` block. Near the `extractResult` handler (which shows "Extracted N calculations"), add handling for `fieldDefsGenerated`:

```js
if (message.type === 'fieldDefsGenerated') {
    const btn = document.getElementById('gen-field-defs-btn');
    if (btn) {
        const count = typeof message.count === 'number' ? message.count : 0;
        const origHTML = btn.innerHTML;
        btn.innerHTML = '<svg class="ic"><use href="#i-check-c"/></svg>';
        btn.title = 'Generated ' + count + ' definition' + (count !== 1 ? 's' : '');
        setTimeout(function() {
            btn.innerHTML = origHTML;
            btn.title = 'Generate Field Definitions';
        }, 2500);
    }
}
```

**Step 5: Verify TypeScript compiles cleanly (catches the HTML change in parsingGuideView.ts)**

```bash
npx tsc --noEmit
```
Expected: No errors.

**Step 6: Commit**

```bash
git add media/parsingGuideSidebar.js src/views/parsingGuideView.ts
git commit -m "feat(sidebar): add Generate Field Definitions button to workbook inspector"
```

---

## Task 7: Build and Manual Verification

**Goal:** Confirm the complete feature works end-to-end in the Extension Development Host.

**Step 1: Build the extension**

From **Windows PowerShell or VS Code terminal** (not WSL — esbuild binary is Windows-native):

```bash
npm run build
```
Expected: Exits 0. Creates `out/extension.js` and `out/server.js`.

**Step 2: Launch the Extension Development Host**

Press `F5` in VS Code (or use Run > Start Debugging > "Run Extension (VS Code)").

**Step 3: Verify sidebar script loads**

In the Extension Development Host, click the Tableau LSP icon in the Activity Bar. Look at the workbook inspector section header — it should now show `(v6-2026-02-24)` instead of `(js not loaded)`.

If it still shows `(js not loaded)`, open the Webview DevTools (`Developer: Open Webview Developer Tools` from Command Palette) and check the Console tab for errors.

**Step 4: Open a `.twb` file and verify the workbook inspector populates**

Open `Test.twb` (in the project root) in the Extension Development Host. The workbook inspector should show:
- Datasources count
- Calculated Fields count
- Fields count

**Step 5: Test the Generate Field Definitions button**

In the sidebar, hover over the Workbook section header — three buttons should appear. Click the leftmost button (field icon, "Generate Field Definitions"). After 1–2 seconds:
- A `Test.fields.d.twbl` file should appear in the project root (same directory as `Test.twb`)
- The button icon should briefly change to a checkmark

**Step 6: Verify the generated file format**

Open the generated `Test.fields.d.twbl`. It should contain entries like:
```
[Firstname] = String
[Lastname] = String
[Age] = String
[!Age] = String
```

**Step 7: Verify IntelliSense picks up the generated fields**

Open (or create) a `.twbl` file. Type `[`. The autocomplete dropdown should include the field names from the generated file (e.g., `Firstname`, `Age`, `!Age`).

If completions don't appear immediately, type a few characters of a field name. If they still don't appear, check the extension output channel `Tableau Language Support` for any `[Server]` log messages about field loading.

---

## Summary of All Files Changed

| File | Type of change |
|---|---|
| `src/fieldParser.ts` | Add `loadAdditionalFile(filePath)` public method |
| `src/tests/unit/fieldParser.test.ts` | Add 3 tests for `loadAdditionalFile` |
| `src/server.ts` | Add `connection.onNotification('tableauLSP/loadFieldDefinitions', ...)` handler |
| `src/extension.ts` | Register `tableau-language-support.loadFieldDefinitions` command |
| `src/views/parsingGuideView.ts` | Add `generateFieldDefinitions` case + `extractFieldDefinitionsToFile()` method + button HTML |
| `media/parsingGuideSidebar.js` | Add click handler + `fieldDefsGenerated` response handler |
| Many existing files | Committed in Task 1 (fix stale build) |
