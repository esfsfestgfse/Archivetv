#!/usr/bin/env node
/* Keep Darcys Playground a horror-host station rather than a generic horror shelf. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
let failures = 0;

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const start = source.indexOf('"Darcys Playground": {');
  const end = source.indexOf('\n  },', start);
  const block = start >= 0 && end > start ? source.slice(start, end) : '';
  const checks = [
    ['registers channel 134', /nm:"Darcys Playground", num:134/.test(source)],
    ['locks Joe Bob material', block.includes('"joe bob briggs"')],
    ['locks MonsterVision material', block.includes('"monstervision"')],
    ['keeps Last Drive-In as a discovery signal', block.includes('"the last drive-in"')],
    ['requires two matching identity signals', block.includes('themeMinScore:2')],
    ['rejects generic full features', block.includes('"feature film"')],
    ['never broad-falls back', block.includes('noBlindFallback:true')],
  ];
  for (const [label, pass] of checks) {
    console.log(`${file}: ${label}: ${pass ? 'ok' : 'FAIL'}`);
    if (!pass) failures++;
  }
}
if (failures) process.exitCode = 1;
