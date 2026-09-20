# Check an edited workbook in Tableau

Use the licensed Tableau installation on the machine where you normally work. The extension itself does not require a Tableau Desktop license to edit workbook files.

1. Start with a workbook that opens successfully in that Tableau version. Make a disposable copy. For a plain `.twb`, keep the copy beside its source so relative data paths still resolve.
2. Open the copy in VS Code. Add a calculated field named `Roundtrip Check` with formula `42` and result datatype **Integer** using the Tableau sidebar. Confirm that the extension reports the saved file and a backup location.
3. For a `.twbx`, use **Tableau: Edit Workbook XML**; for a `.twb`, open the XML file directly. Confirm that the new calculation is present. Change its formula from `42` to `43` and Save. Use **Save a Workbook Copy** to produce a separate workbook in the same format.
4. Open the result in Tableau. Confirm there is no damaged-workbook, missing-data or invalid-calculation error, that the original sheets and dashboards render, and that `Roundtrip Check` appears in its datasource and returns `43` when used in a view.
5. Save the workbook from Tableau, close it and open it again. Check the same sheets and calculation. In VS Code, use **Compare Workbook with Backup** to inspect the changes.
6. On the disposable workbook you edited in steps 2–3, try **Restore Workbook Backup**. Confirm the preview names the correct workbook, restore it, and reopen in Tableau to verify the previous calculation is restored.

Repeat with `.twb` and `.twbx` workbooks representative of your work, including any packaged extracts and images. Keep the original Tableau version: this extension preserves version metadata and does not convert or downgrade workbooks.

## Check agent XML editing

On another disposable copy, ask the VS Code agent to read the active workbook XML, change one known worksheet label or calculation, and save a separate workbook copy. Review the confirmation card's workbook, exact before/after XML, and output filename before approving. The available tools are `tableau_readWorkbookXml`, `tableau_editWorkbookXml`, and `tableau_saveWorkbookCopy`.

Confirm that the saved edit has a complete backup and the exported copy has the expected name and format. Repeat steps 4–5 above on that exported copy. A successful launch only proves the launch request was accepted; activation can still prevent loading. Record separately whether its sheets render and its connections and calculation resolve.

Also check stale edits: have the agent read the XML, change the workbook yourself before applying its edit, then confirm the tool asks for a fresh read rather than overwriting the newer state. A dirty packaged XML draft must be saved or reverted before another agent edit; exporting a copy should include the draft. Existing output files must not be overwritten.

## Record the result

Record the extension version, Tableau Desktop version, workbook format, original and edited behavior, whether a data connection was available, and whether backup restore succeeded. Keep sensitive workbooks and source paths out of public test reports. The checked-in synthetic examples are useful for extension behavior; they contain no live connection and do not prove Tableau Desktop rendering.

The extension checks XML, ZIP contents and saved bytes. Successful Tableau loading, data connections and view rendering are separate checks completed in Tableau itself.
