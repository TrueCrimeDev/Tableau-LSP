const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const JSZip = require('jszip');
const { execFileSync } = require('child_process');

function verifiedCheckoutCommit() {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== commit) throw new Error('Checkout does not match the workflow commit');
  if (execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8' }).trim()) {
    throw new Error('Release provenance requires a clean checkout; commit the reviewed changes before creating or publishing a release artifact');
  }
  return commit;
}

async function inspectVsix(vsixPath) {
  const bytes = await fs.readFile(vsixPath);
  const archive = await JSZip.loadAsync(bytes);
  const manifest = JSON.parse(await archive.file('extension/package.json').async('string'));
  return {
    file: path.basename(vsixPath),
    extensionId: `${manifest.publisher}.${manifest.name}`,
    version: manifest.version,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
}

function validateArtifact(actual, evidence, expectedCommit, tag) {
  for (const key of ['file', 'extensionId', 'version', 'sha256']) {
    if (actual[key] !== evidence[key]) throw new Error(`Tested artifact ${key} does not match the supplied VSIX`);
  }
  if (!expectedCommit || evidence.commit !== expectedCommit) throw new Error('Tested artifact commit does not match this checkout');
  if (evidence.smoke?.passed !== true || evidence.smoke?.mode !== 'installed-vsix') {
    throw new Error('Installed VSIX smoke evidence is required');
  }
  if (tag && tag !== `v${actual.version}`) throw new Error('Release tag must match the VSIX version');
}

module.exports = { inspectVsix, validateArtifact, verifiedCheckoutCommit };
