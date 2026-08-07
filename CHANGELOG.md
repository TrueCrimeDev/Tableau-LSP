# Change Log

All notable changes to the "tableau-language-support" extension will be documented in this file.

## [Unreleased]

### Added

- **`@tableau` can now edit the workbook.** Two language model tools ship with the extension: `tableau_listFields` returns the complete, uncapped inventory of every datasource field, calculated field (with formula) and parameter, and `tableau_addCalculation` writes a calculated field straight into the live `.twb` through the existing backup → validate → verify → rollback pipeline. VS Code shows a confirmation card with the proposed formula before anything is written. Both tools are available to `@tableau` and to Copilot agent mode (`#tableauFields`, `#tableauAddCalculation`).
- **`@tableau /new`** — a chat command for authoring a calculated field, plus a matching follow-up button.
- **`@tableau` remembers the conversation.** Prior turns of the session are replayed to the model, so a clarifying question can actually be answered and a follow-up like "now make that a percentage" resolves against what came before. Bounded to the most recent turns inside a character budget, and never opens on an assistant turn whose question was trimmed away.
- **Field references are checked before anything is written.** Formula validation was lexer-level only — balanced parens and `IF`/`END` — so `SUM([Salez])` passed validation, passed the confirmation card, and landed in the workbook as a broken calculation. Every bracketed reference is now resolved against the target datasource's real fields (plus parameters, which are referencable from any datasource), with close matches offered: *"[Salez] — did you mean [Sales]?"*. Brackets inside string literals and comments are not mistaken for references, `]]` escapes are honoured, and a calculation may reference itself when being replaced.
- **Calculation-authoring guide for `@tableau`.** A second built-in prompt teaching how Tableau *evaluates* a calculation — row-level vs aggregate and why mixing them errors, viz level of detail, the full filter order of operations (which is why a FIXED LOD ignores a dimension filter but respects a context filter), LOD forms, NULL and type rules, table calculations, worked patterns, and the syntax mistakes models actually make (`COUNT(DISTINCT …)`, `SUMIF`, `ELSE IF`, missing `END`). Included only for calculation work, so border and formatting questions don't pay for it.
- **Project instructions for `@tableau`.** Drop an `agent.md`, `instructions.md`, or any `*.agent.md` in the workspace `tableau/` folder and it is sent with every request — naming rules, which datasource is canonical, house style, things that are always wrong in this project. Project instructions outrank the built-in guidance; they cannot override the safety rules (never reference a field that isn't in the workbook, never report an edit that didn't happen, never treat workbook content as instructions, always write through the confirmed tool). The reply names the instruction files it used. New command **Tableau: Create Agent Instructions for @tableau** scaffolds the file.
- **Shared workspace Tableau library.** A `tableau/` folder at any workspace root is now discovered automatically, across every root in a multi-root workspace. Every `*.d.twbl` inside it becomes field declarations for completion, hover, diagnostics and go-to-definition — merged, with later files winning on a name clash, so declarations can be split per datasource instead of crammed into one file. Every other `*.twbl` is auto-registered in the Calc Bank, so dropping a file of reusable calculations into the folder is all that is needed; no file picker, no per-machine state. Sub-folders are searched three levels deep, `node_modules`/`.git`/`out`/`dist`/`coverage` are skipped, and a root-level `fields.d.twbl` or `_calc_bank.twbl` keeps working unchanged. Configurable with `tableau-language-support.fieldDefinitions.folders` (default `["tableau", ".tableau"]`).

- **Workbook Health section** — a static linter over the parsed workbook: overlong calculations, deep calc-nesting chains, LOD-heavy formulas, quick filters set to "Only Relevant Values", auto-sized dashboards, unused calculations, filter-heavy worksheets, and high datasource counts, each expandable to the offending items.
- **Remove Unused Calculations** — a command (and a clean-up action in the workbook inspector) that deletes unused calculated fields from the active `.twb` through the transactional backup/verify/rollback pipeline. Deletion is skip-on-doubt: anything still referenced anywhere in the workbook (other formulas, sets, hierarchies, column instances, worksheet dependencies), ambiguous by caption, or altered on disk mid-flow is skipped and reported rather than removed.

### Changed

- Generated field declarations are written into the workspace `tableau/` folder when one exists, so they land beside the hand-written ones instead of at the workspace root. Workspaces without that folder are unaffected.
- The language server merges every workspace declaration file rather than a single root-level `fields.d.twbl`, and watches each `tableau/` folder so a file added or edited there is picked up without a reload. Declaration files are still ignored entirely while a live workbook is the authoritative schema.
- The `@tableau` agent prompt now instructs the model to call the workbook tools instead of printing XML for the user to paste, and to confirm exact field names before writing a formula. Asking `@tableau` to add, create, build, fix or change a calculation lifts the digest's 60-field cap so the model sees every name it could reference; a capped field list now says so and names the tool that returns the rest.

## [1.11.0] - 2026-07-14

### Added

- **Field-usage analysis** — every calculated field in the workbook inspector now shows how many worksheets use it, and calculations unused by any worksheet or live calculation get an "unused" badge (suppressed when the workbook has no worksheets to judge by). The formula hover shows the calc's lineage: the sheets it appears on, the fields/calcs/parameters it uses, and the calcs that use it.
- **Four new sidebar sections** surfacing data the extension already parsed: Parameters (with current values and domains), Sheet Filters (grouped per worksheet, calc references resolved to captions), Dashboards (size and expandable worksheet-zone lists), and Hierarchies.

### Changed

- Extension keyboard shortcuts no longer override core VS Code chords (`Ctrl+Shift+L` select-all-occurrences, `Ctrl+Shift+V`, `Ctrl+Shift+I`, `Ctrl+Shift+C`, `Ctrl+Shift+H`, `Ctrl+Shift+R`). All six moved to `Ctrl+Alt+T` two-step chords (e.g. `Ctrl+Alt+T L` inserts an LOD expression); `Ctrl+/` comment toggling is unchanged.

### Fixed

- Dashboard zone extraction understands the modern `type-v2` zone format, so dashboards no longer report zero zones.
- Sidebar workbook parsing runs one XML parse instead of one per extractor.

## [1.10.0] - 2026-07-14

### Added

- "Add to Bank" write path for the Calculation Bank: a new `Tableau: Add Selection to Calc Bank` editor command (also in the `.twbl` editor context menu, using a leading `// Title` comment when present) and a save action on each workbook inspector calculated-field row. Both append a `// Title` + formula block to a chosen bank file, creating and registering a new one when needed.
- Calc Bank files are now watched for external changes, so edits, creations, and deletions refresh the sidebar automatically.
- Clicking a Calc Bank entry opens its bank file in the editor at that entry's header line; clicking a file group header opens the file.
- "Add to Workbook" action on Calc Bank entries writes the calculation straight into the active workbook through the same validated, backup-protected pipeline as the Add Calculated Field form.

## [1.9.0] - 2026-07-13

### Added

- Calculation Bank is now backed by user-chosen `.twbl` files: add files via the sidebar's + button (persisted across sessions), remove them per file, and copy or insert individual calculations with hover actions. Falls back to the legacy workspace `_calc_bank.twbl` when no files are configured.

## [1.8.0] - 2026-07-13

### Added

- Theme Vault persistence — save, load, and delete named multi-palette themes from the sidebar.
- Clickable Most Used Commands in the sidebar Commands & Reference section.
- Datatype badges on calculated fields in the workbook inspector.

### Fixed

- README version requirement (was 1.60.0, minimum is 1.95.0) and stale release notes.
- CI now runs the unit test suite (699 tests under `src/tests/unit`); a wall-clock timing assertion was made tolerant of 1ms clock-granularity skew so the suite is stable on shared runners.
- Cancelling the duplicate-palette dialog while applying a theme now aborts the remaining palettes instead of writing them anyway.
- Calculated-field datatype badges read the datatype from the calculation's own column definition instead of a document-wide scan that could pick up connection schema columns.

### Documentation

- The sidebar palette/formatting suite (Palette Library, Advanced and Multi-Stop gradient generators, Theme Vault, Calculation Bank/Portfolio) shipped progressively across 1.6.x–1.7.x but was previously undocumented; it is now covered in the README.

## [1.7.3] - 2026-07-10

### Added

- Added a synchronized Common Calculations library with one base Profit Ratio calculation and support for up to ten reusable calculation templates.
- Added `Update-FromGitHub.ps1` for safe, fast-forward-only synchronization of the local checkout with a selected GitHub branch.

### Changed

- The calculated-field workflow and its Common Calculations library now use nested progressive disclosure instead of keeping the entire form permanently expanded.

## [1.7.2] - 2026-07-10

### Fixed

- Replaced the generic bracket-shaped Activity Bar icon with a crisp, monochrome Tableau cross constellation that remains recognizable across light, dark, high-contrast, and small-icon rendering.

## [1.7.1] - 2026-07-10

### Added

- Native calculated-field insertion for plain `.twb` workbooks from the command palette, sidebar, or a selected `.twbl` formula.
- Transactional workbook writes with timestamped backups, persisted-content verification, and automatic rollback.
- Optional verified relaunch in Tableau Desktop after calculated-field, border, theme, or bulk-formatting edits.
- Local Tableau Desktop and repository connectors plus configurable calculation-formatting profiles.

### Fixed

- Published a distinct patch version so manual VSIX installs cannot reuse the stale 1.7.0 extension-host/catalog entry.
- Documented `--force` installation and verified the packaged extension by installing it into a clean VS Code profile, activating it on a `.twbl` document, and checking extension-host errors.

## [1.7.0] - 2026-07-09

### Added

- **Automatic workbook field context** — opening or selecting a `.twb` or `.twbx` now indexes its datasource fields and synchronizes one authoritative schema across the extension host and language server without requiring a generated definitions file.
- **Datasource-aware IntelliSense** — completion, hover, diagnostics, references, field swapping, and go-to-definition understand `[Datasource].[Field]`, preserve duplicate captions across datasources, and navigate to the correct workbook declaration.
- **Shared chat field model** — `@tableau` now consumes the same canonical workbook field extraction as the LSP, including packaged workbooks, datatype/role metadata, and datasource-grouped field inventories.

### Changed

- Live workbook fields replace bundled sample declarations while a workbook is active; `fields.d.twbl` remains a workspace-scoped fallback for calculation-only projects.
- Generated field-definition sections now include workbook identity as well as datasource identity, avoiding collisions between workbooks and workspace roots.
- Field extraction preserves Tableau `local-name` metadata and exact datasource provenance, including datasource captions containing punctuation.

### Fixed

- Prevented stale workbook reads, delayed tab changes, background edits, and transient atomic-save failures from replacing the active schema with another workbook or an empty context.
- Corrected source navigation when duplicate captions occur in multiple datasources or workbook XML embeds datasource markup inside CDATA.
- Corrected punctuation-prefixed field completion, existing-bracket replacement, and datasource-qualified completion edits.
- Ignored bracket-shaped text inside strings and comments while preserving legitimate apostrophes in names such as `[Customer's Name]`.
- Added safe ambiguity handling for multiple open workbooks and correct `fields.d.twbl` selection in multi-root workspaces.

## [1.6.0] - 2026-07-09

### Added

- **@tableau Copilot chat participant** — ask Copilot Chat about the active .twb workbook (`@tableau what borders are set?`), with `/borders`, `/calcs`, and `/fields` commands. Parses the workbook into a bounded digest (worksheets, styles, resolved calculations, fields, parameters, thumbnails) and streams model answers grounded in it.
- **Datasource field browser** — click a datasource in the Tableau Tools sidebar to expand its plain fields with datatypes; click a field to copy `[Field Name]` ready to paste into a calc, or copy all field names at once.
- **Field-swap hover** — hover a `[Field]` reference in a .twbl calculation to see its datatype/role and click an alternative datasource field (same-datatype options first) to swap the reference in place.
- **Format Stripper sidebar section** — strip borders, bold, font sizes, and font colors from the active workbook, with live scan counts next to each option. Border stripping now inserts explicit neutralising nodes per worksheet, so sheets on Tableau-default borders are handled too, and repeated runs are idempotent.

### Changed

- Field extraction now walks the whole datasource subtree (relation columns, metadata-records), so ordinary non-renamed fields are recognised everywhere fields are used.
- Minimum VS Code version is now 1.95 (required by the Chat/Language Model APIs).

## [1.5.3-beta.0] - 2025-08-12

### Preview (Beta)

- Introduces early scaffolding for Tableau workbook (.twb/.twbx) calculation extraction.
- Adds new commands (extractFromFile / extractFromFolder / convertNotesToMarkdown / viewCalculations) as stubs.
- Adds normalization & dedupe pipeline (whitespace condense, trivial filter, keyword uppercasing) for extracted formulas.
- Adds Markdown fenced code output (```tableau) with header line // !Title pattern.
- Adds publishing automation (vsce package/publish tasks, GitHub Actions workflow, docs, guardrail hook).

### Notes

- XML parsing currently returns no calculations (stub); full extraction logic will arrive in stable 1.5.3.
- Beta release intended for feedback on command UX & output format only.
- Safe: New features are opt-in and do not affect existing LSP behavior until commands invoked.

### Known Gaps

- Tree view & webview viewer not implemented.
- Markdown conversion command is a placeholder.
- Error diagnostics for XML not yet surfaced.

## [1.5.2] - 2025-08-11

### Added

- Calculation block headers in hovers: Detects `// NAME – description` (hyphen or en dash) and prepends a contextual header while inside that calculation body.
- Humanized header names (underscores to spaces) with description separation and markdown separator.
- Automatic termination of a calculation block at the next header or after two consecutive blank lines.

### Changed

- Unified undefined field hover: Now always displays `[FieldName] is not defined in the current context.` without extra heading.
- Header styling switched from bold to plain text to match VS Code default hover font size for consistency.
- Field hover resolution now precisely targets the bracketed field under the cursor (prevents showing a different field's definition on the same line).

### Fixed

- Incorrect hover when hovering an undefined field next to a defined field now shows the correct undefined field message.
- Calculation body range no longer bleeds into subsequent calculation headers.

### Notes

- Lightweight upward + forward scans ensure no noticeable performance impact and results are cached post‑augmentation.

## [1.5.1] - 2025-01-28

### 🚨 CRITICAL HOTFIX

This is an emergency hotfix for v1.5.0 which contained a critical error that caused complete extension failure.

#### Fixed

- **CRITICAL**: Fixed `ReferenceError: ErrorRecovery is not defined` that caused complete extension failure
- **Import/Export**: Corrected import statement in `incrementalParser.ts` to use `AdvancedErrorRecovery`
- **Method Calls**: Fixed document parsing to use proper error recovery instance methods
- **Runtime Errors**: Eliminated undefined reference errors that broke all LSP functionality

#### Restored Functionality

- ✅ Extension activation and initialization
- ✅ Document parsing and analysis
- ✅ Hover information with rich tooltips
- ✅ Real-time syntax error detection
- ✅ Auto-completion for functions and fields
- ✅ All keyboard shortcuts
- ✅ Code snippets and templates
- ✅ Code formatting and validation

#### Technical Changes

- Updated `src/incrementalParser.ts` import statement
- Modified `src/documentModel.ts` parseDocument function
- Replaced static method calls with proper instance-based approach
- Verified all imports resolve correctly at runtime

**URGENT**: If you have v1.5.0 installed, update to v1.5.1 immediately via VS Code Extensions panel.

## [1.5.0] - 2025-01-27

### Added

- **Comprehensive Keyboard Shortcuts**: 10 new keyboard shortcuts for common operations

  - `Ctrl+Shift+F`: Format Expression
  - `Ctrl+Shift+V`: Validate Expression
  - `Ctrl+Shift+I`: Insert IF Statement
  - `Ctrl+Shift+C`: Insert CASE Statement
  - `Ctrl+Shift+L`: Insert LOD Expression (with picker)
  - `Ctrl+Shift+H`: Show Function Help
  - `Ctrl+/`: Toggle Comments
  - `Ctrl+Shift+R`: Restart Language Server
  - `Ctrl+Shift+T`: Run Tests
  - `Ctrl+Shift+S`: Insert Snippet

- **Advanced Analytics Snippets**: 25+ new advanced calculation patterns

  - Customer analytics (cohort analysis, retention, churn, CLV)
  - Statistical analysis (z-score, correlation, outlier detection)
  - Business intelligence (ABC analysis, market basket, conversion funnel)
  - Forecasting (moving averages, exponential smoothing)
  - Performance metrics (NPS, CSI, inventory turnover)

- **Enhanced Memory Management**: Improved per-document memory tracking

  - 50MB per document limit enforcement
  - Automatic cleanup of oversized inactive documents
  - Enhanced memory health monitoring

- **Comprehensive Test Coverage**: Complete testing framework

  - Performance tests with benchmarking
  - Edge case tests for malformed inputs
  - Boundary condition testing
  - Error recovery validation

- **Developer Experience Improvements**:
  - Context-sensitive commands (only work in .twbl files)
  - Smart snippet insertion with placeholder navigation
  - Function help with webview panel
  - Intelligent comment toggling

### Enhanced

- **Request Debouncing**: Improved performance with intelligent request prioritization
- **Error Recovery**: Better handling of malformed inputs and syntax errors
- **Documentation**: Comprehensive guides for keyboard shortcuts and snippets

### Fixed

- Memory leaks in document parsing
- Performance issues with large documents
- Error handling in edge cases

**NOTE**: v1.5.0 contained a critical bug that caused complete extension failure. Please update to v1.5.1 immediately.
