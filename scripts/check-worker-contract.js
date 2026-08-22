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
if (!/const SPACE_PATH = "\/live\/space"/.test(source)) issues.push('Space needs a narrow edge-data route');
if (numericConstant('SPACE_TTL_SECONDS') !== 900) issues.push('Space edge snapshot must respect the anonymous launch-data rate limit');
if (!/const path = "\/2\.3\.0\/launches\/upcoming/.test(source) || !/ll\.thespacedevs\.com/.test(source)) issues.push('Space route needs the supported Launch Library 2.3 feed');
if (!/ssd-api\.jpl\.nasa\.gov\/cad\.api/.test(source) || !/ssd-api\.jpl\.nasa\.gov\/fireball\.api/.test(source)) issues.push('Space route needs both JPL close-approach and fireball feeds');
if (!/images-api\.nasa\.gov\/search/.test(source)) issues.push('Space route needs the NASA mission-imagery feed');
if (!/new Request\(url\.origin \+ SPACE_PATH \+ "\/cache\/v3"\)/.test(source)) issues.push('Space route must use one fixed edge-cache key');
if (!/lldev\.thespacedevs\.com/.test(source) || !/launch-library-mirror/.test(source)) issues.push('Space launch board needs the provider mirror when the anonymous live pool returns 429');
if (!/thespacedevs-dev\.nyc3\.digitaloceanspaces\.com/.test(source) || !/thespacedevs-prod\.nyc3\.digitaloceanspaces\.com/.test(source)) issues.push('Launch mirror image URLs must resolve against the production media bucket');
if (!/Promise\.allSettled\(\[/.test(source) || !/failures, launchSource:.*launches, approaches, fireballs, imagery/.test(source)) issues.push('Space route must survive individual provider failures');
if (!/ctx\.waitUntil\(cache\.put\(cacheKey, response\.clone\(\)\)\.catch/.test(source)) issues.push('Space cache writes must be backgrounded and observed');
if (!/const WATER_PATH = "\/live\/water"/.test(source)) issues.push('River & Lake Watch needs a narrow edge-data route');
if (numericConstant('WATER_TTL_SECONDS') !== 300) issues.push('Water snapshots must use a five-minute live cache');
if (!/api\.water\.noaa\.gov\/nwps\/v1\/gauges/.test(source) || !/\/stageflow"/.test(source)) issues.push('Water route needs NWPS gauge metadata and stageflow history');
if (!/lat < -90 \|\| lat > 90 \|\| lon < -180 \|\| lon > 180/.test(source) || !/Math\.min\(120/.test(source)) issues.push('Water coordinates and radius must be bounded');
if (!/WATER_PATH \+ "\/cache\/v2\/"/.test(source)) issues.push('Water route must use the current location-bucketed edge cache schema');
if (!/candidates\.length < 8/.test(source) || !/downsampleWaterSeries/.test(source)) issues.push('Water hydration must stay bounded and downsample 72-hour series');
if (!/stale-while-revalidate=900/.test(source)) issues.push('Water route needs stale-while-revalidate resilience');
if (!/value == null \|\| value === ""/.test(source)) issues.push('Water normalization must preserve missing readings instead of coercing them to zero');
if (!/const TROPICAL_PATH = "\/live\/tropical"/.test(source)) issues.push('Tropical Watch needs a narrow NHC operations route');
if (numericConstant('TROPICAL_TTL_SECONDS') !== 300) issues.push('Tropical snapshots must use a five-minute live cache');
if (!/CurrentStorms\.json/.test(source) || !/MIATWOAT\.shtml/.test(source) || !/MIATWOEP\.shtml/.test(source) || !/HFOTWOCP\.shtml/.test(source)) issues.push('Tropical route must combine active storms with all three NHC basin outlooks');
if (!/parseNhcForecast/.test(source) || !/FORECAST\|OUTLOOK/.test(source)) issues.push('Tropical route must normalize official forecast positions and winds');
if (!/parseNhcGraphics/.test(source) || !/_5day_cone_with_line_and_wind/.test(source) || !/_5day_cone_sm/.test(source)) issues.push('Tropical route must prefer full-resolution NHC cones with a discovered small-product fallback');
if (!/GOES19/.test(source) || !/GOES18/.test(source) || !/900x540\.jpg/.test(source)) issues.push('Tropical route must publish verified, bandwidth-bounded GOES imagery');
if (!/TROPICAL_PATH \+ "\/cache\/v6"/.test(source) || !/stale-while-revalidate=900/.test(source)) issues.push('Tropical route needs the current edge cache and stale resilience');
if (!/const TROPICAL_IMAGE_PATH = TROPICAL_PATH \+ "\/image"/.test(source)) issues.push('Tropical Watch needs a narrow image relay route');
if (!/safeTropicalImageSource/.test(source) || !/storm_graphics\|xgtwo/.test(source) || !/cdn\.star\.nesdis\.noaa\.gov/.test(source)) issues.push('Tropical image relay must allow-list only NHC products and bounded GOES sectors');
if (!/relayedTropicalProducts/.test(source) || !/tropicalImageRelayUrl/.test(source)) issues.push('Tropical JSON must publish edge-relayed imagery instead of browser hotlinks');
if (!/Cross-Origin-Resource-Policy/.test(source) || numericConstant('TROPICAL_IMAGE_TTL_SECONDS') !== 300) issues.push('Tropical image relay needs cross-origin headers and a five-minute cache');
if (!/const WILDFIRE_PATH = "\/live\/wildfire"/.test(source)) issues.push('Wildfire Watch needs a narrow edge-data route');
if (numericConstant('WILDFIRE_TTL_SECONDS') !== 300) issues.push('Wildfire snapshots must use a five-minute live cache');
if (!/WFIGS_Incident_Locations_Current/.test(source) || !/WFIGS_FIELDS/.test(source)) issues.push('Wildfire route must use the authoritative WFIGS incident layer');
if (!/api\.weather\.gov\/alerts\/active\?point=/.test(source) || !/normalizeWildfireAlerts/.test(source)) issues.push('Wildfire route must include bounded local NWS fire-weather alerts');
if (!/Math\.min\(500, Math\.round\(Number\(url\.searchParams\.get\("radius"\)\)/.test(source)) issues.push('Wildfire coordinates and radius must be bounded');
if (!/WILDFIRE_PATH \+ "\/cache\/v1\//.test(source) || !/stale-while-revalidate=900/.test(source)) issues.push('Wildfire route needs a location-bucketed resilient edge cache');
if (!/Access-Control-Expose-Headers.*X-Afterglow-Source, X-Afterglow-Cache/.test(source)) issues.push('Browser diagnostics must be able to read safe Worker source and cache headers');

console.log(`Worker contract: ${issues.length ? 'FAILED' : 'passed'}`);
for (const issue of issues) console.log(`P0 ${issue}`);
if (issues.length) process.exitCode = 1;
