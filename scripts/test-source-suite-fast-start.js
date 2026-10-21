#!/usr/bin/env node
/* Proves Source Suite YouTube discovery is server-owned. The browser must not
   make direct YouTube API calls or depend on a client credential for startup;
   the API Worker owns discovery and returns the first verified lane. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

async function run(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert.equal(/youtube\/v3|YOUTUBE_KEY/.test(source), false, `${file}: browser contains a direct YouTube API path`);
  const serverStart = source.indexOf('async function v2YouTube(');
  const serverEnd = source.indexOf('\nfunction v2IsoDuration', serverStart);
  assert.ok(serverStart >= 0 && serverEnd > serverStart, `${file}: could not extract server-only YouTube adapter`);
  const serverContext = {};
  vm.createContext(serverContext);
  vm.runInContext(source.slice(serverStart, serverEnd), serverContext);
  const serverResult = await serverContext.v2YouTube({ name: 'Server-Owned Unit' });
  assert.equal(serverResult.items.length, 0);
  assert.equal(serverResult.health.reason, 'server catalog required');
  console.log(`${file}: browser YouTube adapter is server-only`);
  return;
}

async function darkroomAdmission() {
  const { sourceProfile, qualifySourceItem } = await import('../realsignal_source_catalog.js');
  const profile = sourceProfile({ profileKey: 'darkroom' });
  const good = { id: 'youtube:photo-proof', provider: 'YouTube', title: 'The History of Camera Flashes', duration: 1700, aspectRatio: 16 / 9, language: 'en', rights: 'Standard YouTube license', url: 'https://www.youtube-nocookie.com/embed/photo-proof' };
  assert.ok(qualifySourceItem(profile, good), 'photography programming remains admitted');
  const badTitle = 'DARKROOM & X -RAY FILM PROCESSING |150 ONE-LINERS +100 MCQ | AIIMS CRE PHASE-4 |RADIOGRAPHER';
  assert.equal(qualifySourceItem(profile, { ...good, title: badTitle }), null, 'clinical exam preparation is not photography programming');
  for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
    const row = fs.readFileSync(path.join(root, file), 'utf8').split('\n').find(line => line.trim().startsWith('"darkroom":'));
    const client = vm.runInNewContext('({' + row.trim().replace(/,$/, '') + '})').darkroom;
    assert.ok(client.deny.some(term => badTitle.toLowerCase().includes(term)), `${file}: retained client caches reject the same clinical result`);
  }
  console.log('Darkroom admission preserves photography and rejects clinical exam material.');
}

Promise.all([...['the_dial_desktop.html', 'the_dial_mobile.html'].map(run), darkroomAdmission()]).catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
