#!/usr/bin/env node
/* Contract checks for the source-suite aggregation path.  These are intentionally
   static: they run in CI without spending upstream API quota. */
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const files = ['the_dial_desktop.html', 'the_dial_mobile.html'];
const issues = [];

for (const file of files) {
  const source = fs.readFileSync(path.join(repo, file), 'utf8');
  const name = file;
  const required = [
    [/V2_SOURCE_CACHE_VERSION=7/, 'source catalog cache version must be bumped'],
    [/V2_SOURCE_CACHE_TTL=12\*60\*1000/, 'source catalog cache must expire quickly enough to rotate'],
    [/function v2MapLimit\(/, 'provider fan-out must be concurrency bounded'],
    [/function v2Verified\(/, 'items must carry a common verification envelope'],
    [/function v2SourceHealth\(/, 'provider health must be persisted'],
    [/function v2Loc\(/, 'Library of Congress must have a runtime lane'],
    [/p==="youtube"\|\|p==="peertube"/, 'source-suite runtime must restrict providers to YouTube and PeerTube'],
    [/v2LoadProfile\(ch,profile,token,true\)/, 'near-exhausted catalogs must force a rolling refresh'],
    [/store\.set\("v2source:"\+key,\{version:V2_SOURCE_CACHE_VERSION,at:Date\.now\(\),items:items,health:state\.health\}\)/, 'catalog cache must retain provider health'],
    [/fl\[\]=license.*fl\[\]=rights/, 'Archive discovery must request rights metadata'],
  ];
  for (const [pattern, message] of required) if (!pattern.test(source)) issues.push(`${name}: ${message}`);

  const peerStart = source.indexOf('async function v2PeerTube(');
  const peerEnd = source.indexOf('async function v2YouTube(', peerStart);
  const peer = peerStart >= 0 && peerEnd > peerStart ? source.slice(peerStart, peerEnd) : '';
  if (/Promise\.all\(raw\.map|type:"embed"/.test(peer)) issues.push(`${name}: PeerTube detail lane must not use unbounded work or unverifiable embed fallbacks`);
  if (!/return \{provider:"PeerTube",items:/.test(peer)) issues.push(`${name}: PeerTube must return normalized provider results and health`);

  const youtubeStart = source.indexOf('async function v2YouTube(');
  const archiveStart = source.indexOf('async function v2Archive(', youtubeStart);
  const youtube = youtubeStart >= 0 && archiveStart > youtubeStart ? source.slice(youtubeStart, archiveStart) : '';
  if (!/embed-eligible/.test(youtube) || !/v2YouTubeBlocked/.test(youtube)) issues.push(`${name}: YouTube must preserve embed eligibility and Shorts/language/how-to filtering`);

  const stamps = [...source.matchAll(/window\.__ATV_BUILD\s*=\s*"([^"]+)"/g)].map(match => match[1]);
  if (stamps.length !== 1 || !/\.010-cast-discovery$/.test(stamps[0] || '')) issues.push(`${name}: source-suite build stamp is missing or stale`);
}

const desktop = fs.readFileSync(path.join(repo, files[0]), 'utf8');
const mobile = fs.readFileSync(path.join(repo, files[1]), 'utf8');
const desktopStamp = (desktop.match(/window\.__ATV_BUILD\s*=\s*"([^"]+)"/) || [])[1];
const mobileStamp = (mobile.match(/window\.__ATV_BUILD\s*=\s*"([^"]+)"/) || [])[1];
if (desktopStamp?.replace('desktop', '') !== mobileStamp?.replace('mobile', '')) issues.push(`desktop/mobile source-suite stamps diverge: ${desktopStamp} vs ${mobileStamp}`);

console.log(`source-suite contract: ${issues.length ? 'FAILED' : 'passed'}`);
for (const issue of issues) console.log(`P0 ${issue}`);
if (issues.length) process.exitCode = 1;
