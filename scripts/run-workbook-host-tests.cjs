const path = require('path');
const fs = require('fs/promises');
const { runTests } = require('@vscode/test-electron');

(async () => {
  const root = path.resolve(__dirname, '..');
  const result = path.join(root, 'test-results', 'workbook-host');
  await fs.mkdir(result, { recursive: true });
  await runTests({
    extensionDevelopmentPath: root,
    extensionTestsPath: path.join(__dirname, 'workbook-host-tests.cjs'),
    ...(process.env.VSCODE_EXECUTABLE_PATH ? { vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH } : {}),
    extensionTestsEnv: { WORKBOOK_HOST_REPORT: path.join(result, 'report.json') },
    launchArgs: ['--disable-extensions', '--disable-gpu', '--skip-welcome', '--disable-workspace-trust'],
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
