// Run the real presentation code against a small DOM/clock boundary; browser QA owns CSS geometry.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function harness(search = '?v6=1') {
  const ids = new Map(), timers = new Map(), intervals = [], calls = [];
  let clock = 0, connected = false;
  class Node {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.dataset = {}; this.attrs = {}; this.listeners = {};
      this.style = {}; this.hidden = false; this.textContent = ''; this.disabled = false;
      const classes = new Set();
      this.classList = { add: (...xs) => xs.forEach(x => classes.add(x)), remove: (...xs) => xs.forEach(x => classes.delete(x)), contains: x => classes.has(x), toggle: (x, on) => { const add = on == null ? !classes.has(x) : on; add ? classes.add(x) : classes.delete(x); return add; } };
    }
    set id(x) { this._id = x; ids.set(x, this); } get id() { return this._id; }
    appendChild(x) { this.children.push(x); x.parentNode = this; return x; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
    dispatch(k, props = {}) { const e = { target: this, preventDefault() {}, ...props }; for (const fn of this.listeners[k] || []) fn(e); }
    click() { this.dispatch('click'); }
    press(key) {
      const e = { key, target: this, defaultPrevented: false, cancelBubble: false,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.cancelBubble = true; } };
      for (let at = this; at; at = at.parentNode) {
        for (const fn of at.listeners.keydown || []) fn(e);
        if (e.cancelBubble) break;
      }
      if (!e.defaultPrevented && (key === 'Enter' || key === ' ')) this.click();
    }
    contains(x) { return this === x || this.children.some(c => c.contains(x)); }
    focus() { document.activeElement = this; this.dispatch('focusin'); }
    blur() { if (document.activeElement === this) document.activeElement = null; this.dispatch('focusout'); }
  }
  const document = { createElement: tag => new Node(tag), getElementById: id => ids.get(id) || null, activeElement: null, addEventListener(k, f) { body.addEventListener(k, f); } };
  const body = document.body = new Node('body'); document.documentElement = new Node('html');
  const screen = body.appendChild(new Node('div')); screen.id = 'screenArea';
  const video = screen.appendChild(new Node('video')); video.currentTime = 123;
  const guide = body.appendChild(new Node('div')); guide.id = 'gwrap';
  const legacy = body.appendChild(new Node('button')); legacy.id = 'glassGuide';
  const info = body.appendChild(new Node('div')); info.id = 'infoPanel'; info.classList.add('hide');
  const menu = body.appendChild(new Node('div')); menu.id = 'osdMenu'; menu.classList.add('hide');
  const snapshot = { channel: { number: 150, name: 'Classic Cartoons' }, current: { title: '<b>Cartoon A</b>', provider: 'Internet Archive', durationSeconds: 420 }, state: 'playing', ready: 3 };
  const context = { document, URLSearchParams, location: { search }, console, muted: false,
    Date: class extends Date { constructor(...xs) { super(...(xs.length ? xs : ['2026-10-22T12:00:00'])); } },
    curNum: 150, byNum: () => ({}), guidePlaybackSnapshot: () => snapshot,
    __rsCastIsConnected: () => connected,
    setTimeout: (fn, delay) => { const id = ++clock; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id),
    setInterval: fn => { intervals.push(fn); return intervals.length; },
    fetch: () => { throw Error('presentation must not fetch'); },
    addEventListener(k, fn) { body.addEventListener(k, fn); },
  };
  for (const name of ['step', 'setVol', 'toggleMute', '__rsCastRequest', 'skipOne', 'togglePower', 'toggleInfo', 'toggleOsd', 'tuneNum']) context[name] = (...args) => calls.push([name, ...args]);
  context.openGuide = () => { guide.classList.add('show'); calls.push(['openGuide']); };
  context.closeGuide = () => { guide.classList.remove('show'); calls.push(['closeGuide']); };
  context.window = context; vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/guide-contract-client.js'), 'utf8'), context);
  const shell = path.join(root, 'assets/v6-watching-shell.js');
  assert.ok(fs.existsSync(shell), 'V6 watching presentation must exist');
  vm.runInContext(fs.readFileSync(shell, 'utf8'), context);
  return { context, ids, body, document, screen, video, guide, legacy, snapshot, calls, timers, intervals,
    connect(value) { connected = value; },
    idle() { const entries = [...timers]; timers.clear(); entries.forEach(([, t]) => t.fn()); }
  };
}
test('opt-in activates a labeled dock without touching the current media node', () => {
  const h = harness();
  assert.ok(h.document.documentElement.classList.contains('rs-v6-watch'));
  assert.equal(h.screen.children[0], h.video); assert.equal(h.video.currentTime, 123);
  for (const id of ['Power','Guide','Next','Info','Menu','Mute','Cast','ChDown','ChUp','VolDown','VolUp']) assert.ok(h.ids.get('rsV6' + id)?.textContent);
  assert.equal(h.calls.length, 0);
});
test('flag-off and Cast receivers cannot change the existing presentation', () => {
  for (const search of ['', '?castReceiver=1&v6=1']) {
    const h = harness(search);
    assert.equal(h.document.documentElement.classList.contains('rs-v6-watch'), false);
    assert.ok(!h.ids.get('rsV6Dock') || h.ids.get('rsV6Dock').hidden);
    assert.equal(h.calls.length, 0);
  }
});
test('explicit controls issue one command each through the latest playback wrappers', () => {
  const h = harness(); h.context.skipOne = () => h.calls.push(['latestNext']);
  for (const id of ['Next','ChDown','ChUp','VolDown','VolUp','Power','Mute','Info','Menu','Cast']) h.ids.get('rsV6' + id).click();
  assert.deepEqual(h.calls, [['latestNext'],['step',-1],['step',1],['setVol',-.1],['setVol',.1],['togglePower'],['toggleMute'],['toggleInfo'],['toggleOsd'],['__rsCastRequest']]);
});
test('invalid channel and volume steps are rejected before playback sees them', () => {
  const h = harness();
  for (const n of [0, 2, NaN, '1', null, undefined]) assert.equal(h.context.RealSignalPresentation.command('channel-step', n), false);
  for (const n of [0, 1, -1, NaN, '.1']) assert.equal(h.context.RealSignalPresentation.command('volume-step', n), false);
  assert.equal(h.calls.length, 0);
});
test('refresh renders real title, channel, local date and state as text without restarting media', () => {
  const h = harness(); h.context.RealSignalWatchingShell.refresh();
  assert.equal(h.ids.get('rsV6Title').textContent, '<b>Cartoon A</b>');
  assert.equal(h.ids.get('rsV6Channel').textContent, '150');
  assert.match(h.ids.get('rsV6Date').textContent, /OCT.*22/i);
  assert.match(h.ids.get('rsV6Time').textContent, /12:00/);
  assert.equal(h.ids.get('rsV6Status').textContent, 'PLAYING · Classic Cartoons');
  assert.equal(h.calls.length, 0); assert.equal(h.screen.children[0], h.video);
});
test('idle fading is cancelled by focus, touch, open guide, and standby', () => {
  const h = harness(); h.idle(); assert.ok(h.ids.get('rsV6Dock').classList.contains('is-idle'));
  h.body.dispatch('pointerdown'); assert.equal(h.ids.get('rsV6Dock').classList.contains('is-idle'), false);
  h.ids.get('rsV6Guide').focus(); h.body.dispatch('focusin'); h.idle(); assert.equal(h.ids.get('rsV6Dock').classList.contains('is-idle'), false);
  h.document.activeElement = null; h.guide.classList.add('show'); h.context.RealSignalWatchingShell.refresh(); h.idle();
  assert.equal(h.ids.get('rsV6Dock').classList.contains('is-idle'), false);
  h.guide.classList.remove('show'); h.snapshot.state = 'standby'; h.context.RealSignalWatchingShell.refresh(); h.idle();
  assert.equal(h.ids.get('rsV6Dock').classList.contains('is-idle'), false);
});
test('guide dismissal returns focus to the dock without changing the channel', () => {
  const h = harness(); h.ids.get('rsV6Guide').click(); h.context.RealSignalWatchingShell.refresh();
  h.context.closeGuide(); h.context.RealSignalWatchingShell.refresh();
  assert.equal(h.document.activeElement, h.ids.get('rsV6Guide'));
  assert.deepEqual(h.calls, [['openGuide'],['closeGuide']]);
});
test('connecting Cast exits the canary and disables its commands; disconnect can restore it', () => {
  const h = harness(); h.connect(true); h.context.RealSignalWatchingShell.refresh();
  assert.equal(h.document.documentElement.classList.contains('rs-v6-watch'), false);
  assert.equal(h.ids.get('rsV6Dock').hidden, true);
  h.ids.get('rsV6Next').click(); assert.equal(h.calls.length, 0);
  h.connect(false); h.context.RealSignalWatchingShell.refresh();
  assert.equal(h.ids.get('rsV6Dock').hidden, false);
  assert.ok(h.document.documentElement.classList.contains('rs-v6-watch'));
});
for (const file of ['the_dial_mobile.html', 'the_dial_desktop.html']) {
  test(`${file}: native Enter activation survives the real channel-entry key handler`, () => {
    const h = harness(), source = fs.readFileSync(path.join(root, file), 'utf8');
    const start = source.indexOf('document.addEventListener("keydown",e=>{');
    assert.ok(start >= 0);
    h.context.osdOpen = () => false; h.context.gwrap = h.guide;
    h.context.commitEntry = () => h.calls.push(['unwanted-channel-entry']);
    vm.runInContext(source.slice(start, source.indexOf('\n});', start) + 4), h.context);
    h.ids.get('rsV6Next').press('Enter');
    assert.deepEqual(h.calls, [['skipOne']]);
  });
  test(`${file}: numeric channel entry releases dock focus so Enter cannot toggle Power`, () => {
    const h = harness(), source = fs.readFileSync(path.join(root, file), 'utf8');
    const start = source.indexOf('document.addEventListener("keydown",e=>{');
    h.context.osdOpen = () => false; h.context.gwrap = h.guide;
    h.context.pressDigit = n => h.calls.push(['digit', n]);
    h.context.commitEntry = () => h.calls.push(['commit']);
    vm.runInContext(source.slice(start, source.indexOf('\n});', start) + 4), h.context);
    h.ids.get('rsV6Power').focus();
    for (const key of ['1', '5', '0', 'Enter']) (h.document.activeElement || h.body).press(key);
    assert.deepEqual(h.calls, [['digit','1'],['digit','5'],['digit','0'],['commit']]);
  });
}
