// Runs inside a real VS Code extension host. All workbooks are disposable fixtures.
const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');
const vscode = require('vscode');

exports.run = async function run() {
  const report = {
    vscodeVersion: vscode.version,
    mode: process.env.EXPECTED_EXTENSIONS_DIRECTORY ? 'installed-vsix' : 'development-host',
    vsixSha256: process.env.VSIX_SHA256,
    toolInvocation: {
      reads: 'registered vscode.lm.invokeTool API',
      mutations: 'packaged tool classes: prepareInvocation then invoke in the extension host',
      approvalDialogs: 'not exercised; normal confirmation settings remain enabled',
    },
    checks: [], passed: false,
  };
  const check = (name, condition) => { assert.ok(condition, name); report.checks.push(name); };
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tableau-workbook-host-'));
  const uri = name => vscode.Uri.file(path.join(root, name));
  const original = '<workbook version="18.1"><datasources><datasource name="Data"><column name="[Sales]" datatype="real" role="measure" type="quantitative" /></datasource></datasources></workbook>';
  const edited = original.replace('[Sales]', '[Revenue]');
  const payload = Buffer.from([0, 255, 16, 128, 0, 42]);
  try {
    const extension = vscode.extensions.getExtension('TrueCrimeAudit.tableau-language-support');
    check('Extension is discoverable', !!extension);
    if (process.env.EXPECTED_EXTENSIONS_DIRECTORY) {
      const relative = path.relative(process.env.EXPECTED_EXTENSIONS_DIRECTORY, extension.extensionPath);
      check('Extension loaded from the installed VSIX directory', !!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
      check('Installed version matches the tested VSIX', extension.packageJSON.version === process.env.EXPECTED_EXTENSION_VERSION);
    }
    await extension.activate();
    const { EditWorkbookXmlTool, SaveWorkbookCopyTool } = require(path.join(extension.extensionPath, extension.packageJSON.main));
    check('Packaged mutation tool implementations are available', typeof EditWorkbookXmlTool === 'function' && typeof SaveWorkbookCopyTool === 'function');
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

    const outputText = output => output.content.map(part => part.value || '').join('\n');
    const parseSuccess = output => {
      const text = outputText(output);
      assert.ok(!text.startsWith('TOOL ERROR'), text);
      return JSON.parse(text);
    };
    const invokeJson = async (name, input) => {
      const output = await vscode.lm.invokeTool(name, { input, toolInvocationToken: undefined });
      return parseSuccess(output);
    };
    const cancellation = new vscode.CancellationTokenSource();
    const invokePrepared = async (Tool, input) => {
      const tool = new Tool();
      const prepared = await tool.prepareInvocation({ input }, cancellation.token);
      assert.ok(prepared.confirmationMessages?.title && prepared.confirmationMessages?.message, 'Mutation must still request normal user confirmation');
      return parseSuccess(await tool.invoke({ input, toolInvocationToken: undefined }, cancellation.token));
    };
    const readXml = await invokeJson('tableau_readWorkbookXml', {});
    check('Agent reads the exact embedded workbook XML', readXml.xml === edited && readXml.workbook === 'Book.twbx');
    // The registered reads above exercise the live virtual-editor binding. The
    // direct packaged implementations target the original file tab, because
    // VS Code's extension loader may isolate its module cache from this runner.
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('vscode.open', uri('Book.twbx'), { preview: false });
    check('Prepared package mutations target the original file tab', vscode.window.tabGroups.activeTabGroup.activeTab?.input?.uri?.toString() === uri('Book.twbx').toString());
    const preAgentBytes = await fs.readFile(uri('Book.twbx').fsPath);
    const agentEdit = await invokePrepared(EditWorkbookXmlTool, {
      workbookId: readXml.workbookId, expectedRevision: readXml.revision,
      summary: 'Name the synthetic datasource Agent demo',
      replacements: [{ oldText: '<datasource name="Data">', newText: '<datasource caption="Agent demo" name="Data">' }],
    });
    check('Agent XML tool saves and returns a verified receipt', agentEdit.saved && agentEdit.xmlValidated && agentEdit.tableauValidation === 'not_run');
    const agentPackage = await JSZip.loadAsync(await fs.readFile(uri('Book.twbx').fsPath));
    check('Agent XML change persists inside the package', (await agentPackage.file('nested/Book.twb').async('string')).includes('caption="Agent demo"'));
    check('Agent XML edit preserves packaged binary data', (await agentPackage.file('Data/extract.hyper').async('nodebuffer')).equals(payload));
    check('Agent XML edit creates a complete pre-edit backup', (await fs.readFile(agentEdit.backup)).equals(preAgentBytes));
    const agentCopy = await invokePrepared(SaveWorkbookCopyTool, {
      workbookId: agentEdit.workbookId, expectedRevision: agentEdit.revision, fileName: 'Agent delivery.twbx',
    });
    check('Agent export saves a separate workbook without launching Tableau', agentCopy.saved && !agentCopy.launchRequested);
    check('Agent export matches the edited package bytes', (await fs.readFile(agentCopy.path)).equals(await fs.readFile(uri('Book.twbx').fsPath)));
    const stablePackage = await fs.readFile(uri('Book.twbx').fsPath);
    const invalidInput = {
      workbookId: agentEdit.workbookId, expectedRevision: agentEdit.revision,
      summary: 'Invalid synthetic caption',
      replacements: [{ oldText: 'caption="Agent demo"', newText: 'caption="R&D"' }],
    };
    await assert.rejects(new EditWorkbookXmlTool().prepareInvocation({ input: invalidInput }, cancellation.token), /not well formed/i);
    check('Invalid agent XML is rejected without changing the package', (await fs.readFile(uri('Book.twbx').fsPath)).equals(stablePackage));

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
    const plainRead = await invokeJson('tableau_readWorkbookXml', {});
    check('Registered agent read follows the selected plain workbook', plainRead.workbook === 'Plain.twb' && plainRead.xml === original);
    const plainInput = {
      workbookId: plainRead.workbookId, expectedRevision: plainRead.revision,
      summary: 'Add a synthetic datasource caption',
      replacements: [{ oldText: '<datasource name="Data">', newText: '<datasource caption="Plain agent" name="Data">' }],
    };
    const unprepared = await new EditWorkbookXmlTool().invoke({ input: plainInput, toolInvocationToken: undefined }, cancellation.token);
    check('An unprepared agent edit does not write', outputText(unprepared).startsWith('TOOL ERROR') && await fs.readFile(plain.uri.fsPath, 'utf8') === original);
    const plainAgentEdit = await invokePrepared(EditWorkbookXmlTool, plainInput);
    const plainAgentXml = original.replace('<datasource name="Data">', '<datasource caption="Plain agent" name="Data">');
    check('Agent plain XML edit persists and updates its editor', await fs.readFile(plain.uri.fsPath, 'utf8') === plainAgentXml && plain.getText() === plainAgentXml && !plain.isDirty);
    check('Agent plain edit backs up exact pre-edit bytes', await fs.readFile(plainAgentEdit.backup, 'utf8') === original);
    const plainAgentCopy = await invokePrepared(SaveWorkbookCopyTool, {
      workbookId: plainAgentEdit.workbookId, expectedRevision: plainAgentEdit.revision, fileName: 'Plain agent delivery.twb',
    });
    check('Agent plain export persists the verified XML', plainAgentCopy.saved && await fs.readFile(plainAgentCopy.path, 'utf8') === plainAgentXml);

    const staleInput = {
      workbookId: plainAgentEdit.workbookId, expectedRevision: plainAgentEdit.revision,
      summary: 'Change the synthetic datasource caption again',
      replacements: [{ oldText: 'caption="Plain agent"', newText: 'caption="Stale proposal"' }],
    };
    const staleTool = new EditWorkbookXmlTool();
    await staleTool.prepareInvocation({ input: staleInput }, cancellation.token);
    const newerDraft = new vscode.WorkspaceEdit();
    newerDraft.insert(plain.uri, plain.positionAt(plain.getText().length), '\n<!-- newer user draft -->');
    assert.ok(await vscode.workspace.applyEdit(newerDraft));
    const staleResult = await staleTool.invoke({ input: staleInput, toolInvocationToken: undefined }, cancellation.token);
    check('Prepared agent edit rejects a newer unsaved XML draft', /TOOL ERROR.*changed/s.test(outputText(staleResult)) && plain.getText().includes('newer user draft') && await fs.readFile(plain.uri.fsPath, 'utf8') === plainAgentXml);
    await vscode.commands.executeCommand('workbench.action.files.revert');

    const switchedTool = new EditWorkbookXmlTool();
    await switchedTool.prepareInvocation({ input: staleInput }, cancellation.token);
    await vscode.commands.executeCommand('vscode.open', uri('Book.twbx'), { preview: false });
    const switchedResult = await switchedTool.invoke({ input: staleInput, toolInvocationToken: undefined }, cancellation.token);
    check('Prepared agent edit rejects switching workbook selection', /TOOL ERROR.*selected workbook changed/s.test(outputText(switchedResult)) && (await fs.readFile(uri('Book.twbx').fsPath)).equals(stablePackage) && await fs.readFile(plain.uri.fsPath, 'utf8') === plainAgentXml);
    cancellation.dispose();
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    report.passed = true;
    console.log('WORKBOOK_HOST_PASS ' + JSON.stringify(report));
  } catch (error) {
    report.error = error?.stack || String(error);
    throw error;
  } finally {
    if (process.env.WORKBOOK_HOST_REPORT) { await fs.writeFile(process.env.WORKBOOK_HOST_REPORT, JSON.stringify(report, null, 2)); }
    // Keep failed fixtures for diagnosis; successful disposable files can be removed.
    if (report.passed) {
      // Windows can briefly retain editor/file-watcher handles after close.
      const temporaryParent = path.resolve(os.tmpdir());
      if (path.dirname(root) !== temporaryParent || !path.basename(root).startsWith('tableau-workbook-host-')) {
        throw new Error('Refusing to clean up a fixture outside the test temporary directory');
      }
      await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
        .catch(() => console.warn('Passed fixtures retained because VS Code still holds a file handle.'));
    }
  }
};
