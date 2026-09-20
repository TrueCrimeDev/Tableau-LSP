const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const JSZip = require('jszip');
const { runTests } = require('@vscode/test-electron');
const { root, createProfile, executablePath, launchArgs, installVsix } = require('./host-test-utils.cjs');

(async () => {
  if (!process.argv[2]) throw new Error('Usage: npm run test:vsix -- <path/to/extension.vsix>');
  const vsix = path.resolve(process.argv[2]);
  const bytes = await fs.readFile(vsix);
  const archive = await JSZip.loadAsync(bytes);
  const manifest = JSON.parse(await archive.file('extension/package.json').async('string'));
  const profile = await createProfile('installed-vsix');
  const executable = await executablePath();
  await installVsix(executable, profile, vsix);

  // Only this empty harness is a development extension. The tested extension must
  // be discovered from the VSIX installed into the fresh extensions directory.
  const harness = path.join(profile.directory, 'harness');
  await fs.mkdir(harness);
  await fs.writeFile(path.join(harness, 'package.json'), JSON.stringify({
    name: 'tableau-vsix-test-harness', publisher: 'tableau-tests', version: '0.0.0',
    engines: { vscode: '^1.95.0' }, main: './extension.cjs',
  }));
  await fs.writeFile(path.join(harness, 'extension.cjs'), 'exports.activate = () => {};\n');
  const reportDirectory = path.join(root, 'test-results', 'vsix-smoke');
  await fs.mkdir(reportDirectory, { recursive: true });
  const reportPath = path.join(reportDirectory, 'report.json');
  // Clear prior evidence before starting, so failed launches cannot pass manifest creation.
  await fs.rm(reportPath, { force: true });
  await runTests({
    vscodeExecutablePath: executable,
    extensionDevelopmentPath: harness,
    extensionTestsPath: path.join(__dirname, 'workbook-host-tests.cjs'),
    extensionTestsEnv: {
      WORKBOOK_HOST_REPORT: reportPath,
      EXPECTED_EXTENSION_VERSION: manifest.version,
      EXPECTED_EXTENSIONS_DIRECTORY: profile.extensions,
      VSIX_SHA256: crypto.createHash('sha256').update(bytes).digest('hex'),
    },
    launchArgs: launchArgs(profile),
  });
  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  if (!report.passed || report.mode !== 'installed-vsix') throw new Error('Installed VSIX smoke report did not pass');
})().catch(error => { console.error(error); process.exitCode = 1; });
