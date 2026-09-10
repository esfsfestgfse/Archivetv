#!/usr/bin/env node
/* Proves the Source Suite releases a verified first program before the full
   multi-query catalog resolves. Uses mocked YouTube responses; it never spends
   a real API request or exposes the browser's configured key. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function delayed(value, ms) {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

async function run(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const start = source.indexOf('async function v2YouTube(');
  const end = source.indexOf('\nfunction v2IsoDuration', start);
  assert.ok(start >= 0 && end > start, `${file}: could not extract v2YouTube`);

  const context = {
    YOUTUBE_KEY: 'unit-test-key',
    console,
    setTimeout,
    store: { get: () => 0, set: () => {} },
    v2DiscoveryQueries: () => ['quick', 'slow-a', 'slow-b', 'slow-c'],
    v2Unique: values => {
      const seen = new Set();
      return values.filter(value => {
        const key = String(value && (value.id || value.uuid || value.title) || '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    v2RoundRobin: groups => groups.flat(),
    v2YouTubeBlocked: () => false,
    v2CandidateRelevant: () => true,
    v2Relevant: () => true,
    v2ProgramRuntimeOkay: item => Number(item?.duration || 0) >= 15 * 60,
    v2Text: value => String(value || ''),
    v2AspectRatio: () => 16 / 9,
    v2IsoDuration: () => 22 * 60,
    v2Verified: value => value,
    withTO: promise => promise,
    fetch: url => {
      const address = String(url);
      if (address.includes('/search?')) {
        const query = new URL(address).searchParams.get('q');
        const lag = query === 'quick' ? 5 : 90;
        return delayed({
          ok: true,
          json: () => Promise.resolve({ items: [{
            id: { videoId: query },
            snippet: { title: `${query} full episode`, description: 'verified program', publishedAt: '2000-01-01T00:00:00Z' },
          }] }),
        }, lag);
      }
      const ids = new URL(address).searchParams.get('id').split(',');
      return delayed({
        ok: true,
        json: () => Promise.resolve({ items: ids.map(id => ({
          id,
          status: { embeddable: true },
          contentDetails: { duration: 'PT22M' },
          player: {},
          snippet: { title: `${id} full episode`, description: 'verified program', publishedAt: '2000-01-01T00:00:00Z', channelTitle: 'Verified Source' },
        })) }),
      }, 5);
    },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);

  const started = Date.now();
  let firstAt = 0;
  let firstItems = [];
  const full = await context.v2YouTube({ name: 'Fast Start Unit' }, 0, lane => {
    firstAt = Date.now() - started;
    firstItems = lane.items || [];
  });
  const finishedAt = Date.now() - started;

  assert.ok(firstAt > 0, `${file}: no early verified lane was published`);
  assert.ok(firstItems.length > 0, `${file}: early lane was empty`);
  assert.ok(full.items.length === 4, `${file}: full rotating catalog was not retained`);
  assert.ok(firstAt + 35 < finishedAt, `${file}: first program did not beat full catalog completion (${firstAt}ms vs ${finishedAt}ms)`);
  console.log(`${file}: fast first program ${firstAt}ms; full catalog ${finishedAt}ms`);
}

Promise.all(['the_dial_desktop.html', 'the_dial_mobile.html'].map(run)).catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
