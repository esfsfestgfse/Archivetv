#!/usr/bin/env node
/* Keep the Modern Cartoons TV-format gate mirrored across desktop and mobile. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
let failures = 0;
for (const name of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  const source = fs.readFileSync(path.join(root, name), 'utf8');
  const start = source.indexOf('Object.assign(PROGRAM["Modern Cartoons"]');
  const block = start >= 0 ? source.slice(start, source.indexOf('\n', start)) : '';
  const checks = [
    ['has a dedicated queue identity', block.includes('queueTerms:[')],
    ['requires television-program title signals', block.includes('require:{title_any:[')],
    ['rejects the observed Hindi-story bleed', block.includes('"hindi"') && block.includes('"kahani"')],
    ['rejects vertical/social filler', block.includes('"vtuber"') && block.includes('"meme"')],
  ];
  for (const [label, passed] of checks) {
    console.log(`${name}: ${label}: ${passed ? 'ok' : 'FAIL'}`);
    if (!passed) failures++;
  }
}
if (failures) process.exitCode = 1;
