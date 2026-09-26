#!/usr/bin/env node
/* The Hunt must stay an actual outdoor-TV lane, not a generic wildlife or
 * weapons lane. Keep the recognizable show names and the 1990s shelf alive. */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
let failures = 0;
for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const required = [
    '{nm:"The Hunt", num:80',
    'Ted Nugent',
    'Spirit of the Wild',
    'American Sportsman',
    'North American Hunter',
    'TNN Outdoors',
    '[1980,1999]',
    'maxPerCreator:1',
    'gear review',
    'music video',
    'shorts'
  ];
  for (const token of required) {
    const ok = source.includes(token);
    console.log(`${file}: ${token}: ${ok ? 'ok' : 'FAIL'}`);
    if (!ok) failures++;
  }
}
if (failures) process.exitCode = 1;
else console.log('Hunting channel contract passed: Ted Nugent/classic outdoor TV lanes, 1990s coverage, diversity caps, and contamination filters are present.');
