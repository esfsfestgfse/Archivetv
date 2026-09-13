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

Promise.all(['the_dial_desktop.html', 'the_dial_mobile.html'].map(run)).catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
