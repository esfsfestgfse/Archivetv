#!/usr/bin/env node
/* Guard the IA query contract shared by the mobile and desktop builds. */
const fs = require('node:fs');
const path = require('node:path');

const file = process.argv[2] || path.join(__dirname, '..', 'the_dial_mobile.html');
const source = fs.readFileSync(file, 'utf8');
const issues = [];

function blockAfter(marker, open, close) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${marker}`);
  const bodyStart = source.indexOf(open, start) + open.length;
  let depth = 1, quote = null, escaped = false;
  for (let i = bodyStart; i < source.length; i++) {
    const c = source[i];
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === open) depth++;
    if (c === close && --depth === 0) return source.slice(bodyStart, i);
  }
  throw new Error(`Unclosed ${marker}`);
}

const chBlock = blockAfter('const CH=[', '[', ']');
const channels = new Map([...chBlock.matchAll(/\{nm:"([^"]+)",\s*num:(\d+)([^}]*)\}/g)].map(m => [m[1], {
  number: Number(m[2]), audio: /audio:true/.test(m[3])
}]));

const programBlock = blockAfter('\nconst PROGRAM =', '{', '}');
const audioOnly = new Set(['opensource_audio', 'audio_music', '78rpm', 'georgeblood', 'netlabels', 'oldtimeradio', 'OTRR_Certified', 'OldTimeRadio', 'NASAAudioCollection']);
const movieOnly = new Set(['prelinger', 'feature_films', 'feature_films_unsorted', 'classic_tv', 'classic_tv_1970s', 'classic_tv_1980s', 'classic_tv_1990s', 'FedFlix', 'avgeeks']);

for (const match of programBlock.matchAll(/^\s*"([^"]+)":\s*\{([\s\S]*?)(?=^\s*"[^"]+":\s*\{|\n\};)/gm)) {
  const name = match[1], channel = channels.get(name);
  if (!channel) continue;
  const collections = [...match[2].matchAll(/collections\s*:\s*\[([^\]]*)\]/g)]
    .flatMap(m => [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]));
  for (const collection of collections) {
    if (!channel.audio && audioOnly.has(collection)) issues.push(`${channel.number} ${name}: video PROGRAM uses audio-only ${collection}`);
    if (channel.audio && movieOnly.has(collection)) issues.push(`${channel.number} ${name}: audio PROGRAM uses movie-only ${collection}`);
  }
}

if (!/fl\[\]=subject/.test(source) || !/fl\[\]=runtime/.test(source)) issues.push('IA advanced search must request subject and runtime for PROGRAM filters');
if (!/&fields=identifier,title,year,subject,runtime/.test(source)) issues.push('IA scrape search must request subject and runtime for PROGRAM filters');
if (!/var globalQs = \[\]/.test(source) || !/qs\.concat\(globalQs\)/.test(source)) issues.push('PROGRAM global subject fallback must remain after collection-scoped rails');

console.log(`${path.basename(file)}: ${issues.length ? 'FAILED' : 'passed'} IA contract checks`);
for (const issue of issues) console.log(`P0 ${issue}`);
if (issues.length) process.exitCode = 1;
