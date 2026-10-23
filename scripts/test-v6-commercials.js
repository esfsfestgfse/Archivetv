const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');

function policy() {
  const file = path.join(root, 'assets/commercial-scheduler.js');
  assert.ok(fs.existsSync(file), 'shared commercial policy must exist');
  const data = new Map();
  const store = { get: (key, fallback) => data.get(key) || fallback, set: (key, value) => data.set(key, value) };
  const api = require(file);
  return { api: api.create(store), reload: () => api.create(store) };
}
test('short cartoons accrue a 25-minute block, persisted independently per channel', () => {
  const p = policy(), ch = { num: 150, cat: 'TOON' };
  assert.equal(p.api.due(ch, 420), false);
  assert.equal(p.api.due(ch, 420), false);
  assert.equal(p.reload().due(ch, 420), false);
  assert.equal(p.reload().due(ch, 420), true);
  assert.equal(p.api.due({ num: 705, cat: 'TOON' }, 420), false);
});
test('movie/TV boundaries are eligible, while provider-native and commercial channels never stack ads', () => {
  const p = policy();
  assert.equal(p.api.due({ num: 200, cat: 'FILM' }, 7200), true);
  assert.equal(p.api.due({ num: 10, cat: 'TV' }, 1320), true);
  for (const ch of [{ source: 'livetv' }, { source: 'radio' }, { gl: 'commercials' }]) assert.equal(p.api.due(ch, 7200), false);
});
test('ad choice rotates independent item and era history only after visible playback', () => {
  const p = policy(), items = [{ identifier: 'A', year: 1985 }, { identifier: 'B', year: 1995 }, { identifier: 'C', year: 1986 }];
  assert.equal(p.api.choose(items).identifier, 'A');
  assert.equal(p.api.choose(items).identifier, 'A', 'preparing does not mark an ad watched');
  p.api.remember(items[0]);
  assert.equal(p.reload().choose(items).identifier, 'B');
  p.api.remember(items[1]);
  assert.equal(p.reload().choose(items).identifier, 'C', 'unseen ads precede repeats');
});

function engine(file, overrides = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const start = source.indexOf('/* ===== commercial breaks:');
  const end = source.indexOf('/* Station Bumpers', start);
  const events = [], saved = new Map();
  const scope = { console, Date, Math, Promise, URLSearchParams, location: { search: '' }, token: 7, powered: true,
    store: { get: (key, fallback) => saved.get(key) || fallback, set: (key, value) => saved.set(key, value) },
    programPhrase: x => '"' + x + '"',
    setTimeout: () => 1, clearTimeout() {},
    pickIA: async () => { events.push('discovery'); return { identifier: 'cold', title: 'cold' }; },
    resolvePlayable: async () => { events.push('resolve'); return { type: 'video', url: 'https://example.org/ad.mp4' }; },
    withTO: p => p, playFile: async item => { events.push(['play', item]); return true; }, ...overrides };
  scope.window = scope; vm.createContext(scope);
  const policyFile = path.join(root, 'assets/commercial-scheduler.js');
  if (fs.existsSync(policyFile)) vm.runInContext(fs.readFileSync(policyFile, 'utf8'), scope);
  vm.runInContext(source.slice(start, end), scope);
  return { scope, events, source };
}
for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  test(file + ': cold break fails open without discovery or resolver work at EOF', async () => {
    const h = engine(file); h.scope.adQueue = 1;
    assert.equal(await h.scope.nextAd({ num: 10 }, {}, 7), false);
    assert.deepEqual(h.events, []);
  });
  test(file + ': prepared ad plays once, never crosses video/audio boundaries or runs after power-off', async () => {
    const h = engine(file), ch = { num: 10, cat: 'TV', nm: 'Classic TV' };
    h.scope.warmAd = () => Promise.resolve(null);
    h.scope.adWarm[h.scope.adWarmKey(ch)] = { item: { identifier: 'ready', title: 'Ready ad', year: 1985 }, playable: { type: 'video', url: 'https://example.org/ad.mp4' } };
    h.scope.adQueue = 1; assert.equal(await h.scope.nextAd(ch, {}, 7), true);
    assert.equal(h.events.filter(x => Array.isArray(x) && x[0] === 'play').length, 1);
    assert.ok(!h.events.includes('discovery'));
    h.events.length = 0; h.scope.powered = false; h.scope.adQueue = 1;
    assert.equal(await h.scope.nextAd(ch, {}, 7), false); assert.deepEqual(h.events, []);
    h.scope.powered = true;
    h.scope.adWarm[h.scope.adWarmKey(ch)] = { item: { identifier: 'wrong' }, playable: { type: 'audio', url: 'https://example.org/ad.mp3' } };
    h.scope.adQueue = 1; assert.equal(await h.scope.nextAd(ch, {}, 7), false);
    assert.deepEqual(h.events, []);
  });
  test(file + ': ended program cache is cleared before a break can return early', async () => {
    const h = engine(file), calls = [];
    Object.assign(h.scope, { it: {}, my: 7, ch: { num: 10, nm: 'Classic TV' }, sl: {}, sig: {}, curNum: 10,
      curVideo: { duration: 1320 }, bumperOn: false, totalMs: 0,
      resetProgress() {}, iaRepairEnabled: () => false,
      shouldInsertAdBreak: () => true,
      schedClear: ch => calls.push(['schedule-clear', ch.num]),
      fastTuneDrop: n => calls.push(['drop', n]),
      playAdBreak: async () => { calls.push(['break']); return true; },
      tuneNum: n => calls.push(['tune', n]),
      v: { addEventListener: (type, fn) => { h.scope.ended = fn; } } });
    const from = h.source.indexOf('v.addEventListener("ended",async');
    const to = h.source.indexOf('/* buffering / stall handling', from);
    vm.runInContext(h.source.slice(from, to), h.scope);
    await h.scope.ended();
    assert.deepEqual(calls.slice(0, 3), [['schedule-clear',10],['drop',10],['break']]);
  });
}
