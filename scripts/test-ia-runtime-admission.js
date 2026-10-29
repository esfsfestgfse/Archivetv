const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.join(__dirname, '..');

// Real browser qualification and playback functions; only network, decoder,
// timers and unrelated UI effects are controlled at their external boundaries.
function client(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const handlers = {}, timers = [], calls = { created: 0, rollback: 0, progress: 0, published: 0, paused: 0 };
  const video = { tagName: 'VIDEO', duration: NaN, videoWidth: 0, videoHeight: 0, style: {},
    classList: { toggle() {} }, setAttribute() {}, pause() { calls.paused++; }, play: () => Promise.resolve(),
    addEventListener: (name, fn) => { handlers[name] = fn; } };
  const scope = { console, AbortController, Date,
    window: { __rsCastPublishMedia: () => { calls.published++; } },
    document: { body: { classList: { contains: () => false } } },
    banned: [], curItem: null, blockedId: () => false, isTemporarilySkipped: () => false,
    iaProgramFailed: () => false, iaSkipBlocked: () => false, iaThemeMatches: () => true,
    iaRepairEnabled: () => false, takeIAMediaWarmer: () => null, killMedia() {}, nlog() {},
    curVideo: null, token: 1, powered: true, curNum: 10, soundBlocked: false, muted: false, vol: 0.5, lastGesture: Date.now(),
    screenArea: { innerHTML: '', appendChild() {} }, hideBuffer() {}, clearStall() {}, onProgress() { calls.progress++; },
    acquireVideo: () => { calls.created++; return { v: video, sig: new AbortController().signal,
      rollback() { calls.rollback++; }, commit() { throw Error('unexpected visible commit'); } }; },
    setTimeout: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; }, clearTimeout() {} };
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf('function iaKnownVideoPolicyViolation('), source.indexOf('function iaProgramDenyTerms(')), scope);
  vm.runInContext(source.slice(source.indexOf('function playFile('), source.indexOf('function showNow(')), scope);
  return { source, scope, handlers, timers, video, calls };
}
const program = extra => ({ id: 'program::episode.mp4', title: 'Complete television episode', type: 'video',
  url: 'https://archive.org/download/program/episode.mp4', ...extra });

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  test(file + ': stale Hard Count news cannot allocate a player or be published to Cast', async () => {
    const {scope,calls}=client(file);
    const bad=program({id:'WHUT_20100810_220000_World_Business',title:'World Business',subject:'NFL Films football',runtime:1800,url:'https://archive.org/download/WHUT_20100810_220000_World_Business/WHUT_20100810_220000_World_Business.mp4'});
    assert.equal(scope.iaCachedProgramAllowed({num:51},bad,{}),false);
    assert.equal(await scope.playFile(bad,{num:51},{},1,false),false);
    assert.equal(calls.created,0);assert.equal(calls.published,0);
  });
  test(file + ': off-genre Aviation cannot escape through a saved shelf or direct Cast publication', async () => {
    const {scope,calls}=client(file);
    const bad=program({id:'filmography::Peeping Tom.mp4',title:'Complete Filmography · Peeping Tom',subject:'aircraft',genreVerified:true,url:'https://archive.org/download/filmography/Peeping%20Tom.mp4',runtime:5400});
    assert.equal(scope.iaCachedProgramAllowed({num:209},bad,{}),false);
    assert.equal(await scope.playFile(bad,{num:209},{},1,false),false);
    assert.equal(calls.created,0);assert.equal(calls.published,0);
  });
  test(file + ': Aviation saved shelves defer unknown-duration clips to qualification', () => {
    const {scope,source}=client(file),item=program({title:'Aviation history',genreVerified:true});
    Object.assign(scope,{fastTuneCache:{},FAST_TUNE_TTL:86400000,FAST_TUNE_MAX:10,byNum:()=>({num:209}),iaExpectedMedia:()=> 'video',store:{set(){}}});
    vm.runInContext(source.split('\n').find(line=>line.startsWith('function iaRuntimeSeconds(')),scope);
    vm.runInContext(source.slice(source.indexOf('function fastTuneGet('),source.indexOf('var rapidWarmVideo=',source.indexOf('function fastTuneGet('))),scope);
    scope.fastTunePut(209,item);assert.equal(scope.fastTuneGet(209),null,'unqualified saved item cannot use the instant path');
    scope.fastTunePut(209,{...item,runtime:1800});assert.equal(scope.fastTuneGet(209).runtime,1800,'duration must survive both cache boundaries');
    assert.equal(scope.iaCachedProgramAllowed({num:209},item,{}),true,'fresh unresolved programs must reach metadata/decoder qualification');
    assert.equal(scope.iaCachedProgramAllowed({num:209},{...item,runtime:30},{}),false);
  });
  test(file + ': the ad cap pauses playback before advancing the program', async () => {
    const { scope, video, timers } = client(file), events = [];
    video.paused = false;
    video.pause = () => { video.paused = true; events.push('pause'); };
    video.dispatchEvent = event => events.push(event.type); scope.Event = Event;
    const pending = scope.playFile(program({ isAd: true }), { num: 10 }, {}, 1, 0);
    scope.curVideo = video;
    timers.find(timer => timer.ms === 60000).fn();
    assert.deepEqual(events, ['pause', 'ended']);
    assert.equal(video.paused, true);
    timers[0].fn(); assert.equal(await pending, false);
  });
  test(file + ': a decoded portrait commercial is rejected before visible commit', async () => {
    const { scope, handlers, video, calls } = client(file);
    const pending = scope.playFile(program({ isAd: true }), { num: 10 }, {}, 1, 0);
    video.duration = 30; video.videoWidth = 480; video.videoHeight = 854;
    handlers.loadedmetadata();
    assert.equal(calls.rollback, 1);
    assert.equal(calls.progress, 0);
    assert.equal(await pending, false);
  });
  test(file + ': an unstarted commercial yields within 900ms and its cap cannot advance a superseding tune', async () => {
    const { scope, video, timers } = client(file), dispatched = [];
    video.dispatchEvent = event => dispatched.push(event.type); scope.Event = Event;
    const pending = scope.playFile(program({ isAd: true }), { num: 10 }, {}, 1, 0);
    assert.equal(timers[0].ms, 900);
    const cap = timers.find(timer => timer.ms === 60000);
    assert.ok(cap, 'a break has a sixty-second cap');
    scope.curVideo = video; scope.token = 2; cap.fn();
    assert.deepEqual(dispatched, []);
    timers[0].fn(); assert.equal(await pending, false);
  });
  test(file + ': cached playback honors the station runtime, not just the generic TV floor', () => {
    const { scope } = client(file);
    assert.equal(scope.iaCachedProgramAllowed({ num: 10 }, program({ runtime: 1320 }),
      { channel: 10, program: { minRuntimeSeconds: 1800 } }), false);
    assert.equal(scope.iaCachedProgramAllowed({ num: 10 }, program({ runtime: 1800 }),
      { channel: 10, program: { minRuntimeSeconds: 1800 } }), true);
  });

  for (const number of [10, 204, 226, 243]) test(file + ': channel ' + number + ' rejects a two-minute program before allocating a player or publishing Cast media', async () => {
    const { scope, calls } = client(file);
    const pending = scope.playFile(program({ runtime: 120 }), { num: number }, { channel: number, program: {} }, 1, 0);
    assert.equal(calls.created, 0);
    assert.equal(calls.published, 0);
    assert.equal(await pending, false);
  });

  test(file + ': actual short decoder duration defeats long parent metadata before a visible commit', async () => {
    const { scope, handlers, video, calls } = client(file);
    const pending = scope.playFile(program({ meta: { runtime: '90:00' } }), { num: 10 }, { channel: 10, program: {} }, 1, 0);
    video.duration = 120; video.videoWidth = 640; video.videoHeight = 480;
    handlers.loadedmetadata();
    assert.equal(calls.rollback, 1);
    assert.equal(calls.paused, 1, 'rejected media cannot keep playing under the tuning screen');
    assert.equal(calls.progress, 0);
    assert.equal(await pending, false);
  });

  test(file + ': an already-warmed short file is rejected at playing even without a new metadata event', async () => {
    const { scope, handlers, video, calls } = client(file);
    const pending = scope.playFile(program({}), { num: 10 }, { channel: 10, program: {} }, 1, 0);
    video.duration = 120; video.videoWidth = 640; video.videoHeight = 480;
    handlers.playing();
    assert.equal(calls.rollback, 1);
    assert.equal(calls.paused, 1);
    assert.equal(await pending, false);
  });

  test(file + ': a superseded startup failure cannot pause a newer tune reusing the same decoder', async () => {
    const { source, scope, video, calls, timers } = client(file);
    Object.assign(video, { load() {}, removeAttribute() {}, remove() {} });
    scope.theVideo = video; scope.videoCtl = null;
    vm.runInContext(source.slice(source.indexOf('function acquireVideo('), source.indexOf('function unlockMedia(')), scope);
    const first = scope.playFile(program({}), { num: 226 }, { channel: 226, program: {} }, 1, 0);
    scope.token = 2;
    const second = scope.playFile(program({}), { num: 226 }, { channel: 226, program: {} }, 2, 0);
    calls.paused = 0;
    timers[0].fn();
    assert.equal(calls.paused, 0, 'the stale timeout must not pause the reused current decoder');
    assert.equal(await first, false);
    timers[1].fn();
    assert.equal(await second, false);
    assert.equal(calls.paused, 1, 'the current failed candidate still stops');
  });

  for (const [label, ch, extra, duration] of [
    ['original short cartoon', { num: 150 }, {}, 420],
    ['commercial', { num: 10 }, { isAd: true }, 30],
    ['TV episode', { num: 10 }, {}, 1320],
    ['non-IA direct video', { num: 950, source: 'livetv' }, {}, 120],
  ]) test(file + ': runtime protection preserves ' + label, async () => {
    const { scope, handlers, video, calls, timers } = client(file);
    const pending = scope.playFile(program(extra), ch, { channel: ch.num, program: {} }, 1, 0);
    video.duration = duration; video.videoWidth = 640; video.videoHeight = 480;
    handlers.loadedmetadata();
    assert.equal(calls.rollback, 0);
    assert.equal(calls.progress, 1);
    timers[0].fn();
    assert.equal(await pending, false, 'bounded startup cleanup is still active');
  });

  test(file + ': browser resolver retains selected-child facts instead of borrowing collection length', async () => {
    const { source } = client(file), files = [
      { name: 'clip.mp4', format: 'h.264', length: '120', width: '640', height: '480' },
      { name: 'episode.mp4', format: 'h.264', length: '1320', width: '640', height: '480' },
      { name: 'unknown.mp4', format: 'h.264' },
    ];
    const scope = { IOS: false, console, iaRelayMetadataURL: id => id,
      iaFastJSON: async () => ({ metadata: { runtime: '90:00', language: 'eng' }, files }),
      firstOk: jobs => jobs[0].run(), withTO: promise => promise, nlog() {} };
    vm.createContext(scope);
    vm.runInContext(source.slice(source.indexOf('function mArr('), source.indexOf('/* NASA video */')), scope);
    for (const [name, want] of [['clip.mp4', 120], ['episode.mp4', 1320], ['unknown.mp4', 0]]) {
      const selected = await scope.resolvePlayable('program::' + name, 'video');
      assert.equal(Number(selected.runtime), want);
      assert.equal(selected.meta.media.fileName, name);
      assert.equal(Number(selected.meta.media.runtime), want);
    }
  });
}
