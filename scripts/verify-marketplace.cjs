const { setTimeout: sleep } = require('timers/promises');

async function verifyMarketplace(extensionId, expectedVersion, { fetchImpl = fetch, wait = sleep } = {}) {
  // Poll only successful responses while the public gallery catches up. A rate
  // limit is an immediate stop, with Retry-After preserved for the operator.
  const delays = [0, 10_000, 20_000, 40_000];
  for (const delay of delays) {
    if (delay) await wait(delay);
    const response = await fetchImpl('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery?api-version=7.2-preview.1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ filters: [{ criteria: [{ filterType: 7, value: extensionId }] }], flags: 513 }),
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      throw new Error(`Marketplace verification rate limited (HTTP 429). Stop and retry manually ${retryAfter ? `after Retry-After: ${retryAfter}` : 'after the service cooldown'}. No retry was made.`);
    }
    if (!response.ok) throw new Error(`Marketplace verification failed (HTTP ${response.status}); no retry was made`);
    const data = await response.json();
    const extensions = data.results?.flatMap(result => result.extensions || []) || [];
    const extension = extensions.find(item => `${item.publisher?.publisherName}.${item.extensionName}`.toLowerCase() === extensionId.toLowerCase());
    const actual = extension?.versions?.[0]?.version;
    if (actual === expectedVersion) {
      console.log(`Public Marketplace verified: ${extensionId} ${actual}`);
      return;
    }
    console.log(`Public Marketplace currently reports ${actual || 'no matching extension'}; expected ${expectedVersion}.`);
  }
  throw new Error(`Publish command may have succeeded, but public Marketplace has not confirmed ${expectedVersion}. Check later; do not republish automatically.`);
}

if (require.main === module) {
  const manifest = require('../package.json');
  verifyMarketplace(process.argv[2] || `${manifest.publisher}.${manifest.name}`, process.argv[3] || manifest.version)
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { verifyMarketplace };
