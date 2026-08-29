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
if (!/var permanentEra=prog\.era\|\|\[/.test(source) || !/var permanentSubjects=/.test(source)) issues.push('every PROGRAM channel needs a permanent full-era fast rail');
if (/const NS=|const PROFILES=/.test(source)) issues.push('retired clock vocabulary and profiles must not remain in the app bundle');
if (!/IA_MEDIA_WARM_MAX=6/.test(source)) issues.push('first-frame shelf must stay bounded to six media elements');
if (!/IA_PROGRAM_FAILURE_TTL=12\*60\*1000/.test(source) || !/function iaMarkProgramFailed\(id\)/.test(source) || !/iaProgramFailed\(item\.identifier\)/.test(source)) issues.push('failed archive items must be temporarily quarantined before another queue pick');
if (!/for\(var queuedTry=0;queued&&queuedTry<5;queuedTry\+\+\)/.test(source) || !/iaMarkProgramFailed\(queued\.identifier\)/.test(source)) issues.push('a channel tune must exhaust its usable queue shelf before returning to discovery');
if (!/primeIACompanions\(ch,sl\)/.test(source)) issues.push('channel tuning must prioritize the active and neighboring IA queues');
if (!/var warmDelay=index===0\?0:1500\+\(index-1\)\*1500/.test(source)) issues.push('companion queue warming must stagger behind the active station');
if (!/function iaLocalQueueFallback\(ch,sl\)/.test(source) || !/using local shelf/.test(source)) issues.push('IA queue must retain a strict local fallback when the relay is unavailable');
if (!/takeIAMediaWarmer\(ch,it\)/.test(source)) issues.push('playback must adopt a staged first-frame media element');
if (!/v\.readyState>=2\)setTimeout\(function\(\)\{fin\(true\);\},0\)/.test(source)) issues.push('staged media must clear tuning even when readiness predates listeners');
if (!/if\(prog\)\{buildProgramQueries\(prog,ch,false\)/.test(source)) issues.push('marathon mode must preserve PROGRAM channel constraints');

const slotBlock = blockAfter('function slotFor(', '{', '}');
if (/getHours|names\s*\[|PROFILES|seasonalProfileName/.test(slotBlock)) issues.push('slotFor must never select programming from the clock or a seasonal profile');
if (!/return \{show:ch\.nm, genre:prog\.genre\|\|ch\.gl/.test(slotBlock) || !/show:ch\.nm, source:ch\.source/.test(slotBlock)) issues.push('every source and PROGRAM slot must use the permanent channel name on air');
if (/show:prog\.show/.test(slotBlock)) issues.push('legacy PROGRAM show labels must never rename an IA channel');
if (/id="setPlan"|function buildPlan\(|function planKey\(|stationMgr\?/.test(source)) issues.push('clock-bound Station Manager appointments must remain retired');
if (/barsText\.textContent=\(hour/.test(source)) issues.push('color bars must not sign off according to the clock');
const naraBlock = blockAfter('async function tuneNARA(', '{', '}');
if (/getHours|\bh\s*>=|Late Night Declassified/.test(naraBlock)) issues.push('National Archives programming must expose every editorial lane at every hour');
if (!/var labels=\["NOW","NEXT","LATER","AFTER"\]/.test(source)) issues.push('TV guide must describe queue order instead of hourly programming gates');
if (!/window\.__atvTimelessAudit=function\(\)/.test(source) || !/identity:permanentShow===ch\.nm/.test(source)) issues.push('runtime timeless-programming identity audit is missing');
if (!/IA_TIMELESS_IDENTITY_VERSION=2/.test(source) || !/store\.set\("sched",\{\}\)/.test(source) || !/store\.set\("fastTune",\{\}\)/.test(source)) issues.push('legacy clock-scheduled playback state must be cleared once on upgrade');
if (/cm\.best\?'<div class="ip-row"><b>BEST<\/b>/.test(source)) issues.push('channel info must not advertise clock-based best-time windows');
if (!/window\.__atvIAManifest=function\(\)/.test(source)) issues.push('runtime IA queue manifest hook is missing');
if (!/queries:iaQueueQueries\(sl\)/.test(source) || !/var qs=iaQueueQueries\(sl\)/.test(source) || !/themeMinScore:Math\.max\(1,Math\.min\(12,Number\(sl&&sl\.program&&sl\.program\.themeMinScore\)\|\|1\)\)/.test(source)) issues.push('the IA soak manifest must exercise the exact production queue rails and score gate');
if (!/const IA_EDITORIAL_DIVERSITY=\{maxPerEra:1,maxPerLane:1,maxPerCreator:1,maxPerCollection:2\}/.test(source) || !/function iaQueueDiversity\(sl\)/.test(source) || !/diversity:iaQueueDiversity\(sl\)/.test(source)) issues.push('IA queues must transmit bounded editorial diversity preferences');
const guideListingBlock = blockAfter('function guideListing(', '{', '}');
if (/schedGet/.test(guideListingBlock) || !/guideQueueNext\(ch,sl,current\)/.test(guideListingBlock)) issues.push('guide listings must use live playback or the current queue, never persisted clock records');
if (!/function primeGuideQueues\(rows\)/.test(source) || !/queue=\(rows\|\|visibleChannels\(\)\)\.filter/.test(source) || !/primeGuideQueues\(CH\)/.test(source)) issues.push('both guide views must actively fill their IA queues');
if (!/\.guide-directory\{[^}]*grid-template-columns:minmax\(0,1fr\)!important;[^}]*grid-template-areas:"top" "preview" "list" "ticker"!important/.test(source) || !/\.guide-directory \.guide-layout\{[^}]*grid-area:list!important/.test(source)) issues.push('the RealSignal directory must own a complete named grid instead of inheriting the legacy cable layout');
if (!/\.guide-directory \.guide-main\{[^}]*flex:1 1 auto!important;[^}]*width:100%/.test(source) || !/\.guide-directory \.chlist\{[^}]*flex:1 1 auto!important;[^}]*width:100%!important/.test(source)) issues.push('the RealSignal directory main pane and channel list must fill their available width');

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
  if (!/deadline=Date\.now\(\)\+4500/.test(commercialBlock)) issues.push('commercial discovery must have a whole-break deadline');
  if (!/adQueue=0;return false/.test(commercialBlock)) issues.push('failed or interrupted commercial breaks must clear their queue');
}
if (!/if\(adsOn&&adQueue>0\)/.test(source)) issues.push('queued ads must not play after commercials are disabled');

console.log(`${path.basename(file)}: ${issues.length ? 'FAILED' : 'passed'} IA contract checks`);
for (const issue of issues) console.log(`P0 ${issue}`);
if (issues.length) process.exitCode = 1;
