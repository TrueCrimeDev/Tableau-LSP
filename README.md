# Tableau Language Support

Write Tableau calculations and inspect, edit, and format workbooks in VS Code.

[Install from Marketplace](https://marketplace.visualstudio.com/items?itemName=TrueCrimeAudit.tableau-language-support) · [Download a VSIX](https://github.com/TrueCrimeDev/Tableau-LSP/releases) · [User guide](docs/user-guide.md) · [Changelog](CHANGELOG.md)

## Get started

Requires **VS Code 1.95 or newer**.

1. Install **Tableau Language Support** by **TrueCrimeAudit**. For a GitHub build, download the `.vsix` from Releases and run **Extensions: Install from VSIX…**.
2. Open a folder containing a `.twb` or `.twbx` workbook, then open **Tableau Tools** in the activity bar.
3. Open or create a `.twbl` file to write calculations with workbook-aware field completion, hover help, diagnostics, and formatting.

Try the [included demo](examples/README.md) to explore the features with synthetic data.

## What it does

| Workflow | Features |
| --- | --- |
| **Write calculations** | Syntax highlighting, function and field completion, signatures, hover help, diagnostics, snippets, and formatting profiles. |
| **Inspect workbooks** | Browse datasources, fields, calculations, and worksheets; extract calculations to a `.twbl` file. |
| **Edit workbooks** | Add calculated fields, edit packaged workbook XML, save copies, compare backups, and restore earlier versions. |
| **Style workbooks** | Edit fonts, borders, and colors; strip formatting; create palettes and gradients; import and export themes. |
| **Reuse project context** | Share field declarations and calculations through a workspace `tableau/` folder and the Calc Bank. |
| **Use Copilot** | Ask `@tableau` to inspect fields, write calculations, edit workbook XML, or export a copy for Tableau. Works with `.twb` and `.twbx`; requires Copilot Chat and model access. |

## See it working

Actual VS Code captures of version **1.13.1**, using the synthetic demo. `demo` appears in the demo window title.

**Calculation help and workbook context**

![Tableau calculation hover help beside the workbook inspector, with demo in the window title](images/examples/calculation-help.png)

**Extract calculations from a workbook**

![Extracted Tableau calculations and datasource fields in VS Code](images/examples/workbook-extraction.png)

**Inspect workbook formatting**

![Workbook Formatting panel showing fonts, gridlines, borders, and colors](images/examples/workbook-formatting.png)

More screenshots and steps: [palettes, calculated fields, and the demo walkthrough](examples/README.md).

## Workbook editing

Extension-managed workbook edits create timestamped backups in `.tableau-lsp-backups` and verify the saved XML. Packaged `.twbx` edits preserve the other archive entries. Use **Save a Workbook Copy** to work on a separate file.

In chat, try `@tableau /edit remove the row dividers from Sales Overview`, then `@tableau /export`. The agent reads the XML, shows the proposed changes for review, and saves a separate copy to open in Tableau. [Agent tools and examples →](docs/user-guide.md#use-copilot-with-a-workbook)

![An agent tool's saved XML edit shown against its backup in VS Code 1.14.0](images/examples/agent-xml-edit.png)

Calculation diagnostics and file verification do not replace Tableau's calculation engine or prove that every connection and worksheet will render. Check the result in your target Tableau Desktop version. [Editing and recovery details →](docs/user-guide.md#edit-and-recover-workbooks)

## Development

```sh
npm ci
npm run typecheck
npm run test:unit
npm run test:deterministic
npm run test:workbook-host
```

Press **F5** to build and open an isolated demo workspace. Both extension and server rebuild with **npm run watch**. CI also installs and exercises the packaged VSIX before it can be published.

[Debug and reload](docs/AUTO_RELOAD_DEBUGGER.md) · [Workbook host checks](docs/workbook-roundtrip-check.md) · [Extraction guide](docs/extraction-guide.md) · [Report an issue](https://github.com/TrueCrimeDev/Tableau-LSP/issues)
