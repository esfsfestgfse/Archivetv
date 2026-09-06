#!/usr/bin/env node
/* A fresh Source Suite pull must extend its verified catalog, not collapse it. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
let failures = 0;

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const checks = [
    ['invalidates prior narrow source caches', source.includes('V2_SOURCE_CACHE_VERSION=14')],
    ['retains cached verified catalog items', source.includes('prior=v2Unique(cachedItems.concat(state.items||[]))')],
    ['mixes retained and newly discovered items', source.includes('merged=v2Unique(prior.concat(discovered))')],
    ['keeps the 96-item catalog ceiling', source.includes('V2_SOURCE_CATALOG_SIZE=96')],
    ['keeps the five-program ready buffer', source.includes('V2_SOURCE_READY_BUFFER=5')],
  ];
  for (const [label, pass] of checks) {
    console.log(`${file}: ${label}: ${pass ? 'ok' : 'FAIL'}`);
    if (!pass) failures++;
  }
}
if (failures) process.exitCode = 1;
