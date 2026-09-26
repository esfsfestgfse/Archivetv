#!/usr/bin/env node
/* Retirement guard: decade-specific stations were removed after their sparse
   metadata made them unreliable. Keep this test so the old lineup cannot
   silently return while the broad genre stations remain healthy. */
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const retired = [
  ['243', 'tv_early'], ['244', 'tv_1950s'], ['245', 'tv_1960s'], ['246', 'tv_1970s'],
  ['247', 'tv_1980s'], ['248', 'tv_1990s'], ['249', 'tv_2000s'], ['250', 'tv_2010s'],
  ['260', 'movie_early'], ['261', 'movie_1950s'], ['262', 'movie_1960s'], ['263', 'movie_1970s'],
  ['264', 'movie_1980s'], ['265', 'movie_1990s'], ['266', 'movie_2000s'], ['267', 'movie_2010s'],
  ['268', 'movie_2020s'],
];
const issues = [];

for (const file of ['the_dial_desktop.html', 'the_dial_mobile.html']) {
  const html = fs.readFileSync(path.join(repo, file), 'utf8');
  const records = [...html.matchAll(/\{nm:"([^"]+)",\s*num:(\d+),[^\n]*?gl:"([^"]+)"/g)];
  const ids = records.map((match) => match[2]);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicateIds.length) issues.push(`${file}: duplicate channel ids ${duplicateIds.join(', ')}`);
  for (const [channel, profileKey] of retired) {
    const record = records.find((match) => match[2] === channel);
    if (record) issues.push(`${file}: retired decade channel ${channel} is still public`);
    if (html.includes(`${profileKey}:`)) issues.push(`${file}: retired query profile ${profileKey} is still present`);
  }
}

console.log(`IA hybrid lineup: ${issues.length ? 'FAILED' : 'passed'}`);
for (const issue of issues) console.log(`P0 ${issue}`);
if (issues.length) process.exitCode = 1;
