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
