import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import api, { SessionRotation } from '../realsignal_api_v2_worker.js';

const { rotationContext } = createRequire(import.meta.url)('./ia-storage-test-helper.js');
const shelfSource = readFileSync(new URL('../assets/ia-playback-shelf.js', import.meta.url), 'utf8');
const channel = '10', session = 'ack-regression';
const row = (parent, file = 'episode.mp4') => ({
  identifier: parent + '::' + file, title: parent,
  media: { type: 'video', url: 'https://archive.org/download/' + parent + '/' + file },
});
const valid = row('valid-start'), next = row('next-program');
const obsolete = row('evicted-parent', 'old.mp4');

function fixture() {
  const storage = rotationContext(), data = new Map(), calls = [], acks = [], watched = [], pending = [];
  const localStorage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const journal = () => JSON.parse(data.get('realsignal:ia-start:' + session + ':' + channel) || '[]');
  let rotation = new SessionRotation(storage, {}), releaseState;
  const env = {
    ROTATION: { getByName: () => rotation },
    RELAY: { async fetch(request) {
      assert.ok(new URL(request.url).pathname.endsWith('/ia/played'));
      watched.push((await request.json()).id);
      return Response.json({ ok: true });
    } },
  };
  const ctx = { waitUntil: promise => pending.push(promise) };
  const select = body => rotation.fetch(new Request('https://rotation.internal/select', { method: 'POST',
    body: JSON.stringify({ stationChannel: channel, ...body }),
  }));

  function browser(intercept) {
    const window = {};
    runInNewContext(shelfSource, {
      window, document: { querySelector: () => null }, location: { search: '?iaRepair=1' },
      URLSearchParams, AbortController, Date, localStorage, setTimeout, clearTimeout,
      iaSessionId: () => session, IA_API_BASE: 'https://api.example/api/v3',
      async fetch(url, init) {
        const packet = JSON.parse(init.body);
        calls.push(packet.event + ':' + packet.id);
        const send = () => api.fetch(new Request(url, init), env, ctx);
        const response = await (intercept ? intercept(send) : send());
        acks.push({ status: response.status, body: await response.clone().json() });
        if (packet.event === 'failed') releaseState = storage.snapshot();
        return response;
      },
    });
    window.RealSignalIAShelf.queue = async ({ count, sessionRefill }) => {
      calls.push(sessionRefill ? 'refill' : 'reserve');
      return (await select({ mode: 'reserve', items: [valid, next], count })).json();
    };
    return window.RealSignalIAShelf.client();
  }

  return { browser, journal, calls, acks, watched, storage, pending, select, get releaseState() { return releaseState; },
    restartRotation: () => { rotation = new SessionRotation(storage, {}); },
  };
}

test('an obsolete failed release drains before the next valid start and refill', async () => {
  const f = fixture(), shelf = f.browser();
  await shelf.reserve(channel, {});
  const before = f.storage.snapshot();
  const failed = shelf.event(channel, obsolete, 'failed');
  const started = shelf.event(channel, valid, 'started');
  const [, , refill] = await Promise.all([failed, started, shelf.reserve(channel, {})]);
  assert.deepEqual(f.acks[0], {
    status: 202, body: { ok: true, channel, id: obsolete.identifier, event: 'failed', disposition: 'obsolete' },
  });
  assert.equal(f.acks[1].status, 202);
  assert.deepEqual(f.releaseState, before, 'obsolete release leaves reservations, cooldowns and history intact');
  await Promise.all(f.pending);
  assert.deepEqual(f.calls, ['reserve', 'failed:' + obsolete.identifier, 'started:valid-start::episode.mp4', 'refill']);
  assert.deepEqual(Array.from(refill, row => row.identifier), ['next-program::episode.mp4']);
  assert.deepEqual(f.storage.snapshot().seen, ['valid-start::episode.mp4']);
  assert.deepEqual(f.watched, ['valid-start::episode.mp4']);
  assert.deepEqual(f.journal(), []);
});

test('a lost reply can be replayed after restart without a second history write in the same cycle', async () => {
  const f = fixture();
  const first = f.browser(async send => {
    assert.equal((await send()).status, 202);
    throw Error('lost acknowledgement');
  });
  await first.reserve(channel, {});
  await assert.rejects(first.event(channel, valid, 'started'), /lost acknowledgement/);
  assert.deepEqual(f.journal().map(row => row.id), ['valid-start::episode.mp4']);
  f.restartRotation();
  const reopened = f.browser();
  const rows = await reopened.reserve(channel, {});
  await Promise.all(f.pending);
  assert.deepEqual(f.calls, ['reserve', 'started:valid-start::episode.mp4', 'started:valid-start::episode.mp4', 'started:valid-start::episode.mp4', 'reserve']);
  assert.equal(f.acks[0].status, 202);
  assert.deepEqual(Array.from(rows, row => row.identifier), ['next-program::episode.mp4']);
  assert.deepEqual(f.storage.snapshot().seen, ['valid-start::episode.mp4']);
  assert.equal(f.storage.snapshot().cursor, 1);
  assert.deepEqual(f.watched, ['valid-start::episode.mp4']);
  assert.deepEqual(f.journal(), []);
  await f.browser().reserve(channel, {});
  assert.equal(f.calls.filter(call => call === 'started:valid-start::episode.mp4').length, 3);
});

test('an injected 503 retains the saved start and blocks refill until the same start is accepted', async () => {
  const f = fixture(), unavailable = async () => Response.json({ error: 'unavailable' }, { status: 503 });
  const first = f.browser(unavailable);
  await first.reserve(channel, {});
  await assert.rejects(first.event(channel, valid, 'started'), { status: 503 });
  assert.deepEqual(f.journal().map(row => row.id), ['valid-start::episode.mp4']);
  assert.deepEqual(f.storage.snapshot().seen, []);

  const reopened = f.browser(unavailable);
  await assert.rejects(reopened.reserve(channel, {}), { status: 503 });
  assert.deepEqual(f.calls, ['reserve', ...Array(4).fill('started:valid-start::episode.mp4')]);
  assert.deepEqual(f.journal().map(row => row.id), ['valid-start::episode.mp4']);

  await f.browser().reserve(channel, {});
  await Promise.all(f.pending);
  assert.deepEqual(f.calls.slice(-2), ['started:valid-start::episode.mp4', 'reserve']);
  assert.deepEqual(f.acks.map(ack => ack.status), [503, 503, 503, 503, 202]);
  assert.deepEqual(f.watched, ['valid-start::episode.mp4']);
  assert.deepEqual(f.journal(), []);
});

test('a fresh unknown start is rejected and retained in the journal', async () => {
  const f = fixture(), first = f.browser();
  await first.reserve(channel, {});
  await assert.rejects(first.event(channel, obsolete, 'started'), { status: 400 });
  assert.deepEqual(f.acks.map(ack => ack.status), [400, 400]);
  assert.deepEqual(f.journal().map(row => row.id), [obsolete.identifier]);
  assert.deepEqual(f.storage.snapshot().seen, []);
  assert.deepEqual(f.watched, []);
});

test('a restored start evicted from the catalog drains before the next saved start and refill', async () => {
  const f = fixture();
  await f.select({ mode: 'reserve', items: [obsolete] });
  const first = f.browser(async () => Response.json({ error: 'unavailable' }, { status: 503 }));
  const opening = await first.reserve(channel, {});
  const ids = rows => Array.from(rows, row => row.identifier);
  assert.ok(ids(opening).includes(obsolete.identifier));
  assert.ok(ids(opening).includes(valid.identifier));
  await Promise.all([
    assert.rejects(first.event(channel, obsolete, 'started'), { status: 503 }),
    assert.rejects(first.event(channel, valid, 'started'), { status: 503 }),
  ]);
  assert.deepEqual(f.journal().map(row => row.id), [obsolete.identifier, valid.identifier]);

  await f.select({ mode: 'reserve', rejectedIds: [obsolete.identifier] });
  assert.ok(!ids(f.storage.snapshot().catalog).includes(obsolete.identifier));
  f.restartRotation();
  const reopened = f.browser();
  await reopened.reserve(channel, {});
  const refill = await reopened.reserve(channel, {});
  await Promise.all(f.pending);
  const staleStart = 'started:' + obsolete.identifier;
  assert.deepEqual(f.calls, ['reserve', staleStart, staleStart, staleStart, 'started:' + valid.identifier, 'reserve', 'refill']);
  assert.deepEqual(f.acks.map(ack => ack.status), [503, 503, 400, 202]);
  assert.deepEqual(f.storage.snapshot().seen, [valid.identifier]);
  assert.deepEqual(f.watched, [valid.identifier]);
  assert.deepEqual(ids(refill), [next.identifier]);
  assert.deepEqual(f.journal(), []);
});
