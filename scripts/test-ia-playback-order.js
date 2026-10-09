const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');
const { rotationContext } = require('./ia-storage-test-helper');
const root = path.join(__dirname, '..');
function runtime(search = '?iaRepair=1', pilot = '', castConnected) {
  const scope = { window: { __rsCastIsConnected: castConnected }, URLSearchParams, location: { search }, document: { querySelector: () => pilot ? { content: pilot } : null }, Date, Promise, setTimeout, clearTimeout };
  vm.createContext(scope);
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/ia-playback-shelf.js'), 'utf8'), scope);
  return scope.window.RealSignalIAShelf;
}
const item = id => ({ identifier: id, title: id, media: { type: 'video', url: 'https://archive.org/download/series/' + id + '.mp4' } });

test('partial production release activates only certified channels and keeps rollback available', () => {
  const pilot = runtime('', '10,150');
  assert.equal(pilot.enabledForChannel('10'), true);
  assert.equal(pilot.enabledForChannel(150), true);
  for (const channel of ['19', '56', '77', '132', '200', '702', '911']) assert.equal(pilot.enabledForChannel(channel), false);
  assert.equal(runtime('?iaRepair=0', '10,150').enabledForChannel(10), false);
  assert.equal(runtime('').enabledForChannel(10), false, 'mobile with no promotion manifest retains legacy playback');
  assert.equal(runtime('?iaRepair=1').enabledForChannel(77), true, 'explicit local canary still tests unpromoted lanes');
  assert.equal(runtime('?castReceiver=1', '10,150').enabledForChannel(10), false, 'Cast remains on its separately certified protocol');
});

test('Cast connection dynamically returns promoted senders to legacy playback', () => {
  let connected = false;
  const pilot = runtime('', '10,150', () => connected);
  assert.equal(pilot.enabledForChannel(10), true);
  connected = true;
  assert.equal(pilot.enabledForChannel(10), false);
  assert.equal(pilot.enabledForChannel(150), false);
  connected = false;
  assert.equal(pilot.enabledForChannel(10), true);
  assert.equal(runtime('?iaRepair=1', '', () => true).enabledForChannel(10), false);
});

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) test(file + ': weak and non-IA stations cannot enter the promoted playback path', () => {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const scope = { window: { RealSignalIAShelf: runtime('', '10,150') } };
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf('function iaRepairEnabled('), source.indexOf('\n', source.indexOf('function iaRepairEnabled('))), scope);
  assert.equal(scope.iaRepairEnabled({ num: 10 }), true);
  assert.equal(scope.iaRepairEnabled({ num: 77 }), false);
  assert.equal(scope.iaRepairEnabled({ num: 10, source: 'ok' }), false);
});

test('guide, Next and EOF use the same first reservation without consuming it on preload', async () => {
  const events = [], api = runtime().create({ queue: async () => ({ items: [item('A'), item('B'), item('C')] }), report: async event => events.push(event) });
  await api.reserve('10', {});
  assert.equal(api.peek('10').identifier, 'A');
  assert.equal(api.peek('10').identifier, 'A');
  assert.equal(events.length, 0);
  await api.event('10', item('A'), 'started');
  assert.equal(api.peek('10').identifier, 'B');
  await api.event('10', item('A'), 'completed');
  assert.equal(api.peek('10').identifier, 'B');
  await api.reserve('10', {});
  assert.equal(api.peek('10').identifier, 'B', 'a late/stale shelf must not restore A');
});

test('fast skip cannot outrun the started commit; queue prepares no watched events', async () => {
  const order = []; let resolve;
  const api = runtime().create({ queue: async () => { order.push('queue'); return { items: [item('A'), item('B')] }; }, report: async event => { order.push(event.event); if (event.event === 'started') await new Promise(r => { resolve = r; }); } });
  await api.reserve('10', {});
  const started = api.event('10', item('A'), 'started');
  await new Promise(setImmediate);
  const skipped = api.event('10', item('A'), 'skipped');
  const refill = api.reserve('10', {});
  assert.equal(api.peek('10').identifier, 'B');
  resolve(); await Promise.all([started, skipped, refill]);
  assert.deepEqual(order, ['queue', 'started', 'skipped', 'queue']);
});

test('retry an acknowledgement without losing it; released failures cannot be reused', async () => {
  let reports = 0;
  const api = runtime().create({ queue: async () => ({ items: [item('A'), item('B')] }), report: async () => { if (++reports === 1) throw Error('temporary'); } });
  await api.reserve('10', {});
  await api.event('10', item('A'), 'failed');
  await api.reserve('10', {});
  assert.equal(reports, 2); assert.equal(api.peek('10').identifier, 'B');
});

test('failed acknowledgements remain queued for the next refill attempt', async () => {
  let online = false, reports = 0;
  const api = runtime().create({ queue: async () => ({ items: [item('A'), item('B')] }), report: async () => { reports++; if (!online) throw Error('offline'); } });
  await api.reserve('10', {});
  await assert.rejects(api.event('10', item('A'), 'started'));
  online = true;
  await api.reserve('10', {});
  assert.equal(reports, 3); assert.equal(api.peek('10').identifier, 'B');
});

test('delayed preload cannot strand the first reservation after genuine catalog exhaustion', async () => {
  const { SessionRotation } = await import(pathToFileURL(path.join(root, 'realsignal_api_rotation.js')));
  const rotation = new SessionRotation(rotationContext(), {});
  const select = async body => (await rotation.fetch(new Request('https://rotation.internal/select', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))).json();
  let delay = false, release;
  const shelf = runtime().create({ queue: async () => {
    if (delay) await new Promise(resolve => { release = resolve; });
    const r = await select({ mode: 'reserve', items: [item('A'), item('B')] });
    return { items: r.items, v2: { cycleReset: r.cycleReset, cycleGeneration: r.cycleGeneration } };
  }, report: event => select({ mode: event.event === 'failed' ? 'release' : 'commit', id: event.id, event: event.event }) });
  await shelf.reserve('10', {}); await shelf.event('10', item('A'), 'started');
  delay = true; const preload = shelf.reserve('10', {}); await new Promise(setImmediate);
  await shelf.event('10', item('A'), 'skipped'); await shelf.event('10', item('B'), 'started');
  delay = false; release(); await preload; await shelf.event('10', item('B'), 'completed');
  await shelf.reserve('10', {});
  assert.equal(shelf.peek('10')?.identifier, 'A', 'server reservation A must not be permanently masked by an earlier client revision');
});

test('an acknowledged skip in the newer cycle cannot be resurrected by a delayed preload', async () => {
  let calls = 0, generation = 0, release;
  const shelf = runtime().create({ queue: async () => ++calls === 1 ? { items: [item('A'), item('B')], v2: { cycleGeneration: 0 } } : new Promise(resolve => { release = resolve; }),
    report: async () => ({ cycleGeneration: generation }) });
  await shelf.reserve('10', {}); await shelf.event('10', item('A'), 'skipped');
  const preload = shelf.reserve('10', {}); await new Promise(setImmediate);
  generation = 1; await shelf.event('10', item('A'), 'skipped');
  release({ items: [item('A'), item('B')], v2: { cycleReset: true, cycleGeneration: 1 } });
  await preload;
  assert.equal(shelf.peek('10').identifier, 'B', 'resetting an old removal must preserve actions acknowledged in the new cycle');
});

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) test(file + ': superseded tune never plays and guide reads the same reservation', async () => {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const pending = runtime().create({ queue: async () => ({ items: [item('A'), item('B')] }), report: async () => {} });
  let resolve, starts = 0;
  const scope = { window: { RealSignalIAShelf: { enabled: true, client: () => pending } }, powered: true, token: 1, curNum: 10,
    iaQueueKey: ch => String(ch.num), iaQueueQueries: () => [], iaProgramThemeTerms: () => [], iaProgramDenyTerms: () => [], iaQueueDiversity: () => ({}), iaDisplayTitle: it => it.title,
    nlog: () => {}, iaRetry: () => assert.fail('unexpected retry'), playFile: async () => { starts++; return true; }, Promise };
  vm.createContext(scope);
  const begin = source.indexOf('function iaRepairEnabled('), end = source.indexOf('async function tuneIA(ch,sl,my)', begin);
  vm.runInContext(source.slice(begin, end), scope);
  scope.window.RealSignalIAShelf.client = () => ({ peek: () => null, reserve: () => new Promise(r => { resolve = r; }) });
  const tune = scope.tuneIARepair({ num: 10 }, {}, 1);
  scope.token = 2; scope.curNum = 11; resolve(); await tune; assert.equal(starts, 0);
  scope.curNum = 10; scope.window.RealSignalIAShelf.client = () => pending;
  await pending.reserve('10', {});
  const guideStart = source.indexOf('function guideQueueItems('), guideEnd = source.indexOf('function guideFamilyLabel(', guideStart);
  vm.runInContext(source.slice(guideStart, guideEnd), scope);
  assert.equal(scope.guideQueueNext({ num: 10 }, {}, null).identifier, 'A');
  await pending.event('10', item('A'), 'started');
  assert.equal(scope.guideQueueNext({ num: 10 }, {}, item('A')).identifier, 'B');
});

test('a superseded tune cannot publish its later success or recover into the new channel', () => {
  const api = runtime(); let token = 1, recoveries = 0;
  const life = api.lifecycle(() => token === 1, () => recoveries++);
  token = 2;
  assert.equal(life.start(), false); assert.equal(life.fail(), false); assert.equal(recoveries, 0);
});

test('a real error after the first frame triggers exactly one recovery', () => {
  const api = runtime(); let recovered = 0;
  const life = api.lifecycle(() => true, () => recovered++);
  assert.equal(life.start(), true);
  assert.equal(life.fail(), true); assert.equal(life.fail(), false); assert.equal(recovered, 1);
});

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) test(file + ': guide reads selected-file duration and commercials retain their identity', () => {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const scope = { guideDurationLabel: seconds => String(seconds), curItem: null, markSeen() {}, iaRepairEnabled: () => true, iaRepairEvent() {}, iaReportPlayed() {}, updateCCBtn() {} };
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf('function guideItemRuntime('), source.indexOf('\n', source.indexOf('function guideItemRuntime('))), scope);
  assert.equal(scope.guideItemRuntime({ media: { runtime: 1514 } }), '1514');
  const begin = source.indexOf('function setCurItem('), end = source.indexOf('/* ---------- buffering spinner', begin);
  vm.runInContext(source.slice(begin, end), scope);
  scope.setCurItem({ id: 'ad', isAd: true, type: 'video' }, { num: 10, nm: 'TV' }, {});
  assert.equal(scope.curItem.isAd, true);
  scope.setCurItem({ id: 'episode', runtime: 1514, type: 'video', isAd: true }, { num: 10, nm: 'TV' }, {});
  assert.equal(scope.guideItemRuntime(scope.curItem), '1514');
});

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  test(file + ': rollback of an old staged player cannot replace a newer committed player', () => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const video = () => ({ tagName: 'VIDEO', pause() {}, removeAttribute() {}, load() {}, remove() {} });
    const original = video(), scope = { theVideo: original, videoCtl: null, AbortController, document: { createElement: video } };
    vm.createContext(scope);
    vm.runInContext(source.slice(source.indexOf('function acquireVideo('), source.indexOf('function unlockMedia(')), scope);
    const old = scope.acquireVideo(null, true), newer = scope.acquireVideo(null, true);
    newer.commit(); old.rollback();
    assert.equal(scope.theVideo, newer.v);
  });

  test(file + ': a stalled canary origin tries the same-program alternate within a bounded startup', async () => {
    const source = fs.readFileSync(path.join(root, file), 'utf8'), timers = [], handlers = {};
    const video = { tagName: 'VIDEO', style: {}, classList: { toggle() {} }, pause() {}, removeAttribute() {}, load() {}, remove() {}, setAttribute() {}, play: () => Promise.resolve(), addEventListener: (type, fn) => { handlers[type] = fn; } };
    const scope = { window: { RealSignalIAShelf: runtime() }, document: { createElement: () => video, body: { classList: { contains: () => false } } },
      theVideo: video, videoCtl: null, AbortController, curVideo: null, screenArea: { innerHTML: '', appendChild() {} },
      iaRepairEnabled: () => true, takeIAMediaWarmer: () => null, killMedia() {}, nlog() {}, token: 1, powered: true, curNum: 10,
      soundBlocked: false, muted: false, vol: 0.5, lastGesture: Date.now(), Date,
      setTimeout: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clearTimeout() {} };
    vm.createContext(scope);
    vm.runInContext(source.slice(source.indexOf('function acquireVideo('), source.indexOf('function unlockMedia(')), scope);
    vm.runInContext(source.slice(source.indexOf('function playFile('), source.indexOf('function showNow(')), scope);
    const pending = scope.playFile({ type: 'video', url: 'https://archive.org/download/series/episode.mp4', alts: ['https://ia800001.us.archive.org/12/items/series/episode.mp4'] }, { num: 10 }, {}, 1, 0);
    assert.ok(timers[0].ms <= 4000, 'a stalled origin must not hold Next for twelve seconds');
    timers[0].fn();
    assert.match(video.src, /ia800001/);
    timers[1].fn();
    assert.equal(await pending, false, 'exhaustion is bounded, not a reconnecting loop');
  });
}
