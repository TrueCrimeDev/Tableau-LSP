const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { inspectVsix, validateArtifact, verifiedCheckoutCommit } = require('./release-artifact.cjs');
const { verifyMarketplace } = require('./verify-marketplace.cjs');

(async () => {
  if (!process.argv[2]) throw new Error('Usage: npm run publish -- <tested.vsix> [release.json]. Prefer the gated Publish workflow.');
  const vsix = path.resolve(process.argv[2]);
  const evidence = JSON.parse(await fs.readFile(process.argv[3] || path.join(path.dirname(vsix), 'release.json'), 'utf8'));
  const artifact = await inspectVsix(vsix);
  const commit = verifiedCheckoutCommit();
  validateArtifact(artifact, evidence, commit, process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined);
  const manifest = require('../package.json');
  if (artifact.version !== manifest.version || artifact.extensionId !== `${manifest.publisher}.${manifest.name}`) {
    throw new Error('Tested VSIX identity/version does not match the checkout');
  }
  if (!process.env.VSCE_PAT) throw new Error('VSCE_PAT is required');

  // Exactly one publish invocation; vsce receives no instruction to skip duplicates
  // or retry a throttled write. Never print the credential.
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [require.resolve('@vscode/vsce/vsce'), 'publish', '--packagePath', vsix], {
      env: { ...process.env, VSCE_PAT: process.env.VSCE_PAT }, stdio: 'inherit', windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (result !== 0) {
    throw new Error('Marketplace publish failed. No retry was made. For HTTP 429/VSID Concurrency, honor Retry-After or the service cooldown before manually rerunning.');
  }
  await verifyMarketplace(artifact.extensionId, artifact.version);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
