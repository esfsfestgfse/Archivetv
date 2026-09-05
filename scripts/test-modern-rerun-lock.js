#!/usr/bin/env node
/* Keep the general-rerun lane distinct from the dedicated kids channels. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
let failures = 0;

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const start = source.indexOf('"Modern Rerun TV": {');
  const end = source.indexOf('\n  },', start);
  const block = start >= 0 && end > start ? source.slice(start, end) : '';
  const checks = [
    ['keeps the observed Dragon Tales bleed out', block.includes('"dragon tales"')],
    ['keeps explicit kids metadata out', block.includes('"children\'s television"') && block.includes('"preschool"')],
    ['keeps animation in its dedicated lanes', block.includes('"cartoon"') && block.includes('"animated"')],
  ];
  for (const [label, pass] of checks) {
    console.log(`${file}: ${label}: ${pass ? 'ok' : 'FAIL'}`);
    if (!pass) failures++;
  }
}
if (failures) process.exitCode = 1;
