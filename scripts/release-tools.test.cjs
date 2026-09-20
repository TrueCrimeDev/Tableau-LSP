const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verifyMarketplace } = require('./verify-marketplace.cjs');
const { validateArtifact } = require('./release-artifact.cjs');

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
