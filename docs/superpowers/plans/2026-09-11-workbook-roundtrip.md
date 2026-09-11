# Workbook editing and Tableau reopen implementation plan

**Goal:** Edit plain and packaged workbooks in VS Code, preserve their contents, save recoverable copies, and reopen the results in Tableau.

**Approved scope:** The user approved workbook round-trip editing and related extension improvements in this conversation. This release also improves calculation diagnostics and precise Quick Fixes.

**Architecture:** Keep localized XML mutations. Introduce one package codec and one persistence service for all writers. Package integrity verification is distinct from successful Tableau loading. Expose copy, restore, and packaged XML editing through VS Code commands and the workbook sidebar.

**Stack:** TypeScript, VS Code extension APIs, JSZip, fast-xml-parser, Jest, esbuild.

## Implementation

- [x] Package codec: decode `.twb` and single-workbook `.twbx`; reject ambiguous archives; preserve entry paths and bytes outside the edited workbook. Test archive inventories, binary assets, malformed input, and ambiguous packages.
- [x] Persistence: full backups, stale-content detection, persisted-content checks and rollback; save-copy and restore operations with matching formats. Test failure and recovery boundaries.
- [x] Integration: route calculation, palette, theme, formatting and cleanup edits through the common package-aware reader/writer. Remove obsolete read-only restrictions.
- [x] Commands: edit packaged XML, save a copy and launch Tableau, preview changes, and restore a backup. Distinguish launch requests from Tableau acceptance.
- [x] Semantic checks: share conservative aggregation/type diagnostics between calculations in the editor and workbook mutations. Test valid LOD, parameters and unknown types as well as invalid formulas.
- [x] Quick Fixes: rank real spelling similarity, use precise source ranges, retain existing header insertion, and avoid unrelated suggestions.
- [ ] Verification: typecheck, unit and deterministic integration tests; real workbook and archive round trips; actual local Tableau loading; VS Code extension-host checks.
- [ ] Release: update README/changelog/version, package and install the extension, push source and verify CI. Publish the Marketplace update if the publisher service permits it; report any remaining service failure precisely.

## Ownership

Package agent owns `workbookPackage.ts`, `workbookEditService.ts`, the common reader, and their tests. Semantic agent owns the shared validator, `diagnosticsProvider.ts`, calculation parser integration and tests. Quick Fix agent owns `provider.ts`, suggestion helpers and tests. Root owns commands, sidebar/chat integration, native verification, docs and release.

## Verification evidence

TypeScript passes; 996 unit tests across 54 suites pass; 44 deterministic tests pass. The final v1.13.0 VSIX passes 22 workbook editing and 15 existing runtime checks inside VS Code 1.137.0. The Superstore package preserves its six entries and three non-workbook assets. Semantic checks accept all 127 audited sample/fixture calculations. Actual Tableau loading awaits local Desktop sign-in; file checks do not imply successful rendering.
