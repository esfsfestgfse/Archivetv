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

test('Hard Count accepts individual landscape Super Bowl spots, with original airing years', () => {
  const api = require('../assets/commercial-scheduler.js');
  assert.equal(api.isSuperBowlChannel({ num: 51 }), true);
  assert.equal(api.isSuperBowlChannel({ num: 50, cat: 'SPORTS' }), false);
  const parent = { identifier: 'apple-super-bowl-1984-commercial', title: 'Apple Super Bowl 1984 Commercial', year: 2006 };
  const metadata = { files: [{ name: 'apple1984.mp4', format: 'h.264', length: '61.89', width: 320, height: 240 }] };
  const [spot] = api.superBowlFiles(parent, metadata);
  assert.equal(spot.identifier, 'apple-super-bowl-1984-commercial::apple1984.mp4');
  assert.equal(spot.year, 1984, 'upload date must not move a classic spot into the 2000s');
  for (const title of ['Super Bowl Commercial Review', 'Super Bowl Commercial Remake', 'Super Bowl Full Game with Commercials', 'Super Bowl Commercial Podcast', 'Fake Super Bowl Commercial', 'Super Bowl Commercial AI Generated']) {
    assert.deepEqual(api.superBowlFiles({ ...parent, title }, metadata), [], title);
  }
  for (const file of [
    { ...metadata.files[0], length: '1800' },
    { ...metadata.files[0], width: 240, height: 320 },
    { ...metadata.files[0], width: 0, height: 0 },
    { ...metadata.files[0], name: 'radio.mp3' }
  ]) assert.deepEqual(api.superBowlFiles(parent, { files: [file] }), []);
  const bundled = api.superBowlFiles({ identifier: 'super-bowl-ads-2021', title: 'Super Bowl LV Commercials (2021)' }, {
    files: [{ ...metadata.files[0], name: 'Brand A.mp4' }, { ...metadata.files[0], name: 'Brand B.mp4' }, { ...metadata.files[0], name: 'Brand A.ia.mp4', original: 'Brand A.mp4' }]
  });
  assert.equal(bundled.length, 2, 'expand individual spots, not duplicate encodes');
  assert.ok(bundled.every(x => x.year === 2021));
  for (const name of ['Fake Super Bowl Ad.mp4', 'Rejected Super Bowl Commercial.mp4', 'AI Generated Super Bowl Ad.mp4', 'Fan Made Super Bowl Ad.mp4', 'Fake_Super_Bowl_Ad.mp4', 'Rejected_Super_Bowl_Ad.mp4', 'AI_Generated_Super_Bowl_Ad.mp4', 'Fan_Made_Super_Bowl_Ad.mp4']) {
    assert.deepEqual(api.superBowlFiles({ identifier: 'super-bowl-ads', title: 'Super Bowl Commercials' }, { files: [{ ...metadata.files[0], name }] }), [], name);
  }
});

test('Hard Count Super Bowl discovery spans classic and modern eras without generic-ad fallback', () => {
  const api = require('../assets/commercial-scheduler.js');
  const queries = api.superBowlQueries();
  assert.ok(queries.length >= 5);
  assert.ok(queries.some(q => q.includes('1980 TO 1989')));
  assert.ok(queries.some(q => q.includes('2020 TO 2026')));
  assert.ok(queries.every(q => q.includes('mediatype:movies') && q.includes('super bowl') && q.includes('commercial') && q.includes('podcast')));
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
  test(file + ': Hard Count preloads dedicated spots, bypasses generic bumpers, and rotates after playback', async () => {
    const h = engine(file, { curNum: 51, bumperOn: true,
      pickFromQueries: async () => { throw new Error('generic bumper must not replace a Super Bowl spot'); } });
    const ch = { num: 51, nm: 'Hard Count', cat: 'SPORTS' };
    // Network discovery is independent of loading a proven seed.
    h.scope.refreshSuperBowlAds = () => Promise.resolve();
    const first = await h.scope.warmAd(ch);
    assert.ok(first && first.item && first.playable, 'a verified Super Bowl seed is prepared');
    assert.equal(first.playable.type, 'video');
    assert.ok(first.playable.runtime >= 10 && first.playable.runtime <= 125);
    assert.ok(first.playable.width >= first.playable.height);
    assert.match(first.item.title, /super bowl/i);
    h.scope.adQueue = 1;
    assert.equal(await h.scope.nextAd(ch, {}, 7), true);
    const played = h.events.find(x => Array.isArray(x) && x[0] === 'play')[1];
    assert.equal(played.adMaxMs, Math.min(128000, first.playable.runtime * 1000 + 2000), 'the complete verified spot fits within a bounded break');
    const second = await h.scope.warmAd(ch);
    assert.notEqual(second.item.identifier, first.item.identifier, 'a viewed spot does not reopen');
    h.scope.adsOn = false;
    h.scope.adQueue = 1;
    assert.equal(await h.scope.nextAd(ch, {}, 7), false);
  });
  test(file + ': cold break fails open without discovery or resolver work at EOF', async () => {
    const h = engine(file); h.scope.adQueue = 1;
    assert.equal(await h.scope.nextAd({ num: 10 }, {}, 7), false);
    assert.deepEqual(h.events, []);
  });
  test(file + ': expired ad cooldowns cannot strand Hard Count on the first two broken seeds', async () => {
    let now = Date.now();
    const h = engine(file, { Date: class extends Date { static now() { return now; } }, curNum: 51, bumperOn: false, playFile: async () => false });
    h.scope.refreshSuperBowlAds = () => Promise.resolve();
    const ch = { num: 51, cat: 'SPORTS', nm: 'Hard Count' }, ids = [];
    for (let i = 0; i < 6; i++) {
      const ready = await h.scope.warmAd(ch); ids.push(ready.item.identifier);
      h.scope.adQueue = 1; await h.scope.nextAd(ch, {}, 7);
      now += 2 * 3600e3;
    }
    assert.equal(new Set(ids).size, 6, 'attempt rotation survives long programmes and failed playback');
  });
  test(file + ': prepared ad plays once, never crosses video/audio boundaries or runs after power-off', async () => {
    const h = engine(file), ch = { num: 10, cat: 'TV', nm: 'Classic TV' };
    h.scope.warmAd = () => Promise.resolve(null);
    h.scope.adWarm[h.scope.adWarmKey(ch)] = { item: { identifier: 'ready', title: 'Ready ad', year: 1985 }, playable: { type: 'video', url: 'https://example.org/ad.mp4' } };
    h.scope.adQueue = 1; assert.equal(await h.scope.nextAd(ch, {}, 7), true);
    assert.equal(h.events.filter(x => Array.isArray(x) && x[0] === 'play').length, 1);
    assert.equal(h.events.find(x => Array.isArray(x) && x[0] === 'play')[1].adMaxMs, 60000, 'other stations retain the original cap');
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
