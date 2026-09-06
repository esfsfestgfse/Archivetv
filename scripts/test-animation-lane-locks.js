#!/usr/bin/env node
/* Regression locks from the focused animation reliability soak. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
let failures = 0;

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const adult = source.match(/Object\.assign\(PROGRAM\["Adult Animation"\],\{themeMinScore:2,[^\n]+/);
  const after = source.match(/Object\.assign\(PROGRAM\["After School"\],\{era:\[1995,2010\],[^\n]+/);
  const checks = [
    ['Adult Animation uses an exact queue identity', Boolean(adult) && adult[0].includes('queueTerms:[')],
    ['Adult Animation requires an on-title identity', Boolean(adult) && adult[0].includes('require:{title_any:[')],
    ['After School is bounded to the intended era', Boolean(after)],
    ['After School requires known kids-TV title signals', Boolean(after) && after[0].includes('require:{title_any:[')],
    ['After School rejects the observed sitcom bleed', Boolean(after) && after[0].includes('"moone boy"') && after[0].includes('"nick freno"')],
  ];
  for (const [label, pass] of checks) {
    console.log(`${file}: ${label}: ${pass ? 'ok' : 'FAIL'}`);
    if (!pass) failures++;
  }
}
if (failures) process.exitCode = 1;
