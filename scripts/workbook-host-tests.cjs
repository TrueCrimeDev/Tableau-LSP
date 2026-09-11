// Runs inside a real VS Code extension host. All workbooks are disposable fixtures.
const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');
const vscode = require('vscode');

exports.run = async function run() {
  const report = { vscodeVersion: vscode.version, checks: [], passed: false };
  const check = (name, condition) => { assert.ok(condition, name); report.checks.push(name); };
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tableau-workbook-host-'));
  const uri = name => vscode.Uri.file(path.join(root, name));
  const original = '<workbook version="18.1"><datasources><datasource name="Data"><column name="[Sales]" datatype="real" role="measure" type="quantitative" /></datasource></datasources></workbook>';
  const edited = original.replace('[Sales]', '[Revenue]');
  const payload = Buffer.from([0, 255, 16, 128, 0, 42]);
  try {
    const extension = vscode.extensions.getExtension('TrueCrimeAudit.tableau-language-support');
    await extension.activate();
    report.extensionVersion = extension.packageJSON.version;
    check('Extension activated', extension.isActive);
    for (const name of ['editXml', 'saveCopy', 'saveCopyAndOpen', 'previewChanges', 'restoreBackup']) {
      check(`${name} command registered`, (await vscode.commands.getCommands(true)).includes(`tableau-language-support.workbook.${name}`));
    }
    const zip = new JSZip();
    zip.file('nested/Book.twb', original);
    zip.file('Data/extract.hyper', payload);
    zip.file('Images/picture.png', Buffer.from([137, 80, 78, 71]));
    const packageBytes = await zip.generateAsync({ type: 'nodebuffer' });
    await fs.writeFile(uri('Book.twbx').fsPath, packageBytes);
    const editorUri = await vscode.commands.executeCommand('tableau-language-support.workbook.editXml', uri('Book.twbx'));
    check('Packaged workbook opens as native XML editor', editorUri?.scheme === 'tableau-workbook');
    const document = await vscode.workspace.openTextDocument(editorUri);
    check('Editor reads the embedded workbook', document.getText() === original);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(editorUri, new vscode.Range(document.positionAt(0), document.positionAt(original.length)), edited);
    check('Native editor accepts XML change', await vscode.workspace.applyEdit(edit));
    check('Editor has an unsaved draft', document.isDirty);
    const copyUri = await vscode.commands.executeCommand('tableau-language-support.workbook.saveCopy', editorUri, uri('Draft copy.twbx'));
    check('Save Copy returns the destination', copyUri?.toString() === uri('Draft copy.twbx').toString());
    const copy = await JSZip.loadAsync(await fs.readFile(copyUri.fsPath));
    check('Save Copy includes the unsaved XML draft', await copy.file('nested/Book.twb').async('string') === edited);
    check('Save Copy preserves the original package bytes', (await fs.readFile(uri('Book.twbx').fsPath)).equals(packageBytes));
    check('Save Copy preserves embedded binary data', (await copy.file('Data/extract.hyper').async('nodebuffer')).equals(payload));
    check('Native Save completes successfully', await document.save());
    const saved = await JSZip.loadAsync(await fs.readFile(uri('Book.twbx').fsPath));
    check('Native Save updates the original package XML', await saved.file('nested/Book.twb').async('string') === edited);
    check('Native Save preserves archive inventory', JSON.stringify(Object.keys(saved.files).sort()) === JSON.stringify(Object.keys(zip.files).sort()));
    check('Native Save preserves embedded data bytes', (await saved.file('Data/extract.hyper').async('nodebuffer')).equals(payload));
    const backups = await fs.readdir(path.join(root, '.tableau-lsp-backups'));
    check('Native Save creates a complete package backup', backups.length === 1 && (await fs.readFile(path.join(root, '.tableau-lsp-backups', backups[0]))).equals(packageBytes));
    const inventory = await vscode.lm.invokeTool('tableau_listFields', { input: {}, toolInvocationToken: undefined });
    const text = inventory.content.map(part => part.value || '').join('\n');
    report.inventory = text;
    report.activeEditor = vscode.window.activeTextEditor?.document.uri.toString();
    check('Chat resolves the XML editor back to its package', text.includes('Book.twbx') && /^- \[Revenue\]/m.test(text) && !/^- \[Sales\]/m.test(text));

    await fs.writeFile(uri('Plain.twb').fsPath, original);
    const plain = await vscode.workspace.openTextDocument(uri('Plain.twb'));
    await vscode.window.showTextDocument(plain, { preview: false });
    const plainEdit = new vscode.WorkspaceEdit();
    plainEdit.replace(plain.uri, new vscode.Range(plain.positionAt(0), plain.positionAt(original.length)), edited);
    await vscode.workspace.applyEdit(plainEdit);
    const plainCopy = await vscode.commands.executeCommand('tableau-language-support.workbook.saveCopy', plain.uri, uri('Plain copy.twb'));
    check('Plain workbook copy includes dirty editor text', plainCopy && await fs.readFile(plainCopy.fsPath, 'utf8') === edited);
    check('Plain workbook copy leaves original unchanged', await fs.readFile(plain.uri.fsPath, 'utf8') === original);
    await vscode.commands.executeCommand('workbench.action.files.revert');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    report.passed = true;
    console.log('WORKBOOK_HOST_PASS ' + JSON.stringify(report));
  } catch (error) {
    report.error = error?.stack || String(error);
    throw error;
  } finally {
    if (process.env.WORKBOOK_HOST_REPORT) { await fs.writeFile(process.env.WORKBOOK_HOST_REPORT, JSON.stringify(report, null, 2)); }
    // Keep failed fixtures for diagnosis; successful disposable files can be removed.
    if (report.passed) { await fs.rm(root, { recursive: true, force: true }); }
  }
};
