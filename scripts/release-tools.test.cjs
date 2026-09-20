const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verifyMarketplace } = require('./verify-marketplace.cjs');
const { validateArtifact } = require('./release-artifact.cjs');
const { resolveHostExecutable } = require('./host-test-utils.cjs');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

async function bundleFixture(t, executableName) {
  const temporaryParent = path.resolve(os.tmpdir());
  const root = await fs.mkdtemp(path.join(temporaryParent, 'tableau-host-resolver-'));
  t.after(async () => {
    if (path.dirname(root) !== temporaryParent || !path.basename(root).startsWith('tableau-host-resolver-')) throw new Error('Unsafe test cleanup path');
    await fs.rm(root, { recursive: true, force: true });
  });
  const macos = path.join(root, 'Visual Studio Code.app', 'Contents', 'MacOS');
  await fs.mkdir(macos, { recursive: true });
  await fs.writeFile(path.join(path.dirname(macos), 'Info.plist'), `<plist><dict><key>CFBundleExecutable</key><string>${executableName}</string></dict></plist>`);
  return macos;
}

test('current macOS bundles resolve the Code executable declared by Info.plist', async t => {
  const macos = await bundleFixture(t, 'Code');
  await fs.writeFile(path.join(macos, 'Code'), 'fixture');
  assert.equal(await resolveHostExecutable(path.join(macos, 'Electron'), 'darwin'), path.join(macos, 'Code'));
});

test('older macOS bundles preserve their existing Electron executable', async t => {
  const macos = await bundleFixture(t, 'Code');
  await fs.writeFile(path.join(macos, 'Electron'), 'fixture');
  assert.equal(await resolveHostExecutable(path.join(macos, 'Electron'), 'darwin'), path.join(macos, 'Electron'));
});

test('macOS bundle metadata cannot redirect execution outside MacOS', async t => {
  const macos = await bundleFixture(t, '../outside');
  await assert.rejects(resolveHostExecutable(path.join(macos, 'Electron'), 'darwin'), /safe CFBundleExecutable/);
});

test('non-macOS executable paths are retained and missing files still fail', async t => {
  const macos = await bundleFixture(t, 'Code');
  const executable = path.join(macos, 'Code.exe');
  await fs.writeFile(executable, 'fixture');
  assert.equal(await resolveHostExecutable(executable, 'win32'), executable);
  await assert.rejects(resolveHostExecutable(path.join(macos, 'missing'), 'linux'), /ENOENT/);
});

test('429 stops public verification without waiting or retrying', async () => {
  let requests = 0;
  await assert.rejects(verifyMarketplace('publisher.extension', '1.2.3', {
    fetchImpl: async () => { requests++; return { status: 429, headers: new Headers({ 'retry-after': '300' }) }; },
    wait: async () => assert.fail('Must not wait and retry after 429'),
  }), /Retry-After: 300/);
  assert.equal(requests, 1);
});

test('successful but stale gallery replies back off and verify the exact version', async () => {
  const waits = [];
  let requests = 0;
  await verifyMarketplace('publisher.extension', '1.2.3', {
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ results: [{ extensions: [{
      publisher: { publisherName: 'Publisher' }, extensionName: 'extension',
      versions: [{ version: ++requests === 3 ? '1.2.3' : '1.2.2' }],
    }] }] }) }),
    wait: async delay => waits.push(delay),
  });
  assert.deepEqual(waits, [10_000, 20_000]);
  assert.equal(requests, 3);
});

test('artifact validation rejects different bytes, commit, tag, and missing installed smoke evidence', () => {
  const actual = { file: 'extension.vsix', extensionId: 'publisher.extension', version: '1.2.3', sha256: 'abc' };
  const evidence = { ...actual, commit: 'commit-a', smoke: { passed: true, mode: 'installed-vsix' } };
  validateArtifact(actual, evidence, 'commit-a', 'v1.2.3');
  assert.throws(() => validateArtifact({ ...actual, sha256: 'def' }, evidence, 'commit-a'), /sha256/);
  assert.throws(() => validateArtifact(actual, evidence, 'commit-b'), /commit/);
  assert.throws(() => validateArtifact(actual, evidence, 'commit-a', 'v2.0.0'), /tag/);
  assert.throws(() => validateArtifact(actual, { ...evidence, smoke: {} }, 'commit-a'), /smoke/);
});
