const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function fixture(audio = false) {
  const events = [], handlers = {}, frames = [];
  const node = { dataset: {}, tagName: audio ? 'AUDIO' : 'VIDEO', isConnected: true, videoWidth: 640, readyState: 4, paused: false,
    getBoundingClientRect: () => ({ width: 640, height: 480 }), addEventListener: (type, handler) => { handlers[type] = handler; }, requestVideoFrameCallback: fn => frames.push(fn) };
  const scope = { telemetryOn: true, activeTune: { seq: 1, channel: 10, at: 100 }, stamp: () => 200, currentTelemetryChannel: () => 10,
    document: { hidden: false }, getComputedStyle: () => ({ opacity: '1' }), seenPrograms: [], currentProgramKey: () => 'episode', queueDepth: () => 3, push: e => events.push(e), requestAnimationFrame: fn => fn() };
  vm.createContext(scope);
  const source = fs.readFileSync(path.join(__dirname, '../assets/release2-runtime.js'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('  function observeMedia('), source.indexOf('  function formatMs(')), scope);
  return { scope, node, events, handlers, frames };
}
test('superseded media cannot report stalls or errors against a newer channel', () => {
  const f = fixture(); f.scope.observeMedia(f.node); f.scope.activeTune = { seq: 2, channel: 11, at: 150 };
  f.handlers.stalled(); f.handlers.error();
  assert.equal(f.events.length, 0);
});
test('audio start is not a visible video frame', () => {
  const f = fixture(true); f.scope.observeMedia(f.node); f.handlers.playing();
  assert.equal(f.events.filter(e => e.type === 'first-visible-frame').length, 0);
  assert.equal(f.events.filter(e => e.type === 'source-success').length, 1);
});
test('missing tune origin does not fabricate a first-frame latency', () => {
  const f = fixture(); f.scope.activeTune = null; f.scope.observeMedia(f.node); f.frames.shift()();
  assert.equal(f.events.filter(e => e.type === 'first-visible-frame').length, 0);
});
