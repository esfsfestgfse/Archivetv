#!/usr/bin/env node
/* Regression lock for the factory-only Manufacturing Marvels lane. */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
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

let failures = 0;
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
