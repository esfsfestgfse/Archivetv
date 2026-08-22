#!/usr/bin/env node
/* Guard the low-latency Archive queue contract used by every IA channel. */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'afterglow_ais_relay_worker.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8');
const issues = [];

function numericConstant(name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`));
  return match ? Number(match[1]) : 0;
}

if (numericConstant('IA_SEARCH_TTL_SECONDS') < 21600) issues.push('Archive searches must stay warm for at least six hours');
if (numericConstant('IA_METADATA_TTL_SECONDS') < 86400) issues.push('resolved media metadata must stay warm for at least one day');
if (numericConstant('IA_QUEUE_TTL_SECONDS') < 21600) issues.push('five-show queues must stay warm for at least six hours');
if (!/IA_QUEUE_CACHE_VERSION\s*=\s*"v8"/.test(source)) issues.push('queue cache version must invalidate the old zero-ready shelves');
if (!/cachedArchiveJson\(cacheKey, ttlSeconds, load, ctx\)/.test(source)) issues.push('Archive cache writes must receive the request context');
if (!/if \(ctx\) ctx\.waitUntil\(write\)/.test(source)) issues.push('Archive cache writes must leave the response critical path');
if (!/ctx\.waitUntil\(cache\.put\(cacheKey, response\.clone\(\)\)\.catch/.test(source)) issues.push('hydrated queue cache writes must be backgrounded and observed');
if (!/hydrateIaQueue\(payload, count, url\.origin, ctx\)/.test(source)) issues.push('queue hydration must propagate the request context');
if (!/Math\.min\(8, queries\.length\)/.test(source)) issues.push('queue discovery must sample every app-supplied editorial rail');
if (!/Math\.min\(15, Math\.max\(count, count \* 3\)\)/.test(source)) issues.push('queue hydration needs three candidates per requested ready item');
if (!/mapQueueCandidates\(payload\.items, 5,/.test(source)) issues.push('metadata hydration must cap Archive concurrency at five');
if (!/attempt < 1/.test(source)) issues.push('metadata transport failures need one bounded retry');
if (!numericConstant('IA_PARTIAL_QUEUE_TTL_SECONDS') || numericConstant('IA_PARTIAL_QUEUE_TTL_SECONDS') > 120) issues.push('partial shelves must be retried within two minutes');
if (!/ready\.ready >= count \? IA_QUEUE_TTL_SECONDS : IA_PARTIAL_QUEUE_TTL_SECONDS/.test(source)) issues.push('underfilled shelves must not receive the full queue TTL');
if (!/hydrating: false, empty: true/.test(source)) issues.push('an empty discovery shelf must not masquerade as active hydration');
if (!/"compatibility_date":\s*"2026-08-20"/.test(config)) issues.push('Wrangler compatibility date is stale');
if (!/"compatibility_flags":\s*\["nodejs_compat"\]/.test(config)) issues.push('Wrangler must enable nodejs_compat');
if (!/const ADSB_PATH = "\/live\/adsb"/.test(source)) issues.push('Sky Beacon needs the narrow ADS-B edge route');
if (numericConstant('ADSB_TTL_SECONDS') !== 10) issues.push('ADS-B edge snapshots must use the ten-second live cache');
if (!/const ADSB_USER_AGENT = "Afterglow\/.+github\.com\/esfsfestgfse\/Archivetv/.test(source)) issues.push('ADS-B requests must identify Afterglow and its contact URL');
if (!/lat < -90 \|\| lat > 90 \|\| lon < -180 \|\| lon > 180/.test(source)) issues.push('ADS-B coordinates must be bounded before upstream fetches');
if (!/Math\.min\(250, Math\.round\(Number\(url\.searchParams\.get\("radius"\)\)/.test(source)) issues.push('ADS-B radius must be capped');
if (!/ctx\.waitUntil\(cache\.put\(cacheKey, response\.clone\(\)\)\.catch/.test(source)) issues.push('ADS-B cache writes must be backgrounded and observed');
if (!/setTimeout\(resolve, 1100\)/.test(source) || !/adsb\.lol retry/.test(source)) issues.push('ADS-B relay must recover respectfully from a transient 429');
if (!/api\.adsb\.one\/v2\/point/.test(source) || !/opendata\.adsb\.fi\/api\/v3\/lat/.test(source) || !/api\.cors\.syrins\.tech/.test(source)) issues.push('ADS-B relay needs independent community mirrors');
if (!/source = "opensky"/.test(source) || !/normalizeOpenSky/.test(source)) issues.push('ADS-B relay needs a normalized OpenSky fallback');

console.log(`Worker contract: ${issues.length ? 'FAILED' : 'passed'}`);
for (const issue of issues) console.log(`P0 ${issue}`);
if (issues.length) process.exitCode = 1;
