# Tableau LSP - Auto Reload Debugger Workflow

This project now mirrors the Toolbox extension's fast reload experience so you can iterate on the language server without poking at the debugger manually. Everything runs against the `Tableau-LSP.code-workspace` file, which guarantees that every launched Extension Host window opens the same workspace + folder layout as the repo you have open now.

## Reload entry points

- **Restart the running debugger** - press `Ctrl+Shift+F5` to restart the existing `Run Extension (VS Code)` session after a build.
- **Reload the Extension Host window** - `Ctrl+R` inside the debug window if you just need a window reload.
- **Run the VS Code task** - `Tasks: Run Task` -> `Compile and Reload Debugger` executes the helper script (`auto-reload.sh` / `.cmd`).
- **Use the command palette helper** - `Tableau LSP: Compile and Reload`. It compiles, waits for completion, and restarts (or launches) the debugger for you.
- **Kick it off from the CLI** - run `./auto-reload.sh` (macOS/Linux) or `auto-reload.cmd` (Windows) to build from a shell and follow the prompts.

All of these workflows assume that either a one-shot compile just finished or `npm run watch` is running so the extension host restart can pick up the already-emitted JavaScript from `out/`.

## Compile and reload command

The command contribution `tableau-language-support.compileAndReload` is wired up in `src/extension.ts`. Trigger it from the Command Palette or wire it to a keybinding:

1. It locates the `npm: compile` task (defined in `.vscode/tasks.json`) and runs it through the VS Code task service.
2. The command waits for the task to exit successfully before touching the debugger, so you never reload stale bits.
3. If a debug session is active it invokes `workbench.action.debug.restart`; otherwise it launches the `Run Extension (VS Code)` configuration so the new Extension Host opens the `Tableau-LSP.code-workspace` window automatically.
4. Failures bubble up as a notification so you can inspect the compile errors without guessing which step failed.

## Tasks & npm scripts

- `.vscode/tasks.json` now includes `npm: compile` plus a `Compile and Reload Debugger` task that invokes the helper scripts.
- `package.json` already exposes `npm run compile` and `npm run watch`. Keep `npm run watch` running while you iterate; it continuously rebuilds `out/` so your reload triggers are effectively instant.
- You can set `npm: compile` as the default build task (`Tasks: Configure Default Build Task`) if you prefer running it via `Ctrl+Shift+B`.

## CLI helpers

| File | When to use |
| --- | --- |
| `auto-reload.sh` | macOS/Linux contributors running inside a shell or terminal multiplexer |
| `auto-reload.cmd` | Windows contributors working from Command Prompt/PowerShell |

Both scripts simply `npm run compile`, then remind you to run the `Tableau LSP: Compile and Reload` command or press `Ctrl+Shift+F5` in VS Code.

## Recommended workflow

1. Start `npm run watch` in a dedicated terminal to keep TypeScript output fresh.
2. Launch the debugger once via `F5` (`Run Extension (VS Code)`).
3. After each change either hit `Ctrl+Shift+F5` *or* run the `Tableau LSP: Compile and Reload` command to rebuild + restart in one shot.
4. If you prefer task automation, run the **Compile and Reload Debugger** task or execute `auto-reload.(sh|cmd)` from the shell.

With these pieces in place you now have the same compile -> reload loop from Toolbox, tailored to Tableau LSP's workspace structure.
