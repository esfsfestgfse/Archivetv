const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const asset = path.join(root, 'assets/guide-contract.js');
const contract = fs.existsSync(asset) ? require(asset) : {};
const channel = { num: 150, key: 'classic-cartoons', nm: 'Classic Cartoons' };
const a = { identifier: 'collection::a.mp4', title: 'Cartoon A', media: { url: 'https://example.org/a.mp4', runtime: 420 }, provider: 'Internet Archive' };
const b = { identifier: 'collection::b.mp4', title: 'Cartoon B', media: { url: 'https://example.org/b.mp4', runtime: 600 } };
const c = { identifier: 'other::c.mp4', title: 'Cartoon C', media: { url: 'https://example.org/c.mp4' } };
function select(input = {}) {
  assert.equal(typeof contract.select, 'function', 'shared guide selector must exist');
  return contract.select({ channel, powered: true, capacity: 3, ...input });
}

test('actual playback wins over a stale catalog and keeps exact file identity', () => {
  const result = select({ current: { ...a, ch: 150 }, queue: [b, c] });
  assert.equal(result.current.id, 'collection::a.mp4');
  assert.equal(result.current.title, 'Cartoon A');
  assert.equal(result.next.id, 'collection::b.mp4');
  assert.equal(result.later.id, 'other::c.mp4');
  assert.equal(result.ready, 3);
  assert.equal(result.state, 'playing');
});

test('previous-channel playback cannot be shown as the new channel current', () => {
  const result = select({ current: { ...a, ch: 11 }, queue: [b] });
  assert.equal(result.current, null);
  assert.equal(result.state, 'ready');
  assert.equal(result.next.title, 'Cartoon B');
  assert.match(contract.listing(result).now, /^UP NEXT · Cartoon B/);
});

test('unresolved metadata and duplicate/current records cannot fill the ready shelf', () => {
  const result = select({ current: { ...a, ch: 150 }, queue: [a, { ...b, media: null }, b, b, c] });
  assert.equal(result.ready, 3);
  assert.equal(result.next.id, 'collection::b.mp4');
  assert.equal(result.later.id, 'other::c.mp4');
});

test('different episodes retain independent identities despite the same display title', () => {
  const result = select({ queue: [a, { ...b, title: a.title }] });
  assert.equal(result.next.id, 'collection::a.mp4');
  assert.equal(result.later.id, 'collection::b.mp4');
});

test('a one-item catalog does not advertise its current program as Next', () => {
  const result = select({ current: { ...a, ch: 150 }, queue: [a] });
  assert.equal(result.next, null);
  assert.equal(result.ready, 1);
  assert.match(contract.listing(result).next, /PROGRAM INFORMATION PENDING/);
});

test('a live TV station name does not invent a provider schedule', () => {
  const result = select({ channel: { num: 300, nm: 'Live TV', source: 'livetv' }, live: { now: 'PBS Nature', source: 'FAST' } });
  assert.equal(result.live, true);
  assert.equal(result.current.title, 'PBS Nature');
  assert.equal(result.next, null);
  assert.equal(result.ready, null);
  assert.equal(result.remainingSeconds, null);
  assert.match(contract.listing(result).next, /PROGRAM INFORMATION UNAVAILABLE/);
});

test('weather and radio describe their live service without fake episodes', () => {
  for (const [source, title] of [['weather', 'Current conditions & forecast'], ['liveradio', 'Station directory'], ['sports', 'Scores & live coverage']]) {
    const result = select({ channel: { num: 950, nm: source, source } });
    assert.equal(result.current.title, title);
    assert.equal(result.next, null);
  }
});

test('powered-off snapshots expose standby instead of stale playback', () => {
  const result = select({ powered: false, current: { ...a, ch: 150 }, queue: [b] });
  assert.equal(result.current, null);
  assert.equal(result.next, null);
  assert.equal(result.ready, 0);
  assert.equal(result.state, 'standby');
});

test('unknown or invalid durations and playheads remain unknown', () => {
  for (const duration of [null, '', -1, Infinity, NaN, true, 'PT10M']) {
    const result = select({ current: { ...a, media: null, duration, ch: 150 }, position: { currentTime: 10 } });
    assert.equal(result.current.durationSeconds, null);
    assert.equal(result.remainingSeconds, null);
  }
  for (const time of [null, '', -1, Infinity, NaN, true, 999]) {
    assert.equal(select({ current: { ...a, ch: 150 }, position: { currentTime: time } }).remainingSeconds, null);
  }
});

test('remaining time uses the real matching playhead and preserves zero at the end', () => {
  assert.equal(select({ current: { ...a, ch: 150 }, position: { currentTime: 120 } }).remainingSeconds, 300);
  assert.equal(select({ current: { ...a, ch: 150 }, position: { currentTime: 420 } }).remainingSeconds, 0);
  assert.equal(select({ queue: [a], position: { currentTime: 120 } }).remainingSeconds, null);
});

test('snapshots do not mutate queue, source cursor, media, or program records', () => {
  const input = { current: { ...a, ch: 150 }, queue: [a, b, c], cursor: 2 };
  const before = JSON.stringify(input);
  const snapshot = select(input);
  snapshot.next.title = 'Changed copy';
  assert.equal(JSON.stringify(input), before);
});

test('an empty or missing channel returns a usable pending/standby result', () => {
  const pending = select();
  assert.equal(pending.state, 'pending');
  assert.equal(pending.ready, 0);
  assert.match(contract.listing(pending).now, /PROGRAM INFORMATION PENDING/);
  assert.equal(select({ channel: null }).state, 'standby');
});
