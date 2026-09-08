#!/usr/bin/env node
/* Regression guard for targeted IA queue repairs. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
let failures = 0;

function assignment(source, channel) {
  const marker = `Object.assign(PROGRAM["${channel}"],`;
  const start = source.lastIndexOf(marker);
  if (start < 0) return '';
  const end = source.indexOf('\n', start);
  return source.slice(start, end < 0 ? source.length : end);
}

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const kids = assignment(source, 'Kids Hour');
  const fishing = assignment(source, 'Tight Lines');
  const rerun = assignment(source, 'Modern Rerun TV');
  const arcade = assignment(source, 'Arcade Archive');
  const cop = assignment(source, 'Cop Show Classic');
  const commercials = assignment(source, 'Vintage Commercials');
  const checks = [
    ['Kids Hour has a broad but kid-TV-specific rail', kids.includes('"sesame street"') && kids.includes('"square one television"')],
    ['Tight Lines can lead with direct fishing material', fishing.includes('queueTerms:["fishing"') && fishing.includes('require:{title_any:[')],
    ['Modern Rerun rejects the observed film-analysis bleed', rerun.includes('"lolita"') && rerun.includes('"film analysis"')],
    ['Modern Rerun requires a TV/sitcom identity in titles', rerun.includes('require:{title_any:[') && rerun.includes('"sitcom"')],
    ['Arcade Archive rejects the observed skate bleed', arcade.includes('"tony hawk"') && arcade.includes('"skateboarding"')],
    ['Cop Show Classic requires a recognizable program identity', cop.includes('require:{title_any:[') && cop.includes('"dragnet"')],
    ['Cop Show Classic rejects civil-defense and political false positives', cop.includes('"police-state"') && cop.includes('"civil defense"')],
    ['Cop Show Classic rejects the observed Loose Cannon false positive', source.includes('PROGRAM["Cop Show Classic"].deny') && source.includes('"loose cannon"')],
    ['Commercials rotate by decade and product lane', commercials.includes('"1940s commercial"') && commercials.includes('"2020s commercial"') && commercials.includes('"automobile commercial"')],
    ['Commercials remain video-only', commercials.includes('"audio only"') && commercials.includes('"radio commercial"')],
  ];
  for (const [label, pass] of checks) {
    console.log(`${file}: ${label}: ${pass ? 'ok' : 'FAIL'}`);
    if (!pass) failures++;
  }
}

if (failures) process.exitCode = 1;
