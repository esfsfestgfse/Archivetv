const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const channel = { num: 504, nm: 'On This Day', source: 'onthisday' };
const programs = [
  { year: 1980, text: 'An event from today', pages: [{ title: 'Event_A' }, { title: 'Event_A' }] },
  { year: 1995, text: 'A second event from today', pages: [{ title: 'Event B' }] },
  { year: 2000, text: 'A third event from today', pages: [{ title: 'Event C' }] },
];

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const start = html.indexOf('async function tuneOnThisDay(');
  const end = html.indexOf('\nnlog("boot"', start);
  assert(start >= 0 && end > start);

  function harness({ fetch, playFile }) {
    const context = {
      token: 1, AbortController, fetch, playFile, curItem: {},
      nowName: {}, nowMeta: {}, overlay: [],
      nlog() {}, setSig() {}, clearScreen() {},
      setTimeout(run, ms) { assert.equal(ms, 4000); context.expire = run; },
      clearTimeout() { context.expire = null; },
      showOv(...args) { context.overlay = args; },
    };
    vm.createContext(context);
    vm.runInContext(html.slice(start, end), context, { filename: file });
    return context;
  }

  test(file + ' bounds searches and falls back to actual events after failed clips', async () => {
    const pending = [];
    const played = [];
    const app = harness({
      fetch(url, { signal }) {
        if (url.includes('wikipedia.org')) return { ok: true, json: () => ({ events: programs }) };
        return new Promise((resolve, reject) => {
          signal.addEventListener('abort', reject, { once: true });
          const id = pending.length;
          pending.push(() => resolve({ ok: true, json: () => ({ query: { pages: {
            picture: { index: 0, imageinfo: [{ mediatype: 'BITMAP', url: 'https://upload.wikimedia.org/file.jpg' }] },
            clip: { index: 1, imageinfo: [{ mediatype: 'VIDEO', url: 'https://upload.wikimedia.org/clip-' + id + '.webm' }] },
          } } }) }));
        });
      },
      playFile(item) { played.push(item.url); return false; },
    });
    const tune = app.tuneOnThisDay(channel, 1);
    await new Promise(setImmediate);
    assert.equal(pending.length, 3, 'all distinct Commons searches launch without waiting on another');
    pending[0]();
    pending[1]();
    await new Promise(setImmediate);
    app.expire();
    await tune;
    assert.equal(played.length, 2, 'only the two videos can reach playback');
    assert(played.every(url => url.endsWith('.webm')));
    assert(programs.some(program => program.text === app.overlay[2]));
    assert.equal(app.expire, null);
    assert.match(html, /ch\?\.source==="onthisday"\?3000:/);
  });

  test(file + ' does not start a clip or replace the screen after another channel takes over', async () => {
    let finishSearch;
    const app = harness({
      fetch(url) {
        if (url.includes('wikipedia.org')) return { ok: true, json: () => ({ events: programs.slice(0, 1) }) };
        return new Promise(resolve => { finishSearch = resolve; });
      },
      playFile() { assert.fail('superseded tune cannot start video'); },
    });
    const tune = app.tuneOnThisDay(channel, 1);
    await new Promise(setImmediate);
    app.token = 2;
    const overlay = app.overlay;
    finishSearch({ ok: true, json: () => ({ query: { pages: {
      clip: { index: 0, imageinfo: [{ mediatype: 'VIDEO', url: 'https://upload.wikimedia.org/clip.webm' }] },
    } } }) });
    await tune;
    assert.equal(app.overlay, overlay);
  });
}
