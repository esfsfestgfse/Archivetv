const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../realsignal_cast_receiver.html'), 'utf8');
function setup() {
  const nodes = new Map(), loads = [], messages = [], timers = new Map();
  let listener, errorListener, current, stops = 0, pauses = 0, plays = 0, systemVolume = null, timerId = 0;
  const eventListeners = new Map();
  function element() {
    const classes = new Set();
    const node = {style: {}, textContent: '', posts: [], listeners: {}, contentWindow: null, addEventListener(type, callback) {node.listeners[type] = callback;}, appendChild() {},
      querySelector: element, classList: {remove: c => classes.delete(c),
        toggle(c, on) {if(on) classes.add(c); else classes.delete(c);}, contains: c => classes.has(c)}};
    node.contentWindow = {postMessage(packet, origin) {node.posts.push({packet, origin});}};
    return node;
  }
  const player = {load(request) {current = request.media;
    return new Promise((resolve, reject) => loads.push({request, resolve, reject}));},
    stop() {stops++;}, pause() {pauses++;}, play() {plays++;}, getMediaInformation: () => current,
    addEventListener(type, callback) {eventListeners.set(type, callback);if(type === 'ERROR') errorListener = callback;}};
  const context = {getPlayerManager: () => player, setApplicationState() {}, start() {},
    setSystemVolume(value) {systemVolume = value;},
    sendCustomMessage(ns, id, packet) {messages.push(packet);},
    addCustomMessageListener(ns, callback) {listener = callback;}};
  const sandbox = {URL, document: {getElementById(id) {if(!nodes.has(id)) nodes.set(id, element()); return nodes.get(id);},
    createElement: element, createDocumentFragment: element}, window: {addEventListener() {}},
    setTimeout(fn) {timers.set(++timerId, fn); return timerId;}, clearTimeout: id => timers.delete(id),
    cast: {framework: {CastReceiverContext: {getInstance: () => context}, CastReceiverOptions: function(){},
      messages: {MediaInformation: function(){}, GenericMediaMetadata: function(){}, LoadRequestData: function(){}, StreamType: {BUFFERED: 'BUFFERED'}},
      events: {EventType: {ERROR: 'ERROR', MEDIA_FINISHED: 'MEDIA_FINISHED'}}, system: {MessageType: {JSON: 'JSON'}}}}};
  vm.runInNewContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], sandbox);
  const send = data => listener({senderId: 'phone', data});
  return {loads, messages, timers, nodes, send, stops: () => stops, pauses: () => pauses, plays: () => plays,
    systemVolume: () => systemVolume,
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
  const controls = setup(); controls.state(7); controls.media(7, 'controls');
  assert(controls.nodes.get('director').src.includes('castReceiver=1'), 'receiver must boot a hidden channel director for native sender control');
  controls.send({type: 'REALSIGNAL_COMMAND', action: 'NEXT'});
  controls.nodes.get('director').listeners.load();
  const directorPosts = controls.nodes.get('director').posts;
  assert(directorPosts.some(entry => entry.packet && entry.packet.type === 'REALSIGNAL_COMMAND' && entry.packet.action === 'NEXT'), 'receiver must queue commands until the director is ready');
  assert(directorPosts.findIndex(entry => entry.packet && entry.packet.type === 'REALSIGNAL_STATE') < directorPosts.findIndex(entry => entry.packet && entry.packet.type === 'REALSIGNAL_COMMAND'), 'receiver must apply initial state before replaying queued commands');
  controls.send({type: 'REALSIGNAL_COMMAND', action: 'PAUSE'});
  controls.send({type: 'REALSIGNAL_COMMAND', action: 'PLAY'});
  controls.send({type: 'REALSIGNAL_COMMAND', action: 'VOLUME', level: 0.35, muted: false});
  assert.equal(controls.pauses(), 1, 'receiver must pause native CAF playback');
  assert.equal(controls.plays(), 1, 'receiver must resume native CAF playback');
  assert.equal(controls.systemVolume().level, 0.35, 'receiver must accept volume level commands');
  assert.equal(controls.systemVolume().muted, false, 'receiver must accept volume mute state');
  const embed = setup(); embed.state(12);
  embed.send({type: 'REALSIGNAL_TUNE', channel: 12, media: {url: 'https://www.youtube.com/embed/abc123', playback: 'embed', embedUrl: 'https://www.youtube.com/embed/abc123', title: 'Source Suite'}});
  assert.equal(embed.loads.length, 0, 'Source Suite embeds must not enter the native direct-media loader');
  assert(embed.nodes.get('screen').src.includes('youtube.com/embed/abc123'), 'receiver must load the embed URL in its director');
  assert(embed.nodes.get('app').classList.contains('director-open'), 'receiver must show the director for an interactive embed');
  embed.send({type: 'REALSIGNAL_COMMAND', action: 'PAUSE'});
  assert(embed.nodes.get('screen').contentWindow, 'embed receiver must retain a controllable director window');
  console.log('Cast runtime: channel races, standby, guide, bounded recovery passed (mock CAF SDK).');
})().catch(error => {console.error(error); process.exitCode = 1;});
