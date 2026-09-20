# User guide

[Installation and overview](../README.md) · [Screenshot walkthrough](../examples/README.md)

## Install on your Tableau work computer

You can develop and test this extension on one computer and use it on another. The development computer does not need a Tableau account or installation. Workbook inspection, XML editing, backups, and file exports run in VS Code; Tableau is needed where you open and check the finished workbook.

1. On your work computer, download `tableau-language-support.vsix` from [GitHub Releases](https://github.com/TrueCrimeDev/Tableau-LSP/releases/latest). In VS Code, run **Extensions: Install from VSIX…**, choose that file, and reload if prompted. Installing the packaged extension does not require cloning this repository or running npm.
2. Open a folder containing a disposable copy of a workbook that already works in your Tableau installation. Keep plain `.twb` files beside their source data so relative paths resolve; `.twbx` files retain their packaged assets.
3. Use **Tableau Tools** to inspect and edit it. For AI edits, use Copilot Chat with an accessible model, ask `@tableau /edit` for the change, and review the proposed XML before approving. Tableau sign-in and the AI model's access are separate requirements.
4. Use **Save a Workbook Copy and Open in Tableau**, or ask `@tableau /export`. Check the copy's sheets, calculations, and connections in the work computer's Tableau installation. Follow the [workbook roundtrip check](workbook-roundtrip-check.md) for a first-use test.

If automatic launch misses Tableau, set `tableau-language-support.local.executablePath` to that computer's Tableau executable, or open the exported file from Tableau itself. No Tableau activation is needed on the development computer.

## Write calculations

Open a `.twbl` file. Completion suggests functions, keywords, and known fields; hover shows function signatures and field details. Use the Problems panel for supported syntax and semantic diagnostics.

Open a `.twb` or `.twbx` to supply its datasource fields to IntelliSense, hover, diagnostics, navigation, and field swapping. Qualified references such as `[Datasource].[Field]` help distinguish fields from different datasources.

![Live function hover and workbook context](../images/examples/calculation-help.png)

Use **Tableau: Format Tableau Expression** to format the selection or the whole document. **Tableau: Select Calculation Formatting Profile** offers `readable`, `compact`, and `expanded` styles. Keyword case, line length, argument wrapping, operator position, and indentation are configurable.

```tableau
// !Profit Ratio - Profit as a share of total sales
IF SUM([Sales]) != 0 THEN
    SUM([Profit]) / SUM([Sales])
END
```

Markdown fences labeled `tableau` also receive syntax highlighting.

## Inspect and extract

Open **Tableau Tools** from the activity bar to browse the active workbook's datasources, calculated fields, fields, worksheets, and custom palettes.

The **Source workbook** label identifies the workbook used by the sidebar. When you inspect a backup comparison, the sidebar keeps using the original workbook rather than either read-only snapshot.

Click **Extract Calculations**, or run **Tableau: Extract Calculations** with the workbook active. The command writes `Extracted_Calculations.twbl` in the workspace root and opens it. Extraction resolves internal field names to captions, normalizes formulas, and filters duplicate or trivial calculations. See the [Extraction Guide](extraction-guide.md).

## Edit and recover workbooks

Use **Tableau: Add Calculation to Workbook**, the sidebar's **Add Calculated Field** form, or `@tableau` to add a field to a `.twb` or `.twbx` datasource. A selection in a `.twbl` editor can supply the formula. Duplicate calculation names require explicit replacement; physical-field name collisions are rejected.

The form's **Common Calculations** library starts with a Profit Ratio example and stores up to ten reusable name, formula, and datatype templates. **Use Saved** fills the form; **Save Current** adds or updates a template. Templates participate in VS Code Settings Sync when available.

Extension-managed mutations validate XML, create a complete timestamped backup in `.tableau-lsp-backups`, and check the persisted result. Failed writes recover from the backup when safe; newer external edits are preserved and reported. Packaged edits replace only the embedded workbook and preserve the other archive entries. A package must contain exactly one workbook.

| Command | Behavior |
| --- | --- |
| **Edit Workbook XML** | Opens the embedded XML of a `.twbx` in a native editor; normal Save writes it back to the package. |
| **Save a Workbook Copy** | Includes unsaved editor changes and leaves the source unchanged. |
| **Save a Workbook Copy and Open in Tableau** | Saves a copy and launches it in the configured local Tableau installation. |
| **Compare Workbook with Backup** | Opens an XML diff against a saved backup. |
| **Restore Workbook Backup** | Restores an earlier version after backing up the current file, including a damaged file. |

Save or revert a dirty packaged XML editor before applying sidebar or chat edits. Keep a plain `.twb` copy beside its original when connections use relative paths. A `.twbx` copy retains packaged data and images; external connections still require access.

Verification checks XML, archive integrity, and saved contents. It does not prove that Tableau can resolve connections, evaluate every calculation, or render every sheet. Open the result in the intended Tableau Desktop version. Workbook version metadata is preserved; the extension does not downgrade workbooks.

## Format workbooks and create palettes

The sidebar and **Tableau: Open Formatting Panel** inspect and edit worksheet fonts, colors, borders, and line styles. They use the same backup and verification layer as other workbook edits.

The formatting panel also names its **Source workbook**. Changes apply to the workbook whose formatting is displayed, including while another workbook is still loading.

![Workbook Formatting panel](../images/examples/workbook-formatting.png)

- **Format Stripper** removes selected borders, bold, font sizes, and font colors, with scan counts before applying changes.
- **Palette Library** creates, edits, imports, archives, and applies categorical, sequential, and diverging palettes.
- **Gradient generators** support a base-color ramp or multiple color stops, configurable easing, and LAB, RGB, or HSL interpolation.
- **Theme Vault** stores named collections of palettes. Workbook formatting themes can also be imported and exported as JSON, with override or preserve-existing modes.

Workspace palettes live in `config/Preferences.tps`. **Copy Preferences.tps to My Tableau Repository** makes them available to the local Tableau repository.

The palette editor's **Save Palette to File** saves the edited palette and library to `config/Preferences.tps`. **Save Library to Preferences.tps**, at the top of the Palette Library, saves the library as listed; use **Save Palette to File** to include changes still in the editor.

An unsaved indicator remains until saved palette data returns. Background refreshes preserve pending edits. **Reload File** reloads Preferences.tps and asks before discarding unsaved palette changes.

**Open in Tableau after a verified formatting write** launches the saved workbook in the configured or newest discovered Tableau Desktop installation. It does not close an already-running Tableau process.

## Reuse fields and calculations

Place shared files in a `tableau/` folder at a workspace root:

```text
tableau/
  fields.d.twbl       # Field declarations for IntelliSense
  retail.d.twbl       # Additional declarations, merged
  common.twbl         # Reusable calculations for the Calc Bank
  agent.md            # Project instructions for @tableau
```

A root-level `fields.d.twbl` also works. Configure additional folders through `tableau-language-support.fieldDefinitions.folders`. Live workbook fields take precedence over these fallback declarations.

The Calc Bank also accepts selections through **Tableau: Add Selection to Calc Bank**. The Calculation Portfolio supplies stock examples for insertion at the cursor.

## Use Copilot with a workbook

With Copilot Chat and an available model, ask `@tableau` about the active workbook. Commands include `/new`, `/edit`, `/export`, `/borders`, `/calcs`, and `/fields`. Each response names and links the selected workbook.

```text
@tableau /fields
@tableau what borders are set?
@tableau add a profit ratio calculation
@tableau /edit remove the row dividers from Sales Overview
@tableau /export
```

The agent uses a workbook digest for orientation, then reads exact fields or XML before editing. Calculation and XML changes show a confirmation card and use the backup and verification workflow. XML editing covers formatting, worksheet and dashboard definitions, and other underlying workbook sections. Packaged `.twbx` files retain their embedded data and images.

| Agent mode tool | Purpose |
| --- | --- |
| `#tableauFields` | Inspect the complete field inventory, with optional filters. |
| `#tableauAddCalculation` | Add or update a calculated field using Tableau formula syntax. |
| `#tableauXml` | Read exact workbook XML; search and pagination handle large files. |
| `#tableauEditXml` | Apply reviewed, exact XML replacements to the workbook. |
| `#tableauExport` | Save a new copy beside the original and optionally open it in Tableau. |

An XML edit is tied to the workbook and revision the agent just read. If the file or selected workbook changes, the agent must reread before writing. Invalid XML, ambiguous replacements, and overwriting an existing export are rejected. Save or revert an unsaved packaged XML draft before another agent edit; an export can preserve the draft as a separate copy.

`/export` saves `<workbook>-edited.twb` or `.twbx` beside its source, keeping relative connection paths intact, and opens that copy in Tableau. Ask for a different filename when one already exists. The result reports saving and launching separately: if Tableau is unavailable, the saved copy remains usable. Configure `tableau-language-support.local.executablePath` if automatic discovery misses your installation.

Open the result in your target Tableau version to check sheets, calculation behavior, and data connections. Strict XML checks and package verification do not establish those results. Ask for a proposal or explanation explicitly when you want the agent to read without editing.

Project `agent.md`, `instructions.md`, and `*.agent.md` files in the configured library folders accompany `@tableau` requests. Use **Tableau: Create Agent Instructions for @tableau** to scaffold naming and datasource conventions. Project guidance cannot override the built-in safety rules.

## Connect local Tableau Desktop

| Command | Purpose |
| --- | --- |
| **Connect Local Workbook to LSP and Chat** | Attaches a `.twb` or `.twbx` outside the workspace to the shared field model. |
| **Open Workbook in Local Tableau Desktop** | Launches the active or selected workbook. |
| **Show Local Connector Status** | Reports discovered Desktop versions, repositories, workbooks, datasources, connectors, extracts, and logs. |
| **Open Local Tableau Repository** | Opens the detected repository in the operating system. |

The connector discovers standard and OneDrive-backed repository folders and uses local Tableau files. Override repository and executable paths with `tableau-language-support.local.*` settings.

## Settings and troubleshooting

Search VS Code Settings for `tableau-language-support`:

- `enableFormatting` and `enableSignatureHelp` toggle their providers.
- `formatting.*` controls calculation layout and casing.
- `fieldDefinitions.folders` selects shared library folders.
- `local.*` controls local discovery and launch paths.

If language features stop responding, check that the editor language is **Tableau**, then run **Tableau: Restart Language Server**. **Tableau: Show Extension Status** and **Tableau: Show Logs** provide diagnostics. Disable any duplicate Tableau language extension if VS Code reports a conflict.

## Develop from source

Use the checks in the [README](../README.md#development), then follow the [debug and reload workflow](AUTO_RELOAD_DEBUGGER.md). Development commands such as **Compile and Reload Tableau Debugger** require a source checkout and an Extension Development Host.

To update a clean checkout from GitHub on Windows, run `./Update-FromGitHub.ps1`. It fetches `origin`, switches to `main`, and performs a fast-forward-only pull. It refuses tracked local changes and leaves untracked workbook fixtures in place. Use `-Remote` and `-Branch` to select another source.
