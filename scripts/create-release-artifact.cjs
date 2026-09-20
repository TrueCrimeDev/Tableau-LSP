const fs = require('fs/promises');
const path = require('path');
const { inspectVsix, verifiedCheckoutCommit } = require('./release-artifact.cjs');

(async () => {
  if (!process.argv[2]) throw new Error('Usage: npm run release:manifest -- <tested.vsix> [smoke-report.json]');
  const vsix = path.resolve(process.argv[2]);
  const report = JSON.parse(await fs.readFile(process.argv[3] || 'test-results/vsix-smoke/report.json', 'utf8'));
  const artifact = await inspectVsix(vsix);
  if (!report.passed || report.mode !== 'installed-vsix' || report.vsixSha256 !== artifact.sha256 || report.extensionVersion !== artifact.version) {
    throw new Error('A passing installed-VSIX report for these exact bytes and version is required');
  }
  const manifest = require('../package.json');
  if (artifact.version !== manifest.version || artifact.extensionId !== `${manifest.publisher}.${manifest.name}`) {
    throw new Error('Tested VSIX identity/version does not match the checkout');
  }
  const commit = verifiedCheckoutCommit();
  await fs.writeFile(path.join(path.dirname(vsix), 'release.json'), JSON.stringify({
    ...artifact, commit,
    smoke: { passed: true, mode: report.mode, vscodeVersion: report.vscodeVersion, checks: report.checks.length },
  }, null, 2) + '\n');
  console.log(`Recorded tested artifact ${artifact.file}, version ${artifact.version}, SHA256 ${artifact.sha256}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
