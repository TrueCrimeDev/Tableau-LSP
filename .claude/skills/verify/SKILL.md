---
name: verify
description: Build, launch and drive this VS Code extension in a real headless extension host (WSL) to observe a change actually running.
---

# Verifying Tableau LSP changes at runtime

The surface is a **VS Code extension host**, not a terminal. `npm run test:unit`
proves nothing about the extension running — it uses `src/tests/__mocks__/vscode.js`,
a hand-written stub. Drive the real thing.

## Build

```bash
npm run build        # esbuild -> out/extension.js and out/server.js; package.json main is ./out/extension
```

`main` points at the **bundle**, so a source edit is invisible until you rebuild.
Rebuild between every scenario when comparing before/after.

## Launch a real extension host (headless)

`@vscode/test-electron` is already a dependency. It downloads VS Code to
`.vscode-test/` (~320 MB, first run only) and runs a module of your choosing
*inside* the host with the full `vscode` API.

**Two WSL gotchas, both required:**

1. **Missing native libs.** The downloaded `code` binary fails with
   `libnspr4.so: cannot open shared object file`. No sudo needed:
   ```bash
   apt-get download libnspr4 libnss3        # run with the Bash sandbox DISABLED (network)
   dpkg -x <each>.deb extract/
   export LD_LIBRARY_PATH="$PWD/extract/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH"
   ```
   Only these two packages are needed — they supply all four missing libs
   (`libnspr4`, `libnss3`, `libnssutil3`, `libsmime3`). Same fix as the
   Playwright/chromium one in this environment.

2. **Run under xvfb** and require `@vscode/test-electron` by absolute path if
   your launcher lives outside the repo (Node resolves from the file's dir,
   not cwd):
   ```bash
   REPO_DIR="$(wslpath "$(git rev-parse --show-toplevel)")" xvfb-run -a node /path/to/launch.js
   ```

Launcher shape:

```js
const REPO = process.env.REPO_DIR; // WSL path to this repository
const { runTests } = require(REPO + '/node_modules/@vscode/test-electron');
runTests({
    extensionDevelopmentPath: REPO,
    extensionTestsPath: '/abs/path/to/driver.js',   // exports async run()
    launchArgs: [FIXTURE_DIR, '--disable-extensions', '--disable-gpu', '--no-sandbox'],
    extensionTestsEnv: { MY_FIXTURE: FIXTURE_DIR },
});
```

In `driver.js`, activate explicitly before touching anything:

```js
await vscode.extensions.getExtension('TrueCrimeAudit.tableau-language-support').activate();
```

## Driving the @tableau chat features without Copilot

The chat participant itself needs a language model (Copilot auth), but the
**language model tools are the same surface Copilot agent mode uses** and are
invokable directly — no model, no auth:

```js
const result = await vscode.lm.invokeTool('tableau_listFields', {
    input: {}, toolInvocationToken: undefined,
});
const text = result.content.map(p => p.value).join('\n');
```

`tableau_listFields` runs the full real path — workbook resolution, file read,
XML parse, inventory formatting — and its output names the workbook it chose
(`# Field inventory — A.twb`). That makes it the cheapest observable probe for
anything touching `src/chat/activeWorkbook.ts` resolution.

`tableau_addCalculation` renders a Continue/Cancel card via `prepareInvocation`,
so it needs UI interaction — prefer `tableau_listFields` for read-path checks
and treat the write path as destructive (it mutates a real `.twb`; give it a
throwaway fixture).

## Useful fixture shape

Distinct field names per workbook make the resolver's choice unambiguous in
the output:

```
fixture/proj-a/A.twb      datasource 'Alpha', column [AlphaOnlyField]
fixture/proj-a/calc.twbl
fixture/proj-b/B.twb      datasource 'Beta',  column [BetaOnlyField]
fixture/proj-b/calc.twbl
```

Open files with `openTextDocument` + `showTextDocument({preview:false})`, reset
between scenarios with `workbench.action.closeAllEditors`, and sleep ~300 ms
after each — tab state settles asynchronously and
`vscode.window.tabGroups` reads stale otherwise.

## Proving a change is load-bearing

Run the driver, then restore the pre-change logic, `npm run build`, run again.
Identical results mean the change did nothing observable. Back up the source
file with `cp` — **do not use `git stash`** in this repo (NTFS/WSL loose-object
corruption risk).
