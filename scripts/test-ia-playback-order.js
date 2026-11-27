const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');
const { rotationContext } = require('./ia-storage-test-helper');
const root = path.join(__dirname, '..');

function readyVideoFixture(file) {
  const handlers = {}, timers = [], frames = [];
  const video = { tagName: 'VIDEO', videoWidth: 640, videoHeight: 480, duration: 1800, style: {},
    classList: { toggle() {} }, pause() {}, load() {}, remove() {}, removeAttribute() {}, setAttribute() {},
    play: () => Promise.resolve(), addEventListener: (type, fn) => { handlers[type] = fn; } };
  const scope = { window: {}, document: { createElement: () => video, body: { classList: { contains: () => false } } },
    theVideo: video, videoCtl: null, curVideo: null, AbortController, Date, token: 1, powered: true, curNum: 10,
    screenArea: { innerHTML: '', appendChild(v) { v.parentNode = this; } }, audioScreen: { classList: { add() {}, remove() {} } },
    bug: { classList: { remove() {} } }, V2_PREVIEW_PROFILES: { proof: {} }, v2CanPrepareYouTube: () => false,
    iaRepairEnabled: () => false, takeIAMediaWarmer: () => null, killMedia() {}, nlog() {}, hideOv() {}, hideBuffer() {},
    setSig() {}, clearStall() {}, setCurItem() {}, attachCaptions() {}, showNow() {}, muted: false, vol: 0.5,
    lastGesture: Date.now(), requestAnimationFrame: fn => { frames.push(fn); },
    setTimeout: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; }, clearTimeout() {} };
  const source = fs.readFileSync(path.join(root, file), 'utf8'); vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf('function acquireVideo('), source.indexOf('function unlockMedia(')), scope);
  vm.runInContext(source.slice(source.indexOf('function playFile('), source.indexOf('function showNow(')), scope);
  return { scope, video, handlers, timers, frames,
    start: () => scope.playFile({ type: 'video', id: 'ready-program', url: 'https://archive.org/download/series/episode.mp4' }, { num: 10, source: 'v2preview', previewKey: 'proof' }, {}, 1, 0) };
}

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  test(file + ': a decoded current picture is revealed without waiting on throttled animation frames', async () => {
    const h = readyVideoFixture(file), pending = h.start();
    assert.equal(h.video.style.opacity, '0', 'unready media stays hidden');
    h.handlers.playing(); assert.equal(await pending, true);
    assert.equal(h.scope.curVideo, h.video);
    assert.equal(h.video.style.opacity, '1', 'a decoded picture must not wait for two animation callbacks');
  });
  test(file + ': superseded or audio-only candidates stay hidden', async () => {
    const stale = readyVideoFixture(file), pending = stale.start(); stale.scope.token = 2; stale.handlers.playing();
    assert.equal(stale.video.style.opacity, '0'); stale.timers[0].fn(); assert.equal(await pending, false);
    const audio = readyVideoFixture(file); audio.video.videoWidth = 0; const audioPending = audio.start(); audio.handlers.playing();
    assert.equal(audio.video.style.opacity, '0'); audio.timers.find(timer => timer.ms === 500).fn(); assert.equal(await audioPending, false);
    assert.equal(audio.video.style.opacity, '0');
  });
}
function runtime(search = '?iaRepair=1', pilot = '', castConnected, localStorage, clock = Date, iaViewerRecentIds) {
  const scope = { window: { __rsCastIsConnected: castConnected }, URL, URLSearchParams, location: { search }, document: { querySelector: () => pilot ? { content: pilot } : null }, Date:clock, localStorage, iaViewerRecentIds, Promise, setTimeout, clearTimeout };
  vm.createContext(scope);
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/ia-playback-shelf.js'), 'utf8'), scope);
  return scope.window.RealSignalIAShelf;
}
test('same-file fallback restores an Archive download URL for a precise reserved file only', () => {
  const make = (identifier, url) => ({ identifier, media: { url } });
  const alternate = runtime().sameFileAlternate;
  const primary = 'https://dn600301.us.archive.org/0/items/series/Season%201/Pilot.mp4';
  assert.equal(alternate(make('series::Season 1/Pilot.mp4', primary)), 'https://archive.org/download/series/Season%201/Pilot.mp4');
  assert.equal(alternate(make('series::Season 1/Other.mp4', primary)), '');
  assert.equal(alternate(make('series::Pilot.mp4', 'https://other.example/0/items/series/Pilot.mp4')), '');
  assert.equal(alternate(make('series', primary)), '');
  assert.equal(alternate(make('series::Season 1/Pilot.mp4', 'https://archive.org/download/series/Season%201/Pilot.mp4')), '');
});

const item = id => ({ identifier: id, title: id, media: { type: 'video', url: 'https://archive.org/download/series/' + id + '.mp4' } });

for(const file of ['the_dial_desktop.html','the_dial_mobile.html'])test(file+': video playback cannot reuse the audio-only player left by a music channel',()=>{
 const media=tagName=>({tagName,pause(){},removeAttribute(){},load(){},remove(){}}),audio=media('AUDIO'),video=media('VIDEO');
 const source=fs.readFileSync(path.join(root,file),'utf8'),scope={theVideo:audio,videoCtl:null,AbortController,document:{createElement:tag=>{assert.equal(tag,'video');return video;}}};
 vm.createContext(scope);vm.runInContext(source.slice(source.indexOf('function acquireVideo('),source.indexOf('function unlockMedia(')),scope);
 const next=scope.acquireVideo(null,false);assert.equal(next.v,video);assert.equal(scope.theVideo,video);
 const warmed=media('AUDIO');assert.equal(scope.acquireVideo(warmed,false).v,warmed,'explicitly warmed audio remains usable on its own channel');
 assert.equal(scope.acquireVideo(null,false).v,video,'returning to video cannot inherit the warmed audio tag');
});

test('partial production release activates only certified channels and keeps rollback available', () => {
  const pilot = runtime('', '10,12,150');
  assert.equal(pilot.enabledForChannel('10'), true);
  assert.equal(pilot.enabledForChannel('12'), true);
  assert.equal(pilot.enabledForChannel(150), true);
  for (const channel of ['19', '56', '77', '132', '200', '702', '911']) assert.equal(pilot.enabledForChannel(channel), false);
  assert.equal(runtime('?iaRepair=0', '10,12,150').enabledForChannel(10), false);
  assert.equal(runtime('').enabledForChannel(10), false, 'mobile with no promotion manifest retains legacy playback');
  assert.equal(runtime('?iaRepair=1').enabledForChannel(77), true, 'explicit local canary still tests unpromoted lanes');
  assert.equal(runtime('?castReceiver=1', '10,12,150').enabledForChannel(10), false, 'Cast remains on its separately certified protocol');
});

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) test(file + ': promotes repaired IA stations and the modern game-show split', () => {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const content = source.match(/<meta name="realsignal-ia-repair-channels" content="([^"]+)">/)?.[1];
  const pilot = runtime('', content);
  for (const channel of ['10', '11', '12', '22', '53', '77', '150', '216', '705', '903']) assert.equal(pilot.enabledForChannel(channel), true);
});

test('a full rollout fallback keeps channel ownership until the next eligible tune', () => {
  let now = 100000;
  const api = runtime('', '*', undefined, undefined, { now: () => now });
  assert.equal(api.enabledForChannel(216), true);
  assert.equal(api.fallbackForChannel('216'), true);
  assert.equal(api.enabledForChannel(216), false);
  assert.equal(api.enabledForChannel(150), true);
  now += 61000;
  assert.equal(api.enabledForChannel(216), false, 'a playing fallback does not switch owners mid-program');
  api.beginTune(216);
  assert.equal(api.enabledForChannel(216), true);
  assert.equal(runtime('?iaRepair=0', '*').enabledForChannel(216), false);
  assert.equal(runtime('?castReceiver=1', '*').enabledForChannel(216), false);
});

test('Cast connection dynamically returns promoted senders to legacy playback', () => {
  let connected = false;
  const pilot = runtime('', '10,12,150', () => connected);
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
  const scope = { window: { RealSignalIAShelf: runtime('', '10,12,150') } };
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf('function iaRepairEnabled('), source.indexOf('\n', source.indexOf('function iaRepairEnabled('))), scope);
  assert.equal(scope.iaRepairEnabled({ num: 10 }), true);
  assert.equal(scope.iaRepairEnabled({ num: 12 }), true);
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

test('a hydrating refill preserves playable reservations from the same cycle', async () => {
  const rows = [[item('started'), item('next')], [], [item('replacement')]];
  const shelf = runtime().create({
    queue: async () => ({items:rows.shift(), hydrating:true, v2:{cycleGeneration:0}}),
    report: async () => ({cycleGeneration:0})
  });
  await shelf.reserve('10', {});
  await shelf.event('10', item('started'), 'started');
  await shelf.reserve('10', {});
  assert.equal(shelf.peek('10')?.identifier, 'next');
  await shelf.reserve('10', {});
  assert.equal(shelf.peek('10')?.identifier, 'replacement');
});

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) test(file + ': stage the next reservation before waiting for a refill', async () => {
  const source = fs.readFileSync(path.join(root,file),'utf8');
  const candidate=item('ready-next'), calls=[];
  let refill;
  const ready = {peek:()=>candidate, rows:()=>[candidate,item('ready-spare')], reserve:()=>{calls.push('refill'); return new Promise(resolve=>{refill=resolve;});}};
  const scope={ powered:true,token:3,curNum:10,iaRepairEnabled:()=>true,iaRepairBody:()=>({}),
    iaQueueKey:()=> '10',iaWarmWanted:{}, Date,
    stageIAMediaWarmer:(_ch,row)=>calls.push(row.identifier),
    window:{RealSignalIAShelf:{client:()=>ready}},nlog(){} };
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf('async function preloadNext('),source.indexOf('function schedulePreload(')),scope);
  const pending=scope.preloadNext({num:10},{},3);
  assert.deepEqual(calls,['ready-next','refill']);
  refill(); await pending;
  assert.deepEqual(calls,['ready-next','refill']);
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

test('a continuing channel can apply a refill while an ordered playback report is still in transit', {timeout: 1500}, async () => {
  const calls = [], reports = [];
  let release, failTimer;
  const delayed = new Promise(resolve => { release = resolve; });
  const api = runtime('', '*').create({
    queue: async body => {
      calls.push(body);
      return calls.length === 1 ? {items:[item('A')]} :
        {items:[item('A'), item('B')], v2:{cycleGeneration:1}};
    },
    report: async packet => { reports.push(packet.event); await delayed; return {cycleGeneration:1}; },
  });
  await api.reserve('2', {});
  const started = api.event('2', item('A'), 'started');
  const skipped = api.event('2', item('A'), 'skipped');
  try {
    await Promise.race([api.reserve('2', {}), new Promise((_, reject) => {
      failTimer = setTimeout(() => reject(Error('refill was blocked by a pending playback report')), 1000);
    })]);
    assert.deepEqual(Array.from(calls[1].pendingPlaybackIds), ['A']);
    assert.equal(api.peek('2').identifier, 'B', 'a stale generation cannot make the pending program play again');
    assert.deepEqual(reports, ['started']);
  } finally {
    clearTimeout(failTimer);
    release();
    await Promise.all([started, skipped]);
  }
  assert.deepEqual(reports, ['started', 'skipped']);
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

test('a reopened viewer acknowledges a decoded start lost on tab close before reserving again', async () => {
  const data = new Map(), online = { value: false }, seen = new Set(), calls = [];
  const journal = { load: key => data.get(key) || [],
    add: (key, packet) => data.set(key, [...(data.get(key) || []), packet]),
    remove: (key, packet) => data.set(key, (data.get(key) || []).filter(row => row.id !== packet.id)) };
  const options = { journal, queue: async () => { calls.push('queue'); return { items: [item('A'), item('B')].filter(row => !seen.has(row.identifier)) }; },
    report: async packet => { calls.push(packet.event); if (!online.value) throw Error('tab closed'); seen.add(packet.id); } };
  const original = runtime().create(options);
  await original.reserve('10', {});
  await assert.rejects(original.event('10', item('A'), 'started'), /tab closed/);
  online.value = true;
  const reopened = runtime().create(options);
  await reopened.reserve('10', {});
  assert.equal(reopened.peek('10').identifier, 'B');
  assert.deepEqual(calls, ['queue', 'started', 'started', 'started', 'queue']);
  assert.deepEqual(data.get('10'), [], 'only unacknowledged starts persist');
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

  for (const [hasSpare, preparedStart, listed, sports, fullRollout] of [[false,false,false], [true,false,false], [true,true,false], [true,false,true], [true,false,false,true], [true,false,false,false,true]]) test(file + (fullRollout ? ': rollout stations prepare their cold backup without a cache hit' : sports ? ': Sports Vault promotes a decoded backup on an unlisted start' : listed ? ': a listed episode gets its own alternate even when another episode is ready' : hasSpare
    ? ': a cold reserve takes over as soon as its qualified picture is ready' + (preparedStart ? ' on the prepared canary' : '')
    : ': a stalled origin can still try its alternate when no reserve is ready'), async () => {
    const source = fs.readFileSync(path.join(root, file), 'utf8'), timers = [], handlers = {};
    const video = { tagName: 'VIDEO', readyState: 0, style: {}, classList: { toggle() {} }, pause() {}, removeAttribute() {}, load() {}, remove() {}, setAttribute() {}, play: () => Promise.resolve(), addEventListener: (type, fn) => { handlers[type] = fn; } };
    const spare = { ...item('different-reserved-episode'), ...(sports ? { title: 'NBA Finals 1998 Game 6 Full Game' } : {}) }, primary = { identifier:'series::Season 1/Pilot.mp4',
      media:{ type:'video', url:'https://dn600301.us.archive.org/0/items/series/Season%201/Pilot.mp4' } };
    const channel = sports ? 53 : 11, warmer = {}, load = [], mirrorLoads = [];
    const spareVideo = Object.assign(new EventTarget(), {
      readyState: 0, videoWidth: 0, videoHeight: 0, duration: 0, src: spare.media.url,
    });
    const scope = { window: { RealSignalSports: sports ? require('../assets/sports-programs.js') : null, RealSignalIAShelf: { ...runtime(), fullRollout, tracksRoutes: () => hasSpare,
        warmMirror: (row, url) => { mirrorLoads.push(url); return { video: {}, release() {} }; },
        client: () => ({ rows: () => hasSpare ? [primary, spare] : [primary] }) } },
      iaQueueKey: ch => String(ch.num), iaMediaWarmKey: (ch, row) => ch.num + ':' + row.identifier, iaMediaWarmers: warmer, iaWarmWanted: {},
      stageIAMediaWarmer: (ch, row, media) => {
        load.push(media.url);
        const staged = warmer[ch.num + ':' + row.identifier] = { el: spareVideo, channel: String(ch.num) };
        spareVideo.addEventListener('loadeddata', () => { staged.readyOrder = 1; }, { once: true });
      },
      iaCachedProgramAllowed: () => true,
      document: { createElement: () => video, body: { classList: { contains: () => false } } },
      theVideo: video, videoCtl: null, AbortController, curVideo: null, screenArea: { innerHTML: '', appendChild() {} },
      iaRepairEnabled: () => true, takeIAMediaWarmer: () => null, killMedia() {}, nlog() {}, token: 1, powered: true, curNum: channel,
      soundBlocked: false, muted: false, vol: 0.5, lastGesture: Date.now(), Date, performance,
      setTimeout: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clearTimeout() {} };
    vm.createContext(scope);
    vm.runInContext(source.slice(source.indexOf('function acquireVideo('), source.indexOf('function unlockMedia(')), scope);
    vm.runInContext(source.slice(source.indexOf('function iaKnownVideoPolicyViolation('), source.indexOf('function iaProgramDenyTerms(')), scope);
    const repairStart = source.indexOf('function iaRepairEvent(');
    vm.runInContext(source.slice(repairStart, source.indexOf('async function tuneIA(ch,sl,my)', repairStart)), scope);
    vm.runInContext(source.slice(source.indexOf('function playFile('), source.indexOf('function showNow(')), scope);
    const handoff = { allowBuffered: !listed, listed, preparedStart };
    const pending = scope.playFile({ id: primary.identifier, title: 'NHL 1989 All Star Game Full Game', ...primary.media, runtime: 7200, width: 640, height: 480, alts: ['https://archive.org/download/series/Season%201/Pilot.mp4'] }, { num: channel }, {}, 1, 0, handoff);
    assert.ok(timers[0].ms <= (fullRollout ? 2500 : 4000), 'an unlisted slow origin has a bounded first attempt');
    assert.deepEqual(load, [], 'a fast startup should never need to load the spare');
    if (listed) {
      Object.assign(spareVideo, { readyState: 4, videoWidth: 640, videoHeight: 480, duration: 1500 });
      warmer[channel + ':' + spare.identifier] = { el: spareVideo };
      timers[0].fn();
      assert.equal(video.src, 'https://archive.org/download/series/Season%201/Pilot.mp4');
      const retry = timers.find(timer => timer.ms === 3500);
      assert.ok(retry, 'one bounded retry is made for the same file');
      retry.fn();
      assert.equal(await pending, false, 'only after both routes fail is a new episode eligible');
      return;
    }
    if (hasSpare) {
      const standby = timers.find(timer => timer.ms > 0 && timer.ms < timers[0].ms);
      assert.ok(standby, 'start preparing one spare before the primary times out');
      assert.equal(standby.ms, preparedStart || sports || fullRollout ? 500 : 1500, 'slow-start standby deadline');
      standby.fn();
      assert.deepEqual(load, [spare.media.url], 'cold power-on prepares a distinct verified episode');
      assert.deepEqual(mirrorLoads, [], 'one spare uses the whole background media budget');
      assert.equal(handoff.buffered, undefined, 'metadata alone cannot take over the player');
      Object.assign(spareVideo, { readyState: 4, videoWidth: 640, videoHeight: 480, duration: 1500 });
      spareVideo.dispatchEvent(new Event('loadeddata'));
      assert.equal(handoff.buffered?.identifier, spare.identifier, 'promote after decode without waiting for the primary timeout');
      assert.equal(await pending, false, 'the current tune uses that exact warmed element next');
      assert.equal(video.src, primary.media.url, 'take the spare before trying another route');
      return;
    }
    timers[0].fn();
    assert.equal(video.src, 'https://archive.org/download/series/Season%201/Pilot.mp4');
    assert.ok(timers[1].ms < timers[0].ms, 'an alternate cannot double the startup wait');
    timers[1].fn();
    assert.equal(await pending, false, 'exhaustion is bounded, not a reconnecting loop');
  });
}

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) for (const hasSpare of [true, false]) test(
  file + ': a failed start ' + (hasSpare ? 'tries the reserved spare before acknowledgement' : 'flushes the failure before requesting a replacement'),
  async () => {
    let acknowledge;
    const calls = [], failed = item('bad-file'), spare = item('ready-spare');
    const shelf = runtime().create({
      queue: async () => {
        calls.push('reserve');
        return { items: calls.length === 1 ? (hasSpare ? [failed, spare] : [failed]) : [spare] };
      },
      report: async event => {
        calls.push(event.event + ':' + event.id);
        if (event.event === 'failed') await new Promise(resolve => { acknowledge = resolve; });
      }
    });
    await shelf.reserve('10', {});
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const scope = { window: { RealSignalIAShelf: { enabled: true, client: () => shelf } }, powered: true, token: 1, curNum: 10,
      iaQueueKey: ch => String(ch.num), iaQueueQueries: () => [], iaProgramThemeTerms: () => [], iaProgramDenyTerms: () => [], iaQueueDiversity: () => ({}), iaDisplayTitle: it => it.title,
      nlog: () => {}, iaRetry: () => assert.fail('unexpected retry'),
      playFile: async media => { calls.push('play:' + media.id); if (media.id === failed.identifier) return false; shelf.event('10', media, 'started'); return true; } };
    vm.createContext(scope);
    const begin = source.indexOf('function iaRepairEnabled(');
    vm.runInContext(source.slice(begin, source.indexOf('async function tuneIA(ch,sl,my)', begin)), scope);
    const tuning = scope.tuneIARepair({ num: 10 }, {}, 1);
    await new Promise(setImmediate);
    try {
      assert.deepEqual(calls, ['reserve', 'play:bad-file', 'failed:bad-file', ...(hasSpare ? ['play:ready-spare'] : [])]);
    } finally {
      acknowledge();
      await tuning;
      await new Promise(setImmediate);
    }
    assert.deepEqual(calls, ['reserve', 'play:bad-file', 'failed:bad-file', ...(!hasSpare ? ['reserve'] : []), 'play:ready-spare', 'started:ready-spare']);
  });

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) test(file + ': prepares and reuses the next reserved video with companion warming off', async () => {
  const current = item('on-air'), next = item('next-program'), spare = item('spare');
  const events = [], loads = [];
  const shelf = runtime().create({
    queue: async () => ({ items: [current, next, spare] }),
    report: async packet => { events.push(packet.event); }
  });
  await shelf.reserve('10', {});
  await shelf.event('10', current, 'started');
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const scope = {
    window: { RealSignalIAShelf: { enabled: true, client: () => shelf } },
    powered: true, token: 1, curNum: 10, Date,
    document: { createElement: tag => ({ tagName: tag.toUpperCase(), load() { loads.push(this.src); } }) },
    iaRepairEnabled: () => true, iaRepairBody: () => ({}), nlog() {}, setTimeout() {}, clearTimeout() {}
  };
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf('var iaMediaWarmers='), source.indexOf('function warmIAQueueHead(')), scope);
  vm.runInContext(source.slice(source.indexOf('async function preloadNext('), source.indexOf('function schedulePreload(')), scope);
  const channel = { num: 10 };
  await scope.preloadNext(channel, {}, 1);
  await scope.preloadNext(channel, {}, 1);
  assert.deepEqual(loads, [next.media.url], 'only the next reservation should start a media load, once');
  assert.equal(shelf.peek('10').identifier, next.identifier, 'preloading must not consume a reservation');
  assert.deepEqual(events, ['started'], 'only the on-air program is marked started');
  assert.equal(scope.takeIAMediaWarmer(channel, { id: next.identifier }).src, next.media.url);
  scope.token = 2;
  await scope.preloadNext(channel, {}, 1);
  assert.deepEqual(loads, [next.media.url], 'a superseded tune must not stage media');
});

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) test(file + ': an Archive skip gives the new tune ownership of the refill', async () => {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const calls = [], pending = new Map();
  const scope = {
    preloadInFlight: null,
    iaRepairEnabled: ch => ch.num === 10,
    preloadNext: (channel, slot, token) => {
      calls.push(token);
      return new Promise(resolve => pending.set(token, resolve));
    }
  };
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf('function schedulePreload('), source.indexOf('function schedGet(')), scope);
  const channel = { num: 10 };
  const older = scope.schedulePreload(channel, {}, 1);
  assert.equal(scope.schedulePreload(channel, {}, 1), older, 'the same tune still coalesces callbacks');
  const latest = scope.schedulePreload(channel, {}, 2);
  assert.deepEqual(calls, [1, 2], 'a pending refill cannot suppress the newer tune’s staging');
  pending.get(1)();
  await older;
  assert.equal(scope.schedulePreload(channel, {}, 2), latest, 'a superseded completion cannot clear the new owner');
  pending.get(2)();
  await latest;
});

test('classic pilot reserves one copy per episode, rotates eras, and keeps viewer history separate', async () => {
  const { SessionRotation } = await import('../realsignal_api_rotation.js');
  const make = (id, title, year, seriesTitle) => ({...item(id), title, broadcastYear: year, seriesTitle});
  const a = make('upload-a::Popeye S01E01.mp4', 'Popeye S01E01', 1933, 'Popeye');
  const aCopy = make('upload-b::Popeye 1x01 720p.mp4', 'Popeye 1x01', 1933, 'Popeye');
  const old = make('upload-c::Betty S01E03.mp4', 'Betty Boop S01E03', 1934, 'Betty Boop');
  const newer = make('upload-d::Top Cat S01E04.mp4', 'Top Cat S01E04', 1961, 'Top Cat');
  const fresh = make('upload-e::Popeye S01E02.mp4', 'Popeye S01E02', 1933, 'Popeye');
  const r = new SessionRotation(rotationContext(), {}), other = new SessionRotation(rotationContext(), {});
  const reserve = async (viewer, items, count) => (await viewer.reservation({mode:'reserve',stationChannel:'150',archiveProgramIdentity:true,items,count})).json();
  await reserve(r, [a], 1);
  const started = await r.reservation({mode:'commit',stationChannel:'150',archiveProgramIdentity:true,event:'started',id:a.identifier});
  assert.equal(started.status, 200);
  const rows = [aCopy, old, newer, fresh];
  const next = await reserve(r, rows, 3);
  assert.ok(!next.items.some(row => row.identifier === aCopy.identifier));
  assert.equal(next.catalogSize, 4);
  assert.equal(next.catalog.length, 5, "both physical copies are retained for recovery");
  assert.equal(next.items[0].identifier, newer.identifier, 'a new decade takes priority within unseen shows');
  assert.ok(next.items.some(row => row.identifier === fresh.identifier), 'the next episode is a distinct program');
  assert.equal((await reserve(other, [aCopy], 1)).items[0].identifier, aCopy.identifier);
});

test('classic game shows recognize the same dated broadcast across Upload IDs and count only starts', async () => {
  const { SessionRotation } = await import('../realsignal_api_rotation.js');
  const r = new SessionRotation(rotationContext(), {});
  const first = {...item('upload-a'),title:"What's My Line? 1957-05-05"};
  const copy = {...item('upload-b'),title:"What's My Line? May 5, 1957 HD"};
  const next = {...item('upload-c'),title:"What's My Line? 1957-05-12"};
  const stationChannel='12';
  await r.reservation({ mode:'reserve', stationChannel, items:[first, copy, next],count:2 });
  assert.equal((await r.reservation({ mode:'commit', stationChannel, event:'skipped', id:first.identifier })).status,200);
  const afterSkip = await (await r.reservation({ mode:'peek',stationChannel })).json();
  assert.equal(afterSkip.seen, 0);
  assert.equal(afterSkip.catalog.length, 2);
  assert.equal((await r.reservation({ mode:'commit', stationChannel, event:'started', id:first.identifier })).status,200);
  const refreshed = await (await r.reservation({ mode:'reserve',stationChannel,items:[copy,next] })).json();
  assert.equal(refreshed.items[0].identifier,next.identifier);
  assert.equal(refreshed.items.length,1);
});

test('a same-cycle refill keeps the listed next reservation if the server still offers it', async () => {
  const responses = [[item('A'), item('B')], [item('C'), item('B')], [item('D'), item('B')]];
  let cycleGeneration = 0;
  const shelf = runtime().create({
    queue: async () => ({items:responses.shift(), v2:{cycleGeneration}}),
    report: async () => ({cycleGeneration})
  });
  await shelf.reserve('10', {});
  await shelf.event('10', item('A'), 'started');
  await shelf.reserve('10', {});
  assert.equal(shelf.peek('10').identifier, 'B');
  cycleGeneration++;
  await shelf.reserve('10', {});
  assert.equal(shelf.peek('10').identifier, 'D');
});

test('Classic Rerun excludes alternate episode uploads and balances into the 1980s', async () => {
  const {SessionRotation} = await import('../realsignal_api_rotation.js');
  const viewer = new SessionRotation(rotationContext(), {});
  const stationChannel = '10';
  const program = (identifier, title, seriesTitle, year) => ({...item(identifier), title, seriesTitle, broadcastYear:year});
  const seen = program('archive-a::Green Acres S01E10.mp4','Green Acres S01E10','Green Acres',1965);
  const copy = program('archive-b::Green Acres 1x10.mp4','Green Acres 1x10','Green Acres',1965);
  const otherEpisode = program('archive-c::Green Acres S01E11.mp4','Green Acres S01E11','Green Acres',1965);
  const otherDecade = program('archive-d::Benson S06E02.mp4','Benson S06E02','Benson',1984);
  await viewer.reservation({mode:'reserve',stationChannel,items:[seen],count:1});
  await viewer.reservation({mode:'commit',stationChannel,event:'started',id:seen.identifier});
  const next = await (await viewer.reservation({mode:'reserve',stationChannel,items:[copy,otherEpisode,otherDecade],count:2})).json();
  assert.equal(next.catalog.length,3, 'alternate encodes count as one episode');
  assert.deepEqual(next.items.map(row=>row.identifier),[otherDecade.identifier,otherEpisode.identifier]);
});

test('measured route outcomes rank exact-file mirrors across page loads within the pilot', () => {
  const saved = new Map(), storage = {getItem: k => saved.get(k), setItem: (k,v) => saved.set(k,v)};
  let now = 100000;
  const clock = {now: () => now};
  const api = runtime('', '', undefined, storage, clock);
  const primary = 'https://dn600301.us.archive.org/0/items/series/Season%201/Pilot.mp4';
  const mirror = 'https://dn711407.ca.archive.org/0/items/series/Season%201/Pilot.mp4';
  const wrongFile = mirror.replace('Pilot.mp4','Second.mp4');
  const program = {identifier:'series::Season 1/Pilot.mp4',media:{url:primary,alts:[mirror,wrongFile],type:'video'}};
  assert.equal(api.rankedMedia(10, program).url, primary, 'a fresh profile follows the published route');
  api.recordRoute(10, program, wrongFile, 17);
  api.recordRoute(77, program, mirror, 20);
  assert.equal(api.rankedMedia(10,program).url,primary);
  api.recordRoute(10, program, primary, null);
  api.recordRoute(10, program, mirror, 810);
  const nextPage = runtime('', '', undefined, storage, clock);
  const ranked = nextPage.rankedMedia(150, program);
  assert.equal(ranked.url,mirror);
  assert.ok(ranked.alts.includes(primary), 'the original route remains eligible for fallback');
  assert.ok(!ranked.alts.includes(wrongFile));
  assert.equal(program.media.url,primary, 'ranking must not mutate the catalog');
  for (const channel of [11, 12, 22]) {
    assert.equal(nextPage.rankedMedia(channel,program).url,mirror, 'repaired television channels use the measured route');
  }
  assert.equal(nextPage.rankedMedia(77,program).url,primary, 'route ranking stays inside the active pilot');
  api.recordRoute(10,program,api.sameFileAlternate(program),650);
  const unrelated = {identifier:'other::Show.mp4',media:{url:'https://dn600700.us.archive.org/0/items/other/Show.mp4'}};
  assert.equal(api.rankedMedia(10,unrelated).url,unrelated.media.url,'a fast redirect for one file cannot rate unrelated Archive redirects');
  now += 25 * 60 * 60 * 1000;
  assert.equal(nextPage.rankedMedia(10,program).url,primary, 'old observations expire');
});

test('a pilot records an owned first frame and ignores the same callback after a retune', async () => {
  for (const file of ['the_dial_desktop.html','the_dial_mobile.html']) {
    for (const superseded of [false,true]) {
      const h = readyVideoFixture(file), observed = [];
      h.scope.iaRepairEnabled = () => true;
      h.scope.iaRepairSpare = () => null;
      h.scope.performance = {now: () => 100};
      h.scope.window.RealSignalIAShelf = {
        tracksRoutes: () => true,
        recordRoute: (...args) => observed.push(args),
        lifecycle: runtime().lifecycle
      };
      let firstFrame;
      h.video.requestVideoFrameCallback = cb => { firstFrame = cb; };
      const pending = h.start();
      h.handlers.playing();
      assert.equal(await pending,true);
      assert.deepEqual(observed,[], 'metadata and playing alone provide no first-frame evidence');
      if(superseded) h.scope.token++;
      firstFrame(950);
      assert.equal(observed.length,superseded?0:1);
      if(!superseded) assert.equal(observed[0][3],850);
    }
  }
});

for (const file of ['the_dial_desktop.html','the_dial_mobile.html']) test(file + ': a decoded same-file mirror becomes the next attempt without dismissing the episode', async () => {
  const pending={identifier:'parent::Episode.mp4',media:{type:'video',url:'https://archive.org/download/parent/Episode.mp4'}};
  const prepared={src:'https://ia800101.us.archive.org/20/items/parent/Episode.mp4'};
  const calls=[];
  const shelf={peek:()=>pending};
  const scope={window:{RealSignalIAShelf:{enabled:true,client:()=>shelf}},powered:true,token:1,curNum:10,
    iaQueueKey:()=> '10',iaDisplayTitle:()=> 'Episode',nlog(){},
    iaRetry(){assert.fail('should stay on the listed episode');},
    playFile:async (media,_ch,_sl,_my,_fallback,handoff)=>{
      calls.push([media.id,media.url]);
      if(calls.length===1){assert.ok(handoff);handoff.prepared=prepared;return false;}
      assert.equal(handoff.prepared,prepared);
      return true;
    }};
  const source=fs.readFileSync(path.join(root,file),'utf8'),start=source.indexOf('function iaRepairEnabled(');
  vm.createContext(scope);
  vm.runInContext(source.slice(start,source.indexOf('async function tuneIA(ch,sl,my)',start)),scope);
  await scope.tuneIARepair({num:10},{},1);
  assert.deepEqual(calls,[[pending.identifier,pending.media.url],[pending.identifier,prepared.src]]);
});

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) test(file + ': Modern Rerun lists and selects the same decoded reservation', async () => {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const waiting = item('another-episode'), ready = item('listed-episode');
  const shelf = { rows: () => [waiting, ready], peek: () => waiting };
  const archive = { ...runtime(), client: () => shelf };
  const calls = []; let complete;
  const video = { readyState: 2, videoWidth: 640, videoHeight: 480, duration: 1800, src: ready.media.url };
  const scope = { window: { RealSignalIAShelf: archive, RealSignalGuideContract: require('../assets/guide-contract.js') },
    powered: true, curNum: 11, token: 1, curItem: null, curVideo: null, IA_READY_TARGET: 3, liveGuideState: {},
    iaRepairEnabled: () => true, slotFor: () => ({}), iaQueueKey: ch => String(ch.num),
    iaMediaWarmKey: (ch, row) => ch.num + ':' + row.identifier, iaMediaWarmers: {},
    iaCachedProgramAllowed: () => true, iaDisplayTitle: row => row.title, nlog() {},
    iaRetry() { assert.fail('the recorded reservation is playable'); },
    playFile(media, ch, sl, token, retry, handoff) { calls.push([media.id, handoff.listed]); return new Promise(resolve => { complete = resolve; }); } };
  vm.createContext(scope);
  for (const [start, end] of [['function guidePlaybackSnapshot(', 'function guideListing('], ['function iaPilotBuffered(', 'async function tuneIA(ch,sl,my)']]) {
    vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))), scope);
  }
  const channel = { num: 11, nm: 'Modern Rerun TV' };
  assert.equal(scope.guidePlaybackSnapshot(channel).next, null, 'a URL without a decoded reservation is pending');
  scope.iaMediaWarmers['11:' + ready.identifier] = { el: video, readyOrder: 1 };
  const next = scope.guidePlaybackSnapshot(channel).next;
  assert.equal(next.id, ready.identifier);
  const playing = scope.tuneIARepair(channel, {}, 1);
  assert.deepEqual(calls, [[next.id, true]], 'Next hands the listed reservation to same-file recovery');
  delete scope.iaMediaWarmers['11:' + ready.identifier];
  scope.iaMediaWarmers['11:' + waiting.identifier] = { el: { ...video, src: waiting.media.url }, readyOrder: 2 };
  const duringRecovery = scope.guidePlaybackSnapshot(channel).next;
  complete(true); await playing;
  assert.equal(duringRecovery.id, next.id, 'reopening the guide retains the in-flight episode');
  assert.equal(scope.guidePlaybackSnapshot(channel).next.id, waiting.identifier, 'the next reservation takes over once the handoff ends');
});

test('Sports Vault reserves extra events while other Archive shelves keep their normal request size', async () => {
  const counts = [];
  const shelf = runtime().create({ queue: async body => { counts.push(body.count); return { items: [] }; } });
  await shelf.reserve('53', {});
  await shelf.reserve('11', {});
  assert.deepEqual(counts, [5, 3]);
});

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) for (const channel of [53,575,929]) test(file + ' CH ' + channel + ': a stalled Archive warmer opens its slot without evicting the decoded listing', async () => {
  const pending = item('slow'), listed = item('listed'), backup = item('backup');
  const reserved = [pending, listed, backup], timers = new Map(), loads = [];
  const shelf = { rows: () => reserved, peek: () => pending };
  const createVideo = () => Object.assign(new EventTarget(), { readyState: 0, videoWidth: 0,
    load() { if (this.src) loads.push(this.src); }, pause() {}, removeAttribute() { delete this.src; } });
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const scope = { window: { RealSignalIAShelf: { ...runtime(), fullRollout: true, tracksRoutes: () => true, client: () => shelf } },
    powered: true, token: 1, curNum: channel, Date, document: { createElement: createVideo },
    iaRepairEnabled: () => true, iaRepairBody: () => ({}), iaPilotBuffered: () => [],
    nlog() {}, setTimeout(fn, delay) { const key = timers.size + 1; timers.set(key, { fn, delay }); return key; }, clearTimeout() {} };
  vm.createContext(scope);
  for (const [start, end] of [['var iaMediaWarmers=', 'function warmIAQueueHead('], ['async function preloadNext(', 'function schedulePreload(']]) {
    vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))), scope);
  }
  await scope.preloadNext({ num: channel, audio: channel === 929 }, {}, 1);
  const active = scope.iaMediaWarmers[channel + ':listed'];
  Object.assign(active.el, { readyState: 2, videoWidth: 640, videoHeight: 480, duration: 1800 });
  active.el.dispatchEvent(new Event('loadeddata'));
  const expirations = [...timers.values()].filter(timer => timer.delay < 90000);
  assert.equal(expirations.length, 2, 'both attached slots have their own deadline');
  expirations.forEach(timer => timer.fn());
  assert.deepEqual(loads, [pending.media.url, listed.media.url, backup.media.url]);
  assert.deepEqual(Object.keys(scope.iaMediaWarmers).sort(), [channel + ':backup', channel + ':listed']);
  assert.equal(scope.iaMediaWarmers[channel + ':listed'], active);
  assert.equal(shelf.peek(), pending, 'a stalled preload does not consume the reservation');
});

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) test(file + ': an unavailable shared shelf automatically tunes the same station through the fallback', async () => {
  const shelf = { peek: () => null, async reserve() { throw Error('queue unavailable'); } };
  const api = { ...runtime('', '*'), client: () => shelf };
  const calls = [];
  const scope = { window: { RealSignalIAShelf: api }, powered:true, token:1, curNum:216,
    iaPilotBuffered: () => [], iaQueueKey: () => '216', iaRepairBody: () => ({}), nlog() {},
    tuneIA(ch, sl, my) { calls.push([ch.num, my, api.enabledForChannel(ch.num)]); },
    iaRetry() { assert.fail('the authorized playback fallback should be used first'); } };
  const source=fs.readFileSync(path.join(root, file), 'utf8');
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf('async function tuneIARepair('), source.indexOf('async function tuneIA(ch,sl,my)')), scope);
  await scope.tuneIARepair({num:216}, {}, 1);
  assert.deepEqual(calls, [[216, 1, false]]);
});

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) test(file + ': Archive audio guide waits for decoded audio and selects that reservation', async () => {
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const pending={...item('pending-song'),media:{type:'audio',url:'https://archive.org/download/a/song.mp3',runtime:180}};
  const ready={...item('ready-song'),media:{type:'audio',url:'https://archive.org/download/b/song.mp3',runtime:180}};
  const shelf={rows:()=>[pending,ready],peek:()=>pending}, played=[];
  const scope={window:{RealSignalIAShelf:{...runtime('', '*'),client:()=>shelf},RealSignalGuideContract:require('../assets/guide-contract.js')},
    curNum:903,token:1,powered:true,curItem:null,curVideo:null,liveGuideState:{},IA_READY_TARGET:3,
    iaQueueKey:()=> '903',iaMediaWarmKey:(_ch,row)=>row.identifier,iaMediaWarmers:{},iaDisplayTitle:row=>row.title,
    iaCachedProgramAllowed:()=>true,iaRepairEnabled:()=>true,slotFor:()=>({}),nlog(){},
    iaRetry(){assert.fail('decoded audio is already available');},
    async playFile(media){played.push(media.id);return true;}};
  vm.createContext(scope);
  for(const [a,b] of [['function guidePlaybackSnapshot(','function guideListing('],['function iaPilotBuffered(','async function tuneIA(ch,sl,my)']]) {
    vm.runInContext(source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a))),scope);
  }
  const ch={num:903,nm:'Jazz',audio:true};
  assert.equal(scope.guidePlaybackSnapshot(ch).next,null);
  scope.iaMediaWarmers[ready.identifier]={readyOrder:1,el:{readyState:2,duration:180}};
  assert.equal(scope.guidePlaybackSnapshot(ch).next.id,ready.identifier);
  await scope.tuneIARepair(ch,{},1);
  assert.deepEqual(played,[ready.identifier]);
});

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) test(file + ': fallback guide and manual Next agree on the first usable queued file', () => {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const blocked = item('blocked'), pending = item('pending'), next = item('next');
  const ch = { num: 502 }, slot = { channel: 502 };
  const scope = {
    window: { RealSignalGuideContract: { select: input => input.queue } }, curItem: null, curVideo: null, curNum: 502, powered: true,
    iaProgramQueues: { 502: [blocked, pending, next] }, iaProgramPendingAt: {},
    iaProgramMedia: { blocked: blocked.media, next: next.media },
    iaMediaWarmers: { blocked: { el: { readyState: 4 } }, pending: { el: { readyState: 4 } } },
    iaQueueKey: () => '502', iaMediaWarmKey: (_channel, row) => row.identifier,
    slotFor: () => slot, iaRepairEnabled: () => false, iaProgramAllowed: () => true, iaPendingTooLong: () => false,
    iaSkipBlocked: (_channel, row) => row.id === blocked.identifier,
    iaCachedProgramAllowed: () => true, iaDisplayTitle: row => row.title,
    isTemporarilySkipped: () => false, iaReadyShelfSave() {}, iaAdvanceQueueRotation() {},
    warmIAQueueHead() {}, refillIAQueue() {}, liveGuideState: {}, IA_READY_TARGET: 5
  };
  vm.createContext(scope);
  for (const [start, stop] of [['function takeIAQueue(', '\nfunction '], ['function iaLegacyHandoffMedia(', 'function guideListing(']]) {
    const at=source.indexOf(start);
    vm.runInContext(source.slice(at, source.indexOf(stop, at+start.length)),scope);
  }
  const listed = scope.guidePlaybackSnapshot(ch);
  assert.equal(listed[0]?.identifier,next.identifier);
  const picked = scope.takeIAQueue(ch,slot,true,scope.iaLegacyHandoffMedia);
  assert.equal(picked?.identifier,next.identifier);
});

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) test(file + ': native handoff keeps the VHS subject evidence used by the guide', async () => {
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
  const listed = { ...item('barnabys-magic-coat'), subject: 'off-air VHS recording' };
  const ch = { num: 502 };
  const scope = {
    URL, powered: true, curNum: 502, token: 1,
    window: { RealSignalIAShelf: { client: () => ({ peek: () => listed }) } },
    iaQueueKey: () => '502', iaPilotBuffered: () => [listed], iaDisplayTitle: row => row.title,
    nlog() {}, iaRepairEvent() {}, iaRetry() {},
    playFile: async media => scope.iaReviewedFileAllowed(media, 502)
  };
  vm.createContext(scope);
  for (const [a,b] of [['function iaReviewedFileAllowed(', '\nfunction '], ['async function tuneIARepair(', 'async function tuneIA(ch,sl,my)']]) {
    const at = source.indexOf(a);
    vm.runInContext(source.slice(at,source.indexOf(b,at+a.length)),scope);
  }
  let played;
  scope.playFile = async media => {
    if (!scope.iaReviewedFileAllowed(media, 502)) return false;
    played = media.id;
    return true;
  };
  await scope.tuneIARepair(ch, {}, 1);
  assert.equal(played, listed.identifier);
});

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) test(file + ': pilot fallback and its guide skip files already started in the pilot', async () => {
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
  const ch = { num: 502 }, watched = { id: 'tape::watched.mp4', url: 'watched.mp4' };
  const history = new Map();
  let scope;
  const api = runtime('?iaProgramIdentity=1', '*', undefined, undefined, Date,
    channel => scope.iaViewerRecentIds(channel));
  const fresh = { id: 'tape::fresh.mp4', url: 'fresh.mp4' };
  const played = [];
  scope = {
    window: { RealSignalIAShelf: api },
    store: { get: (key, fallback) => history.get(key) ?? fallback, set: (key, value) => history.set(key, value) },
    markSeen() {}, iaRepairEnabled: channel => api.enabledForChannel(channel.num), iaRepairEvent() {},
    iaReportPlayed() {},
    iaProgramMedia: { [watched.id]: watched, [fresh.id]: fresh },
    iaDisplayTitle: (_, channel) => String(channel.num), iaSkipBlocked: () => false,
    iaCachedProgramAllowed: () => true,
    playFileOnce(media) { played.push(media.id); return Promise.resolve(true); }
  };
  vm.createContext(scope);
  for (const [start, stop] of [['function iaLegacyHandoffMedia(', 'function guidePlaybackSnapshot('], ['function playFile(', 'function playFileOnce(']]) {
    const at = source.indexOf(start);
    vm.runInContext(source.slice(at, source.indexOf(stop, at + start.length)), scope);
  }
  const recordStart = source.slice(source.indexOf('function setCurItem('));
  vm.runInContext(recordStart.slice(0, recordStart.indexOf('  if(!it.isAd){')) + '}', scope);
  const readHistory = source.slice(source.indexOf('function iaViewerRecentIds('), source.indexOf('function iaRelaySearchURL('));
  vm.runInContext(readHistory, scope);
  scope.setCurItem(watched, ch, {}, true);
  scope.setCurItem(fresh, ch, {}, false);
  assert.deepEqual(Array.from(scope.iaViewerRecentIds('identity:502')), [watched.id]);
  assert.equal(api.fallbackForChannel(ch.num), true);
  assert.equal(scope.iaLegacyHandoffMedia(ch, {}, { identifier: watched.id, _freshnessFallback: true }), null);
  assert.equal(scope.iaLegacyHandoffMedia(ch, {}, { identifier: fresh.id }).id, fresh.id);
  assert.equal(await scope.playFile(watched, ch), false);
  assert.equal(await scope.playFile(fresh, ch), true);
  assert.deepEqual(played, [fresh.id]);
  scope.window.RealSignalIAShelf = runtime('', '*');
  assert.equal(scope.window.RealSignalIAShelf.fallbackForChannel(ch.num), true);
  assert.equal(await scope.playFile(watched, ch), true, 'the normal fallback keeps its current behavior');
});

for (const [channel, query] of [['502', '?iaProgramIdentity=1'], ['108', ''], ['2', ''], ['3', ''], ['10', '']]) test(channel + ': opens with three reservations and fills backup slots in the background', async () => {
  const requests = [];
  const pilot = runtime(query, '*');
  assert.equal(runtime('?castReceiver=1', '*').readyBackup(channel), false);
  assert.equal(runtime('?iaRepair=0', '*').readyBackup(channel), false);
  const shelf = pilot.create({ queue: async body => {
    requests.push([body.count, body.sessionRefill]);
    return { items: [item('opening')] };
  } });
  await shelf.reserve(channel, {});
  await shelf.reserve(channel, {});
  assert.deepEqual(requests, [[3,false],[5,true]]);
});

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
for (const [num, query] of [[502, '?iaProgramIdentity=1'], [108, ''], [2, ''], [3, ''], [10, '']]) test(file + ' ' + num + ': Next skips unresponsive warmups and plays the backup shown in the guide', async () => {
  const reservations = ['slow-a','slow-b','early-backup','later-backup','last-backup'].map(item);
  const media = [], timers = new Map(), played = [];
  const key = row => num + ':' + row.identifier;
  const api = { ...runtime(query,'*'), client: () => shelf };
  const scope = {
    window: { RealSignalIAShelf: api, RealSignalGuideContract: require('../assets/guide-contract.js') },
    powered: true, token: 1, curNum: num, Date, curItem: null, curVideo: null, liveGuideState: {}, IA_READY_TARGET: 3,
    iaRepairEnabled: () => true, iaCachedProgramAllowed: () => true, iaRepairBody: () => ({}),
    iaDisplayTitle: row => row.title, slotFor: () => ({}), nlog() {}, refreshGuideData() {},
    iaRepairEvent() {}, iaRetry() { assert.fail('a decoded backup is available'); },
    playFile: async row => { played.push(row.id); return true; },
    setTimeout(fn, ms) { const id = timers.size + media.length + 1; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    document: { createElement() {
      const el = Object.assign(new EventTarget(), { readyState: 0, videoWidth: 0,
        pause() {}, load() {}, removeAttribute() { delete this.src; } });
      media.push(el); return el;
    } }
  };
  let rows = reservations.slice(0,3);
  const shelf = { peek: () => rows[0], rows: () => rows,
    async reserve() { rows = reservations; return rows; } };
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  vm.createContext(scope);
  const blocks = [['var iaMediaWarmers=', 'function warmIAQueueHead('], ['async function preloadNext(', 'function schedulePreload('],
    ['function iaPilotBuffered(', 'async function tuneIA(ch,sl,my)'], ['function guidePlaybackSnapshot(', 'function guideListing(']];
  for (const [start, end] of blocks) {
    const at = source.indexOf(start);
    vm.runInContext(source.slice(at, source.indexOf(end, at)), scope);
  }
  const channel = { num };
  scope.curItem = { id: "on-air", ch: num, title: "On air" };
  await scope.preloadNext(channel, {}, 1);
  scope.token = 2;
  [...timers.values()].filter(timer => timer.ms === 2200).forEach(timer => timer.fn());
  await scope.preloadNext(channel, {}, 2);
  assert.deepEqual(Object.keys(scope.iaMediaWarmers).sort(), [key(reservations[2]), key(reservations[3])]);
  const backup = scope.iaMediaWarmers[key(reservations[2])];
  Object.assign(backup.el, { readyState: 2, videoWidth: 640, videoHeight: 480, duration: 1800 });
  backup.el.dispatchEvent(new Event('loadeddata'));
  assert.equal(scope.guidePlaybackSnapshot(channel).next.id, 'early-backup');
  await scope.tuneIARepair(channel, {}, 2);
  assert.deepEqual(played, ['early-backup']);
});
}

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) test(file + ': a decoded VHS backup stays available during a long program', () => {
  const channel = {num:502}, next = item('vhs-backup'), timers = [];
  const el = Object.assign(new EventTarget(), {readyState:2,videoWidth:640,videoHeight:480,duration:1800,
    pause(){},load(){},removeAttribute(){delete this.src;}});
  const scope = {
    window:{RealSignalIAShelf:runtime('?iaProgramIdentity=1','*')},
    Date,curNum:502,powered:true,document:{createElement:()=>el},iaRepairEnabled:()=>true,nlog(){},
    setTimeout(fn,ms){timers.push({fn,ms});return timers.length;},clearTimeout(){}
  };
  vm.createContext(scope);
  const source=fs.readFileSync(path.join(root,file),'utf8');
  vm.runInContext(source.slice(source.indexOf('var iaMediaWarmers='),source.indexOf('function warmIAQueueHead(')),scope);
  scope.iaWarmWanted[502]=Date.now()+120000;
  scope.stageIAMediaWarmer(channel,next,next.media,()=>{});
  el.dispatchEvent(new Event('loadeddata'));
  timers.find(timer=>timer.ms===90000).fn();
  assert.equal(scope.iaMediaWarmers['502:vhs-backup']?.el,el);
  scope.releaseIAReadyBackups(502);
  assert.equal(el.src,undefined);
  assert.equal(scope.iaMediaWarmers['502:vhs-backup'],undefined);
});
