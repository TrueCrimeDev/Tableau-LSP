const path = require('path');
const fs = require('fs/promises');
const { runTests } = require('@vscode/test-electron');
const { root, createProfile, executablePath, launchArgs } = require('./host-test-utils.cjs');

(async () => {
  const result = path.join(root, 'test-results', 'workbook-host');
  await fs.mkdir(result, { recursive: true });
  const profile = await createProfile('workbook-host');
  await runTests({
    extensionDevelopmentPath: root,
    extensionTestsPath: path.join(__dirname, 'workbook-host-tests.cjs'),
    vscodeExecutablePath: await executablePath(),
    extensionTestsEnv: { WORKBOOK_HOST_REPORT: path.join(result, 'report.json') },
    launchArgs: [...launchArgs(profile), '--disable-extensions'],
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
