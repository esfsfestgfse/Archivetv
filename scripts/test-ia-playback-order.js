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
function runtime(search = '?iaRepair=1', pilot = '', castConnected, localStorage, clock = Date) {
  const scope = { window: { __rsCastIsConnected: castConnected }, URL, URLSearchParams, location: { search }, document: { querySelector: () => pilot ? { content: pilot } : null }, Date:clock, localStorage, Promise, setTimeout, clearTimeout };
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
  for (const channel of ['10', '12', '22', '150']) assert.equal(pilot.enabledForChannel(channel), true);
  assert.equal(pilot.enabledForChannel('77'), false);
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

  for (const hasSpare of [false, true]) test(file + (hasSpare
    ? ': a buffered reserve replaces a stalled video before spending time on its alternate'
    : ': a stalled origin can still try its alternate when no reserve is ready'), async () => {
    const source = fs.readFileSync(path.join(root, file), 'utf8'), timers = [], handlers = {};
    const video = { tagName: 'VIDEO', style: {}, classList: { toggle() {} }, pause() {}, removeAttribute() {}, load() {}, remove() {}, setAttribute() {}, play: () => Promise.resolve(), addEventListener: (type, fn) => { handlers[type] = fn; } };
    const spare = item('different-reserved-episode'), primary = { identifier:'series::Season 1/Pilot.mp4',
      media:{ type:'video', url:'https://dn600301.us.archive.org/0/items/series/Season%201/Pilot.mp4' } };
    const warmer = {}, load = [];
    const scope = { window: { RealSignalIAShelf: { ...runtime(), tracksRoutes: () => false, client: () => ({ rows: () => hasSpare ? [primary, spare] : [primary] }) } },
      iaQueueKey: ch => String(ch.num), iaMediaWarmKey: (ch, row) => ch.num + ':' + row.identifier, iaMediaWarmers: warmer, iaWarmWanted: {},
      stageIAMediaWarmer: (ch, row, media) => { load.push(media.url); warmer[ch.num + ':' + row.identifier] = { el: { readyState: 4, videoWidth: 640 } }; }, document: { createElement: () => video, body: { classList: { contains: () => false } } },
      theVideo: video, videoCtl: null, AbortController, curVideo: null, screenArea: { innerHTML: '', appendChild() {} },
      iaRepairEnabled: () => true, takeIAMediaWarmer: () => null, killMedia() {}, nlog() {}, token: 1, powered: true, curNum: 10,
      soundBlocked: false, muted: false, vol: 0.5, lastGesture: Date.now(), Date,
      setTimeout: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clearTimeout() {} };
    vm.createContext(scope);
    vm.runInContext(source.slice(source.indexOf('function acquireVideo('), source.indexOf('function unlockMedia(')), scope);
    vm.runInContext(source.slice(source.indexOf('function iaKnownVideoPolicyViolation('), source.indexOf('function iaProgramDenyTerms(')), scope);
    const repairStart = source.indexOf('function iaRepairEvent(');
    vm.runInContext(source.slice(repairStart, source.indexOf('async function tuneIA(ch,sl,my)', repairStart)), scope);
    vm.runInContext(source.slice(source.indexOf('function playFile('), source.indexOf('function showNow(')), scope);
    const pending = scope.playFile({ id: primary.identifier, ...primary.media }, { num: 10 }, {}, 1, 0);
    assert.ok(timers[0].ms <= 4000, 'a stalled origin must not hold Next for twelve seconds');
    assert.deepEqual(load, [], 'a fast startup should never need to load the spare');
    if (hasSpare) {
      const standby = timers.find(timer => timer.ms > 0 && timer.ms < timers[0].ms);
      assert.ok(standby, 'start preparing one spare before the primary times out');
      standby.fn();
      assert.deepEqual(load, [spare.media.url]);
      timers[0].fn();
      assert.equal(await pending, false, 'the tune loop can move to the buffered reserve');
      assert.equal(video.src, primary.media.url, 'do not start the alternate after the first timeout');
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

test('classic pilot reserves one copy per episode, rotates eras, and keeps viewer history separate', async () => {
  const { SessionRotation } = await import('../realsignal_api_rotation.js');
  const make = (id, title, year, seriesTitle) => ({...item(id), title, broadcastYear: year, seriesTitle});
  const a = make('upload-a::Popeye S01E01.mp4', 'Popeye S01E01', 1933, 'Popeye');
  const aCopy = make('upload-b::Popeye 1x01 720p.mp4', 'Popeye 1x01', 1933, 'Popeye');
  const old = make('upload-c::Betty S01E03.mp4', 'Betty Boop S01E03', 1934, 'Betty Boop');
  const newer = make('upload-d::Top Cat S01E04.mp4', 'Top Cat S01E04', 1961, 'Top Cat');
  const fresh = make('upload-e::Popeye S01E02.mp4', 'Popeye S01E02', 1933, 'Popeye');
  const r = new SessionRotation(rotationContext(), {}), other = new SessionRotation(rotationContext(), {});
  const reserve = async (viewer, items, count) => (await viewer.reservation({mode:'reserve',stationChannel:'150',items,count})).json();
  await reserve(r, [a], 1);
  const started = await r.reservation({mode:'commit',stationChannel:'150',event:'started',id:a.identifier});
  assert.equal(started.status, 200);
  const rows = [aCopy, old, newer, fresh];
  const next = await reserve(r, rows, 3);
  assert.ok(!next.items.some(row => row.identifier === aCopy.identifier));
  assert.equal(next.catalog.length, 4);
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
  api.recordRoute(11, program, mirror, 20);
  assert.equal(api.rankedMedia(10,program).url,primary);
  api.recordRoute(10, program, primary, null);
  api.recordRoute(10, program, mirror, 810);
  const nextPage = runtime('', '', undefined, storage, clock);
  const ranked = nextPage.rankedMedia(150, program);
  assert.equal(ranked.url,mirror);
  assert.ok(ranked.alts.includes(primary), 'the original route remains eligible for fallback');
  assert.ok(!ranked.alts.includes(wrongFile));
  assert.equal(program.media.url,primary, 'ranking must not mutate the catalog');
  assert.equal(nextPage.rankedMedia(12,program).url,primary, 'route ranking stays inside the two pilots');
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
