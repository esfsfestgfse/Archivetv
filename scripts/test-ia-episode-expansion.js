#!/usr/bin/env node
/* Regression coverage for Archive collections that contain many playable
   episode files. These identifiers must stay distinct all the way through
   Worker hydration and the browser's direct fallback resolver. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'afterglow_ais_relay_worker.js'), 'utf8');

function sourceBetween(start, end) {
  const from = worker.indexOf(start), to = worker.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `could not locate ${start}`);
  return worker.slice(from, to);
}

const payload = {
  metadata: { collection: ['classic_tv'] },
  files: [
    { name: 'Season 1/Benson_S01E01_Change.mp4', format: 'h.264', length: '551234567' },
    { name: 'Season 1/Benson_S01E02_Trust Me.mp4', format: 'h.264', length: '542345678' },
    { name: 'Season 1/Benson_S01E03_The President\'s Double.mp4', format: 'h.264', length: '532345678' },
    { name: 'Season 1/Benson_S01E01_Change.ia.mp4', format: 'MPEG4', length: '651234567' },
    { name: 'Benson_thumb.jpg', format: 'Thumbnail' },
  ],
};

const context = vm.createContext({
  console,
  Request: class Request { constructor(url) { this.url = url; } },
  IA_PREFIX: '/ia',
  IA_METADATA_TTL_SECONDS: 86400,
  cachedArchiveJson: async () => payload,
  archiveFetch: async () => ({ ok: true, json: async () => payload }),
  iaMetadataInflight: new Map(),
});
vm.runInContext(sourceBetween('function archiveContainerHint', '\nfunction queueKey'), context);
vm.runInContext(sourceBetween('function queueFileUrls', '\nasync function mapQueueCandidates'), context);

(async () => {
  assert.equal(context.archiveContainerHint({ title: 'Benson Complete Series (1979-1986)' }), true, 'complete series must be eligible');
  assert.equal(context.archiveContainerHint({ title: 'Restoration Collection: appliances' }), true, 'collections must be eligible');
  assert.equal(context.archiveContainerHint({ title: 'One feature film' }), false, 'ordinary one-file films must not be fanned out');

  const episodes = await context.expandArchiveContainer({
    identifier: 'benson-complete-series-1979-1986', title: 'Benson Complete Series (1979-1986)', runtime: '25:00', collection: 'classic_tv',
  }, 'https://relay.example', null, 4, 7);
  assert.equal(episodes.length, 3, 'alternate encodes must collapse to three real episodes');
  assert.equal(new Set(episodes.map((episode) => episode.identifier)).size, 3, 'each episode must retain a unique synthetic identity');
  assert.ok(episodes.every((episode) => episode.identifier.includes('::Season 1/')), 'episode identity must retain its exact Archive file path');
  assert.ok(episodes.every((episode) => episode.title.includes('Benson Complete Series')), 'guide titles must keep the parent program identity');
  assert.ok(episodes.every((episode) => episode.runtime === '25:00'), 'Archive byte size must never be mistaken for runtime seconds');
  assert.notEqual(episodes[0].identifier, episodes[1].identifier, 'rotated episode records must remain distinct');

  const unlabelledEpisodes = await context.expandArchiveContainer({
    identifier: 'unlabelled-multi-file-program', title: 'Saturday Night Film Cabinet', runtime: '25:00', collection: 'classic_tv',
  }, 'https://relay.example', null, 5, 9);
  assert.equal(unlabelledEpisodes.length, 3, 'a genuine multi-file item must expand even when its title lacks collection wording');
  assert.ok(unlabelledEpisodes.every((episode) => episode.media && episode.media.url), 'expanded files must carry ready direct media URLs from the manifest');

  const playable = await context.queuePlayable('benson-complete-series-1979-1986::Season 1/Benson_S01E02_Trust Me.mp4', 'https://relay.example', null, ['movies']);
  assert.equal(playable.type, 'video');
  assert.match(playable.url, /\/download\/benson-complete-series-1979-1986\/Season%201\/Benson_S01E02_Trust%20Me\.mp4$/);
  assert.doesNotMatch(playable.url, /%3A%3A/, 'synthetic IDs must never appear in Archive download directories');
  assert.match(worker, /async function expandSeedArchiveContainers\(/, 'the background refill must expand the parent already found by the fast rail');
  assert.match(worker, /const seedEpisodes = await expandSeedArchiveContainers\(/, 'the exact foreground parent must feed the expanded queue before rotated rediscovery');
  assert.match(worker, /\(episodes \|\| \[\]\)\.slice\(0, 2\)/, 'one collection may contribute at most two episodes to a shelf');
  assert.match(worker, /const minimumFiles = archiveContainerHint\(doc\) \? 2 : 3/, 'unlabelled multi-file records need a conservative manifest threshold, not a title-only rejection');
  assert.match(worker, /program-director-container-seed/, 'the direct episode shelf must publish before the slow reserve rebuild');

  for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
    const app = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(app, /sourceId=separator>=0\?rawId\.slice\(0,separator\):rawId/);
    assert.match(app, /requestedFile=separator>=0\?rawId\.slice\(separator\+2\):""/);
    assert.match(app, /archiveBase="https:\/\/archive\.org\/download\/"\+encodeURIComponent\(sourceId\)\+"\/"/);
    assert.match(app, /exactVideo=requestedFile&&cand\.indexOf\(requestedFile\)>=0/);
  }

  console.log('IA episode expansion: passed');
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
