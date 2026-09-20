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

Tableau Desktop 2026.1 launched with the exported sample but stopped at its license activation screen. Workbook rendering, connections and Tableau-side calculation evaluation remain unverified until activation is completed. The tool reports `launchRequested` separately from a saved export and leaves `tableauValidation` as `not_run`.

The interactive check invoked the registered tools directly; it did not exercise a live Copilot model. Scripted model tests cover the participant's tool loop. GitHub Actions and public Marketplace publication are separate release checks: consult the workflow run and public listing for their current status.

## Release verification — September 19, 2026

- [Release verification](https://github.com/TrueCrimeDev/Tableau-LSP/actions/runs/35484906940) passed on Windows, macOS and Linux: 1,058 unit tests, 45 deterministic checks, and 40 real extension-host checks per platform. The production VSIX passed 42 installed-package checks.
- [GitHub release 1.14.0](https://github.com/TrueCrimeDev/Tableau-LSP/releases/tag/v1.14.0) contains those tested bytes and the checksum/commit record. An independent download matched SHA256 `ce6087ceea336cd1185b7e2779437c66f336d43d1df459a30ef36c32a756c997`; local VS Code reports the installed extension as 1.14.0.
- Marketplace publication was attempted once and rejected by Microsoft's **VSID Concurrency** limit. No retry was made. The public gallery still reported 1.5.8 after that attempt.
