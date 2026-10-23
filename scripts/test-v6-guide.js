const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');

// DOM/clock boundaries only; exercise the actual presenter and command adapter.
function harness(search = '?v6=1') {
  const ids = new Map(), intervals = new Map(), calls = [], reads = [], offscreen = new Set(); let connected = false, serial = 0;
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.listeners = {};
      this.dataset = {}; this.style = {}; this.hidden = false; this.textContent = ''; this.value = ''; this.scrollTop = 0; this.tabIndex = 0;
      const classes = new Set(); this.classList = { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x),
        toggle: (x, on) => { on = on == null ? !classes.has(x) : on; on ? classes.add(x) : classes.delete(x); } }; }
    set id(v) { this._id = v; ids.set(v, this); } get id() { return this._id; }
    appendChild(x) { this.children.push(x); x.parentNode = this; return x; }
    replaceChildren(...xs) { this.children.forEach(x => { x.parentNode = null; }); this.children = []; xs.forEach(x => this.appendChild(x)); }
    setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k] ?? null; }
    addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
    contains(x) { return this === x || this.children.some(c => c.contains(x)); }
    get isConnected() { return document.body.contains(this); }
    focus() { document.activeElement = this; } blur() { document.activeElement = document.body; }
    scrollIntoView() {} getBoundingClientRect() { return offscreen.has(Number(this.dataset.channelNum)) ? { top: 1800, bottom: 1900 } : { top: 0, bottom: 700 }; }
    getClientRects() { return this.hidden ? [] : [this.getBoundingClientRect()]; }
    querySelectorAll() { const out = []; const walk = el => el.children.forEach(c => { if (['BUTTON','INPUT','SELECT'].includes(c.tagName)) out.push(c); walk(c); }); walk(this); return out; }
    dispatch(type, extra = {}) {
      const e = { target: this, key: '', shiftKey: false, defaultPrevented: false, cancelBubble: false,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.cancelBubble = true; }, ...extra };
      for (let at = this; at; at = at.parentNode) { for (const fn of at.listeners[type] || []) fn(e); if (e.cancelBubble) break; }
      if (type === 'keydown' && !e.defaultPrevented && ['Enter',' '].includes(e.key) && this.tagName === 'BUTTON') this.click();
      return e;
    }
    click() { this.dispatch('click'); } press(key, extra) { return this.dispatch('keydown', { key, ...extra }); }
  }
  const document = { createElement: tag => new Node(tag), getElementById: id => ids.get(id) || null,
    addEventListener: (k, fn) => document.body.addEventListener(k, fn) };
  document.body = new Node('body'); document.documentElement = new Node('html'); document.activeElement = document.body;
  const opener = document.body.appendChild(new Node('button')); opener.id = 'rsV6Guide'; opener.focus();
  const legacy = document.body.appendChild(new Node('div')); legacy.id = 'gwrap';
  const rows = [{ num: 150, key: 'toon', nm: 'Classic Cartoons', cat: 'toon' }, { num: 226, key: 'doc', nm: 'Documentary Hour', cat: 'doc' },
    { num: 300, key: 'live', nm: 'Live TV', cat: 'live', source: 'livetv' }];
  const snapshots = {
    150: { channel: { number: 150, name: 'Classic Cartoons' }, state: 'playing', current: { title: '<b>Duck Amuck</b>', provider: 'Internet Archive', durationSeconds: 420 },
      next: { title: 'Popeye', durationSeconds: 480 }, remainingSeconds: 200 },
    226: { channel: { number: 226, name: 'Documentary Hour' }, state: 'ready', next: { title: 'Earth and the Ocean', provider: 'Internet Archive', durationSeconds: 3600 } },
    300: { channel: { number: 300, name: 'Live TV', source: 'livetv' }, state: 'live', live: true, current: { title: 'Select a live channel' } },
  };
  const favorites = new Set([150]);
  const context = { document, URLSearchParams, location: { search }, console, Date, curNum: 150,
    publicLineupChannels: () => rows, isHiddenConsolidatedMember: () => false,
    GUIDE_CATEGORIES: [{ id: 'all', label: 'All channels' }, { id: 'toon', label: 'Cartoons' }, { id: 'doc', label: 'Documentary' }, { id: 'live', label: 'Live' }],
    guideCategoryFor: ch => ({ id: ch.cat, label: ch.cat }), canonicalChannelLabel: ch => ch.nm,
    CHANNEL_META: { 'Documentary Hour': { desc: 'Full documentaries, history and science.' } },
    isFav: n => favorites.has(n), store: { get: () => ['226', '150'] },
    byNum: n => rows.find(x => x.num === n), guidePlaybackSnapshot: ch => { reads.push(ch.num); return snapshots[ch.num]; },
    __rsCastIsConnected: () => connected,
    openGuide: () => { calls.push(['legacy-open']); legacy.classList.add('show'); },
    closeGuide: () => { calls.push(['legacy-close']); legacy.classList.remove('show'); },
    tuneNum: n => calls.push(['tune', n]), toggleFav: n => { calls.push(['favorite', n]); favorites.has(n) ? favorites.delete(n) : favorites.add(n); },
    setInterval: fn => { const id = ++serial; intervals.set(id, fn); return id; }, clearInterval: id => intervals.delete(id),
    setTimeout: () => ++serial, clearTimeout() {},
    fetch: () => { throw Error('guide must not fetch'); }, primeGuideQueues: () => { throw Error('guide must not prime'); },
  };
  context.window = context; vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/guide-contract-client.js'), 'utf8'), context);
  const script = path.join(root, 'assets/v6-guide.js');
  if (fs.existsSync(script)) vm.runInContext(fs.readFileSync(script, 'utf8'), context);
  return { context, document, opener, legacy, ids, calls, intervals, snapshots, reads, offscreen,
    connect(v) { connected = v; }, tick() { [...intervals.values()].forEach(fn => fn()); },
    visibleNumbers() { return ids.get('rsV6GuideList').children.map(x => Number(x.dataset.channelNum)); } };
}

test('open reads verified programs without tuning, priming or touching the legacy guide', () => {
  const h = harness(); h.context.openGuide();
  assert.ok(h.ids.get('rsV6GuidePanel') && !h.ids.get('rsV6GuidePanel').hidden, 'new guide is the active owner');
  assert.equal(h.legacy.classList.contains('show'), false); assert.deepEqual(h.calls, []);
  assert.equal(h.ids.get('rsV6GuideNow-150').textContent, '<b>Duck Amuck</b>');
  assert.equal(h.ids.get('rsV6GuideNext-150').textContent, 'Popeye');
  assert.match(h.ids.get('rsV6GuideRuntime').textContent, /7 min/);
  assert.equal(h.ids.get('rsV6GuideNow-300').textContent, 'Select a live channel');
  assert.match(h.ids.get('rsV6GuideNext-300').textContent, /unavailable/i);
});
test('selection only previews; Watch issues exactly one tune then restores opener', () => {
  const h = harness(); h.context.openGuide(); h.ids.get('rsV6GuideRow-226').click();
  assert.equal(h.ids.get('rsV6GuideChannelName').textContent, 'Documentary Hour'); assert.deepEqual(h.calls, []);
  h.ids.get('rsV6GuideWatch').press('Enter');
  assert.deepEqual(h.calls, [['tune',226]]); assert.equal(h.ids.get('rsV6GuidePanel').hidden, true);
  assert.equal(h.document.activeElement, h.opener); assert.equal(h.intervals.size, 0);
});
test('search matches real known programs and empty results never invent listings', () => {
  const h = harness(); h.context.openGuide(); const input = h.ids.get('rsV6GuideSearch');
  input.value = 'earth'; input.dispatch('input'); assert.deepEqual(h.visibleNumbers(), [226]);
  input.value = 'nothing matching'; input.dispatch('input'); assert.deepEqual(h.visibleNumbers(), []);
  assert.equal(h.ids.get('rsV6GuideWatch').disabled, true);
  assert.match(h.ids.get('rsV6GuideEmpty').textContent, /No channels/);
});
test('category, favorites and recently watched reuse the existing channel data', () => {
  const h = harness(); h.context.openGuide();
  h.ids.get('rsV6GuideCategory').value = 'doc'; h.ids.get('rsV6GuideCategory').dispatch('change'); assert.deepEqual(h.visibleNumbers(), [226]);
  h.ids.get('rsV6GuideCategory').value = 'all'; h.ids.get('rsV6GuideCategory').dispatch('change');
  h.ids.get('rsV6GuideFavorites').click(); assert.deepEqual(h.visibleNumbers(), [150]);
  h.ids.get('rsV6GuideFav-150').press('Enter'); assert.deepEqual(h.calls, [['favorite',150]]); assert.deepEqual(h.visibleNumbers(), []);
  h.ids.get('rsV6GuideRecent').click(); assert.deepEqual(h.visibleNumbers(), [226,150]);
});
test('background refresh keeps focused rows, selection, search and scroll unchanged', () => {
  const h = harness(); h.context.openGuide(); const row = h.ids.get('rsV6GuideRow-226'); row.click(); row.focus();
  h.ids.get('rsV6GuideList').scrollTop = 360; h.snapshots[226].next.title = 'New documentary'; h.tick();
  assert.equal(h.ids.get('rsV6GuideRow-226'), row); assert.equal(h.document.activeElement, row);
  assert.equal(h.ids.get('rsV6GuideList').scrollTop, 360); assert.equal(h.ids.get('rsV6GuideNow-226').textContent, 'New documentary');
  h.context.closeGuide(); h.context.openGuide(); assert.equal(h.ids.get('rsV6GuideList').scrollTop, 360);
  assert.equal(h.ids.get('rsV6GuideChannelName').textContent, 'Documentary Hour');
  assert.ok(h.ids.get('rsV6GuideRow-226') === row, 'unchanged reopen must reuse its directory nodes');
});
test('keyboard navigation and search stay inside the dialog; Escape restores focus', () => {
  const h = harness(); h.context.openGuide(); let leaked = 0; h.document.body.addEventListener('keydown', () => leaked++);
  const row = h.ids.get('rsV6GuideRow-150'); row.focus(); row.press('ArrowDown');
  assert.equal(h.document.activeElement, h.ids.get('rsV6GuideRow-226'));
  h.ids.get('rsV6GuideSearch').press('2'); assert.equal(leaked, 0); assert.deepEqual(h.calls, []);
  const last = h.ids.get('rsV6GuideWatch'); last.focus(); last.press('Tab'); assert.equal(h.document.activeElement, h.ids.get('rsV6GuideClose'));
  h.ids.get('rsV6GuideSearch').press('Escape'); assert.equal(h.ids.get('rsV6GuidePanel').hidden, true);
  assert.equal(h.document.activeElement, h.opener); assert.equal(leaked, 0);
});
test('default and Cast modes keep legacy ownership; mode exit releases the open dialog', () => {
  for (const search of ['', '?v6=1&castReceiver=1']) {
    const h = harness(search); h.context.openGuide(); assert.deepEqual(h.calls, [['legacy-open']]);
    assert.ok(!h.ids.get('rsV6GuidePanel'));
  }
  const h = harness(); h.context.openGuide(); h.connect(true); h.tick();
  assert.equal(h.ids.get('rsV6GuidePanel').hidden, true); assert.equal(h.intervals.size, 0); assert.deepEqual(h.calls, []);
  h.context.openGuide(); assert.deepEqual(h.calls, [['legacy-open']]);
});

test('the replacement owner records guide interactions without making telemetry a dependency', () => {
  const h = harness(), events = [];
  h.context.__rsRelease2Telemetry = { record: event => events.push(event) };
  h.context.openGuide(); h.context.closeGuide();
  assert.deepEqual(events.map(x => x.type), ['guide-open','guide-close']);
  assert.ok(events.every(x => Number.isFinite(x.ms) && x.ms >= 0));
  h.context.__rsRelease2Telemetry.record = () => { throw Error('telemetry unavailable'); };
  h.context.openGuide(); h.context.closeGuide();
  assert.equal(h.ids.get('rsV6GuidePanel').hidden, true);
});

test('opening only reads on-screen program rows and the selected channel, not the entire catalog', () => {
  const h = harness(); h.offscreen.add(300); h.context.openGuide();
  assert.ok(!h.reads.includes(300), 'off-screen queue selection must not delay guide opening');
  h.offscreen.delete(300); h.tick();
  assert.equal(h.ids.get('rsV6GuideNow-300').textContent, 'Select a live channel');
});

test('the real watching shell cannot override focus restored to a non-Guide opener', () => {
  const h = harness();
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/v6-watching-shell.js'), 'utf8'), h.context);
  const power = h.ids.get('rsV6Power'); power.focus();
  h.context.openGuide(); h.context.closeGuide();
  assert.equal(h.document.activeElement.id, power.id);
});

test('reopening restores the last focused dialog control along with selection and scroll', () => {
  const h = harness(); h.context.openGuide();
  h.ids.get('rsV6GuideRow-226').click(); h.ids.get('rsV6GuideRow-226').focus();
  h.context.closeGuide(); h.context.openGuide();
  assert.equal(h.document.activeElement.id, 'rsV6GuideRow-226');
});

test('disconnecting Cast cannot leave a legacy guide competing with or blocking the new owner', () => {
  const h = harness(); h.connect(true); h.context.openGuide();
  h.connect(false); h.context.openGuide();
  assert.equal(h.legacy.classList.contains('show'), false);
  assert.equal(h.ids.get('rsV6GuidePanel').hidden, false);
  h.context.closeGuide();
  h.connect(true); h.context.openGuide(); h.connect(false); h.context.closeGuide();
  assert.equal(h.legacy.classList.contains('show'), false, 'close can still dismiss a legacy guide left by Cast');
});
