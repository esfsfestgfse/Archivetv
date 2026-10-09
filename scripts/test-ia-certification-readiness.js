const { test } = require('node:test'), assert = require('node:assert/strict');
const { checkCanaryReadiness } = require('./certify-ia-repair-canary.js');

test('certification stops before testing lanes when Archive is unreachable', async () => {
  const urls = [];
  await assert.rejects(checkCanaryReadiness('http://127.0.0.1:4188/api/v3', async url => {
    urls.push(String(url));
    if (urls.length === 1) return Response.json({ queueRequests: 0 });
    throw Error('connection timed out');
  }), /connection timed out/);
  assert.equal(urls.length, 2);
  assert.ok(urls.every(url => !url.endsWith('/ia/queue')), 'a connection problem must not be scored as dead channels');
});

test('preflight requires both the local relay and complete Archive metadata', async () => {
  let calls = 0;
  const ready = await checkCanaryReadiness('http://127.0.0.1:4188/api/v3', async () => ++calls === 1 ? Response.json({}) : Response.json({ files: [{ name: 'episode.mp4' }] }));
  assert.deepEqual(ready, { local: true, archiveMetadata: true });
  await assert.rejects(checkCanaryReadiness('http://127.0.0.1:4188/api/v3', async () => Response.json({})), /incomplete/);
});
