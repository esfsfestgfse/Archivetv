#!/usr/bin/env node
// One local V3 session: opening reserve, one start, and one refill. No retries.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const [base, gamingId] = process.argv.slice(2);

async function main() {
  assert.match(base || '', /^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/api\/v3\/?$/,
    'Supply the loopback API base, for example http://127.0.0.1:4188/api/v3');
  assert.match(gamingId || '', /^[^\s:]+::[^\r\n]+$/, 'Supply the exact audited gaming ID (parent::file)');
  const endpoint = base.replace(/\/$/, '');
  const manifestScript = fileURLToPath(new URL('./export-ia-manifest.js', import.meta.url));
  const manifest = JSON.parse(execFileSync(process.execPath, [manifestScript], { encoding: 'utf8', timeout: 5000, maxBuffer: 8 * 1024 * 1024 }));
  const profile = manifest.find(row => row.channel === '108');
  assert.ok(profile, 'channel 108 must be in the app manifest');
  const sessionId = 'release-108-' + randomUUID();

  async function post(path, body) {
    const response = await fetch(endpoint + path, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-realsignal-session': sessionId },
      body: JSON.stringify({ ...body, channel: '108', sessionId }),
      redirect: 'error', signal: AbortSignal.timeout(12_000),
    });
    assert.ok(response.ok, path + ' returned HTTP ' + response.status);
    return {
      status: response.status,
      release: response.headers.get('x-realsignal-release'),
      source: response.headers.get('x-realsignal-source'),
      payload: await response.json(),
    };
  }

  const queue = async (phase, count, sessionRefill) => {
    const { status, release, source, payload } = await post('/ia/queue', {
      ...profile, iaRepair: true, serverCatalog: true, preparedStart: true, count, sessionRefill,
    });
    const ids = payload.items?.map(row => row.identifier) || [];
    console.log(JSON.stringify({ phase, status, release, source, ready: payload.ready,
      candidates: payload.candidates, preparedStart: payload.preparedStart === true,
      hydrating: payload.hydrating === true, cycleReset: payload.v2?.cycleReset, ids, gamingFileReady: ids.includes(gamingId) }));
    assert.equal(payload.apiVersion, 'v3');
    assert.equal(payload.v2?.sessionScoped, true);
    assert.equal(payload.ready, ids.length);
    assert.ok(ids.length >= 1 && ids.length <= count, phase + ' must provide a bounded ready shelf');
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(payload.items.every(row => row.identifier && row.media?.url));
    return ids;
  };

  const opening = await queue('reserve', 3, false);
  const id = opening.find(id => id !== gamingId);
  assert.ok(id, 'no clean opening reservation available');
  const ack = await post('/ia/playback', { id, event: 'started' });
  assert.equal(ack.status, 202);
  assert.equal(ack.payload.ok, true);
  assert.equal(ack.payload.id, id);
  assert.equal(ack.payload.event, 'started');
  const refill = await queue('refill', 5, true);
  assert.ok(!refill.includes(id), 'refill repeated the acknowledged start');
  assert.ok(!opening.includes(gamingId) && !refill.includes(gamingId), 'audited gaming file reached a ready shelf');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
