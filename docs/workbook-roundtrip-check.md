# Check an edited workbook in Tableau

Use the licensed Tableau installation on the machine where you normally work. The extension itself does not require a Tableau Desktop license to edit workbook files.

1. Start with a workbook that opens successfully in that Tableau version. Make a disposable copy. For a plain `.twb`, keep the copy beside its source so relative data paths still resolve.
2. Open the copy in VS Code. Add a calculated field named `Roundtrip Check` with formula `42` and result datatype **Integer** using the Tableau sidebar. Confirm that the extension reports the saved file and a backup location.
3. For a `.twbx`, use **Tableau: Edit Workbook XML**; for a `.twb`, open the XML file directly. Confirm that the new calculation is present. Change its formula from `42` to `43` and Save. Use **Save a Workbook Copy** to produce a separate workbook in the same format.
4. Open the result in Tableau. Confirm there is no damaged-workbook, missing-data or invalid-calculation error, that the original sheets and dashboards render, and that `Roundtrip Check` appears in its datasource and returns `43` when used in a view.
5. Save the workbook from Tableau, close it and open it again. Check the same sheets and calculation. In VS Code, use **Compare Workbook with Backup** to inspect the changes.
6. On the disposable workbook you edited in steps 2–3, try **Restore Workbook Backup**. Confirm the preview names the correct workbook, restore it, and reopen in Tableau to verify the previous calculation is restored.

Repeat with `.twb` and `.twbx` workbooks representative of your work, including any packaged extracts and images. Keep the original Tableau version: this extension preserves version metadata and does not convert or downgrade workbooks.

The extension checks XML, ZIP contents and saved bytes. Successful Tableau loading, data connections and view rendering are separate checks completed in Tableau itself.
