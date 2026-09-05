const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../realsignal_cast_receiver.html'), 'utf8');
function setup() {
  const nodes = new Map(), loads = [], messages = [], timers = new Map();
  let listener, errorListener, current, stops = 0, timerId = 0;
  function element() {
    const classes = new Set();
    return {style: {}, textContent: '', addEventListener() {}, appendChild() {},
      querySelector: element, classList: {remove: c => classes.delete(c),
        toggle(c, on) {if(on) classes.add(c); else classes.delete(c);}, contains: c => classes.has(c)}};
  }
  const player = {load(request) {current = request.media;
    return new Promise((resolve, reject) => loads.push({request, resolve, reject}));},
    stop() {stops++;}, getMediaInformation: () => current,
    addEventListener(type, callback) {errorListener = callback;}};
  const context = {getPlayerManager: () => player, setApplicationState() {}, start() {},
    sendCustomMessage(ns, id, packet) {messages.push(packet);},
    addCustomMessageListener(ns, callback) {listener = callback;}};
  const sandbox = {URL, document: {getElementById(id) {if(!nodes.has(id)) nodes.set(id, element()); return nodes.get(id);},
    createElement: element, createDocumentFragment: element}, window: {addEventListener() {}},
    setTimeout(fn) {timers.set(++timerId, fn); return timerId;}, clearTimeout: id => timers.delete(id),
    cast: {framework: {CastReceiverContext: {getInstance: () => context}, CastReceiverOptions: function(){},
      messages: {MediaInformation: function(){}, GenericMediaMetadata: function(){}, LoadRequestData: function(){}, StreamType: {BUFFERED: 'BUFFERED'}},
      events: {EventType: {ERROR: 'ERROR'}}, system: {MessageType: {JSON: 'JSON'}}}}};
  vm.runInNewContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], sandbox);
  const send = data => listener({senderId: 'phone', data});
  return {loads, messages, timers, nodes, send, stops: () => stops,
    error(info) {current = info; errorListener({});},
    state(channel, powered = true) {send({type: 'REALSIGNAL_STATE', channel, powered});},
    media(channel, name = 'main') {send({type: 'REALSIGNAL_MEDIA', channel,
      media: {url: `https://example.com/${name}.mp4`, alts: ['https://example.com/backup.mp4'], title: name}});}};
}
const flush = async () => {await Promise.resolve(); await Promise.resolve();};
(async () => {
  for(const outcome of ['resolve', 'reject', 'timeout', 'error']) {
    const r = setup(); r.state(3); r.media(3);
    const old = r.loads[0], timeout = [...r.timers.values()][0];
    r.state(4);
    if(outcome === 'timeout') timeout();
    else if(outcome === 'error') r.error(old.request.media);
    else old[outcome]();
    await flush();
    assert.equal(r.loads.length, 1, `old ${outcome} must not reload previous channel`);
    assert.equal(r.messages.filter(m => m.type === 'REALSIGNAL_CAST_OK').length, 0, 'old load cannot acknowledge new channel');
    r.media(4); assert.equal(r.loads.length, 2, 'new channel starts immediately');
  }
  const off = setup(); off.state(3); off.media(3); off.state(3, false);
  off.loads[0].reject(); await flush(); off.media(3, 'late');
  assert.equal(off.loads.length, 1, 'standby must reject delayed media and recovery');
  assert.equal(off.timers.size, 0); assert.equal(off.stops(), 1);
  const r = setup(); r.state(3); r.media(3);
  r.send({type: 'REALSIGNAL_GUIDE', open: true, items: [{num: 3, name: 'Channel'}]});
  assert(r.nodes.get('guide').classList.contains('open'));
  r.send({type: 'REALSIGNAL_COMMAND', action: 'BACK'});
  assert(!r.nodes.get('guide').classList.contains('open'));
  assert.equal(r.loads.length, 1); assert.equal(r.stops(), 0);
  const original = r.loads[0]; r.error(original.request.media); original.reject(); await flush();
  assert.equal(r.loads.length, 2, 'error plus rejected promise must only try one backup');
  r.error(original.request.media); assert.equal(r.loads.length, 2, 'stale error must not disrupt backup');
  r.loads[1].reject(); await flush();
  assert.equal(r.messages.filter(m => m.type === 'REALSIGNAL_CAST_ERROR').length, 1);
  assert.equal(r.timers.size, 0);
  console.log('Cast runtime: channel races, standby, guide, bounded recovery passed (mock CAF SDK).');
})().catch(error => {console.error(error); process.exitCode = 1;});
