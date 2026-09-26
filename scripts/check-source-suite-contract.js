#!/usr/bin/env node
/* Contract checks for the source-suite aggregation path.  These are intentionally
   static: they run in CI without spending upstream API quota. */
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const files = ['the_dial_desktop.html', 'the_dial_mobile.html'];
const issues = [];
const bridge = fs.readFileSync(path.join(repo, 'assets', 'source-catalog-client.js'), 'utf8');
if (!bridge.includes('IA_API_BASE + "/source/catalog"') || !bridge.includes('serverCatalog')) issues.push('server catalog bridge must be present and marked as the preferred Source Suite path');
if (!bridge.includes('realsignal:source-freshness:v3') || !bridge.includes('playedIds: recentFor(profileKey).slice(0, 1)') || !bridge.includes('__rsRecordSourcePlay') || bridge.includes('remember(profileKey, fresh.items)')) issues.push('Source Suite freshness must be newest-first and record actual plays, not catalog fetches');
const serverCatalog = fs.readFileSync(path.join(repo, 'realsignal_source_catalog.js'), 'utf8');
if (!serverCatalog.includes('if (raw.length < SOURCE_MIN_READY)') || !serverCatalog.includes('SOURCE_QUERY_WINDOW = 4') || !serverCatalog.includes('SOURCE_MAX_QUERY_WINDOW = 6') || !serverCatalog.includes('profile.queryWindow || SOURCE_QUERY_WINDOW') || !serverCatalog.includes('profile.peerTubeQueryWindow || profile.queryWindow') || !serverCatalog.includes('profile.peerTubeQueries.length ? profile.peerTubeQueries') || !serverCatalog.includes('peerTubeFallbackQueryWindow') || !serverCatalog.includes('peerTubeInstances(env, profile)') || !serverCatalog.includes('peerTubeInstanceLimit') || !serverCatalog.includes('peerTubeDetailLimit') || !serverCatalog.includes('profile.peerTubeInstances') || !serverCatalog.includes('SOURCE_DETAIL_TIMEOUT_MS = 1800') || !serverCatalog.includes('withTimeout(fetchJson(`${item.instance}/api/v1/videos/') || !serverCatalog.includes('youtubeSearchDuration(profile, rotation)') || !serverCatalog.includes('Full television/film/performance lanes are') || !serverCatalog.includes('SOURCE_YOUTUBE_QUERY_CONCURRENCY = 2') || !serverCatalog.includes('Math.ceil(ids.length / 50)') || !serverCatalog.includes('SOURCE_PROVIDER_BUDGET_MS = 4500') || !serverCatalog.includes('withTimeout(task, SOURCE_PROVIDER_BUDGET_MS)')) issues.push('Source discovery must rotate a bounded query window, keep full-program lanes in the long-form bucket, bound PeerTube fan-out and per-item detail latency, enforce a provider admission budget, and chunk detail hydration to 50 IDs');
if (!serverCatalog.includes('profile.formats') || !serverCatalog.includes('program-form signal in the actual title') || !serverCatalog.includes('formatRelaxed === true && duration >= 20 * 60')) issues.push('Entertainment Source Suite lanes must require an actual full-program form, with only explicitly relaxed long-form profiles allowed to use duration as the form signal');
const sourceRegistry = fs.readFileSync(path.join(repo, 'source_suite_profile_registry.js'), 'utf8');
for (const key of ['animal-care', 'family-tv-club', 'garden-ledger', 'green-culture', 'jukebox-television', 'lesson-reel', 'local-signal', 'memory-bank', 'newsreel-exchange', 'print-shop', 'screen-test', 'sound-lab', 'stage-door', 'travel-reel', 'tv-time-machine', 'variety-hour', 'western-screen']) {
  const start = sourceRegistry.indexOf(`"${key}":`);
  const next = sourceRegistry.indexOf('\n  },', start);
  const section = sourceRegistry.slice(start, next >= 0 ? next + 5 : sourceRegistry.length);
  if (!section.includes('"queryWindow": 6')) issues.push(`${key} must use the bounded six-query depth-repair window`);
}
for (const key of ['family-tv-club', 'green-culture', 'jukebox-television']) {
  const start = sourceRegistry.indexOf(`"${key}":`);
  const next = sourceRegistry.indexOf('\n  },', start);
  const section = sourceRegistry.slice(start, next >= 0 ? next + 5 : sourceRegistry.length);
  if (!section.includes('"persistedMatch"')) issues.push(`${key} must retain a narrow persisted-catalog genre signal`);
}
for (const key of ['green-culture']) {
  const start = sourceRegistry.indexOf(`"${key}":`);
  const next = sourceRegistry.indexOf('\n  },', start);
  const section = sourceRegistry.slice(start, next >= 0 ? next + 5 : sourceRegistry.length);
  if (!section.includes('"queryLimit": 12')) issues.push(`${key} must retain the expanded query pool for serial source rotations`);
}
for (const key of ['print-shop', 'screen-test', 'sound-lab', 'stage-door', 'variety-hour', 'western-screen', 'jukebox-television']) {
  const start = sourceRegistry.indexOf(`"${key}":`);
  const next = sourceRegistry.indexOf('\n  },', start);
  const section = sourceRegistry.slice(start, next >= 0 ? next + 5 : sourceRegistry.length);
  if (!section.includes('"queryLimit": 16') || !section.includes('"peerTubeQueryWindow": 1') || !section.includes('"peerTubeInstanceLimit": 1') || !section.includes('"peerTubeDetailLimit": 12') || !section.includes('"peerTubeFallbackQueryWindow": 1') || !section.includes('"peerTubeInstances": ["https://search.joinpeertube.org"]')) issues.push(`${key} must retain the bounded expanded query pool for serial source rotations`);
}
for (const key of ['sound-lab', 'screen-test', 'western-screen', 'variety-hour', 'jukebox-television', 'garden-ledger', 'stage-door', 'print-shop', 'memory-bank', 'lesson-reel', 'local-signal']) {
  const start = sourceRegistry.indexOf(`"${key}":`);
  const next = sourceRegistry.indexOf('\n  },', start);
  const section = sourceRegistry.slice(start, next >= 0 ? next + 5 : sourceRegistry.length);
  if (!section.includes('"peerTubeQueries":')) issues.push(`${key} must use a curated federated query lane instead of the broad base query pool`);
}
for (const [key, terms] of Object.entries({
  'print-shop': ['"demo"', '"hands-on"', '"tutorial"'],
  'screen-test': ['"oil exploration"', '"petroleum"', '"drilling"'],
  'sound-lab': ['"ambient sounds"', '"slugtv"', '"podcast"'],
  'animal-care': ['"team presentation"', '"judging session"'],
  'garden-ledger': ['"strange horticulture"', '"video game"', '"walkthrough"'],
})) {
  const start = sourceRegistry.indexOf(`"${key}":`);
  const next = sourceRegistry.indexOf('\n  },', start);
  const section = sourceRegistry.slice(start, next >= 0 ? next + 5 : sourceRegistry.length);
  for (const term of terms) if (!section.includes(term)) issues.push(`${key} must retain its lane-specific bleed guard ${term}`);
}
for (const key of ['classic-sitcom-room', 'family-tv-club', 'horror-house', 'western-screen', 'variety-hour', 'talk-show-archive', 'stage-door', 'jukebox-television']) {
  const start = sourceRegistry.indexOf(`"${key}":`);
  const next = sourceRegistry.indexOf('\n  },', start);
  const end = next >= 0 ? next + 5 : sourceRegistry.indexOf('\n});', start);
  const section = sourceRegistry.slice(start, end >= 0 ? end : sourceRegistry.length);
  if (!section.includes('"intent"') || !section.includes('"formats"') || !/(?:full|complete) (?:episode|movie|performance|concert|play|show)/.test(section)) issues.push(`${key} must use program-form Source Suite discovery instead of history-only searches`);
}
for (const key of ['western-screen', 'variety-hour', 'stage-door', 'jukebox-television']) {
  const start = sourceRegistry.indexOf(`"${key}":`);
  const next = sourceRegistry.indexOf('\n  },', start);
  const section = sourceRegistry.slice(start, next >= 0 ? next + 5 : sourceRegistry.length);
  if (!section.includes('"formatRelaxed": true')) issues.push(`${key} must explicitly opt into the long-form title fallback`);
}
for (const [key, terms] of Object.entries({
  'stage-door': ['"full production"', '"complete opera"'],
  'variety-hour': ['"full special"', '"complete variety"'],
  'western-screen': ['"western full film"', '"full-length western"'],
})) {
  const start = sourceRegistry.indexOf(`"${key}":`);
  const next = sourceRegistry.indexOf('\n  },', start);
  const section = sourceRegistry.slice(start, next >= 0 ? next + 5 : sourceRegistry.length);
  for (const term of terms) if (!section.includes(term)) issues.push(`${key} must retain its expanded full-program forms`);
}
const api = fs.readFileSync(path.join(repo, 'realsignal_api_v2_worker.js'), 'utf8');
if (!api.includes('const sourceRefreshCache = new Map()') || !api.includes('refresh already scheduled') || !api.includes('forceDeepRefresh') || !api.includes('server-source-catalog-refresh') || !api.includes('freshnessLedger: true')) issues.push('source refreshes must be deduplicated, deep refreshes must return the expanded union, and freshness filtering must preserve newest-first ledger order');
if (!api.includes('blockedProviders') || !api.includes('eligibleItems = items.filter') || !api.includes('blockedProvidersForGuide') || !api.includes('A row from a provider currently in cooldown')) issues.push('provider cooldowns must remove unhealthy provider rows from catalogs and guide suggestions before rotation');
if (!api.includes('const failed = !skipped && !!health.error;') || !api.includes("COALESCE(last_error, '')<>'no verified items'")) issues.push('an empty Source Suite search must rotate to another query, not trigger or retain a provider cooldown');
if (!api.includes('kind: "source-status"') || !api.includes('async function handleSourceStatus') || !api.includes('d1-requalified-source-catalog')) issues.push('Source Suite audits must have a read-only endpoint for the client-equivalent requalified catalog');
if (!api.includes('body.maintenance === true') || !api.includes('server-source-catalog-maintenance') || !api.includes('options.direct === true')) issues.push('controlled Source Suite refreshes must persist the complete verified provider union before reporting depth');
if (!api.includes('tags: String(item.tags || "")') || !api.includes('metadata.tags || ""') || !api.includes('const tags = String(item && (item.tags || item.tag) || "").toLowerCase()')) issues.push('persisted Source Suite rows must retain provider evidence used by requalification');
if (serverCatalog.includes('item && item.query].join')) issues.push('provider search query text must not count as source-item genre evidence');
if (!api.includes('Query text is retained for provenance, never as a genre signal')) issues.push('persisted Source Suite requalification must not use query provenance as genre evidence');
const refresher = fs.readFileSync(path.join(repo, 'scripts', 'refresh-source-suite-profiles.js'), 'utf8');
if (!refresher.includes('controller.abort(), 35000') || !refresher.includes('maintenance: true')) issues.push('the maintenance refresh runner must allow bounded two-provider hydration to finish');

for (const file of files) {
  const source = fs.readFileSync(path.join(repo, file), 'utf8');
  const name = file;
  const required = [
    [/V2_SOURCE_CACHE_VERSION=28/, 'source catalog cache version must invalidate strict-catalog shelves'],
    [/retainedItems=Array\.isArray\(cached&&cached\.items\)\?cached\.items\.filter/, 'previously verified source items must survive provider outages after requalification'],
    [/cacheValid=!!cached&&Number\(cached\.version\|\|0\)===V2_SOURCE_CACHE_VERSION/, 'only a current source catalog cache may be treated as fresh'],
    [/item\.account,item\.channelTitle/, 'YouTube language screening must inspect channel identity'],
    [/V2_SOURCE_CACHE_TTL=12\*60\*1000/, 'source catalog cache must expire quickly enough to rotate'],
    [/function v2MapLimit\(/, 'provider fan-out must be concurrency bounded'],
    [/if\(name===\"peertube\"\)return v2PeerTubeCold\(profile,rotation,onFirst\)/, 'PeerTube must receive the early verified-results callback'],
    [/async function v2PeerTubeCold\(/, 'PeerTube must have a dedicated cold-start lane'],
    [/function publishFirst\(index,result\)/, 'the catalog loader must release the early verified lane to playback'],
    [/install\(results\.filter\(Boolean\),true,false\)/, 'partial cold-start catalogs must not replace the persisted full catalog'],
    [/href="https:\/\/www\.youtube-nocookie\.com"/, 'the YouTube embed origin must be preconnected for cold starts'],
    [/function v2Verified\(/, 'items must carry a common verification envelope'],
    [/V2_SOURCE_MIN_RUNTIME=15\*60/, 'Source Suite programming must require television-length programs'],
    [/function v2ProgramRuntimeOkay\(/, 'every source item must pass the shared television-runtime gate'],
    [/merged\.filter\(function\(item\)\{return v2Landscape\(item\)&&v2ProgramRuntimeOkay\(item\);\}\)/, 'the final source catalog merge must re-enforce the television-runtime floor'],
    [/!v2Landscape\(item\)\|\|!v2ProgramRuntimeOkay\(item\)/, 'runtime qualification must be enforced at verification time'],
    [/Number\(data\.info\)===0\)advance\(\)/, 'YouTube embeds must advance immediately on their ended signal'],
    [/function v2SourceHealth\(/, 'provider health must be persisted'],
    [/function v2Loc\(/, 'Library of Congress must have a runtime lane'],
    [/p==="youtube"\|\|p==="peertube"/, 'source-suite runtime must restrict providers to YouTube and PeerTube'],
    [/v2LoadProfile\(ch,profile,token,true\)/, 'near-exhausted catalogs must force a rolling refresh'],
    [/V2_SOURCE_READY_BUFFER=5/, 'the source suite must keep a five-program target buffer'],
    [/V2_SOURCE_MIN_CATALOG=12/, 'a twelve-program catalog must be required before a source shelf is treated as healthy'],
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
    [/profileDeny=Array\.isArray\(profile&&profile\.deny\)\?profile\.deny:\[\]/, 'each Source Suite channel must enforce its declared deny list'],
    [/function v2ProgramTitleDeny\(/, 'animation discovery must reject production-talk titles without poisoning film descriptions'],
    [/function v2ProgramCategoryOkay\(/, 'animation discovery must reject unrelated provider categories'],
    [/function v2CandidateRelevant\(/, 'provider summaries must use a coarse candidate gate before full metadata arrives'],
    [/"workshop","masterclass","recap"/, 'entertainment lanes must reject workshop, masterclass and recap filler'],
    [/if\(strict\)return \(topicEvidence&&formatEvidence&&formatIdentity\)/, 'entertainment lanes must require positive program-form evidence'],
    [/function v2AspectRatio\(/, 'source items must expose an orientation check'],
    [/fileRatio=v2AspectRatio\(value\.files\)/, 'PeerTube landscape checks must fall back to rendition dimensions'],
    [/playlistRatio=v2AspectRatio\(value\.streamingPlaylists\)/, 'PeerTube landscape checks must understand playlist renditions'],
    [/function v2Landscape\(/, 'source items must be landscape-only'],
    [/function v2SourceTokens\(/, 'genre qualification must share a tokenized focus vocabulary'],
    [/sortModes=\["-match","-publishedAt","-views","-likes"\]/, 'PeerTube discovery must rotate result ordering'],
    [/function v2TuneRefreshed\(/, 'sparse queues must wait for a genuinely different next item'],
    [/prior=v2Unique\(cachedItems\.concat\(state\.items\|\|\[\]\)\),merged=v2Unique\(prior\.concat\(discovered\)\)/, 'rolling refreshes must retain and extend verified programs instead of replacing the shelf'],
    [/state\.items\.length<=V2_SOURCE_READY_BUFFER/, 'small queues must refresh before replaying a program'],
    [/cachedItems\.length>=V2_SOURCE_MIN_CATALOG/, 'verified cached catalogs must be retained while a refresh expands them'],
    [/\.slice\(0,[45]\),queries=v2DiscoveryQueries\(profile,"peertube"/, 'PeerTube discovery must use all approved instances and anchored rotating query lanes'],
    [/V2_SOURCE_MAX_CONCURRENCY=8/, 'PeerTube discovery must complete its first pass with bounded parallel fan-out'],
    [/queries=v2DiscoveryQueries\(profile,"peertube",rotation,Math\.min\(4,/, 'browser PeerTube fallback must retain its bounded first pass'],
    [/19\[3-9\]\\d\|20\\d\\d\|classic\|vintage\|retro\|golden age\|saturday morning/, 'Cartoon Time Machine must reject modern animation bleed without an era signal'],
    [/Math\.min\(24,V2_SOURCE_MAX_DETAIL\)/, 'PeerTube detail hydration must retain a deeper catalog'],
    [/aspect=v2AspectRatio\(d\)\|\|v2AspectRatio\(x\)\|\|v2AspectRatio\(file\)/, 'PeerTube must verify the source aspect ratio'],
    [/!v2CandidateRelevant\(profile,candidate\)/, 'PeerTube candidates must pass strict qualification after full metadata hydration'],
    [/item\.account,item\.query/, 'hydrated qualification must retain the provider search query as editorial evidence'],
    [/1990s cartoon full episode/, 'Cartoon Time Machine must include 1990s full-episode discovery'],
    [/2000s cartoon full episode/, 'Cartoon Time Machine must include 2000s full-episode discovery'],
    [/full animated TV episode/, 'Cartoon Time Machine must prioritize television-format animation'],
    [/currentProfile\.profileKey===\"cartoon-time-machine\"/, 'Cartoon Time Machine must have channel-specific qualification'],
    [/experimental animation.*student film.*thesis film/, 'Cartoon Time Machine must reject artsy and production-short bleed'],
    [/full\\s\+\(\?:cartoon\|episode\|episode\[s\]\?\)/, 'Cartoon Time Machine must require episode or special program-form evidence'],
    [/seconds&&\(isTelevision\?seconds<600/, 'Cartoon Time Machine must reject undersized TV results without capping long cartoon blocks'],
    [/verification:\{metadata:true,rights:true,landscape:true/, 'verified source items must record landscape proof'],
    [/runtime:true/, 'verified source items must record runtime proof'],
    [/store\.set\("v2source:"\+key,\{version:V2_SOURCE_CACHE_VERSION,at:Date\.now\(\),items:items,health:state\.health\}\)/, 'catalog cache must retain provider health'],
    [/fl\[\]=license.*fl\[\]=rights/, 'Archive discovery must request rights metadata'],
    [/assets\/source-catalog-client\.js/, 'the browser must prefer the server-side Source Suite catalog bridge'],
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
  if (!/server catalog required/.test(youtube) || /YOUTUBE_KEY|youtube\/v3/.test(youtube)) issues.push(`${name}: browser YouTube discovery must be disabled in favor of the server catalog`);
  if (!/function v2YouTubeBlocked\(/.test(source) || !/function v2YouTubeEnglish\(/.test(source) || !/function v2ProgramRuntimeOkay\(/.test(source)) issues.push(`${name}: server-returned YouTube items must retain Shorts, language, how-to, and runtime gates`);
  if (!/tags:metadata\.tags,category:metadata\.category,account:metadata\.account/.test(source) && !/verification:\{metadata:true,rights:true,landscape:true/.test(source)) issues.push(`${name}: YouTube catalogs must preserve qualification metadata across cache restores`);
  if (/YOUTUBE_KEY|https:\/\/www\.googleapis\.com\/youtube\/v3/.test(source)) issues.push(`${name}: browser must not contain a direct YouTube API credential or endpoint`);

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

  if (stamps.length !== 1 || !/^(?:3|4)\.\d+\.\d+-(desktop|mobile)[.-][a-z0-9-]+$/.test(stamps[0] || '')) issues.push(`${name}: source-suite build stamp is missing or stale`);
}

const desktop = fs.readFileSync(path.join(repo, files[0]), 'utf8');
const mobile = fs.readFileSync(path.join(repo, files[1]), 'utf8');
const desktopStamp = (desktop.match(/window\.__ATV_BUILD\s*=\s*"([^"]+)"/) || [])[1];
const mobileStamp = (mobile.match(/window\.__ATV_BUILD\s*=\s*"([^"]+)"/) || [])[1];
if (desktopStamp?.replace('desktop', '') !== mobileStamp?.replace('mobile', '')) issues.push(`desktop/mobile source-suite stamps diverge: ${desktopStamp} vs ${mobileStamp}`);

console.log(`source-suite contract: ${issues.length ? 'FAILED' : 'passed'}`);
for (const issue of issues) console.log(`P0 ${issue}`);
if (issues.length) process.exitCode = 1;
