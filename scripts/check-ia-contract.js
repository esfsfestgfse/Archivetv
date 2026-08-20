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
    if (c === '/' && source[i + 1] === '/') { const end = source.indexOf('\n', i + 2); if (end < 0) break; i = end; continue; }
    if (c === '/' && source[i + 1] === '*') { const end = source.indexOf('*/', i + 2); if (end < 0) throw new Error(`Unclosed comment after ${marker}`); i = end + 1; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === open) depth++;
    if (c === close && --depth === 0) return source.slice(bodyStart, i);
  }
  throw new Error(`Unclosed ${marker}`);
}

const chBlock = blockAfter('const CH=[', '[', ']');
const channels = new Map([...chBlock.matchAll(/\{nm:"([^"]+)",\s*num:(\d+)([^}]*)\}/g)].map(m => [m[1], {
  number: Number(m[2]), audio: /audio:true/.test(m[3]), category: (m[3].match(/cat:"([^"]+)"/) || [])[1] || null
}]));

const programBlock = blockAfter('\nconst PROGRAM =', '{', '}');
const programNames = new Set([...programBlock.matchAll(/^\s*"([^"]+)":\s*\{/gm)].map(m => m[1]));
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

const sportsSuite = [
  'Sports Center','Hard Count','The Octagon','Sports Vault','Auto Racing','Roller Derby & Wrestling',
  'Friday Night Fights','Gridiron Classics','Hardwood Classics','Diamond Time','Ice Time','Olympic Archive',
  'College Game Day','The Pitch','Trackside','The Sporting Life','Surf / Skate / Snow','Women in Sport',
  "Coaches' Clinic",'Sports Newsreel','Rodeo Roundup','The Fairway','Racquet Club','Equestrian','Winter Games',
  'Regatta','Stock Car Nation','Grand Prix','The Gymnasium','The Recreation Room'
];
for (let offset = 0; offset < sportsSuite.length; offset++) {
  const name = sportsSuite[offset], channel = channels.get(name), expected = 50 + offset;
  if (!channel || channel.number !== expected || channel.category !== 'SPORTS') issues.push(`sports suite slot ${expected} must be ${name}`);
  if (name !== 'Sports Center' && !programNames.has(name)) issues.push(`${expected} ${name}: sports archive lane needs a PROGRAM definition`);
}

const commercialStart = source.indexOf('/* ===== commercial breaks:');
const commercialEnd = commercialStart < 0 ? -1 : source.indexOf('/* Station Bumpers', commercialStart);
const commercialBlock = commercialStart < 0 || commercialEnd < 0 ? '' : source.slice(commercialStart, commercialEnd);
if (!commercialBlock) issues.push('commercial engine block is missing');
else {
  if (!/AD_LANES=\[/.test(commercialBlock) || (commercialBlock.match(/years:\[/g) || []).length < 6) issues.push('commercial engine needs rotating multi-era lanes');
  if (!/\(ch&&ch\.audio\)\?"audio":"movies"/.test(commercialBlock)) issues.push('commercial searches must select audio only for audio channels');
  if (!/pl\.type!==kind/.test(commercialBlock)) issues.push('commercial playback must reject a mismatched media type');
  if (!/mediatype:"\+mt/.test(commercialBlock)) issues.push('commercial queries must declare an explicit media type');
}

console.log(`${path.basename(file)}: ${issues.length ? 'FAILED' : 'passed'} IA contract checks`);
for (const issue of issues) console.log(`P0 ${issue}`);
if (issues.length) process.exitCode = 1;
