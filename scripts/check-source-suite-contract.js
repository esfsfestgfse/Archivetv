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
    [/V2_SOURCE_CACHE_VERSION=11/, 'source catalog cache version must be bumped'],
    [/V2_SOURCE_CACHE_TTL=12\*60\*1000/, 'source catalog cache must expire quickly enough to rotate'],
    [/function v2MapLimit\(/, 'provider fan-out must be concurrency bounded'],
    [/function v2Verified\(/, 'items must carry a common verification envelope'],
    [/function v2SourceHealth\(/, 'provider health must be persisted'],
    [/function v2Loc\(/, 'Library of Congress must have a runtime lane'],
    [/p==="youtube"\|\|p==="peertube"/, 'source-suite runtime must restrict providers to YouTube and PeerTube'],
    [/v2LoadProfile\(ch,profile,token,true\)/, 'near-exhausted catalogs must force a rolling refresh'],
    [/V2_SOURCE_MIN_CATALOG=5/, 'five-item catalogs must be eligible for a warm shelf'],
    [/function v2Shelf\(/, 'catalog ordering must persist the last on-air shelf'],
    [/function v2Hash\(/, 'source rotation must have a stable per-lane hash'],
    [/function v2NextRotation\(/, 'source refreshes must advance a persisted rotation counter'],
    [/function v2QueryWindow\(/, 'provider queries must rotate through the full lane query pool'],
    [/function v2DiscoveryQueries\(/, 'each provider pass must combine a permanent channel anchor with rotating discovery'],
    [/const V2_SOURCE_MODE_GROUPS=/, 'every source channel must declare a programming intent'],
    [/const V2_SOURCE_TOPIC_OVERRIDES=/, 'every source channel must declare strict topic anchors'],
    [/function v2ProgramQueries\(/, 'source discovery must generate program-form queries'],
    [/suffixes\.forEach\(function\(suffix\)\{topics\.forEach/, 'each provider pass must stripe queries across channel topics'],
    [/function v2ProgramDeny\(/, 'source discovery must reject commentary and seminar filler'],
    [/function v2ProgramTitleDeny\(/, 'animation discovery must reject production-talk titles without poisoning film descriptions'],
    [/function v2ProgramCategoryOkay\(/, 'animation discovery must reject unrelated provider categories'],
    [/function v2CandidateRelevant\(/, 'provider summaries must use a coarse candidate gate before full metadata arrives'],
    [/"workshop","masterclass","recap"/, 'entertainment lanes must reject workshop, masterclass and recap filler'],
    [/if\(strict\)return topicEvidence&&formatEvidence&&formatIdentity/, 'entertainment lanes must require positive program-form evidence'],
    [/function v2AspectRatio\(/, 'source items must expose an orientation check'],
    [/fileRatio=v2AspectRatio\(value\.files\)/, 'PeerTube landscape checks must fall back to rendition dimensions'],
    [/playlistRatio=v2AspectRatio\(value\.streamingPlaylists\)/, 'PeerTube landscape checks must understand playlist renditions'],
    [/function v2Landscape\(/, 'source items must be landscape-only'],
    [/function v2SourceTokens\(/, 'genre qualification must share a tokenized focus vocabulary'],
    [/sortModes=\["-match","-publishedAt","-views","-likes"\]/, 'PeerTube discovery must rotate result ordering'],
    [/orders=\["relevance","date","viewCount","rating"\]/, 'YouTube discovery must rotate result ordering'],
    [/function v2TuneRefreshed\(/, 'sparse queues must wait for a genuinely different next item'],
    [/merged=force\?v2Unique\(state\.items\.slice\(\)\.concat\(discovered\)\)/, 'rolling refreshes must accumulate verified programs instead of replacing the shelf'],
    [/state\.items\.length<=V2_SOURCE_READY_BUFFER/, 'small queues must refresh before replaying a program'],
    [/cachedItems\.length>=V2_SOURCE_MIN_CATALOG/, 'small cached catalogs must be refreshed instead of replayed'],
    [/\.slice\(0,4\),queries=v2DiscoveryQueries\(profile,"peertube"/, 'PeerTube discovery must use all approved instances and anchored rotating query lanes'],
    [/V2_SOURCE_MAX_CONCURRENCY=8/, 'PeerTube discovery must complete its first pass with bounded parallel fan-out'],
    [/queries=v2DiscoveryQueries\(profile,"peertube",rotation,Math\.min\(4,/, 'PeerTube discovery must use an anchored four-query first pass'],
    [/if\(raw\.length<3\)/, 'PeerTube fallback must be reserved for genuinely sparse first passes'],
    [/Math\.min\(24,V2_SOURCE_MAX_DETAIL\)/, 'PeerTube detail hydration must retain a deeper catalog'],
    [/aspect=v2AspectRatio\(d\)\|\|v2AspectRatio\(x\)/, 'PeerTube must verify the source aspect ratio'],
    [/!v2Relevant\(profile,candidate\)/, 'PeerTube candidates must pass strict qualification after full metadata hydration'],
    [/part=snippet,contentDetails,status,player&maxWidth=1280/, 'YouTube must request public player dimensions'],
    [/verification:\{metadata:true,rights:true,landscape:true/, 'verified source items must record landscape proof'],
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
  if (!/v2CandidateRelevant\(profile,x\)/.test(youtube) || !/!v2Relevant\(profile,metadata\)/.test(youtube)) issues.push(`${name}: YouTube must use candidate and hydrated qualification gates`);
  if (!/tags:metadata\.tags,category:metadata\.category,account:metadata\.account/.test(youtube)) issues.push(`${name}: YouTube catalogs must preserve qualification metadata across cache restores`);

  const stamps = [...source.matchAll(/window\.__ATV_BUILD\s*=\s*"([^"]+)"/g)].map(match => match[1]);
  const profileStart = source.indexOf('const V2_PREVIEW_PROFILES={');
  const profileEnd = source.indexOf('};', profileStart);
  const modeStart = source.indexOf('const V2_SOURCE_MODE_GROUPS={');
  const modeEnd = source.indexOf('};', modeStart);
  const topicStart = source.indexOf('const V2_SOURCE_TOPIC_OVERRIDES={');
  const topicEnd = source.indexOf('};', topicStart);
  const profileKeys = [...source.slice(profileStart, profileEnd).matchAll(/\n\s*"([a-z0-9-]+)":\{name:/g)].map(match => match[1]);
  const modeBlock = source.slice(modeStart, modeEnd);
  const topicKeys = [...source.slice(topicStart, topicEnd).matchAll(/"([a-z0-9-]+)":\[/g)].map(match => match[1]);
  for (const key of profileKeys) {
    const modeCount = (modeBlock.match(new RegExp(`"${key}"`, 'g')) || []).length;
    if (modeCount !== 1) issues.push(`${name}: ${key} must appear in exactly one programming mode`);
    if (!topicKeys.includes(key)) issues.push(`${name}: ${key} is missing strict topic anchors`);
  }
  if (new Set(topicKeys).size !== topicKeys.length) issues.push(`${name}: duplicate source topic definitions found`);

  if (stamps.length !== 1 || !/\.042-source-programming$/.test(stamps[0] || '')) issues.push(`${name}: source-suite build stamp is missing or stale`);
}

const desktop = fs.readFileSync(path.join(repo, files[0]), 'utf8');
const mobile = fs.readFileSync(path.join(repo, files[1]), 'utf8');
const desktopStamp = (desktop.match(/window\.__ATV_BUILD\s*=\s*"([^"]+)"/) || [])[1];
const mobileStamp = (mobile.match(/window\.__ATV_BUILD\s*=\s*"([^"]+)"/) || [])[1];
if (desktopStamp?.replace('desktop', '') !== mobileStamp?.replace('mobile', '')) issues.push(`desktop/mobile source-suite stamps diverge: ${desktopStamp} vs ${mobileStamp}`);

console.log(`source-suite contract: ${issues.length ? 'FAILED' : 'passed'}`);
for (const issue of issues) console.log(`P0 ${issue}`);
if (issues.length) process.exitCode = 1;
