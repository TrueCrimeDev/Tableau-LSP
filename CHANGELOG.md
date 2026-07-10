# Change Log

All notable changes to the "tableau-language-support" extension will be documented in this file.

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
