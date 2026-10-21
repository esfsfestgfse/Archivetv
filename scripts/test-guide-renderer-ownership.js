#!/usr/bin/env node
// Removing the directory renderer, restoring a second owner, rendering while hidden,
// or routing a card to the wrong channel must fail these tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const files = ['the_dial_mobile.html', 'the_dial_desktop.html'];
const court = { num: 20, key: 'courtroom', nm: 'Courtroom TV', cat: 'TV' };

function harness(source, { shown = true, channels = [court], sheets = false, label = court.nm,
  listing = { now: 'The People’s Court', next: 'Judge Judy', detail: '44 min' } } = {}) {
  const events = { writes: 0, lists: 0, discovery: 0, tunes: [], close: 0, sheets: 0 };
  class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.className = ''; this.html = ''; this.text = ''; this.listeners = {}; this.style = { setProperty() {} }; }
    set innerHTML(value) { events.writes++; this.html = value; this.children = []; }
    get innerHTML() { return this.html; }
    set textContent(value) { events.writes++; this.text = value; this.children = []; }
    get textContent() { return this.text; }
    get childNodes() { return this.children; }
    appendChild(node) { events.writes++; this.children.push(...(node.tag === 'fragment' ? node.children.splice(0) : [node])); return node; }
    insertAdjacentHTML(position, value) { assert.equal(position, 'beforeend'); events.writes++; this.html += value; }
    addEventListener(type, listener) { assert.equal(type, 'click'); (this.listeners[type] || (this.listeners[type] = [])).push(listener); }
    click() { for (const listener of (this.listeners.click || []).slice()) listener(); }
  }
  const list = new Node('list');
  const group = { id: 'tv', label: 'TV & film', meta: 'Television', color: '#67ff86' };
  const labels = Object.fromEntries(['railTitle', 'guideResults', 'guideCount'].map(id => [id, new Node('label')]));
  const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const context = {
    window: sheets ? { closeSheets() { events.sheets++; } } : {},
    document: { createElement: tag => new Node(tag), createDocumentFragment: () => new Node('fragment') },
    chList: list, gwrap: { classList: { contains: name => name === 'show' && shown } },
    visibleChannels() { events.lists++; return channels; },
    GUIDE_CATEGORY_BY_ID: { all: { label: 'All channels' } }, catFilter: 'all',
    GUIDE_MERGE_UI_ENABLED: false, favOnly: false, REAL_CHANNEL_MERGES: [],
    $: id => labels[id], guideCategoryFor: () => group,
    canonicalChannelLabel: () => label, guideFamilyLabel: () => 'Courtroom television',
    CHANNEL_META: {}, curNum: 20, CAT: { TV: '#67ff86' },
    guideListing: () => listing, esch: escape, isFav: num => num === 20,
    tuneNum(num) { events.tunes.push(num); }, closeGuide() { events.close++; },
    fetch() { events.discovery++; throw new Error('Guide renderer must not fetch'); },
    primeGuideQueues() { events.discovery++; throw new Error('Guide renderer must not discover'); },
  };
  const start = source.indexOf('function renderRail(){');
  const end = source.indexOf('/* Queue warming runs while this panel is open', start);
  assert.ok(start >= 0 && end > start, 'renderer section must exist');
  vm.createContext(context);
  new vm.Script(source.slice(start, end), { filename: 'actual-guide-renderers.js' }).runInContext(context);
  return { events, list, labels, render: () => context.renderRail(), rows: () => list.children.filter(node => node.tag === 'button') };
}

function assertHiddenGuide(source) {
  const guide = harness(source, { shown: false });
  guide.render();
  assert.equal(guide.events.writes, 0);
  assert.equal(guide.events.lists, 0);
  assert.equal(guide.events.discovery, 0);
}

function assertCanonicalSelection(source) {
  const guide = harness(source);
  guide.render();
  assert.equal(guide.rows().length, 1);
  const row = guide.rows()[0];
  assert.equal(String(row.dataset.channelNum), '20');
  assert.equal(row.dataset.channelKey, 'courtroom');
  row.click();
  assert.deepEqual(guide.events.tunes, [20]);
  assert.equal(guide.events.close, 1);
  assert.equal(guide.events.sheets, 0);
  assert.equal(guide.events.discovery, 0);
}

for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  test(`${file}: one renderer owns the guide`, () => {
    assert.equal([...source.matchAll(/\bfunction\s+renderRail\s*\(/g)].length, 1);
  });
  test(`${file}: hidden guide does not render or discover`, () => {
    assertHiddenGuide(source);
  });
  test(`${file}: empty results preserve the current empty state`, () => {
    const guide = harness(source, { channels: [] });
    guide.render();
    assert.match(guide.list.innerHTML, /No matching channels yet/);
    assert.equal(guide.rows().length, 0);
    assert.equal(guide.labels.guideCount.textContent, '0 CHANNELS');
    assert.equal(guide.events.discovery, 0);
  });
  test(`${file}: canonical card selects once and closes desktop guide`, () => {
    assertCanonicalSelection(source);
  });
  test(`${file}: mobile selection closes sheets`, () => {
    const guide = harness(source, { sheets: true });
    guide.render();
    guide.rows()[0].click();
    assert.deepEqual(guide.events.tunes, [20]);
    assert.equal(guide.events.sheets, 1);
    assert.equal(guide.events.close, 0);
  });
  test(`${file}: row metadata stays escaped and stable`, () => {
    const guide = harness(source, { label: '<b>Court & TV</b>', listing: {
      now: '<script>bad()</script>', next: 'Next "episode" & more', detail: '<img onerror="bad()">',
    } });
    guide.render();
    const row = guide.rows()[0];
    assert.equal(guide.rows().length, 1);
    assert.equal(row.dataset.channelKey, 'courtroom');
    assert.equal(row.className, 'chcell on');
    assert.match(row.innerHTML, /&lt;b&gt;Court &amp; TV&lt;\/b&gt;/);
    assert.match(row.innerHTML, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
    assert.match(row.innerHTML, /Next &quot;episode&quot; &amp; more/);
    assert.match(row.innerHTML, /&lt;img onerror=&quot;bad\(\)&quot;&gt;/);
    assert.match(row.innerHTML, /<span class="cc-f">★<\/span>/);
    assert.doesNotMatch(row.innerHTML, /<script>|<img onerror=/);
    assert.equal(guide.events.discovery, 0);
  });
  test(`${file}: duplicate-handler mutations violate the single-select contract`, () => {
    const mutated = source.replace('row.addEventListener("click",',
      'row.addEventListener("click",function(){tuneNum(ch.num);});row.addEventListener("click",');
    assert.throws(() => assertCanonicalSelection(mutated), assert.AssertionError);
  });
  test(`${file}: hidden-text mutations violate the zero-write contract`, () => {
    const mutated = source.replace('function renderRail(){',
      'function renderRail(){ $("railTitle").textContent="unexpected";');
    assert.throws(() => assertHiddenGuide(mutated), assert.AssertionError);
  });
}
