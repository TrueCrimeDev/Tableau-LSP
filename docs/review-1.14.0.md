# Workbook agent and setup review — 1.14.0

The update adds XML read/edit/export tools, fixes source-workbook selection after a backup comparison, clarifies palette persistence, and makes development and publishing reproducible.

## Verified locally

- TypeScript checks, unit tests, deterministic workbook tests, and release-artifact safeguards passed.
- Real VS Code 1.138.0 host tests exercised plain and packaged XML edits, exact backups, separate exports, binary preservation, and rejection of malformed XML, stale revisions and changed workbook selections.
- The packaged VSIX was installed into a fresh isolated profile and exercised. Registered API reads and prepared mutation implementations run against actual files; automated tests do not dismiss approval dialogs.
- In a separate interactive VS Code session, the registered XML tool displayed the real before/after confirmation, renamed a datasource in a disposable copy of Tableau's bundled Superstore workbook, and saved a complete package backup. The registered export tool displayed its destination confirmation and wrote a separate copy with packaged data intact.
- Comparing that workbook with its backup retained the original packaged workbook identity. The registered XML read tool returned the current source XML while the diff was active.
- Unit tests establish that memory monitoring stops on server shutdown and that palette drafts survive background refreshes. The unit process now exits normally.

## Verification boundary

Tableau Desktop 2026.1 launched with the exported sample on the development computer but stopped at its license activation screen. Workbook rendering, connections and Tableau-side calculation evaluation remain unverified in the target Tableau environment. The tool reports `launchRequested` separately from a saved export and leaves `tableauValidation` as `not_run`.

The intended deployment is a separate work computer with Tableau installed. The development computer does not need Tableau activation; final rendering checks belong on that work computer. Use the [work-computer installation steps](user-guide.md#install-on-your-tableau-work-computer) and the [roundtrip check](workbook-roundtrip-check.md) there.

The interactive check invoked the registered tools directly; it did not exercise a live Copilot model. Scripted model tests cover the participant's tool loop. GitHub Actions and public Marketplace publication are separate release checks: consult the workflow run and public listing for their current status.

## Release verification — September 19, 2026

- [Release verification](https://github.com/TrueCrimeDev/Tableau-LSP/actions/runs/35484906940) passed on Windows, macOS and Linux: 1,058 unit tests, 45 deterministic checks, and 40 real extension-host checks per platform. The production VSIX passed 42 installed-package checks.
- [GitHub release 1.14.0](https://github.com/TrueCrimeDev/Tableau-LSP/releases/tag/v1.14.0) contains those tested bytes and the checksum/commit record. An independent download matched SHA256 `ce6087ceea336cd1185b7e2779437c66f336d43d1df459a30ef36c32a756c997`; local VS Code reports the installed extension as 1.14.0.
- Marketplace publication was attempted once and rejected by Microsoft's **VSID Concurrency** limit. No retry was made. The public gallery still reported 1.5.8 after that attempt.

## Screenshot refresh — September 20, 2026

The current repository is **TrueCrimeDev/Tableau-LSP**. The separate `tableau-language-support` repository contains the legacy 1.5.6 extension; findings from that build do not describe 1.14.0.

- Downloaded the released 1.14.0 VSIX and matched its SHA256 to `ce6087ceea336cd1185b7e2779437c66f336d43d1df459a30ef36c32a756c997`.
- Reran typechecking, all **63 unit suites / 1,058 tests**, and **42 installed-VSIX checks** in VS Code 1.138.0. They passed. The installed-package test invokes registered reads and the packaged mutation implementations; it does not automate approval dialogs or a live Copilot model.
- Installed those release bytes in a separate VS Code profile and captured five real screenshots of the 1.14.0 release. The [walkthrough](../examples/README.md) uses a scratch copy of the repository's synthetic demo.
- Verified the inspector's one datasource, nine fields, three calculations, and one worksheet. Function completion displayed the available `SUM` matches.
- Confirmed both extraction paths: the sidebar writes `_Calculations.notes`; the Command Palette's **Tableau: Extract Calculations** writes and opens `Extracted_Calculations.twbl` with the complete field and worksheet inventory. Corrected the walkthrough's earlier conflation of these actions.
- Changed worksheet font size from **12** to **14** through the formatting panel, checked the saved XML, and compared the unchanged original backup with the current file. The original workbook remained selected while viewing the diff.
- Generated a nine-color palette, saved it with **Save Palette to File**, and parsed `Preferences.tps` to confirm all nine colors and both unchanged companion palettes. The UI displayed its save confirmation and cleared the unsaved status.

These captures demonstrate the installed extension's GUI and saved files. They do not add Tableau Desktop rendering or live Copilot-model verification. This documentation refresh does not publish a new extension version or change Marketplace availability.

### Remaining GUI finding

**P2 — Formatting-panel launch arrow does not open the panel.** Clicking the small arrow in the **Workbook Formatting** sidebar header only toggled that section in the installed 1.14.0 build. Its [inline `onclick` handler](../src/views/parsingGuideView.ts#L3247) is blocked by the webview's script policy, and the external sidebar script does not register a replacement listener for that button. Register the action in the external script and stop the header's collapse handler from receiving the button click. Until fixed, run **Tableau: Open Formatting Panel** from the Command Palette; that route was used and verified for the screenshots.
