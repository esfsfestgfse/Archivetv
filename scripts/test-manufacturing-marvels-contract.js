#!/usr/bin/env node
/* Regression lock for the factory-only Manufacturing Marvels lane. */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const relay = fs.readFileSync(path.join(root, 'afterglow_ais_relay_worker.js'), 'utf8');
let failures = 0;
const required = [
  'themeMinScore:4',
  'era:[1930,2026]',
  'require:{title_any:',
  '"manufacturing process"',
  '"factory tour"',
  '"assembly line"',
  '"packaging"',
  '"leapfrog"',
  '"cartoon"',
  'iaCachedProgramAllowed',
  'manufacturingMarvelsGateVersion',
];
for (const token of ['IA_STRICT_RECOVERY_CHANNELS', 'strictRecoveryQueue', 'program-director-strict-recovery']) {
  const pass = relay.includes(token);
  console.log(`relay: ${token}: ${pass ? 'ok' : 'FAIL'}`);
  if (!pass) failures++;
}
const strictRecoveryKeepsManufacturing = /IA_STRICT_RECOVERY_CHANNELS\s*=\s*new Set\(\[[^\]]*"200"/.test(relay);
console.log(`relay: strict recovery retains channel 200: ${strictRecoveryKeepsManufacturing ? 'ok' : 'FAIL'}`);
if (!strictRecoveryKeepsManufacturing) failures++;

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const start = source.indexOf('Object.assign(PROGRAM["Manufacturing Marvels"],{');
  const end = source.indexOf('/* Commercials are their own video station', start);
  const block = start >= 0 && end > start ? source.slice(start, end) : '';
  for (const token of required) {
    const pass = block.includes(token) || source.includes(token);
    console.log(`${file}: ${token}: ${pass ? 'ok' : 'FAIL'}`);
    if (!pass) failures++;
  }
  const strictQuery = /var requiredTitles=\(\(prog\.require&&prog\.require\.title_any\)/.test(source) && /titleClause=requiredTitles/.test(source);
  console.log(`${file}: title-gated query rails: ${strictQuery ? 'ok' : 'FAIL'}`);
  if (!strictQuery) failures++;
}

if (failures) process.exitCode = 1;
