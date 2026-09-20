# Develop and reload the extension

Use Node.js 20 or newer and VS Code. In the source checkout, run `npm ci`, then open the repository folder in VS Code.

Press F5 with **Run Extension (synthetic demo)** selected. The tracked launch configuration uses the current VS Code executable on Windows, macOS, or Linux. It builds both extension and language server, copies the synthetic `examples` into `.vscode-dev/examples`, and opens that copy with a separate user-data profile and extensions directory. Your normal VS Code profile and private workbooks are not used.

The copy preserves edits between debug sessions. Stop the development host, then delete `.vscode-dev` to reset the demo and its isolated profile. These generated files are ignored by Git.

## Change, build, and reload

Choose **Watch Extension (synthetic demo)** to rebuild both entry points whenever their source changes. Source maps are enabled for both processes. After a successful build, run **Developer: Reload Window** in the development host or restart debugging from the source window.

The development-only **Tableau LSP: Compile and Reload** command also works inside the demo. It runs the shared `esbuild.mjs` script from the extension's source directory, waits for a successful build, then reloads that development window. It does not require a build task in the demo workspace. Node.js must be available on PATH. A build failure leaves the current window running and displays the error.

From a terminal in the checkout:

```sh
npm run build       # extension + server with source maps
npm run watch       # continuously rebuild both
npm run typecheck   # TypeScript validation without overwriting bundles
```

The `auto-reload.sh` and `auto-reload.cmd` helpers run the same build and print reload instructions. Production packaging uses the shared build with minification and excludes source maps from the VSIX. `npm run compile` is retained for older test scripts; prefer `build` for extension development because `compile` emits unbundled TypeScript output.

## Verify the installed package

```sh
npm run test:workbook-host
npm run package -- --out tableau-language-support.vsix
npm run test:vsix -- tableau-language-support.vsix
```

Host tests use disposable synthetic workbooks and fresh profiles beneath `.vscode-test`. On Linux without a display, prefix each host command with `xvfb-run -a`. Set `VSCODE_EXECUTABLE_PATH` to use an existing installation or `VSCODE_VERSION` to select a downloadable version; otherwise the runner uses stable VS Code.

The VSIX smoke runner installs the supplied package into a fresh extensions directory. An empty test harness starts the host, and assertions confirm the Tableau extension loads from the installed package at the expected version before exercising workbook edits, backups, and copy preservation. Reports are written to `test-results`.

CI runs type checking, deterministic tests, unit tests, and workbook host tests on Linux, Windows, and macOS. Only then does it package and test the installed VSIX. Publishing calls that same reusable workflow, downloads its tested bytes, and validates their checksum, commit, version, and matching release tag. Release provenance requires a clean checkout. A failed or throttled publish is not automatically rerun. Public version checks use bounded backoff for stale successful responses and stop immediately on HTTP 429, reporting Retry-After when provided.
