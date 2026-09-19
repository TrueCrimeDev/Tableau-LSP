# Screenshot walkthrough

These are actual captures of **Tableau Language Support 1.13.1** running in a **VS Code 1.138.0 Extension Development Host on Windows**, taken on September 19, 2026. The window title identifies the demo as **demo**.

The included files contain synthetic fields, calculations, formatting, and palettes. The workbook is an extension demonstration fixture without a live data connection; Tableau Desktop rendering was not verified.

## Open the demo

1. Install the [1.13.1 VSIX](https://github.com/TrueCrimeDev/Tableau-LSP/releases/tag/v1.13.1) or build the extension from source.
2. Copy this folder to a scratch location and open [Tableau Demo.code-workspace](Tableau%20Demo.code-workspace) in VS Code.
3. Open [retail-demo.twb](retail-demo.twb), then select **Tableau LSP** in the activity bar to show **Tableau Tools**.

The starting workbook has one datasource, nine fields including three calculated fields, one worksheet, and a custom palette. The screenshots show successive steps using a working copy; the files here provide the starting state.

## Calculation help

Open [calculations.twbl](calculations.twbl), place the cursor inside `SUM`, and hover or run **Show Hover**. The inspector retains the workbook's field context while you edit calculations.

![Function hover beside the workbook inspector, with demo in the title](../images/examples/calculation-help.png)

## Extract calculations

Activate `retail-demo.twb` and click **Extract Calculations**. The generated `Extracted_Calculations.twbl` contains the datasource inventory, field types, and normalized formulas. This capture shows the generated fields and calculations.

![Generated field inventory and three extracted calculations](../images/examples/workbook-extraction.png)

## Inspect formatting

With the workbook active, run **Tableau: Open Formatting Panel**. Inspect the worksheet font, header color, gridlines, and borders. The **Apply Theme** and **Export Theme** tabs handle formatting themes.

![The live Workbook Formatting panel](../images/examples/workbook-formatting.png)

## Generate and save a palette

1. Collapse **Workbook**, **Workbook Formatting**, and **Format Stripper** to make room for **Palette Library**.
2. Select **Retail Teal**. In **Advanced Gradient Generator**, set the base color to `#0F766E`, use seven steps, and select **Ease Out**.
3. Click **Generate**, then the arrow beside the preview to load the colors into the palette editor.
4. Click **Save** in the palette editor to update the sidebar list, then **File Actions → Save** to write `config/Preferences.tps`.

The capture shows the seven generated colors in the editor and the saved XML. Both Save steps are required to persist this workflow.

![Palette generator and the saved Preferences.tps colors](../images/examples/palette-editor.png)

## Add a calculated field

Expand **Workbook → Add Calculated Field**. Choose **Retail Demo**, name the field **Average Selling Price**, select **Number (real)**, and enter:

```tableau
IF SUM([Quantity]) != 0 THEN
    SUM([Sales]) / SUM([Quantity])
END
```

This capture shows the completed form before clicking **Add to Workbook**.

![Completed calculated-field form alongside the source calculation](../images/examples/add-calculation.png)

After submission, the demo's saved XML contained the new field and its formula, and `.tableau-lsp-backups` contained a copy of the original workbook.

## Compare the saved change

Click **Compare Backup**, choose the generated backup, and inspect the native VS Code diff. The new `<column>` and `<calculation>` are highlighted in green. Refocus the original `retail-demo.twb` before making another workbook edit.

![Backup comparison highlighting the persisted calculated field](../images/examples/workbook-backup-diff.png)

## Verification

The review passed type checking, 996 unit tests, 44 deterministic tests, and 22 real extension-host workbook checks. Live checks also returned function hover, completions, and the two Tableau language model tool registrations. The unit run emitted a worker teardown warning. See [review notes](../docs/review-2026-09-19.md) for scope and remaining findings.
