/**
 * Afterglow AIS Relay — Cloudflare Worker
 * ============================================================================
 * Provides resilient vessel data to the Afterglow Ship Tracker.
 *
 * aisstream.io explicitly documents "we block direct browser connections",
 * so the Ship Tracker channel (num 965) can't reach them from the app directly.
 * This Worker has two independent paths:
 *   - WebSocket relay to aisstream.io for low-latency messages when available.
 *   - Cached HTTP snapshots from Kpler AIS when the stream is unavailable.
 * Both provider keys stay on the Cloudflare side and never enter the browser
 * bundle. Snapshot navigation is limited to named world regions; only the
 * original Gulf region can use the paid Kpler query, so this public client
 * cannot turn the Worker into an arbitrary paid-data proxy.
 *
 * Deployment: see docs/AIS_RELAY_DEPLOY.md for one-time setup steps.
 *
 * Client contract:
 *   1. Browser opens `wss://ais-relay.tdy1990.workers.dev/`
 *   2. First message from browser must be the SubscriptionMessage JSON
 *      (BoundingBoxes, FiltersShipMMSI, FilterMessageTypes) MINUS the APIKey
 *      field — the Worker injects that from its env secret before forwarding.
 *   3. Every subsequent message in either direction is forwarded verbatim.
 *   4. Either side closing drops the paired connection.
 *
 * Env vars (set as Secrets in Workers dashboard):
 *   AIS_API_KEY     optional aisstream.io API key for the WebSocket stream
 *   KPLER_API_KEY   optional Kpler API key, already encoded for `Basic <key>`
 * ============================================================================ */

/* IMPORTANT: Cloudflare Workers `fetch()` accepts https:// only. The wss:// upgrade happens
   because of the Upgrade: websocket header, not the URL scheme. Using wss:// throws
   "Fetch API cannot load" and returns 502 to the client. */
const AISSTREAM_URL = "https://stream.aisstream.io/v0/stream";
const KPLER_URL = "https://api.kpler.com/v2/maritime/ais-latest";
const OPEN_WATERS_GULF_URL = "https://ais.openwaters.io/v1/vessels?bbox=18,-98,31,-80";
const OPEN_WATERS_URL = "https://ais.openwaters.io/v1/vessels?bbox=";
const SNAPSHOT_PATH = "/snapshot";
const IA_PREFIX = "/ia";
const IA_QUEUE_PATH = IA_PREFIX + "/queue";
const IA_PROGRAM_PATH = IA_PREFIX + "/program";
const ADSB_PATH = "/live/adsb";
const SPACE_PATH = "/live/space";
const WATER_PATH = "/live/water";
const AIR_PATH = "/live/air";
const RADAR_PATH = "/live/radar";
const TROPICAL_PATH = "/live/tropical";
const TROPICAL_IMAGE_PATH = TROPICAL_PATH + "/image";
const WILDFIRE_PATH = "/live/wildfire";
const MARINE_PATH = "/live/marine";
const STORM_CENTER_PATH = "/live/storms";
const STORM_CENTER_IMAGE_PATH = STORM_CENTER_PATH + "/image";
const TEXAS_HIGHWAY_IMAGE_PATH = "/live/highways/image";
const WORLD_CAM_IMAGE_PATH = "/live/cams/image";
const SNAPSHOT_TTL_SECONDS = 60;
/* Bump when the public snapshot contract changes so an older raw-provider
   response cannot be served to a client that expects normalized GeoJSON. */
const SNAPSHOT_CACHE_VERSION = "v2";
const ADSB_TTL_SECONDS = 10;
const SPACE_TTL_SECONDS = 900;
const WATER_TTL_SECONDS = 300;
const AIR_TTL_SECONDS = 900;
const RADAR_TTL_SECONDS = 120;
const TROPICAL_TTL_SECONDS = 300;
const TROPICAL_IMAGE_TTL_SECONDS = 300;
const TROPICAL_CACHE_VERSION = "v7";
const WILDFIRE_TTL_SECONDS = 300;
const MARINE_TTL_SECONDS = 300;
const MARINE_CACHE_VERSION = "v1";
const STORM_CENTER_TTL_SECONDS = 300;
const STORM_CENTER_IMAGE_TTL_SECONDS = 300;
const STORM_CENTER_CACHE_VERSION = "v1";
const TEXAS_HIGHWAY_TTL_SECONDS = 15;
const WORLD_CAM_TTL_SECONDS = 60;
const ADSB_USER_AGENT = "Afterglow/1.7 (+https://github.com/esfsfestgfse/Archivetv)";
const IA_SEARCH_TTL_SECONDS = 21600;
/* Bump this when the normalized search response changes so an older edge
   entry cannot be mistaken for the current program-director result. */
const IA_SEARCH_CACHE_VERSION = "v5";
const IA_ARCHIVE_RETRY_DELAY_MS = 180;
const IA_ARCHIVE_RETRY_MAX_DELAY_MS = 900;
const IA_METADATA_TTL_SECONDS = 86400;
const IA_QUEUE_TTL_SECONDS = 86400;
const IA_PARTIAL_QUEUE_TTL_SECONDS = 15;
/* The public shelf is still five playable programs, but the rolling catalog
   behind it must be large enough to represent real Archive collections. Keep
   the larger strict budget for named/genre-locked stations and a smaller one
   for broad stations so depth grows without bringing the old synchronous
   warmup back onto the channel-change path. */
const IA_STRICT_CATALOG_CANDIDATE_MAX = 96;
const IA_CATALOG_CANDIDATE_MAX = 72;
const IA_CATALOG_BUDGET_VERSION = "catalog-96-72-deep-harvest-v3";
/* A queue with zero playable items is never a useful cache result. Keep the
   queue namespace separate from the previous release while the empty result
   path below is deliberately no-store. */
/* v98 keeps Archive multi-file programs and their sibling episodes in the
   candidate shelf. A cold tune still returns a verified
   parent program immediately, while the background shelf expands collection
   items into their individual playable episode files. The depth-recovery
   namespace also prevents old five-item shelves from masking the wider
   rotation rails below. Cache this separately from v49: episode data waited
   behind reserve rebuilding and could expire
   before the small, already-resolved container shelf was written. */
const IA_QUEUE_CACHE_VERSION = "v111";
/* Last-good shelves share the v101 namespace so an older shallow shelf
   never masks the repaired episode-level catalog. */
const IA_LAST_GOOD_CACHE_VERSION = "v111";
/* Five playable items are the on-air shelf, not the catalog. Keep at least
   four shelves of distinct, verified media behind it so a warm tune or skip
   does not keep replaying the same five records while Archive discovery is
   still catching up. */
const IA_FRESHNESS_CANDIDATE_FLOOR = 24;
const IA_QUEUE_KV_PREFIX = "realsignal:ia:queue:";
/* The queue is allowed to be warm, but the opening program must not be warm
   forever. Keep a small durable history per channel so a reload, second
   device, or new rotation cannot reopen on the same five records. This is an
   issued-shelf ledger (not a permanent ban): once the unseen catalog is
   exhausted, the selection helper deliberately relaxes the exclusion. */
const IA_FRESHNESS_LEDGER_VERSION = "v1";
const IA_FRESHNESS_LEDGER_MAX = 32;
const IA_FRESHNESS_LEDGER_TTL_SECONDS = 30 * 24 * 60 * 60;
const IA_FRESHNESS_MEMORY_TTL_MS = 60 * 1000;
/* A short per-isolate burst cache absorbs repeat requests from a TV, phone,
   and guide opened in quick succession. It is intentionally tiny and
   short-lived: Cache API/KV remain the durable shelves, while this map only
   bridges the small window before an edge cache write becomes visible. */
const IA_QUEUE_MEMORY_TTL_SECONDS = 20;
const IA_QUEUE_MEMORY_MAX = 64;
const iaFreshnessMemory = new Map();
/* KV is a durability layer, never permission to hold a channel change. A
   transient edge read must yield to the bounded Archive discovery path so the
   viewer can still receive a verified program or the last-good shelf. */
const IA_SHARED_QUEUE_READ_TIMEOUT_MS = 700;
const iaQueueMemory = new Map();
const iaQueueExpansionInflight = new Map();
function iaQueueMemoryGet(key) {
  const entry = iaQueueMemory.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) iaQueueMemory.delete(key);
    return null;
  }
  return entry;
}
function iaQueueMemoryPut(key, payload, ttlSeconds) {
  /* A hydrating response is a first-play handoff, not a shelf. Caching it in
     the per-isolate burst map made quick polls keep receiving one item even
     after the background worker had filled the durable five-item queue. */
  const candidates = Array.isArray(payload && payload.candidateItems) && payload.candidateItems.length
    ? payload.candidateItems
    : ((payload && payload.items) || []);
  const playableCandidates = candidates.filter((item) => item && item.identifier && item.media && item.media.url).length;
  if (!key || !payload || payload.hydrating || payload.partial || !Array.isArray(payload.items) || !payload.items.length || playableCandidates < IA_FRESHNESS_CANDIDATE_FLOOR) return;
  const ttl = Math.max(1, Math.min(IA_QUEUE_MEMORY_TTL_SECONDS, Number(ttlSeconds) || IA_QUEUE_MEMORY_TTL_SECONDS));
  iaQueueMemory.set(key, { payload, ttlSeconds: ttl, expiresAt: Date.now() + ttl * 1000 });
  while (iaQueueMemory.size > IA_QUEUE_MEMORY_MAX) iaQueueMemory.delete(iaQueueMemory.keys().next().value);
}
/* The queue endpoint is part of channel-change critical path.  Archive can
   hydrate a richer shelf after the response, but a cold request must hand the
   browser viable identifiers quickly enough for its own direct resolver to
   race the edge cache rather than presenting a long spinner. */
const IA_FIRST_READY_TIMEOUT_MS = 4200;
/* Discovery has its own shorter budget.  A slow Archive search must not be
   allowed to consume the time reserved for first-item metadata hydration. */
const IA_FAST_SEARCH_TIMEOUT_MS = 3200;
/* Background refill is intentionally smaller than the full editorial manifest.
   The first tune already races two subject-locked rails; launching every
   reserve rail for every cold channel at once can make Archive throttle the
   whole catalog during a channel-surfing burst. Later polls can widen again. */
const IA_BACKGROUND_RESERVE_LANES = 2;
const IA_BACKGROUND_FALLBACK_LANES = 1;
/* Container manifests can be large. They are valuable for episode variety but
   are never permitted to multiply the work of a foreground channel change. */
const IA_FOREGROUND_CONTAINER_EXPANSIONS = 0;
const IA_BACKGROUND_CONTAINER_EXPANSIONS = 6;
const IA_CONTAINER_EXPANSION_CONCURRENCY = 2;
/* A complete-series manifest can contain hundreds of playable files. Sample
   across the whole manifest instead of rejecting a large collection or taking
   only its first couple of episodes. The rolling shelf remains bounded by the
   channel catalog budget below. */
const IA_MAX_EXPANDED_FILES = 720;
const IA_BACKGROUND_COLLECTION_EPISODES_PER_PARENT = 16;
const IA_BACKGROUND_PLAYABLE_TARGET = 36;
const IA_DEPTH_PLAYABLE_TARGET = 48;
/* A full-directory tune burst can arrive when a guide, television, and phone
   all ask for cold shelves together. Keep the foreground path to one Archive
   discovery rail; reserve rails still run behind the first frame. */
const IA_FOREGROUND_DISCOVERY_LANES = 1;
/* Proven shallow/repeat-heavy lanes get a short supplemental discovery grace
   after their first approved rail wins. This is deliberately bounded: the
   first playable item still wins quickly, while a second cached/fast rail can
   join the rolling catalog before the response is finalized. Healthy lanes
   retain the one-rail critical path. */
const IA_DEPTH_FOREGROUND_GRACE_MS = 900;
/* Metadata is the expensive part of a cold shelf: five candidates per channel
   would turn a 169-channel burst into hundreds of Archive requests. Two keeps
   first-frame fallback available while leaving the remaining shelf to the
   existing background replenishment path. */
const IA_FOREGROUND_HYDRATION_CONCURRENCY = 2;
/* A few sparse lanes still have a cold-page failure mode: a rotated Archive
   page can time out before returning the first approved record even though the
   same editorial query is healthy on the stable first page. Retry only these
   observed lanes against page 1; never broaden their terms or disable gates. */
const IA_STABLE_RESCUE_CHANNELS = new Set(["17", "19", "74", "82", "106", "107", "113", "129", "130", "131", "132", "204", "206", "214", "238", "702", "906", "915"]);
/* v160's full 171-lane soak identified these cold or intermittently empty
   lanes. They get a second, channel-owned editorial rail on the foreground
   path only; the rail still passes the same theme, deny, title, media, and
   diversity gates. This is deliberately an allowlist so healthy lanes keep
   the one-rail fast path. */
const IA_COLD_RESCUE_CHANNELS = new Set([
  "2", "3", "10", "11", "12", "15", "64", "76", "101", "105", "110", "115", "116", "119", "120", "128", "130", "131", "132", "153", "154", "155", "156",
  "205", "208", "209", "210", "211", "212", "213", "214", "215", "216", "217", "219", "222", "223", "224", "225", "226", "227", "229", "230", "231", "232", "233", "234", "235", "236", "237", "238", "239", "240", "241", "242",
  "507", "508", "509", "510", "511", "575", "700", "701", "703", "900", "906", "922", "926", "927", "928",
  /* v164's full soak isolated these additional cold lanes. Keep their verified
     shelves narrow and channel-owned; healthy lanes do not pay this cost. */
  "14", "15", "18", "56", "63", "68", "72", "73", "77", "83", "102", "104", "109", "122", "158", "200", "202", "704", "705", "706", "901", "911", "916"
]);
function iaColdRescueEnabled(channel) {
  return IA_COLD_RESCUE_CHANNELS.has(String(channel));
}
/* Channel 200 exposed a distinct failure mode in real production rotation:
   high rotation values could surface a contaminated shared shelf even though
   its verified recovery bank was healthy. Keep only this proven lane on its
   own direct-ready bank until discovery has a larger, independently verified
   manufacturing catalog. This is intentionally not a global cache bypass. */
const IA_STRICT_RECOVERY_CHANNELS = new Set(["19", "200", "920"]);
function iaStrictRecoveryEnabled(channel) {
  return IA_STRICT_RECOVERY_CHANNELS.has(String(channel));
}
/* These lanes were observed either reusing a five-item last-good shelf or
   underfilling when the Archive index rotated. Give only these proven weak
   lanes more background search rails and a wider page window. Healthy channel
   changes keep the original one-rail fast path and do not pay for the repair. */
const IA_DEPTH_RECOVERY_CHANNELS = new Set([
  "3", "10", "13", "14", "17", "18", "19", "21", "60", "61", "62", "64", "66", "68", "70", "74", "75", "76", "77", "81",
  "100", "101", "102", "105", "106", "107", "108", "111", "114", "115", "117", "118", "120", "124", "125", "126", "127", "128", "129", "130", "131", "132", "154", "205", "222", "922",
  "72", "83", "104", "122", "202", "203", "204", "206", "209", "211", "212", "213", "214", "220", "223", "224", "228", "231", "235", "239", "240", "501", "502", "511", "700", "702", "703", "704", "705", "706", "901", "906", "907", "909", "914", "916", "918", "920", "921", "923", "927", "929"
].filter(Boolean));
function iaDepthRecoveryEnabled(channel) {
  return IA_DEPTH_RECOVERY_CHANNELS.has(String(channel));
}
/* The clean serial retry after the 2026-09-23 v4 certification soak isolated
   these lanes as reproducible misses rather than burst-only failures. Keep
   their editorial vocabulary and media contracts unchanged; only give them
   the already-supported page-1 rescue, cold second rail, and deeper refill
   path that sparse Archive lanes need. This allowlist is intentionally
   separate from the broader historical recovery sets so it can be removed
   after the next certification proves the lanes healthy. */
const IA_CONFIRMED_REPAIR_CHANNELS = new Set([
  "13", "61", "69", "74", "76", "82", "101", "103", "110", "114", "126", "127", "128", "130", "132", "153", "156",
  "203", "214", "226", "237", "242", "501", "502", "511", "702", "900", "901", "909", "912", "919", "923",
  /* v4 serial retry: these lanes failed first-play twice, so they receive the
     same targeted recovery rails without changing healthy-channel behavior. */
  "69", "76", "78", "20", "152", "910", "912", "918", "205", "107", "111", "123", "124", "120", "155", "225", "233", "508",
  "81", "150", "158", "13", "112", "217", "234", "241",
  /* v4.1 repeatability gate: these lanes failed in both the prior serial
     certification and the current serial retry. They get the same bounded
     rails; no broad emergency media is invented for them. */
  "2", "60", "110", "119", "131", "200", "212", "216", "223", "232", "926", "928",
  /* v4.2 serial overlap: these lanes repeated underfill across independent
     serial runs and now have verified genre-owned recovery shelves. */
  "60", "100", "134", "917", "929", "21", "205", "110", "119", "216", "224", "926", "510",
  /* v4.3 repeatable long-tail failures: verified collection/file shelves for
     the lanes that failed again in the serial retry. */
  "75", "132", "908", "106", "157", "575",
  /* v4.4 repeatability gate: these lanes still returned shallow/repeating
     shelves on the independent post-soak check. Give only them the short
     supplemental discovery grace and deeper refill path. */
  "15", "18", "21", "61", "79", "80", "114", "203", "214", "215", "225", "231", "501", "502", "507", "903", "904", "914", "915", "921", "929",
  /* v4.5 full-soak repeatability: these lanes remained shallow after the
     server-side catalog merge and need the same measured four-rail rescue. */
  "213", "230", "236",
]);
for (const channel of IA_CONFIRMED_REPAIR_CHANNELS) {
  IA_STABLE_RESCUE_CHANNELS.add(channel);
  IA_COLD_RESCUE_CHANNELS.add(channel);
  IA_DEPTH_RECOVERY_CHANNELS.add(channel);
}
/* A second, narrower allowlist for the v4 load-sensitive failures. These
   lanes repeatedly collapsed to the same five records or returned fewer than
   five playable items even after the four-rail recovery path. Let their
   supplemental rails settle for a bounded extra window; every other channel
   retains the 900ms fast path. */
const IA_ADAPTIVE_DEPTH_GRACE_CHANNELS = new Set([
  "15", "18", "21", "61", "114", "150", "158", "203", "213", "214", "230", "236", "501", "502", "507", "704", "705", "706", "915", "921",
]);
const IA_ADAPTIVE_DEPTH_GRACE_MS = 2200;
/* Reggae & Dub has a wide verified catalog but its secondary Archive rail is
   consistently slower than the other sparse lanes. Give only its background
   shelf the extra settling window; first-frame selection is unchanged. */
const IA_DEPTH_GRACE_OVERRIDES = new Map([["915", 5000]]);
const IA_HYDRATION_CONCURRENCY_OVERRIDES = new Map([["915", 5]]);
function iaForegroundHydrationConcurrency(channel) {
  return IA_HYDRATION_CONCURRENCY_OVERRIDES.get(String(channel)) || IA_FOREGROUND_HYDRATION_CONCURRENCY;
}
function iaDepthGraceMs(channel) {
  const override = IA_DEPTH_GRACE_OVERRIDES.get(String(channel));
  if (Number.isFinite(override)) return override;
  return IA_ADAPTIVE_DEPTH_GRACE_CHANNELS.has(String(channel))
    ? IA_ADAPTIVE_DEPTH_GRACE_MS
    : IA_DEPTH_FOREGROUND_GRACE_MS;
}
function iaBackgroundReserveQueries(channel, queries, deep = false) {
  /* A lane is allowed to widen itself when its verified candidate shelf is
     shallow. This keeps neglected long-tail channels from depending on a
     hand-maintained allowlist while preserving the one-rail first-frame path. */
  const limit = iaDepthRecoveryEnabled(channel) || deep ? Math.min(10, queries.length) : Math.min(IA_BACKGROUND_RESERVE_LANES, queries.length);
  return queries.slice(0, limit);
}
function iaBackgroundFallbackQueries(channel, queries, deep = false) {
  const limit = iaDepthRecoveryEnabled(channel) || deep ? Math.min(3, queries.length) : Math.min(IA_BACKGROUND_FALLBACK_LANES, queries.length);
  return queries.slice(0, limit);
}
/* Last-resort, already-observed playable records for those same sparse lanes.
   These are not a permanent catalog: they are used only when discovery returns
   no candidate at all, are passed through normal media hydration, and are
   immediately followed by a background search for fresher material. */
const IA_EMERGENCY_SEEDS = Object.freeze({
  "11": [
    { identifier: "freakylinks-complete-series-2000", title: "FreakyLinks (2000) · Complete TV Series", subject: "television series sitcom mystery", year: 2000 },
    { identifier: "everythings-relative-1999-sitcom", title: "Everything's Relative (1999) · Sitcom", subject: "television series sitcom family comedy", year: 1999 },
    { identifier: "partners-1995-96", title: "Partners (1995–96) · Sitcom", subject: "television series sitcom comedy", year: 1995 },
    { identifier: "first-time-out-1995", title: "First Time Out (1995) · Sitcom", subject: "television series sitcom comedy", year: 1995 },
  ],
  "208": [
    { identifier: "santa-fe-atsf-teamwork-and-technology", title: "Santa Fe · Teamwork and Technology", subject: "railroad railway locomotive rail transport", year: 1994 },
    { identifier: "videoplayback-2021-08-28-t-212139.465", title: "Ski Train to Winter Park · 2006", subject: "railroad railway train passenger train", year: 2006 },
    { identifier: "the-british-railway-series-episode-6-goodbye-stephen-the-green-engine", title: "The British Railway Series · Episode 6", subject: "railway railroad train rail transport", year: 2007 },
    { identifier: "ThisIsMy1940", title: "This Is My Railroad · Part I", subject: "railroad railway locomotive rail transport", year: 1940 },
  ],
  "116": [
    { identifier: "The_Brother_from_Another_Planet_1984", title: "The Brother from Another Planet (1984)", subject: "blaxploitation black cinema independent film", year: 1984, media: { type: "video", url: "https://archive.org/download/The_Brother_from_Another_Planet_1984/videoplayback%20%281%29.mp4" } },
    { identifier: "Fighting_Mad_MPEG", title: "Fighting Mad (1978)", subject: "blaxploitation black action film crime film", year: 1978, media: { type: "video", url: "https://archive.org/download/Fighting_Mad_MPEG/Fighting%20Mad.mp4" } },
    { identifier: "foxy-brown-1974", title: "Foxy Brown (1974)", subject: "blaxploitation black action film crime film", year: 1974, media: { type: "video", url: "https://archive.org/download/foxy-brown-1974/Foxy%20Brown%20%201974.mp4" } },
    { identifier: "trouble-man_1972", title: "Trouble Man (1972)", subject: "blaxploitation black action film crime film", year: 1972, media: { type: "video", url: "https://archive.org/download/trouble-man_1972/trouble-man_1972.mp4" } },
    { identifier: "lord.-shango.-1975.720p.-blu-ray.x-264.-aac-yts.-mx", title: "Lord Shango (1975)", subject: "blaxploitation black action film crime film", year: 1975, media: { type: "video", url: "https://archive.org/download/lord.-shango.-1975.720p.-blu-ray.x-264.-aac-yts.-mx/Lord.Shango.1975.720p.BluRay.x264.AAC-%5BYTS.MX%5D.mp4" } },
  ],
  "213": [
    { identifier: "nasa_tv-Japanese_Cargo_Ship_Arrives_at_the_International_Space_Station", title: "NASA · Japanese Cargo Ship Arrives at the International Space Station", subject: "nasa space station mission footage", year: 2016, media: { type: "video", url: "https://archive.org/download/nasa_tv-Japanese_Cargo_Ship_Arrives_at_the_International_Space_Station/Japanese_Cargo_Ship_Arrives_at_the_International_Space_Station.mp4" } },
    { identifier: "nasa_tv-ISS_Program_Honored_A_Call_to_Action_and_Martian_Touchdown_Test_on_This_Week_at_NASA", title: "NASA · ISS Program and Martian Touchdown Test", subject: "nasa space station planetary science mission briefing", year: 2010, media: { type: "video", url: "https://archive.org/download/nasa_tv-ISS_Program_Honored_A_Call_to_Action_and_Martian_Touchdown_Test_on_This_Week_at_NASA/ISS_Program_Honored_A_Call_to_Action_and_Martian_Touchdown_Test_on_This_Week_at_NASA.mp4" } },
    { identifier: "NasaDestinationTomorrow-Dt12-FlightPioneers", title: "NASA Destination Tomorrow · Flight Pioneers", subject: "nasa aviation space history mission briefing", year: 2004, media: { type: "video", url: "https://archive.org/download/NasaDestinationTomorrow-Dt12-FlightPioneers/NASADT12-FlightPioneers.mp4" } },
    { identifier: "NasaDestinationTomorrow-Dt18-RoboticMissions", title: "NASA Destination Tomorrow · Robotic Missions", subject: "nasa robotic mission planetary science", year: 2005, media: { type: "video", url: "https://archive.org/download/NasaDestinationTomorrow-Dt18-RoboticMissions/NASADT18-RoboticMissions.mp4" } },
    { identifier: "nasa_tv-Suni_s_Shoutout_for_NASA-TV", title: "NASA TV · Suni's Shoutout", subject: "nasa space station mission footage", year: 2013, media: { type: "video", url: "https://archive.org/download/nasa_tv-Suni_s_Shoutout_for_NASA-TV/Suni_s_Shoutout_for_NASA-TV.mp4" } },
    { identifier: "Expedition44BRoll150318720p_201503", title: "NASA · Expedition 44 B-Roll (2015)", subject: "nasa space station expedition mission footage", year: 2015, media: { type: "video", url: "https://archive.org/download/Expedition44BRoll150318720p_201503/Expedition_44_B-roll_150318_720p.mp4" } },
    { identifier: "Expedition41CrewProfileVersion1140916720p", title: "NASA · Expedition 41 Crew Profile", subject: "nasa space station crew profile mission briefing", year: 2014, media: { type: "video", url: "https://archive.org/download/Expedition41CrewProfileVersion1140916720p/Expedition%2041CrewProfile_Version1_140916_720p.mp4" } },
    { identifier: "Jack-Fischer_Action-Camera_EVA-May-12-2017_GP120023.MP4", title: "NASA · Jack Fischer EVA Action Camera", subject: "nasa spacewalk extravehicular activity space station mission footage", year: 2017, media: { type: "video", url: "https://archive.org/download/Jack-Fischer_Action-Camera_EVA-May-12-2017_GP120023.MP4/Jack-Fischer_Action-Camera_EVA-May-12-2017_GP120023.mp4" } },
    { identifier: "Expedition_55_Post_Landing_Activities_June_4_2018_661449.mp4", title: "NASA · Expedition 55 Post-Landing Activities", subject: "nasa space station expedition crew mission briefing", year: 2018, media: { type: "video", url: "https://archive.org/download/Expedition_55_Post_Landing_Activities_June_4_2018_661449.mp4/Expedition_55_Post_Landing_Activities_June_4_2018_661449.ia.mp4" } },
    { identifier: "Expedition_62_Inflight_with_Microsoft_Education_2020_0302", title: "NASA · Expedition 62 In-Flight Education", subject: "nasa space station science education mission footage", year: 2020, media: { type: "video", url: "https://archive.org/download/Expedition_62_Inflight_with_Microsoft_Education_2020_0302/Expedition_62_Inflight_with_Microsoft_Education_2020_0302_1308065.ia.mp4" } },
  ],
  "219": [
    { identifier: "wwl-eyewitness-news-martin-luther-king-day-1992", title: "WWL Eyewitness News · Martin Luther King Day (1992)", subject: "local news local newscast television news", year: 1992, media: { type: "video", url: "https://archive.org/download/wwl-eyewitness-news-martin-luther-king-day-1992/WWL%20Eyewitness%20News%20martin%20luther%20king%20day%201992.mp4" } },
    { identifier: "wbng-action-news-weekend-report-1998", title: "WBNG Action News · Weekend Report (1998)", subject: "local news local newscast television news", year: 1998, media: { type: "video", url: "https://archive.org/download/wbng-action-news-weekend-report-1998/WBNG%20Action%20News%20Weekend%20Report%201998.mp4" } },
    { identifier: "wbrz-eyewitness-news-nightdesk-feb-22-1995", title: "WBRZ Eyewitness News Nightdesk (1995)", subject: "local news local newscast television news", year: 1995, media: { type: "video", url: "https://archive.org/download/wbrz-eyewitness-news-nightdesk-feb-22-1995/WBRZ%20Eyewitness%20News%20Nightdesk%20Feb%2022%201995.mp4" } },
    { identifier: "wcax-channel-3-the-late-news-jan-23-1991", title: "WCAX Channel 3 · The Late News (1991)", subject: "local news local newscast television news", year: 1991, media: { type: "video", url: "https://archive.org/download/wcax-channel-3-the-late-news-jan-23-1991/WCAX%20Channel%203%20The%20Late%20News%201991.mp4" } },
    { identifier: "whbf-news-1993", title: "WHBF News (1993)", subject: "local news local newscast television news", year: 1993, media: { type: "video", url: "https://archive.org/download/whbf-news-1993/WHBF%20News-02.7.1993.mp4" } },
  ],
  "229": [
    { identifier: "TheDoomsdayAsteroid", title: "NOVA · The Doomsday Asteroid (1995)", subject: "pbs documentary nova science history television documentary", year: 1995, media: { type: "video", url: "https://archive.org/download/TheDoomsdayAsteroid/NOVA.S22E12.The.Doomsday.Asteroid.1995.VHSRip.AAC2.0.x264-astro.mp4" } },
    { identifier: "american-experience-george-h.-w.-bush-part-1", title: "American Experience · George H. W. Bush", subject: "public television historical documentary american experience", year: 2021, media: { type: "video", url: "https://archive.org/download/american-experience-george-h.-w.-bush-part-1/American%20Experience%20George%20H.W.%20Bush%20Part%201.mp4" } },
    { identifier: "WETA_20131009_140000_Frontline", title: "Frontline · WETA Broadcast (2013)", subject: "public television documentary series frontline investigative journalism", year: 2013, media: { type: "video", url: "https://archive.org/download/WETA_20131009_140000_Frontline/WETA_20131009_140000_Frontline.mp4" } },
    { identifier: "KQED_20140514_040000_Frontline", title: "Frontline · KQED Broadcast (2014)", subject: "public television documentary series frontline investigative journalism", year: 2014, media: { type: "video", url: "https://archive.org/download/KQED_20140514_040000_Frontline/KQED_20140514_040000_Frontline.mp4" } },
    { identifier: "KYW_20141012_230000_60_Minutes", title: "60 Minutes · KYW Broadcast (2014)", subject: "public television documentary series investigative journalism television newsmagazine", year: 2014, media: { type: "video", url: "https://archive.org/download/KYW_20141012_230000_60_Minutes/KYW_20141012_230000_60_Minutes.mp4" } },
  ],
  "230": [
    { identifier: "6333HMVacation1966Reel201343904", title: "Home Movies · Vacation 1966, Reel 2", subject: "home movie family film vacation travel", year: 1966, media: { type: "video", url: "https://archive.org/download/6333HMVacation1966Reel201343904/6333_HM_Vacation_1966_Reel_2_01_34_39_04.mp4" } },
    { identifier: "6416HMCroftCollectionCan44TripToHoughtonMichiganAugust19501234814", title: "Home Movies · Trip to Houghton, Michigan (1955)", subject: "home movie family film vacation travel", year: 1955, media: { type: "video", url: "https://archive.org/download/6416HMCroftCollectionCan44TripToHoughtonMichiganAugust19501234814/6416_HM_Croft_Collection_Can_44_Trip_to_Houghton_Michigan_August_195_01_23_48_14.mp4" } },
    { identifier: "7christmas1969", title: "Les Hunter Home Movies · Christmas 1969", subject: "home movie family film family gathering", year: 1969, media: { type: "video", url: "https://archive.org/download/7christmas1969/7_Christmas_1969.mp4" } },
    { identifier: "sf-02-014-being-silly-1984", title: "Steinback Family · Being Silly (1984)", subject: "home movie family film family gathering", year: 1984, media: { type: "video", url: "https://archive.org/download/sf-02-014-being-silly-1984/SF_02_014_BeingSilly_1984.mp4" } },
    { identifier: "cua_000025", title: "Home Movies · Shasta County and Lake County", subject: "home movie family film vacation travel", year: 1937, media: { type: "video", url: "https://archive.org/download/cua_000025/cua_000025_r1_access.HD.mp4" } },
    { identifier: "HMEaster98541", title: "Home Movie · Easter (1929)", subject: "home movie family film holiday family gathering", year: 1929, media: { type: "video", url: "https://archive.org/download/HMEaster98541/98541.mp4" } },
    { identifier: "HMGoldenGateInterna10343", title: "Home Movie · Golden Gate International Exposition (1940)", subject: "home movie family film travel world fair", year: 1940, media: { type: "video", url: "https://archive.org/download/HMGoldenGateInterna10343/10343.mp4" } },
    { identifier: "HMJapanHongKongT98636", title: "Home Movie · Japan, Hong Kong, Thailand, Norway (1957)", subject: "home movie family film vacation travel", year: 1957, media: { type: "video", url: "https://archive.org/download/HMJapanHongKongT98636/98636.mp4" } },
    { identifier: "HMPackTripPrairie98553", title: "Home Movie · Pack Trip and Prairie Dog Shooting (1958)", subject: "home movie family film vacation outdoors travel", year: 1958, media: { type: "video", url: "https://archive.org/download/HMPackTripPrairie98553/98553.mp4" } },
    { identifier: "HMMichiganandDetroi97320", title: "Home Movie · Michigan and Detroit Area (1947)", subject: "home movie family film travel community", year: 1947, media: { type: "video", url: "https://archive.org/download/HMMichiganandDetroi97320/97320.mp4" } },
    { identifier: "HMCaliforniaTrip98673", title: "Home Movie · California Trip (1951)", subject: "home movie family film vacation travel", year: 1951, media: { type: "video", url: "https://archive.org/download/HMCaliforniaTrip98673/98673.mp4" } },
    { identifier: "HMUSTravels98680", title: "Home Movie · U.S. Travels (1950)", subject: "home movie family film vacation travel", year: 1950, media: { type: "video", url: "https://archive.org/download/HMUSTravels98680/98680.mp4" } },
  ],
  "236": [
    { identifier: "SoundieK", title: "Soundie · Got To Be This or That", subject: "theatrical short soundie music short", year: 1945, media: { type: "video", url: "https://archive.org/download/SoundieK/SoundieK.mp4" } },
    { identifier: "SoundieP", title: "Soundie · Once In A While", subject: "theatrical short soundie music short", year: 1941, media: { type: "video", url: "https://archive.org/download/SoundieP/SoundieP.mp4" } },
    { identifier: "SoundieH", title: "Soundie · Beyond The Blue Horizon", subject: "theatrical short soundie music short", year: 1944, media: { type: "video", url: "https://archive.org/download/SoundieH/SoundieH.mp4" } },
    { identifier: "SoundieM", title: "Soundie · Ten Pretty Girls / I'll Make You Mine", subject: "theatrical short soundie music short", year: 1930, media: { type: "video", url: "https://archive.org/download/SoundieM/SoundieM.mp4" } },
    { identifier: "SoundieF", title: "Soundie · Reg Kehoe and his Marimba Queens", subject: "theatrical short soundie music short", year: 1940, media: { type: "video", url: "https://archive.org/download/SoundieF/SoundieF.mp4" } },
  ],
  "239": [
    { identifier: "DynamicA1956", title: "Dynamic American City · Part I", subject: "architecture urban planning city design film", year: 1956, media: { type: "video", url: "https://archive.org/download/DynamicA1956/DynamicA1956.mp4" } },
    { identifier: "CityTheP1939", title: "The City · Part I", subject: "architecture urban planning city design film", year: 1939, media: { type: "video", url: "https://archive.org/download/CityTheP1939/CityTheP1939.mp4" } },
    { identifier: "203365_Bunker_Hill_1956", title: "Bunker Hill (1956)", subject: "architecture urban planning city design film", year: 1956, media: { type: "video", url: "https://archive.org/download/203365_Bunker_Hill_1956/203365_Bunker_Hill_1956_master.intros.mp4" } },
    { identifier: "0545_City_The", title: "The City (1939)", subject: "architecture urban planning city design film", year: 1939, media: { type: "video", url: "https://archive.org/download/0545_City_The/0545_City_The_22_00_58_19_3mb.mp4" } },
    { identifier: "OpenRoadB", title: "Open Road B", subject: "architecture urban planning city design film", year: 1951, media: { type: "video", url: "https://archive.org/download/OpenRoadB/OpenRoadB.mp4" } },
    { identifier: "bctvpa-Historical_Architectural_Review_Board_Meeting_9_19_23_City_of_Reading_PA", title: "Historical Architectural Review Board Meeting · Reading, PA", subject: "architecture historic preservation building design city planning", year: 2023, media: { type: "video", url: "https://archive.org/download/bctvpa-Historical_Architectural_Review_Board_Meeting_9_19_23_City_of_Reading_PA/Historical_Architectural_Review_Board_Meeting_9_19_23_City_of_Reading_PA.mp4" } },
    { identifier: "ccpghpa-Zoning_Board_of_Adjustment_Meeting_-_9_12_24", title: "Zoning Board of Adjustment Meeting · Pittsburgh", subject: "architecture historic preservation building design city planning", year: 2024, media: { type: "video", url: "https://archive.org/download/ccpghpa-Zoning_Board_of_Adjustment_Meeting_-_9_12_24/Zoning_Board_of_Adjustment_Meeting_-_9_12_24.mp4" } },
    { identifier: "ccpghpa-Department_of_City_Planning_Panel_of_Public_Engagement_-_9_13_18", title: "City Planning · Public Engagement Panel", subject: "architecture urban planning city design public works", year: 2018, media: { type: "video", url: "https://archive.org/download/ccpghpa-Department_of_City_Planning_Panel_of_Public_Engagement_-_9_13_18/Department_of_City_Planning_Panel_of_Public_Engagement_-_9_13_18.mp4" } },
    { identifier: "epcctx-Inside_EPCC_Build._Z_Grand_Opening", title: "Inside EPCC · Build Z Grand Opening", subject: "architecture building design design education", year: 2017, media: { type: "video", url: "https://archive.org/download/epcctx-Inside_EPCC_Build._Z_Grand_Opening/Inside_EPCC_Build._Z_Grand_Opening.mp4" } },
    { identifier: "espadana_hospital", title: "Espadana Hospital · Architectural Design", subject: "architecture building design interior design", year: 2022, media: { type: "video", url: "https://archive.org/download/espadana_hospital/Espadana%20Hospital.mp4" } },
    { identifier: "copdca-Planning_Commission_Mtg._-_7_8_21", title: "Planning Commission Meeting · July 8, 2021", subject: "architecture urban planning city planning public works", year: 2021, media: { type: "video", url: "https://archive.org/download/copdca-Planning_Commission_Mtg._-_7_8_21/Planning_Commission_Mtg._-_7_8_21.mp4" } },
    { identifier: "cornv-Reno_City_Planning_Commission_February_6_2019", title: "Reno City Planning Commission · February 6, 2019", subject: "architecture urban planning city planning public works", year: 2019, media: { type: "video", url: "https://archive.org/download/cornv-Reno_City_Planning_Commission_February_6_2019/Reno_City_Planning_Commission_February_6_2019.mp4" } },
    { identifier: "comimn-June_27_2016_City_Planning_Commission_part_4", title: "City Planning Commission · June 27, 2016", subject: "architecture urban planning city planning public works", year: 2016, media: { type: "video", url: "https://archive.org/download/comimn-June_27_2016_City_Planning_Commission_part_4/June_27_2016_City_Planning_Commission_part_4.mp4" } },
    { identifier: "202882_Design_for_Correction", title: "Design for Correction", subject: "architecture building design design history", year: 1963, media: { type: "video", url: "https://archive.org/download/202882_Design_for_Correction/202882_Design_for_Correction_master.intros.ia.mp4" } },
    { identifier: "202272_Europe_At_Your_Window", title: "Europe at Your Window", subject: "architecture city design urban planning", year: 1950, media: { type: "video", url: "https://archive.org/download/202272_Europe_At_Your_Window/202272_Europe_At_Your_Window_master.intros.mp4" } },
  ],
  "240": [
    { identifier: "src-el-satario-a-0382-2017-preview-copy", title: "El Satario · Film Preservation Preview", subject: "film history motion picture history early cinema film preservation", year: 1920 },
    { identifier: "geofiggs_BadSeed", title: "George Figgs on The Bad Seed", subject: "film history cinema history film criticism", year: 2017, media: { type: "video", url: "https://archive.org/download/geofiggs_BadSeed/geofiggs_badseed720p.mp4" } },
    { identifier: "cmf-2008_ron-cobb-interview", title: "Creative Masters Forum · Ron Cobb", subject: "film history movie making visual culture", year: 2008, media: { type: "video", url: "https://archive.org/download/cmf-2008_ron-cobb-interview/CMF%20Ron%20Cobb%20Conf%20Ed.mp4" } },
    { identifier: "video-ts_202406", title: "Mary Pickford · The Muse of the Movies", subject: "film history motion picture history cinema history", year: 2008, media: { type: "video", url: "https://archive.org/download/video-ts_202406/VTS_01_1.mp4" } },
    { identifier: "1912-kinemacolor-venice", title: "Kinemacolor Venice (1912)", subject: "film history motion picture history early cinema", year: 1912, media: { type: "video", url: "https://archive.org/download/1912-kinemacolor-venice/1912%20Kinemacolor%20Venice.mp4" } },
    { identifier: "acf-footage-ww-1", title: "American Correspondent Film Company · World War I Footage", subject: "film history motion picture history archival film preservation", year: 1915, media: { type: "video", url: "https://archive.org/download/acf-footage-ww-1/WW1%20Footage%20American%20Correspondent%20Film%20Company%201915.ia.mp4" } },
    { identifier: "geofiggs_cultofstardom", title: "George Figgs on The Cult of Stardom", subject: "film history cinema history film criticism", year: 2018, media: { type: "video", url: "https://archive.org/download/geofiggs_cultofstardom/geofiggs_cultofstardom720p.mp4" } },
    { identifier: "muevan-las-industrias-metropolis-1927", title: "Muevan las Industrias · Metropolis (1927)", subject: "film history motion picture history early cinema", year: 1927, media: { type: "video", url: "https://archive.org/download/muevan-las-industrias-metropolis-1927/Muevan%20las%20industrias.ia.mp4" } },
    { identifier: "1925VsevolodPudovkinShakhmatnayaGoryachkaChessFever", title: "Chess Fever (1925)", subject: "film history motion picture history early cinema film preservation", year: 1925, media: { type: "video", url: "https://archive.org/download/1925VsevolodPudovkinShakhmatnayaGoryachkaChessFever/1925%20%20Vsevolod%20Pudovkin%20-%20Shakhmatnaya%20Goryachka%20%20%20Chess%20Fever.mp4" } },
    { identifier: "BillSpragueCollection-TheMarchOfTheMovies", title: "March of the Movies · J. Stuart Blackton", subject: "film history motion picture history early cinema film preservation", year: 1932, media: { type: "video", url: "https://archive.org/download/BillSpragueCollection-TheMarchOfTheMovies/March%20of%20the%20Movies.mp4" } },
    { identifier: "augustelouislumierethephotographicalcongressarrivesinlyon1895", title: "Lumière · The Photographical Congress Arrives in Lyon", subject: "film history motion picture history early cinema film preservation", year: 1895, media: { type: "video", url: "https://archive.org/download/augustelouislumierethephotographicalcongressarrivesinlyon1895/Auguste%20%26%20Louis%20Lumi%C3%A8re%20The%20Photographical%20Congress%20Arrives%20in%20Lyon%20%281895%29.mp4" } },
    { identifier: "geofiggs_FirstMovieStar", title: "George Figgs on The First Movie Star", subject: "film history cinema history film criticism", year: 2018 },
    { identifier: "marcsober_10", title: "Marc Sober · Current Film Culture", subject: "film history cinema history film criticism", year: 2018 },
    { identifier: "rodney-hill-umbrellas", title: "Rodney Hill on the French New Wave", subject: "film history cinema history film criticism", year: 2014 },
    { identifier: "geofiggs_waydowneast", title: "George Figgs on Way Down East", subject: "film history cinema history film criticism", year: 2018 },
  ],
  "927": [
    { identifier: "soul-train-season-2-episode-16", title: "Soul Train · Season 2, Episode 16", subject: "soul train funk performance soul music television", year: 1973, media: { type: "video", url: "https://archive.org/download/soul-train-season-2-episode-16/Soul%20Train%20%28Season%202%2C%20Episode%2016%29.mp4" } },
    { identifier: "SoulTrain-Episode15WithChampaignDeBarge-5141983", title: "Soul Train · Champaign and DeBarge", subject: "soul train R&B performance funk performance", year: 1983, media: { type: "video", url: "https://archive.org/download/SoulTrain-Episode15WithChampaignDeBarge-5141983/Soul%20Train%20with%20Champaign%20DeBarge.mp4" } },
    { identifier: "SoulTrain1977WithTheEmotionsAndMaze", title: "Soul Train · The Emotions and Maze (1977)", subject: "soul train soul music funk performance", year: 1977, media: { type: "video", url: "https://archive.org/download/SoulTrain1977WithTheEmotionsAndMaze/Soul%20Train%201977%20with%20The%20Emotions%20and%20Maze.mp4" } },
    { identifier: "soul-train-season-4-episode-30-my-q-2-airing", title: "Soul Train · Season 4, Episode 30", subject: "soul train disco performance R&B performance", year: 1975, media: { type: "video", url: "https://archive.org/download/soul-train-season-4-episode-30-my-q-2-airing/Soul%20Train%20%28Season%204%2C%20Episode%2030%29%28MyQ2%20Airing%29.mp4" } },
    { identifier: "soul-train-season-2-episode-5", title: "Soul Train · Season 2, Episode 5", subject: "soul train disco performance R&B performance", year: 1972, media: { type: "video", url: "https://archive.org/download/soul-train-season-2-episode-5/Soul%20Train%20%28Season%202%2C%20Episode%205%29.mp4" } },
    { identifier: "soul-train-season-6-episode-34-my-q-2-airing", title: "Soul Train · Season 6, Episode 34", subject: "soul train soul music funk performance", year: 1977, media: { type: "video", url: "https://archive.org/download/soul-train-season-6-episode-34-my-q-2-airing/Soul%20Train%20%28Season%206%2C%20Episode%2034%29%28MyQ2%20Airing%29.mp4" } },
    { identifier: "soul-train-season-4-episode-1-wgn-airing", title: "Soul Train · Season 4, Episode 1", subject: "soul train soul music funk performance", year: 1974, media: { type: "video", url: "https://archive.org/download/soul-train-season-4-episode-1-wgn-airing/Soul%20Train%20%28Season%204%2C%20Episode%201%29%28WGN%20Airing%29.mp4" } },
    { identifier: "soul-train-aired-on-may-19-1979-with-the-gap-band-carrie-lucas-gq", title: "Soul Train · The Gap Band, Carrie Lucas & GQ", subject: "soul train soul music funk performance", year: 1979, media: { type: "video", url: "https://archive.org/download/soul-train-aired-on-may-19-1979-with-the-gap-band-carrie-lucas-gq/Soul%20Train%20-%20aired%20on%20May%2019%2C%201979%20-%20with%20The%20Gap%20Band%2C%20Carrie%20Lucas%20%26%20GQ.mp4" } },
    { identifier: "SoulTrainWithTheFatBoysTheTemptations151985", title: "Soul Train · The Fat Boys and The Temptations", subject: "soul train soul music funk performance", year: 1985, media: { type: "video", url: "https://archive.org/download/SoulTrainWithTheFatBoysTheTemptations151985/Soul%20Train%20with%20The%20Fat%20Boys%20The%20Temptations%201%205%201985.mp4" } },
    { identifier: "soul-train-season-14-episode-15-with-whodini-and-teena-marie", title: "Soul Train · Whodini and Teena Marie", subject: "soul train soul music funk performance", year: 1985, media: { type: "video", url: "https://archive.org/download/soul-train-season-14-episode-15-with-whodini-and-teena-marie/Soul%20Train%20-%20Season%2014%20-%20Episode%2015%20-%20with%20Whodini%20and%20Teena%20Marie.mp4" } },
    { identifier: "soul-train-june-21-1975", title: "Soul Train · June 21, 1975", subject: "soul train soul music funk performance", year: 1975, media: { type: "video", url: "https://archive.org/download/soul-train-june-21-1975/Soul%20Train%20June%2021%2C%201975.ia.mp4" } },
    { identifier: "soul-train-season-8-episode-7-peabo-bryson-stargard", title: "Soul Train · Peabo Bryson and Stargard", subject: "soul train soul music funk performance", year: 1978, media: { type: "video", url: "https://archive.org/download/soul-train-season-8-episode-7-peabo-bryson-stargard/Soul%20Train%20with%20Peabo%20Bryson%20Stargard.ia.mp4" } },
    { identifier: "soul-train-season-13-episode-14-ray-parker-jr.-new-edition", title: "Soul Train · Ray Parker Jr. and New Edition", subject: "soul train soul music funk performance", year: 1984, media: { type: "video", url: "https://archive.org/download/soul-train-season-13-episode-14-ray-parker-jr.-new-edition/Soul%20Train%20with%20New%20Edition%20Ray%20Parker%20Jr.mp4" } },
    { identifier: "soul-train-season-1-episode-26-restored", title: "Soul Train · Season 1, Episode 26", subject: "soul train soul music funk performance", year: 1972 },
    { identifier: "soul-train-s-3e-26", title: "Soul Train · Season 3, Episode 26", subject: "soul train soul music funk performance", year: 1974 },
  ],
  "700": [
    { identifier: "holiday-inn-1942_202412", title: "Holiday Inn (1942)", subject: "christmas film christmas movie holiday film", year: 1942, media: { type: "video", url: "https://archive.org/download/holiday-inn-1942_202412/HolidayInn1942.mp4" } },
    { identifier: "scrooge_ipod", title: "Scrooge (1935)", subject: "christmas film christmas carol holiday film", year: 1935, media: { type: "video", url: "https://archive.org/download/scrooge_ipod/Scrooge_1935.mp4" } },
    { identifier: "AChristmasCarol", title: "A Christmas Carol (1910)", subject: "christmas film christmas carol holiday film", year: 1910, media: { type: "video", url: "https://archive.org/download/AChristmasCarol/AChristmasCarol.mp4" } },
    { identifier: "Beyond_Tomorrow", title: "Beyond Tomorrow (1940)", subject: "christmas film christmas movie holiday film", year: 1940, media: { type: "video", url: "https://archive.org/download/Beyond_Tomorrow/Beyond_Tomorrow.mp4" } },
    { identifier: "christmas-comes-but-once-a-year-1936_202501", title: "Christmas Comes But Once a Year (1936)", subject: "christmas film christmas special holiday animation", year: 1936, media: { type: "video", url: "https://archive.org/download/christmas-comes-but-once-a-year-1936_202501/Christmas%20Comes%20But%20Once%20a%20Year%20%281936%29.mp4" } },
    { identifier: "rockhampton-special-childrens-christmas-party-1996", title: "Rockhampton Special Children's Christmas Party (1996)", subject: "christmas television christmas special holiday film", year: 1996, media: { type: "video", url: "https://archive.org/download/rockhampton-special-childrens-christmas-party-1996/Rockhampton%20Special%20Children%27s%20Christmas%20Party%20%281996%29.mp4" } },
    { identifier: "youtube-EJaXPIhCJlo", title: "Happy Holidays from RippleEffect (2011)", subject: "christmas television christmas special holiday film", year: 2011, media: { type: "video", url: "https://archive.org/download/youtube-EJaXPIhCJlo/EJaXPIhCJlo.mp4" } },
    { identifier: "episode-67-1992-holiday-episode", title: "Holiday Episode (1992)", subject: "christmas television christmas special holiday film", year: 1992 },
    { identifier: "vimeo-247979511", title: "Merry Christmas from Saint John's", subject: "christmas television christmas special holiday film", year: 2017, media: { type: "video", url: "https://archive.org/download/vimeo-247979511/247979511.mp4" } },
    { identifier: "corrtx-The_Misadventures_of_CT_the_Christmas_Towne_Elf_Episode_4", title: "The Misadventures of CT the Christmas Towne Elf · Episode 4", subject: "christmas television christmas special holiday film", year: 2014, media: { type: "video", url: "https://archive.org/download/corrtx-The_Misadventures_of_CT_the_Christmas_Towne_Elf_Episode_4/The_Misadventures_of_CT_the_Christmas_Towne_Elf_Episode_4.mp4" } },
    { identifier: "christmas-night-1933", title: "Christmas Night (1933)", subject: "christmas film christmas special holiday film", year: 1933, media: { type: "video", url: "https://archive.org/download/christmas-night-1933/Christmas%20Night%20%281933%29.mp4" } },
    { identifier: "AChristmasWithoutSnow", title: "A Christmas Without Snow", subject: "christmas film christmas movie holiday film", year: 1980, media: { type: "video", url: "https://archive.org/download/AChristmasWithoutSnow/MoviePowderPresentsAChristmasWithoutSnow.mp4" } },
    { identifier: "the-flight-before-christmas-2008", title: "The Flight Before Christmas", subject: "christmas film christmas movie holiday film", year: 2008, media: { type: "video", url: "https://archive.org/download/the-flight-before-christmas-2008/The%20Flight%20Before%20Christmas%202008.mp4" } },
    { identifier: "lassie-a-christmas-story-1959-film-noir-christmas-special", title: "Lassie · A Christmas Story", subject: "christmas film christmas special holiday film", year: 1958, media: { type: "video", url: "https://archive.org/download/lassie-a-christmas-story-1959-film-noir-christmas-special/Lassie%20A%20Christmas%20Story%20%281959%20Film%20Noir%20Christmas%20Special%29.mp4" } },
    { identifier: "the-christmas-bunny-2011-dvdrip-pg", title: "The Christmas Bunny", subject: "christmas film christmas movie holiday film", year: 2011, media: { type: "video", url: "https://archive.org/download/the-christmas-bunny-2011-dvdrip-pg/The%20Christmas%20Bunny%202011%20dvdrip%20%28PG%29.mp4" } },
  ],
  "703": [
    { identifier: "tamutx-Reveille_By_The_Fireplace_One_Hour_Yule_Log-20191220", title: "Reveille by the Fireplace · One Hour Yule Log", subject: "yule log fireplace video ambience", year: 2019, media: { type: "video", url: "https://archive.org/download/tamutx-Reveille_By_The_Fireplace_One_Hour_Yule_Log-20191220/Reveille_By_The_Fireplace_One_Hour_Yule_Log-20191220.mp4" } },
    { identifier: "youtube-7suJVVEWt9g", title: "9th Street Italian Market Burn Barrel · Two Hours", subject: "fireplace video yule log ambience", year: 2023, media: { type: "video", url: "https://archive.org/download/youtube-7suJVVEWt9g/7suJVVEWt9g.mp4" } },
    { identifier: "wpix-yule-log-1966", title: "WPIX 11 · Yule Log (1966 Restored)", subject: "yule log fireplace broadcast video", year: 1966, media: { type: "video", url: "https://archive.org/download/wpix-yule-log-1966/avc_20251225235800_Yule_Log.mp4" } },
    { identifier: "your_christmas_yule_log_fireplace", title: "Christmas Yule Log Fireplace (1987)", subject: "yule log fireplace video ambience", year: 1987, media: { type: "video", url: "https://archive.org/download/your_christmas_yule_log_fireplace/Your%20Christmas%20Yule%20Log%20Fireplace%20%281987%29.mp4" } },
    { identifier: "wrokmi-The_Fire_Place", title: "The Fire Place", subject: "fireplace video yule log ambience", year: 2010, media: { type: "video", url: "https://archive.org/download/wrokmi-The_Fire_Place/The_Fire_Place.mp4" } },
  ],
  "132": [
    iaDirectRecovery("TerrorToonsKillCount::km_20260519_1080p_24f_20260519_234901.mp4", "TerrorToonsKillCount", "km_20260519_1080p_24f_20260519_234901.mp4", "Terror Toons (2002) — Midnight Matinee", "cult film horror film midnight matinee drive-in cinema", 2002),
    iaDirectRecovery("videoplayback-8_202604::YouCut_20260402_214946664.ia.mp4", "videoplayback-8_202604", "YouCut_20260402_214946664.ia.mp4", "The Purple Lin Kwei — Midnight Matinee", "b movie cult film midnight matinee drive-in cinema", 1970),
    iaDirectRecovery("case-file-the-blackwood-hollow-curfew::CASE FILE THE BLACKWOOD HOLLOW CURFEW.mp4", "case-file-the-blackwood-hollow-curfew", "CASE FILE THE BLACKWOOD HOLLOW CURFEW.mp4", "The Blackwood Hollow Curfew", "horror film independent film midnight matinee drive-in cinema", 2024),
    iaDirectRecovery("criaturas-hediondas::Criaturas Hediondas.ia.mp4", "criaturas-hediondas", "Criaturas Hediondas.ia.mp4", "Criaturas Hediondas", "horror film exploitation film midnight matinee drive-in cinema", 1993),
    iaDirectRecovery("Weird-o-ramaWeird-cast1-Part1TheScreamingSkull::WeirdCast_1_part1.mp4", "Weird-o-ramaWeird-cast1-Part1TheScreamingSkull", "WeirdCast_1_part1.mp4", "Weird-O-Rama — The Screaming Skull", "cult film horror film midnight matinee drive-in cinema", 1956),
    iaDirectRecovery("TheScreamingSkullHD1958::TheScreamingSkullHD1958.mp4", "TheScreamingSkullHD1958", "TheScreamingSkullHD1958.mp4", "The Screaming Skull", "cult film horror film midnight matinee drive-in cinema", 1958),
    iaDirectRecovery("plan-9-from-outer-space_202009::Plan 9 from Outer Space.mp4", "plan-9-from-outer-space_202009", "Plan 9 from Outer Space.mp4", "Plan 9 from Outer Space", "cult film horror film science fiction film midnight matinee drive-in cinema", 1959),
    iaDirectRecovery("WickedKittyHosts-RogerCormansAttackOfTheCrabMonsters::WickedKittyPresentsAttackOfTheCrabMonsters.mp4", "WickedKittyHosts-RogerCormansAttackOfTheCrabMonsters", "WickedKittyPresentsAttackOfTheCrabMonsters.mp4", "Attack of the Crab Monsters — Hosted Feature", "cult film horror film drive-in film midnight matinee cinema", 1957),
    iaDirectRecovery("robot-monster-1953::Robot Monster (1953).mp4", "robot-monster-1953", "Robot Monster (1953).mp4", "Robot Monster", "cult film horror film science fiction film midnight matinee drive-in cinema", 1953),
    iaDirectRecovery("Popcornarchive-houseOnHauntedHill1959::Popcornarchive-houseOnHauntedHill1959.mp4", "Popcornarchive-houseOnHauntedHill1959", "Popcornarchive-houseOnHauntedHill1959.mp4", "House on Haunted Hill", "cult film horror film midnight matinee drive-in cinema", 1959),
    iaDirectRecovery("carnivalofsouls_201907::Carnival of Souls.mp4", "carnivalofsouls_201907", "Carnival of Souls.mp4", "Carnival of Souls", "cult film horror film midnight matinee drive-in cinema", 1962),
    iaDirectRecovery("Dementia13_201411::Dementia13.mp4", "Dementia13_201411", "Dementia13.mp4", "Dementia 13", "cult film horror film midnight matinee drive-in cinema", 1963),
    iaDirectRecovery("TheBrainThatWouldntDie-ExtendedVersion1962::TheBrainThatWouldntDie-Ext.Ver.1962.mp4", "TheBrainThatWouldntDie-ExtendedVersion1962", "TheBrainThatWouldntDie-Ext.Ver.1962.mp4", "The Brain That Wouldn't Die", "cult film horror film midnight matinee drive-in cinema", 1962),
    iaDirectRecovery("TheLittleShopOfHorrors1960_765::TheLittleShopOfHorrors1960.mp4", "TheLittleShopOfHorrors1960_765", "TheLittleShopOfHorrors1960.mp4", "The Little Shop of Horrors", "cult film horror film midnight matinee drive-in cinema", 1960),
    iaDirectRecovery("devil-bat::Devil Bat.mp4", "devil-bat", "Devil Bat.mp4", "The Devil Bat", "cult film horror film midnight matinee drive-in cinema", 1940),
  ],
  "210": [
    { identifier: "UniversalNewsreelVolume35Release201-01-1962", title: "Universal Newsreel Volume 35, Release 2, 01/01/1962", subject: "newsreel news reel", year: 1962 },
    { identifier: "UniversalNewsreelVolume34Issue801-23-1961", title: "Universal Newsreel Volume 34, Issue 8, 01/23/1961", subject: "newsreel historical newsreel", year: 1961 },
    { identifier: "200-UN-35-53", title: "Universal Newsreel", subject: "newsreel news broadcast", year: 1962 },
    { identifier: "UniversalNewsreelVolume35Release3905-10-1962", title: "Universal Newsreel Volume 35, Release 39, 05/10/1962", subject: "newsreel current events", year: 1962 },
    { identifier: "UniversalNewsreelVolume35Release6007-23-1962", title: "Universal Newsreel Volume 35, Release 60, 07/23/1962", subject: "newsreel television news", year: 1962 },
  ],
  "75": [
    { identifier: "jseALNAIRracing94ver2", title: "Xcorps TV Presents Memorial Day Sail Regatta 1994", subject: "sailing regatta water sports", year: 1994, media: { type: "video", url: "https://archive.org/download/jseALNAIRracing94ver2/jseALNAIRracing94ver2.mp4" } },
    { identifier: "Xcorps64NoodSailingHD2_201802", title: "Xcorps Action Sports Music TV 64 - NOOD Sailing - Full Show", subject: "sailing regatta boat racing", year: 2016, media: { type: "video", url: "https://archive.org/download/Xcorps64NoodSailingHD2_201802/Xcorps64NoodSailingHD2.mp4" } },
    { identifier: "XcorpsNOODregattaSEG2", title: "Xcorps TV - NOOD Sail Regatta Boat Races Part 2", subject: "sailing regatta boat racing", year: 2016, media: { type: "video", url: "https://archive.org/download/XcorpsNOODregattaSEG2/XcorpsNOODregattaSEG2.mp4" } },
    { identifier: "Xcorps64NoodSailingHD2", title: "Xcorps 64 NOOD Sailing HD", subject: "sailing regatta water sports", year: 2016, media: { type: "video", url: "https://archive.org/download/Xcorps64NoodSailingHD2/Xcorps64NoodSailingHD2.mp4" } },
    iaDirectRecovery("youtube-KOx3lmwL0ps::WYC_Peanut_Regatta_-_June_9th_2019_-_Galveston_Bay_Texas-KOx3lmwL0ps.mp4", "youtube-KOx3lmwL0ps", "WYC_Peanut_Regatta_-_June_9th_2019_-_Galveston_Bay_Texas-KOx3lmwL0ps.mp4", "WYC Peanut Regatta — Galveston Bay", "sailing regatta rowing boat racing water sports", 2019),
    iaDirectRecovery("TwitchVod-2347042836::2347042836.ia.mp4", "TwitchVod-2347042836", "2347042836.ia.mp4", "Building a Boat and Sailing It", "sailing regatta boat racing water sports", 2025),
    iaDirectRecovery("olympiakisat-lontoo-2012-naisten-purjehdus-elliot-match-race-6m-puoliväliera-ala::Olympiakisat Lontoo 2012 Naisten Purjehdus Elliot Match Race 6m Puolivälierä Alankomaat vs. Australia.MP4", "olympiakisat-lontoo-2012-naisten-purjehdus-elliot-match-race-6m-puoliväliera-ala", "Olympiakisat Lontoo 2012 Naisten Purjehdus Elliot Match Race 6m Puolivälierä Alankomaat vs. Australia.MP4", "Olympic Sailing — Elliot Match Race", "sailing regatta boat racing water sports", 2012),
    iaDirectRecovery("youtube-rZ1c1h5qoRY::rZ1c1h5qoRY.mkv", "youtube-rZ1c1h5qoRY", "rZ1c1h5qoRY.mkv", "Forest Park Crew — Regatta Rowing Final", "rowing regatta crew racing water sports", 2022),
    iaDirectRecovery("metvfl-Bradenton_Riverwalk_Regatta_2020_Vol._3::Bradenton_Riverwalk_Regatta_2020_Vol._3.mp4", "metvfl-Bradenton_Riverwalk_Regatta_2020_Vol._3", "Bradenton_Riverwalk_Regatta_2020_Vol._3.mp4", "Bradenton Riverwalk Regatta 2020", "sailing regatta water sports", 2020),
    iaDirectRecovery("bbrtvmev-Sailing_on_Moosehead_Lake_Ice::Sailing_on_Moosehead_Lake_Ice.HD.mp4", "bbrtvmev-Sailing_on_Moosehead_Lake_Ice", "Sailing_on_Moosehead_Lake_Ice.HD.mp4", "Sailing on Moosehead Lake Ice", "sailing water sports outdoor sports", 2021),
    iaDirectRecovery("youtube-M1ORQy3rH5c::M1ORQy3rH5c.ia.mp4", "youtube-M1ORQy3rH5c", "M1ORQy3rH5c.ia.mp4", "Women's Second Four — Regatta Rowing", "rowing regatta crew racing water sports", 2011),
    iaDirectRecovery("youtube--O1X2WbNDp4::Peanut_Regatta_of_Waterford_5_17_2020_Taken_From_S_V_Sunspot_Baby--O1X2WbNDp4.mp4", "youtube--O1X2WbNDp4", "Peanut_Regatta_of_Waterford_5_17_2020_Taken_From_S_V_Sunspot_Baby--O1X2WbNDp4.mp4", "Peanut Regatta of Waterford", "sailing regatta water sports", 2020),
    iaDirectRecovery("twitch-vod-v736813439::v736813439.mp4", "twitch-vod-v736813439", "v736813439.mp4", "Sailing the Mediterranean", "sailing water sports ocean racing", 2020),
    iaDirectRecovery("soggy_laser::soggy_laser.mp4", "soggy_laser", "soggy_laser.mp4", "Soggy Laser — Sailing", "sailing water sports boat racing", 2020),
    iaDirectRecovery("mhtvmav-Redd_s_Pond_Model_Sailboat_Regatta::Redd_s_Pond_Model_Sailboat_Regatta.mp4", "mhtvmav-Redd_s_Pond_Model_Sailboat_Regatta", "Redd_s_Pond_Model_Sailboat_Regatta.mp4", "Redd's Pond Model Sailboat Regatta", "sailing regatta water sports", 2023),
  ],
  "118": [
    { identifier: "blackadder-s02", title: "Blackadder - Season 2 (1986)", subject: "british television british sitcom british comedy", year: 1986 },
    { identifier: "blackadder.-s-01-e-01.-the.-foretelling.-1080p.-blu-ray.-eac-3.2.0.1080p.x-265-i-vy", title: "Blackadder - Season 1 (1983)", subject: "british television british sitcom british comedy", year: 1983 },
    { identifier: "LDFT7579", title: "Fawlty Towers Complete", subject: "british television british sitcom british comedy", year: 1975 },
    { identifier: "keeping-up-appearances_202402", title: "1990 Keeping Up Appearances Complete Series", subject: "british television british sitcom british comedy", year: 1990 },
    { identifier: "monty-pythons-flying-circus-ntsc-dvd-set", title: "Monty Python's Flying Circus (1969-1974)", subject: "british television british comedy", year: 1969 },
  ],
  "211": [
    { identifier: "IGM167InternetItunes", title: "I've Got Munchies- Takes A Bite Out Of Elvis Quesadillas", subject: "cooking show cooking demonstration recipe food preparation", year: 2019 },
    { identifier: "IGM165InternetItunes", title: "I've Got Munchies- Takes A Bite Out Of Snickers Croissants", subject: "cooking show cooking demonstration recipe baking pastry", year: 2019 },
    { identifier: "IGM163InternetIphone", title: "I've Got Munchies- Takes A Bite Out Of Stuffed Strawberries", subject: "cooking show cooking demonstration recipe food preparation", year: 2019 },
    { identifier: "IGM160InternetItunes", title: "I've Got Munchies- Takes A Bite Out Of Pull Apart Cheesy Garlic Bread", subject: "cooking show cooking demonstration recipe baking", year: 2019 },
    { identifier: "igm171internetdevice", title: "I've Got Munchies- Takes A Bite Out Of Oatmeal Cream Pies with Jam and Toasted Pecans", subject: "cooking show cooking demonstration recipe baking pastry", year: 2019 },
  ],
  "914": [
    { identifier: "19MAY2018LOS4ELEMENTOSDELHIPHOP", title: "Los 4 Elementos del Hip Hop", subject: "hip hop rap turntablism", year: 2018 },
    { identifier: "33-multiple-drum-sounds", title: "Multiple Drum Sounds", subject: "hip hop beat rap turntablism", year: 2018 },
    { identifier: "dedication-2-lil-wayne", title: "Dedication 2 - Lil Wayne", subject: "hip hop rap mixtape", year: 2006 },
    { identifier: "Future_Pluto_Hndrxx-MixtapePlutoSlowed", title: "Future - Pluto x Hndrxx / Mixtape Pluto", subject: "hip hop rap", year: 2024 },
    { identifier: "YungMcChickenFilesVol1", title: "The Yung McChicken Files Vol. 1", subject: "hip hop rap", year: 2018 },
  ],
  "905": [
    { identifier: "MuddyWaters-FolkSinger", title: "Muddy Waters - Folk Singer", subject: "blues chicago blues", year: 1964 },
    { identifier: "LegacyBluesLighninHopkins1", title: "Legacy Of The Blues Vol. 12 - Lightnin' Hopkins", subject: "blues texas blues country blues", year: 1974 },
    { identifier: "CountryBluesLightninHopkins1", title: "Lightnin' Hopkins - Country Blues", subject: "blues country blues texas blues", year: 1960 },
    { identifier: "BlindLemonJefferson-MatchboxBlues-1927Classic", title: "Blind Lemon Jefferson - Matchbox Blues", subject: "blues delta blues country blues", year: 1927 },
    { identifier: "howlinwolfsmokestacklightningthecompletechessmasters19511960disc1", title: "Howlin' Wolf - Smokestack Lightning - Chess Masters, Disc 1", subject: "blues chicago blues electric blues", year: 1951 },
  ],
  "702": [
    { identifier: "veggietales-madame-blueberry-1998-fanmade-vhs-thanksgiving-special_202511", title: "VeggieTales Madame Blueberry (Thanksgiving Special)", subject: "thanksgiving special", year: 1998 },
    { identifier: "macys-thanksgiving-day-parade-cat-in-the-hat-theme-1994-1997", title: "The Cat in the Hat Balloon Theme (Macy's Thanksgiving Day Parade)", subject: "thanksgiving parade", year: 1997 },
    { identifier: "SesameStreetPress1993", title: "Sesame Street Press 1993", subject: "thanksgiving special children's television", year: 1993 },
    { identifier: "DayofTha1951", title: "Day of Thanksgiving, A", subject: "thanksgiving film", year: 1951 },
    { identifier: "blues-clues-macys-thanksgiving-day-parade-specials", title: "Blue's Clues Macy's Thanksgiving Day Parade Specials", subject: "thanksgiving parade thanksgiving special", year: 2000 },
  ],
  "115": [
    { identifier: "1989gojirataibiorante.720p.ac3.cg", title: "Godzilla vs. Biollante (1989)", subject: "kaiju godzilla japanese monster movie", year: 1989 },
    { identifier: "1992gojirataimosura.720p.ac3.cg", title: "Godzilla vs. Mothra (1992)", subject: "kaiju godzilla mothra japanese monster movie", year: 1992 },
    { identifier: "thereturnofgodzilla1984", title: "The Return of Godzilla (1984)", subject: "kaiju godzilla japanese monster movie", year: 1984 },
    { identifier: "GodzillaThingRedMenace", title: "Godzilla vs. the Thing (1964)", subject: "kaiju godzilla mothra japanese monster movie", year: 1964 },
    { identifier: "ultraman-monster-movie-feature-1967", title: "Ultraman: Monster Movie Feature (1967)", subject: "tokusatsu kaiju ultraman japanese monster movie", year: 1967 },
  ],
  "154": [
    { identifier: "DragnetEpisode18TheBigSeventeenwcommercials", title: "Dragnet — Episode 18: The Big Seventeen", subject: "dragnet classic television police procedural detective show", year: 1952, media: { type: "video", url: "https://archive.org/download/DragnetEpisode18TheBigSeventeenwcommercials/dragnet_bigseventeen.mp4" } },
    { identifier: "DragnetS01E05TheBigCast", title: "Dragnet — Season 1, Episode 5: The Big Cast", subject: "dragnet classic television police procedural detective show", year: 1952, media: { type: "video", url: "https://archive.org/download/DragnetS01E05TheBigCast/Dragnet%20S01E05%20The%20Big%20Cast%20-%20Watch%20Crime%20Series%20Online.mp4" } },
    { identifier: "DragnetTheBigHitRunKiller", title: "Dragnet — The Big Hit-Run Killer", subject: "dragnet classic television police procedural detective show", year: 1954, media: { type: "video", url: "https://archive.org/download/DragnetTheBigHitRunKiller/DragnetTheBigHitRunKiller.mp4" } },
    { identifier: "hawaii-five-o-S2E3-480p", title: "Hawaii Five-O — Season 2, Episode 3", subject: "hawaii five-o classic television police procedural detective show", year: 1968, media: { type: "video", url: "https://archive.org/download/hawaii-five-o-S2E3-480p/hawaii-five-o-S2E3-480p.mp4" } },
    { identifier: "columbo-pilot-episodes::prescription-murder", title: "Columbo — Prescription Murder", subject: "columbo classic television police procedural detective show", year: 1968, media: { type: "video", url: "https://archive.org/download/columbo-pilot-episodes/1%20-%20Prescription%20Murder.ia.mp4" } },
    { identifier: "Dragnet1951", title: "Dragnet (1951)", subject: "dragnet classic television police procedural detective show", year: 1951 },
    { identifier: "DragnetTheHumanBomb", title: "Dragnet — The Human Bomb", subject: "dragnet classic television police procedural detective show", year: 1952 },
    { identifier: "DragnetTheBigActor", title: "Dragnet — The Big Actor", subject: "dragnet classic television police procedural detective show", year: 1952 },
    { identifier: "DragnetTheBigBetty", title: "Dragnet — The Big Betty", subject: "dragnet classic television police procedural detective show", year: 1952 },
    { identifier: "DragnetTheBigChildren", title: "Dragnet — The Big Children", subject: "dragnet classic television police procedural detective show", year: 1952 },
    { identifier: "DragnetTheBigLamp", title: "Dragnet — The Big Lamp", subject: "dragnet classic television police procedural detective show", year: 1952 },
    { identifier: "DragnetTheBigMother", title: "Dragnet — The Big Mother", subject: "dragnet classic television police procedural detective show", year: 1952 },
    { identifier: "hill.-street.-blues.-s-01", title: "Hill Street Blues — Season 1", subject: "hill street blues classic television police procedural detective show", year: 1981 },
    { identifier: "hill.street.blues.s-03", title: "Hill Street Blues — Season 3", subject: "hill street blues classic television police procedural detective show", year: 1983 },
    { identifier: "hill.street.blues.s-05", title: "Hill Street Blues — Season 5", subject: "hill street blues classic television police procedural detective show", year: 1985 },
    { identifier: "hill.street.blues.s-04e-01.heres.adventure.heres.romance.sdtv.x-264", title: "Hill Street Blues — Season 4", subject: "hill street blues classic television police procedural detective show", year: 1984 },
    { identifier: "adam-12.-s-01", title: "Adam-12 — Season 1", subject: "adam-12 classic television police procedural detective show", year: 1968 },
    { identifier: "columbo-pilot-episodes", title: "Columbo — Pilot Episodes", subject: "columbo classic television police procedural detective show", year: 1968 },
  ],
  /* The Detective is a separate lane from Cop Show Classic. Give it the same
     proven public-domain procedural records, but with explicit detective
     vocabulary so the relay can hydrate them instead of falling into a
     generic one-item D1 fallback. */
  "511": [
    { identifier: "DragnetEpisode18TheBigSeventeenwcommercials", title: "Dragnet — Episode 18: The Big Seventeen", subject: "detective television dragnet classic television police procedural detective show", year: 1952 },
    { identifier: "DragnetS01E05TheBigCast", title: "Dragnet — Season 1, Episode 5: The Big Cast", subject: "detective television dragnet classic television police procedural detective show", year: 1952 },
    { identifier: "DragnetTheBigHitRunKiller", title: "Dragnet — The Big Hit-Run Killer", subject: "detective television dragnet classic television police procedural detective show", year: 1954 },
    { identifier: "hawaii-five-o-S2E3-480p", title: "Hawaii Five-O — Season 2, Episode 3", subject: "detective television hawaii five-o classic television police procedural detective show", year: 1968 },
    { identifier: "columbo-pilot-episodes", title: "Columbo — Pilot Episodes", subject: "detective television columbo classic television police procedural detective show", year: 1968 },
  ],
  "157": [
    iaDirectRecovery("CCF-2000::Cartoon Cartoon Fridays 2000 The Mayor Hosts/VIDEO_TS/VTS_01_1.mp4", "CCF-2000", "Cartoon Cartoon Fridays 2000 The Mayor Hosts/VIDEO_TS/VTS_01_1.mp4", "Cartoon Cartoon Fridays — 2000 Full Broadcast", "cartoon network kids television animated television after school", 2000),
    iaDirectRecovery("powerpuff-girls-complete-series::Powerpuff Girls - 01,01 - Insect Inside - Powerpuff Bluff.mp4", "powerpuff-girls-complete-series", "Powerpuff Girls - 01,01 - Insect Inside - Powerpuff Bluff.mp4", "The Powerpuff Girls — Insect Inside / Powerpuff Bluff", "cartoon network kids television animated television after school", 1998),
    iaDirectRecovery("mlattr::My Life as a Teenage Robot/Season 1/10_Speak_No_Evil_.ia.mp4", "mlattr", "My Life as a Teenage Robot/Season 1/10_Speak_No_Evil_.ia.mp4", "My Life as a Teenage Robot — Speak No Evil", "nickelodeon kids television animated television after school", 2003),
    iaDirectRecovery("courage-the-cowardly-dog-1080p-ai-upscale::Courage the Cowardly Dog - 01x01 - A Night at the Katz Motel.mp4", "courage-the-cowardly-dog-1080p-ai-upscale", "Courage the Cowardly Dog - 01x01 - A Night at the Katz Motel.mp4", "Courage the Cowardly Dog — A Night at the Katz Motel", "cartoon network kids television animated television after school", 1999),
    iaDirectRecovery("StarWarsCloneWars2003::Star Wars Clone Wars [2003]/Season 1-3/Star Wars Clone Wars Vol. 1 [2003].mp4", "StarWarsCloneWars2003", "Star Wars Clone Wars [2003]/Season 1-3/Star Wars Clone Wars Vol. 1 [2003].mp4", "Star Wars: Clone Wars — Volume 1", "cartoon network kids television animated television after school", 2003),
    iaDirectRecovery("powerpuff-girls-complete-series::Powerpuff Girls - 01,02 - Monkey See, Doggie Do - Mommy Fearest.mp4", "powerpuff-girls-complete-series", "Powerpuff Girls - 01,02 - Monkey See, Doggie Do - Mommy Fearest.mp4", "The Powerpuff Girls — Monkey See / Mommy Fearest", "cartoon network kids television animated television after school", 1998),
    iaDirectRecovery("powerpuff-girls-complete-series::Powerpuff Girls - 01,03 - Octi Evil - Geshundfight.mp4", "powerpuff-girls-complete-series", "Powerpuff Girls - 01,03 - Octi Evil - Geshundfight.mp4", "The Powerpuff Girls — Octi Evil / Geshundfight", "cartoon network kids television animated television after school", 1998),
    iaDirectRecovery("powerpuff-girls-complete-series::Powerpuff Girls - 01,04 - Buttercrush - Fuzzy Logic.mp4", "powerpuff-girls-complete-series", "Powerpuff Girls - 01,04 - Buttercrush - Fuzzy Logic.mp4", "The Powerpuff Girls — Buttercrush / Fuzzy Logic", "cartoon network kids television animated television after school", 1998),
    iaDirectRecovery("powerpuff-girls-complete-series::Powerpuff Girls - 01,05 - Boogie Frights - Abracadaver.mp4", "powerpuff-girls-complete-series", "Powerpuff Girls - 01,05 - Boogie Frights - Abracadaver.mp4", "The Powerpuff Girls — Boogie Frights / Abracadaver", "cartoon network kids television animated television after school", 1998),
    iaDirectRecovery("mlattr::My Life as a Teenage Robot/Season 1/11_See_No_Evil_.ia.mp4", "mlattr", "My Life as a Teenage Robot/Season 1/11_See_No_Evil_.ia.mp4", "My Life as a Teenage Robot — See No Evil", "nickelodeon kids television animated television after school", 2003),
    iaDirectRecovery("mlattr::My Life as a Teenage Robot/Season 1/12_The_Great_Unwashed_.ia.mp4", "mlattr", "My Life as a Teenage Robot/Season 1/12_The_Great_Unwashed_.ia.mp4", "My Life as a Teenage Robot — The Great Unwashed", "nickelodeon kids television animated television after school", 2003),
    iaDirectRecovery("mlattr::My Life as a Teenage Robot/Season 1/13_The_Return_of_Raggedy_Android_.ia.mp4", "mlattr", "My Life as a Teenage Robot/Season 1/13_The_Return_of_Raggedy_Android_.ia.mp4", "My Life as a Teenage Robot — The Return of Raggedy Android", "nickelodeon kids television animated television after school", 2003),
    iaDirectRecovery("courage-the-cowardly-dog-1080p-ai-upscale::Courage the Cowardly Dog - 01x02 - Cajun Granny Stew.mp4", "courage-the-cowardly-dog-1080p-ai-upscale", "Courage the Cowardly Dog - 01x02 - Cajun Granny Stew.mp4", "Courage the Cowardly Dog — Cajun Granny Stew", "cartoon network kids television animated television after school", 1999),
    iaDirectRecovery("courage-the-cowardly-dog-1080p-ai-upscale::Courage the Cowardly Dog - 01x03 - The Shadow of Courage.mp4", "courage-the-cowardly-dog-1080p-ai-upscale", "Courage the Cowardly Dog - 01x03 - The Shadow of Courage.mp4", "Courage the Cowardly Dog — The Shadow of Courage", "cartoon network kids television animated television after school", 1999),
  ],
  "62": [
    { identifier: "ncaamm2016-wvu-sfa", title: "NCAA Men's Basketball Tournament — West Virginia vs. Stephen F. Austin (2016)", subject: "college basketball ncaa tournament college sports", year: 2016 },
    { identifier: "DavidJThomas2005LyonCollegeVolleyball", title: "2005 Lyon College Volleyball", subject: "college volleyball college sports athletics", year: 2005 },
    { identifier: "HBU_TVShow1_0", title: "HBU Huskies College Sports", subject: "college sports athletics university", year: 2010 },
    { identifier: "IntheGameFilm", title: "In the Game — Stanford Women's Basketball (1994)", subject: "college basketball college sports athletics documentary", year: 1994 },
  ],
  "904": [
    { identifier: "001netlabel-jazz-01-recorcholis", title: "001 Records Netlabel — Chilean Jazz", subject: "jazz contemporary jazz free music", year: 2010 },
    { identifier: "ca200_cjazz", title: "Various — Clinical Jazz", subject: "jazz free jazz avant-garde contemporary jazz", year: 2008 },
    { identifier: "Aestrid_144", title: "Aestrid — Smooth Jazz", subject: "jazz smooth jazz contemporary jazz instrumental", year: 2007 },
    { identifier: "Sorrow-Line259", title: "Sorrow — Line 259", subject: "jazz contemporary jazz", year: 2010 },
    { identifier: "MIXG032", title: "Retrovision — Free Jazz, Blues & Lo-Fi", subject: "jazz contemporary jazz free music", year: 2013 },
  ],
  "908": [
    iaDirectRecovery("clubdelcountry::2006/2006-01-29.mp3", "clubdelcountry", "2006/2006-01-29.mp3", "Club del Country — January 29, 2006", "country music bluegrass honky tonk americana", 2006, "audio"),
    iaDirectRecovery("clubdelcountry::2006/2006-08-14.mp3", "clubdelcountry", "2006/2006-08-14.mp3", "Club del Country — August 14, 2006", "country music bluegrass honky tonk americana", 2006, "audio"),
    iaDirectRecovery("clubdelcountry::2009/2009-09-21Part143-3.mp3", "clubdelcountry", "2009/2009-09-21Part143-3.mp3", "Club del Country — Part 143", "country music bluegrass honky tonk americana", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/2009-09-28Part144-1.mp3", "clubdelcountry", "2009/2009-09-28Part144-1.mp3", "Club del Country — Part 144A", "country music bluegrass honky tonk americana", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/2009-09-28Part144-2.mp3", "clubdelcountry", "2009/2009-09-28Part144-2.mp3", "Club del Country — Part 144B", "country music bluegrass honky tonk americana", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-09-28Part144-3.mp3", "clubdelcountry", "2009/cdc2009-09-28Part144-3.mp3", "Club del Country — Part 144C", "country music bluegrass honky tonk americana", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-10-05Part145-1.mp3", "clubdelcountry", "2009/cdc2009-10-05Part145-1.mp3", "Club del Country — Part 145A", "country music bluegrass honky tonk americana", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-10-05Part145-2.mp3", "clubdelcountry", "2009/cdc2009-10-05Part145-2.mp3", "Club del Country — Part 145B", "country music bluegrass honky tonk americana", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-10-05Part145-3.mp3", "clubdelcountry", "2009/cdc2009-10-05Part145-3.mp3", "Club del Country — Part 145C", "country music bluegrass honky tonk americana", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-10-12Part146-1.mp3", "clubdelcountry", "2009/cdc2009-10-12Part146-1.mp3", "Club del Country — Part 146A", "country music bluegrass honky tonk americana", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-10-12Part146-2.mp3", "clubdelcountry", "2009/cdc2009-10-12Part146-2.mp3", "Club del Country — Part 146B", "country music bluegrass honky tonk americana", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-10-12Part146-3.mp3", "clubdelcountry", "2009/cdc2009-10-12Part146-3.mp3", "Club del Country — Part 146C", "country music bluegrass honky tonk americana", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-10-19Part147-1.mp3", "clubdelcountry", "2009/cdc2009-10-19Part147-1.mp3", "Club del Country — Part 147A", "country music bluegrass honky tonk americana", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-10-19Part147-2.mp3", "clubdelcountry", "2009/cdc2009-10-19Part147-2.mp3", "Club del Country — Part 147B", "country music bluegrass honky tonk americana", 2009, "audio"),
  ],
  "920": [
    { identifier: "78_house-of-the-rising-sun_josh-white-and-his-guitar_gbia0001628b", title: "House of the Rising Sun — 78rpm Recording", subject: "78rpm early recording folk blues", year: 1942 },
    { identifier: "TheColumbiansCollection1924-1929DirectedByBenSelvin", title: "The Columbians Collection 1924–1929", subject: "78rpm early recording dance band", year: 1924 },
    { identifier: "AbeLymanCollection1925-1934", title: "Abe Lyman Collection 1925–1935", subject: "78rpm early recording dance band", year: 1925 },
    { identifier: "PaulWhiteman1920-1935CompleteCollection", title: "Paul Whiteman Collection 1920–1935", subject: "78rpm early recording jazz dance band", year: 1920 },
    { identifier: "TedLewisCollection1919-1934", title: "Ted Lewis Collection 1919–1934", subject: "78rpm early recording jazz dance band", year: 1919 },
  ],
  "82": [
    { identifier: "RoadstoR1950_2", title: "Roads to Romance: The Santa Cruz Trail and Land of the Giant Cactus", subject: "camping hiking trail wilderness travel outdoor recreation travel film", year: 1950 },
    { identifier: "0901_New_Oregon_Trail_The_01_36_49_27", title: "The New Oregon Trail", subject: "trail hiking wilderness travel outdoor recreation", year: 1950 },
    { identifier: "HMEmmausBoysCampW98617", title: "Emmaus Boys Camp, Wesco, Missouri", subject: "camping outdoor recreation wilderness travel", year: 1934 },
    { identifier: "amateur_film_ice_harvest_camp_minisi_1921", title: "Ice Harvest at Camp Minsi", subject: "camping outdoor recreation winter travel", year: 1921 },
    { identifier: "diary_of_a_mountain_girl_1927-1939", title: "Diary of a Mountain Girl", subject: "mountain hiking wilderness travel outdoor recreation", year: 1930 },
  ],
  "19": [
    { identifier: "The_Beverly_Hillbillies", title: "The Beverly Hillbillies — Granny's Garden", subject: "classic television family sitcom domestic sitcom", year: 1962 },
    { identifier: "TLS_Lucy_Gets_A_Roommate", title: "The Lucy Show — Lucy Gets a Roommate", subject: "classic television family sitcom domestic sitcom", year: 1963 },
    { identifier: "Andy_Griffith_A_Wife_For_Andy", title: "The Andy Griffith Show — A Wife for Andy", subject: "classic television family sitcom domestic sitcom", year: 1963 },
    { identifier: "Andy-Griffith-Show_Andy-Discovers-America", title: "The Andy Griffith Show — Andy Discovers America", subject: "classic television family sitcom domestic sitcom", year: 1961 },
    { identifier: "Beverly_Hillbillies_Ep03_Meanwhile_Back_At_The_Cabin", title: "The Beverly Hillbillies — Meanwhile Back at the Cabin", subject: "classic television family sitcom domestic sitcom", year: 1962 },
  ],
  "906": [
    { identifier: "buddy-guy-srv-1986-lone-star-cafe-nyc", title: "Buddy Guy & Stevie Ray Vaughan — Lone Star Cafe, 1986", subject: "contemporary blues electric blues blues rock live music", year: 1986 },
    { identifier: "buddy-guy-the-sting-new-britain-ct-1992", title: "Buddy Guy — The Sting, New Britain, 1992", subject: "contemporary blues electric blues live music", year: 1992 },
    { identifier: "otis-rush-buddy-guy-chicago-blues-fest-1988", title: "Otis Rush & Buddy Guy — Chicago Blues Fest, 1988", subject: "contemporary blues chicago blues electric blues live music", year: 1988 },
    { identifier: "buddy-guy-stone-crazy", title: "Buddy Guy — Stone Crazy", subject: "contemporary blues electric blues chicago blues", year: 1981 },
    { identifier: "LegacyBluesLighninHopkins1", title: "Lightnin' Hopkins — Legacy of the Blues", subject: "contemporary blues texas blues electric blues", year: 1974 },
  ],
  "915": [
    { identifier: "FinnTheGiantMeetsSandmonkNewDubOrder", title: "Finn the Giant Meets Sandmonk — New Dub Order", subject: "reggae dub roots reggae instrumental music", year: 2007 },
    { identifier: "Brass_Islands_of_Dub", title: "Mikuś — Brass Islands of Dub", subject: "reggae dub instrumental music", year: 2011 },
    { identifier: "bigyouthhittheroadjack", title: "Big Youth — Hit the Road Jack", subject: "reggae roots reggae dub", year: 1970 },
    { identifier: "Reggaeska", title: "Reggae SKA", subject: "reggae ska roots reggae", year: 2010 },
    { identifier: "OldSkoolTagalogReggaeClassicsSongs2019ChocolateFactoryTropicalDepressionBlakdyak", title: "Old Skool Tagalog Reggae Classics", subject: "reggae ska roots reggae", year: 2019 },
    { identifier: "ReggaeFindTheOnesWorthSufferingForJoaoTacanhoEQ", title: "Reggae · Find the Ones Worth Suffering For", subject: "reggae roots reggae dub radio", year: 2016, media: { type: "audio", url: "https://archive.org/download/ReggaeFindTheOnesWorthSufferingForJoaoTacanhoEQ/Reggae%20Find%20The%20Ones%20Worth%20Suffering%20For%20Joao%20Tacanho%20EQ.mp3" } },
    { identifier: "ForeverLovingJahVersion2", title: "Forever Loving Jah", subject: "reggae roots reggae dub music", year: 2013, media: { type: "audio", url: "https://archive.org/download/ForeverLovingJahVersion2/Forever%20Loving%20Jah_Version2.mp3" } },
    { identifier: "BurningSpear2007-01-03.fob-schoeps-mk21.stone.83206.flac1644::t01", title: "Burning Spear · Live at Jam Cruise 5", subject: "reggae roots reggae live music radio", year: 2007, media: { type: "audio", url: "https://archive.org/download/BurningSpear2007-01-03.fob-schoeps-mk21.stone.83206.flac1644/bspear2007-01-03t01.mp3" } },
    { identifier: "bmatwuprs180558979::01", title: "Bob Marley & The Wailers · Uprising", subject: "reggae roots reggae music radio", year: 1980, media: { type: "audio", url: "https://archive.org/download/bmatwuprs180558979/01.%20Coming%20In%20From%20The%20Cold.mp3" } },
    { identifier: "jcliff1992-08.22::03", title: "Jimmy Cliff · War A Africa", subject: "reggae roots reggae live music radio", year: 1992, media: { type: "audio", url: "https://archive.org/download/jcliff1992-08.22/JimmyCliff1992-08-22t03_War%20A%20Africa.mp3" } },
    { identifier: "ziggymarley2014-04-11.vwmule::t01", title: "Ziggy Marley · Live at Wanee", subject: "reggae roots reggae live music radio", year: 2014, media: { type: "audio", url: "https://archive.org/download/ziggymarley2014-04-11.vwmule/ziggymarley2014-04-11.vwmule.t01.mp3" } },
    { identifier: "toots2011-07-24.480-ck3.ua5::d1t02", title: "Toots & The Maytals · Live at Gathering of the Vibes", subject: "reggae ska roots reggae live music radio", year: 2011, media: { type: "audio", url: "https://archive.org/download/toots2011-07-24.480-ck3.ua5/toots2011-07-24.480-ck3.ua5.d1t02.mp3" } },
    { identifier: "twinklebrothersnevergetburn128k::track1", title: "Twinkle Brothers · Never Get Burn", subject: "reggae roots reggae ska music", year: 1980, media: { type: "audio", url: "https://archive.org/download/twinklebrothersnevergetburn128k/TWINKLE_BROTHERS_-_Never_Get_Burn%28128k%29.mp3" } },
    { identifier: "rebel-reggae-radio-show-6", title: "Rebel Reggae Radio Show 6", subject: "reggae dub ska radio music", year: 2010, media: { type: "audio", url: "https://archive.org/download/rebel-reggae-radio-show-6/rebel%20reggae%20radio%20show%206.mp3" } },
    { identifier: "more-fire-dennis-brown-2026", title: "Dennis Brown · More Fire (2026)", subject: "reggae roots reggae dub music", year: 2026, media: { type: "audio", url: "https://archive.org/download/more-fire-dennis-brown-2026/more%20fire%20Dennis%20%20Brown%20%202026.mp3" } },
    { identifier: "sister-charmaine-wake-up-1988-vls::version", title: "Sister Charmaine · Wake Up Version", subject: "reggae roots reggae dub music", year: 1988, media: { type: "audio", url: "https://archive.org/download/sister-charmaine-wake-up-1988-vls/Sister%20Charmaine%20-%20Wake%20Up%20%5BVLS%5D%20%5BFLAC%5D/B%20-%20Wake%20Up%20%28Version%29.mp3" } },
  ],
  "204": [
    { identifier: "Doctorin1946", title: "Doctor in Industry (Part I)", subject: "public health educational film industrial film sponsored film", year: 1946 },
    { identifier: "HealthYo1953", title: "Health: Your Posture", subject: "public health educational film safety film", year: 1953 },
    { identifier: "Sleepfor1950", title: "Sleep for Health", subject: "public health educational film classroom film", year: 1950 },
    { identifier: "EatforHe1954", title: "Eat for Health", subject: "public health educational film consumer culture", year: 1954 },
    { identifier: "Careofth1949", title: "Care of the Skin", subject: "public health educational film sponsored film", year: 1949 },
  ],
  "206": [
    { identifier: "090-aahma-watermarked", title: "090_AAHMA Home Movie", subject: "home movie amateur film super 8 family life travel road trip", year: 1970 },
    { identifier: "IICADOM_0905", title: "Gerardmer '51 — Grand Ballon d'Alsace", subject: "home movie amateur film 8mm travel France", year: 1951 },
    { identifier: "ALCFJamesKilgoreClip5221", title: "James Kilgore Films — 1982 World's Fair", subject: "home movie amateur film travel tourism family film 1980s", year: 1982 },
    { identifier: "10942_brt40con133_hm_travel_san_francisco", title: "Home Movie — Travel, San Francisco", subject: "home movie amateur film travelogue San Francisco", year: 1960 },
    { identifier: "amateur_west_1940_1", title: "Amateur Film — West 1940", subject: "amateur film home movie travelogue Grand Canyon Colorado River", year: 1940 },
  ],
  "106": [
    iaDirectRecovery("DasKabinettdesDoktorCaligariTheCabinetofDrCaligari::The_Cabinet_of_Dr._Caligari_512kb.mp4", "DasKabinettdesDoktorCaligariTheCabinetofDrCaligari", "The_Cabinet_of_Dr._Caligari_512kb.mp4", "The Cabinet of Dr. Caligari", "world cinema foreign film German cinema international cinema", 1919),
    iaDirectRecovery("WarOfTheRobots::WarOfTheRobots1978.mp4", "WarOfTheRobots", "WarOfTheRobots1978.mp4", "War of the Robots", "world cinema foreign film Italian cinema international cinema", 1978),
    iaDirectRecovery("BattleOfTheWorldsWidesceen::Battle of the Worlds NTSC_1.mp4", "BattleOfTheWorldsWidesceen", "Battle of the Worlds NTSC_1.mp4", "Battle of the Worlds", "world cinema foreign film Italian cinema international cinema", 1961),
    iaDirectRecovery("AtomAgeVampire::AtomAgeVampire_512kb.mp4", "AtomAgeVampire", "AtomAgeVampire_512kb.mp4", "Atom Age Vampire", "world cinema foreign film Italian cinema international cinema", 1960),
    iaDirectRecovery("StarOdysseyitalianStarWars1979::STAR_ODYSSEY_1979-desktop_512kb.mp4", "StarOdysseyitalianStarWars1979", "STAR_ODYSSEY_1979-desktop_512kb.mp4", "Star Odyssey", "world cinema foreign film Italian cinema international cinema", 1979),
    iaDirectRecovery("the-shop-on-main-street::The Shop on Main Street.mp4", "the-shop-on-main-street", "The Shop on Main Street.mp4", "The Shop on Main Street", "world cinema foreign film Slovak cinema international cinema", 1965),
    iaDirectRecovery("cadena.perpetua.1979::Cadena.perpetua.1979.Arturo.Ripstein.mp4", "cadena.perpetua.1979", "Cadena.perpetua.1979.Arturo.Ripstein.mp4", "Life Sentence", "world cinema foreign film Mexican cinema international cinema", 1979),
    iaDirectRecovery("de.espaldas.a.la.puerta.-1959::De.espaldas.a.la.puerta.1959.SATRip.x264.AC3-mifune.mp4", "de.espaldas.a.la.puerta.-1959", "De.espaldas.a.la.puerta.1959.SATRip.x264.AC3-mifune.mp4", "Back to the Door", "world cinema foreign film Spanish cinema international cinema", 1959),
    iaDirectRecovery("curse-of-the-oily-man::Curse of the Oily Man.mp4", "curse-of-the-oily-man", "Curse of the Oily Man.mp4", "Curse of the Oily Man", "world cinema foreign film international cinema arthouse film", 1958),
    iaDirectRecovery("after.-the.-curfew.-1954.1080p.-blu-ray.x-264.-aac-yts.-mx::After.The.Curfew.1954.1080p.BluRay.x264.AAC-[YTS.MX].mp4", "after.-the.-curfew.-1954.1080p.-blu-ray.x-264.-aac-yts.-mx", "After.The.Curfew.1954.1080p.BluRay.x264.AAC-[YTS.MX].mp4", "After the Curfew", "world cinema foreign film Indonesian cinema international cinema", 1954),
    iaDirectRecovery("mosfilms-adaptation-of-fyodor-dostoevskys-white-nights-1959-subtitled-in-literar::Mosfilm's Adaptation of Fyodor Dostoevsky's White Nights 1959 Subtitled in Literary Arabic Translations.ia.mp4", "mosfilms-adaptation-of-fyodor-dostoevskys-white-nights-1959-subtitled-in-literar", "Mosfilm's Adaptation of Fyodor Dostoevsky's White Nights 1959 Subtitled in Literary Arabic Translations.ia.mp4", "White Nights", "world cinema foreign film Russian cinema international cinema", 1959),
    iaDirectRecovery("dien-bien-phu-1992-french-with-english-subs::Diên Biên Phú (1992) [Donald Pleasence; French w. Subs].ia.mp4", "dien-bien-phu-1992-french-with-english-subs", "Diên Biên Phú (1992) [Donald Pleasence; French w. English Subs].ia.mp4", "Diên Biên Phú", "world cinema foreign film French cinema international cinema", 1992),
    iaDirectRecovery("absences-repetees::Absences repetees.mp4", "absences-repetees", "Absences repetees.mp4", "Repeated Absences", "world cinema foreign film French cinema arthouse film", 1972),
    iaDirectRecovery("tiyanak-1988::Tiyanak 1988 stitch w open fix and full end cred.ia.mp4", "tiyanak-1988", "Tiyanak 1988 stitch w open fix and full end cred.ia.mp4", "Tiyanak", "world cinema foreign film Filipino cinema international cinema", 1988),
    iaDirectRecovery("la_jument_vapeur_1978::834407697013.mp4", "la_jument_vapeur_1978", "834407697013.mp4", "Dirty Dishes", "world cinema foreign film French cinema international cinema", 1978),
  ],
  "17": [
    { identifier: "the-tonight-show-starring-johnny-carson::1954-09-27 - NBC Tonight Starring Steve Allen - S01E01 - 'Tonight!' National Premiere (September 27, 1954).mp4", sourceIdentifier: "the-tonight-show-starring-johnny-carson", title: "Tonight! — National Premiere", subject: "late night talk show variety interview television", year: 1954 },
    { identifier: "the-tonight-show-starring-johnny-carson::1954-12-09 - NBC Tonight Starring Steve Allen - S01E51 - Zsa Zsa Gabor, Jose Ferrer, Jerome Hines, Sandor Glancz (December 9, 1954).mp4", sourceIdentifier: "the-tonight-show-starring-johnny-carson", title: "Tonight! — Zsa Zsa Gabor and Jose Ferrer", subject: "late night talk show variety interview television", year: 1954 },
    { identifier: "the-tonight-show-starring-johnny-carson::1962-11-19 - The Tonight ShowStarring Johnny Carson - S01E35 - Patricia Morison, Jack Douglas and wife Reiko (November 19, 1962).mp4", sourceIdentifier: "the-tonight-show-starring-johnny-carson", title: "The Tonight Show — Patricia Morison and Jack Douglas", subject: "late night talk show variety interview television", year: 1962 },
    { identifier: "the-tonight-show-starring-johnny-carson::1963-12-03 - The Tonight ShowStarring Johnny Carson - S02E22 - Henny Youngman, Don Stewart, Ivan Sanderson, Annie Fargé (December 3, 1963).mp4", sourceIdentifier: "the-tonight-show-starring-johnny-carson", title: "The Tonight Show — Henny Youngman and Don Stewart", subject: "late night talk show variety interview television", year: 1963 },
    { identifier: "the-tonight-show-starring-johnny-carson::1964-04-22 - The Tonight ShowStarring Johnny Carson - S02E122 - Arlene Dahl, Henry Morgan, Jake Ehrlich (April 22, 1964).mp4", sourceIdentifier: "the-tonight-show-starring-johnny-carson", title: "The Tonight Show — Arlene Dahl and Henry Morgan", subject: "late night talk show variety interview television", year: 1964 },
  ],
  "113": [
    { identifier: "TheScreamingSkullHD1958", title: "The Screaming Skull", subject: "cult horror b movie drive-in film", year: 1958 },
    { identifier: "plan-9-from-outer-space_202009", title: "Plan 9 from Outer Space", subject: "cult horror b movie drive-in science fiction film", year: 1959 },
    { identifier: "WickedKittyHosts-RogerCormansAttackOfTheCrabMonsters", title: "Attack of the Crab Monsters — Hosted Feature", subject: "cult horror b movie drive-in horror host film", year: 1957 },
    { identifier: "Weird-o-ramaWeird-cast1-Part1TheScreamingSkull", title: "Weird-O-Rama — The Screaming Skull", subject: "cult horror b movie horror host film", year: 2011 },
    { identifier: "robot-monster-1953", title: "Robot Monster", subject: "cult horror b movie drive-in science fiction film", year: 1953 },
  ],
  "214": [
    { identifier: "TexasFar1952", title: "Texas Farm Family", subject: "farm farming agriculture rural life rural america", year: 1952 },
    { identifier: "AboutBan1935", title: "About Bananas", subject: "agriculture farm food industry rural life", year: 1935 },
    { identifier: "FromtheG1954", title: "From the Ground Up", subject: "agriculture farm food industry rural life", year: 1954 },
    { identifier: "Chickeno1948", title: "The Chicken of Tomorrow", subject: "farm farming agriculture rural life", year: 1948 },
    { identifier: "FoodforF1943", title: "Food for Fighters", subject: "agriculture farming rural america food production", year: 1943 },
  ],
  "238": [
    { identifier: "book-talk-data-cartels", title: "Book Talk: Data Cartels", subject: "author interview book talk literature", year: 2022, media: { type: "video", url: "https://archive.org/download/book-talk-data-cartels/Book%20Talk%20Data%20Cartels.mp4" } },
    { identifier: "book-talk-the-catalogue-of-shipwrecked-books", title: "Book Talk: The Catalogue of Shipwrecked Books", subject: "author interview book talk literature", year: 2022, media: { type: "video", url: "https://archive.org/download/book-talk-the-catalogue-of-shipwrecked-books/Book%20Talk%20The%20Catalogue%20of%20Shipwrecked%20Books.mp4" } },
    { identifier: "the-library-a-fragile-history", title: "Book Talk: The Library: A Fragile History", subject: "author interview book talk literature library program", year: 2022, media: { type: "video", url: "https://archive.org/download/the-library-a-fragile-history/The%20Library%20A%20Fragile%20History.mp4" } },
    { identifier: "book-talk-walled-culture", title: "Book Talk: Walled Culture", subject: "author interview book talk literature", year: 2022, media: { type: "video", url: "https://archive.org/download/book-talk-walled-culture/Walled%20Culture.mp4" } },
    { identifier: "athena-unbound", title: "Book Talk: Athena Unbound", subject: "author interview book talk literature", year: 2023, media: { type: "video", url: "https://archive.org/download/athena-unbound/Athena%20Unbound.mp4" } },
    { identifier: "CSPAN2_20140511_060400_Book_Discussion_on_Game_Plan", title: "C-SPAN2 · Book Discussion on Game Plan", subject: "author interview book discussion literature book talk", year: 2014, media: { type: "video", url: "https://archive.org/download/CSPAN2_20140511_060400_Book_Discussion_on_Game_Plan/CSPAN2_20140511_060400_Book_Discussion_on_Game_Plan.mp4" } },
    { identifier: "dni.ncaa.IGNCA-818-VHS", title: "Memorial Lecture on Acharya Hazari Prasad Dwivedi", subject: "literature author lecture book discussion", year: 1994, media: { type: "video", url: "https://archive.org/download/dni.ncaa.IGNCA-818-VHS/IGNCA-818-VHS.ia.mp4" } },
    { identifier: "f8_2007-08-16_longenbach_read", title: "BLWC · James Longenbach Reading", subject: "author reading poetry reading literature", year: 2007, media: { type: "video", url: "https://archive.org/download/f8_2007-08-16_longenbach_read/f8_2007-08-16_longenbach_read.mp4" } },
    { identifier: "f8_2007-08-20_jones_read", title: "BLWC · T. Jones Reading", subject: "author reading poetry reading literature", year: 2007, media: { type: "video", url: "https://archive.org/download/f8_2007-08-20_jones_read/f8_2007-08-20_jones_read.mp4" } },
    { identifier: "f8_2008-08-15_peterson_read", title: "BLWC · Katie Peterson Reading", subject: "author reading poetry reading literature", year: 2008, media: { type: "video", url: "https://archive.org/download/f8_2008-08-15_peterson_read/f8_2008-08-15_peterson_read.mp4" } },
    { identifier: "f8_2008-08-18_freed_read", title: "BLWC · Lynn Freed Reading", subject: "author reading poetry reading literature", year: 2008, media: { type: "video", url: "https://archive.org/download/f8_2008-08-18_freed_read/f8_2008-08-18_freed_read.mp4" } },
    { identifier: "primer-congreso-de-literatura-contemporanea-the-struggle-against-literature-in-c", title: "Primer Congreso de Literatura Contemporánea · Victoria Carchidi", subject: "author lecture literature literary event book discussion", year: 1991, media: { type: "video", url: "https://archive.org/download/primer-congreso-de-literatura-contemporanea-the-struggle-against-literature-in-c/Primer%20Congreso%20de%20Literatura%20Contempor%C3%A1nea-The%20Struggle%20Against%20Literature%20in%20Conflict-Dr.%20Victoria%20Carchidi%20%2805-Feb-1991%29.ia.mp4" } },
    { identifier: "oh-why-live-to-regret-fitzroy-tavern-london", title: "Joe Pasquale · Live Poetry Reading at Fitzroy Tavern", subject: "poetry reading author reading literature literary event", year: 2025, media: { type: "video", url: "https://archive.org/download/oh-why-live-to-regret-fitzroy-tavern-london/Oh%20Why%20Live%20to%20Regret%20Fitzroy%20Tavern%20London.mp4" } },
    { identifier: "susandaitch2021", title: "Susan Daitch · Literature Class", subject: "author interview literature book discussion literary event", year: 2021, media: { type: "video", url: "https://archive.org/download/susandaitch2021/susandaitch2021.mp4" } },
    { identifier: "SALEp108", title: "S&L Video Rewind · Interview with Daniel Suarez", subject: "author interview book talk literature writer interview", year: 2012, media: { type: "video", url: "https://archive.org/download/SALEp108/SAL_ep108.mp4" } },
  ],
  "205": [
    { identifier: "sight-sound-queen-esther-small-file", title: "Sight & Sound — Jesus / Queen Esther", subject: "hymn gospel worship religious service", year: 2013, media: { type: "video", url: "https://archive.org/download/sight-sound-queen-esther-small-file/Sight%20%26%20Sound%20-%20Queen%20Esther%20-%20Small%20File.ia.mp4" } },
    { identifier: "BillAndGloria", title: "Seventh Day Adventist Christian Hymn", subject: "hymn gospel worship sacred music", year: 2008, media: { type: "video", url: "https://archive.org/download/BillAndGloria/Bill%20andGloria.mp4" } },
    { identifier: "YoungBaptistExposesvictoryInJesus", title: "Victory in Jesus — Baptist Hymn", subject: "hymn gospel worship sacred music", year: 2009, media: { type: "video", url: "https://archive.org/download/YoungBaptistExposesvictoryInJesus/YoungBaptistExposesVictoryInJesusBaptistHymn243-Repentance.ogv" } },
    { identifier: "BAVC1013279_SFJZ1889", title: "The Story of Gospel", subject: "hymn gospel worship religious service gospel music", year: 1992, media: { type: "video", url: "https://archive.org/download/BAVC1013279_SFJZ1889/BAVC1013279_SFJZ1889_access.HD.mp4" } },
    { identifier: "pilgrims-progress-02-christiana-360p-30fps-h-264-128kbit-aac_202212", title: "Pilgrim's Progress — Christian & Christiana", subject: "religious film worship christian gospel", year: 2022 },
  ],
  "111": [
    { identifier: "sex_madness", title: "Sex Madness (1938)", subject: "drive-in exploitation cult film grindhouse", year: 1938 },
    { identifier: "reefer_madness1938", title: "Reefer Madness (1938)", subject: "drive-in exploitation cult film grindhouse", year: 1938 },
    { identifier: "DoubleFeatureHell2theGrindhouseExperience", title: "Double Feature Hell 2 — The Grindhouse Experience", subject: "drive-in exploitation grindhouse cult film", year: 2010 },
    { identifier: "Rent-a-girl1965ExploitationRoughie", title: "Rent-A-Girl (1965)", subject: "drive-in exploitation b-movie grindhouse", year: 1965 },
    { identifier: "Night_Of_The_Living_Dead_raw_HD_WS", title: "Night of the Living Dead (1968)", subject: "drive-in horror cult film independent film", year: 1968 },
  ],
  "117": [
    { identifier: "pinkflamingos1972_202211", title: "Pink Flamingos (1972)", subject: "independent film underground cinema film festival", year: 1972 },
    { identifier: "StarWreckInThePirkining", title: "Star Wreck: In the Pirkining (2005)", subject: "independent film film festival cult cinema", year: 2005 },
    { identifier: "DeadManDrinking", title: "Dead Man Drinking", subject: "independent film australian cinema", year: 2008 },
    { identifier: "EvelKnievel", title: "Evel Knievel (1971)", subject: "independent film american cinema", year: 1971 },
    { identifier: "nasty-girls", title: "Nasty Girls (1998)", subject: "independent film rare film underground cinema", year: 1998 },
    { identifier: "prkcitut-Of_Verona_Interview_-_Live_on_Park_City_Television", title: "Of Verona · Live on Park City Television", subject: "independent film film festival filmmaker interview cinema", year: 2011, media: { type: "video", url: "https://archive.org/download/prkcitut-Of_Verona_Interview_-_Live_on_Park_City_Television/Of_Verona_Interview_-_Live_on_Park_City_Television.mp4" } },
    { identifier: "cittvny-Toronto_Film_Festival_Unpeeled", title: "Toronto Film Festival · Unpeeled", subject: "independent film film festival cinema", year: 2023, media: { type: "video", url: "https://archive.org/download/cittvny-Toronto_Film_Festival_Unpeeled/Toronto_Film_Festival_Unpeeled.mp4" } },
    { identifier: "asdk12ak-Student_Film_Festival_2012", title: "Student Film Festival 2012", subject: "independent film film festival student cinema", year: 2012, media: { type: "video", url: "https://archive.org/download/asdk12ak-Student_Film_Festival_2012/Student_Film_Festival_2012.mp4" } },
    { identifier: "all-of-this-unreal-time", title: "All of This Unreal Time", subject: "independent film art film festival cinema", year: 2021, media: { type: "video", url: "https://archive.org/download/all-of-this-unreal-time/All%20of%20This%20Unreal%20Time.mp4" } },
    { identifier: "she-is-gtbl::ia", title: "She Is Going To Be Late", subject: "independent film art film festival cinema", year: 2021, media: { type: "video", url: "https://archive.org/download/she-is-gtbl/SHE%20IS%20GTBL.ia.mp4" } },
    { identifier: "HuntedGordonPinkerton", title: "Hunted", subject: "independent film film festival thesis film cinema", year: 2011, media: { type: "video", url: "https://archive.org/download/HuntedGordonPinkerton/Hunted%20-%20Gordon%20Pinkerton%20-%20Ringling%20Thesis%202011.mp4" } },
    { identifier: "be-nice-to-my-imaginary-friend-2019", title: "Be Nice to My Imaginary Friend", subject: "independent film film festival cinema", year: 2019, media: { type: "video", url: "https://archive.org/download/be-nice-to-my-imaginary-friend-2019/Be%20Nice%20to%20my%20Imaginary%20Friend%20%282019%29.mp4" } },
    { identifier: "2016GoldenFilmAwardGFAWinnersLongVersion", title: "Golden Film Award Winners (2016)", subject: "independent film film festival cinema", year: 2016, media: { type: "video", url: "https://archive.org/download/2016GoldenFilmAwardGFAWinnersLongVersion/2016%20Golden%20Film%20Award%20GFA%20Winners%20Long%20Version.mp4" } },
    { identifier: "inlandia", title: "Inlandia (2006)", subject: "independent film art film festival cinema", year: 2006, media: { type: "video", url: "https://archive.org/download/inlandia/Inlandia%20%282006%29.mp4" } },
    { identifier: "hot-love-1985-hd-jorg-buttgereit-1", title: "Hot Love (1985)", subject: "independent film underground cinema film festival", year: 1985 },
  ],
  "220": [
    { identifier: "BobRossTheHappyPainter", title: "Bob Ross: The Happy Painter", subject: "bob ross the joy of painting painting show comfort television", year: 2011 },
    { identifier: "TomFrankStudiosJacobPaintswithBobRoss", title: "Jacob Paints with Bob Ross", subject: "bob ross the joy of painting painting show", year: 2013 },
    { identifier: "youtube-aOJsKNzO3i8", title: "Bob Ross — Ebony Sea", subject: "bob ross the joy of painting painting show", year: 2015 },
    { identifier: "william-alexander-bob-ross-and-me", title: "William Alexander, Bob Ross, and Me", subject: "bob ross painting show comfort television", year: 2000 },
    { identifier: "ReadingRainbowTVSeries", title: "Reading Rainbow — TV Series", subject: "reading rainbow comfort television educational television", year: 1983 },
  ],
  "222": [
    { identifier: "pryor_202009", title: "Richard Pryor — Stand-Up", subject: "stand-up comedy comedy special live comedy", year: 1980, media: { type: "video", url: "https://archive.org/download/pryor_202009/RICHARD_PRYOR/VIDEO_TS/VTS_01_1.mp4" } },
    { identifier: "lee-evans-collection::1994", title: "Lee Evans — Live at Her Majesty's Theatre", subject: "stand-up comedy comedy special live comedy", year: 1994, media: { type: "video", url: "https://archive.org/download/lee-evans-collection/1.%20Live%20At%20Her%20Majesty%27s%20Theatre%20%281994%29.mp4" } },
    { identifier: "01-just-for-laughs", title: "Just for Laughs — Stand-Up Comedy", subject: "stand-up comedy comedy club live comedy", year: 2010, media: { type: "video", url: "https://archive.org/download/01-just-for-laughs/01%20JUST%20FOR%20LAUGHS.ia.mp4" } },
    { identifier: "words-words-words-hd_2010", title: "Bo Burnham — Words Words Words", subject: "stand-up comedy comedy special live comedy", year: 2010, media: { type: "video", url: "https://archive.org/download/words-words-words-hd_2010/Words%20Words%20Words%20%28HD%29.ia.mp4" } },
    { identifier: "richard-pryor-live", title: "Richard Pryor Live", subject: "stand-up comedy comedy special live comedy", year: 1979, media: { type: "video", url: "https://archive.org/download/richard-pryor-live/richard%20pryor%20live.mp4" } },
    { identifier: "lee-evans-collection", title: "Lee Evans — Complete Live Collection", subject: "stand-up comedy comedy special live comedy", year: 1994 },
    { identifier: "GeorgeLopezWhyYouCryingFullStandUpComedyShowLive", title: "George Lopez — Why You Crying", subject: "stand-up comedy comedy special live comedy", year: 2007 },
    { identifier: "BrianRegan-husbands", title: "Brian Regan — Husbands", subject: "stand-up comedy comedy special live comedy", year: 2008 },
    { identifier: "stewart-lees-comedy-vehicle-season-04-e-03-patriotism", title: "Stewart Lee's Comedy Vehicle — Patriotism", subject: "stand-up comedy comedy special live comedy", year: 2016 },
    { identifier: "stewart-lees-comedy-vehicle-season-04-e-05-migrants", title: "Stewart Lee's Comedy Vehicle — Migrants", subject: "stand-up comedy comedy special live comedy", year: 2016 },
    { identifier: "stewart-lees-comedy-vehicle-season-04-e-01-wealth", title: "Stewart Lee's Comedy Vehicle — Wealth", subject: "stand-up comedy comedy special live comedy", year: 2016 },
    { identifier: "stewart-lees-comedy-vehicle-season-04-e-02-islamophobia", title: "Stewart Lee's Comedy Vehicle — Islamophobia", subject: "stand-up comedy comedy special live comedy", year: 2016 },
    { identifier: "katt.-williams.-the.-pimp.-chronicles.-pt.-1.2006.1080p.-webrip.x-264-rarbg_202407", title: "Katt Williams — The Pimp Chronicles", subject: "stand-up comedy comedy special live comedy", year: 2006 },
    { identifier: "trevor-noah-the-daywalker-special-edition-2009-dvdri-p", title: "Trevor Noah — The Daywalker", subject: "stand-up comedy comedy special live comedy", year: 2009 },
    { identifier: "IndianInvasionComedy-IndianStandUpComedy", title: "Indian Invasion Comedy", subject: "stand-up comedy comedy special live comedy", year: 2007 },
    { identifier: "y-2-mate.is-nick-mullen-is-back-r-5-tuzx-0-h-6zw-720p-1648711911431", title: "Nick Mullen — Live Stand-Up", subject: "stand-up comedy comedy special live comedy", year: 2022 },
  ],
  "922": [
    { identifier: "clubdelcountry::2006-01-29", title: "Club del Country — January 29, 2006", subject: "country music americana honky tonk radio", year: 2006, media: { type: "audio", url: "https://archive.org/download/clubdelcountry/2006/2006-01-29.mp3" } },
    { identifier: "clubdelcountry::2006-08-14", title: "Club del Country — August 14, 2006", subject: "country music americana honky tonk radio", year: 2006, media: { type: "audio", url: "https://archive.org/download/clubdelcountry/2006/2006-08-14.mp3" } },
    { identifier: "townhousewoodshardcountry", title: "Townhouse Woods — Hard Country", subject: "country music hard country americana radio", year: 2010, media: { type: "audio", url: "https://archive.org/download/townhousewoodshardcountry/Townhouse_Woods_-_Hard_Country.mp3" } },
    { identifier: "diymAR06::01", title: "Derek Clegg — The River", subject: "country music alt-country acoustic folk radio", year: 2011, media: { type: "audio", url: "https://archive.org/download/diymAR06/01-Derek_Clegg-The_River.mp3" } },
    { identifier: "david-allan-coe-underground-album-1982::01", title: "David Allan Coe — Rock & Roll Fever", subject: "country music outlaw country country rock radio", year: 1982, media: { type: "audio", url: "https://archive.org/download/david-allan-coe-underground-album-1982/01.%20Rock%20%26%20Roll%20Fever.mp3" } },
    { identifier: "clubdelcountry::2009-09-21-part143-3", title: "Club del Country — Part 143", subject: "country music bluegrass honky tonk americana radio", year: 2009, media: { type: "audio", url: "https://archive.org/download/clubdelcountry/2009/2009-09-21Part143-3.mp3" } },
    { identifier: "clubdelcountry::2009-09-28-part144-1", title: "Club del Country — Part 144A", subject: "country music bluegrass honky tonk americana radio", year: 2009, media: { type: "audio", url: "https://archive.org/download/clubdelcountry/2009/2009-09-28Part144-1.mp3" } },
    { identifier: "clubdelcountry::2009-09-28-part144-2", title: "Club del Country — Part 144B", subject: "country music bluegrass honky tonk americana radio", year: 2009, media: { type: "audio", url: "https://archive.org/download/clubdelcountry/2009/2009-09-28Part144-2.mp3" } },
    { identifier: "clubdelcountry::2009-09-28-part144-3", title: "Club del Country — Part 144C", subject: "country music bluegrass honky tonk americana radio", year: 2009, media: { type: "audio", url: "https://archive.org/download/clubdelcountry/2009/cdc2009-09-28Part144-3.mp3" } },
    { identifier: "clubdelcountry::2009-10-05-part145-1", title: "Club del Country — Part 145A", subject: "country music bluegrass honky tonk americana radio", year: 2009, media: { type: "audio", url: "https://archive.org/download/clubdelcountry/2009/cdc2009-10-05Part145-1.mp3" } },
    { identifier: "clubdelcountry::2009-10-05-part145-2", title: "Club del Country — Part 145B", subject: "country music bluegrass honky tonk americana radio", year: 2009, media: { type: "audio", url: "https://archive.org/download/clubdelcountry/2009/cdc2009-10-05Part145-2.mp3" } },
    { identifier: "clubdelcountry::2009-10-05-part145-3", title: "Club del Country — Part 145C", subject: "country music bluegrass honky tonk americana radio", year: 2009, media: { type: "audio", url: "https://archive.org/download/clubdelcountry/2009/cdc2009-10-05Part145-3.mp3" } },
    { identifier: "clubdelcountry::2009-10-12-part146-1", title: "Club del Country — Part 146A", subject: "country music bluegrass honky tonk americana radio", year: 2009, media: { type: "audio", url: "https://archive.org/download/clubdelcountry/2009/cdc2009-10-12Part146-1.mp3" } },
    { identifier: "clubdelcountry::2009-10-12-part146-2", title: "Club del Country — Part 146B", subject: "country music bluegrass honky tonk americana radio", year: 2009, media: { type: "audio", url: "https://archive.org/download/clubdelcountry/2009/cdc2009-10-12Part146-2.mp3" } },
    { identifier: "clubdelcountry", title: "Club del Country — Complete Archive", subject: "country music bluegrass honky tonk americana radio", year: 2009 },
    { identifier: "OTRR_Delmore_Brothers_Singles", title: "Delmore Brothers — Single Episodes", subject: "country music bluegrass grand ole opry radio", year: 2012 },
    { identifier: "HootPodcast", title: "Hoot 'n Holler — Live Bluegrass Contest", subject: "country music bluegrass live music radio", year: 2004 },
    { identifier: "nr75-09-28.SBD", title: "Newgrass Revival — September 28, 1975", subject: "country music bluegrass live music radio", year: 1975 },
    { identifier: "redneck-28-spirit-of-the-south-bonus", title: "Redneck 28 — Spirit of the South", subject: "country music outlaw country country rock radio", year: 2008 },
    { identifier: "bigcitywaltz", title: "Big City Waltz", subject: "country music bluegrass radio", year: 2000 },
    { identifier: "david-allan-coe-underground-album-1982", title: "David Allan Coe — Underground Album", subject: "country music outlaw country country rock radio", year: 1982 },
    { identifier: "2022.10.01.TheLaneBrothers", title: "The Lane Brothers — Bluegrass", subject: "country music bluegrass live music radio", year: 2022 },
    { identifier: "2022-07-24-danny-paisley-southern-grass", title: "Danny Paisley & Southern Grass", subject: "country music bluegrass live music radio", year: 2022 },
  ],
  "231": [
    { identifier: "Automoti1940", title: "Automotive Service (1940)", subject: "automobile automotive car culture service and repair", year: 1940 },
    { identifier: "Signal301959", title: "Signal 30 — Automotive Safety (1959)", subject: "automotive car culture automobile safety", year: 1959 },
    { identifier: "RoadRunn1952", title: "Road Runners — Hot Rods & Car Culture", subject: "automotive car culture hot rods automobiles", year: 1952 },
    { identifier: "MasterHa1936", title: "Master Hands — Automobile Manufacturing", subject: "automobile manufacturing automotive industry car design", year: 1936 },
    { identifier: "styling_and_the_experimental_car", title: "Styling and the Experimental Car", subject: "automotive car design automobile industry", year: 1964 },
  ],
  "510": [
    { identifier: "retro-core-volume-1", title: "Retro Core — Volume 1", subject: "arcade game video game history retro gaming", year: 2004, media: { type: "video", url: "https://archive.org/download/retro-core-volume-1/retro-core-volume-1_512kb.mp4" } },
    { identifier: "FinalFantasy2_356", title: "Final Fantasy II — SNES Longplay", subject: "video game arcade game retro gaming", year: 2005, media: { type: "video", url: "https://archive.org/download/FinalFantasy2_356/FinalFantasy2_ending_512kb.mp4" } },
    { identifier: "BanjoTooie_100p_45413", title: "Banjo-Tooie — N64 Longplay", subject: "video game retro gaming home video game", year: 2005, media: { type: "video", url: "https://archive.org/download/BanjoTooie_100p_45413/BanjoTooie_100p_45413_HQ_part12_512kb.mp4" } },
    { identifier: "ZeldaMajorasMask_100p_655", title: "The Legend of Zelda: Majora's Mask — N64 Longplay", subject: "video game retro gaming home video game", year: 2005, media: { type: "video", url: "https://archive.org/download/ZeldaMajorasMask_100p_655/ZeldaMajorasMask_100p_655_HQ_part20_512kb.mp4" } },
    { identifier: "ChronoTrigger_456", title: "Chrono Trigger — SNES Longplay", subject: "video game retro gaming home video game", year: 2005, media: { type: "video", url: "https://archive.org/download/ChronoTrigger_456/ChronoTrigger_456_part34_512kb.mp4" } },
  ],
  "228": [
    { identifier: "George_Soros_1998_60_Minutes_Interview", title: "60 Minutes — George Soros Interview (1998)", subject: "60 minutes television newsmagazine investigative journalism", year: 1998 },
    { identifier: "WETA_20131009_140000_Frontline", title: "Frontline — WETA Broadcast (October 9, 2013)", subject: "frontline television newsmagazine investigative journalism", year: 2013 },
    { identifier: "WETA_20130926_090000_Frontline", title: "Frontline — WETA Broadcast (September 26, 2013)", subject: "frontline television newsmagazine investigative journalism", year: 2013 },
    { identifier: "KQED_20140514_040000_Frontline", title: "Frontline — KQED Broadcast (May 13, 2014)", subject: "frontline television newsmagazine investigative journalism", year: 2014 },
    { identifier: "KYW_20141012_230000_60_Minutes", title: "60 Minutes — KYW Broadcast (October 12, 2014)", subject: "60 minutes television newsmagazine investigative journalism", year: 2014 },
    { identifier: "WETA_20131009_110000_Frontline", title: "Frontline — WETA Broadcast (October 9, 2013, second airing)", subject: "frontline television newsmagazine investigative journalism", year: 2013 },
    { identifier: "KQED_20191030_110000_Frontline", title: "Frontline — KQED Broadcast (October 30, 2019)", subject: "frontline television newsmagazine investigative journalism", year: 2019 },
    { identifier: "KGO_20190414_050000_Nightline", title: "Nightline — KGO Broadcast (April 13, 2019)", subject: "nightline television newsmagazine investigative journalism", year: 2019 },
    { identifier: "MSNBCW_20190408_060000_Dateline", title: "Dateline — MSNBC Broadcast (April 7, 2019)", subject: "dateline television newsmagazine investigative journalism", year: 2019 },
    { identifier: "WRC_20090719_230000_Dateline_NBC", title: "Dateline NBC — WRC Broadcast (July 19, 2009)", subject: "dateline television newsmagazine investigative journalism", year: 2009 },
  ],
  "12": [
    { identifier: "whatsmyline5September1954", title: "What's My Line? — September 5, 1954", subject: "classic television game show panel show", year: 1954, media: { type: "video", url: "https://archive.org/download/whatsmyline5September1954/whatsmyline5September1954.mp4" } },
    { identifier: "whatsmyline22August1954", title: "What's My Line? — August 22, 1954", subject: "classic television game show panel show", year: 1954, media: { type: "video", url: "https://archive.org/download/whatsmyline22August1954/whatsmyline22August1954.mp4" } },
    { identifier: "whatsmyline7October1956", title: "What's My Line? — October 7, 1956", subject: "classic television game show panel show", year: 1956, media: { type: "video", url: "https://archive.org/download/whatsmyline7October1956/whatsmyline7October1956.mp4" } },
    { identifier: "totellthetruth16July1957", title: "To Tell the Truth — July 16, 1957", subject: "classic television game show panel show", year: 1957, media: { type: "video", url: "https://archive.org/download/totellthetruth16July1957/totellthetruth16July1957.mp4" } },
    { identifier: "ive-got-a-secret-17-january-1966", title: "I've Got a Secret — January 17, 1966", subject: "classic television game show panel show", year: 1966, media: { type: "video", url: "https://archive.org/download/ive-got-a-secret-17-january-1966/I've%20Got%20a%20Secret%20-%2017%20January%201966.mp4" } },
    { identifier: "Yet_More_Lucy", title: "What's My Line? with Lucille Ball — February 21, 1954", subject: "classic television game show panel show", year: 1954, media: { type: "video", url: "https://archive.org/download/Yet_More_Lucy/WhatsMyLine21February1954.mp4" } },
    { identifier: "ToTellTheTruth30July1957", title: "To Tell the Truth — July 30, 1957", subject: "classic television game show panel show", year: 1957, media: { type: "video", url: "https://archive.org/download/ToTellTheTruth30July1957/To%20Tell%20The%20Truth%20-%2030%20July%201957.mp4" } },
    { identifier: "whats-my-line-2-october-1955", title: "What's My Line? — October 2, 1955", subject: "classic television game show panel show", year: 1955, media: { type: "video", url: "https://archive.org/download/whats-my-line-2-october-1955/What%27s%20My%20Line%20-%202%20October%201955.mp4" } },
    { identifier: "BeatTheClock13October1951", title: "Beat the Clock — October 13, 1951", subject: "classic television game show stunt game", year: 1951, media: { type: "video", url: "https://archive.org/download/BeatTheClock13October1951/beattheclock13October1951.mp4" } },
    { identifier: "totellthetruth21january1958", title: "To Tell the Truth — January 21, 1958", subject: "classic television game show panel show", year: 1958, media: { type: "video", url: "https://archive.org/download/totellthetruth21january1958/totellthetruth21january1958.mp4" } },
    { identifier: "whatsmyline26August1956", title: "What's My Line? — August 26, 1956", subject: "classic television game show panel show", year: 1956, media: { type: "video", url: "https://archive.org/download/whatsmyline26August1956/whatsmyline26August1956.mp4" } },
    { identifier: "totellthetruth14May1957", title: "To Tell the Truth — May 14, 1957", subject: "classic television game show panel show", year: 1957, media: { type: "video", url: "https://archive.org/download/totellthetruth14May1957/totellthetruth14May1957.mp4" } },
    { identifier: "Price_Is-Right_1957", title: "The Price Is Right — 1957 episode", subject: "classic television game show pricing game", year: 1957, media: { type: "video", url: "https://archive.org/download/Price_Is-Right_1957/PriceIsRight1957.mp4" } },
    { identifier: "Beat_The_Clock", title: "Beat the Clock — 1950s game show", subject: "classic television game show stunt game", year: 1955, media: { type: "video", url: "https://archive.org/download/Beat_The_Clock/Beat_The_Clock.ia.mp4" } },
    { identifier: "whatsMyLine", title: "What's My Line? — classic game show episode", subject: "classic television game show panel show", year: 1955, media: { type: "video", url: "https://archive.org/download/whatsMyLine/Whats_my_line_Oct_5_1952.ia.mp4" } },
    { identifier: "The64000Question-dateToBeAdded", title: "The $64,000 Question — September 18, 1956", subject: "classic television game show quiz show", year: 1956, media: { type: "video", url: "https://archive.org/download/The64000Question-dateToBeAdded/The64000Question1956.mp4" } },
    { identifier: "strikeItRich-26August1955", title: "Strike It Rich — August 26, 1955", subject: "classic television game show quiz show", year: 1955, media: { type: "video", url: "https://archive.org/download/strikeItRich-26August1955/StrikeItRich26August1955.mp4" } },
    { identifier: "TruthConsequences1955", title: "Truth or Consequences — circa 1956", subject: "classic television game show panel show", year: 1956, media: { type: "video", url: "https://archive.org/download/TruthConsequences1955/truthorconsequences1955.mp4" } },
    { identifier: "Treasure_Hunt", title: "Treasure Hunt — 1950s game show", subject: "classic television game show quiz show", year: 1955, media: { type: "video", url: "https://archive.org/download/Treasure_Hunt/Treasure_Hunt.ia.mp4" } },
    { identifier: "WhatsMyLine18October1953", title: "What's My Line? — October 18, 1953", subject: "classic television game show panel show", year: 1953, media: { type: "video", url: "https://archive.org/download/WhatsMyLine18October1953/whatsmyline13october1953.mp4" } },
    { identifier: "WhatsMyLine19July1953", title: "What's My Line? — July 19, 1953", subject: "classic television game show panel show", year: 1953, media: { type: "video", url: "https://archive.org/download/WhatsMyLine19July1953/whatsmyline19July1953.mp4" } },
    { identifier: "beattheclock1956", title: "Beat the Clock — circa August 1956", subject: "classic television game show stunt game", year: 1956, media: { type: "video", url: "https://archive.org/download/beattheclock1956/beattheclock1956flash.mp4" } },
    { identifier: "thePriceIsRight-19july1957", title: "The Price Is Right — July 19, 1957", subject: "classic television game show pricing game", year: 1957, media: { type: "video", url: "https://archive.org/download/thePriceIsRight-19july1957/ThePriceIsRight1957-Misc2.mp4" } },
  ],
  "14": [
    { identifier: "AtariKeepingInTouch", title: "Atari Keeping In Touch", subject: "computer chronicles personal computer technology television", year: 1983, media: { type: "video", url: "https://archive.org/download/AtariKeepingInTouch/Atari%20Keeping%20In%20Touch.mp4" } },
    { identifier: "engineering6_microcomputer_interface", title: "The Technology of Microcomputer Interfaces", subject: "computer chronicles microcomputer technology computing television", year: 2004, media: { type: "video", url: "https://archive.org/download/engineering6_microcomputer_interface/2.ogv" } },
    { identifier: "john-brandstetter-aka-johnny-turbo", title: "Johnny Turbo on Computer Chronicles", subject: "computer chronicles video games personal computer technology television", year: 1993, media: { type: "video", url: "https://archive.org/download/john-brandstetter-aka-johnny-turbo/John%20Brandstetter%20AKA%20Johnny%20Turbo%20%282%29.mp4" } },
    { identifier: "CC1337", title: "Computer Chronicles — Computer Bowl VIII", subject: "computer chronicles personal computer technology television", year: 1996, media: { type: "video", url: "https://archive.org/download/CC1337/CC1337.mp4" } },
    { identifier: "CC1339", title: "Computer Chronicles — E3 Special", subject: "computer chronicles video games computing technology television", year: 1996, media: { type: "video", url: "https://archive.org/download/CC1339/CC1339.mp4" } },
  ],
  "15": [
    { identifier: "wmcmwi-Afternoon_Delight_4-1-14", title: "Afternoon Delight", subject: "public access television community television local programming variety", year: 2014, media: { type: "video", url: "https://archive.org/download/wmcmwi-Afternoon_Delight_4-1-14/Afternoon_Delight_4-1-14.mp4" } },
    { identifier: "bptvpa-PGH_Sportsline_8", title: "PGH Sportsline #8", subject: "public access television community television local sports programming", year: 2011, media: { type: "video", url: "https://archive.org/download/bptvpa-PGH_Sportsline_8/PGH_Sportsline_8.mp4" } },
    { identifier: "wmcmwi-Profile_11_02_10_PART_2", title: "Profile", subject: "public access television community television local interview programming", year: 2010, media: { type: "video", url: "https://archive.org/download/wmcmwi-Profile_11_02_10_PART_2/Profile_11_02_10_PART_2.mp4" } },
    { identifier: "This_Week_at_AIM_6_5_10", title: "This Week at AIM", subject: "public access television community television local news magazine programming", year: 2010, media: { type: "video", url: "https://archive.org/download/This_Week_at_AIM_6_5_10/This_Week_at_AIM_6_5_10.mp4" } },
    { identifier: "Homeworks1Pilot", title: "Homeworks — Pilot", subject: "public access television community television local home and lifestyle programming", year: 1987, media: { type: "video", url: "https://archive.org/download/Homeworks1Pilot/Homeworks%201%20%28Pilot%29.mp4" } },
  ],
  "56": [
    { identifier: "JackDempseyVersusTommyGibbons", title: "Jack Dempsey vs Tommy Gibbons", subject: "boxing fight sports archive", year: 1923, media: { type: "video", url: "https://archive.org/download/JackDempseyVersusTommyGibbons/JackDempseyVersusTommyGibbons_512kb.mp4" } },
    { identifier: "FloydPattersonVersusJerryQuarry", title: "Floyd Patterson vs Jerry Quarry", subject: "boxing fight sports archive", year: 1967, media: { type: "video", url: "https://archive.org/download/FloydPattersonVersusJerryQuarry/FloydPattersonVersusJerryQuarry_512kb.mp4" } },
    { identifier: "FloydPattersonVsWillieTroy", title: "Floyd Patterson vs Willie Troy", subject: "boxing fight sports archive", year: 1964, media: { type: "video", url: "https://archive.org/download/FloydPattersonVsWillieTroy/FloydPattersonVsWillieTroy_512kb.mp4" } },
    { identifier: "SonnyListonVsCassiusClay", title: "Sonny Liston vs Cassius Clay", subject: "boxing fight sports archive", year: 1964, media: { type: "video", url: "https://archive.org/download/SonnyListonVsCassiusClay/SonnyListonVsCassiusClay_512kb.mp4" } },
    { identifier: "JamesBraddockInTraining", title: "James Braddock in Training", subject: "boxing training fight sports archive", year: 1936, media: { type: "video", url: "https://archive.org/download/JamesBraddockInTraining/JamesBraddockInTraining_512kb.mp4" } },
  ],
  "63": [
    { identifier: "etvmn-Eagan_High_School_Girls_Soccer_vs._Rosemount_9-14-2017", title: "Eagan Girls Soccer vs Rosemount", subject: "soccer football match sports archive", year: 2017, media: { type: "video", url: "https://archive.org/download/etvmn-Eagan_High_School_Girls_Soccer_vs._Rosemount_9-14-2017/Eagan_High_School_Girls_Soccer_vs._Rosemount_9-14-2017.mp4" } },
    { identifier: "etvmn-Eagan_High_School_Boys_Soccer_vs_Woodbury", title: "Eagan Boys Soccer vs Woodbury", subject: "soccer football match sports archive", year: 2017, media: { type: "video", url: "https://archive.org/download/etvmn-Eagan_High_School_Boys_Soccer_vs_Woodbury/Eagan_High_School_Boys_Soccer_vs_Woodbury.mp4" } },
    { identifier: "HU_Boys_Soccer_10-11-19", title: "HU Boys Soccer", subject: "soccer football match sports archive", year: 2019, media: { type: "video", url: "https://archive.org/download/HU_Boys_Soccer_10-11-19/HU_Boys_Soccer_10-11-19.mp4" } },
    { identifier: "HU_Boys_Soccer_10-19-19", title: "HU Boys Soccer — October 19", subject: "soccer football match sports archive", year: 2019, media: { type: "video", url: "https://archive.org/download/HU_Boys_Soccer_10-19-19/HU_Boys_Soccer_10-19-19.mp4" } },
    { identifier: "2019-10-30-liverpool-vs-arsenal", title: "Liverpool vs Arsenal", subject: "soccer football match sports archive", year: 2019, media: { type: "video", url: "https://archive.org/download/2019-10-30-liverpool-vs-arsenal/game.ia.mp4" } },
  ],
  "68": [
    { identifier: "unccnc-The_Courtside_Clinician_-_Head_Men_s_Basketball_Athletic_Trainer_Adam_Jordan", title: "The Courtside Clinician", subject: "sports coaching athletic training basketball clinic", year: 2020, media: { type: "video", url: "https://archive.org/download/unccnc-The_Courtside_Clinician_-_Head_Men_s_Basketball_Athletic_Trainer_Adam_Jordan/The_Courtside_Clinician_-_Head_Men_s_Basketball_Athletic_Trainer_Adam_Jordan.mp4" } },
    { identifier: "unccnc-Kinesiology_101", title: "Kinesiology 101", subject: "sports coaching athletic training kinesiology clinic", year: 2020, media: { type: "video", url: "https://archive.org/download/unccnc-Kinesiology_101/Kinesiology_101.mp4" } },
    { identifier: "cowomn-Woodbury_s_Rec_Zone_May_2016", title: "Woodbury's Rec Zone", subject: "sports coaching athletic training recreation clinic", year: 2016, media: { type: "video", url: "https://archive.org/download/cowomn-Woodbury_s_Rec_Zone_May_2016/Woodbury_s_Rec_Zone_May_2016.mp4" } },
    { identifier: "kstuks-K-State_School_of_Health_Sciences", title: "K-State School of Health Sciences", subject: "sports coaching athletic training kinesiology clinic", year: 2018, media: { type: "video", url: "https://archive.org/download/kstuks-K-State_School_of_Health_Sciences/K-State_School_of_Health_Sciences.mp4" } },
    { identifier: "kstuks-Training_the_next_generation_of_health_leaders_KState", title: "Training the Next Generation of Health Leaders", subject: "sports coaching athletic training kinesiology clinic", year: 2018, media: { type: "video", url: "https://archive.org/download/kstuks-Training_the_next_generation_of_health_leaders_KState/Training_the_next_generation_of_health_leaders_KState.mp4" } },
  ],
  "72": [
    { identifier: "tweakers004852", title: "Grand Slam Tennis 2", subject: "tennis racquet sports match archive", year: 2012, media: { type: "video", url: "https://archive.org/download/tweakers004852/tweakers004852.mp4" } },
    { identifier: "ccmcmd-CMSportsNet_Post-Match_Interview_-_Century_s_Bella_Filippi", title: "CMSportsNet Tennis Post-Match Interview", subject: "tennis racquet sports match interview", year: 2024, media: { type: "video", url: "https://archive.org/download/ccmcmd-CMSportsNet_Post-Match_Interview_-_Century_s_Bella_Filippi/CMSportsNet_Post-Match_Interview_-_Century_s_Bella_Filippi.mp4" } },
    { identifier: "USTA_Pro_Circuit_Men_s_Tournament_Opening_Day_-_Palm_Coast_FL", title: "USTA Pro Circuit — Opening Day", subject: "tennis racquet sports tournament", year: 2017, media: { type: "video", url: "https://archive.org/download/USTA_Pro_Circuit_Men_s_Tournament_Opening_Day_-_Palm_Coast_FL/USTA_Pro_Circuit_Men_s_Tournament_Opening_Day_-_Palm_Coast_FL.mp4" } },
    { identifier: "wimbledon-wilandermcenroe-19890705", title: "Wimbledon — Wilander vs McEnroe", subject: "tennis racquet sports tournament match", year: 1989, media: { type: "video", url: "https://archive.org/download/wimbledon-wilandermcenroe-19890705/14%20-%20Wimbledon%20-%20McEnroe%20v%20Wilander%20%281st%20segment%29.mp4" } },
    { identifier: "andre-agassi-tennis-sega-mega-drive-pal-gameplay-full-game-longplay-single-match", title: "Andre Agassi Tennis — Full Match", subject: "tennis racquet sports video game match", year: 1993, media: { type: "video", url: "https://archive.org/download/andre-agassi-tennis-sega-mega-drive-pal-gameplay-full-game-longplay-single-match/Andre%20Agassi%20Tennis%20Sega%20Mega%20Drive%20PAL%20Gameplay%20%28Full%20Demostration%29.mp4" } },
  ],
  "73": [
    { identifier: "Inside_Sports_-_Mayland_Horse_Racing_Pt.1", title: "Inside Sports — Maryland Horse Racing", subject: "horse racing equestrian thoroughbred sports", year: 1980, media: { type: "video", url: "https://archive.org/download/Inside_Sports_-_Mayland_Horse_Racing_Pt.1/Inside_Sports_-_Mayland_Horse_Racing_Pt.1.mp4" } },
    { identifier: "1977jamaica", title: "1977 Jamaica Handicap", subject: "horse racing equestrian thoroughbred sports", year: 1977, media: { type: "video", url: "https://archive.org/download/1977jamaica/1977%20JAMAICA_1.mp4" } },
    { identifier: "youtube-TbNCqPMbA0o", title: "Winx — Turnbull Stakes", subject: "horse racing equestrian thoroughbred sports", year: 2018, media: { type: "video", url: "https://archive.org/download/youtube-TbNCqPMbA0o/TbNCqPMbA0o.mp4" } },
    { identifier: "New_Simulcast_Agreement_at_Running_Aces", title: "Running Aces Simulcast", subject: "horse racing equestrian thoroughbred sports", year: 2015, media: { type: "video", url: "https://archive.org/download/New_Simulcast_Agreement_at_Running_Aces/New_Simulcast_Agreement_at_Running_Aces.mp4" } },
    { identifier: "action-news-sports-4-4-1992", title: "Action News Sports — Horse Racing", subject: "horse racing equestrian thoroughbred sports broadcast", year: 1992, media: { type: "video", url: "https://archive.org/download/action-news-sports-4-4-1992/Action%20News%20Sports%20-%204-4-1992.mp4" } },
  ],
  "77": [
    { identifier: "f1-1983-highlights-reviews-grand-prix", title: "Formula One — 1983 Austrian Grand Prix", subject: "formula one grand prix motorsport racing", year: 1983, media: { type: "video", url: "https://archive.org/download/f1-1983-highlights-reviews-grand-prix/S1983E01%20-%201983%20Austrian%20Grand%20Prix%20-%20Highlights.ia.mp4" } },
    { identifier: "f1-1985-highlights-and-reviews", title: "Formula One — 1985 Portuguese Grand Prix", subject: "formula one grand prix motorsport racing", year: 1985, media: { type: "video", url: "https://archive.org/download/f1-1985-highlights-and-reviews/S1985E01%20-%201985%20Portuguese%20Grand%20Prix%20-%20Highlights.ia.mp4" } },
    { identifier: "f1-2000-full-race-replys-grand-prix-highlights-and-reviews", title: "Formula One — 2000 British Grand Prix", subject: "formula one grand prix motorsport racing", year: 2000, media: { type: "video", url: "https://archive.org/download/f1-2000-full-race-replys-grand-prix-highlights-and-reviews/S2000E10%20-%202000%20In%20Review%20British%20Grand%20Prix.ia.mp4" } },
    { identifier: "f1-2001-full-race-replys-grand-prix-highlights-and-reviews", title: "Formula One — 2001 San Marino Grand Prix", subject: "formula one grand prix motorsport racing", year: 2001, media: { type: "video", url: "https://archive.org/download/f1-2001-full-race-replys-grand-prix-highlights-and-reviews/S1E04%20-%20F1%20San%20Marino%20GP%202001.ia.mp4" } },
    { identifier: "formula-italian-grand-prix-2023", title: "Formula One — 2023 Italian Grand Prix", subject: "formula one grand prix motorsport racing", year: 2023, media: { type: "video", url: "https://archive.org/download/formula-italian-grand-prix-2023/Formula%20Italian%20Grand%20Prix%202023.mp4" } },
    { identifier: "f1-1985-highlights-and-reviews::E02", title: "Formula One — 1985 San Marino Grand Prix", subject: "formula one grand prix motorsport racing", year: 1985, media: { type: "video", url: "https://archive.org/download/f1-1985-highlights-and-reviews/S1985E02%20-%201985%20San%20Marino%20Grand%20Prix%20-%20Highlights.ia.mp4" } },
    { identifier: "f1-1985-highlights-and-reviews::E03", title: "Formula One — 1985 Monaco Grand Prix", subject: "formula one grand prix motorsport racing", year: 1985, media: { type: "video", url: "https://archive.org/download/f1-1985-highlights-and-reviews/S1985E03%20-%201985%20Monaco%20Grand%20Prix%20-%20Highlights.ia.mp4" } },
    { identifier: "f1-1985-highlights-and-reviews::E04", title: "Formula One — 1985 French Grand Prix", subject: "formula one grand prix motorsport racing", year: 1985, media: { type: "video", url: "https://archive.org/download/f1-1985-highlights-and-reviews/S1985E04%20-%201985%20French%20Grand%20Prix%20-%20Highlights.ia.mp4" } },
    { identifier: "f1-1990-full-race-reply-grand-prix-highlights-and-reviews::E03", title: "Formula One — 1990 United States Grand Prix", subject: "formula one grand prix motorsport racing", year: 1990, media: { type: "video", url: "https://archive.org/download/f1-1990-full-race-reply-grand-prix-highlights-and-reviews/S1990E03%20-%201990%20US%20Grand%20Prix%20-%20Highlights.mp4" } },
    { identifier: "f1-1990-full-race-reply-grand-prix-highlights-and-reviews::E04", title: "Formula One — 1990 San Marino Grand Prix", subject: "formula one grand prix motorsport racing", year: 1990, media: { type: "video", url: "https://archive.org/download/f1-1990-full-race-reply-grand-prix-highlights-and-reviews/S1990E04%20-%201990%20San%20Marino%20Grand%20Prix%20-%20Highlights.mp4" } },
    { identifier: "f1-1998-full-race-replys-grand-prix-highlights-and-reviews::E01", title: "Formula One — 1998 Belgian Grand Prix", subject: "formula one grand prix motorsport racing", year: 1998, media: { type: "video", url: "https://archive.org/download/f1-1998-full-race-replys-grand-prix-highlights-and-reviews/S1998E01%20-%201998%20Belgium%20Grand%20Prix%20-%20Extended%20Highlights.mp4" } },
    { identifier: "f1-1998-full-race-replys-grand-prix-highlights-and-reviews::E04", title: "Formula One — 1998 Australian Grand Prix", subject: "formula one grand prix motorsport racing", year: 1998, media: { type: "video", url: "https://archive.org/download/f1-1998-full-race-replys-grand-prix-highlights-and-reviews/S1998E04%20-%201998%20Australian%20Grand%20Prix.mp4" } },
    { identifier: "f1-2001-full-race-replys-grand-prix-highlights-and-reviews::E05", title: "Formula One — 2001 Spanish Grand Prix", subject: "formula one grand prix motorsport racing", year: 2001, media: { type: "video", url: "https://archive.org/download/f1-2001-full-race-replys-grand-prix-highlights-and-reviews/S1E05%20-%20F1%20Spanish%20GP%202001.mp4" } },
    { identifier: "f1-2001-full-race-replys-grand-prix-highlights-and-reviews::E08", title: "Formula One — 2001 Canadian Grand Prix", subject: "formula one grand prix motorsport racing", year: 2001, media: { type: "video", url: "https://archive.org/download/f1-2001-full-race-replys-grand-prix-highlights-and-reviews/S1E08%20-%20F1%20Canadian%20GP%202001.mp4" } },
    { identifier: "f1-2001-full-race-replys-grand-prix-highlights-and-reviews::E09", title: "Formula One — 2001 European Grand Prix", subject: "formula one grand prix motorsport racing", year: 2001, media: { type: "video", url: "https://archive.org/download/f1-2001-full-race-replys-grand-prix-highlights-and-reviews/S1E09%20-%20F1%20European%20GP%202001.mp4" } },
  ],
  "83": [
    { identifier: "whhisc-843TV_Sporting_Clays_at_Spring_Island_1-19-2018", title: "Sporting Clays at Spring Island", subject: "archery shooting range field sports outdoors", year: 2018, media: { type: "video", url: "https://archive.org/download/whhisc-843TV_Sporting_Clays_at_Spring_Island_1-19-2018/843TV_Sporting_Clays_at_Spring_Island_1-19-2018.mp4" } },
    { identifier: "colwfl-Archery_Tag_-_Lake_Worth_Beach", title: "Archery Tag — Lake Worth Beach", subject: "archery shooting range field sports outdoors", year: 2015, media: { type: "video", url: "https://archive.org/download/colwfl-Archery_Tag_-_Lake_Worth_Beach/Archery_Tag_-_Lake_Worth_Beach.mp4" } },
    { identifier: "prkcitut-Youth_World_Archery_Championships", title: "Youth World Archery Championships", subject: "archery shooting range field sports outdoors", year: 2019, media: { type: "video", url: "https://archive.org/download/prkcitut-Youth_World_Archery_Championships/Youth_World_Archery_Championships.mp4" } },
    { identifier: "Experience_the_Mountain_-_Archery", title: "Experience the Mountain — Archery", subject: "archery shooting range field sports outdoors", year: 2016, media: { type: "video", url: "https://archive.org/download/Experience_the_Mountain_-_Archery/Experience_the_Mountain_-_Archery.mp4" } },
    { identifier: "Irving_PAL_Archery", title: "Irving PAL Archery", subject: "archery shooting range field sports outdoors", year: 2014, media: { type: "video", url: "https://archive.org/download/Irving_PAL_Archery/Irving_PAL_Archery.mp4" } },
  ],
  "102": [
    { identifier: "RageatDawn", title: "Rage at Dawn", subject: "classic western cowboy frontier movie", year: 1955, media: { type: "video", url: "https://archive.org/download/RageatDawn/RageatDawn.mp4" } },
    { identifier: "TheDesertTrail", title: "The Desert Trail", subject: "classic western cowboy frontier movie", year: 1935, media: { type: "video", url: "https://archive.org/download/TheDesertTrail/TheDesertTrail.mp4" } },
    { identifier: "TheDawnRider", title: "The Dawn Rider", subject: "classic western cowboy frontier movie", year: 1935, media: { type: "video", url: "https://archive.org/download/TheDawnRider/TheDawnRider.mp4" } },
    { identifier: "WarOfTheWildcats-JohnWayne1943", title: "War of the Wildcats", subject: "classic western cowboy frontier movie", year: 1943, media: { type: "video", url: "https://archive.org/download/WarOfTheWildcats-JohnWayne1943/JohnWayne-WarOfTheWildcats1943.mp4" } },
    { identifier: "FrontierHorizon", title: "Frontier Horizon", subject: "classic western cowboy frontier movie", year: 1939, media: { type: "video", url: "https://archive.org/download/FrontierHorizon/FrontierHorizon.mp4" } },
    { identifier: "texas_terror_1935", title: "Texas Terror", subject: "classic western cowboy frontier movie", year: 1935, media: { type: "video", url: "https://archive.org/download/texas_terror_1935/texas_terror_1935.mp4" } },
    { identifier: "RimOfTheCanyon", title: "Rim of the Canyon", subject: "classic western cowboy frontier movie", year: 1949, media: { type: "video", url: "https://archive.org/download/RimOfTheCanyon/RimOfTheCanyon.mp4" } },
    { identifier: "hang-em-high-movie-1968-full-movie", title: "Hang 'Em High", subject: "classic western cowboy frontier movie", year: 1968, media: { type: "video", url: "https://archive.org/download/hang-em-high-movie-1968-full-movie/Hang%20%27Em%20High%20Movie%201968%20-%20full%20movie.mp4" } },
    { identifier: "abilene-town-1946-bd-mkv", title: "Abilene Town", subject: "classic western cowboy frontier movie", year: 1946, media: { type: "video", url: "https://archive.org/download/abilene-town-1946-bd-mkv/Abilene%20Town%20%281946%29%20%7Btmdb-22349%7D%20-%20%5BRemux-1080p%5D%5BEAC3%202.0%5D%5Bh264%5D.mp4" } },
    { identifier: "the-stranger-wore-a-gun", title: "The Stranger Wore a Gun", subject: "classic western cowboy frontier movie", year: 1953, media: { type: "video", url: "https://archive.org/download/the-stranger-wore-a-gun/The%20Stranger%20Wore%20a%20Gun.mp4" } },
    { identifier: "ManfromMusicMountain", title: "Man from Music Mountain", subject: "classic western cowboy frontier movie", year: 1938, media: { type: "video", url: "https://archive.org/download/ManfromMusicMountain/ManfromMusicMountain.mp4" } },
    { identifier: "ParadiseCanyon", title: "Paradise Canyon", subject: "classic western cowboy frontier movie", year: 1935, media: { type: "video", url: "https://archive.org/download/ParadiseCanyon/ParadiseCanyon.mp4" } },
    { identifier: "RainbowValley", title: "Rainbow Valley", subject: "classic western cowboy frontier movie", year: 1935 },
    { identifier: "Hell_Town", title: "Hell Town", subject: "classic western cowboy frontier movie", year: 1937 },
  ],
  "104": [
    { identifier: "2006-04-jackson-a-musical-thriller", title: "Jackson — A Musical Thriller", subject: "music film concert performance live music", year: 2006, media: { type: "video", url: "https://archive.org/download/2006-04-jackson-a-musical-thriller/2006-04%20Jackson%20-%20A%20Musical%20Thriller.mp4" } },
    { identifier: "The_Whigs_So_Lonely_Live_at_KDHX_4_22_10_HD", title: "The Whigs — So Lonely Live", subject: "music film concert performance live music", year: 2010, media: { type: "video", url: "https://archive.org/download/The_Whigs_So_Lonely_Live_at_KDHX_4_22_10_HD/The_Whigs_So_Lonely_Live_at_KDHX_4_22_10_HD.mp4" } },
    { identifier: "White_Mountain_Symphony_Orchestra", title: "White Mountain Symphony Orchestra", subject: "music film concert performance orchestra live music", year: 2015, media: { type: "video", url: "https://archive.org/download/White_Mountain_Symphony_Orchestra/White_Mountain_Symphony_Orchestra.mp4" } },
    { identifier: "North_Reading_Youth_Services_Presents_-_Battle_of_the_Bands_2014", title: "Battle of the Bands", subject: "music film concert performance live music", year: 2014, media: { type: "video", url: "https://archive.org/download/North_Reading_Youth_Services_Presents_-_Battle_of_the_Bands_2014/North_Reading_Youth_Services_Presents_-_Battle_of_the_Bands_2014.mp4" } },
    { identifier: "ectpa-Electric_City_Steel_Drum_Project_July_25_2020", title: "Electric City Steel Drum Project", subject: "music film concert performance live music", year: 2020, media: { type: "video", url: "https://archive.org/download/ectpa-Electric_City_Steel_Drum_Project_July_25_2020/Electric_City_Steel_Drum_Project_July_25_2020.mp4" } },
  ],
  "109": [
    { identifier: "flash_gordon11", title: "Flash Gordon — Chapter 11", subject: "action serial cliffhanger adventure movie", year: 1940, media: { type: "video", url: "https://archive.org/download/flash_gordon11/chapter11_512kb.mp4" } },
    { identifier: "flaming-frontiers", title: "Flaming Frontiers — Chapter 1", subject: "action serial cliffhanger western adventure movie", year: 1938, media: { type: "video", url: "https://archive.org/download/flaming-frontiers/01%20The%20River%20Runs%20Red.mp4" } },
    { identifier: "drums-of-fu-manchu", title: "Drums of Fu Manchu — Chapter 1", subject: "action serial cliffhanger adventure movie", year: 1940, media: { type: "video", url: "https://archive.org/download/drums-of-fu-manchu/01%20Fu%20Manchu%20Strikes.mp4" } },
    { identifier: "zorro_rides_again_ep5", title: "Zorro Rides Again — Chapter 5", subject: "action serial cliffhanger western adventure movie", year: 1937, media: { type: "video", url: "https://archive.org/download/zorro_rides_again_ep5/ep5.mp4" } },
    { identifier: "winners-of-the-west-1940", title: "Winners of the West — Chapter 1", subject: "action serial cliffhanger western adventure movie", year: 1940, media: { type: "video", url: "https://archive.org/download/winners-of-the-west-1940/01%20Redskins%20Ride%20Again.mp4" } },
  ],
  "122": [
    { identifier: "the-young-ones-oil-boring-flood...", title: "The Young Ones — Oil, Boring, Flood", subject: "british television british sitcom british comedy", year: 1988, media: { type: "video", url: "https://archive.org/download/the-young-ones-oil-boring-flood.../The%20Young%20Ones%20-%20Oil%2C%20Boring%2C%20Flood....mp4" } },
    { identifier: "vid-20231215-105800", title: "Red Dwarf — Back in the Red", subject: "british television british sitcom science fiction comedy", year: 1999, media: { type: "video", url: "https://archive.org/download/vid-20231215-105800/VID_20231215_105800.mp4" } },
    { identifier: "RedDwarfUSPilot1992", title: "Red Dwarf — US Pilot", subject: "british television british sitcom science fiction comedy", year: 1992, media: { type: "video", url: "https://archive.org/download/RedDwarfUSPilot1992/Red%20Dwarf%20US%20Pilot%20%281992%29.mp4" } },
    { identifier: "red_dwarf_tv_series_pilot", title: "Red Dwarf — Series Pilot", subject: "british television british sitcom science fiction comedy", year: 1988, media: { type: "video", url: "https://archive.org/download/red_dwarf_tv_series_pilot/Red_Dwarf-s01e01.mp4" } },
    { identifier: "monty-pythons-flying-circus-ntsc-dvd-set", title: "Monty Python's Flying Circus — Episode 1", subject: "british television british sketch comedy television", year: 1969, media: { type: "video", url: "https://archive.org/download/monty-pythons-flying-circus-ntsc-dvd-set/Monty%20Python%27s%20Flying%20Circus%20%281969-1974%29%20%5BRAW%5D/Series%201%20%281969-1970%29/01.%20Whither%20Canada_.mp4" } },
    { identifier: "mr-bean-unseen-bean-1995", title: "Mr Bean · Unseen Bean", subject: "british television british sitcom british comedy", year: 1995, media: { type: "video", url: "https://archive.org/download/mr-bean-unseen-bean-1995/Mr%20Bean%20-%20Unseen%20Bean%20%281995%29.mp4" } },
    { identifier: "LDFT7579", title: "Fawlty Towers · Complete Collection", subject: "british television british sitcom british comedy", year: 1975, media: { type: "video", url: "https://archive.org/download/LDFT7579/Fawlty%20Towers.ia.mp4" } },
    { identifier: "montypythonflyingcircus::S1E2", title: "Monty Python's Flying Circus · Sex and Violence", subject: "british television british sketch comedy television", year: 1969, media: { type: "video", url: "https://archive.org/download/montypythonflyingcircus/Monty%20Python%27s%20Flying%20Circus%20%5BRAW%5D/Series%201%20%281969-1970%29/002.%20Sex%20and%20Violence.mp4" } },
    { identifier: "the-young-ones-s-01-ep-04-bomb", title: "The Young Ones · Bomb", subject: "british television british sitcom british comedy", year: 1982, media: { type: "video", url: "https://archive.org/download/the-young-ones-s-01-ep-04-bomb/The%20Young%20Ones%20-%20S01EP04%20Bomb.ia.mp4" } },
    { identifier: "monty-pythons-flying-circus-ntsc-dvd-set::S1E2", title: "Monty Python's Flying Circus · Sex and Violence", subject: "british television british sketch comedy television", year: 1969, media: { type: "video", url: "https://archive.org/download/monty-pythons-flying-circus-ntsc-dvd-set/Monty%20Python%27s%20Flying%20Circus%20%281969-1974%29%20%5BRAW%5D/Series%201%20%281969-1970%29/02.%20Sex%20And%20Violence.mp4" } },
    { identifier: "youtube-7ovD21KbSDM", title: "Stephen Fry · Carpool", subject: "british television british comedy interview comedy", year: 2010, media: { type: "video", url: "https://archive.org/download/youtube-7ovD21KbSDM/7ovD21KbSDM.mp4" } },
    { identifier: "youtube-0HALqLi5_RU", title: "Ashens & Nerdcubed · Advent Calendars", subject: "british television british comedy comedy variety", year: 2023, media: { type: "video", url: "https://archive.org/download/youtube-0HALqLi5_RU/Advent%20Calendars%202023%20Day%2010%20%EF%BD%9C%20Ashens%20%26%20Nerdcubed%20-%200HALqLi5_RU.mp4" } },
    { identifier: "william-pattisons-bloodbath-theatre-episode-62-scaretober-h-g-wells-films", title: "William Pattison's Bloodbath Theatre · Episode 62", subject: "british television british comedy horror comedy television", year: 2021, media: { type: "video", url: "https://archive.org/download/william-pattisons-bloodbath-theatre-episode-62-scaretober-h-g-wells-films/William%20Pattison%27s%20Bloodbath%20Theatre%20Episode%2062_%20Scaretober_%20H%20G%20Wells%20Films.mp4" } },
  ],
  "200": [
    { identifier: "ABetterWayMerckAutomateLiquidPackaging", title: "A Better Way — Automated Liquid Packaging", subject: "manufacturing industry factory engineering industrial film", year: 1978, media: { type: "video", url: "https://dn600203.us.archive.org/0/items/ABetterWayMerckAutomateLiquidPackaging/A%20Better%20Way%20-%20Merck%20Automate%20Liquid%20Packaging.mp4" } },
    { identifier: "MasterHa1936_3", title: "Master Hands — Part III", subject: "manufacturing industry factory engineering industrial film", year: 1936, media: { type: "video", url: "https://dn801201.us.archive.org/0/items/MasterHa1936_3/MasterHa1936_3.mp4" } },
    { identifier: "shell-film-unit-springs-1938-colorized", title: "Shell Film Unit — Springs", subject: "manufacturing industry factory engineering industrial film", year: 1938, media: { type: "video", url: "https://ia801607.us.archive.org/0/items/shell-film-unit-springs-1938-colorized/Shell%20Film%20Unit%20-%20Springs%20%281938%29%20%28colorized%29.mp4" } },
    { identifier: "NJY-008_1628-3439", title: "Chrysler Advantages — Car Manufacturing", subject: "manufacturing industry factory engineering industrial film", year: 1991, media: { type: "video", url: "https://dn601203.us.archive.org/0/items/NJY-008_1628-3439/1628_Chrysler-Advantages-Car-Manufacturing-Promo-CBS-WCBS-2_1991-10-25.ia.mp4" } },
    { identifier: "fc-fc-2701", title: "Ford V-8 Exhibit — Industrial Design", subject: "manufacturing industry factory engineering automotive industrial film", year: 1932, media: { type: "video", url: "https://dn800301.us.archive.org/0/items/fc-fc-2701/fc-fc-2701.mp4" } },
  ],
  "202": [
    { identifier: "pryor_202009", title: "Richard Pryor — Stand-Up", subject: "stand-up comedy comedy special live comedy", year: 1980, media: { type: "video", url: "https://archive.org/download/pryor_202009/RICHARD_PRYOR/VIDEO_TS/VTS_01_1.mp4" } },
    { identifier: "lee-evans-collection", title: "Lee Evans — Live at Her Majesty's Theatre", subject: "stand-up comedy comedy special live comedy", year: 1994, media: { type: "video", url: "https://archive.org/download/lee-evans-collection/1.%20Live%20At%20Her%20Majesty%27s%20Theatre%20%281994%29.mp4" } },
    { identifier: "01-just-for-laughs", title: "Just for Laughs — Stand-Up", subject: "stand-up comedy comedy special live comedy", year: 2010, media: { type: "video", url: "https://archive.org/download/01-just-for-laughs/01%20JUST%20FOR%20LAUGHS.mp4" } },
    { identifier: "words-words-words-hd_2010", title: "Bo Burnham — Words Words Words", subject: "stand-up comedy comedy special live comedy", year: 2010, media: { type: "video", url: "https://archive.org/download/words-words-words-hd_2010/Words%20Words%20Words%20%28HD%29.mp4" } },
    { identifier: "richard-pryor-live", title: "Richard Pryor Live", subject: "stand-up comedy comedy special live comedy", year: 1979, media: { type: "video", url: "https://archive.org/download/richard-pryor-live/richard%20pryor%20live.mp4" } },
    { identifier: "lee-evans-collection::1995", title: "Lee Evans — Live from the West End", subject: "stand-up comedy comedy special live comedy", year: 1995, media: { type: "video", url: "https://archive.org/download/lee-evans-collection/2.%20Live%20From%20The%20West%20End%20%281995%29.mp4" } },
    { identifier: "lee-evans-collection::1996", title: "Lee Evans — Different Planet Tour", subject: "stand-up comedy comedy special live comedy", year: 1996, media: { type: "video", url: "https://archive.org/download/lee-evans-collection/3.%20Different%20Planet%20Tour%20%281996%29.mp4" } },
    { identifier: "lee-evans-collection::2002", title: "Lee Evans — Wired & Wonderful at Wembley", subject: "stand-up comedy comedy special live comedy", year: 2002, media: { type: "video", url: "https://archive.org/download/lee-evans-collection/5.%20Wired%20%26%20Wonderful%3A%20Live%20At%20Wembley%20%282002%29.mp4" } },
    { identifier: "funny_or_die_video_88acabdc4d", title: "Funny or Die — A Man Who Is Uncomfortable Eating Bananas", subject: "sketch comedy comedy television comedy", year: 2008, media: { type: "video", url: "https://archive.org/download/funny_or_die_video_88acabdc4d/funny_or_die_video_88acabdc4d.mp4" } },
    { identifier: "funny_or_die_video_06202e51b4", title: "Funny or Die — Jazz with a General Problem", subject: "sketch comedy comedy television comedy", year: 2008, media: { type: "video", url: "https://archive.org/download/funny_or_die_video_06202e51b4/funny_or_die_video_06202e51b4.mp4" } },
    { identifier: "funny_or_die_video_141df436e2", title: "Funny or Die — Gay Exam", subject: "sketch comedy comedy television comedy", year: 2008, media: { type: "video", url: "https://archive.org/download/funny_or_die_video_141df436e2/funny_or_die_video_141df436e2.mp4" } },
    { identifier: "TheNewRainbowHour180924", title: "The New Rainbow Hour", subject: "comedy variety sketch television", year: 2018, media: { type: "video", url: "https://archive.org/download/TheNewRainbowHour180924/The%20New%20Rainbow%20Hour%2018%2009%2024.mp4" } },
    { identifier: "indigen-episode-274", title: "Indigen — Episode 274", subject: "comedy variety television comedy", year: 2002, media: { type: "video", url: "https://archive.org/download/indigen-episode-274/indigen%20-%20episode%20274.mp4" } },
    { identifier: "funny_or_die_video_a02d5054c2", title: "Funny or Die — Office Christmas Party", subject: "sketch comedy comedy television comedy", year: 2007, media: { type: "video", url: "https://archive.org/download/funny_or_die_video_a02d5054c2/funny_or_die_video_a02d5054c2.mp4" } },
    { identifier: "SCTV_Holiday_Greetings_2013", title: "SCTV · Holiday Greetings", subject: "sketch comedy comedy television comedy", year: 2013, media: { type: "video", url: "https://archive.org/download/SCTV_Holiday_Greetings_2013/SCTV_Holiday_Greetings_2013.mp4" } },
    { identifier: "mastmwa-Late_Knight_Season_9_Episode_2", title: "Late Knight · Season 9, Episode 2", subject: "sketch comedy comedy television comedy", year: 2023, media: { type: "video", url: "https://archive.org/download/mastmwa-Late_Knight_Season_9_Episode_2/Late_Knight_Season_9_Episode_2.mp4" } },
    { identifier: "Kathy_Mills", title: "Kathy Mills · Comedy Performance", subject: "stand-up comedy comedy television live comedy", year: 2017, media: { type: "video", url: "https://archive.org/download/Kathy_Mills/Kathy_Mills.mp4" } },
    { identifier: "snl-nfts", title: "SNL · NFTs", subject: "sketch comedy comedy television comedy", year: 2021, media: { type: "video", url: "https://archive.org/download/snl-nfts/NFTs%20-%20SNL-mrNOYudaMAc.mp4" } },
    { identifier: "wayne-and-garth-snl-music-a-go-go", title: "Wayne and Garth · SNL Music a Go Go", subject: "sketch comedy comedy television comedy", year: 1993, media: { type: "video", url: "https://archive.org/download/wayne-and-garth-snl-music-a-go-go/Wayne%20and%20Garth%20SNL%20Music%20a%20Go%20Go.ia.mp4" } },
  ],
  "920": [
    { identifier: "TheColumbiansCollection1924-1929::A_Sunny_Lane_In_Spain_1927", title: "The Columbians — A Sunny Lane in Spain", subject: "78rpm early recording dance band jazz jukebox", year: 1927, media: { type: "audio", url: "https://archive.org/download/TheColumbiansCollection1924-1929DirectedByBenSelvin/A%20Sunny%20Lane%20In%20Spain%201927%20The%20Columbians.mp3" } },
    { identifier: "TheColumbiansCollection1924-1929::Along_The_Old_Lake_Trail_1924", title: "The Columbians — Along the Old Lake Trail", subject: "78rpm early recording dance band jazz jukebox", year: 1924, media: { type: "audio", url: "https://archive.org/download/TheColumbiansCollection1924-1929DirectedByBenSelvin/AlongTheOldLakeTrail-letsDoAndSayWeDidnt1924TheColumbians.mp3" } },
    { identifier: "TheColumbiansCollection1924-1929::Are_You_Lonesome_Tonight_1927", title: "The Columbians — Are You Lonesome Tonight", subject: "78rpm early recording dance band jazz jukebox", year: 1927, media: { type: "audio", url: "https://archive.org/download/TheColumbiansCollection1924-1929DirectedByBenSelvin/AreYouLonesomeTonight1927TheColumbians.mp3" } },
    { identifier: "AbeLymanCollection1925-1934::A_Jazz_Holiday_1928", title: "Abe Lyman — A Jazz Holiday", subject: "78rpm early recording dance band jazz jukebox", year: 1928, media: { type: "audio", url: "https://archive.org/download/AbeLymanCollection1925-1934/AJazzHoliday1928AbeLyman.mp3" } },
    { identifier: "AbeLymanCollection1925-1934::A_Thousand_Dreams_1927", title: "Abe Lyman — A Thousand Dreams of You", subject: "78rpm early recording dance band jazz jukebox", year: 1927, media: { type: "audio", url: "https://archive.org/download/AbeLymanCollection1925-1934/AThousandDreamsOfYou1927AbeLymanOrch.mp3" } },
    { identifier: "PaulWhiteman1920-1935CompleteCollection::A_Bench_In_The_Park_1930", title: "Paul Whiteman — A Bench in the Park", subject: "78rpm early recording jazz dance band jukebox", year: 1930, media: { type: "audio", url: "https://archive.org/download/PaulWhiteman1920-1935CompleteCollection/ABenchInThePark1930.mp3" } },
    { identifier: "PaulWhiteman1920-1935CompleteCollection::A_Big_Bouquet_For_You", title: "Paul Whiteman — A Big Bouquet for You", subject: "78rpm early recording jazz dance band jukebox", year: 1930, media: { type: "audio", url: "https://archive.org/download/PaulWhiteman1920-1935CompleteCollection/ABigBouquetForYou.mp3" } },
    { identifier: "TedLewisCollection1919-1934::12th_Street_Rag", title: "Ted Lewis — 12th Street Rag", subject: "78rpm early recording jazz dance band ragtime jukebox", year: 1930, media: { type: "audio", url: "https://archive.org/download/TedLewisCollection1919-1934/12thStreetRag.mp3" } },
  ],
  "19": [
    { identifier: "The_Beverly_Hillbillies::GRANNYS_GARDEN", title: "The Beverly Hillbillies — Granny's Garden", subject: "classic television family sitcom domestic sitcom", year: 1962, media: { type: "video", url: "https://archive.org/download/The_Beverly_Hillbillies/GRANNYS_GARDEN.mp4" } },
    { identifier: "The_Beverly_Hillbillies::Getting_Settled", title: "The Beverly Hillbillies — Getting Settled", subject: "classic television family sitcom domestic sitcom", year: 1962, media: { type: "video", url: "https://archive.org/download/The_Beverly_Hillbillies/Getting_Settled.mp4" } },
    { identifier: "The_Beverly_Hillbillies::The_Clampets_Strike_Oil", title: "The Beverly Hillbillies — The Clampetts Strike Oil", subject: "classic television family sitcom domestic sitcom", year: 1962, media: { type: "video", url: "https://archive.org/download/The_Beverly_Hillbillies/The_Clampets_Strike_Oil.mp4" } },
    { identifier: "TLS_Lucy_Gets_A_Roommate::episode", title: "The Lucy Show — Lucy Gets a Roommate", subject: "classic television family sitcom domestic sitcom", year: 1963, media: { type: "video", url: "https://archive.org/download/TLS_Lucy_Gets_A_Roommate/TLS_Lucy_Gets_A_Roommate_512kb.mp4" } },
    { identifier: "Andy_Griffith_A_Wife_For_Andy::episode", title: "The Andy Griffith Show — A Wife for Andy", subject: "classic television family sitcom domestic sitcom", year: 1961, media: { type: "video", url: "https://archive.org/download/Andy_Griffith_A_Wife_For_Andy/WIFE_512kb.mp4" } },
    { identifier: "Andy-Griffith-Show_Andy-Discovers-America::episode", title: "The Andy Griffith Show — Andy Discovers America", subject: "classic television family sitcom domestic sitcom", year: 1961, media: { type: "video", url: "https://archive.org/download/Andy-Griffith-Show_Andy-Discovers-America/AndyGriffithShow_AndyDiscoversAmerica_512kb.mp4" } },
    { identifier: "Beverly_Hillbillies_Ep03_Meanwhile_Back_At_The_Cabin::episode", title: "The Beverly Hillbillies — Meanwhile Back at the Cabin", subject: "classic television family sitcom domestic sitcom", year: 1962, media: { type: "video", url: "https://archive.org/download/Beverly_Hillbillies_Ep03_Meanwhile_Back_At_The_Cabin/BH03_Meanwhile_Back_At_The_Cabin_512kb.mp4" } },
  ],
  "901": [
    { identifier: "PinkFloydLiveAtWembley", title: "Pink Floyd — Live at Wembley", subject: "rock music concert live music radio", year: 1974, media: { type: "audio", url: "https://archive.org/download/PinkFloydLiveAtWembley/1974-11-16%20Pink%20Floyd%20Live%20At%20Wembley.mp3" } },
    { identifier: "elvis-presley-the-jan.-27th-1971-midnight-show-in-stereo", title: "Elvis Presley — Midnight Show", subject: "rock and roll music concert live music radio", year: 1971, media: { type: "audio", url: "https://archive.org/download/elvis-presley-the-jan.-27th-1971-midnight-show-in-stereo/Elvis%20Presley-The%20Jan.27th%2C1971%20midnight%20show%20in%20stereo.mp3" } },
    { identifier: "the-beatles-its-all-too-much", title: "The Beatles — It's All Too Much", subject: "rock music classic rock radio", year: 1969, media: { type: "audio", url: "https://archive.org/download/the-beatles-its-all-too-much/Its_All_Too_Much.mp3" } },
    { identifier: "elvis-presley-elvis-golden-records-vol.-2-front-lp-cover", title: "Elvis Presley — Golden Records Vol. 2", subject: "rock and roll music classic rock radio", year: 1958, media: { type: "audio", url: "https://archive.org/download/elvis-presley-elvis-golden-records-vol.-2-front-lp-cover/Elvis%20Presley-Elvis%20Gold%20Records%20Vol.2%20in%20stere%28e%29.mp3" } },
    { identifier: "elvis-presley-gold-records-vol.-4-1968-warm-lp-sound", title: "Elvis Presley — Gold Records Vol. 4", subject: "rock and roll music classic rock radio", year: 1968, media: { type: "audio", url: "https://archive.org/download/elvis-presley-gold-records-vol.-4-1968-warm-lp-sound/Elvis%20Presley-Gold%20Records%20Vol.4%201968%20warm%20LP%20sound.mp3" } },
    { identifier: "come-together-the-music-of-the-beatles-orchestrated", title: "The Beatles — Come Together: Orchestrated", subject: "rock music classic rock live music radio", year: 2020 },
    { identifier: "experimental-instrumental_202305", title: "Experimental Instrumental — Rock Selection", subject: "rock music experimental rock instrumental music radio", year: 2023 },
    { identifier: "PF_1973-05-18", title: "Pink Floyd Live — Earls Court", subject: "rock music progressive rock live music radio", year: 1973 },
    { identifier: "Beach-Boys-1967-11-19", title: "The Beach Boys — Live at Constitution Hall", subject: "rock music surf rock live music radio", year: 1967 },
    { identifier: "TheElWaynoLocoShowAndThenThereWasMusic", title: "The El Wayno Loco Show — And Then There Was Music", subject: "rock music classic rock radio", year: 2013 },
    { identifier: "BBC_Radio_6_Music_20170819_030000_The_Elvis_Presley_Story", title: "The Elvis Presley Story", subject: "rock and roll music classic rock radio", year: 2017 },
    { identifier: "BBC_Radio_2_20170730_140000_Johnnie_Walkers_Sounds_of_the_70s", title: "Sounds of the 70s", subject: "rock music classic rock radio", year: 2017 },
    { identifier: "BBC_Radio_6_Music_20180206_200000", title: "BBC Radio 6 Music", subject: "rock music alternative music radio", year: 2018 },
    { identifier: "KDRT_95_7_FM_20190623_150000", title: "KDRT 95.7 FM — Music Hour", subject: "rock music alternative music radio", year: 2019 },
    { identifier: "KALW_91_7_FM_20170429_010000", title: "KALW 91.7 FM — Music Programming", subject: "rock music alternative music radio", year: 2017 },
  ],
  "911": [
    { identifier: "cusb_col_a5772_01_37476_03", title: "St. Louis Blues — W.C. Handy", subject: "ragtime jazz early recording piano music", year: 1915, media: { type: "audio", url: "https://archive.org/download/cusb_col_a5772_01_37476_03/cusb_col_a5772_01_37476_03d.mp3" } },
    { identifier: "Europes_Society_Orch-Castle_Rag", title: "James Reese Europe — Castle House Rag", subject: "ragtime jazz early recording dance band", year: 1914, media: { type: "audio", url: "https://archive.org/download/Europes_Society_Orch-Castle_Rag/Europes_Society_Orch-Castle_House_Rag-Victor-35372.mp3" } },
    { identifier: "Joseph_Moskowitz-Panama_Pacific_Drag", title: "Joseph Moskowitz — Panama Pacific Drag", subject: "ragtime jazz early recording piano music", year: 1916, media: { type: "audio", url: "https://archive.org/download/Joseph_Moskowitz-Panama_Pacific_Drag/Joseph_Moskowitiz-Panama-Pacific_Drag.mp3" } },
    { identifier: "78_come-on-down-to-ragtime-town_louis-winsch-hubbell_gbia0433883a", title: "Come On Down to Ragtime Town", subject: "ragtime jazz early recording piano music", year: 1917, media: { type: "audio", url: "https://archive.org/download/78_come-on-down-to-ragtime-town_louis-winsch-hubbell_gbia0433883a/Come%20On%20Down%20To%20Ragtime%20Town%20-%20LOUIS%20WINSCH.mp3" } },
    { identifier: "CharlesDornbergerHisOrchestraTigerRag", title: "Charles Dornberger — Tiger Rag", subject: "ragtime jazz early recording dance band", year: 1927, media: { type: "audio", url: "https://archive.org/download/CharlesDornbergerHisOrchestraTigerRag/Charles%20Dornberger%20%20His%20Orchestra%20%20%20Tiger%20Rag.mp3" } },
  ],
  "916": [
    { identifier: "inside-wers-live-wire-radio-documentary-emerson-college-spring-1991", title: "Inside WERS Live Wire", subject: "punk alternative rock live music radio", year: 1991, media: { type: "audio", url: "https://archive.org/download/inside-wers-live-wire-radio-documentary-emerson-college-spring-1991/_Inside%20WERS_%20Live%20Wire%20Radio%20Documentary%20Emerson%20College%20Spring%201991.mp3" } },
    { identifier: "DNALOUNGE-2007-10-06", title: "New Wave City — Joy Division Tribute", subject: "punk alternative rock live music radio", year: 2007, media: { type: "audio", url: "https://archive.org/download/DNALOUNGE-2007-10-06/2007-10-06.mp3" } },
    { identifier: "blackmarketclash.2019-12-28.AKGCK63.Flac16", title: "Black Market Clash — Live", subject: "punk alternative rock live music radio", year: 2019, media: { type: "audio", url: "https://archive.org/download/blackmarketclash.2019-12-28.AKGCK63.Flac16/BlackMarketClash2019-12-28-16Bit-t-01.mp3" } },
    { identifier: "EVIL016", title: "Blu E Wire", subject: "punk alternative rock electronic music radio", year: 2007, media: { type: "audio", url: "https://archive.org/download/EVIL016/The_Last_Knob_Corporation_-_Emu-2-Break.mp3" } },
    { identifier: "a-witchy-music-tribute-to-siouxsie", title: "A Witchy Music Tribute to Siouxsie", subject: "punk post-punk alternative rock music radio", year: 2022, media: { type: "audio", url: "https://archive.org/download/a-witchy-music-tribute-to-siouxsie/03%20-%20Aura%20en%20el%20espejo%20-%20Arabian%20Nights%20%28Feat%20Arkana%29.mp3" } },
  ],
  "74": [
    { identifier: "youtube-skxxmAAQuI4", title: "Ski Better Faster — Ice Skating", subject: "winter sports skiing ice skating winter games", year: 2019, media: { type: "video", url: "https://archive.org/download/youtube-skxxmAAQuI4/skxxmAAQuI4.mp4" } },
    { identifier: "skiing-scenes-with-franz-klammer", title: "Skiing Scenes With Franz Klammer", subject: "winter sports skiing alpine winter games", year: 1980, media: { type: "video", url: "https://archive.org/download/skiing-scenes-with-franz-klammer/skiing%20scenes%20with%20franz%20klammer.mp4" } },
    { identifier: "Ski_With_A_Ranger_FDRD_Breck_Ski_Resort", title: "Ski With a Ranger — Breck Ski Resort", subject: "winter sports skiing alpine winter games", year: 2016, media: { type: "video", url: "https://archive.org/download/Ski_With_A_Ranger_FDRD_Breck_Ski_Resort/Ski_With_A_Ranger_FDRD_Breck_Ski_Resort.mp4" } },
    { identifier: "Let_s_Skate_Ice_on_Main_Opening_Day_2014", title: "Let's Skate — Ice on Main", subject: "winter sports ice skating winter games", year: 2014, media: { type: "video", url: "https://archive.org/download/Let_s_Skate_Ice_on_Main_Opening_Day_2014/Let_s_Skate_Ice_on_Main_Opening_Day_2014.mp4" } },
    { identifier: "PrimeProductions_FlyingPenguinJibFest_Snowboarding_2005", title: "Flying Penguin — Snowboarding", subject: "winter sports snowboarding winter games", year: 2005, media: { type: "video", url: "https://archive.org/download/PrimeProductions_FlyingPenguinJibFest_Snowboarding_2005/FlyingPenguin2005_512kb.mp4" } },
  ],
  /* v4 targeted repair bank. These records came from the affected lane
     queries and stay inside each channel's existing editorial vocabulary.
     They are emergency/first-play seeds only; normal discovery continues to
     own the larger catalog and freshness rotation. */
  "69": [
    { identifier: "rg-84-film-1951-gt-3_202404", title: "RG 84 Film 1951 GT 3", subject: "sports newsreel athletics sports archive", year: 1951 },
    { identifier: "cbb-auburn-v-lsu-reel-1-of-4-1-15-1972-film-auburn-720", title: "Auburn vs LSU — Basketball Reel", subject: "college basketball sports archive", year: 1972 },
    { identifier: "cbb-vanderbilt-v-auburn-reel-4-of-5-1-15-1968-film-archive-auburn-720_202404", title: "Vanderbilt vs Auburn — Basketball Reel", subject: "college basketball sports archive", year: 1968 },
    { identifier: "cfb-auburn-v-houston-10-26-1957-sd-archive", title: "Auburn vs Houston — Football (1957)", subject: "college football sports archive", year: 1957 },
    { identifier: "1952-RollerDerby-TheChiefsVsTheJolters", title: "Roller Derby — The Chiefs vs The Jolters", subject: "roller derby sports newsreel athletics", year: 1952 },
  ],
  "76": [
    { identifier: "01-1990-daytona-500-full-broadcast", title: "Daytona 500 — Full Broadcast (1990)", subject: "stock car racing nascar motorsports", year: 1990 },
    { identifier: "Races_MPEG", title: "AMP Outlaw Winternationals — Racing", subject: "stock car racing motorsports drag racing", year: 2000 },
    { identifier: "AMP_Races01", title: "AMP Races — Full Event", subject: "stock car racing motorsports drag racing", year: 2000 },
    { identifier: "nascar-canadian-tire-series-chaudiere_20250409", title: "NASCAR Canadian Tire Series — Chaudière", subject: "nascar stock car racing motorsports", year: 2025 },
    { identifier: "racing-dynamics", title: "Racing Dynamics (2002)", subject: "stock car racing motorsports race cars", year: 2002 },
  ],
  "78": [
    { identifier: "pumping-iron-ii-the-women-side-2", title: "Pumping Iron II: The Women", subject: "fitness bodybuilding gym training exercise", year: 1985 },
    { identifier: "the_comeback_1980", title: "The Comeback — Bodybuilding Documentary", subject: "fitness bodybuilding gym training exercise", year: 1980 },
    { identifier: "O_FallonTV_-_RSC_Fitness_Classes_O_Fallon_MO", title: "RSC Fitness Classes", subject: "fitness exercise workout gym training", year: 2015 },
    { identifier: "workout-with-helen", title: "Dance Workout with Helen", subject: "fitness exercise workout dance training", year: 2010 },
    { identifier: "bodynarcissism", title: "Body Narcissism — Gym Rats and Bodybuilders", subject: "fitness bodybuilding gym training exercise", year: 2011 },
  ],
  "20": [
    { identifier: "WSBK_20010917_213000_Judge_Judy", title: "Judge Judy — September 17, 2001", subject: "courtroom legal television judge court", year: 2001, media: { type: "video", url: "https://archive.org/download/WSBK_20010917_213000_Judge_Judy/WSBK_20010917_213000_Judge_Judy.mp4" } },
    { identifier: "WSBK_20010911_210000_Judge_Judy", title: "Judge Judy — September 11, 2001", subject: "courtroom legal television judge court", year: 2001 },
    { identifier: "WSBK_20010914_160000_Judge_Mathis", title: "Judge Mathis — September 14, 2001", subject: "courtroom legal television judge court", year: 2001 },
    { identifier: "judge-judy-s-9-e-1.1", title: "Judge Judy — Season 9, Episode 1", subject: "courtroom legal television judge court", year: 2004 },
    { identifier: "judge-judy-14th-season", title: "Judge Judy — Season 14", subject: "courtroom legal television judge court", year: 2009 },
  ],
  "152": [
    { identifier: "galaxian-3-play-station-pal-gameplay-full-game-longplay-recorded-by-you-tube-all-stages", title: "Galaxian 3 — Full Game Longplay", subject: "arcade video games gameplay longplay", year: 1990 },
    { identifier: "burning-force-sega-mega-drive-pal-gameplay-full-game-longplay", title: "Burning Force — Full Game Longplay", subject: "arcade video games gameplay longplay", year: 1990 },
    { identifier: "cool-spot-nintendo-snes-pal-60-gameplay-full-game-longplay-recorded-by-archive", title: "Cool Spot — Full Game Longplay", subject: "arcade video games gameplay longplay", year: 1993 },
    { identifier: "supercross-3-d-atari-jaguar-pal-gameplay-demostration-attract-mode-recorded-by-j", title: "Supercross 3D — Atari Jaguar Gameplay", subject: "arcade video games gameplay racing", year: 1994 },
    { identifier: "worm-war-i-atari-2600-pal-gameplay-by-zeusdaz", title: "Worm War I — Atari 2600 Longplay", subject: "arcade video games gameplay longplay", year: 1978 },
  ],
  "912": [
    { identifier: "DeshOrchestraAjitGhosh_201807", title: "Desh — Orchestra", subject: "classical music orchestra instrumental radio", year: 2018, media: { type: "audio", url: "https://archive.org/download/DeshOrchestraAjitGhosh_201807/Desh%20Orchestra-Ajit%20Ghosh.mp3" } },
    { identifier: "CelloSquadron", title: "Cello Squadron", subject: "classical music cello orchestra instrumental radio", year: 2015 },
    { identifier: "ZeroOrchestra", title: "Zero Orchestra", subject: "classical music orchestra instrumental radio", year: 2014 },
    { identifier: "arno-schellenberg-preiser-lv-140-seite-a", title: "Arno Schellenberg — Preiser", subject: "classical music opera orchestra radio", year: 1950 },
    { identifier: "CanadianOperaCompanyOpera101-NixoninChina_0", title: "Canadian Opera Company — Nixon in China", subject: "classical music opera orchestra radio", year: 2011 },
  ],
  "918": [
    { identifier: "jamendo-592141", title: "The Ambient Music", subject: "electronic music ambient radio", year: 2015, media: { type: "audio", url: "https://archive.org/download/jamendo-592141/01-2229038-Sevennotes-The%20Ambient%20Music.mp3" } },
    { identifier: "jamendo-593974", title: "Dark Cyberpunk Electro", subject: "electronic music synthwave radio", year: 2015 },
    { identifier: "InZenSilence", title: "In Zen Silence", subject: "electronic music ambient experimental radio", year: 2014 },
    { identifier: "mchnta-008", title: "C0D3 — freqout!", subject: "electronic music experimental ambient radio", year: 2013 },
    { identifier: "jamendo-351740", title: "Oper-8 — Vectorized", subject: "electronic music techno experimental radio", year: 2013 },
    { identifier: "OSC74Dexxed", title: "One Synth Challenge — Dexed", subject: "electronic music synth radio", year: 2015 },
    { identifier: "NS050", title: "Another Day, Another Way", subject: "electronic music ambient compilation radio", year: 2012 },
    { identifier: "CANDY032", title: "Christmasasaurus Vol. 2", subject: "electronic music electronica IDM radio", year: 2006 },
    { identifier: "Torley_Wong_-_The_Final_Selection", title: "Torley Wong — The Final Selection", subject: "electronic music ambient breakbeat house techno radio", year: 2005 },
    { identifier: "stqk011", title: "A Struggle Between Right or Wrong", subject: "electronic music electro synthwave radio", year: 2012 },
    { identifier: "mtk140", title: "ST — I'll Meet You There EP", subject: "electronic music netlabel radio", year: 2012 },
    { identifier: "Jdbxl15Va-IScreamIceCream", title: "JDBXL15 — I Scream Ice Cream", subject: "electronic music techno radio", year: 2011 },
    { identifier: "foot149", title: "Duis", subject: "electronic music trip-hop jazz radio", year: 2010 },
    { identifier: "nullbomb", title: "Nullbomb Creatures", subject: "electronic music IDM breakcore radio", year: 2006 },
    { identifier: "pcr089EmilDavydov-Sketches", title: "Emil Davydov — Sketches", subject: "electronic music ambient experimental radio", year: 2011 },
  ],
  "107": [
    { identifier: "BYTHESADSEAWAVESHaroldLloydSilentAbrAHalRoachComedy", title: "By the Sad Sea Waves — Harold Lloyd", subject: "silent cinema silent film comedy archive", year: 1917, media: { type: "video", url: "https://archive.org/download/BYTHESADSEAWAVESHaroldLloydSilentAbrAHalRoachComedy/BY%20THE%20SAD%20SEA%20WAVES-Harold%20Lloyd-silent-abr-A%20Hal%20Roach%20Comedy.mp4" } },
    { identifier: "the-whole-dam-family", title: "The Whole Dam Family", subject: "silent cinema silent film comedy archive", year: 1914 },
    { identifier: "HomeSweetHome1914", title: "Home Sweet Home", subject: "silent cinema silent film drama archive", year: 1914 },
    { identifier: "FreanAndCo.sBiscuitWorks1906", title: "Frean and Co.'s Biscuit Works", subject: "silent cinema actuality film archive", year: 1906 },
    { identifier: "GroneLaVeniseEspagnole", title: "La Venise Espagnole", subject: "silent cinema silent film travel archive", year: 1910 },
  ],
  "123": [
    { identifier: "watermargin::the_water_margin_s01e01.mp4", sourceIdentifier: "watermargin", fileName: "the_water_margin_s01e01.mp4", title: "Water Margin — Episode 1", subject: "classic television drama series television", year: 1973, media: { type: "video", url: "https://archive.org/download/watermargin/the_water_margin_s01e01.mp4" } },
    { identifier: "willies-last-stand-play-for-today", title: "Willie's Last Stand — Play for Today", subject: "television drama television play tv series", year: 1977 },
    { identifier: "citv-programmes-from-june-and-july-1996-the-riddlers-wizadora-mollys-gang-old-bear-stories-and-more", title: "CITV Programmes — June and July 1996", subject: "television children's television tv series broadcast", year: 1996 },
    { identifier: "the-prisoner", title: "The Prisoner", subject: "classic television science fiction television series", year: 1967 },
    { identifier: "goodbye-play-for-today-1975", title: "Goodbye — Play for Today", subject: "television drama television play tv series", year: 1975 },
  ],
  "124": [
    { identifier: "frankenstein-created-woman_202505", title: "Frankenstein Created Woman", subject: "hammer horror classic horror film gothic cinema", year: 1967 },
    { identifier: "she-1965-68", title: "She", subject: "hammer films horror fantasy gothic cinema", year: 1965 },
    { identifier: "shadow-of-the-cat-1961", title: "The Shadow of the Cat", subject: "hammer horror classic horror film gothic cinema", year: 1961 },
    { identifier: "thequatermassxperiment", title: "The Quatermass Xperiment", subject: "hammer horror science fiction classic horror cinema", year: 1955 },
    { identifier: "The_Body_Snatcher_1945", title: "The Body Snatcher", subject: "classic horror gothic cinema horror film", year: 1945 },
  ],
  "120": [
    { identifier: "y-2-mate.is-nobleza-ranchera-1977-pelicula-mexicana-u-bg-1ye-qdri-8-720p-1650422060856", title: "Nobleza Ranchera", subject: "latin cinema mexican film spanish movie", year: 1977 },
    { identifier: "NnLibroDelBuenAmorElElLibroDelBuenAmorComedia1975TomsAznarPatxiAndinBlancaEstradaEspaolEspaa", title: "El Libro del Buen Amor", subject: "latin cinema spanish film comedy movie", year: 1975 },
    { identifier: "tragedia-en-waco-texas-ano-1993-jorge-reynoso-jorge-ortin-ana-luisa-peluffo-polo-ortin.", title: "Tragedia en Waco, Texas", subject: "latin cinema mexican film spanish movie drama", year: 1993 },
    { identifier: "vicente-fernandez-sinverguenza...-pero-honrado-198520042008-dvd-completo", title: "Sinvergüenza, Pero Honrado", subject: "latin cinema mexican film spanish movie", year: 1985 },
    { identifier: "viridiana.-1961.720p.-blu-ray.x-264.-aac-ve", title: "Viridiana", subject: "latin cinema spanish film classic movie", year: 1961 },
  ],
  "155": [
    { identifier: "cosdaz-Heavy_Metal_-_Locomotive_11", title: "Heavy Metal — Locomotive", subject: "adult animation animated film cartoon television", year: 1981, media: { type: "video", url: "https://archive.org/download/cosdaz-Heavy_Metal_-_Locomotive_11/Heavy_Metal_-_Locomotive_11.mp4" } },
    { identifier: "Beavis1228_-_Beavis_goes_Berserk_IV_Shaman_2009-09-18_4.51", title: "Beavis Goes Berserk", subject: "adult animation animated comedy cartoon television", year: 2009 },
    { identifier: "futurama-s2ep5-workprint", title: "Futurama — Season 2 Episode 5", subject: "adult animation animated comedy science fiction television", year: 2000 },
    { identifier: "cartoon-sushi-s-4-episode-64-sd-480p", title: "Cartoon Sushi — Episode 64", subject: "adult animation animated short cartoon television", year: 1998 },
    { identifier: "twitch-vod-v514146619", title: "A Fox in Space — Animation Production", subject: "adult animation animated science fiction cartoon", year: 2019 },
  ],
  "225": [
    { identifier: "damon-1.03", title: "Damon — Episode 1.03", subject: "stand-up comedy television comedy performance", year: 2000 },
    { identifier: "hbo-def-comedy-jam-drew-fraser-lavelle-crawford-1995-most", title: "HBO Def Comedy Jam", subject: "stand-up comedy television comedy performance", year: 1995 },
    { identifier: "Reminisce_Over_You_-_Episode_1", title: "Reminisce Over You — Episode 1", subject: "comedy television comedy performance", year: 2014 },
    { identifier: "funny_or_die_video_ed5351e78f", title: "Ask a Sista — Comedy", subject: "comedy television comedy performance", year: 2010 },
    { identifier: "funny_or_die_video_0e715ce0f4", title: "Marfa Stewart — Comedy", subject: "comedy television comedy performance", year: 2010 },
  ],
  "233": [
    { identifier: "NaturalMysteriesAnimalsInAction", title: "Natural Mysteries — Animals in Action", subject: "wildlife animals nature documentary television", year: 1990, media: { type: "video", url: "https://archive.org/download/NaturalMysteriesAnimalsInAction/Nature.S01E08.The.Discovery.of%2CAnimal.Behavior.Natural.Mysteries.1982.VHSRip.AAC2.0.x264-rattera.mp4" } },
    { identifier: "WhalesDolphinsMen", title: "Whales, Dolphins and Men", subject: "wildlife animals ocean nature documentary television", year: 1990 },
    { identifier: "AnimalsBehavingBadly", title: "Animals Behaving Badly", subject: "wildlife animals nature documentary television", year: 2000 },
    { identifier: "InPraiseOfGod", title: "In Praise of God — Animal Behavior", subject: "wildlife animals nature documentary television", year: 1990 },
    { identifier: "KonradLorentzScienceofAnimalBehavior", title: "Konrad Lorenz — Science of Animal Behavior", subject: "wildlife animals nature documentary television", year: 1970 },
  ],
  "508": [
    { identifier: "vegas-after-dark-infomercial-2002", title: "Vegas After Dark — Infomercial", subject: "infomercial television commercial retail product", year: 2002, media: { type: "video", url: "https://archive.org/download/vegas-after-dark-infomercial-2002/Vegas%20After%20Dark%20-%20Infomercial%20-%202002.ia.mp4" } },
    { identifier: "ultimate-rock-ballads-collection", title: "Ultimate Rock Ballads Collection — Infomercial", subject: "infomercial television commercial retail product", year: 2000, media: { type: "video", url: "https://archive.org/download/ultimate-rock-ballads-collection/ultimate%20rock%20ballads%20collection.ia.mp4" } },
    { identifier: "virtuv-f10-infomercial", title: "VIRTUV F10 — Infomercial", subject: "infomercial television commercial retail product", year: 2000, media: { type: "video", url: "https://archive.org/download/virtuv-f10-infomercial/VirtuV%20F10%20Infomercial.ia.mp4" } },
    { identifier: "sharper-image-ionic-breeze-infomercial-february-2004", title: "Sharper Image Ionic Breeze — Infomercial", subject: "infomercial television commercial retail product", year: 2004, media: { type: "video", url: "https://archive.org/download/sharper-image-ionic-breeze-infomercial-february-2004/Sharper%20Image%20Ionic%20Breeze%20Infomercial%20%28February%202004%29.ia.mp4" } },
    { identifier: "billy-mays_202505", title: "Billy Mays — The OxiClean Show (1998)", subject: "infomercial television commercial retail product", year: 1998, media: { type: "video", url: "https://archive.org/download/billy-mays_202505/Billy%20Mays_%20The%20OxiClean%20Show%20%281998%29.mp4" } },
    { identifier: "billy-mays_202505::turbo-tiger-2001", title: "Billy Mays — Turbo Tiger (2001)", subject: "infomercial television commercial retail product", year: 2001, media: { type: "video", url: "https://archive.org/download/billy-mays_202505/Billy%20Mays%20-%20Turbo%20Tiger%202001%20%28FULL%29.mp4" } },
    { identifier: "billy-mays_202505::space-savers-1989", title: "Billy Mays — Space Savers / Wash-Matik (1989)", subject: "infomercial television commercial retail product", year: 1989, media: { type: "video", url: "https://archive.org/download/billy-mays_202505/Space%20Savers_Wash-Matik_Super%20Shammy%20infomercial%2C%207_23_1989%20%28EARLY%20Billy%20Mays%20appearance%21%21%29.mp4" } },
    { identifier: "billy-mays_202505::orange-glo-2000", title: "Billy Mays — Orange Glo (2000)", subject: "infomercial television commercial retail product", year: 2000, media: { type: "video", url: "https://archive.org/download/billy-mays_202505/Billy%20Mays%20-%20Orange%20Glo%202000%20infomercial%20%28LQ%2C%20Fixed%20Audio%29.mp4" } },
    { identifier: "billy-mays_202505::ultimate-ladder", title: "Billy Mays — Ultimate Ladder", subject: "infomercial television commercial retail product", year: 2000, media: { type: "video", url: "https://archive.org/download/billy-mays_202505/Ultimate%20Ladder.mp4" } },
    { identifier: "billy-mays_202505::orange-glo-hardwood", title: "Billy Mays — Orange Glo Hardwood Floor Care", subject: "infomercial television commercial retail product", year: 2005, media: { type: "video", url: "https://archive.org/download/billy-mays_202505/Orange%20Glo%20Hardwood%20Floor%20Care%20System.mp4" } },
  ],
  "81": [
    { identifier: "wfktvme-Ice_Fishing_Long_Lake_2020", title: "Ice Fishing Long Lake", subject: "fishing sport fishing angling outdoor recreation", year: 2020, media: { type: "video", url: "https://archive.org/download/wfktvme-Ice_Fishing_Long_Lake_2020/Ice_Fishing_Long_Lake_2020.mp4" } },
    { identifier: "Ice_Fishing_My_Favorite_Minnesota", title: "Ice Fishing — My Favorite Minnesota", subject: "fishing sport fishing angling outdoor recreation", year: 2009 },
    { identifier: "upenn-f16-0503_Matto_Grosso_Fishing", title: "Matto Grosso Fishing", subject: "fishing sport fishing angling outdoor recreation travel", year: 1931 },
    { identifier: "flyfishingjourneysvlog2icelandiceagebrowntroutchar", title: "Fly Fishing Journeys — Iceland Brown Trout", subject: "fishing fly fishing trout fishing outdoor recreation", year: 2019 },
    { identifier: "O_FallonTV_-_Family_Fishing_Day_2013_O_Fallon_Missouri", title: "Family Fishing Day", subject: "fishing sport fishing angling outdoor recreation", year: 2013 },
  ],
  "150": [
    { identifier: "merrie-melodies-quero-ser-marujo-i-wanna-be-a-sailor-1937-hd-pt-br", title: "Merrie Melodies — I Wanna Be a Sailor (1937)", subject: "classic cartoons looney tunes merrie melodies animation", year: 1937, media: { type: "video", url: "https://archive.org/download/merrie-melodies-quero-ser-marujo-i-wanna-be-a-sailor-1937-hd-pt-br/Merrie%20Melodies%20-%20Quero%20Ser%20Marujo%20%28I%20Wanna%20Be%20a%20Sailor%2C%201937%29%20HD%2C%20PT-BR.mp4" } },
    iaDirectRecovery("walky-talky-hawky-1946::Walky Talky Hawky (1946).mp4", "walky-talky-hawky-1946", "Walky Talky Hawky (1946).mp4", "Merrie Melodies — Walky Talky Hawky (1946)", "classic cartoons looney tunes merrie melodies animation", 1946),
    iaDirectRecovery("the-wabbit-who-came-to-supper-1942_202605::The Wabbit Who Came to Supper (1942).mp4", "the-wabbit-who-came-to-supper-1942_202605", "The Wabbit Who Came to Supper (1942).mp4", "The Wabbit Who Came to Supper (1942)", "classic cartoons looney tunes bugs bunny animation", 1942),
    iaDirectRecovery("merrie-melodies-a-day-at-the-zoo-1939::Merrie Melodies - A Day at the Zoo (1939).mp4", "merrie-melodies-a-day-at-the-zoo-1939", "Merrie Melodies - A Day at the Zoo (1939).mp4", "Merrie Melodies — A Day at the Zoo (1939)", "classic cartoons looney tunes merrie melodies animation", 1939),
    iaDirectRecovery("the-country-mouse-1935::The Country Mouse (1935).ia.mp4", "the-country-mouse-1935", "The Country Mouse (1935).ia.mp4", "The Country Mouse (1935)", "classic cartoons theatrical cartoon golden age animation", 1935),
    iaDirectRecovery("popeye_patriotic_popeye::popeye_patriotic_popeye_512kb.mp4", "popeye_patriotic_popeye", "popeye_patriotic_popeye_512kb.mp4", "Popeye — Patriotic Popeye (1957)", "classic cartoons popeye cartoon animation", 1957),
    iaDirectRecovery("popeye_private_eye_popeye::popeye_private_eye_popeye_512kb.mp4", "popeye_private_eye_popeye", "popeye_private_eye_popeye_512kb.mp4", "Popeye — Private Eye Popeye (1954)", "classic cartoons popeye cartoon animation", 1954),
    iaDirectRecovery("popeye_shuteye_popeye::popeye_shuteye_popeye_512kb.mp4", "popeye_shuteye_popeye", "popeye_shuteye_popeye_512kb.mp4", "Popeye — Shuteye Popeye (1952)", "classic cartoons popeye cartoon animation", 1952),
    iaDirectRecovery("popeye_i_dont_scare::popeye_i_dont_scare_512kb.mp4", "popeye_i_dont_scare", "popeye_i_dont_scare_512kb.mp4", "Popeye — I Don't Scare (1956)", "classic cartoons popeye cartoon animation", 1956),
    iaDirectRecovery("popeye_taxi-turvey::popeye_taxi-turvey_512kb.mp4", "popeye_taxi-turvey", "popeye_taxi-turvey_512kb.mp4", "Popeye — Taxi-Turvy (1954)", "classic cartoons popeye cartoon animation", 1954),
    iaDirectRecovery("popeye_fright_to_the_finish::popeye_fright_to_the_finish_512kb.mp4", "popeye_fright_to_the_finish", "popeye_fright_to_the_finish_512kb.mp4", "Popeye — Fright to the Finish (1954)", "classic cartoons popeye cartoon animation", 1954),
    iaDirectRecovery("popeye_the_sailor_ancient_fantasy::popeye_the_sailor_ancient_fantasy_512kb.mp4", "popeye_the_sailor_ancient_fantasy", "popeye_the_sailor_ancient_fantasy_512kb.mp4", "Popeye — Ancient Fistory (1952)", "classic cartoons popeye cartoon animation", 1952),
    iaDirectRecovery("popeye_big_bad_sinbad::popeye_big_bad_sinbad_512kb.mp4", "popeye_big_bad_sinbad", "popeye_big_bad_sinbad_512kb.mp4", "Popeye — Big Bad Sinbad (1952)", "classic cartoons popeye cartoon animation", 1952),
  ],
  "13": [
    { identifier: "walls-french-coffee-ice-cream-ad", title: "Wall's French Coffee Ice Cream Ad", subject: "vintage television commercial video advertisement", year: 1960, media: { type: "video", url: "https://archive.org/download/walls-french-coffee-ice-cream-ad/Wall%27s%20French%20Coffee%20Ice%20Cream%20Ad.mp4" } },
    { identifier: "wwl-tv-new-orleans-promos-3-25-1990", title: "WWL-TV New Orleans Promos (1990)", subject: "television commercial video advertisement vintage tv", year: 1990 },
    { identifier: "funny_or_die_video_4f4622efba", title: "Sasquatch Safety Public Service Announcement", subject: "public service announcement television commercial video", year: 2008 },
    { identifier: "csbtv20ca-Plastic_Bag_Recycling_PSA", title: "Plastic Bag Recycling PSA", subject: "public service announcement television commercial video", year: 2012 },
    { identifier: "waste-food-ted-moult-1971", title: "Waste Food (1971)", subject: "public service announcement television commercial video", year: 1971 },
  ],
  "112": [
    { identifier: "the-parent-trap-1961_202508", title: "The Parent Trap (1961)", subject: "family film sunday matinee classic movie", year: 1961, media: { type: "video", url: "https://archive.org/download/the-parent-trap-1961_202508/The%20Parent%20Trap.mp4" } },
    { identifier: "mary-poppins-1964_202506", title: "Mary Poppins (1964)", subject: "family film sunday matinee classic movie musical", year: 1964 },
    { identifier: "the-sound-of-music-movie", title: "The Sound of Music", subject: "family film sunday matinee classic movie musical", year: 1965 },
    { identifier: "journey-back-to-oz-1972-family-home-entertainment-1983", title: "Journey Back to Oz", subject: "family film sunday matinee children's movie", year: 1972 },
    { identifier: "the-wizard-of-oz-1933-greek-dub", title: "The Wizard of Oz (1933)", subject: "family film sunday matinee classic movie musical", year: 1933 },
  ],
  "217": [
    { identifier: "thesea_202602", title: "The Sea", subject: "educational filmstrip classroom film narrated filmstrip", year: 1962, media: { type: "video", url: "https://archive.org/download/thesea_202602/thesea.mp4" } },
    { identifier: "ordealofwoodrowwilson_202602", title: "Ordeal of Woodrow Wilson", subject: "educational filmstrip classroom film history film", year: 1961 },
    { identifier: "thecommunity_201602_202603", title: "The Community", subject: "educational filmstrip classroom film social guidance", year: 1962 },
    { identifier: "spaceprobesexploringoursolarsystem_202511", title: "Space Probes: Exploring Our Solar System", subject: "educational filmstrip classroom film science film", year: 1964 },
    { identifier: "the-beginnings-of-exploration-1965-144p", title: "The Beginnings of Exploration", subject: "educational filmstrip classroom film geography film", year: 1965 },
  ],
  "234": [
    { identifier: "wmaz-special-the-flood-10-years-later", title: "Special Report: The Flood 10 Years Later", subject: "natural disaster disaster documentary flood documentary television", year: 2004, media: { type: "video", url: "https://archive.org/download/wmaz-special-the-flood-10-years-later/2004%20Special%20-%20The%20Flood%2010%20Years%20Later.mp4" } },
    { identifier: "wildfire-survivors-build-tent-city-outside-california-walmart", title: "Wildfire Survivors Build Tent City", subject: "natural disaster disaster documentary wildfire documentary television", year: 2018 },
    { identifier: "youtube-suaN4KCUPU4", title: "Severe Flooding Hits New York City Subway Stations", subject: "natural disaster disaster documentary flood documentary television", year: 2023 },
    { identifier: "codtx-Denton_Municipal_Electric_heads_to_Lakeland_Florida_after_Hurricane_Ian.", title: "Denton Municipal Electric After Hurricane Ian", subject: "natural disaster disaster documentary hurricane documentary rescue operation", year: 2022 },
    { identifier: "youtube-xjdv_txlDjI", title: "Hurricane Matthew — A Preview of Storms to Come", subject: "natural disaster disaster documentary hurricane documentary television", year: 2016 },
  ],
  "241": [
    { identifier: "SanFranc1963", title: "San Francisco: Story of a City", subject: "civic film public affairs city planning public information government film", year: 1963, media: { type: "video", url: "https://archive.org/download/SanFranc1963/27906.mp4" } },
    { identifier: "Problems1944", title: "Problems of Housing", subject: "civic film public housing community development public affairs government film", year: 1944 },
    { identifier: "StoryOfACity", title: "Story of a City: New York", subject: "civic film city planning public affairs government film", year: 1946 },
    { identifier: "Rochester_A_City_of_Quality", title: "Rochester: A City of Quality", subject: "civic film city planning community development public affairs", year: 1963 },
    { identifier: "DynamicA1956", title: "Dynamic American City", subject: "civic film city planning municipal government public information", year: 1956 },
  ],
  "212": [
    { identifier: "6109_Growing_Things_A_Film_Lesson_in_Nature_Study_01_00_43_01", title: "Growing Things: A Film Lesson in Nature Study", subject: "nature documentary wildlife documentary natural history film", year: 1928, media: { type: "video", url: "https://archive.org/download/6109_Growing_Things_A_Film_Lesson_in_Nature_Study_01_00_43_01/6109_Growing_Things_A_Film_Lesson_in_Nature_Study_01_00_43_01.mp4" } },
    { identifier: "rpworldthatnatureforgot001", title: "World That Nature Forgot", subject: "wildlife documentary nature documentary natural history film", year: 1955, media: { type: "video", url: "https://archive.org/download/rpworldthatnatureforgot001/RP-World_That_Nature_Forgot_001.mp4" } },
    { identifier: "6090_Sky_A_Film_Lesson_in_Nature_Study_The_01_35_14_18", title: "Sky: A Film Lesson in Nature Study", subject: "nature documentary wildlife documentary natural history film", year: 1928, media: { type: "video", url: "https://archive.org/download/6090_Sky_A_Film_Lesson_in_Nature_Study_The_01_35_14_18/6090_Sky_A_Film_Lesson_in_Nature_Study_The_01_35_14_18.mp4" } },
    { identifier: "6174_Furry_Creatures_A_Film_Lesson_in_Nature_Study_21_50_21_20", title: "Furry Creatures: A Film Lesson in Nature Study", subject: "wildlife documentary nature documentary animal behavior film", year: 1927 },
    { identifier: "Dayatthe1928", title: "Day at the River: A Film Lesson in Nature Study", subject: "nature documentary wildlife documentary natural history film", year: 1928 },
  ],
  "223": [
    { identifier: "hip-hop-boyz-total-dance-1995", title: "Hip Hop Boyz at Total Dance (1995)", subject: "hip hop rap music dance television performance", year: 1995, media: { type: "video", url: "https://archive.org/download/hip-hop-boyz-total-dance-1995/TotalDance-06-Hip-Hop-Boyz.mp4" } },
    { identifier: "bellydancehiphophipdrop", title: "Bellydance Hip Hop Hip Drop", subject: "hip hop rap music dance performance", year: 2000, media: { type: "video", url: "https://archive.org/download/bellydancehiphophipdrop/Bellydance%20Hip%20Hop%20Hip%20Drop.mp4" } },
    { identifier: "Top10HipHopVideosOf2018V04MpPCQMe8360p_201902", title: "Top 10 Hip Hop Videos of 2018", subject: "hip hop rap music video culture", year: 2018, media: { type: "video", url: "https://archive.org/download/Top10HipHopVideosOf2018V04MpPCQMe8360p_201902/Top_10_Hip_Hop_Videos_of_2018_v04MpPCQMe8_360p.mp4" } },
    { identifier: "prkcitut-Of_Verona_Interview_-_Live_on_Park_City_Television", title: "Of Verona — Live Television Interview", subject: "hip hop rap music television performance interview", year: 2011 },
    { identifier: "by-boys-de-simoes-filho-parte-2", title: "B-Boys of Simões Filho — Part 2", subject: "hip hop rap music breakdance culture", year: 2011 },
  ],
  "928": [
    { identifier: "78_mood-indigo-and-wall-street-wail_duke-ellington-aho_collectors-series-78s", title: "Duke Ellington — Mood Indigo", subject: "jazz swing big band duke ellington", year: 1943, media: { type: "audio", url: "https://archive.org/download/78_mood-indigo-and-wall-street-wail_duke-ellington-aho_collectors-series-78s/mood%20indigo_duke%20ellington%20aho_brunswick%20set_mono.mp3" } },
    { identifier: "1927-USA-Archives-1927-10-06-Duke-Ellington-Orch-Black-And-Tan-Fantasy", title: "Duke Ellington Orchestra — Black and Tan Fantasy", subject: "jazz duke ellington big band", year: 1927, media: { type: "audio", url: "https://archive.org/download/1927-USA-Archives-1927-10-06-Duke-Ellington-Orch-Black-And-Tan-Fantasy/1927%28USA%29Archives19271006DukeEllingtonOrch-BlackAndTanFantasy.mp3" } },
    { identifier: "1932-USA-Archives-1932-02-02-Duke-Ellington-Orch-I-Dont-Mean-A-Thing", title: "Duke Ellington Orchestra — It Don't Mean a Thing", subject: "jazz duke ellington swing big band", year: 1932, media: { type: "audio", url: "https://archive.org/download/1932-USA-Archives-1932-02-02-Duke-Ellington-Orch-I-Dont-Mean-A-Thing/1932%28USA%29Archives19320202DukeEllingtonOrch-IDontMeanAThing.mp3" } },
    { identifier: "78_when-your-lover-has-gone_louis-armstrong-aho", title: "Louis Armstrong — When Your Lover Has Gone", subject: "jazz louis armstrong swing big band", year: 1931, media: { type: "audio", url: "https://archive.org/download/78_when-your-lover-has-gone_louis-armstrong-aho/when%20your%20lover%20has%20gone_louis%20armstrong%20aho_mono.mp3" } },
    { identifier: "1932-USA-Archives-1932-05-18-Duke-Ellington-Famous-Orch-Blue-Ramble", title: "Duke Ellington Famous Orchestra — Blue Ramble", subject: "jazz duke ellington swing big band", year: 1932 },
  ],
  "60": [
    { identifier: "patma-January_11th_2017_-_Boys_Hockey_vs_Danvers", title: "January 11th, 2017 — Boys Hockey vs Danvers", subject: "hockey ice hockey hockey game hockey broadcast college hockey sports", year: 2017, media: { type: "video", url: "https://archive.org/download/patma-January_11th_2017_-_Boys_Hockey_vs_Danvers/January_11th_2017_-_Boys_Hockey_vs_Danvers.mp4" } },
    { identifier: "datvsma-Dracut-Tyngsboro_Hockey_vs._Lowell_2-12-25", title: "Dracut-Tyngsboro Hockey vs Lowell", subject: "hockey ice hockey hockey game hockey broadcast sports", year: 2025, media: { type: "video", url: "https://archive.org/download/datvsma-Dracut-Tyngsboro_Hockey_vs._Lowell_2-12-25/Dracut-Tyngsboro_Hockey_vs._Lowell_2-12-25.mp4" } },
    { identifier: "Stillwater_at_Park_1_7_17_Girls_Hockey_Highlights", title: "Stillwater at Park — Girls Hockey Highlights", subject: "hockey ice hockey hockey game women's hockey sports", year: 2017, media: { type: "video", url: "https://archive.org/download/Stillwater_at_Park_1_7_17_Girls_Hockey_Highlights/Stillwater_at_Park_1_7_17_Girls_Hockey_Highlights.mp4" } },
    { identifier: "westcatma-Westwood_Girls_Hockey_vs_Notre_Dame_Academy_3_12_19", title: "Westwood Girls Hockey vs Notre Dame Academy", subject: "hockey ice hockey women's hockey hockey game sports", year: 2019, media: { type: "video", url: "https://archive.org/download/westcatma-Westwood_Girls_Hockey_vs_Notre_Dame_Academy_3_12_19/Westwood_Girls_Hockey_vs_Notre_Dame_Academy_3_12_19.mp4" } },
    { identifier: "PickupHockeyWinterWednesday24Sept2014", title: "Pickup Hockey — Winter Wednesday", subject: "hockey ice hockey hockey game outdoor hockey sports", year: 2014, media: { type: "video", url: "https://archive.org/download/PickupHockeyWinterWednesday24Sept2014/CLIP0004.MP4" } },
  ],
  "100": [
    { identifier: "WarOfTheRobots", title: "War of the Robots", subject: "science fiction film atomic age sci-fi monster movie alien invasion space travel", year: 1978, media: { type: "video", url: "https://archive.org/download/WarOfTheRobots/WarOfTheRobots1978.ogv" } },
    { identifier: "BattleOfTheWorldsWidesceen", title: "Battle of the Worlds", subject: "science fiction film atomic age sci-fi monster movie alien invasion space travel", year: 1961, media: { type: "video", url: "https://archive.org/download/BattleOfTheWorldsWidesceen/Battle%20of%20the%20Worlds%20NTSC_1.mp4" } },
    { identifier: "AtomAgeVampire", title: "Atom Age Vampire", subject: "science fiction film atomic age sci-fi monster movie alien invasion space travel", year: 1960, media: { type: "video", url: "https://archive.org/download/AtomAgeVampire/AtomAgeVampire.mp4" } },
    { identifier: "StarOdysseyitalianStarWars1979", title: "Star Odyssey", subject: "science fiction film atomic age sci-fi monster movie alien invasion space travel", year: 1979, media: { type: "video", url: "https://archive.org/download/StarOdysseyitalianStarWars1979/STAR_ODYSSEY_1979-desktop.mp4" } },
    { identifier: "cyber-tracker-2-film-vf-hd-720-p", title: "Cyber Tracker 2", subject: "science fiction film atomic age sci-fi monster movie alien invasion space travel", year: 1995, media: { type: "video", url: "https://archive.org/download/cyber-tracker-2-film-vf-hd-720-p/Cyber%20Tracker%202%20Film%20VF%20HD%20720P.ia.mp4" } },
  ],
  "67": [
    { identifier: "a28-vi_hockey-women_nescac-championship_2005-03-06", title: "Middlebury Women's Hockey — NESCAC Championship", subject: "women's sports women athletes women's athletics hockey college sports", year: 2005, media: { type: "video", url: "https://archive.org/download/a28-vi_hockey-women_nescac-championship_2005-03-06/a28-vi_hockey-women_nescac-championship_2005-03-06.mp4" } },
    { identifier: "a28-vi_hockey-women_ncaa-championship_2009-03-20", title: "Middlebury Women's Hockey — NCAA Championship", subject: "women's sports women athletes women's athletics hockey college sports", year: 2009 },
    { identifier: "a28-vi_hockey-women_nescac-semifinal-final_2011-03-05", title: "Middlebury Women's Hockey — NESCAC Semifinal and Final", subject: "women's sports women athletes women's athletics hockey college sports", year: 2011 },
    { identifier: "stltvmo-STL_TV_Star_of_the_Game_Rebecca_Harris_-_St_Louis_Surge_vs_Oklahoma_Outlaws_Game_-_June_12", title: "Rebecca Harris — St. Louis Surge Star of the Game", subject: "women's sports women athletes women's athletics basketball professional sports", year: 2021, media: { type: "video", url: "https://archive.org/download/stltvmo-STL_TV_Star_of_the_Game_Rebecca_Harris_-_St_Louis_Surge_vs_Oklahoma_Outlaws_Game_-_June_12/STL_TV_Star_of_the_Game_Rebecca_Harris_-_St_Louis_Surge_vs_Oklahoma_Outlaws_Game_-_June_12.mp4" } },
    { identifier: "silverintogold_201705", title: "Silver into Gold", subject: "women's sports women athletes women's athletics sports documentary", year: 1986, media: { type: "video", url: "https://archive.org/download/silverintogold_201705/silverintogold_201705.mp4" } },
  ],
  "70": [
    { identifier: "mesqtx-Mesquite_celebrates_champion_bull_rider_Chris_Villanueva", title: "Mesquite Celebrates Champion Bull Rider Chris Villanueva", subject: "rodeo bull riding barrel racing western sports rodeo", year: 2019, media: { type: "video", url: "https://archive.org/download/mesqtx-Mesquite_celebrates_champion_bull_rider_Chris_Villanueva/Mesquite_celebrates_champion_bull_rider_Chris_Villanueva.mp4" } },
    { identifier: "StarMetro_Roadeo_2017", title: "StarMetro Roadeo — 2017", subject: "rodeo western sports driving competition rodeo", year: 2017, media: { type: "video", url: "https://archive.org/download/StarMetro_Roadeo_2017/StarMetro_Roadeo_2017.mp4" } },
    { identifier: "prkcitut-Summit_County_Fair_Rodeo", title: "Summit County Fair Rodeo", subject: "rodeo bull riding barrel racing western sports", year: 2007, media: { type: "video", url: "https://archive.org/download/prkcitut-Summit_County_Fair_Rodeo/Summit_County_Fair_Rodeo.mp4" } },
    { identifier: "cogptx-Grand_Prairie_Police_Motorcycle_Rodeo", title: "Grand Prairie Police Motorcycle Rodeo", subject: "rodeo western sports riding competition", year: 2011, media: { type: "video", url: "https://archive.org/download/cogptx-Grand_Prairie_Police_Motorcycle_Rodeo/Grand_Prairie_Police_Motorcycle_Rodeo.mp4" } },
  ],
  "3": [
    { identifier: "privatehell361954_202001", title: "Private Hell 36", subject: "film noir crime drama mystery detective suspense thriller feature film", year: 1954, media: { type: "video", url: "https://archive.org/download/privatehell361954_202001/Private%20Hell%2036%20%281954%2C%20USA%29%20Featuring%20%20Ida%20Lupino%2C%20Steve%20Cochran%2C%20Howard%20Duff%20-%20Film%20Noir%20Full%20Movie.mp4" } },
    { identifier: "the-lost-weekend-1945", title: "The Lost Weekend", subject: "film noir crime drama mystery detective suspense thriller feature film", year: 1945, media: { type: "video", url: "https://archive.org/download/the-lost-weekend-1945/The%20Lost%20Weekend%20%281945%29%20Billy%20Wilder%20%28Dir.%29%2C%20Ray%20Milland%2C%20Jane%20Wyman.ia.mp4" } },
    { identifier: "detour_ipod", title: "Detour", subject: "film noir crime drama mystery detective suspense thriller feature film", year: 1945, media: { type: "video", url: "https://archive.org/download/detour_ipod/Detour.mp4" } },
    { identifier: "shiw5344434", title: "Sherlock Holmes in Washington", subject: "film noir crime drama mystery detective suspense thriller feature film", year: 1943, media: { type: "video", url: "https://archive.org/download/shiw5344434/shiw5344434.mp4" } },
  ],
  "500": [
    { identifier: "colorado-rmnp-1987-interlaced", title: "Rocky Mountain National Park Tour — 1987 VHS", subject: "found footage vintage vhs home movie lost media raw footage", year: 1987, media: { type: "video", url: "https://archive.org/download/colorado-rmnp-1987-interlaced/Colorado-RMNP-1987-interlaced.mp4" } },
    { identifier: "chi_000062", title: "Trade Fair Store Opening Day", subject: "found footage vintage vhs home movie lost media raw footage", year: 1965, media: { type: "video", url: "https://archive.org/download/chi_000062/chi_000062_access.mp4" } },
    { identifier: "cr6-clickable-reality-promo-video", title: "CR6 — Clickable Reality Promo", subject: "found footage vintage vhs lost media raw footage public access", year: 1997, media: { type: "video", url: "https://archive.org/download/cr6-clickable-reality-promo-video/CR6%20Promo.mp4" } },
    { identifier: "amnesia-in-the-addams-familyder-gedachtnisschwund", title: "Amnesia in the Addams Family — Lost German Dub", subject: "found footage vintage vhs lost media television", year: 1970, media: { type: "video", url: "https://archive.org/download/amnesia-in-the-addams-familyder-gedachtnisschwund/AmnesiaAddamsGerman1970.mp4" } },
  ],
  "917": [
    { identifier: "IFREpisode5a", title: "Iron Fist Radio — Black Sabbath Part One", subject: "metal heavy metal black sabbath rock music", year: 2016, media: { type: "audio", url: "https://archive.org/download/IFREpisode5a/IFREpisode5a.mp3" } },
    { identifier: "nssjnewssinglesinglesingle_062817E", title: "Killradio — Metal Session", subject: "metal heavy metal rock music radio", year: 2017, media: { type: "audio", url: "https://archive.org/download/nssjnewssinglesinglesingle_062817E/nssjnewssinglesinglesingle_062817E.mp3" } },
    { identifier: "777r-pigs", title: "Black Sabbath — Pittsburgh 1976", subject: "metal heavy metal black sabbath hard rock live music", year: 1976, media: { type: "audio", url: "https://archive.org/download/777r-pigs/1976-12-08%20-%20Pittsburgh%2C%20PA%20-%20SBD-%202nd%20Gen%20AUD%20Matrix/105%20war%20pigs.mp3" } },
    { identifier: "dream-theater-awake-1994", title: "Dream Theater — Awake", subject: "metal progressive metal heavy metal rock music", year: 1994, media: { type: "audio", url: "https://archive.org/download/dream-theater-awake-1994/Dream%20Theater%20Awake%201994.mp3" } },
    { identifier: "diamond_head-a_lightning-to_the_nations-vinyl-1980", title: "Diamond Head — A Lightning to the Nations", subject: "metal heavy metal british metal rock music", year: 1980 },
  ],
  "919": [
    { identifier: "djshaneasebackthemusicofthemeters", title: "DJ Shan — The Music of the Meters", subject: "funk soul rhythm and blues r&b motown music", year: 2019, media: { type: "audio", url: "https://archive.org/download/djshaneasebackthemusicofthemeters/DJ%20Shan%20-%20Ease%20Back%20-%20The%20music%20of%20the%20Meters.mp3" } },
    { identifier: "eop_2016_05_14_second_set", title: "Electrorganic Projects — Second Set", subject: "funk soul rhythm and blues r&b music", year: 2016, media: { type: "audio", url: "https://archive.org/download/eop_2016_05_14_second_set/eop_2016_05_14_second_set.mp3" } },
    { identifier: "kbfxnyayv0hz0pq8rly0de8p8hflawjjrda9p1bm", title: "Saturdays Soul — Lenno Muit", subject: "funk soul rhythm and blues r&b disco music", year: 2022 },
    { identifier: "kjrxmhz1kdusfy6ap0n8hv7vevnjnn6khbrpwefj", title: "Modern Soul Session", subject: "funk soul rhythm and blues r&b rare groove music", year: 2023 },
    { identifier: "nxgfzo15h5sgdaxgukysyh0hpsgg475m3gsjisnp", title: "Jamm FM — Funky Sunday", subject: "funk soul rhythm and blues r&b disco music", year: 2020 },
    { identifier: "MIXG032", title: "Retrovision — Funk, Soul and Groove", subject: "funk soul rhythm and blues groove music", year: 2013 },
    { identifier: "jillem-full-archive", title: "Jillem Full Archive — Soul and Funk", subject: "funk soul rhythm and blues pop music", year: 2010 },
    { identifier: "funk_cv", title: "Funk Kings", subject: "funk soul rhythm and blues music", year: 2010 },
    { identifier: "ThatCroonerfromNowhere_Cummingsoon_EP", title: "That Crooner from Nowhere — Cumming Soon EP", subject: "funk soul disco groove music", year: 2010 },
  ],
  "128": [
    { identifier: "general-idi-amin-1973", title: "General Idi Amin", subject: "british pathe britain on film british newsreel british documentary", year: 1973, media: { type: "video", url: "https://archive.org/download/general-idi-amin-1973/General%20Idi%20Amin%20%281973%29.mp4" } },
    { identifier: "youtube-WQngx21QZxo", title: "Zeppelins over Britain — Terror in the Skies", subject: "british pathe britain on film british newsreel british documentary", year: 2016 },
    { identifier: "youtube-OAVqVut4g1k", title: "Night Combat — Tank Hunters", subject: "british pathe britain on film british newsreel british documentary", year: 2016 },
    { identifier: "youtube-NLYz6aWz1cs", title: "The Forgotten War Heroine — Milunka Savic", subject: "british pathe britain on film british newsreel british documentary", year: 2015 },
    { identifier: "youtube-rhElEp9ifvY", title: "The Ghost of the Lusitania", subject: "british pathe britain on film british newsreel british documentary", year: 2016 },
  ],
  "131": [
    { identifier: "ghost-ship-1952", title: "Ghost Ship", subject: "british cult film british horror british science fiction hammer horror british crime film", year: 1952, media: { type: "video", url: "https://archive.org/download/ghost-ship-1952/Ghost%20Ship%20%281952%29.mp4" } },
    { identifier: "TheQuatermassConclusion1979", title: "Quatermass IV — The Quatermass Conclusion", subject: "british cult film british horror british science fiction quatermass", year: 1979, media: { type: "video", url: "https://archive.org/download/TheQuatermassConclusion1979/The%20Quatermass%20Conclusion%201979%20chapter1%20Huffety%20Puffety%20Ringstone%20Round.mp4" } },
    { identifier: "QuatermassAndThePit-Episode3", title: "Quatermass and the Pit — Episode 3", subject: "british cult film british horror british science fiction quatermass", year: 1958, media: { type: "video", url: "https://archive.org/download/QuatermassAndThePit-Episode3/QuatermassAndThePit-Episode3.mp4" } },
    { identifier: "youtube-ivvilFdHMhI", title: "Nightmare — Hammer Horror", subject: "british cult film british horror hammer horror british science fiction", year: 1964, media: { type: "video", url: "https://archive.org/download/youtube-ivvilFdHMhI/ivvilFdHMhI.mp4" } },
    { identifier: "the-kneale-tapes-2003", title: "The Kneale Tapes", subject: "british cult film british horror british science fiction quatermass", year: 2003, media: { type: "video", url: "https://archive.org/download/the-kneale-tapes-2003/The%20Kneale%20Tapes%20%28BBC%20Timeshift%2C%202003%29.mp4" } },
  ],
  "232": [
    { identifier: "NASAKennedy-o1WcJDMlfCA", title: "Space Shuttle Era — Power Down", subject: "space race apollo program space shuttle NASA science documentary", year: 2012, media: { type: "video", url: "https://archive.org/download/NASAKennedy-o1WcJDMlfCA/NASAKennedy-o1WcJDMlfCA.mp4" } },
    { identifier: "endeavour_then_and_now", title: "Voyage of Endeavour — Then and Now", subject: "space race apollo program space shuttle NASA science documentary", year: 1992, media: { type: "video", url: "https://archive.org/download/endeavour_then_and_now/endeavour_then_and_now.mp4" } },
    { identifier: "HSF-mov-sts114fd1_fdh_a", title: "STS-114 — Space Shuttle Discovery", subject: "space race apollo program space shuttle NASA science documentary", year: 2005, media: { type: "video", url: "https://archive.org/download/HSF-mov-sts114fd1_fdh_a/sts114fd1_fdh_a.mp4" } },
    { identifier: "challenger-disaster-coverage-assorted-day-of-and-later-x-264-flac", title: "Challenger Disaster — Television Coverage", subject: "space race apollo program space shuttle NASA science documentary news", year: 1986, media: { type: "video", url: "https://archive.org/download/challenger-disaster-coverage-assorted-day-of-and-later-x-264-flac/Challenger%20Disaster%20Coverage%20-%20Assorted%20-%20Day-of%20and%20Later%20-%20x264%20%2B%20flac.mp4" } },
  ],
  "509": [
    { identifier: "barharborme00", title: "WeatherStar 3000 — Bar Harbor, Maine", subject: "weather channel weatherstar weatherstar 3000 local on the 8s forecast", year: 2025, media: { type: "video", url: "https://archive.org/download/barharborme00/1202.ia.mp4" } },
    { identifier: "amarillotx00", title: "WeatherStar XL — Amarillo, Texas", subject: "weather channel weatherstar weatherstar xl local on the 8s forecast", year: 2025, media: { type: "video", url: "https://archive.org/download/amarillotx00/30%20Days%20of%20Emulations%20Day%204-30%20Amarillo%20TX.ia.mp4" } },
    { identifier: "chicagoil00", title: "WeatherStar XL — Chicago, Illinois", subject: "weather channel weatherstar weatherstar xl local on the 8s forecast", year: 2025, media: { type: "video", url: "https://archive.org/download/chicagoil00/30%20Days%20of%20Emulations%20Day%205-30%20Chicago%20IL.ia.mp4" } },
    { identifier: "devilslakend00", title: "WeatherStar 4000 — Devils Lake, North Dakota", subject: "weather channel weatherstar weatherstar 4000 local on the 8s forecast", year: 2025, media: { type: "video", url: "https://archive.org/download/devilslakend00/30%20Days%20Of%20Emulations%20Day%203%2030%20Devils%20Lake%2C%20ND.ia.mp4" } },
    { identifier: "weather-star-xl-st-louis-mo-july-18-2025-made-with-clipchamp", title: "WeatherStar XL — St. Louis, Missouri", subject: "weather channel weatherstar weatherstar xl local on the 8s forecast", year: 2025, media: { type: "video", url: "https://archive.org/download/weather-star-xl-st-louis-mo-july-18-2025-made-with-clipchamp/WeatherStar%20XL%20-%20St%20Louis%20MO%20-%20July%2018%2C%202025%20-%20Made%20with%20Clipchamp.ia.mp4" } },
  ],
  "134": [
    { identifier: "monster-vision-national-lampoons-european-vacation", title: "MonsterVision — National Lampoon's European Vacation", subject: "joe bob briggs monstervision tnt monstervision hosted creature feature", year: 1999, media: { type: "video", url: "https://archive.org/download/monster-vision-national-lampoons-european-vacation/MonsterVision%20%28National%20Lampoons%20European%20Vacation%29%20.mp4" } },
    { identifier: "monster-vision-christine", title: "TNT MonsterVision — Christine", subject: "joe bob briggs monstervision tnt monstervision hosted creature feature", year: 1999, media: { type: "video", url: "https://archive.org/download/monster-vision-christine/MonsterVision%20%28Christine%29.mp4" } },
    { identifier: "godzilla-vs.-mothra-tnt-full", title: "Godzilla vs. Mothra — TNT MonsterVision", subject: "joe bob briggs monstervision tnt monstervision hosted creature feature", year: 1998, media: { type: "video", url: "https://archive.org/download/godzilla-vs.-mothra-tnt-full/Godzilla%20vs.%20Mothra%20TNT%20full.mp4" } },
    { identifier: "98-02-7-1-teen-wolf", title: "TNT MonsterVision — Teen Wolf", subject: "joe bob briggs monstervision tnt monstervision hosted creature feature", year: 1998, media: { type: "video", url: "https://archive.org/download/98-02-7-1-teen-wolf/98-02-7-1%20-%20Teen%20Wolf.ia.mp4" } },
    { identifier: "the-last-drive-in-with-joe-bob-briggs-halloween-hootenanny-2019", title: "The Last Drive-In — Halloween Hootenanny", subject: "joe bob briggs the last drive in hosted creature feature monstervision", year: 2019, media: { type: "video", url: "https://archive.org/download/the-last-drive-in-with-joe-bob-briggs-halloween-hootenanny-2019/The%20Last%20Drive-In%20with%20Joe%20Bob%20Briggs%20-%20Halloween%20Hootenanny%20%282019%29.mp4" } },
  ],
  "929": [
    { identifier: "urnes-de-l-opera", title: "Les Urnes de l'Opéra", subject: "enrico caruso early recording acoustic vocal 78rpm wax cylinder", year: 1907, media: { type: "audio", url: "https://archive.org/download/urnes-de-l-opera/Les%20Urnes%20De%20L%27Op%C3%A9ra.mp3" } },
    { identifier: "complete-caruso-vol.-3", title: "The Complete Caruso — Volume 3", subject: "enrico caruso early recording acoustic vocal 78rpm wax cylinder", year: 1906 },
    { identifier: "victor-17213-b-you-may-be-irish-murphy-but-i-think-that-youre-in-dutch", title: "You May Be Irish, Murphy", subject: "billy murray early recording acoustic vocal 78rpm wax cylinder", year: 1912 },
    { identifier: "if-the-man-in-the-moon-were-a-coon-1907-by-ada-jones", title: "If the Man in the Moon Were a Coon", subject: "ada jones early recording acoustic vocal 78rpm wax cylinder", year: 1907 },
    { identifier: "vesti-la-giuba", title: "Vesti la giubba", subject: "enrico caruso early recording acoustic vocal 78rpm wax cylinder opera", year: 1907 },
  ],
  "21": [
    { identifier: "youtube-FAKHLRPH0ag", title: "Kentucky v. Brett Hankison — Trial Day 4", subject: "court tv criminal trial true crime courtroom broadcast", year: 2022, media: { type: "video", url: "https://archive.org/download/youtube-FAKHLRPH0ag/FAKHLRPH0ag.mp4" } },
    { identifier: "youtube-QqPnXt5S3W4", title: "Tennessee v. Joseph Ray Daniels — Trial Day 6", subject: "court tv criminal trial true crime courtroom broadcast", year: 2021, media: { type: "video", url: "https://archive.org/download/youtube-QqPnXt5S3W4/QqPnXt5S3W4.mp4" } },
    { identifier: "youtube-mLWk6baoUy0", title: "Wisconsin v. James Prokopovitz — Trial", subject: "court tv criminal trial true crime courtroom broadcast", year: 2021, media: { type: "video", url: "https://archive.org/download/youtube-mLWk6baoUy0/mLWk6baoUy0.webm" } },
    { identifier: "youtube-yyIsREUIYdM", title: "Zodiac Killer — Books and Crooks", subject: "court tv criminal trial true crime courtroom broadcast", year: 2021, media: { type: "video", url: "https://archive.org/download/youtube-yyIsREUIYdM/yyIsREUIYdM.mp4" } },
    { identifier: "youtube-kUND_pOpk_s", title: "Korean Air Cargo 8509 — Black Box Down", subject: "court tv criminal trial true crime courtroom broadcast", year: 2022, media: { type: "video", url: "https://archive.org/download/youtube-kUND_pOpk_s/kUND_pOpk_s.mp4" } },
  ],
  "110": [
    { identifier: "kiss.-me.-stupid.-1964.720p.-blu-ray.x-264.-yify", title: "Kiss Me, Stupid", subject: "orson welles alfred hitchcock john ford howard hawks frank capra billy wilder classic film", year: 1964, media: { type: "video", url: "https://archive.org/download/kiss.-me.-stupid.-1964.720p.-blu-ray.x-264.-yify/Kiss.Me%2C.Stupid.1964.720p.BluRay.x264.YIFY.mp4" } },
    { identifier: "men-without-women-1930-480p", title: "Men Without Women", subject: "john ford classic film drama action cinema", year: 1930 },
    { identifier: "the-plough-and-the-stars-1936-480p", title: "The Plough and the Stars", subject: "john ford classic film drama cinema", year: 1936 },
    { identifier: "witness-for-the-prosecution-1957-720p.-web.-dl.-sujaidr-pimprg", title: "Witness for the Prosecution", subject: "billy wilder classic film drama mystery cinema", year: 1957 },
    { identifier: "the-world-moves-on-1934-1080p", title: "The World Moves On", subject: "john ford classic film drama cinema", year: 1934, media: { type: "video", url: "https://archive.org/download/the-world-moves-on-1934-1080p/The%20World%20Moves%20On%20%281934%29%20%5B1080p%5D.ia.mp4" } },
  ],
  "119": [
    { identifier: "zenigata-heiji-unibitoro", title: "Zenigata Heiji — Demon Fire Lantern", subject: "samurai samurai cinema chanbara jidaigeki japanese cinema japanese film", year: 1958, media: { type: "video", url: "https://archive.org/download/zenigata-heiji-unibitoro/zenigata%20Heiji%20unibitoro.mp4" } },
    { identifier: "zatoichis-vengeance", title: "Zatoichi's Vengeance", subject: "samurai samurai cinema chanbara jidaigeki japanese cinema japanese film", year: 1966, media: { type: "video", url: "https://archive.org/download/zatoichis-vengeance/Zatoichi%27s%20Vengeance.mp4" } },
    { identifier: "the-discarnates-1988_202409", title: "The Discarnates", subject: "samurai samurai cinema chanbara jidaigeki japanese cinema japanese film", year: 1988 },
    { identifier: "vts-02-1_202601", title: "Rubbers Lover", subject: "samurai samurai cinema chanbara jidaigeki japanese cinema japanese film", year: 1996, media: { type: "video", url: "https://archive.org/download/vts-02-1_202601/VTS_04_1.mp4" } },
    { identifier: "samurai-x_202607", title: "Samurai X", subject: "samurai samurai cinema chanbara jidaigeki japanese cinema japanese film", year: 1999 },
  ],
  "216": [
    { identifier: "OurCitie1951", title: "Our Cities Must Fight", subject: "civil defense civil defense film federal civil defense administration duck and cover cold war cinema", year: 1951, media: { type: "video", url: "https://archive.org/download/OurCitie1951/OurCitie1951_edit.mp4" } },
    { identifier: "YourChan1972", title: "Your Chance to Live — Earthwatch", subject: "civil defense civil defense film federal civil defense administration cold war cinema", year: 1972, media: { type: "video", url: "https://archive.org/download/YourChan1972/YourChan1972_edit.mp4" } },
    { identifier: "202866_One_Week_in_October", title: "One Week in October", subject: "civil defense civil defense film cold war cinema duck and cover", year: 1963, media: { type: "video", url: "https://archive.org/download/202866_One_Week_in_October/202866_One_Week_In_October_master.intros.mp4" } },
    { identifier: "FaceOfDisaster", title: "Face of Disaster", subject: "civil defense civil defense film federal civil defense administration cold war cinema", year: 1965, media: { type: "video", url: "https://archive.org/download/FaceOfDisaster/FaceOfDisaster.mp4" } },
    { identifier: "video-ts-5_202405", title: "Duck and Cover — Cold War Film", subject: "civil defense civil defense film federal civil defense administration duck and cover cold war cinema", year: 1952, media: { type: "video", url: "https://archive.org/download/video-ts-5_202405/VIDEO_TS-5.mp4" } },
  ],
  "224": [
    { identifier: "youtube-CMkjsHC9pkY", title: "Arizona Civil Rights Conference — Part 4", subject: "eyes on the prize pbs civil rights civil rights movement documentary", year: 2016, media: { type: "video", url: "https://archive.org/download/youtube-CMkjsHC9pkY/CMkjsHC9pkY.mp4" } },
    { identifier: "nov-24-2016-no-dapl-prayer-walk-to-turtle-island-on-cantapeta-creek", title: "NoDAPL Prayer Walk to Turtle Island", subject: "eyes on the prize pbs civil rights civil rights movement documentary", year: 2016, media: { type: "video", url: "https://archive.org/download/nov-24-2016-no-dapl-prayer-walk-to-turtle-island-on-cantapeta-creek/Nov%2024%202016%20NoDAPL%20Prayer%20Walk%20to%20Turtle%20Island%20on%20Cantapeta%20Creek.mp4" } },
    { identifier: "youtube-dCNmQbrrqYE", title: "What People Say About PJI", subject: "eyes on the prize pbs civil rights civil rights movement documentary", year: 2019, media: { type: "video", url: "https://archive.org/download/youtube-dCNmQbrrqYE/dCNmQbrrqYE.mp4" } },
    { identifier: "RT_20121103_020000", title: "RT — November 2, 2012", subject: "eyes on the prize pbs civil rights civil rights movement documentary", year: 2012, media: { type: "video", url: "https://archive.org/download/RT_20121103_020000/RT_20121103_020000.mp4" } },
  ],
  "926": [
    { identifier: "the-shadow-january-25-1948-mutual-the-house-that-death-built", title: "The Shadow — The House That Death Built", subject: "suspense radio old time radio the shadow the whistler inner sanctum radio drama", year: 1948, media: { type: "audio", url: "https://archive.org/download/the-shadow-january-25-1948-mutual-the-house-that-death-built/The%20Shadow%20-%20January%2025%2C%201948%20-%20Mutual%20-%20The%20House%20That%20Death%20Built.mp3" } },
    { identifier: "inner-sanctum-1942-episodes", title: "Inner Sanctum Mysteries — 1942 Episodes", subject: "suspense radio old time radio inner sanctum radio drama", year: 1942, media: { type: "audio", url: "https://archive.org/download/inner-sanctum-1942-episodes/Inner%20Sanctum%20%2042-01-18%20Dead%20Reckoning.mp3" } },
    { identifier: "ghost-of-radio-shadow-1938-02-13-the-house-of-horror", title: "The Shadow — The House of Horror", subject: "suspense radio old time radio the shadow radio drama noir mystery", year: 1938, media: { type: "audio", url: "https://archive.org/download/ghost-of-radio-shadow-1938-02-13-the-house-of-horror/1938-02-13%20-%20The%20House%20Of%20Horror.mp3" } },
    { identifier: "inner-sanctum-1952-episodes", title: "Inner Sanctum Mysteries — 1952 Episodes", subject: "suspense radio old time radio inner sanctum radio drama", year: 1952, media: { type: "audio", url: "https://archive.org/download/inner-sanctum-1952-episodes/Inner%20Sanctum%20%2052-08-17%20The%20Corpse%20Laughs%20Last.mp3" } },
    { identifier: "quick-as-a-flash-march-29-1947-mutual-guest-is-brett-morrison-the-shadow", title: "Quick as a Flash — Brett Morrison", subject: "suspense radio old time radio the shadow radio drama", year: 1947, media: { type: "audio", url: "https://archive.org/download/quick-as-a-flash-march-29-1947-mutual-guest-is-brett-morrison-the-shadow/Quick%20As%20A%20Flash%20-%20March%2029%2C%201947%20-%20Mutual%20-%20Guest%20Is%20Brett%20Morrison%20%28The%20Shadow%29.mp3" } },
  ],
  "575": [
    iaDirectRecovery("TheFrontPage4k::vns98bn_1_ahq12asdf.ia.mp4", "TheFrontPage4k", "vns98bn_1_ahq12asdf.ia.mp4", "The Front Page (1931) — 4K Restoration", "4k 4k restoration 1080p upscale restored film cinema", 1931),
    iaDirectRecovery("foreign-road-tale-1981-russian-1080p::(Foreign) Road Tale (1981) (Russian) 1080p.ia.mp4", "foreign-road-tale-1981-russian-1080p", "(Foreign) Road Tale (1981) (Russian) 1080p.ia.mp4", "Road Tale (1981) — AI SuperRes 1080p", "1080p upscale restoration restored world cinema film", 1981),
    iaDirectRecovery("the-super-vips-bozzetto::The SuperVips (Bozzetto).ia.mp4", "the-super-vips-bozzetto", "The SuperVips (Bozzetto).ia.mp4", "The SuperVips — 1080p HD Restoration", "1080p restoration restored classic animation film cinema", 1968),
    iaDirectRecovery("full-film-john-fords-my-darling-clementine-1946-hq-sound-picture-1080p::Full film, John Ford's My Darling Clementine  1946  HQ sound & picture (1080p).ia.mp4", "full-film-john-fords-my-darling-clementine-1946-hq-sound-picture-1080p", "Full film, John Ford's My Darling Clementine  1946  HQ sound & picture (1080p).ia.mp4", "My Darling Clementine (1946) — 1080p Restoration", "1080p restoration restored classic film cinema western", 1946),
    iaDirectRecovery("frosty-full-screen::frosty full screen.mp4", "frosty-full-screen", "frosty full screen.mp4", "Frosty the Snowman — Restored Full Screen", "restored 1080p restoration classic television film animation", 1970),
    iaDirectRecovery("894_Dying_and_Sleeping_Same_Thing__qTXrykh5uGk__1080p_Cinema_restored_v2::894 Dying and Sleeping Same Thing [qTXrykh5uGk]_1080p_Cinema.ia.mp4", "894_Dying_and_Sleeping_Same_Thing__qTXrykh5uGk__1080p_Cinema_restored_v2", "894 Dying and Sleeping Same Thing [qTXrykh5uGk]_1080p_Cinema.ia.mp4", "Dying and Sleeping Same Thing — 1080p Cinema Restoration", "1080p restoration restored film cinema", 2024),
    iaDirectRecovery("840_The_Eye_The_Sky_Revelation__HtXWLbbB8-I__1080p_Cinema_restored_v2::840 The Eye The Sky Revelation [HtXWLbbB8-I]_1080p_Cinema.ia.mp4", "840_The_Eye_The_Sky_Revelation__HtXWLbbB8-I__1080p_Cinema_restored_v2", "840 The Eye The Sky Revelation [HtXWLbbB8-I]_1080p_Cinema.ia.mp4", "The Eye, The Sky, Revelation — 1080p Restoration", "1080p restoration restored film cinema", 2024),
    iaDirectRecovery("844_Zodiac__Cancer__7oq2LIfwH_c__1080p_Cinema_restored_v2::844 Zodiac  Cancer [7oq2LIfwH_c]_1080p_Cinema.ia.mp4", "844_Zodiac__Cancer__7oq2LIfwH_c__1080p_Cinema_restored_v2", "844 Zodiac  Cancer [7oq2LIfwH_c]_1080p_Cinema.ia.mp4", "Zodiac Cancer — 1080p Cinema Restoration", "1080p restoration restored film cinema", 2024),
    iaDirectRecovery("855_Is_Old_Testament_God_Satan_Part_1__62QNG71djpA__1080p_Cinema_restored_v2::855 Is Old Testament God Satan Part 1 [62QNG71djpA]_1080p_Cinema.ia.mp4", "855_Is_Old_Testament_God_Satan_Part_1__62QNG71djpA__1080p_Cinema_restored_v2", "855 Is Old Testament God Satan Part 1 [62QNG71djpA]_1080p_Cinema.ia.mp4", "Is Old Testament God Satan — 1080p Restoration", "1080p restoration restored film cinema", 2024),
    iaDirectRecovery("910_Universe_Mind__B8FLtHupcME__1080p_Cinema_restored_v2::910 Universe Mind [B8FLtHupcME]_1080p_Cinema.ia.mp4", "910_Universe_Mind__B8FLtHupcME__1080p_Cinema_restored_v2", "910 Universe Mind [B8FLtHupcME]_1080p_Cinema.ia.mp4", "Universe Mind — 1080p Restoration", "1080p restoration restored film cinema", 2024),
    iaDirectRecovery("706_2012__The_Omega_Point__DflegKlT8H4__1080p_Cinema_restored_v2::706 2012  The Omega Point [DflegKlT8H4]_1080p_Cinema.ia.mp4", "706_2012__The_Omega_Point__DflegKlT8H4__1080p_Cinema_restored_v2", "706 2012  The Omega Point [DflegKlT8H4]_1080p_Cinema.ia.mp4", "The Omega Point — 1080p Cinema Restoration", "1080p restoration restored film cinema", 2012),
    iaDirectRecovery("737_Quantum_You_and_the_Universe__GZ--TgpD0PI__1080p_Cinema_restored_v2::737 Quantum You and the Universe [GZ--TgpD0PI]_1080p_Cinema.ia.mp4", "737_Quantum_You_and_the_Universe__GZ--TgpD0PI__1080p_Cinema_restored_v2", "737 Quantum You and the Universe [GZ--TgpD0PI]_1080p_Cinema.ia.mp4", "Quantum, You and the Universe — 1080p Restoration", "1080p restoration restored film cinema", 2012),
    iaDirectRecovery("760__The_Money_Changers__JJzfp0OyR8k__1080p_Cinema_restored_v2::760  The Money Changers [JJzfp0OyR8k]_1080p_Cinema.ia.mp4", "760__The_Money_Changers__JJzfp0OyR8k__1080p_Cinema_restored_v2", "760  The Money Changers [JJzfp0OyR8k]_1080p_Cinema.ia.mp4", "The Money Changers — 1080p Restoration", "1080p restoration restored film cinema", 2012),
    iaDirectRecovery("808_Who_Are_We_Really__athYDKrZiAM__1080p_Cinema_restored_v2::808 Who Are We Really [athYDKrZiAM]_1080p_Cinema.ia.mp4", "808_Who_Are_We_Really__athYDKrZiAM__1080p_Cinema_restored_v2", "808 Who Are We Really [athYDKrZiAM]_1080p_Cinema.ia.mp4", "Who Are We Really — 1080p Restoration", "1080p restoration restored film cinema", 2012),
    iaDirectRecovery("93_So_Long_Charles__A_Friend_Leaves__vEwIqzZDbUE__1080p_Cinema_restored_v2::93 So Long Charles, A Friend Leaves [vEwIqzZDbUE]_1080p_Cinema.ia.mp4", "93_So_Long_Charles__A_Friend_Leaves__vEwIqzZDbUE__1080p_Cinema_restored_v2", "93 So Long Charles, A Friend Leaves [vEwIqzZDbUE]_1080p_Cinema.ia.mp4", "So Long Charles, A Friend Leaves — 1080p Restoration", "1080p restoration restored film cinema", 2012),
    iaDirectRecovery("651__Meditation_and_watchers_of_light__S9IybP6FYE0__1080p_Cinema_restored_v2::651  Meditation and watchers of light [S9IybP6FYE0]_1080p_Cinema.ia.mp4", "651__Meditation_and_watchers_of_light__S9IybP6FYE0__1080p_Cinema_restored_v2", "651  Meditation and watchers of light [S9IybP6FYE0]_1080p_Cinema.ia.mp4", "Meditation and Watchers of Light — 1080p Restoration", "1080p restoration restored film cinema", 2012),
    iaDirectRecovery("699_Death_And_Transfiguration__SDNloTDPL6Q__1080p_Cinema_restored_v2::699 Death And Transfiguration [SDNloTDPL6Q]_1080p_Cinema.ia.mp4", "699_Death_And_Transfiguration__SDNloTDPL6Q__1080p_Cinema_restored_v2", "699 Death And Transfiguration [SDNloTDPL6Q]_1080p_Cinema.ia.mp4", "Death and Transfiguration — 1080p Restoration", "1080p restoration restored film cinema", 2012),
    iaDirectRecovery("71_Buddha_Learning_Realization__Somebody_wake_up_Henry___vgpyyHKhFvg__1080p_Cinema_restored_v2::71 Buddha Learning Realization. Somebody wake up Henry⧸ [vgpyyHKhFvg]_1080p_Cinema.ia.mp4", "71_Buddha_Learning_Realization__Somebody_wake_up_Henry___vgpyyHKhFvg__1080p_Cinema_restored_v2", "71 Buddha Learning Realization. Somebody wake up Henry⧸ [vgpyyHKhFvg]_1080p_Cinema.ia.mp4", "Buddha Learning Realization — 1080p Restoration", "1080p restoration restored film cinema", 2012),
    iaDirectRecovery("759_What_is_reality__Hg4S9mdgbJE__1080p_Cinema_restored_v2::759 What is reality [Hg4S9mdgbJE]_1080p_Cinema.ia.mp4", "759_What_is_reality__Hg4S9mdgbJE__1080p_Cinema_restored_v2", "759 What is reality [Hg4S9mdgbJE]_1080p_Cinema.ia.mp4", "What Is Reality — 1080p Restoration", "1080p restoration restored film cinema", 2012),
    iaDirectRecovery("57B_Buddha_Hunger__otOs5Mr2Mxc__1080p_Cinema_restored_v2::57B Buddha Hunger [otOs5Mr2Mxc]_1080p_Cinema.ia.mp4", "57B_Buddha_Hunger__otOs5Mr2Mxc__1080p_Cinema_restored_v2", "57B Buddha Hunger [otOs5Mr2Mxc]_1080p_Cinema.ia.mp4", "Buddha Hunger — 1080p Restoration", "1080p restoration restored film cinema", 2012),
  ],
});
/* v171 long-tail recovery bank. These are real Internet Archive identifiers
   collected from the affected lane queries, kept separate from the small
   emergency bank above so a repeated five-item fallback cannot become the
   channel's permanent catalog. They still pass the normal theme, deny,
   media-type, title, and metadata hydration gates before playback. */
/* Build a direct recovery record from a metadata-verified Archive file. The
   source identifier stays separate from the synthetic episode identifier so
   queue hydration and freshness can still treat each file as its own program
   without losing the real Archive download path. */
function iaDirectRecovery(identifier, sourceIdentifier, fileName, title, subject, year, type = "video") {
  const url = queueFileUrls(sourceIdentifier, {}, fileName)[0];
  return { identifier, sourceIdentifier, fileName, title, subject, year, media: { type, url } };
}

const IA_LONG_TAIL_EXPANSIONS = Object.freeze({
  /* v178 targeted first-frame recovery. These are already-observed IA files
     for the four lanes that remained empty after relay/cache repair. Keeping
     the media derivative on the seed avoids another metadata roundtrip during
     a cold tune; normal editorial discovery still owns later rotation depth. */
  "18": [
    { identifier: "emergency-call-glendale-fd-1991", title: "Emergency Call — Glendale FD (1991)", subject: "medical drama hospital drama medical series television", year: 1991, media: { type: "video", url: "https://archive.org/download/emergency-call-glendale-fd-1991/Emergency%20Call%20-%20Glendale%20FD%20-%201991.ia.mp4" } },
    { identifier: "doogie-s02e07-academia-nuts", title: "Doogie Howser, M.D. — Academia Nuts", subject: "medical drama hospital drama medical series television", year: 1990, media: { type: "video", url: "https://archive.org/download/doogie-howser-m.d.-season-2-of-4-xvid-avi/Doogie%20Howser%2C%20M.D.%20-%20S02E07%20-%20Academia%20Nuts.mp4" } },
    { identifier: "doogie-s02e04-cest-la-vinnie", title: "Doogie Howser, M.D. — C'est La Vinnie", subject: "medical drama hospital drama medical series television", year: 1990, media: { type: "video", url: "https://archive.org/download/doogie-howser-m.d.-season-2-of-4-xvid-avi/Doogie%20Howser%2C%20M.D.%20-%20S02E04%20-%20C%27est%20La%20Vinnie.mp4" } },
    { identifier: "doogie-s04e12-fishing-trips", title: "Doogie Howser, M.D. — The Mother of All Fishing Trips", subject: "medical drama hospital drama medical series television", year: 1992, media: { type: "video", url: "https://archive.org/download/doogie-howser-m.d.-season-4-of-4-xvid-avi/Doogie%20Howser%2C%20M.D.%20-%20S04E12%20-%20The%20Mother%20of%20All%20Fishing%20Trips.mp4" } },
    { identifier: "doogie-s04e05-patient-in-spite", title: "Doogie Howser, M.D. — The Patient in Spite of Himself", subject: "medical drama hospital drama medical series television", year: 1992, media: { type: "video", url: "https://archive.org/download/doogie-howser-m.d.-season-4-of-4-xvid-avi/Doogie%20Howser%2C%20M.D.%20-%20S04E05%20-%20The%20Patient%20in%20Spite%20of%20Himself.mp4" } }
  ],
  /* v2.2 focused cold-start repair for Saturday Morning. These are five
     distinct episode files from the observed Pingu season shelf, all on the
     Archive delivery host, while broader Saturday discovery continues in the
     background. */
  "158": [
    { identifier: "Pingu_Season_1to6::aaf-pingu.s01e01.pingu.is.introduced.dvdrip.xvid.mp4", title: "Pingu · Is Introduced", subject: "children's television kids television saturday morning cartoon animated series", year: 1990, media: { type: "video", url: "https://dn800203.us.archive.org/0/items/Pingu_Season_1to6/aaf-pingu.s01e01.pingu.is.introduced.dvdrip.xvid.mp4" } },
    { identifier: "Pingu_Season_1to6::aaf-pingu.s01e02.pingu.helps.to.deliver.the.mail.dvdrip.xvid.mp4", title: "Pingu · Helps to Deliver the Mail", subject: "children's television kids television saturday morning cartoon animated series", year: 1990, media: { type: "video", url: "https://dn800203.us.archive.org/0/items/Pingu_Season_1to6/aaf-pingu.s01e02.pingu.helps.to.deliver.the.mail.dvdrip.xvid.mp4" } },
    { identifier: "Pingu_Season_1to6::aaf-pingu.s01e03.pingu.helps.with.incubating.dvdrip.xvid.mp4", title: "Pingu · Helps with Incubating", subject: "children's television kids television saturday morning cartoon animated series", year: 1990, media: { type: "video", url: "https://dn800203.us.archive.org/0/items/Pingu_Season_1to6/aaf-pingu.s01e03.pingu.helps.with.incubating.dvdrip.xvid.mp4" } },
    { identifier: "Pingu_Season_1to6::aaf-pingu.s01e04.pingu.is.born.dvdrip.xvid.mp4", title: "Pingu · Is Born", subject: "children's television kids television saturday morning cartoon animated series", year: 1990, media: { type: "video", url: "https://dn800203.us.archive.org/0/items/Pingu_Season_1to6/aaf-pingu.s01e04.pingu.is.born.dvdrip.xvid.mp4" } },
    { identifier: "Pingu_Season_1to6::aaf-pingu.s01e05.pingu.goes.fishing.dvdrip.xvid.mp4", title: "Pingu · Goes Fishing", subject: "children's television kids television saturday morning cartoon animated series", year: 1990, media: { type: "video", url: "https://dn800203.us.archive.org/0/items/Pingu_Season_1to6/aaf-pingu.s01e05.pingu.goes.fishing.dvdrip.xvid.mp4" } },
    iaDirectRecovery("spider-mantheanimatedseries::01x01 Night of the Lizard.mp4", "spider-mantheanimatedseries", "01x01 Night of the Lizard.mp4", "Spider-Man: The Animated Series · Night of the Lizard", "children's television kids television saturday morning cartoon animated series", 1994),
    iaDirectRecovery("spider-mantheanimatedseries::01x02 The Spider Slayer.mp4", "spider-mantheanimatedseries", "01x02 The Spider Slayer.mp4", "Spider-Man: The Animated Series · The Spider Slayer", "children's television kids television saturday morning cartoon animated series", 1994),
    iaDirectRecovery("spider-mantheanimatedseries::01x03 Return of the Spider Slayers.mp4", "spider-mantheanimatedseries", "01x03 Return of the Spider Slayers.mp4", "Spider-Man: The Animated Series · Return of the Spider Slayers", "children's television kids television saturday morning cartoon animated series", 1994),
    iaDirectRecovery("spider-mantheanimatedseries::01x04 Doctor Octopus - Armed and Dangerous.mp4", "spider-mantheanimatedseries", "01x04 Doctor Octopus - Armed and Dangerous.mp4", "Spider-Man: The Animated Series · Doctor Octopus", "children's television kids television saturday morning cartoon animated series", 1994),
    iaDirectRecovery("DragonTalesTVSeries::Dragon.Tales.S01E01.To.Fly.with.Dragons.-.The.Forest.of.Darkness.WEBRip.AAC2.0.x264-SA89.mp4", "DragonTalesTVSeries", "Dragon.Tales.S01E01.To.Fly.with.Dragons.-.The.Forest.of.Darkness.WEBRip.AAC2.0.x264-SA89.mp4", "Dragon Tales · To Fly with Dragons", "children's television kids television saturday morning cartoon animated series", 1999),
    iaDirectRecovery("DragonTalesTVSeries::Dragon.Tales.S01E02.To.Kingdom.Come.-.Goodbye.Little.Caterpoozle.WEBRip.AAC2.0.x264-SA89.mp4", "DragonTalesTVSeries", "Dragon.Tales.S01E02.To.Kingdom.Come.-.Goodbye.Little.Caterpoozle.WEBRip.AAC2.0.x264-SA89.mp4", "Dragon Tales · To Kingdom Come", "children's television kids television saturday morning cartoon animated series", 1999),
    iaDirectRecovery("DragonTalesTVSeries::Dragon.Tales.S01E03.Knot.a.Problem.-.Ord's.Unhappy.Birthday.WEBRip.AAC2.0.x264-SA89.mp4", "DragonTalesTVSeries", "Dragon.Tales.S01E03.Knot.a.Problem.-.Ord's.Unhappy.Birthday.WEBRip.AAC2.0.x264-SA89.mp4", "Dragon Tales · Knot a Problem", "children's television kids television saturday morning cartoon animated series", 1999),
    iaDirectRecovery("DragonTalesTVSeries::Dragon.Tales.S01E04.Tails.You.Lose.-.Calling.Dr.Zak.WEBRip.AAC2.0.x264-SA89.mp4", "DragonTalesTVSeries", "Dragon.Tales.S01E04.Tails.You.Lose.-.Calling.Dr.Zak.WEBRip.AAC2.0.x264-SA89.mp4", "Dragon Tales · Tails You Lose", "children's television kids television saturday morning cartoon animated series", 1999),
    iaDirectRecovery("powerpuff-girls-complete-series::Powerpuff Girls - 01,01 - Insect Inside - Powerpuff Bluff.mp4", "powerpuff-girls-complete-series", "Powerpuff Girls - 01,01 - Insect Inside - Powerpuff Bluff.mp4", "The Powerpuff Girls · Insect Inside", "children's television kids television saturday morning cartoon animated series", 1998),
    iaDirectRecovery("powerpuff-girls-complete-series::Powerpuff Girls - 01,02 - Monkey See, Doggie Do - Mommy Fearest.mp4", "powerpuff-girls-complete-series", "Powerpuff Girls - 01,02 - Monkey See, Doggie Do - Mommy Fearest.mp4", "The Powerpuff Girls · Monkey See, Doggie Do", "children's television kids television saturday morning cartoon animated series", 1998),
    iaDirectRecovery("pokemon-indigo-league-season-1-1998::[AnimeRG] Pokémon - 0001 - Pokémon, I Choose You [Di [480p] [x265] [pseudo].mp4", "pokemon-indigo-league-season-1-1998", "[AnimeRG] Pokémon - 0001 - Pokémon, I Choose You [Di [480p] [x265] [pseudo].mp4", "Pokémon · I Choose You", "children's television kids television saturday morning cartoon animated series", 1998),
    iaDirectRecovery("pokemon-indigo-league-season-1-1998::[AnimeRG] Pokémon - 0002 - Pokémon Emergency [480p] [x265] [pseudo].mp4", "pokemon-indigo-league-season-1-1998", "[AnimeRG] Pokémon - 0002 - Pokémon Emergency [480p] [x265] [pseudo].mp4", "Pokémon · Pokémon Emergency", "children's television kids television saturday morning cartoon animated series", 1998)
  ],
  "704": [
    iaDirectRecovery("HowTheGrinchStoleChristmas_201812::How the Grinch Stole Christmas.mp4", "HowTheGrinchStoleChristmas_201812", "How the Grinch Stole Christmas.mp4", "How the Grinch Stole Christmas", "christmas cartoon christmas animation animated christmas special holiday cartoon", 1966),
    iaDirectRecovery("RudolphTheRed-nosedReindeer1948::RudolphTheRed-nosedReindeer1948_512kb.mp4", "RudolphTheRed-nosedReindeer1948", "RudolphTheRed-nosedReindeer1948_512kb.mp4", "Rudolph the Red-Nosed Reindeer", "christmas cartoon christmas animation animated christmas special holiday cartoon", 1948),
    iaDirectRecovery("MickeysChristmasCarol1983_201511::[ www.UsaBit.com ] - Mickeys Christmas Carol (1983) BluRay 1080p x264 Ganool.mp4", "MickeysChristmasCarol1983_201511", "[ www.UsaBit.com ] - Mickeys Christmas Carol (1983) BluRay 1080p x264 Ganool.mp4", "Mickey's Christmas Carol", "christmas cartoon christmas animation animated christmas special holiday cartoon", 1983),
    iaDirectRecovery("a-charlie-brown-christmas_202312::A Charlie Brown Christmas.mp4", "a-charlie-brown-christmas_202312", "A Charlie Brown Christmas.mp4", "A Charlie Brown Christmas", "christmas cartoon christmas animation animated christmas special holiday cartoon", 1965),
    iaDirectRecovery("twas-the-night-before-christmas-1974-full-movie-freedownloadvideo.net::twas-the-night-before-christmas-1974-full-movie-freedownloadvideo.net.mp4", "twas-the-night-before-christmas-1974-full-movie-freedownloadvideo.net", "twas-the-night-before-christmas-1974-full-movie-freedownloadvideo.net.mp4", "'Twas the Night Before Christmas", "christmas cartoon christmas animation animated christmas special holiday cartoon", 1974),
    iaDirectRecovery("Mr.MagoosChristmasCarol1962::Mr. Magoo's Christmas Carol (1962).mp4", "Mr.MagoosChristmasCarol1962", "Mr. Magoo's Christmas Carol (1962).mp4", "Mr. Magoo's Christmas Carol", "christmas cartoon christmas animation animated christmas special holiday cartoon", 1962),
    iaDirectRecovery("a-garfield-christmas-1987::A Garfield Christmas (1987) HD_x264_001.mp4", "a-garfield-christmas-1987", "A Garfield Christmas (1987) HD_x264_001.mp4", "A Garfield Christmas", "christmas cartoon christmas animation animated christmas special holiday cartoon", 1987),
    iaDirectRecovery("christmas-comes-but-once-a-year-1936_202501::Christmas Comes But Once a Year (1936).mp4", "christmas-comes-but-once-a-year-1936_202501", "Christmas Comes But Once a Year (1936).mp4", "Christmas Comes But Once a Year", "christmas cartoon christmas animation animated christmas special holiday cartoon", 1936)
  ],
  "705": [
    iaDirectRecovery("halloween-cartoon-collection_20231022::01-1929 - Disney -The Skeleton Dance.ia.mp4", "halloween-cartoon-collection_20231022", "01-1929 - Disney -The Skeleton Dance.ia.mp4", "The Skeleton Dance", "halloween cartoon halloween animation animated halloween special spooky cartoon monster cartoon", 1929),
    iaDirectRecovery("halloween-cartoon-collection_20231022::02-1929 - Disney - Hell's Bells.ia.mp4", "halloween-cartoon-collection_20231022", "02-1929 - Disney - Hell's Bells.ia.mp4", "Hell's Bells", "halloween cartoon halloween animation animated halloween special spooky cartoon monster cartoon", 1929),
    iaDirectRecovery("halloween-cartoon-collection_20231022::03-1929 - Mickey Mouse -The Haunted House.mp4", "halloween-cartoon-collection_20231022", "03-1929 - Mickey Mouse -The Haunted House.mp4", "Mickey Mouse · The Haunted House", "halloween cartoon halloween animation animated halloween special spooky cartoon monster cartoon", 1929),
    iaDirectRecovery("halloween-cartoon-collection_20231022::08-1934 - Popeye the Sailor - Shiver Me Timbers.mp4", "halloween-cartoon-collection_20231022", "08-1934 - Popeye the Sailor - Shiver Me Timbers.mp4", "Popeye · Shiver Me Timbers", "halloween cartoon halloween animation animated halloween special spooky cartoon monster cartoon", 1934),
    iaDirectRecovery("1978-witchs-night-out-a-halloween-cartoon-movie::1978 - Witch's Night Out (a Halloween cartoon movie).mp4", "1978-witchs-night-out-a-halloween-cartoon-movie", "1978 - Witch's Night Out (a Halloween cartoon movie).mp4", "Witch's Night Out", "halloween cartoon halloween animation animated halloween special spooky cartoon monster cartoon", 1978),
    iaDirectRecovery("the.-halloween.-tree.-1993::The.Halloween.Tree.1993.ia.mp4", "the.-halloween.-tree.-1993", "The.Halloween.Tree.1993.ia.mp4", "The Halloween Tree", "halloween cartoon halloween animation animated halloween special spooky cartoon monster cartoon", 1993),
    iaDirectRecovery("the-real-ghostbusters-the-halloween-door::The Real Ghostbusters - The Halloween Door.mp4", "the-real-ghostbusters-the-halloween-door", "The Real Ghostbusters - The Halloween Door.mp4", "The Real Ghostbusters · The Halloween Door", "halloween cartoon halloween animation animated halloween special spooky cartoon monster cartoon", 1988),
    iaDirectRecovery("caspers-halloween-special::getvid.mp4", "caspers-halloween-special", "getvid.mp4", "Casper's Halloween Special", "halloween cartoon halloween animation animated halloween special spooky cartoon monster cartoon", 2021),
    iaDirectRecovery("tom-and-jerry-halloween-special::TOM AND JERRY HALLOWEEN SPECIAL.mp4", "tom-and-jerry-halloween-special", "TOM AND JERRY HALLOWEEN SPECIAL.mp4", "Tom and Jerry Halloween Special", "halloween cartoon halloween animation animated halloween special spooky cartoon monster cartoon", 1987)
  ],
  "706": [
    iaDirectRecovery("garfieldsthanksgiving::Garfield's Thanksgiving.mp4", "garfieldsthanksgiving", "Garfield's Thanksgiving.mp4", "Garfield's Thanksgiving", "thanksgiving cartoon thanksgiving animation animated thanksgiving special turkey cartoon harvest cartoon family holiday cartoon", 1989),
    iaDirectRecovery("veggietales-madame-blueberry-1998-fanmade-vhs-thanksgiving-special_202511::Veggietales Madame Blueberry 1998 Fanmade VHS (Thanksgiving Special).ia.mp4", "veggietales-madame-blueberry-1998-fanmade-vhs-thanksgiving-special_202511", "Veggietales Madame Blueberry 1998 Fanmade VHS (Thanksgiving Special).ia.mp4", "VeggieTales · Madame Blueberry", "thanksgiving cartoon thanksgiving animation animated thanksgiving special turkey cartoon harvest cartoon family holiday cartoon", 1998),
    iaDirectRecovery("a-winnie-the-pooh-thanksgiving-special::A Winnie the Pooh Thanksgiving (HD).mp4", "a-winnie-the-pooh-thanksgiving-special", "A Winnie the Pooh Thanksgiving (HD).mp4", "A Winnie the Pooh Thanksgiving", "thanksgiving cartoon thanksgiving animation animated thanksgiving special turkey cartoon harvest cartoon family holiday cartoon", 1991),
    iaDirectRecovery("he-thanksgiving-that-almost-wasnt-1972::1972 The Thanksgiving That Almost Wasn't.mp4", "he-thanksgiving-that-almost-wasnt-1972", "1972 The Thanksgiving That Almost Wasn't.mp4", "The Thanksgiving That Almost Wasn't", "thanksgiving cartoon thanksgiving animation animated thanksgiving special turkey cartoon harvest cartoon family holiday cartoon", 1972),
    iaDirectRecovery("jerky-turkey-mgm-1945::Jerky Turkey (1945).mp4", "jerky-turkey-mgm-1945", "Jerky Turkey (1945).mp4", "Jerky Turkey", "thanksgiving cartoon thanksgiving animation animated thanksgiving special turkey cartoon harvest cartoon family holiday cartoon", 1945),
    iaDirectRecovery("jims.thanksgiving.marathon::1944 - Tom-Turk-And-Daffy.mp4", "jims.thanksgiving.marathon", "1944 - Tom-Turk-And-Daffy.mp4", "Tom Turk and Daffy", "thanksgiving cartoon thanksgiving animation animated thanksgiving special turkey cartoon harvest cartoon family holiday cartoon", 1944),
    iaDirectRecovery("jims.thanksgiving.marathon::1949 - Holiday for Drumsticks.mp4", "jims.thanksgiving.marathon", "1949 - Holiday for Drumsticks.mp4", "Holiday for Drumsticks", "thanksgiving cartoon thanksgiving animation animated thanksgiving special turkey cartoon harvest cartoon family holiday cartoon", 1949),
    iaDirectRecovery("jims.thanksgiving.marathon::1970 - The Thanksgiving That Almost Wasn't.mp4", "jims.thanksgiving.marathon", "1970 - The Thanksgiving That Almost Wasn't.mp4", "The Thanksgiving That Almost Wasn't · 1970", "thanksgiving cartoon thanksgiving animation animated thanksgiving special turkey cartoon harvest cartoon family holiday cartoon", 1970),
    iaDirectRecovery("jims.thanksgiving.marathon::1973 - A Charlie Brown Thanksgiving.mp4", "jims.thanksgiving.marathon", "1973 - A Charlie Brown Thanksgiving.mp4", "A Charlie Brown Thanksgiving", "thanksgiving cartoon thanksgiving animation animated thanksgiving special turkey cartoon harvest cartoon family holiday cartoon", 1973),
    iaDirectRecovery("jims.thanksgiving.marathon::1979 - Intergalactic Thanksgiving -or- Please Don't Eat the Planet.ia.mp4", "jims.thanksgiving.marathon", "1979 - Intergalactic Thanksgiving -or- Please Don't Eat the Planet.ia.mp4", "Intergalactic Thanksgiving", "thanksgiving cartoon thanksgiving animation animated thanksgiving special turkey cartoon harvest cartoon family holiday cartoon", 1979)
  ],
  "209": [
    { identifier: "NasaDestinationTomorrow-Dt12-FlightPioneers", title: "NASA Destination Tomorrow — Flight Pioneers", subject: "aviation aircraft airplane flight aerospace documentary", year: 2004, media: { type: "video", url: "https://archive.org/download/NasaDestinationTomorrow-Dt12-FlightPioneers/NASADT12-FlightPioneers.mp4" } },
    { identifier: "NasaDestinationTomorrow-Dt9-QuietAircraftTechnology", title: "NASA Destination Tomorrow — Quiet Aircraft Technology", subject: "aviation aircraft airplane flight aerospace documentary", year: 2004, media: { type: "video", url: "https://archive.org/download/NasaDestinationTomorrow-Dt9-QuietAircraftTechnology/NASADT9-QuietAircraftTechnology.mp4" } },
    { identifier: "KayStins1917", title: "Kay Stinson, Aviator (1917)", subject: "aviation aircraft airplane pilot flight history film", year: 1917, media: { type: "video", url: "https://archive.org/download/KayStins1917/KayStins1917.mp4" } },
    { identifier: "Helicopt1953", title: "The Helicopter (1953)", subject: "aviation aircraft airplane helicopter flight engineering film", year: 1953, media: { type: "video", url: "https://archive.org/download/Helicopt1953/Helicopt1953.mp4" } },
    { identifier: "MissionA1942", title: "Mission Accomplished — The Story of the Flying Fortress", subject: "aviation aircraft airplane bomber flight history film", year: 1942, media: { type: "video", url: "https://archive.org/download/MissionA1942/MissionA1942.mp4" } }
  ],
  "235": [
    { identifier: "colorado-rmnp-1987-interlaced", title: "Rocky Mountain National Park Tour (1987)", subject: "roadside travel road trip tourism film highway travel", year: 1987, media: { type: "video", url: "https://archive.org/download/colorado-rmnp-1987-interlaced/Colorado-RMNP-1987-deinterlaced.mp4" } },
    { identifier: "rough_road_to_panama", title: "Rough Road to Panama", subject: "roadside travel road trip highway travel tourism film", year: 1947, media: { type: "video", url: "https://archive.org/download/rough_road_to_panama/rough_road_to_panama_512kb.mp4" } },
    { identifier: "kentucky-travel-film-1965", title: "Kentucky Travel Film (1965)", subject: "roadside travel road trip tourism film highway travel", year: 1965, media: { type: "video", url: "https://archive.org/download/kentucky-travel-film-1965/Kentucky%20Travel%20Film%20%281965%29.mp4" } },
    { identifier: "capsdf_000033", title: "Gold Rush Trip — Vacation Film (1961)", subject: "roadside travel road trip tourism film vacation highway travel", year: 1961, media: { type: "video", url: "https://archive.org/download/capsdf_000033/capsdf_000033_access.mp4" } },
    { identifier: "capsdf_000028", title: "Murphys & Angels Camp Road Trip (1973)", subject: "roadside travel road trip tourism film vacation highway travel", year: 1973, media: { type: "video", url: "https://archive.org/download/capsdf_000028/capsdf_000028_access.mp4" } }
  ],
  "507": [
    { identifier: "all-aboard-the-potomac-eagle_202603", title: "All Aboard the Potomac Eagle — A Scenic Train Ride", subject: "slow tv long form train journey scenic ride ambient travel video", year: 2005, media: { type: "video", url: "https://archive.org/download/all-aboard-the-potomac-eagle_202603/A1_t00.mp4" } },
    { identifier: "Norway_Train_Ride", title: "Norway Train Ride", subject: "slow tv long form train journey scenic ride ambient travel video", year: 2015, media: { type: "video", url: "https://archive.org/download/Norway_Train_Ride/Norway_Train_Ride.mp4" } },
    { identifier: "New_Zealand_Christchurch-Greymouth_-_Cab_Ride_2012", title: "New Zealand Christchurch–Greymouth Cab Ride (2012)", subject: "slow tv long form train journey cab ride scenic ride ambient travel video", year: 2012, media: { type: "video", url: "https://archive.org/download/New_Zealand_Christchurch-Greymouth_-_Cab_Ride_2012/New%20Zealand%20Christchurch-Greymouth%20-%20Cab%20Ride%20%282012%29.mp4" } },
    { identifier: "cab-ride-along-the-santa-fe-trail-part-1", title: "Cab Ride Along the Santa Fe Trail — Part 1", subject: "slow tv long form train journey cab ride scenic ride ambient travel video", year: 1998, media: { type: "video", url: "https://archive.org/download/cab-ride-along-the-santa-fe-trail-part-1/Cab%20Ride%20Along%20The%20Santa%20Fe%20Trail%20Part%201.mp4" } },
    { identifier: "train-journey-across-the-usa-bb-glj-b-4ik-ts", title: "Train Journey Across the USA", subject: "slow tv long form train journey scenic ride ambient travel video", year: 2015, media: { type: "video", url: "https://archive.org/download/train-journey-across-the-usa-bb-glj-b-4ik-ts/Train%20Journey%20across%20the%20USA%20%5BBbGljB4ikTs%5D.mp4" } },
    { identifier: "cab-ride-on-ns-947-ols-special-8-17-11", title: "Cab Ride on NS 947 OLS Special", subject: "slow tv long form train journey cab ride scenic ride ambient travel video", year: 2011, media: { type: "video", url: "https://archive.org/download/cab-ride-on-ns-947-ols-special-8-17-11/Cab%20Ride%20on%20NS%20947%20OLS%20Special%20-%208_17_11.mp4" } },
    { identifier: "cabride-on-the-nebraska-zephyr", title: "Cab Ride on the Nebraska Zephyr", subject: "slow tv long form train journey cab ride scenic ride ambient travel video", year: 2010, media: { type: "video", url: "https://archive.org/download/cabride-on-the-nebraska-zephyr/Cabride%20on%20the%20Nebraska%20Zephyr.mp4" } },
    { identifier: "cajon-pass-cab-ride-dvd-rev-title-1", title: "Cajon Pass Cab Ride", subject: "slow tv long form train journey cab ride scenic ride ambient travel video", year: 2010, media: { type: "video", url: "https://archive.org/download/cajon-pass-cab-ride-dvd-rev-title-1/CAJON_PASS_CAB_RIDE_DVD_REV_Title_1.ia.mp4" } },
    { identifier: "pacific-surfliner-head-end-trip", title: "Pacific Surfliner — Head-End Trip", subject: "slow tv long form train journey scenic ride ambient travel video", year: 2012, media: { type: "video", url: "https://archive.org/download/pacific-surfliner-head-end-trip/pacific_surfliner.ia.mp4" } },
    { identifier: "videoplayback-2021-09-01-t-190131.611", title: "BN 5383 Cab Ride at the Illinois Railway Museum", subject: "slow tv long form train journey cab ride scenic ride ambient travel video", year: 2021, media: { type: "video", url: "https://archive.org/download/videoplayback-2021-09-01-t-190131.611/videoplayback%20-%202021-09-01T190131.611.mp4" } },
    { identifier: "youtube-4DcMcAHrURw", title: "Samedan–Zernez–Landquart Freight Cab Ride", subject: "slow tv long form train journey cab ride scenic ride ambient travel video", year: 2021, media: { type: "video", url: "https://archive.org/download/youtube-4DcMcAHrURw/4DcMcAHrURw.mp4" } },
    { identifier: "dreamscape-train-journey-3-hours-asmr", title: "Dreamscape Train Journey — 3 Hours", subject: "slow tv long form train journey scenic ride ambient travel video", year: 2020, media: { type: "video", url: "https://archive.org/download/dreamscape-train-journey-3-hours-asmr/Dreamscape%20Train%20Journey%203%20HOURS%20ASMR.ia.mp4" } },
    { identifier: "youtube-czTQMB55hkY", title: "Netherlands Scenic Train Drive", subject: "slow tv long form train journey scenic ride ambient travel video", year: 2023, media: { type: "video", url: "https://archive.org/download/youtube-czTQMB55hkY/czTQMB55hkY.mp4" } },
    { identifier: "youtube-fVJc0BRmZ28", title: "Overnight on the Arctic Circle Sleeper Train", subject: "slow tv long form train journey scenic ride ambient travel video", year: 2022, media: { type: "video", url: "https://archive.org/download/youtube-fVJc0BRmZ28/fVJc0BRmZ28.mp4" } },
    { identifier: "youtube-NN4TqIN1qYQ", title: "Osceola & St. Croix Valley Railway Cab Ride", subject: "slow tv long form train journey cab ride scenic ride ambient travel video", year: 2022, media: { type: "video", url: "https://archive.org/download/youtube-NN4TqIN1qYQ/NN4TqIN1qYQ.mp4" } },
    { identifier: "youtube-AWmqIIOWMiM", title: "Netherlands Driver-View Train Journey", subject: "slow tv long form train journey cab ride scenic ride ambient travel video", year: 2024, media: { type: "video", url: "https://archive.org/download/youtube-AWmqIIOWMiM/AWmqIIOWMiM.mp4" } }
  ],
  "72": [
    { identifier: "USTA_Pro_Circuit_Men_s_Futures_Tennis_Tournament_2017_-_Palm_Coast", title: "USTA Pro Circuit — Futures Tennis Tournament", subject: "tennis racquet sports tournament", year: 2017 },
    { identifier: "bctvpa-PIAA_State_Championships_5-20-19", title: "PIAA State Tennis Championships", subject: "tennis racquet sports championship", year: 2019 },
    { identifier: "Lynn_MA_Sportscast_Season_2_Episode_8_5_13_2015", title: "Lynn MA Sportscast — Tennis", subject: "tennis racquet sports sports broadcast", year: 2015 },
    { identifier: "du-pont-wtt-smash-hits-tennis-1999", title: "DuPont WTT Smash Hits Tennis", subject: "tennis racquet sports tournament match", year: 1999 },
    { identifier: "Teen_Sports_Chatter_4th_Show", title: "Teen Sports Chatter — Episode 4", subject: "tennis racquet sports sports television", year: 2015 },
    { identifier: "Teen_Sports_Chatter_Episode_7", title: "Teen Sports Chatter — Episode 7", subject: "tennis racquet sports sports television", year: 2015 },
    { identifier: "Teen_Sports_Chatter_Episode_8", title: "Teen Sports Chatter — Episode 8", subject: "tennis racquet sports sports television", year: 2015 },
    { identifier: "ttval-TSN_Review_week_of_4_11_16", title: "TSN Tennis Review — April 2016", subject: "tennis racquet sports sports review", year: 2016 },
  ],
  "73": [
    { identifier: "tv-saitama-urawa-keiba-chukei", title: "Urawa Keiba — Horse Racing Broadcast", subject: "horse racing equestrian thoroughbred sports", year: 2024 },
    { identifier: "americanpharoah1", title: "American Pharoah — Arrival at Shizunai", subject: "horse racing thoroughbred equestrian sports", year: 2025 },
    { identifier: "one-with-everything-horse-racing-poetry-to-doug-rhodehammel-art-by-joe-pasquale-", title: "Horse Racing at Stardust Video and Film", subject: "horse racing equestrian sports culture", year: 2024 },
  ],
  "74": [
    { identifier: "Powdercats_profile", title: "Powdercats Profile", subject: "winter sports skiing snowboarding winter games", year: 2011 },
    { identifier: "prkcitut-Weekend_Show_Park_City_Television_Powder_Mountain_Segment_1", title: "Weekend Show — Powder Mountain", subject: "winter sports skiing snowboarding winter games", year: 2017 },
    { identifier: "valdezhelicamps.com", title: "Heliskiing in Valdez, Alaska", subject: "winter sports skiing alpine winter games", year: 1999 },
    { identifier: "StLouisSki", title: "St. Louis Ski", subject: "winter sports skiing winter games", year: 2005 },
    { identifier: "Silvertongetsitdone", title: "42 Fresh on Colorado", subject: "winter sports skiing snowboarding winter games", year: 2007 },
    { identifier: "StephenFlip", title: "Stephen Trick Skiing", subject: "winter sports skiing winter games", year: 2005 },
    { identifier: "skiSunday_1987WorldChampionships", title: "Ski Sunday — 1987 World Championships", subject: "winter sports skiing winter games sports broadcast", year: 1987 },
    { identifier: "cammlsmh_000061", title: "Skiing at Mammoth and Hot Creek", subject: "winter sports skiing winter games", year: 1959 },
  ],
  "75": [
    { identifier: "youtube-F8mWrEDUrgs", title: "WYC Peanut Regatta — October 2019", subject: "sailing regatta water sports", year: 2019 },
    { identifier: "youtube-G7qFvL5A9U4", title: "WYC Peanut Regatta — May 2019", subject: "sailing regatta water sports", year: 2019 },
    { identifier: "youtube--_MDjbRl6aU", title: "Noxontown Regatta — Girls Varsity", subject: "rowing regatta water sports", year: 2014 },
    { identifier: "youtube-3QyyKJaiD2Q", title: "Noxontown Regatta — Girls Varsity 8", subject: "rowing regatta water sports", year: 2014 },
    { identifier: "youtube-B8uXEA9qfBk", title: "Walter Mess Regatta — Men's V8", subject: "rowing regatta water sports", year: 2019 },
    { identifier: "youtube-KOx3lmwL0ps", title: "WYC Peanut Regatta — Galveston Bay", subject: "sailing regatta water sports", year: 2019 },
    { identifier: "youtube-IRIldROcDjM", title: "Noxontown Regatta — Girls Varsity 8", subject: "rowing regatta water sports", year: 2013 },
    { identifier: "youtube-4nSPQEO8z3I", title: "UW vs WSU Regatta — Women's Varsity 8", subject: "rowing regatta water sports", year: 2010 },
    { identifier: "ualrar-UA_Little_Rock_2022_Cardboard_Boat_Regatta", title: "UA Little Rock Cardboard Boat Regatta", subject: "boat regatta water sports", year: 2022 },
    { identifier: "Xcorps64NoodSailingHD2", title: "NOOD Sailing — Full Show", subject: "sailing regatta water sports", year: 2016 },
  ],
  "104": [
    { identifier: "htvtx-Press_Pass_to_the_City_-_Two_Stars_of_Motown_-_The_Musical", title: "Two Stars of Motown — The Musical", subject: "music film concert performance live music", year: 2015 },
    { identifier: "tacmmi-Picnic_at_the_Opera_episode_5_season_3", title: "Picnic at the Opera — Episode 5", subject: "music film opera concert performance", year: 2015 },
    { identifier: "The_Infamous_Stringdusters_Time_to_Part_Live_at_KDHX_3_17_14", title: "The Infamous Stringdusters — Live", subject: "music film concert performance live music", year: 2014 },
    { identifier: "The_Whigs_In_The_Dark_Live_at_KDHX_4_22_10_HD", title: "The Whigs — In the Dark Live", subject: "music film concert performance live music", year: 2010 },
    { identifier: "wrokmi-Ferndale_HS_Marching_Band_at_the_2012_Holiday_Magic_Parade.", title: "Ferndale High Marching Band — Holiday Parade", subject: "music film marching band live performance", year: 2012 },
    { identifier: "youtube-4bf1NwOj4NQ", title: "Dangerous Toys — Live in Austin", subject: "music film concert performance live music", year: 2015 },
    { identifier: "youtube-i7XC7di2Ck0", title: "Crystal Shit — Live in San Antonio", subject: "music film concert performance live music", year: 2015 },
    { identifier: "youtube-I_4IiJ79bgQ", title: "Johnny Goudie — Live in Austin", subject: "music film concert performance live music", year: 2014 },
    { identifier: "youtube-QI-AtDRaK-k", title: "Burn Ban — Live in Austin", subject: "music film concert performance live music", year: 2013 },
  ],
  "109": [
    { identifier: "flash_gordon9", title: "Flash Gordon — Chapter 9", subject: "action serial cliffhanger adventure movie", year: 1940 },
    { identifier: "spiders-web", title: "The Spider's Web", subject: "action serial cliffhanger adventure movie", year: 1938 },
    { identifier: "mandrake-the-magician-serial", title: "Mandrake the Magician", subject: "action serial cliffhanger adventure movie", year: 1939 },
    { identifier: "phantom-rider-1936", title: "The Phantom Rider", subject: "action serial cliffhanger western adventure movie", year: 1936 },
    { identifier: "the-phantom-rocket-1933", title: "The Phantom Rocket", subject: "action serial cliffhanger science fiction adventure movie", year: 1933 },
    { identifier: "ghost-of-zorro", title: "Ghost of Zorro", subject: "action serial cliffhanger western adventure movie", year: 1949 },
    { identifier: "flash-gordon-1936", title: "Flash Gordon", subject: "action serial cliffhanger science fiction adventure movie", year: 1936 },
    { identifier: "planet_outlaws_ipod", title: "Planet Outlaws", subject: "action serial science fiction adventure movie", year: 1953 },
    { identifier: "zorro_rides_again_ep6", title: "Zorro Rides Again — Chapter 6", subject: "action serial cliffhanger western adventure movie", year: 1937 },
    { identifier: "panther-girl-of-the-kongo", title: "Panther Girl of the Kongo", subject: "action serial cliffhanger adventure movie", year: 1955 },
    { identifier: "great-adventures-of-wild-bill-hickok", title: "Great Adventures of Wild Bill Hickok", subject: "action serial cliffhanger western adventure movie", year: 1938 },
    { identifier: "red-barry", title: "Red Barry", subject: "action serial cliffhanger adventure movie", year: 1938 },
  ],
  "116": [
    { identifier: "the-soul-of-black-charley-1080p", title: "The Soul of Black Charley", subject: "blaxploitation black action film crime film", year: 1973 },
    { identifier: "fight-for-your-life-1977", title: "Fight for Your Life", subject: "blaxploitation black action film crime film", year: 1977 },
    { identifier: "abby-1974_202605", title: "Abby", subject: "blaxploitation black horror film crime film", year: 1974 },
    { identifier: "blacula_202511", title: "Blacula", subject: "blaxploitation black horror film crime film", year: 1972 },
    { identifier: "the-human-tornado-1976", title: "The Human Tornado", subject: "blaxploitation black action film comedy film", year: 1976 },
    { identifier: "BlackFistMPEG", title: "Black Fist", subject: "blaxploitation black action film crime film", year: 1974 },
    { identifier: "the-legend-of-black-charley-1972-sdtv-h-265", title: "The Legend of Black Charley", subject: "blaxploitation black western action film", year: 1972 },
    { identifier: "cleopatra-jones-1973-vhs-transfer", title: "Cleopatra Jones", subject: "blaxploitation black action film crime film", year: 1973 },
    { identifier: "dr.-black-mr.-hyde", title: "Dr. Black, Mr. Hyde", subject: "blaxploitation black horror film crime film", year: 1976 },
    { identifier: "thomasine-and-bushrod-1974", title: "Thomasine & Bushrod", subject: "blaxploitation black western action film", year: 1974 },
    { identifier: "the-education-of-sonny-carson-1974-dvd-rip", title: "The Education of Sonny Carson", subject: "blaxploitation black crime film drama", year: 1974 },
  ],
  /* Black Cinema needs its own recovery shelf. Reusing only the 70s
     Blaxploitation lane left this broader channel at one stale D1 row. These
     are public, already-playable feature records and remain inside the
     channel's Black-cinema contract. */
  "105": [
    { identifier: "The_Brother_from_Another_Planet_1984", title: "The Brother from Another Planet (1984)", subject: "black cinema blaxploitation black independent film", year: 1984, media: { type: "video", url: "https://archive.org/download/The_Brother_from_Another_Planet_1984/videoplayback%20%281%29.mp4" } },
    { identifier: "Fighting_Mad_MPEG", title: "Fighting Mad (1978)", subject: "black cinema blaxploitation black action film crime film", year: 1978, media: { type: "video", url: "https://archive.org/download/Fighting_Mad_MPEG/Fighting%20Mad.mp4" } },
    { identifier: "foxy-brown-1974", title: "Foxy Brown (1974)", subject: "black cinema blaxploitation black action film crime film", year: 1974, media: { type: "video", url: "https://archive.org/download/foxy-brown-1974/Foxy%20Brown%20%201974.mp4" } },
    { identifier: "trouble-man_1972", title: "Trouble Man (1972)", subject: "black cinema blaxploitation black action film crime film", year: 1972, media: { type: "video", url: "https://archive.org/download/trouble-man_1972/trouble-man_1972.mp4" } },
    { identifier: "lord.-shango.-1975.720p.-ac3", title: "Lord Shango (1975)", subject: "black cinema blaxploitation black action film crime film", year: 1975, media: { type: "video", url: "https://archive.org/download/lord.-shango.-1975.720p.-blu-ray.x-264.-aac-yts.-mx/Lord.Shango.1975.720p.BluRay.x264.AAC-%5BYTS.MX%5D.mp4" } },
  ],
  "200": [
    iaDirectRecovery("MasterHa1936_3::MasterHa1936_3.mp4", "MasterHa1936_3", "MasterHa1936_3.mp4", "Master Hands — Part III", "manufacturing industry factory engineering industrial film", 1936),
    iaDirectRecovery("VisittoW1950::VisittoW1950.mp4", "VisittoW1950", "VisittoW1950.mp4", "Visit to Wurlitzer", "manufacturing industry factory engineering industrial film", 1950),
    iaDirectRecovery("Aluminum1956_2::Aluminum1956_2.mp4", "Aluminum1956_2", "Aluminum1956_2.mp4", "Aluminum on the March — Part II", "manufacturing industry factory engineering industrial film", 1956),
    iaDirectRecovery("Crystals_Go_To_War::Crystals_Go_To_War_master.intros.mp4", "Crystals_Go_To_War", "Crystals_Go_To_War_master.intros.mp4", "Crystals Go to War", "manufacturing industry factory engineering industrial film", 1943),
    iaDirectRecovery("MasterHa1936_2::MasterHa1936_2.mp4", "MasterHa1936_2", "MasterHa1936_2.mp4", "Master Hands — Part II", "manufacturing industry factory engineering industrial film", 1936),
    iaDirectRecovery("MasterHa1936_4::MasterHa1936_4.mp4", "MasterHa1936_4", "MasterHa1936_4.mp4", "Master Hands — Part IV", "manufacturing industry factory engineering industrial film", 1936),
    iaDirectRecovery("Oldsmobi1941::Oldsmobi1941.mp4", "Oldsmobi1941", "Oldsmobi1941.mp4", "Oldsmobile Presents Motoring's Magic Carpet", "manufacturing industry automotive engineering industrial film", 1941),
    iaDirectRecovery("American1958_2::American1958_2.mp4", "American1958_2", "American1958_2.mp4", "American Look — Part II", "manufacturing industry industrial design engineering film", 1958),
    iaDirectRecovery("DefenseC1941::DefenseC1941.mp4", "DefenseC1941", "DefenseC1941.mp4", "Defense Comes First with Oldsmobile", "manufacturing industry automotive engineering industrial film", 1941),
    iaDirectRecovery("CurtissW1944::CurtissW1944.mp4", "CurtissW1944", "CurtissW1944.mp4", "Curtiss-Wright Shorts", "manufacturing industry aircraft engineering industrial film", 1944),
    iaDirectRecovery("MasterHa1936::MasterHa1936.mp4", "MasterHa1936", "MasterHa1936.mp4", "Master Hands — Automobile Manufacturing", "manufacturing industry automotive engineering industrial film", 1936),
    iaDirectRecovery("American1955::American1955.mp4", "American1955", "American1955.mp4", "American Harvest — Part I", "manufacturing industry automotive engineering industrial film", 1955),
    { identifier: "MasterHa1936_3", title: "Master Hands — Part III", subject: "manufacturing industry factory engineering industrial film", year: 1936 },
    { identifier: "VisittoW1950", title: "Visit to Wurlitzer", subject: "manufacturing industry factory engineering industrial film", year: 1950 },
    { identifier: "Aluminum1956_2", title: "Aluminum on the March — Part II", subject: "manufacturing industry factory engineering industrial film", year: 1956 },
    { identifier: "Crystals_Go_To_War", title: "Crystals Go to War", subject: "manufacturing industry factory engineering industrial film", year: 1943 },
    { identifier: "MasterHa1936_2", title: "Master Hands — Part II", subject: "manufacturing industry factory engineering industrial film", year: 1936 },
    { identifier: "MasterHa1936_4", title: "Master Hands — Part IV", subject: "manufacturing industry factory engineering industrial film", year: 1936 },
    { identifier: "Oldsmobi1941", title: "Oldsmobile Presents Motoring's Magic Carpet", subject: "manufacturing industry automotive engineering industrial film", year: 1941 },
    { identifier: "American1958_2", title: "American Look — Part II", subject: "manufacturing industry industrial design engineering film", year: 1958 },
    { identifier: "DefenseC1941", title: "Defense Comes First with Oldsmobile", subject: "manufacturing industry automotive engineering industrial film", year: 1941 },
    { identifier: "CurtissW1944", title: "Curtiss-Wright Shorts", subject: "manufacturing industry aircraft engineering industrial film", year: 1944 },
    { identifier: "MasterHa1936", title: "Master Hands — Automobile Manufacturing", subject: "manufacturing industry automotive engineering industrial film", year: 1936 },
    { identifier: "American1955", title: "American Harvest — Part I", subject: "manufacturing industry automotive engineering industrial film", year: 1955 },
  ],
  "15": [
    iaDirectRecovery("bctvpa-Lavender_Shortbread_Edition_Sam_Splains_the_World::Lavender_Shortbread_Edition_Sam_Splains_the_World.mp4", "bctvpa-Lavender_Shortbread_Edition_Sam_Splains_the_World", "Lavender_Shortbread_Edition_Sam_Splains_the_World.mp4", "Lavender Shortbread — Sam 'Splains the World", "public access television community television local programming community affairs", 2024),
    iaDirectRecovery("fctvma-Falmouth_Zoning_Board_of_Appeals_April_23_2015::Falmouth_Zoning_Board_of_Appeals_April_23_2015.mp4", "fctvma-Falmouth_Zoning_Board_of_Appeals_April_23_2015", "Falmouth_Zoning_Board_of_Appeals_April_23_2015.mp4", "Falmouth Zoning Board — April 23, 2015", "public access television community television civic meeting local government", 2015),
    iaDirectRecovery("ac12ia-Literary_Grounds_Bookstore_Ames_Public_Library::Literary_Grounds_Bookstore_Ames_Public_Library.mp4", "ac12ia-Literary_Grounds_Bookstore_Ames_Public_Library", "Literary_Grounds_Bookstore_Ames_Public_Library.mp4", "Literary Grounds — Ames Public Library", "public access television community television local arts community affairs", 2025),
    iaDirectRecovery("pmpnc-Bellow_Butcher_Co_Opening_Day::Bellow_Butcher_Co_Opening_Day.mp4", "pmpnc-Bellow_Butcher_Co_Opening_Day", "Bellow_Butcher_Co_Opening_Day.mp4", "Bellow Butcher Co. — Opening Day", "public access television community television local business community affairs", 2025),
    iaDirectRecovery("dscma-Sherborn_Select_Board_Meeting_December_18_2025::Sherborn_Select_Board_Meeting_December_18_2025.mp4", "dscma-Sherborn_Select_Board_Meeting_December_18_2025", "Sherborn_Select_Board_Meeting_December_18_2025.mp4", "Sherborn Select Board Meeting", "public access television community television civic meeting local government", 2025),
    iaDirectRecovery("ec16mn-Edina_City_Council_Meeting_Aug._6_2025::Edina_City_Council_Meeting_Aug._6_2025.mp4", "ec16mn-Edina_City_Council_Meeting_Aug._6_2025", "Edina_City_Council_Meeting_Aug._6_2025.mp4", "Edina City Council Meeting", "public access television community television civic meeting local government", 2025),
    iaDirectRecovery("cscmo-It_s_the_brick_for_me::It_s_the_brick_for_me.mp4", "cscmo-It_s_the_brick_for_me", "It_s_the_brick_for_me.mp4", "It's the Brick for Me", "public access television community television local arts local programming", 2024),
    iaDirectRecovery("mcmd-CE_Weekly_Media_Briefing_-_Sept_25_2025::CE_Weekly_Media_Briefing_-_Sept_25_2025.mp4", "mcmd-CE_Weekly_Media_Briefing_-_Sept_25_2025", "CE_Weekly_Media_Briefing_-_Sept_25_2025.mp4", "CE Weekly Media Briefing", "public access television community television community affairs local news", 2025),
  ],
  "912": [
    iaDirectRecovery("DeshOrchestraAjitGhosh_201807::Desh Orchestra-Ajit Ghosh.mp3", "DeshOrchestraAjitGhosh_201807", "Desh Orchestra-Ajit Ghosh.mp3", "Desh — Orchestra", "classical music orchestra instrumental radio", 2018, "audio"),
    iaDirectRecovery("CelloSquadron::Cello Squadron.mp3", "CelloSquadron", "Cello Squadron.mp3", "Cello Squadron", "classical music cello orchestra instrumental radio", 2015, "audio"),
    iaDirectRecovery("ZeroOrchestra::05ZeroOrchestra.mp3", "ZeroOrchestra", "05ZeroOrchestra.mp3", "Zero Orchestra", "classical music orchestra instrumental radio", 2014, "audio"),
    iaDirectRecovery("arno-schellenberg-preiser-lv-140-seite-a::01 - Arno SCHELLENBERG - Preiser LV 140 - Seite A - Zauberflöte - Der Vogelfänger bin ich ja (Mozart) Mx. ORA 2552, Electrola EG 6140 (1937).mp3", "arno-schellenberg-preiser-lv-140-seite-a", "01 - Arno SCHELLENBERG - Preiser LV 140 - Seite A - Zauberflöte - Der Vogelfänger bin ich ja (Mozart) Mx. ORA 2552, Electrola EG 6140 (1937).mp3", "Arno Schellenberg — The Magic Flute", "classical music opera orchestra instrumental radio", 1937, "audio"),
    iaDirectRecovery("CanadianOperaCompanyOpera101-NixoninChina_0::opera101_nixon.mp3", "CanadianOperaCompanyOpera101-NixoninChina_0", "opera101_nixon.mp3", "Nixon in China — Opera 101", "classical music opera orchestra instrumental radio", 2011, "audio"),
    iaDirectRecovery("JohnMccormackTenor::John Mccormack Tenor.mp3", "JohnMccormackTenor", "John Mccormack Tenor.mp3", "John McCormack — Tenor Recordings", "classical music opera vocal recital radio", 1920, "audio"),
    iaDirectRecovery("KBAQ_4::Recording_628.mp3", "KBAQ_4", "Recording_628.mp3", "KBAQ — Classical Happy Hour", "classical music orchestra symphony radio", 2021, "audio"),
    iaDirectRecovery("strauss-quartet::1 Allegro.mp3", "strauss-quartet", "1 Allegro.mp3", "Richard Strauss — Quartet for Piano and Strings", "classical music chamber music string quartet radio", 1975, "audio"),
  ],
  "926": [
    iaDirectRecovery("the-shadow-january-25-1948-mutual-the-house-that-death-built::The Shadow - January 25, 1948 - Mutual - The House That Death Built.mp3", "the-shadow-january-25-1948-mutual-the-house-that-death-built", "The Shadow - January 25, 1948 - Mutual - The House That Death Built.mp3", "The Shadow — The House That Death Built", "suspense radio old time radio the shadow radio drama", 1948, "audio"),
    iaDirectRecovery("inner-sanctum-1942-episodes::Inner Sanctum  42-01-18 Dead Reckoning.mp3", "inner-sanctum-1942-episodes", "Inner Sanctum  42-01-18 Dead Reckoning.mp3", "Inner Sanctum Mysteries — Dead Reckoning", "suspense radio old time radio inner sanctum radio drama", 1942, "audio"),
    iaDirectRecovery("inner-sanctum-1952-episodes::Inner Sanctum  52-06-22 Birdsong for a Murderer.mp3", "inner-sanctum-1952-episodes", "Inner Sanctum  52-06-22 Birdsong for a Murderer.mp3", "Inner Sanctum Mysteries — Birdsong for a Murderer", "suspense radio old time radio inner sanctum radio drama", 1952, "audio"),
    iaDirectRecovery("QuietPlease471117KillMeAgain::Quiet Please 47-11-17 Kill Me Again.mp3", "QuietPlease471117KillMeAgain", "Quiet Please 47-11-17 Kill Me Again.mp3", "Quiet Please — Kill Me Again", "suspense radio old time radio radio drama mystery", 1947, "audio"),
    iaDirectRecovery("edgar-wallace-the-case-of-the-frightened-lady::Edgar Wallace The Case Of The Frightened Lady.mp3", "edgar-wallace-the-case-of-the-frightened-lady", "Edgar Wallace The Case Of The Frightened Lady.mp3", "The Case of the Frightened Lady", "suspense radio old time radio radio drama mystery", 1950, "audio"),
    iaDirectRecovery("house-at-worlds-end-the::House at World's End, The.mp3", "house-at-worlds-end-the", "House at World's End, The.mp3", "The House at World's End", "suspense radio old time radio radio drama mystery", 1950, "audio"),
    iaDirectRecovery("altaban-the-magnificent::Altaban the Magnificent.mp3", "altaban-the-magnificent", "Altaban the Magnificent.mp3", "Altaban the Magnificent", "suspense radio old time radio radio drama mystery", 1950, "audio"),
  ],
  "916": [
    iaDirectRecovery("DTRASH10-BastardsUnited-BastardsUnited::dtrash10_01_technotrashed__intro_.mp3", "DTRASH10-BastardsUnited-BastardsUnited", "dtrash10_01_technotrashed__intro_.mp3", "Bastards United — Technotrashed", "punk punk rock hardcore post-punk music radio", 1999, "audio"),
    iaDirectRecovery("SCL114::Choknuty_Propeller_-_We_Wanna_Rock.mp3", "SCL114", "Choknuty_Propeller_-_We_Wanna_Rock.mp3", "Choknuty Propeller — We Wanna Rock", "punk punk rock hardcore garage punk music radio", 2013, "audio"),
    iaDirectRecovery("SCL076::01_-_Pioner.mp3", "SCL076", "01_-_Pioner.mp3", "Fiord — Pioner", "punk punk rock post-punk music radio", 2013, "audio"),
    iaDirectRecovery("SCL076::02_-_Radurak.mp3", "SCL076", "02_-_Radurak.mp3", "Fiord — Radurak", "punk punk rock post-punk music radio", 2013, "audio"),
    iaDirectRecovery("FinallyPunkliveattheOCCII::FinallyPunk_part01.mp3", "FinallyPunkliveattheOCCII", "FinallyPunk_part01.mp3", "Finally Punk — Live at the OCCII, Part 1", "punk punk rock live punk music radio", 2008, "audio"),
    iaDirectRecovery("FinallyPunkliveattheOCCII::FinallyPunk_part02.mp3", "FinallyPunkliveattheOCCII", "FinallyPunk_part02.mp3", "Finally Punk — Live at the OCCII, Part 2", "punk punk rock live punk music radio", 2008, "audio"),
    iaDirectRecovery("enrmp234_mons_jacet_-_chronicles_of_anarcho_punk_kid::00_mons_jacet_-_123_love_dance.mp3", "enrmp234_mons_jacet_-_chronicles_of_anarcho_punk_kid", "00_mons_jacet_-_123_love_dance.mp3", "Mons Jacet — 123 Love Dance", "punk anarcho-punk punk rock music radio", 2009, "audio"),
    iaDirectRecovery("guppy14::01_Compilations_Are_Killing_Talent_96kbps.mp3", "guppy14", "01_Compilations_Are_Killing_Talent_96kbps.mp3", "The Lucky Punk — Compilations Are Killing Talent", "punk punk rock garage punk music radio", 2014, "audio"),
    iaDirectRecovery("Lethargie.LP::Lethargie-st_lp-03-Same_Shit.mp3", "Lethargie.LP", "Lethargie-st_lp-03-Same_Shit.mp3", "Lethargie — Same Shit", "punk punk rock crust punk hardcore music radio", 2006, "audio"),
    iaDirectRecovery("Lethargie.LP::Lethargie-st_lp-09-Materialschlacht.mp3", "Lethargie.LP", "Lethargie-st_lp-09-Materialschlacht.mp3", "Lethargie — Materialschlacht", "punk punk rock crust punk hardcore music radio", 2006, "audio"),
    iaDirectRecovery("ca355_tc::01_Take_it_away.mp3", "ca355_tc", "01_Take_it_away.mp3", "This Co. — Take It Away", "punk post-punk new wave indie music radio", 2010, "audio"),
    iaDirectRecovery("ca355_tc::05_Bass.mp3", "ca355_tc", "05_Bass.mp3", "This Co. — Bass", "punk post-punk new wave indie music radio", 2010, "audio"),
    iaDirectRecovery("dmp003::dmp003-12-when-ya-get-drafted-dead-kennedys-cover.mp3", "dmp003", "dmp003-12-when-ya-get-drafted-dead-kennedys-cover.mp3", "cymotec — When Ya Get Drafted (Dead Kennedys Cover)", "punk electro punk industrial punk music radio", 2007, "audio"),
    iaDirectRecovery("dmp003::dmp003-13-project-x-humanity-mensch-an-der-tankstelle-remix.mp3", "dmp003", "dmp003-13-project-x-humanity-mensch-an-der-tankstelle-remix.mp3", "cymotec — Project X / Mensch an der Tankstelle", "punk electro punk industrial punk music radio", 2007, "audio"),
    iaDirectRecovery("BSCOMP0026::01-DaveMersonHess-DidntUsedToBeThisWay.mp3", "BSCOMP0026", "01-DaveMersonHess-DidntUsedToBeThisWay.mp3", "Dave Merson Hess — Didn't Used to Be This Way", "punk post-punk indie rock music radio", 2010, "audio"),
    iaDirectRecovery("BSCOMP0026::07-StrombleFix-ColdAge.mp3", "BSCOMP0026", "07-StrombleFix-ColdAge.mp3", "Stromble Fix — Cold Age", "punk post-punk indie rock music radio", 2010, "audio"),
    iaDirectRecovery("ca282_mum::01_Inconceivable.MP3", "ca282_mum", "01_Inconceivable.MP3", "Magical Unicellular Music — Inconceivable", "acid punk psychedelic rock punk music radio", 2009, "audio"),
    iaDirectRecovery("ca468_vg::1.WheresSatan.mp3", "ca468_vg", "1.WheresSatan.mp3", "Valery & The Greedies — Where's Satan?", "punk post-punk new wave indie music radio", 2011, "audio"),
    iaDirectRecovery("ca240_vom::01_Part_I_Track_1.mp3", "ca240_vom", "01_Part_I_Track_1.mp3", "Magical Unicellular Music — Kamen' Part I", "acid punk psychedelic rock punk music radio", 2009, "audio"),
    iaDirectRecovery("ca440_u::02-VVodostochnyihTrubahinTheDrainPipe.mp3", "ca440_u", "02-VVodostochnyihTrubahinTheDrainPipe.mp3", "Utrovortu — In the Drain Pipe", "punk post-punk psychedelic rock music radio", 2011, "audio"),
  ],
  "206": [
    { identifier: "CAAM_David_Lei_Linda_Shen_Wedding_1974", title: "Home Movie — David Lei and Linda Shen Wedding", subject: "home movie family film travelogue", year: 1974 },
    { identifier: "cubanc_000117", title: "Butano Redwoods — Trip with Herbert Hoover", subject: "home movie family film travelogue outdoors", year: 1938 },
    { identifier: "CAAM_00190", title: "Home Movie — Takemoto Family Anniversary", subject: "home movie family film family gathering", year: 1968 },
    { identifier: "ViajeCaminoDeSantiagoNoviembre1989", title: "Camino de Santiago — November 1989", subject: "home movie travelogue family film travel", year: 1989 },
    { identifier: "xmas-hong-kong-robin-bday-1971", title: "Hong Kong Christmas Home Movie", subject: "home movie family film travelogue", year: 1971 },
    { identifier: "HMGoldenGateInterna10343", title: "Golden Gate International Exposition", subject: "home movie travelogue family film", year: 1940 },
    { identifier: "HMJapanHongKongT98636", title: "Japan, Hong Kong, Thailand, Norway", subject: "home movie travelogue family film", year: 1957 },
    { identifier: "HMMichiganandDetroi97320", title: "Michigan and Detroit Area", subject: "home movie travelogue family film", year: 1947 },
    { identifier: "HMBryceandZionLos11024", title: "Bryce and Zion, Los Angeles", subject: "home movie travelogue family film outdoors", year: 1954 },
    { identifier: "HMCaliforniaTrip98673", title: "California Trip", subject: "home movie travelogue family film", year: 1951 },
    { identifier: "HMUSTravels98680", title: "U.S. Travels", subject: "home movie travelogue family film", year: 1950 },
    { identifier: "HOF0421930AlaTrip5", title: "Alaska Trip", subject: "home movie travelogue family film outdoors", year: 1930 },
  ],
  "208": [
    { identifier: "Passenge1955", title: "The Passenger Train", subject: "railroad railway train passenger rail transport", year: 1955 },
    { identifier: "GreatRai1942", title: "A Great Railroad at Work — Part I", subject: "railroad railway locomotive rail transport", year: 1942 },
    { identifier: "GreatRai1942_3", title: "A Great Railroad at Work — Part III", subject: "railroad railway locomotive rail transport", year: 1942 },
    { identifier: "BigTrain1950", title: "The Big Train — Part I", subject: "railroad railway locomotive rail transport", year: 1950 },
    { identifier: "BigTrain1950_2", title: "The Big Train — Part II", subject: "railroad railway locomotive rail transport", year: 1950 },
    { identifier: "BigTrain1955", title: "Big Trains Rolling", subject: "railroad railway locomotive rail transport", year: 1955 },
    { identifier: "Wheelsof1950", title: "Wheels of Progress", subject: "railroad railway locomotive rail transport", year: 1950 },
    { identifier: "DesertEm1948_2", title: "Desert Empire — Part II", subject: "railroad railway train rail transport", year: 1948 },
    { identifier: "Completi1914_2", title: "Completion of Northwestern Pacific Railroad — Part II", subject: "railroad railway train rail transport", year: 1914 },
    { identifier: "AtThisMo1954", title: "At This Moment — Part I", subject: "railroad railway train rail transport", year: 1954 },
    { identifier: "AtThisMo1954_2", title: "At This Moment — Part II", subject: "railroad railway train rail transport", year: 1954 },
    { identifier: "NewHoriz1948", title: "New Horizons", subject: "railroad railway train rail transport", year: 1948 },
  ],
  "219": [
    { identifier: "wbng-action-news-12-feb-18-1993", title: "WBNG Action News — February 18, 1993", subject: "local news local newscast television news", year: 1993 },
    { identifier: "wapt-eyewitness-news-16-1997", title: "WAPT 16 Eyewitness News", subject: "local news local newscast television news", year: 1997 },
    { identifier: "wbng-tv-12-action-news-feb-19-1993", title: "WBNG Action News — February 19, 1993", subject: "local news local newscast television news", year: 1993 },
    { identifier: "wwl-eyewitness-news-1991", title: "WWL Eyewitness News", subject: "local news local newscast television news", year: 1992 },
    { identifier: "wcax-late-news-start-feb-6-1992", title: "WCAX Late News — February 6, 1992", subject: "local news local newscast television news", year: 1992 },
    { identifier: "wapt-16-eyewitness-news-episode-1993", title: "WAPT 16 Eyewitness News — 1993", subject: "local news local newscast television news", year: 1993 },
    { identifier: "WNYWFox5NewsAt10June29th1994", title: "WNYW Fox 5 News at 10", subject: "local news local newscast television news", year: 1994 },
    { identifier: "wwl-eyewitness-news-at-noon-july-1996", title: "WWL Eyewitness News at Noon", subject: "local news local newscast television news", year: 1996 },
    { identifier: "wbrz-eyewitness-news-1994-full-cast", title: "WBRZ Eyewitness News", subject: "local news local newscast television news", year: 1994 },
    { identifier: "wwl-eyewitness-news-at-10-pm-feb-6-1990-b", title: "WWL Eyewitness News at 10 PM", subject: "local news local newscast television news", year: 1990 },
  ],
  "228": [
    { identifier: "msnbc.com-video-2006-10-08", title: "MSNBC News Video — October 2006", subject: "news television newsmagazine current affairs", year: 2006 },
    { identifier: "BBCNEWS_20190106_113000_Dateline_London", title: "Dateline London", subject: "news television newsmagazine current affairs", year: 2019 },
    { identifier: "WRC_20131028_072000_Dateline_NBC", title: "Dateline NBC", subject: "news television newsmagazine investigative journalism", year: 2013 },
    { identifier: "msnbc.com-video-2003-11-04", title: "MSNBC News Video — November 2003", subject: "news television newsmagazine current affairs", year: 2003 },
    { identifier: "msnbc.com-video-2003-05-14", title: "MSNBC News Video — May 2003", subject: "news television newsmagazine current affairs", year: 2003 },
    { identifier: "nightline-april-26-1999", title: "Nightline — April 26, 1999", subject: "news television newsmagazine current affairs", year: 1999 },
    { identifier: "wvue-2-4-94-2", title: "ABC News and WVUE News — February 1994", subject: "news television newsmagazine current affairs", year: 1994 },
    { identifier: "abc-news-nightline-june-20-1986", title: "ABC News Nightline — June 20, 1986", subject: "news television newsmagazine current affairs", year: 1986 },
    { identifier: "nightline-the-hajj", title: "Nightline — The Hajj", subject: "news television newsmagazine current affairs", year: 1997 },
    { identifier: "james-randi-on-dateline-1995", title: "James Randi on Dateline", subject: "news television newsmagazine investigative journalism", year: 1995 },
  ],
  "229": [
    { identifier: "20220107-105032", title: "CBS 60 Minutes — Full Episode", subject: "pbs documentary documentary television documentary investigative journalism", year: 1998 },
    { identifier: "20220107-172111_20260728", title: "MTV 120 Minutes and AMP — Full Tape", subject: "public television documentary television music documentary culture", year: 1998 },
    { identifier: "iVillage_60_Minutes", title: "60 Minutes", subject: "documentary television documentary investigative journalism", year: 1998 },
    { identifier: "nightline-the-hajj", title: "Nightline — The Hajj", subject: "documentary television documentary current affairs", year: 1997 },
    { identifier: "james-randi-on-dateline-1995", title: "James Randi on Dateline", subject: "documentary television documentary investigative journalism", year: 1995 },
    { identifier: "wto-60-minutes-explores-anarchists-and-battle-of-seattle", title: "60 Minutes — Battle of Seattle", subject: "documentary television documentary investigative journalism", year: 2000 },
    { identifier: "WRC_20131028_072000_Dateline_NBC", title: "Dateline NBC", subject: "documentary television documentary investigative journalism", year: 2013 },
    { identifier: "BBCNEWS_20190106_113000_Dateline_London", title: "Dateline London", subject: "documentary television documentary current affairs", year: 2019 },
    { identifier: "msnbc.com-video-2003-11-04", title: "MSNBC News Documentary Video", subject: "documentary television documentary current affairs", year: 2003 },
    { identifier: "msnbc.com-video-2003-05-14", title: "MSNBC News Documentary Video", subject: "documentary television documentary current affairs", year: 2003 },
  ],
  "236": [
    { identifier: "SoundieO", title: "Soundie — I Can't Give You Anything but Love", subject: "theatrical short soundie music short", year: 1941 },
    { identifier: "Havana-Madri_2", title: "Soundie — Havana-Madrid Show", subject: "theatrical short soundie music short", year: 1941 },
    { identifier: "WhosYourHoot", title: "Soundie — Who's Yehudi?", subject: "theatrical short soundie comedy short", year: 1942 },
    { identifier: "soundie_12", title: "Soundie — Hollywood Boogie", subject: "theatrical short soundie music short", year: 1946 },
    { identifier: "SoundieD", title: "Soundie — Zig Me Baby with a Gentle Zag", subject: "theatrical short soundie music short", year: 1941 },
    { identifier: "SoundieQ", title: "Soundie — Chime Bells", subject: "theatrical short soundie music short", year: 1943 },
    { identifier: "SoundieE", title: "Soundie — What This Country Needs", subject: "theatrical short soundie music short", year: 1941 },
    { identifier: "SoundieI", title: "Soundie — In a Shanty in Old Shanty Town", subject: "theatrical short soundie music short", year: 1940 },
    { identifier: "soundie_5", title: "Soundie — Hawaiian Hula Song", subject: "theatrical short soundie music short", year: 1940 },
    { identifier: "soundie_6", title: "Soundie — Heaven Help a Sailor", subject: "theatrical short soundie music short", year: 1940 },
    { identifier: "SoundieN", title: "Soundie — One Look at You", subject: "theatrical short soundie music short", year: 1940 },
    { identifier: "soundie_2", title: "Soundie — Our Teacher", subject: "theatrical short soundie educational short", year: 1943 },
  ],
  "907": [
    iaDirectRecovery("1936-B-Archives-1936-00-00-Peter-Packay-Swing-Academy-8-Bars-In-Search-Of-a-Melody::1936(B)Archives19360000PeterPackaySwingAcademy-8BarsInSearchOfaMelody.mp3", "1936-B-Archives-1936-00-00-Peter-Packay-Swing-Academy-8-Bars-In-Search-Of-a-Melody", "1936(B)Archives19360000PeterPackaySwingAcademy-8BarsInSearchOfaMelody.mp3", "Peter Packay Swing Academy — 8 Bars in Search of a Melody", "swing big band dance band jazz music", 1936, "audio"),
    iaDirectRecovery("cabaebh_000002::cabaebh_000002_a_access.mp3", "cabaebh_000002", "cabaebh_000002_a_access.mp3", "East Bakersfield High School Band — 1940", "swing big band dance band jazz music", 1940, "audio"),
    iaDirectRecovery("howl-and-prowl::Howl and Prowl.mp3", "howl-and-prowl", "Howl and Prowl.mp3", "Paul Westmoreland and His Band — Howl and Prowl", "swing big band dance band jazz music", 1953, "audio"),
    iaDirectRecovery("mama-ines-1930-havana-novelty-orchestra::Mama Ines (1930, Havana Novelty Orchestra).mp3", "mama-ines-1930-havana-novelty-orchestra", "Mama Ines (1930, Havana Novelty Orchestra).mp3", "Mama Ines — Havana Novelty Orchestra", "swing dance band jazz music", 1930, "audio"),
    iaDirectRecovery("AlexandersRagtimeBand::AlexandersRagtimeBand.mp3", "AlexandersRagtimeBand", "AlexandersRagtimeBand.mp3", "Alexander's Ragtime Band", "swing dance band jazz music", 1911, "audio"),
  ],
  "910": [
    { identifier: "territorio-salsero_202109", title: "Territorio Salsero", subject: "latin salsa latin music radio", year: 2021 },
    { identifier: "tona-la-negra-cassette-completo", title: "Tona la Negra — Cassette Completo", subject: "latin bolero latin music radio", year: 2000 },
    { identifier: "trio-los-panchos-sin-un-amor-columbia-6297-x-co-40140", title: "Trio Los Panchos — Sin Un Amor", subject: "latin bolero latin music radio", year: 1948 },
    { identifier: "lp_the-best-mambos-of-the-fabulous-fifties_ralph-font-and-his-orchestra-bill-diablo-a_0", title: "The Best Mambos of the Fabulous Fifties", subject: "latin mambo latin music radio", year: 1957 },
    { identifier: "lp_an-evening-at-la-margarita-vol1_carlos-barradas-the-trio-veracruz", title: "An Evening at La Margarita", subject: "latin mariachi latin music radio", year: 1971 },
    { identifier: "lp_new-beat-bossa-nova-means-the-samba-swings_zoot-sims-and-his-orchestra", title: "New Beat Bossa Nova", subject: "latin bossa nova latin music radio", year: 1962 },
    { identifier: "mc-partland-marian-1963-bossa-nova-plus-soul-blp-cr-01", title: "Marian McPartland — Bossa Nova Plus Soul", subject: "latin bossa nova latin music radio", year: 1963 },
    { identifier: "gaby-daltas-nosotros-peerless-2026", title: "Nosotros", subject: "latin bolero latin music radio", year: 1943 },
    { identifier: "enric-madriguera-and-his-orchestra-moon-in-the-sea-rca-victor-27487-a", title: "Moon in the Sea", subject: "latin tango latin music radio", year: 1941 },
    { identifier: "78_amor-ciego-blind-love_hermanas-hernandez-carmen-laura-r-hernandez_gbia0508662b", title: "Amor Ciego (Blind Love)", subject: "latin bolero latin music radio", year: 1945 },
    { identifier: "florian-zabach-jalousie-decca-80606-27509", title: "Jalousie", subject: "latin tango latin music radio", year: 1951 },
    { identifier: "stephane-grappelli-baden-powell-la-grande-reunion", title: "La Grande Réunion", subject: "latin bossa nova latin music radio", year: 1975 },
    iaDirectRecovery("carlos-molina-and-his-orchestra-cardos-tango-victor-24160-b-july-20-1932::Carlos Molina And His Orchestra - Cardos (Tango) - Victor 24160-B - July 20, 1932.mp3", "carlos-molina-and-his-orchestra-cardos-tango-victor-24160-b-july-20-1932", "Carlos Molina And His Orchestra - Cardos (Tango) - Victor 24160-B - July 20, 1932.mp3", "Carlos Molina — Cardos (Tango)", "latin tango latin music", 1932, "audio"),
    iaDirectRecovery("JV-31557-1951-Qmaq9SKmLcoFeisVTGKinRhhZYSGaLobeh9iq1F2c71xKP.mp3::DV521793.mp3", "JV-31557-1951-Qmaq9SKmLcoFeisVTGKinRhhZYSGaLobeh9iq1F2c71xKP.mp3", "DV521793.mp3", "Blues Mambo", "latin mambo latin music", 1951, "audio"),
    iaDirectRecovery("JV-40047-1962-QmUCd25vunNFKMYvCQXTprvtv2E8gDaMHX9wKK2JX36Bfa.mp3::DV517984.mp3", "JV-40047-1962-QmUCd25vunNFKMYvCQXTprvtv2E8gDaMHX9wKK2JX36Bfa.mp3", "DV517984.mp3", "One Note Samba", "latin samba latin music", 1962, "audio"),
    iaDirectRecovery("78_2929-La-Cumparsta-tango::2929-La-Cumparsta-tango.mp3", "78_2929-La-Cumparsta-tango", "2929-La-Cumparsta-tango.mp3", "La Cumparsita", "latin tango latin music", 1924, "audio"),
    iaDirectRecovery("AgendaAsiSeBailaElTango::Agenda Así se baila el tango.mp3", "AgendaAsiSeBailaElTango", "Agenda Así se baila el tango.mp3", "Así Se Baila el Tango", "latin tango latin music", 2019, "audio"),
  ],
  "923": [
    { identifier: "aporee_72706_84885", title: "Bells at 3 PM — Belgium", subject: "field recording soundscape ambient environmental audio", year: 2026 },
    { identifier: "cartografia-sonora-19102024-camouhan-ridge-insectos-nos-arrozais", title: "Camouhan Ridge — Insects in the Rice Fields", subject: "field recording soundscape ambient environmental audio", year: 2024 },
    { identifier: "cartografia-sonora-26102024-amed-facendo-o-parvo-e-creando-sons-asmr", title: "Amed — Creating Sounds", subject: "field recording soundscape ambient environmental audio", year: 2024 },
    { identifier: "cartografia-sonora-03112024-taman-nasional-gunung-leuser-preparando-a-comida-2", title: "Gunung Leuser — Preparing Food", subject: "field recording soundscape ambient environmental audio", year: 2024 },
    { identifier: "cartografia-sonora-13112024-porto-de-pulau-weh-o-aparato-de-musica-averiado-soando-en-repe", title: "Pulau Weh — Harbour Soundscape", subject: "field recording soundscape ambient environmental audio", year: 2024 },
    { identifier: "cartografia-sonora-17112024-kampot-o-son-das-andurinas-no-solpor", title: "Kampot — Swallows at Sunset", subject: "field recording soundscape birds ambient environmental audio", year: 2024 },
    { identifier: "aporee_40198_45909", title: "Marseille — Rain Shelter Acoustics", subject: "field recording soundscape ambient environmental audio", year: 2018 },
    { identifier: "aporee_35382_40641", title: "Pärnu County — River and Nightingale", subject: "field recording soundscape birds ambient environmental audio", year: 2012 },
    { identifier: "aporee_47226_82987", title: "Kaohsiung — Traditional Market", subject: "field recording soundscape market city ambience audio", year: 2025 },
    { identifier: "aporee_49843_56824", title: "Keelung Harbour — Waterfront Ambience", subject: "field recording soundscape harbour city ambience audio", year: 2020 },
    { identifier: "aporee_50265_57341", title: "Taitung Coast — Waves", subject: "field recording soundscape ocean waves environmental audio", year: 2020 },
    { identifier: "aporee_71101_82922", title: "Taichung — In the Woods", subject: "field recording soundscape forest birds environmental audio", year: 2025 },
    { identifier: "aporee_71036_82847", title: "Pingtung — Morning in the Woods", subject: "field recording soundscape forest birds environmental audio", year: 2025 },
    { identifier: "aporee_71453_83365", title: "Bremnes Fort — WWII Bunker Island", subject: "field recording soundscape historical site environmental audio", year: 2024 },
    { identifier: "tomas-senkyrik-dawn-chorus-from-floodplain-forest", title: "Dawn Chorus from Floodplain Forest", subject: "field recording soundscape birds environmental audio", year: 2023 },
    iaDirectRecovery("aporee_72706_84885::20260712egliseRuysbroeckvoituresLomUsiProABZoomF3.flac", "aporee_72706_84885", "20260712egliseRuysbroeckvoituresLomUsiProABZoomF3.flac", "Bells at 3 PM — Belgium", "field recording nature sounds soundscape ambient nature recording", 2026, "audio"),
    iaDirectRecovery("aporee_40198_45909::201856plazadezpodkapom1650.mp3", "aporee_40198_45909", "201856plazadezpodkapom1650.mp3", "Marseille — Rain Shelter Acoustics", "field recording soundscape ambient nature recording", 2018, "audio"),
    iaDirectRecovery("aporee_35382_40641::2365BirdsRiver25May12532Soomaa4416.mp3", "aporee_35382_40641", "2365BirdsRiver25May12532Soomaa4416.mp3", "Pärnu County — River and Nightingale", "field recording nature sounds soundscape ambient nature recording", 2012, "audio"),
    iaDirectRecovery("aporee_49843_56824::soundmap2020061814.mp3", "aporee_49843_56824", "soundmap2020061814.mp3", "Keelung Harbour — Waterfront Ambience", "field recording soundscape ambient nature recording", 2020, "audio"),
    iaDirectRecovery("tomas-senkyrik-dawn-chorus-from-floodplain-forest::TomasSenkyrikDawnChorusFromFloodplainForest.flac", "tomas-senkyrik-dawn-chorus-from-floodplain-forest", "TomasSenkyrikDawnChorusFromFloodplainForest.flac", "Dawn Chorus from Floodplain Forest", "field recording nature sounds soundscape ambient nature recording", 2023, "audio"),
  ],
  /* v4 certification repair bank. Each record below was found through the
     lane's existing Archive vocabulary and its derivative was verified via
     /metadata before being added. These are direct, genre-owned fallback
     programs; normal discovery and freshness rotation remain authoritative
     whenever the upstream search is healthy. */
  "82": [
    iaDirectRecovery("Waco_Wild_West_Century_2004_Camping_Trip", "Waco_Wild_West_Century_2004_Camping_Trip", "waco2004.ogv", "Waco Wild West Century 2004 Camping Trip", "camping hiking wilderness outdoor recreation", 2005),
    iaDirectRecovery("csf_00009", "csf_00009", "csf_00009_access.HD.mp4", "Skyline Hike over the Muir Trail", "hiking trail wilderness outdoor recreation", 1947),
    iaDirectRecovery("youtube-jDrGqftxD8g", "youtube-jDrGqftxD8g", "jDrGqftxD8g.mp4", "Young Viking Goddess Alone in Off-Grid Wilderness", "wilderness camping hiking outdoor recreation", 2022),
    iaDirectRecovery("mendocamping", "mendocamping", "mendocamping.mp4", "Mendocino Camping", "camping wilderness outdoor recreation", 2010),
    iaDirectRecovery("098403", "098403", "098403.mp4", "Wisconsin Hiking and Fishing Home Movie", "hiking trail outdoor recreation wilderness", 1949),
  ],
  "900": [
    iaDirectRecovery("07.08.16TheKINDAtMartinsDowntown::01 China ryder.mp3", "07.08.16TheKINDAtMartinsDowntown", "01 China ryder.mp3", "the KIND — Live at Martin's Downtown", "rock live concert music", 2016, "audio"),
    iaDirectRecovery("rftg2006-12-24.rocks1::rftg2006-12-24d1t01.rocks1.mp3", "rftg2006-12-24.rocks1", "rftg2006-12-24d1t01.rocks1.mp3", "Kitt / Katt Christmas Eve Jam", "rock live concert jam music", 2006, "audio"),
    iaDirectRecovery("whaynes1997-06-22::whaynes1997-06-22t01_Old_Friend.flac", "whaynes1997-06-22", "whaynes1997-06-22t01_Old_Friend.flac", "Warren Haynes — Live at Gathering of the Vibes", "rock live concert music", 1997, "audio"),
    iaDirectRecovery("dead19710621::01_Truckin'.flac", "dead19710621", "01_Truckin'.flac", "Grateful Dead — Chateau d'Herouville", "rock live concert music", 1971, "audio"),
    iaDirectRecovery("Lightajo2008-05-01::Set1/01Minds.mp3", "Lightajo2008-05-01", "Set1/01Minds.mp3", "Lightajo — Live at the Young Avenue Deli", "rock live concert music", 2008, "audio"),
  ],
  "501": [
    iaDirectRecovery("disneys-california-adventure-teaser-promo-rare-dvd-quality-480p", "disneys-california-adventure-teaser-promo-rare-dvd-quality-480p", "Disneys California Adventure Teaser Promo Rare DVD Quality480p.ia.mp4", "Disney's California Adventure — Teaser Promo", "movie trailer film trailer teaser coming attractions", 2000),
    iaDirectRecovery("monsters-inc-charades-trailer-360p", "monsters-inc-charades-trailer-360p", "Monsters Inc_ - Charades Trailer_ 360p.mp4", "Monsters Inc. — Charades Trailer", "movie trailer film trailer teaser coming attractions", 2001),
    iaDirectRecovery("love-at-first-bite-tv-trailer-1979", "love-at-first-bite-tv-trailer-1979", "Love at First Bite TV trailer 1979.mp4", "Love at First Bite — TV Trailer", "movie trailer film trailer teaser coming attractions", 1979),
    iaDirectRecovery("CLE-014_270296-270923", "CLE-014_270296-270923", "270296_Lois-Clark-Episode-Teaser-Promo-ABC-WEWS-5_1993-12-08.ia.mp4", "Lois & Clark — Episode Teaser", "television trailer teaser promo coming attractions", 1993),
    iaDirectRecovery("NJY-008_126109-126708", "NJY-008_126109-126708", "126109_Knots-Landing-Episode-Teaser-Promo-CBS-WCBS-2_1991-11-06.ia.mp4", "Knots Landing — Episode Teaser", "television trailer teaser promo coming attractions", 1991),
  ],
  "502": [
    iaDirectRecovery("TVS-television-south-junction-1990-by-television-heaven-uk_20220719::TVS 1990.mp4", "TVS-television-south-junction-1990-by-television-heaven-uk_20220719", "TVS 1990.mp4", "TVS Junction — 1990 VHS Capture", "vhs tape television broadcast off-air recording home video", 1990),
    iaDirectRecovery("wusa-washington-afternoon-programs-1999::CBS Daytime.mp4", "wusa-washington-afternoon-programs-1999", "CBS Daytime.mp4", "WUSA CBS Daytime — December 1999 VHS Capture", "vhs tape television broadcast off-air recording home video", 1999),
    iaDirectRecovery("wbgu-2-wdcrv-nywrk::WBGU1_cntry_bweav.mp4", "wbgu-2-wdcrv-nywrk", "WBGU1_cntry_bweav.mp4", "WBGU Country Basket Weaving — VHS Capture", "vhs tape television broadcast off-air recording home video", 1990),
    iaDirectRecovery("wallace-gromit-the-wrong-trousers-1994-vhs::Wallace & Gromit - The Wrong Trousers.mp4", "wallace-gromit-the-wrong-trousers-1994-vhs", "Wallace & Gromit - The Wrong Trousers.mp4", "Wallace & Gromit — The Wrong Trousers VHS", "vhs tape home video animation television", 1994),
    iaDirectRecovery("yourre-invited-to-mary-kate-ashleys-hawaian-beach-party-1996-vhs::Your're Invited To Mary-Kate & Ashley's Hawaian Beach Party 1996 VHS.mp4", "yourre-invited-to-mary-kate-ashleys-hawaian-beach-party-1996-vhs", "Your're Invited To Mary-Kate & Ashley's Hawaian Beach Party 1996 VHS.mp4", "Mary-Kate & Ashley — Hawaiian Beach Party VHS", "vhs tape home video television family entertainment", 1996),
  ],
  "126": [
    iaDirectRecovery("the-professionals-complete-series-1977::The Professionals   1x01   Private Madness Public Danger.mp4", "the-professionals-complete-series-1977", "The Professionals   1x01   Private Madness Public Danger.mp4", "The Professionals — Private Madness Public Danger", "british detective british police drama television crime series", 1977),
    iaDirectRecovery("the-professionals-complete-series-1977::The Professionals   1x02   The Female Factor.mp4", "the-professionals-complete-series-1977", "The Professionals   1x02   The Female Factor.mp4", "The Professionals — The Female Factor", "british detective british police drama television crime series", 1977),
    iaDirectRecovery("the-professionals-complete-series-1977::The Professionals   1x03   Old Dog With New Tricks.mp4", "the-professionals-complete-series-1977", "The Professionals   1x03   Old Dog With New Tricks.mp4", "The Professionals — Old Dog With New Tricks", "british detective british police drama television crime series", 1977),
    iaDirectRecovery("the-professionals-complete-series-1977::The Professionals   1x04   Killer With A Long Arm.mp4", "the-professionals-complete-series-1977", "The Professionals   1x04   Killer With A Long Arm.mp4", "The Professionals — Killer With A Long Arm", "british detective british police drama television crime series", 1977),
    iaDirectRecovery("the-professionals-complete-series-1977::The Professionals   1x05   Heroes.mp4", "the-professionals-complete-series-1977", "The Professionals   1x05   Heroes.mp4", "The Professionals — Heroes", "british detective british police drama television crime series", 1977),
    iaDirectRecovery("the-professionals-complete-series-1977::The Professionals   1x06   Where The Jungle Ends.mp4", "the-professionals-complete-series-1977", "The Professionals   1x06   Where The Jungle Ends.mp4", "The Professionals — Where The Jungle Ends", "british detective british police drama television crime series", 1977),
    iaDirectRecovery("the-professionals-complete-series-1977::The Professionals   1x07   Close Quarters.mp4", "the-professionals-complete-series-1977", "The Professionals   1x07   Close Quarters.mp4", "The Professionals — Close Quarters", "british detective british police drama television crime series", 1977),
    iaDirectRecovery("the-professionals-complete-series-1977::The Professionals   1x08   Everest Was Also Conquered.mp4", "the-professionals-complete-series-1977", "The Professionals   1x08   Everest Was Also Conquered.mp4", "The Professionals — Everest Was Also Conquered", "british detective british police drama television crime series", 1977),
    iaDirectRecovery("the-professionals-complete-series-1977::The Professionals   1x09   When The Heat Cools Off.mp4", "the-professionals-complete-series-1977", "The Professionals   1x09   When The Heat Cools Off.mp4", "The Professionals — When The Heat Cools Off", "british detective british police drama television crime series", 1977),
    iaDirectRecovery("the-professionals-complete-series-1977::The Professionals   1x10   Stakeout.mp4", "the-professionals-complete-series-1977", "The Professionals   1x10   Stakeout.mp4", "The Professionals — Stakeout", "british detective british police drama television crime series", 1977),
    iaDirectRecovery("the-professionals-complete-series-1977::The Professionals   1x11   Long Shot.mp4", "the-professionals-complete-series-1977", "The Professionals   1x11   Long Shot.mp4", "The Professionals — Long Shot", "british detective british police drama television crime series", 1977),
    iaDirectRecovery("the-professionals-complete-series-1977::The Professionals   1x12   Look After Annie.mp4", "the-professionals-complete-series-1977", "The Professionals   1x12   Look After Annie.mp4", "The Professionals — Look After Annie", "british detective british police drama television crime series", 1977),
    iaDirectRecovery("the-professionals-complete-series-1977::The Professionals   1x13   Klansmen.mp4", "the-professionals-complete-series-1977", "The Professionals   1x13   Klansmen.mp4", "The Professionals — Klansmen", "british detective british police drama television crime series", 1977),
    iaDirectRecovery("the-professionals-complete-series-1977::The Professionals   2x01   Hunter Hunted.mp4", "the-professionals-complete-series-1977", "The Professionals   2x01   Hunter Hunted.mp4", "The Professionals — Hunter Hunted", "british detective british police drama television crime series", 1978),
    iaDirectRecovery("the-professionals-complete-series-1977::The Professionals   2x02   The Rack.mp4", "the-professionals-complete-series-1977", "The Professionals   2x02   The Rack.mp4", "The Professionals — The Rack", "british detective british police drama television crime series", 1978),
    iaDirectRecovery("the-professionals-complete-series-1977::The Professionals   2x03   First Night.mp4", "the-professionals-complete-series-1977", "The Professionals   2x03   First Night.mp4", "The Professionals — First Night", "british detective british police drama television crime series", 1978),
  ],
  "101": [
    iaDirectRecovery("house_on_haunted_hill_ipod::house_on_haunted_hill.mp4", "house_on_haunted_hill_ipod", "house_on_haunted_hill.mp4", "House on Haunted Hill", "gothic horror classic monster horror film", 1959),
    iaDirectRecovery("BloodyPitOfHorror::BloodyPitOfHorror.mp4", "BloodyPitOfHorror", "BloodyPitOfHorror.mp4", "Bloody Pit of Horror", "classic monster horror creature feature film", 1965),
    iaDirectRecovery("Horror_Express::Horror_Express.mp4", "Horror_Express", "Horror_Express.mp4", "Horror Express", "classic horror supernatural horror mystery film", 1973),
    iaDirectRecovery("CarnivalofSouls::CarnivalOfSouls.mp4", "CarnivalofSouls", "CarnivalOfSouls.mp4", "Carnival of Souls", "gothic horror supernatural horror film", 1962),
    iaDirectRecovery("TheGhoul::TheGhoul_1933.mp4", "TheGhoul", "TheGhoul_1933.mp4", "The Ghoul", "gothic horror classic monster horror film", 1933),
  ],
  "103": [
    iaDirectRecovery("his_girl_friday::his_girl_friday.mp4", "his_girl_friday", "his_girl_friday.mp4", "His Girl Friday", "classic comedy screwball comedy film", 1940),
    iaDirectRecovery("utopia::Utopia.mp4", "utopia", "Utopia.mp4", "Utopia", "classic comedy comedy film", 1951),
    iaDirectRecovery("mclintok_widescreen::McLintock.mp4", "mclintok_widescreen", "McLintock.mp4", "McLintock!", "classic comedy comedy western film", 1963),
    iaDirectRecovery("my_favorite_brunette::my_favorite_brunette.mp4", "my_favorite_brunette", "my_favorite_brunette.mp4", "My Favorite Brunette", "classic comedy screwball comedy film", 1947),
    iaDirectRecovery("TheFlyingDeuces::The_Flying_Deuces.mp4", "TheFlyingDeuces", "The_Flying_Deuces.mp4", "The Flying Deuces", "classic comedy slapstick comedy film", 1939),
  ],
  "909": [
    iaDirectRecovery("mahalia_jackson-abide_with_me-vinyl-1971::A1-Somebody Bigger Than You And I.mp3", "mahalia_jackson-abide_with_me-vinyl-1971", "A1-Somebody Bigger Than You And I.mp3", "Mahalia Jackson — Somebody Bigger Than You and I", "gospel spiritual sacred music", 1971, "audio"),
    iaDirectRecovery("SisterRosettaTharpeWithTheDependableBoysAndSamPriceTrio-DownByThe::07Track7.mp3", "SisterRosettaTharpeWithTheDependableBoysAndSamPriceTrio-DownByThe", "07Track7.mp3", "Sister Rosetta Tharpe — Down by the Riverside", "gospel spiritual sacred music", 1950, "audio"),
    iaDirectRecovery("clarawardgospelc00ward::02_When_the_saints_go_marching_in.mp3", "clarawardgospelc00ward", "02_When_the_saints_go_marching_in.mp3", "Clara Ward — When the Saints Go Marching In", "gospel spiritual sacred music", 1950, "audio"),
    iaDirectRecovery("james-cleveland-and-the-southern-california-community-choir-god-is::James Cleveland and The Southern California Community Choir - God Is.mp3", "james-cleveland-and-the-southern-california-community-choir-god-is", "James Cleveland and The Southern California Community Choir - God Is.mp3", "James Cleveland — God Is", "gospel spiritual sacred choir music", 1979, "audio"),
    iaDirectRecovery("gospel78s::AlexBradfordAndHisBradfordSpecials-HoyGhostAndLifesCandlelight-Specialty886.mp3", "gospel78s", "AlexBradfordAndHisBradfordSpecials-HoyGhostAndLifesCandlelight-Specialty886.mp3", "Alex Bradford and His Bradford Specials — Gospel 78", "gospel spiritual sacred music", 1950, "audio"),
    { identifier: "takeovertheophilussundaywww.amenradio.net", title: "Take Over — Theophilus Sunday", subject: "gospel spiritual sacred music", year: 2024 },
    { identifier: "nara-ekele-dr.-paul-enenche-feat.-dunamis-voices-osinachi-nwachukwu-www.-amen-radio.net", title: "Nara Ekele — Dunamis Voices", subject: "gospel spiritual sacred music", year: 2024 },
    { identifier: "HolyGhostPower_20170325", title: "Jamaican Gospel Music & Songs", subject: "gospel spiritual sacred music", year: 2017 },
    { identifier: "NARAFT.TRAVISGRENE1", title: "Travis Greene — Gospel Music", subject: "gospel spiritual sacred music", year: 2017 },
    { identifier: "onye-inyeaka-my-helper-mr.-m-revelation-www.-amen-radio.net", title: "Onye-Inyeaka — Mr. M & Revelation", subject: "gospel spiritual sacred music", year: 2024 },
    { identifier: "HotPraiseWorshipVol2", title: "Hot Praise Worship Vol. 2", subject: "gospel spiritual sacred music", year: 2017 },
    { identifier: "HolyGhostPower_20161117", title: "Jamaican Gospel Music & Songs", subject: "gospel spiritual sacred music", year: 2016 },
    { identifier: "MAR17QRHaitianGospelMusicAndSongs", title: "Haitian Gospel Music and Songs", subject: "gospel spiritual sacred music", year: 2017 },
    { identifier: "my-altar-is-calling-theophilus-sunday-www.-amen-radio.net", title: "My Altar Is Calling — Theophilus Sunday", subject: "gospel spiritual sacred music", year: 2024 },
    { identifier: "spiritofvictoryjephthahidahosaaigbewww.amenradio.net", title: "Spirit of Victory", subject: "gospel spiritual sacred music", year: 2024 },
    { identifier: "AFRICANMUSICARCHIVES-TOPGOSPELMUSIC", title: "African Music Archives — Top Gospel Music", subject: "gospel spiritual sacred music", year: 2018 },
  ],
  "203": [
    iaDirectRecovery("aaapodcast_episode262_201502::2017AnimeOscars.mp3", "aaapodcast_episode262_201502", "2017AnimeOscars.mp3", "AAA Podcast — Episode 262", "podcast podcast episode independent podcast audio", 2015, "audio"),
    iaDirectRecovery("yitbarchive::001.TheUnborn.mp3", "yitbarchive", "001.TheUnborn.mp3", "Yeah, It's That Bad — The Unborn", "podcast podcast episode film podcast audio", 2014, "audio"),
    iaDirectRecovery("naturespast73::natures-past73.mp3", "naturespast73", "natures-past73.mp3", "Nature's Past — New Books in Environmental History", "podcast history podcast science podcast audio", 2021, "audio"),
    iaDirectRecovery("RetroistRubikTheAmazingCube::Retroist-203-Rubik-the-Amazing-Cube.mp3", "RetroistRubikTheAmazingCube", "Retroist-203-Rubik-the-Amazing-Cube.mp3", "Retroist Podcast — Rubik the Amazing Cube", "podcast retro podcast storytelling podcast audio", 2016, "audio"),
    iaDirectRecovery("retroist-macgyver-podcast::retroist-macgyver-podcast.mp3", "retroist-macgyver-podcast", "retroist-macgyver-podcast.mp3", "Retroist Podcast — MacGyver", "podcast retro podcast television podcast audio", 2017, "audio"),
  ],
  "127": [
    iaDirectRecovery("topofthepops::Top of the Pops - S02E33 - 19th August 1965.mp4", "topofthepops", "Top of the Pops - S02E33 - 19th August 1965.mp4", "Top of the Pops — 19 August 1965", "top of the pops british music performance television", 1965),
    iaDirectRecovery("TheWho-LiveAtTheIsleOfWightFestival-Film-1970::TheWho-LiveAtTheIsleOfWightFestival1970.mp4", "TheWho-LiveAtTheIsleOfWightFestival-Film-1970", "TheWho-LiveAtTheIsleOfWightFestival1970.mp4", "The Who — Live at the Isle of Wight Festival", "british rock performance music television", 1970),
    iaDirectRecovery("totp-surviving-footage-1970::April/TOTP 02-04-1970 Bob and Marcia - Young Gifted and Black 1080p.ia.mp4", "totp-surviving-footage-1970", "April/TOTP 02-04-1970 Bob and Marcia - Young Gifted and Black 1080p.ia.mp4", "Top of the Pops — Bob and Marcia", "top of the pops british music performance television", 1970),
    iaDirectRecovery("KraftMusicHall14December1960::Kraft Music Hall - 14 December 1960.mp4", "KraftMusicHall14December1960", "Kraft Music Hall - 14 December 1960.mp4", "Kraft Music Hall — 14 December 1960", "british music hall music performance television", 1960),
    iaDirectRecovery("videoplayback_20181218:: TOTP+ 22 04 01.mp4", "videoplayback_20181218", " TOTP+ 22 04 01.mp4", "Top of the Pops — 2000–01", "top of the pops british music performance television", 2001),
    { identifier: "top-of-the-pops-1970s_202401", title: "Top of the Pops — 1970s Collection", subject: "top of the pops british music performance television", year: 1974 },
    { identifier: "top-of-the-pops-1960s_202401", title: "Top of the Pops — 1960s Collection", subject: "top of the pops british music performance television", year: 1966 },
    { identifier: "retrobritishtelevisionarchive", title: "Retro British Television Archive — Music Performances", subject: "british music performance television archive", year: 1972 },
    { identifier: "KraftMusicHallHostedByMiltonBerleGuestAndyGriffith", title: "Kraft Music Hall — Andy Griffith", subject: "british music hall music performance television", year: 1960 },
    { identifier: "thebeatlesanthology", title: "The Beatles Anthology — Television Performances", subject: "british rock performance music television", year: 1995 },
    { identifier: "totp-surviving-footage-1970", title: "Top of the Pops — Surviving 1970 Footage", subject: "top of the pops british music performance television", year: 1970 },
    { identifier: "PerryComokraftMusicHall1959", title: "Perry Como — Kraft Music Hall", subject: "music hall music performance television", year: 1959 },
    { identifier: "pink-floyd-1967-12-17-bbc-tomorrows-world-session", title: "Pink Floyd — BBC Session", subject: "british rock performance music television", year: 1967 },
  ],
  "130": [
    iaDirectRecovery("premier-league-years-2003-04::Premier League Years 2003:04.mp4", "premier-league-years-2003-04", "Premier League Years 2003:04.mp4", "The Premier League Years — 2003–04", "english football british football soccer match", 2004),
    iaDirectRecovery("blackpool-vs-bolton-wanderers-1953-fa-cup-final::Blackpool vs Bolton Wanderers 1953 FA Cup Final.ia.mp4", "blackpool-vs-bolton-wanderers-1953-fa-cup-final", "Blackpool vs Bolton Wanderers 1953 FA Cup Final.ia.mp4", "Blackpool vs Bolton Wanderers — 1953 FA Cup Final", "english football british football fa cup soccer match", 1953),
    iaDirectRecovery("chelsea-vs-manchester-united-final-fa-cup-2006-07-partido-completofull-match::FULL MATCH   Two Giants Clash At The New Wembley Stadium   Chelsea v Man United   FA Cup Final 06-07.ia.mp4", "chelsea-vs-manchester-united-final-fa-cup-2006-07-partido-completofull-match", "FULL MATCH   Two Giants Clash At The New Wembley Stadium   Chelsea v Man United   FA Cup Final 06-07.ia.mp4", "Chelsea vs Manchester United — 2007 FA Cup Final", "english football british football fa cup soccer match", 2007),
    iaDirectRecovery("the-premier-league-years-2004-2005::The Premier League Years 2004-2005.mp4", "the-premier-league-years-2004-2005", "The Premier League Years 2004-2005.mp4", "The Premier League Years — 2004–05", "english football british football premier league soccer match", 2005),
    iaDirectRecovery("espana-inglaterra-euro-2024::España-Inglaterra.mp4", "espana-inglaterra-euro-2024", "España-Inglaterra.mp4", "UEFA Euro Final — Spain vs England", "english football british football soccer match", 2024),
  ],
  "242": [
    iaDirectRecovery("wholeearthsinvisiblecolors::wholeearthsinvisiblecolors.mp4", "wholeearthsinvisiblecolors", "wholeearthsinvisiblecolors.mp4", "Whole Earth's Invisible Colors", "earth observation satellite imagery earth from space remote sensing", 1973),
    iaDirectRecovery("NasaConnect-Aatc-FutureNasaTechnology_837::NASAAATC-FutureNASATechnology.mp4", "NasaConnect-Aatc-FutureNasaTechnology_837", "NASAAATC-FutureNASATechnology.mp4", "NASA Connect — Future NASA Technology", "earth observation satellite imagery earth from space remote sensing", 2001),
    iaDirectRecovery("NasaConnect-Ht-RemoteSensing::NASAHT-RemoteSensing.mp4", "NasaConnect-Ht-RemoteSensing", "NASAHT-RemoteSensing.mp4", "NASA Connect — Remote Sensing", "earth observation satellite imagery earth from space remote sensing", 2005),
    iaDirectRecovery("blue.planet::BLUE_PLANET.mp4", "blue.planet", "BLUE_PLANET.mp4", "Blue Planet", "earth observation earth from space environmental film", 1990),
    iaDirectRecovery("NasaConnect-HiddenTreasuresLandscapeArcheology::NASAConnect-HiddenTreasures.mp4", "NasaConnect-HiddenTreasuresLandscapeArcheology", "NASAConnect-HiddenTreasures.mp4", "NASA Connect — Hidden Treasures", "earth observation satellite imagery earth from space remote sensing", 2005),
  ],
  "702": [
    iaDirectRecovery("DayofTha1951::DayofTha1951.mp4", "DayofTha1951", "DayofTha1951.mp4", "A Day of Thanksgiving", "thanksgiving thanksgiving film harvest special", 1951),
    iaDirectRecovery("HalloweenThanksgiving::Halloween & Thanksgiving.mp4", "HalloweenThanksgiving", "Halloween & Thanksgiving.mp4", "Bear in the Big Blue House — Thanksgiving", "thanksgiving thanksgiving special harvest television", 2000),
    iaDirectRecovery("AsWeLikeIt::AsWeLikeIt.mp4", "AsWeLikeIt", "AsWeLikeIt.mp4", "As We Like It", "thanksgiving harvest family special television", 1952),
    iaDirectRecovery("opening-to-blues-clues-stop-look-and-listen-2000-vhs-1080p::Opening to Blues Clues Stop Look and Listen 2000 VHS1080p.mp4", "opening-to-blues-clues-stop-look-and-listen-2000-vhs-1080p", "Opening to Blues Clues Stop Look and Listen 2000 VHS1080p.mp4", "Blue's Clues — Stop, Look and Listen", "thanksgiving family television harvest special", 2000),
    iaDirectRecovery("opening-to-a-charlie-brown-christmas-1998-vhs-720p::Opening to A Charlie Brown Christmas 1998 VHS 720p.mp4", "opening-to-a-charlie-brown-christmas-1998-vhs-720p", "Opening to A Charlie Brown Christmas 1998 VHS 720p.mp4", "A Charlie Brown Christmas VHS", "thanksgiving family television holiday special", 1998),
    iaDirectRecovery("GeorgeBurnsGracieAllen-Thanksgiving::burnsallen-thanksgiving.mp4", "GeorgeBurnsGracieAllen-Thanksgiving", "burnsallen-thanksgiving.mp4", "The George Burns and Gracie Allen Show — Thanksgiving", "thanksgiving thanksgiving television special harvest comedy", 1951),
    iaDirectRecovery("Liberace_Thanksgiving::Liberace.mp4", "Liberace_Thanksgiving", "Liberace.mp4", "Liberace Thanksgiving", "thanksgiving thanksgiving television special harvest music", 1954),
    iaDirectRecovery("macysthanksgivingdayparade1988withcommercialsvhs_201912::Macy's Thanksgiving Day Parade 1988.mp4", "macysthanksgivingdayparade1988withcommercialsvhs_201912", "Macy's Thanksgiving Day Parade 1988.mp4", "Macy's Thanksgiving Day Parade — 1988", "thanksgiving thanksgiving parade television special harvest", 1988),
    iaDirectRecovery("macysthanksgivingdayparade1989full::Macy's Thanksgiving Day Parade 1989 (full).mp4", "macysthanksgivingdayparade1989full", "Macy's Thanksgiving Day Parade 1989 (full).mp4", "Macy's Thanksgiving Day Parade — 1989", "thanksgiving thanksgiving parade television special harvest", 1989),
    iaDirectRecovery("garfieldsthanksgiving::Garfield's Thanksgiving.mp4", "garfieldsthanksgiving", "Garfield's Thanksgiving.mp4", "Garfield's Thanksgiving", "thanksgiving thanksgiving television special harvest family", 1989),
  ],
  "114": [
    iaDirectRecovery("the-36th-chamber-of-shaolin::The 36th Chamber of Shaolin 1978 1080p BluRay x264 Chinese AAC - Ozlem.ia.mp4", "the-36th-chamber-of-shaolin", "The 36th Chamber of Shaolin 1978 1080p BluRay x264 Chinese AAC - Ozlem.ia.mp4", "The 36th Chamber of Shaolin", "shaw brothers kung fu martial arts film", 1978),
    iaDirectRecovery("the-36th-chamber-of-shaolin-1978::The 36th Chamber Of Shaolin (1978).mp4", "the-36th-chamber-of-shaolin-1978", "The 36th Chamber Of Shaolin (1978).mp4", "The 36th Chamber of Shaolin — 1978", "shaw brothers kung fu martial arts film", 1978),
    iaDirectRecovery("intimate-confessions-of-a-chinese-courtesan-1972", "intimate-confessions-of-a-chinese-courtesan-1972", "Intimate.Confessions.Of.A.Chinese.Courtesan.1972.1080p.BluRay.x264.AAC-[YTS.MX].mp4", "Intimate Confessions of a Chinese Courtesan", "shaw brothers kung fu martial arts film", 1972),
    iaDirectRecovery("the-kid-with-the-golden-arm", "the-kid-with-the-golden-arm", "The Kid with the Golden Arm.mp4", "The Kid with the Golden Arm", "shaw brothers kung fu martial arts film", 1981),
    iaDirectRecovery("legendary-weapons-of-china", "legendary-weapons-of-china", "Legendary Weapons Of China [1982].x264.DVDrip(ShawBros.KungFu).ia.mp4", "Legendary Weapons of China", "shaw brothers kung fu martial arts film", 1982),
  ],
  "153": [
    iaDirectRecovery("powerpuff-girls-complete-series::Powerpuff Girls - 01,01 - Insect Inside - Powerpuff Bluff.mp4", "powerpuff-girls-complete-series", "Powerpuff Girls - 01,01 - Insect Inside - Powerpuff Bluff.mp4", "The Powerpuff Girls — Insect Inside / Powerpuff Bluff", "television cartoon animated television cartoon episode", 1998),
    iaDirectRecovery("powerpuff-girls-complete-series::Powerpuff Girls - 01,02 - Monkey See, Doggie Do - Mommy Fearest.mp4", "powerpuff-girls-complete-series", "Powerpuff Girls - 01,02 - Monkey See, Doggie Do - Mommy Fearest.mp4", "The Powerpuff Girls — Monkey See, Doggie Do / Mommy Fearest", "television cartoon animated television cartoon episode", 1998),
    iaDirectRecovery("powerpuff-girls-complete-series::Powerpuff Girls - 01,03 - Octi Evil - Geshundfight.mp4", "powerpuff-girls-complete-series", "Powerpuff Girls - 01,03 - Octi Evil - Geshundfight.mp4", "The Powerpuff Girls — Octi Evil / Geshundfight", "television cartoon animated television cartoon episode", 1998),
    iaDirectRecovery("powerpuff-girls-complete-series::Powerpuff Girls - 01,04 - Buttercrush - Fuzzy Logic.mp4", "powerpuff-girls-complete-series", "Powerpuff Girls - 01,04 - Buttercrush - Fuzzy Logic.mp4", "The Powerpuff Girls — Buttercrush / Fuzzy Logic", "television cartoon animated television cartoon episode", 1998),
    iaDirectRecovery("powerpuff-girls-complete-series::Powerpuff Girls - 01,05 - Boogie Frights - Abracadaver.mp4", "powerpuff-girls-complete-series", "Powerpuff Girls - 01,05 - Boogie Frights - Abracadaver.mp4", "The Powerpuff Girls — Boogie Frights / Abracadaver", "television cartoon animated television cartoon episode", 1998),
  ],
  "156": [
    iaDirectRecovery("ReadingRainbowTVSeries::Reading.Rainbow.S01E01.Tight.Times.480p.AMZN.WEB-DL.DD.2.0.x264-RTN.mp4", "ReadingRainbowTVSeries", "Reading.Rainbow.S01E01.Tight.Times.480p.AMZN.WEB-DL.DD.2.0.x264-RTN.mp4", "Reading Rainbow — Tight Times", "children's television kids television educational program", 1983),
    iaDirectRecovery("ReadingRainbowTVSeries::Reading.Rainbow.S01E02.Miss.Nelson.is.Back.480p.AMZN.WEB-DL.DD.2.0.x264-RTN.mp4", "ReadingRainbowTVSeries", "Reading.Rainbow.S01E02.Miss.Nelson.is.Back.480p.AMZN.WEB-DL.DD.2.0.x264-RTN.mp4", "Reading Rainbow — Miss Nelson Is Back", "children's television kids television educational program", 1983),
    iaDirectRecovery("ReadingRainbowTVSeries::Reading.Rainbow.S01E03.Bea.and.Mr.Jones.480p.AMZN.WEB-DL.DD.2.0.x264-RTN.mp4", "ReadingRainbowTVSeries", "Reading.Rainbow.S01E03.Bea.and.Mr.Jones.480p.AMZN.WEB-DL.DD.2.0.x264-RTN.mp4", "Reading Rainbow — Bea and Mr. Jones", "children's television kids television educational program", 1983),
    iaDirectRecovery("ReadingRainbowTVSeries::Reading.Rainbow.S01E04.Bringing.the.Rain.to.Kapiti.Plain.480p.AMZN.WEB-DL.DD.2.0.x264-RTN.mp4", "ReadingRainbowTVSeries", "Reading.Rainbow.S01E04.Bringing.the.Rain.to.Kapiti.Plain.480p.AMZN.WEB-DL.DD.2.0.x264-RTN.mp4", "Reading Rainbow — Bringing the Rain to Kapiti Plain", "children's television kids television educational program", 1983),
    iaDirectRecovery("ReadingRainbowTVSeries::Reading.Rainbow.S01E05.Louis.the.Fish.480p.AMZN.WEB-DL.DD.2.0.x264-RTN.mp4", "ReadingRainbowTVSeries", "Reading.Rainbow.S01E05.Louis.the.Fish.480p.AMZN.WEB-DL.DD.2.0.x264-RTN.mp4", "Reading Rainbow — Louis the Fish", "children's television kids television educational program", 1983),
  ],
  "214": [
    iaDirectRecovery("AboutBan1935", "AboutBan1935", "AboutBan1935.mp4", "About Bananas", "farm farming agriculture rural america agricultural film", 1935),
    iaDirectRecovery("FromtheG1954", "FromtheG1954", "FromtheG1954.mp4", "From the Ground Up", "farm farming agriculture rural america agricultural film", 1954),
    iaDirectRecovery("ForHealt1941", "ForHealt1941", "ForHealt1941.mp4", "For Health and Happiness", "farm farming agriculture rural america agricultural film", 1941),
    iaDirectRecovery("TexasFar1952", "TexasFar1952", "TexasFar1952.mp4", "Texas Farm Family", "farm farming agriculture rural america agricultural film", 1952),
    iaDirectRecovery("Breakfas1939", "Breakfas1939", "Breakfas1939.mp4", "Breakfast Pals", "farm farming agriculture rural america agricultural film", 1939),
  ],
  "226": [
    iaDirectRecovery("american-experience-episodes::S01E01 - The Great San Francisco Earthquake (October 4, 1988).mp4", "american-experience-episodes", "S01E01 - The Great San Francisco Earthquake (October 4, 1988).mp4", "American Experience — The Great San Francisco Earthquake", "pbs documentary american experience documentary television", 1988),
    iaDirectRecovery("american-experience-episodes::S01E02 - Radio Bikini (October 11, 1988).mp4", "american-experience-episodes", "S01E02 - Radio Bikini (October 11, 1988).mp4", "American Experience — Radio Bikini", "pbs documentary american experience documentary television", 1988),
    iaDirectRecovery("american-experience-episodes::S01E03 - Indians, Outlaws, and Angie Debo (October 18, 1988).mp4", "american-experience-episodes", "S01E03 - Indians, Outlaws, and Angie Debo (October 18, 1988).mp4", "American Experience — Indians, Outlaws, and Angie Debo", "pbs documentary american experience documentary television", 1988),
    iaDirectRecovery("american-experience-episodes::S01E04 - Eric Sevareid's Not So Wild a Dream (October 25, 1988).mp4", "american-experience-episodes", "S01E04 - Eric Sevareid's Not So Wild a Dream (October 25, 1988).mp4", "American Experience — Eric Sevareid's Not So Wild a Dream", "pbs documentary american experience documentary television", 1988),
    iaDirectRecovery("american-experience-episodes::S01E05 - The Life & Times of Rosie the Riveter (November 1, 1988).mp4", "american-experience-episodes", "S01E05 - The Life & Times of Rosie the Riveter (November 1, 1988).mp4", "American Experience — The Life & Times of Rosie the Riveter", "pbs documentary american experience documentary television", 1988),
  ],
  "237": [
    iaDirectRecovery("MIT6.00F08", "MIT6.00F08", "mit-6-00-f08-lec01_300k.mp4", "MIT Introduction to Computer Science and Programming", "science and technology computer science engineering future technology", 2009),
    iaDirectRecovery("OurWorldGravityInSpace", "OurWorldGravityInSpace", "OW48GravityOC.mp4", "Our World — Gravity in Space", "science and technology engineering future technology robotics", 2010),
    iaDirectRecovery("NASA_eClips_Solar_System_HD", "NASA_eClips_Solar_System_HD", "NASA_Our_World_Solar_System_cropped_Med.mp4", "Our World — What Is the Solar System?", "science and technology engineering future technology robotics", 2010),
    iaDirectRecovery("OurWorldWindTunnelsInAction", "OurWorldWindTunnelsInAction", "OW47WindTunnels0317.ia.mp4", "Our World — Wind Tunnels in Action", "science and technology engineering future technology robotics", 2010),
    iaDirectRecovery("NASA_Our_World_Eye_In_The_Sky_HD", "NASA_Our_World_Eye_In_The_Sky_HD", "NASA_Our_World_Eye_In_The_Sky_HD.ogv", "Our World — Eyes in the Sky", "science and technology engineering future technology robotics", 2010),
  ],
  "115": [
    iaDirectRecovery("1989gojirataibiorante.720p.ac3.cg::1989 Gojira tai Biorante.720p.ac3.CG.mp4", "1989gojirataibiorante.720p.ac3.cg", "1989 Gojira tai Biorante.720p.ac3.CG.mp4", "Godzilla vs. Biollante (1989)", "kaiju godzilla japanese monster movie", 1989),
    iaDirectRecovery("1992gojirataimosura.720p.ac3.cg::1992 Gojira tai Mosura.720p.ac3.CG.mp4", "1992gojirataimosura.720p.ac3.cg", "1992 Gojira tai Mosura.720p.ac3.CG.mp4", "Godzilla vs. Mothra (1992)", "kaiju godzilla mothra japanese monster movie", 1992),
    iaDirectRecovery("thereturnofgodzilla1984::THE RETURN OF GODZILLA (1984) Japanese version (HD).mp4", "thereturnofgodzilla1984", "THE RETURN OF GODZILLA (1984) Japanese version (HD).mp4", "The Return of Godzilla (1984)", "kaiju godzilla japanese monster movie", 1984),
    iaDirectRecovery("GodzillaThingRedMenace::Godzilla vs. the Thing - Red Menace Reconstruction.mp4", "GodzillaThingRedMenace", "Godzilla vs. the Thing - Red Menace Reconstruction.mp4", "Godzilla vs. the Thing (1964)", "kaiju godzilla mothra japanese monster movie", 1964),
    iaDirectRecovery("ultraman-monster-movie-feature-1967::Ultraman Monster Movie Feature (1967).ia.mp4", "ultraman-monster-movie-feature-1967", "Ultraman Monster Movie Feature (1967).ia.mp4", "Ultraman: Monster Movie Feature (1967)", "tokusatsu kaiju ultraman japanese monster movie", 1967),
    iaDirectRecovery("godzilla-1984-americanized-version::godzilla-1984-americanized-version.mp4", "godzilla-1984-americanized-version", "godzilla-1984-americanized-version.mp4", "Godzilla 1985", "kaiju godzilla japanese monster movie", 1985),
    iaDirectRecovery("mothra-1961-4-k-remaster-w-english-subtitles::MOTHRA (1961) 4K Remaster W: English Subtitles.ia.mp4", "mothra-1961-4-k-remaster-w-english-subtitles", "MOTHRA (1961) 4K Remaster W: English Subtitles.ia.mp4", "Mothra (1961) — 4K Remaster", "kaiju godzilla mothra japanese monster movie", 1961),
    iaDirectRecovery("ultraman1::Ultraman _ Capítulo 1 (Sub. Español) Operación Ultra No.1.mp4", "ultraman1", "Ultraman _ Capítulo 1 (Sub. Español) Operación Ultra No.1.mp4", "Ultraman — Operation Ultra No. 1", "tokusatsu kaiju ultraman japanese monster movie", 1966),
    iaDirectRecovery("UQ2BN::Ultra Q capítulo 2 (Sub. Español) Goro y Goroh.mp4", "UQ2BN", "Ultra Q capítulo 2 (Sub. Español) Goro y Goroh.mp4", "Ultra Q — Goro and Goroh", "tokusatsu kaiju japanese monster television", 1966),
    iaDirectRecovery("giant-beast-planet::Giant Beast Planet.ia.mp4", "giant-beast-planet", "Giant Beast Planet.ia.mp4", "Giant Beast Planet", "kaiju giant monster science fiction creature feature", 1965),
  ],
  "928": [
    iaDirectRecovery("001netlabel-jazz-01-recorcholis::01-recorcholis.mp3", "001netlabel-jazz-01-recorcholis", "01-recorcholis.mp3", "Recorcholis — Jazz Netlabel", "jazz contemporary jazz free jazz instrumental radio", 2010, "audio"),
    iaDirectRecovery("001netlabel-jazz-01-recorcholis::02-flujo.mp3", "001netlabel-jazz-01-recorcholis", "02-flujo.mp3", "Recorcholis — Flujo", "jazz contemporary jazz free jazz instrumental radio", 2010, "audio"),
    iaDirectRecovery("001netlabel-jazz-01-recorcholis::03-linea.mp3", "001netlabel-jazz-01-recorcholis", "03-linea.mp3", "Recorcholis — Linea", "jazz contemporary jazz free jazz instrumental radio", 2010, "audio"),
    iaDirectRecovery("001netlabel-jazz-01-recorcholis::04-telonio.mp3", "001netlabel-jazz-01-recorcholis", "04-telonio.mp3", "Recorcholis — Telonio", "jazz contemporary jazz free jazz instrumental radio", 2010, "audio"),
    iaDirectRecovery("ca200_cjazz::101_Strings_Of_Consciousness__Asphodel.mp3", "ca200_cjazz", "101_Strings_Of_Consciousness__Asphodel.mp3", "Clinical Jazz — Strings of Consciousness", "jazz free jazz avant-garde contemporary jazz radio", 2008, "audio"),
    iaDirectRecovery("ca200_cjazz::102_The_Black_Hakawati__There_s_a_Hole_at_the_End_of_the_Tunnel.mp3", "ca200_cjazz", "102_The_Black_Hakawati__There_s_a_Hole_at_the_End_of_the_Tunnel.mp3", "Clinical Jazz — The Black Hakawati", "jazz free jazz avant-garde contemporary jazz radio", 2008, "audio"),
    iaDirectRecovery("ca200_cjazz::103_Professor_Psygrooves_friends__Scales_Special_Version.mp3", "ca200_cjazz", "103_Professor_Psygrooves_friends__Scales_Special_Version.mp3", "Clinical Jazz — Scales (Special Version)", "jazz free jazz avant-garde contemporary jazz radio", 2008, "audio"),
    iaDirectRecovery("ca200_cjazz::104_Damo_Suzuki_and_NOW__Metro_Girl__unedited_20_min_version.mp3", "ca200_cjazz", "104_Damo_Suzuki_and_NOW__Metro_Girl__unedited_20_min_version.mp3", "Clinical Jazz — Metro Girl", "jazz free jazz avant-garde contemporary jazz radio", 2008, "audio"),
    iaDirectRecovery("ca200_cjazz::105_Morgan_Fisher__MO_30_1_CUT.mp3", "ca200_cjazz", "105_Morgan_Fisher__MO_30_1_CUT.mp3", "Clinical Jazz — MO 30", "jazz free jazz avant-garde contemporary jazz radio", 2008, "audio"),
    iaDirectRecovery("Aestrid_144::01Aestrid.mp3", "Aestrid_144", "01Aestrid.mp3", "Aestrid — Smooth Jazz", "jazz smooth jazz contemporary jazz instrumental radio", 2007, "audio"),
    iaDirectRecovery("Aestrid_144::02GilsWomen.mp3", "Aestrid_144", "02GilsWomen.mp3", "Aestrid — Gil's Women", "jazz smooth jazz contemporary jazz instrumental radio", 2007, "audio"),
    iaDirectRecovery("Sorrow-Line259::Sorrow-Line259.mp3", "Sorrow-Line259", "Sorrow-Line259.mp3", "Sorrow — Line 259", "jazz contemporary jazz instrumental radio", 2010, "audio"),
    iaDirectRecovery("MIXG032::01_Zipp_-_Pour_Quoi_Royale.mp3", "MIXG032", "01_Zipp_-_Pour_Quoi_Royale.mp3", "Retrovision — Pour Quoi Royale", "jazz contemporary jazz free music radio", 2013, "audio"),
    iaDirectRecovery("MIXG032::02_Dog_On_Springs_-_Footloose_feat_Paul_Whiteman.mp3", "MIXG032", "02_Dog_On_Springs_-_Footloose_feat_Paul_Whiteman.mp3", "Retrovision — Footloose", "jazz contemporary jazz free music radio", 2013, "audio"),
    iaDirectRecovery("MIXG032::03_Astat_-_Daily_Dozen.mp3", "MIXG032", "03_Astat_-_Daily_Dozen.mp3", "Retrovision — Daily Dozen", "jazz contemporary jazz free music radio", 2013, "audio"),
  ],
});
/* File-level freshness expansions are kept in a separate object so they can
   be layered onto the long-tail bank without duplicate object keys. */
const IA_LONG_TAIL_EXPANSIONS_EXTRA = Object.freeze({
  /* v111 IA deep harvest: verified records from collection-level discovery.
     These banks are intentionally family-balanced and remain behind the
     normal theme, deny, runtime, media, and freshness gates. They widen the
     catalog without making the first tune wait for every Archive manifest. */
  "10": [
    iaDirectRecovery("theloneranger_201705::s01e01_EntertheLoneRanger.mp4", "theloneranger_201705", "s01e01_EntertheLoneRanger.mp4", "The Lone Ranger · Enter the Lone Ranger", "classic television western television series", 1949),
    iaDirectRecovery("get-smart::Get Smart S01E01 (Mr. Big).mp4", "get-smart", "Get Smart S01E01 (Mr. Big).mp4", "Get Smart · Mr. Big", "classic television sitcom spy comedy television series", 1965),
    iaDirectRecovery("GreenAcresCompleteSeries::Green Acres Season 1/Green Acres - 001 - Oliver Buys A Farm.mp4", "GreenAcresCompleteSeries", "Green Acres Season 1/Green Acres - 001 - Oliver Buys A Farm.mp4", "Green Acres · Oliver Buys a Farm", "classic television sitcom family comedy television series", 1965),
    iaDirectRecovery("Bonanza_-_The_Trail_Gang::Bonanza_-_The_Trail_Gang_512kb.mp4", "Bonanza_-_The_Trail_Gang", "Bonanza_-_The_Trail_Gang_512kb.mp4", "Bonanza · The Trail Gang", "classic television western television series", 1959),
    iaDirectRecovery("Bonanza_-_Day_Of_Reckoning::Bonanza_-_Day_Of_Reckoning_512kb.mp4", "Bonanza_-_Day_Of_Reckoning", "Bonanza_-_Day_Of_Reckoning_512kb.mp4", "Bonanza · Day of Reckoning", "classic television western television series", 1959),
    iaDirectRecovery("Bonanza-BitterWater::Bonanza_Bitter_Water_S01-E29_512kb.mp4", "Bonanza-BitterWater", "Bonanza_Bitter_Water_S01-E29_512kb.mp4", "Bonanza · Bitter Water", "classic television western television series", 1960),
    iaDirectRecovery("Bonanza-TheFearMerchants::Bonanza_-_The_Fear_Merchants_S01-E20_512kb.mp4", "Bonanza-TheFearMerchants", "Bonanza_-_The_Fear_Merchants_S01-E20_512kb.mp4", "Bonanza · The Fear Merchants", "classic television western television series", 1960),
    iaDirectRecovery("SherlockHolmes1954::Sherlock Holmes 01 The Case of the Cunningham Heritage.mp4", "SherlockHolmes1954", "Sherlock Holmes 01 The Case of the Cunningham Heritage.mp4", "The Adventures of Sherlock Holmes · The Case of the Cunningham Heritage", "classic television mystery detective television series", 1954),
    iaDirectRecovery("Dragnet1951::Dragnet/Season 1/Dragnet (1951) - S01E01 - The Human Bomb.mp4", "Dragnet1951", "Dragnet/Season 1/Dragnet (1951) - S01E01 - The Human Bomb.mp4", "Dragnet · The Human Bomb", "classic television police procedural detective television series", 1951),
    iaDirectRecovery("You_Bet_Your_Life_Groucho::You_Bet_Your_Life_Groucho_Marx_512kb.mp4", "You_Bet_Your_Life_Groucho", "You_Bet_Your_Life_Groucho_Marx_512kb.mp4", "You Bet Your Life · Groucho Marx", "classic television panel show variety television series", 1954),
    iaDirectRecovery("The_Beverly_Hillbillies::GRANNYS_GARDEN_512kb.mp4", "The_Beverly_Hillbillies", "GRANNYS_GARDEN_512kb.mp4", "The Beverly Hillbillies · Granny's Garden", "classic television sitcom television series", 1962),
    iaDirectRecovery("the-benny-hill-show::01 - Benny Hill.mp4", "the-benny-hill-show", "01 - Benny Hill.mp4", "The Benny Hill Show", "classic television comedy variety television series", 1969),
  ],
  "11": [
    iaDirectRecovery("Shogun_Miniseries::Shogun 1.mp4", "Shogun_Miniseries", "Shogun 1.mp4", "Shōgun · Episode 1", "modern television miniseries historical drama television series", 1980),
    iaDirectRecovery("pride-and-prejudice-1995-miniseries::Pride.and.Prejudice.1995.S01E01.720p.BluRay.x264-GalaxyTV.mp4", "pride-and-prejudice-1995-miniseries", "Pride.and.Prejudice.1995.S01E01.720p.BluRay.x264-GalaxyTV.mp4", "Pride and Prejudice · Episode 1", "modern television miniseries drama television series", 1995),
    iaDirectRecovery("mahabharat-1988-tv-series::64 भगवान श्री कृष्ण शांतिदूत क्यूँ बने थे_ _ Mahabharat Stories _ B. R. Chopra _ EP – 64.mp4", "mahabharat-1988-tv-series", "64 भगवान श्री कृष्ण शांतिदूत क्यूँ बने थे_ _ Mahabharat Stories _ B. R. Chopra _ EP – 64.mp4", "Mahabharat · Episode 64", "modern television drama television series", 1988),
    iaDirectRecovery("miss-marple-1984-92::Agatha Christie's Miss Marple (1984 - 92)/01 The Body in the Library (1984)/S01Ep01 The Body in the Library (Part One).mp4", "miss-marple-1984-92", "Agatha Christie's Miss Marple (1984 - 92)/01 The Body in the Library (1984)/S01Ep01 The Body in the Library (Part One).mp4", "Agatha Christie's Miss Marple · The Body in the Library", "modern television mystery detective television series", 1984),
    iaDirectRecovery("allo-allo::01 - Allo Allo S1E00 - The British Are Coming [Pilot].mp4", "allo-allo", "01 - Allo Allo S1E00 - The British Are Coming [Pilot].mp4", "'Allo 'Allo · The British Are Coming", "modern television sitcom comedy television series", 1984),
    iaDirectRecovery("keeping-up-appearances_202402::Keeping_Up_Appearances_S01_E01.mp4", "keeping-up-appearances_202402", "Keeping_Up_Appearances_S01_E01.mp4", "Keeping Up Appearances · Episode 1", "modern television sitcom comedy television series", 1990),
    iaDirectRecovery("walking-with-dinosaurs::Episode 1 - New Blood.mp4", "walking-with-dinosaurs", "Episode 1 - New Blood.mp4", "Walking with Dinosaurs · New Blood", "modern television natural history series documentary television", 1999),
    iaDirectRecovery("forensic-files-collection::Forensic Files   01x09   Deadly Neighborhoods.mp4", "forensic-files-collection", "Forensic Files   01x09   Deadly Neighborhoods.mp4", "Forensic Files · Deadly Neighborhoods", "modern television documentary series television", 1996),
  ],
  "12": [
    iaDirectRecovery("003-1986-05-16::003_1986-05-16.mp4", "003-1986-05-16", "003_1986-05-16.mp4", "Takeshi's Castle", "game show quiz show television contest", 1986),
    iaDirectRecovery("nickelodeon-guts-season-1::Episode 101.mp4", "nickelodeon-guts-season-1", "Episode 101.mp4", "Nickelodeon GUTS · Season 1", "game show children's game show sports contest television", 1992),
    iaDirectRecovery("nickelodeon-guts-season-2::Episode 200.mp4", "nickelodeon-guts-season-2", "Episode 200.mp4", "Nickelodeon GUTS · Season 2", "game show children's game show sports contest television", 1993),
    iaDirectRecovery("nickelodeon-guts-season-3::Episode 301.mp4", "nickelodeon-guts-season-3", "Episode 301.mp4", "Nickelodeon GUTS · Season 3", "game show children's game show sports contest television", 1994),
    iaDirectRecovery("weakestlinkepisodes::2003 Howard Video March 1 2003.mp4", "weakestlinkepisodes", "2003 Howard Video March 1 2003.mp4", "The Weakest Link · March 1, 2003", "game show quiz show television contest", 2003),
    iaDirectRecovery("Price_Is-Right_1957::Price_Is_Right_512kb.mp4", "Price_Is-Right_1957", "Price_Is_Right_512kb.mp4", "The Price Is Right · 1957 Episode", "game show quiz show television contest", 1957),
    iaDirectRecovery("The64000Question-dateToBeAdded::The64000Question1956.mp4", "The64000Question-dateToBeAdded", "The64000Question1956.mp4", "The $64,000 Question · 18 September 1956", "game show quiz show television contest", 1956),
    iaDirectRecovery("j20011015::j20011015.mp4", "j20011015", "j20011015.mp4", "Jeopardy! · 15 October 2001", "game show quiz show television contest", 2001),
    iaDirectRecovery("strikeItRich-26August1955::StrikeItRich26August1955.mp4", "strikeItRich-26August1955", "StrikeItRich26August1955.mp4", "Strike It Rich · 26 August 1955", "game show quiz show television contest", 1955),
    iaDirectRecovery("1958EpisodeOfqueenForADay::QueenForADayMarch1958.mp4", "1958EpisodeOfqueenForADay", "QueenForADayMarch1958.mp4", "Queen for a Day · 1958 Episode", "game show quiz show television contest", 1958),
    iaDirectRecovery("Wife_Johnny::Do_You_Trust_Your_Wife_512kb.mp4", "Wife_Johnny", "Do_You_Trust_Your_Wife_512kb.mp4", "Do You Trust Your Wife? · Johnny Carson", "game show quiz show television contest", 1958),
  ],
  "150": [
    iaDirectRecovery("hectors_hectic_life::hectors_hectic_life_512kb.mp4", "hectors_hectic_life", "hectors_hectic_life_512kb.mp4", "Hector's Hectic Life", "classic cartoons theatrical cartoon animation", 1948),
    iaDirectRecovery("bb_bamboo_isle::bb_bamboo_isle_512kb.mp4", "bb_bamboo_isle", "bb_bamboo_isle_512kb.mp4", "Betty Boop · Bamboo Isle", "classic cartoons betty boop animation", 1932),
    iaDirectRecovery("bb_ill_be_glad_when_youre_dead::bb_ill_be_glad_when_youre_dead_512kb.mp4", "bb_ill_be_glad_when_youre_dead", "bb_ill_be_glad_when_youre_dead_512kb.mp4", "Betty Boop · I'll Be Glad When You're Dead", "classic cartoons betty boop animation", 1932),
    iaDirectRecovery("noveltoon_naughty_but_nice::noveltoon_naughty_but_nice_512kb.mp4", "noveltoon_naughty_but_nice", "noveltoon_naughty_but_nice_512kb.mp4", "Noveltoon · Naughty But Mice", "classic cartoons theatrical cartoon animation", 1947),
    iaDirectRecovery("bb_rise_to_fame::bb_rise_to_fame_512kb.mp4", "bb_rise_to_fame", "bb_rise_to_fame_512kb.mp4", "Betty Boop's Rise to Fame", "classic cartoons betty boop animation", 1934),
    iaDirectRecovery("bb_and_the_little_king::bb_and_the_little_king_512kb.mp4", "bb_and_the_little_king", "bb_and_the_little_king_512kb.mp4", "Betty Boop and the Little King", "classic cartoons betty boop animation", 1936),
    iaDirectRecovery("noveltoon_the_stupidstitious_cat::noveltoon_the_stupidstitious_cat_512kb.mp4", "noveltoon_the_stupidstitious_cat", "noveltoon_the_stupidstitious_cat_512kb.mp4", "Noveltoon · The Stupidstitious Cat", "classic cartoons theatrical cartoon animation", 1946),
    iaDirectRecovery("bb_be_human::bb_be_human_512kb.mp4", "bb_be_human", "bb_be_human_512kb.mp4", "Betty Boop · Be Human", "classic cartoons betty boop animation", 1936),
    iaDirectRecovery("bb_big_boss::bb_big_boss_512kb.mp4", "bb_big_boss", "bb_big_boss_512kb.mp4", "Betty Boop's Big Boss", "classic cartoons betty boop animation", 1933),
    iaDirectRecovery("the_talking_magpies::the_talking_magpies_512kb.mp4", "the_talking_magpies", "the_talking_magpies_512kb.mp4", "The Talking Magpies", "classic cartoons theatrical cartoon animation", 1946),
    iaDirectRecovery("Betty_Boop_for_President_1932::Betty_Boop_for_President_1932_512kb.mp4", "Betty_Boop_for_President_1932", "Betty_Boop_for_President_1932_512kb.mp4", "Betty Boop for President", "classic cartoons betty boop animation", 1932),
    iaDirectRecovery("bb_betty_in_blunderland::bb_betty_in_blunderland_512kb.mp4", "bb_betty_in_blunderland", "bb_betty_in_blunderland_512kb.mp4", "Betty Boop · Betty in Blunderland", "classic cartoons betty boop animation", 1933),
    iaDirectRecovery("bb_old_man_of_the_mountain::bb_old_man_of_the_mountain_512kb.mp4", "bb_old_man_of_the_mountain", "bb_old_man_of_the_mountain_512kb.mp4", "Betty Boop · The Old Man of the Mountain", "classic cartoons betty boop animation", 1933),
    iaDirectRecovery("bb_chess_nuts::bb_chess_nuts_512kb.mp4", "bb_chess_nuts", "bb_chess_nuts_512kb.mp4", "Betty Boop · Chess Nuts", "classic cartoons betty boop animation", 1932),
    iaDirectRecovery("bb_happy_you::bb_happy_you_512kb.mp4", "bb_happy_you", "bb_happy_you_512kb.mp4", "Betty Boop · Happy You and Merry Me", "classic cartoons betty boop animation", 1936),
    iaDirectRecovery("little_audry_goofy_goofy_gander::little_audry_goofy_goofy_gander_512kb.mp4", "little_audry_goofy_goofy_gander", "little_audry_goofy_goofy_gander_512kb.mp4", "Little Audry · Goofy Goofy Gander", "classic cartoons theatrical cartoon animation", 1950),
    iaDirectRecovery("bb_stop_that_noise::bb_stop_that_noise_512kb.mp4", "bb_stop_that_noise", "bb_stop_that_noise_512kb.mp4", "Betty Boop · Stop That Noise", "classic cartoons betty boop animation", 1935),
    iaDirectRecovery("bb_musical_mountaineers::bb_musical_mountaineers_512kb.mp4", "bb_musical_mountaineers", "bb_musical_mountaineers_512kb.mp4", "Betty Boop · Musical Mountaineers", "classic cartoons betty boop animation", 1939),
    iaDirectRecovery("bb_house_cleaning_blues::bb_house_cleaning_blues_512kb.mp4", "bb_house_cleaning_blues", "bb_house_cleaning_blues_512kb.mp4", "Betty Boop · House Cleaning Blues", "classic cartoons betty boop animation", 1937),
    iaDirectRecovery("bb_poor_cinderella::bb_poor_cinderella_512kb.mp4", "bb_poor_cinderella", "bb_poor_cinderella_512kb.mp4", "Betty Boop · Poor Cinderella", "classic cartoons betty boop animation", 1934),
    iaDirectRecovery("little_lulu_bargain_counter_attack::little_lulu_bargain_counter_attack_512kb.mp4", "little_lulu_bargain_counter_attack", "little_lulu_bargain_counter_attack_512kb.mp4", "Little Lulu · Bargain Counter Attack", "classic cartoons theatrical cartoon animation", 1946),
  ],
  "153": [
    iaDirectRecovery("spider-mantheanimatedseries::01x05 The Menace of Mysterio.mp4", "spider-mantheanimatedseries", "01x05 The Menace of Mysterio.mp4", "Spider-Man: The Animated Series · The Menace of Mysterio", "modern cartoons animated television cartoon episode", 1994),
    iaDirectRecovery("spider-mantheanimatedseries::01x06 The Sting of the Scorpion.mp4", "spider-mantheanimatedseries", "01x06 The Sting of the Scorpion.mp4", "Spider-Man: The Animated Series · The Sting of the Scorpion", "modern cartoons animated television cartoon episode", 1994),
    iaDirectRecovery("spider-mantheanimatedseries::01x07 Kraven The Hunter.mp4", "spider-mantheanimatedseries", "01x07 Kraven The Hunter.mp4", "Spider-Man: The Animated Series · Kraven the Hunter", "modern cartoons animated television cartoon episode", 1994),
    iaDirectRecovery("spider-mantheanimatedseries::01x08 The Alien Costume (Part 1).mp4", "spider-mantheanimatedseries", "01x08 The Alien Costume (Part 1).mp4", "Spider-Man: The Animated Series · The Alien Costume", "modern cartoons animated television cartoon episode", 1994),
    iaDirectRecovery("DragonTalesTVSeries::Dragon.Tales.S01E05.Pigment.of.Your.Imagination.-.Zak's.Song.WEBRip.AAC2.0.x264-SA89.mp4", "DragonTalesTVSeries", "Dragon.Tales.S01E05.Pigment.of.Your.Imagination.-.Zak's.Song.WEBRip.AAC2.0.x264-SA89.mp4", "Dragon Tales · Pigment of Your Imagination", "modern cartoons animated television cartoon episode", 1999),
    iaDirectRecovery("DragonTalesTVSeries::Dragon.Tales.S01E06.Snow.Dragons.-.The.Fury.Is.Out.on.This.One.WEBRip.AAC2.0.x264-SA89.mp4", "DragonTalesTVSeries", "Dragon.Tales.S01E06.Snow.Dragons.-.The.Fury.Is.Out.on.This.One.WEBRip.AAC2.0.x264-SA89.mp4", "Dragon Tales · Snow Dragons", "modern cartoons animated television cartoon episode", 1999),
    iaDirectRecovery("DragonTalesTVSeries::Dragon.Tales.S01E07.The.Giant.of.Nod.-.The.Big.Sleep.Over.WEBRip.AAC2.0.x264-SA89.mp4", "DragonTalesTVSeries", "Dragon.Tales.S01E07.The.Giant.of.Nod.-.The.Big.Sleep.Over.WEBRip.AAC2.0.x264-SA89.mp4", "Dragon Tales · The Giant of Nod", "modern cartoons animated television cartoon episode", 1999),
    iaDirectRecovery("DragonTalesTVSeries::Dragon.Tales.S01E08.A.Picture's.Worth.a.Thousand.Words.-.The.Talent.Pool.WEBRip.AAC2.0.x264-SA89.mp4", "DragonTalesTVSeries", "Dragon.Tales.S01E08.A.Picture's.Worth.a.Thousand.Words.-.The.Talent.Pool.WEBRip.AAC2.0.x264-SA89.mp4", "Dragon Tales · A Picture's Worth a Thousand Words", "modern cartoons animated television cartoon episode", 1999),
    iaDirectRecovery("powerpuff-girls-complete-series::Powerpuff Girls - 01,06 - Telephonies - Tough Love.mp4", "powerpuff-girls-complete-series", "Powerpuff Girls - 01,06 - Telephonies - Tough Love.mp4", "The Powerpuff Girls · Telephonies / Tough Love", "modern cartoons animated television cartoon episode", 1998),
    iaDirectRecovery("powerpuff-girls-complete-series::Powerpuff Girls - 01,07 - Major Competition - Mr. Mojo’s Rising.mp4", "powerpuff-girls-complete-series", "Powerpuff Girls - 01,07 - Major Competition - Mr. Mojo’s Rising.mp4", "The Powerpuff Girls · Major Competition / Mr. Mojo's Rising", "modern cartoons animated television cartoon episode", 1998),
    iaDirectRecovery("powerpuff-girls-complete-series::Powerpuff Girls - 01,08 - Paste Makes Waste - Ice Sore.mp4", "powerpuff-girls-complete-series", "Powerpuff Girls - 01,08 - Paste Makes Waste - Ice Sore.mp4", "The Powerpuff Girls · Paste Makes Waste / Ice Sore", "modern cartoons animated television cartoon episode", 1998),
    iaDirectRecovery("powerpuff-girls-complete-series::Powerpuff Girls - 01,09 - Bubblevicious - The Bare Facts.mp4", "powerpuff-girls-complete-series", "Powerpuff Girls - 01,09 - Bubblevicious - The Bare Facts.mp4", "The Powerpuff Girls · Bubblevicious / The Bare Facts", "modern cartoons animated television cartoon episode", 1998),
    iaDirectRecovery("powerpuff-girls-complete-series::Powerpuff Girls - 01,10 - Cat Man Do - Impeach Fuzz.mp4", "powerpuff-girls-complete-series", "Powerpuff Girls - 01,10 - Cat Man Do - Impeach Fuzz.mp4", "The Powerpuff Girls · Cat Man Do / Impeach Fuzz", "modern cartoons animated television cartoon episode", 1998),
  ],
  "110": [
    iaDirectRecovery("his_girl_friday::his_girl_friday_512kb.mp4", "his_girl_friday", "his_girl_friday_512kb.mp4", "His Girl Friday", "classic film cinema comedy drama feature film", 1940),
    iaDirectRecovery("VoyagetothePlanetofPrehistoricWomen::VoyagetothePlanetofPrehistoricWomen_512kb.mp4", "VoyagetothePlanetofPrehistoricWomen", "VoyagetothePlanetofPrehistoricWomen_512kb.mp4", "Voyage to the Planet of Prehistoric Women", "classic film cinema science fiction feature film", 1967),
    iaDirectRecovery("house_on_haunted_hill_ipod::house_on_haunted_hill_512kb.mp4", "house_on_haunted_hill_ipod", "house_on_haunted_hill_512kb.mp4", "House on Haunted Hill", "classic film cinema horror feature film", 1959),
    iaDirectRecovery("dressed_to_kill::dressed_to_kill_512kb.mp4", "dressed_to_kill", "dressed_to_kill_512kb.mp4", "Dressed to Kill", "classic film cinema mystery drama feature film", 1946),
    iaDirectRecovery("suddenly::suddenly_512kb.mp4", "suddenly", "suddenly_512kb.mp4", "Suddenly", "classic film cinema crime drama feature film", 1954),
    iaDirectRecovery("TheStranger_0::The_Stranger_512kb.mp4", "TheStranger_0", "The_Stranger_512kb.mp4", "The Stranger", "classic film cinema noir drama feature film", 1946),
    iaDirectRecovery("mclintok_widescreen::McLintock_512kb.mp4", "mclintok_widescreen", "McLintock_512kb.mp4", "McLintock!", "classic film cinema western comedy feature film", 1963),
    iaDirectRecovery("ThePhantomoftheOpera::Phantom_of_the_Opera_512kb.mp4", "ThePhantomoftheOpera", "Phantom_of_the_Opera_512kb.mp4", "The Phantom of the Opera", "classic film cinema silent film horror feature film", 1925),
  ],
  "111": [
    iaDirectRecovery("sex_madness::sex_madness_512kb.mp4", "sex_madness", "sex_madness_512kb.mp4", "Sex Madness", "drive-in exploitation cult film grindhouse feature film", 1938),
    iaDirectRecovery("reefer_madness1938::reefer_madness1938_512kb.mp4", "reefer_madness1938", "reefer_madness1938_512kb.mp4", "Reefer Madness", "drive-in exploitation cult film grindhouse feature film", 1938),
    iaDirectRecovery("DoubleFeatureHell2theGrindhouseExperience::DoubleFeatureHell2theGrindhouseExperience.mp4", "DoubleFeatureHell2theGrindhouseExperience", "DoubleFeatureHell2theGrindhouseExperience.mp4", "Double Feature Hell 2 · The Grindhouse Experience", "drive-in exploitation grindhouse cult film feature film", 2010),
    iaDirectRecovery("BloodyPitOfHorror::BloodyPitOfHorror.mp4", "BloodyPitOfHorror", "BloodyPitOfHorror.mp4", "Bloody Pit of Horror", "drive-in horror cult film grindhouse feature film", 1965),
    iaDirectRecovery("house_on_haunted_hill_ipod::house_on_haunted_hill_512kb.mp4", "house_on_haunted_hill_ipod", "house_on_haunted_hill_512kb.mp4", "House on Haunted Hill", "drive-in horror cult film feature film", 1959),
    iaDirectRecovery("VoyagetothePlanetofPrehistoricWomen::VoyagetothePlanetofPrehistoricWomen_512kb.mp4", "VoyagetothePlanetofPrehistoricWomen", "VoyagetothePlanetofPrehistoricWomen_512kb.mp4", "Voyage to the Planet of Prehistoric Women", "drive-in science fiction monster movie feature film", 1967),
    iaDirectRecovery("TheFastandtheFuriousJohnIreland1954goofyrip::TheFastandtheFuriousJohnIreland1954goofyrip_512kb.mp4", "TheFastandtheFuriousJohnIreland1954goofyrip", "TheFastandtheFuriousJohnIreland1954goofyrip_512kb.mp4", "The Fast and the Furious", "drive-in crime film action feature film", 1955),
  ],
  "80": [
    iaDirectRecovery("Makingof1946::Makingof1946_512kb.mp4", "Makingof1946", "Makingof1946_512kb.mp4", "Making of a Shooter", "hunting outdoors sportsman wildlife outdoor television", 1946),
    iaDirectRecovery("denaliwilderness::denaliwilderness.mp4", "denaliwilderness", "denaliwilderness.mp4", "Denali Wilderness", "outdoors wilderness wildlife hunting fishing outdoor television", 1982),
    iaDirectRecovery("HuntingSeason::huntingonline_512kb.mp4", "HuntingSeason", "huntingonline_512kb.mp4", "Hunting Season", "hunting outdoors wildlife sportsman outdoor television", 2006),
    iaDirectRecovery("MyHero-FishingStory::myhero-thefishingstory.mp4", "MyHero-FishingStory", "myhero-thefishingstory.mp4", "My Hero · The Fishing Story", "fishing outdoors sport fishing angling outdoor television", 1953),
    iaDirectRecovery("BirdDogs1940::BirdDogs1940_512kb.mp4", "BirdDogs1940", "BirdDogs1940_512kb.mp4", "Bird Dogs", "hunting outdoors bird hunting sporting dogs outdoor television", 1940),
  ],
  "18": [
    iaDirectRecovery("doogie-howser-m.d.-season-2-of-4-xvid-avi::Doogie Howser, M.D. - S02E01 - Doogenstein.mp4", "doogie-howser-m.d.-season-2-of-4-xvid-avi", "Doogie Howser, M.D. - S02E01 - Doogenstein.mp4", "Doogie Howser, M.D. — Doogenstein", "medical drama hospital drama medical series television", 1990),
    iaDirectRecovery("doogie-howser-m.d.-season-2-of-4-xvid-avi::Doogie Howser, M.D. - S02E08 - Revenge of the Teenage Dead.mp4", "doogie-howser-m.d.-season-2-of-4-xvid-avi", "Doogie Howser, M.D. - S02E08 - Revenge of the Teenage Dead.mp4", "Doogie Howser, M.D. — Revenge of the Teenage Dead", "medical drama hospital drama medical series television", 1990),
    iaDirectRecovery("doogie-howser-m.d.-season-2-of-4-xvid-avi::Doogie Howser, M.D. - S02E12 - TV or Not TV.mp4", "doogie-howser-m.d.-season-2-of-4-xvid-avi", "Doogie Howser, M.D. - S02E12 - TV or Not TV.mp4", "Doogie Howser, M.D. — TV or Not TV", "medical drama hospital drama medical series television", 1990),
    iaDirectRecovery("doogie-howser-m.d.-season-4-of-4-xvid-avi::Doogie Howser, M.D. - S04E01 - There's a Riot Going On.mp4", "doogie-howser-m.d.-season-4-of-4-xvid-avi", "Doogie Howser, M.D. - S04E01 - There's a Riot Going On.mp4", "Doogie Howser, M.D. — There's a Riot Going On", "medical drama hospital drama medical series television", 1992),
    iaDirectRecovery("doogie-howser-m.d.-season-4-of-4-xvid-avi::Doogie Howser, M.D. - S04E13 - Roommate with a View.mp4", "doogie-howser-m.d.-season-4-of-4-xvid-avi", "Doogie Howser, M.D. - S04E13 - Roommate with a View.mp4", "Doogie Howser, M.D. — Roommate with a View", "medical drama hospital drama medical series television", 1992),
    iaDirectRecovery("st.-elsewhere-s-1-e-022-addiction::St. Elsewhere S1E022 Addiction.mp4", "st.-elsewhere-s-1-e-022-addiction", "St. Elsewhere S1E022 Addiction.mp4", "St. Elsewhere — Addiction", "medical drama hospital drama medical series television", 1983),
    iaDirectRecovery("1984-st-elsewhere-s-2-e-11-blizzard-kron-san-francisco-h-264::1984 St Elsewhere S2E11 Blizzard (KRON San Francisco) H264.mp4", "1984-st-elsewhere-s-2-e-11-blizzard-kron-san-francisco-h-264", "1984 St Elsewhere S2E11 Blizzard (KRON San Francisco) H264.mp4", "St. Elsewhere — Blizzard", "medical drama hospital drama medical series television", 1984),
    iaDirectRecovery("s-03-e-10-dr.-kildare::S03E10 - Dr. Kildare.mp4", "s-03-e-10-dr.-kildare", "S03E10 - Dr. Kildare.mp4", "Dr. Kildare — Season 3 Episode 10", "medical drama hospital drama medical series television", 1965),
    iaDirectRecovery("marcus-welby-md-the-tortoise-dance-s-04-e-24::Marcus Welby MD The Tortoise Dance S04E24.ia.mp4", "marcus-welby-md-the-tortoise-dance-s-04-e-24", "Marcus Welby MD The Tortoise Dance S04E24.ia.mp4", "Marcus Welby, M.D. — The Tortoise Dance", "medical drama hospital drama medical series television", 1973),
    iaDirectRecovery("marcus.-welby.-m.-d.-s-02-e-06::Marcus.Welby.M.D.S02E06.ia.mp4", "marcus.-welby.-m.-d.-s-02-e-06", "Marcus.Welby.M.D.S02E06.ia.mp4", "Marcus Welby, M.D. — Season 2 Episode 6", "medical drama hospital drama medical series television", 1971),
  ],
  "234": [
    iaDirectRecovery("0411_Tornado_06_00_36_00::t0411_Tornado_06_00_36_00.mp4", "0411_Tornado_06_00_36_00", "t0411_Tornado_06_00_36_00.mp4", "Tornado — Archival Storm Film", "natural disaster disaster documentary tornado documentary public archive", 1955),
    iaDirectRecovery("EdisonNe1906::EdisonNe1906.mp4", "EdisonNe1906", "EdisonNe1906.mp4", "Edison Newsreels — San Francisco Earthquake Aftermath", "natural disaster disaster documentary earthquake documentary newsreel", 1906),
    iaDirectRecovery("RenoFloo1927::tRenoFloo1927.mp4", "RenoFloo1927", "tRenoFloo1927.mp4", "Reno Flood", "natural disaster disaster documentary flood documentary newsreel", 1927),
    iaDirectRecovery("1936Pittsburg::t1936Pittsburg.mp4", "1936Pittsburg", "t1936Pittsburg.mp4", "1936 Pittsburgh Flood — Part II", "natural disaster disaster documentary flood documentary newsreel", 1936),
    iaDirectRecovery("ShockTro1938::ShockTro1938.mp4", "ShockTro1938", "ShockTro1938.mp4", "Shock Troops of Disaster — The New England Hurricane", "natural disaster disaster documentary hurricane documentary public archive", 1938),
    iaDirectRecovery("Earthqua1973::Earthqua1973.mp4", "Earthqua1973", "Earthqua1973.mp4", "Earthquake — Archival Safety Film", "natural disaster disaster documentary earthquake documentary public information", 1973),
    iaDirectRecovery("SanFranc1906::SanFranc1906.mp4", "SanFranc1906", "SanFranc1906.mp4", "San Francisco Earthquake Aftermath — Part 1", "natural disaster disaster documentary earthquake documentary newsreel", 1906),
    iaDirectRecovery("0254_San_Francisco_Earthquake_Aftermath_1906_01_21_25_00::0254_San_Francisco_Earthquake_Aftermath_1906_01_21_25_00_3mb.mp4", "0254_San_Francisco_Earthquake_Aftermath_1906_01_21_25_00", "0254_San_Francisco_Earthquake_Aftermath_1906_01_21_25_00_3mb.mp4", "San Francisco Earthquake Aftermath — 1906", "natural disaster disaster documentary earthquake documentary newsreel", 1906),
    iaDirectRecovery("0385_Colorado_Flood_16_30_35_00::0385_Colorado_Flood_16_30_35_00_3mb.mp4", "0385_Colorado_Flood_16_30_35_00", "0385_Colorado_Flood_16_30_35_00_3mb.mp4", "Colorado Flood", "natural disaster disaster documentary flood documentary newsreel", 1935),
    iaDirectRecovery("CSPAN3_20240517_032700_FEMA_Administrator_on_Natural_Disaster_Preparedness::CSPAN3_20240517_032700_FEMA_Administrator_on_Natural_Disaster_Preparedness.mp4", "CSPAN3_20240517_032700_FEMA_Administrator_on_Natural_Disaster_Preparedness", "CSPAN3_20240517_032700_FEMA_Administrator_on_Natural_Disaster_Preparedness.mp4", "FEMA Administrator on Natural Disaster Preparedness", "natural disaster disaster documentary emergency management preparedness public information", 2024),
    iaDirectRecovery("nasa_tv-Space_Station_Cameras_Peer_down_on_Major_Hurricane_Harvey::Space_Station_Cameras_Peer_down_on_Major_Hurricane_Harvey.mp4", "nasa_tv-Space_Station_Cameras_Peer_down_on_Major_Hurricane_Harvey", "Space_Station_Cameras_Peer_down_on_Major_Hurricane_Harvey.mp4", "NASA — Hurricane Harvey from Orbit", "natural disaster disaster documentary hurricane documentary earth observation nasa", 2017),
    iaDirectRecovery("nasa_tv-Space_Station_Cameras_Peer_down_on_Major_Hurricane_Matthew::Space_Station_Cameras_Peer_down_on_Major_Hurricane_Matthew.mp4", "nasa_tv-Space_Station_Cameras_Peer_down_on_Major_Hurricane_Matthew", "Space_Station_Cameras_Peer_down_on_Major_Hurricane_Matthew.mp4", "NASA — Hurricane Matthew from Orbit", "natural disaster disaster documentary hurricane documentary earth observation nasa", 2016),
    iaDirectRecovery("TheAreaHardestHitEarthquakeinNepalDispatch4::The Area Hardest Hit： Earthquake in Nepal (Dispatch 4) [0jqpcqNxuCo].mp4", "TheAreaHardestHitEarthquakeinNepalDispatch4", "The Area Hardest Hit： Earthquake in Nepal (Dispatch 4) [0jqpcqNxuCo].mp4", "The Area Hardest Hit — Earthquake in Nepal", "natural disaster disaster documentary earthquake documentary rescue operation international news", 2015),
  ],
  "127": [
    iaDirectRecovery("top-of-the-pops-1970s_202401::Top of the Pops - E312 - Jimmy Saville - 29th January 1970.mp4", "top-of-the-pops-1970s_202401", "Top of the Pops - E312 - Jimmy Saville - 29th January 1970.mp4", "Top of the Pops — 29 January 1970", "top of the pops british music performance television", 1970),
    iaDirectRecovery("top-of-the-pops-1970s_202401::Top of the Pops - E313 - Tony Blackburn - 5th Feburary 1970.mp4", "top-of-the-pops-1970s_202401", "Top of the Pops - E313 - Tony Blackburn - 5th Feburary 1970.mp4", "Top of the Pops — 5 February 1970", "top of the pops british music performance television", 1970),
    iaDirectRecovery("top-of-the-pops-1970s_202401::Top of the Pops - E316 - Jimmy Saville - 26th Feburary 1970.mp4", "top-of-the-pops-1970s_202401", "Top of the Pops - E316 - Jimmy Saville - 26th Feburary 1970.mp4", "Top of the Pops — 26 February 1970", "top of the pops british music performance television", 1970),
    iaDirectRecovery("top-of-the-pops-1960s_202401::Top of the Pops - E000 - Surviving Footage 1964.mp4", "top-of-the-pops-1960s_202401", "Top of the Pops - E000 - Surviving Footage 1964.mp4", "Top of the Pops — Surviving Footage 1964", "top of the pops british music performance television", 1964),
    iaDirectRecovery("retrobritishtelevisionarchive::1970's Pop Promo Videos [X6y4vSl4mKE].mp4", "retrobritishtelevisionarchive", "1970's Pop Promo Videos [X6y4vSl4mKE].mp4", "Retro British Television — 1970s Pop Promos", "british music performance television archive", 1974),
    iaDirectRecovery("top-of-the-pops-1960s_202401::Top of the Pops - E086 - Jimmy Saville - 19th August 1965 (Partial).mp4", "top-of-the-pops-1960s_202401", "Top of the Pops - E086 - Jimmy Saville - 19th August 1965 (Partial).mp4", "Top of the Pops — 19 August 1965", "top of the pops british music performance television", 1965),
    iaDirectRecovery("top-of-the-pops-1960s_202401::Top of the Pops - E187 - Alan Freeman - 27th July 1967.mp4", "top-of-the-pops-1960s_202401", "Top of the Pops - E187 - Alan Freeman - 27th July 1967.mp4", "Top of the Pops — 27 July 1967", "top of the pops british music performance television", 1967),
    iaDirectRecovery("top-of-the-pops-1970s_202401::Top of the Pops - E347 - Tony Blackburn - 15th October 1970 (mute links).mp4", "top-of-the-pops-1970s_202401", "Top of the Pops - E347 - Tony Blackburn - 15th October 1970 (mute links).mp4", "Top of the Pops — 15 October 1970", "top of the pops british music performance television", 1970),
    iaDirectRecovery("top-of-the-pops-1970s_202401::Top of the Pops - E372 - Tony Blackburn - 29th April 1971.mp4", "top-of-the-pops-1970s_202401", "Top of the Pops - E372 - Tony Blackburn - 29th April 1971.mp4", "Top of the Pops — 29 April 1971", "top of the pops british music performance television", 1971),
    iaDirectRecovery("top-of-the-pops-1976-04-08-bbc-4-noel-edmonds-x-264-kes-cvrt::--Top of The Pops 1976-04-08 [BBC4] (Noel Edmonds) x264 (Kes-CVrt).mp4", "top-of-the-pops-1976-04-08-bbc-4-noel-edmonds-x-264-kes-cvrt", "--Top of The Pops 1976-04-08 [BBC4] (Noel Edmonds) x264 (Kes-CVrt).mp4", "Top of the Pops — 8 April 1976", "top of the pops british music performance television", 1976),
    iaDirectRecovery("top-of-the-pops-1977.06.23-30-min-1080-p-h.-265-aac-2-ch_202409::TOP OF THE POPS 1977.06.23 (30MIN) 1080P H.265 AAC 2CH.ia.mp4", "top-of-the-pops-1977.06.23-30-min-1080-p-h.-265-aac-2-ch_202409", "TOP OF THE POPS 1977.06.23 (30MIN) 1080P H.265 AAC 2CH.ia.mp4", "Top of the Pops — 23 June 1977", "top of the pops british music performance television", 1977),
    iaDirectRecovery("top-of-the-pops-1983-08-25-bbc-simon-bates-mike-smith-x-264-kes-cvrt_202303::--Top of The Pops 1983 08 25 [BBC] (Simon Bates+Mike Smith) x264 (Kes-CVrt).mp4", "top-of-the-pops-1983-08-25-bbc-simon-bates-mike-smith-x-264-kes-cvrt_202303", "--Top of The Pops 1983 08 25 [BBC] (Simon Bates+Mike Smith) x264 (Kes-CVrt).mp4", "Top of the Pops — 25 August 1983", "top of the pops british music performance television", 1983),
    iaDirectRecovery("top-of-the-pops-1987.06.18-30-min-1080-p-h.-265-aac-2-ch::TOP OF THE POPS 1987.06.18 (30MIN) 1080P H.265 AAC 2CH.ia.mp4", "top-of-the-pops-1987.06.18-30-min-1080-p-h.-265-aac-2-ch", "TOP OF THE POPS 1987.06.18 (30MIN) 1080P H.265 AAC 2CH.ia.mp4", "Top of the Pops — 18 June 1987", "top of the pops british music performance television", 1987),
    iaDirectRecovery("top-of-the-pops-steps-special-31-may-1999::Top Of The Pops - Steps Special - 31 May 1999.mp4", "top-of-the-pops-steps-special-31-may-1999", "Top Of The Pops - Steps Special - 31 May 1999.mp4", "Top of the Pops — Steps Special", "top of the pops british music performance television", 1999),
    iaDirectRecovery("retrobritishtelevisionarchive::60's Brit Pop [hWVNncNKmd0].mp4", "retrobritishtelevisionarchive", "60's Brit Pop [hWVNncNKmd0].mp4", "Retro British Television — 1960s Brit Pop", "british music performance television archive", 1966),
  ],
  "203": [
    iaDirectRecovery("TiestosClubLife::2017-01-07 - Club Life 510 - Tiesto, Norman Doray, Vato Gonalez.mp3", "TiestosClubLife", "2017-01-07 - Club Life 510 - Tiesto, Norman Doray, Vato Gonalez.mp3", "Club Life 510 — Tiesto", "podcast music podcast electronic podcast episode", 2017, "audio"),
    iaDirectRecovery("TiestosClubLife::2017-01-14 - Club Life 511 - Tiesto, Suyano.mp3", "TiestosClubLife", "2017-01-14 - Club Life 511 - Tiesto, Suyano.mp3", "Club Life 511 — Tiesto", "podcast music podcast electronic podcast episode", 2017, "audio"),
    iaDirectRecovery("TiestosClubLife::2017-01-21 - Club Life 512 - Tiesto, DubVision.mp3", "TiestosClubLife", "2017-01-21 - Club Life 512 - Tiesto, DubVision.mp3", "Club Life 512 — Tiesto", "podcast music podcast electronic podcast episode", 2017, "audio"),
    iaDirectRecovery("TiestosClubLife::2017-01-28 - Club Life 513 - Tiesto, Loud Luxury.mp3", "TiestosClubLife", "2017-01-28 - Club Life 513 - Tiesto, Loud Luxury.mp3", "Club Life 513 — Tiesto", "podcast music podcast electronic podcast episode", 2017, "audio"),
    iaDirectRecovery("aaapodcast_episode262_201502::AAAPodcast_AP340iuw.mp3", "aaapodcast_episode262_201502", "AAAPodcast_AP340iuw.mp3", "AAA Podcast — Episode 340", "podcast anime culture podcast episode", 2015, "audio"),
    iaDirectRecovery("aaapodcast_episode262_201502::AAAPodcast_AP341ooo8.mp3", "aaapodcast_episode262_201502", "AAAPodcast_AP341ooo8.mp3", "AAA Podcast — Episode 341", "podcast anime culture podcast episode", 2015, "audio"),
    iaDirectRecovery("aaapodcast_episode262_201502::AAAPodcast_AP344rrs.mp3", "aaapodcast_episode262_201502", "AAAPodcast_AP344rrs.mp3", "AAA Podcast — Episode 344", "podcast anime culture podcast episode", 2015, "audio"),
    iaDirectRecovery("aaapodcast_episode262_201502::AAAPodcast_AP345ttts.mp3", "aaapodcast_episode262_201502", "AAAPodcast_AP345ttts.mp3", "AAA Podcast — Episode 345", "podcast anime culture podcast episode", 2015, "audio"),
    iaDirectRecovery("yitbarchive::002.BadLieutenant_portOfCall-NewOrleans.mp3", "yitbarchive", "002.BadLieutenant_portOfCall-NewOrleans.mp3", "Yeah, It's That Bad — Bad Lieutenant", "podcast film podcast movie discussion episode", 2014, "audio"),
    iaDirectRecovery("yitbarchive::003.TheUninvited.mp3", "yitbarchive", "003.TheUninvited.mp3", "Yeah, It's That Bad — The Uninvited", "podcast film podcast movie discussion episode", 2014, "audio"),
    iaDirectRecovery("yitbarchive::004.WhiteoutAndVantagePoint.mp3", "yitbarchive", "004.WhiteoutAndVantagePoint.mp3", "Yeah, It's That Bad — Whiteout", "podcast film podcast movie discussion episode", 2014, "audio"),
    iaDirectRecovery("yitbarchive::005.VanillaSky.mp3", "yitbarchive", "005.VanillaSky.mp3", "Yeah, It's That Bad — Vanilla Sky", "podcast film podcast movie discussion episode", 2014, "audio"),
  ],
  "205": [
    iaDirectRecovery("sight-sound-queen-esther-small-file::Sight & Sound - Jonah - Small File.ia.mp4", "sight-sound-queen-esther-small-file", "Sight & Sound - Jonah - Small File.ia.mp4", "Sight & Sound — Jonah", "gospel worship christian service religious music", 2013),
    iaDirectRecovery("sight-sound-queen-esther-small-file::Sight & Sound - Joseph - Small File.ia.mp4", "sight-sound-queen-esther-small-file", "Sight & Sound - Joseph - Small File.ia.mp4", "Sight & Sound — Joseph", "gospel worship christian service religious music", 2013),
    iaDirectRecovery("sight-sound-queen-esther-small-file::Sight & Sound - Moses - Small File.ia.mp4", "sight-sound-queen-esther-small-file", "Sight & Sound - Moses - Small File.ia.mp4", "Sight & Sound — Moses", "gospel worship christian service religious music", 2013),
    iaDirectRecovery("sight-sound-queen-esther-small-file::Sight & Sound - Noah - Small File.ia.mp4", "sight-sound-queen-esther-small-file", "Sight & Sound - Noah - Small File.ia.mp4", "Sight & Sound — Noah", "gospel worship christian service religious music", 2013),
    iaDirectRecovery("kingjamesvideobible::19-Psalms.mp4", "kingjamesvideobible", "19-Psalms.mp4", "King James Video Bible — Psalms", "gospel worship christian service bible scripture", 2020),
    iaDirectRecovery("kingjamesvideobible::20-Proverbs.mp4", "kingjamesvideobible", "20-Proverbs.mp4", "King James Video Bible — Proverbs", "gospel worship christian service bible scripture", 2020),
    iaDirectRecovery("kingjamesvideobible::21-Ecclesiastes.mp4", "kingjamesvideobible", "21-Ecclesiastes.mp4", "King James Video Bible — Ecclesiastes", "gospel worship christian service bible scripture", 2020),
    iaDirectRecovery("kingjamesvideobible::22-Song of Solomon.mp4", "kingjamesvideobible", "22-Song of Solomon.mp4", "King James Video Bible — Song of Solomon", "gospel worship christian service bible scripture", 2020),
  ],
  "154": [
    iaDirectRecovery("Dragnet1951::Dragnet/Season 1/Dragnet (1951) - S01E01 - The Human Bomb.mp4", "Dragnet1951", "Dragnet/Season 1/Dragnet (1951) - S01E01 - The Human Bomb.mp4", "Dragnet — The Human Bomb", "dragnet classic television police procedural detective show", 1951),
    iaDirectRecovery("Dragnet1951::Dragnet/Season 1/Dragnet (1951) - S01E02 - The Big Actor.mp4", "Dragnet1951", "Dragnet/Season 1/Dragnet (1951) - S01E02 - The Big Actor.mp4", "Dragnet — The Big Actor", "dragnet classic television police procedural detective show", 1951),
    iaDirectRecovery("Dragnet1951::Dragnet/Season 1/Dragnet (1951) - S01E05 - The Big Cast.mp4", "Dragnet1951", "Dragnet/Season 1/Dragnet (1951) - S01E05 - The Big Cast.mp4", "Dragnet — The Big Cast", "dragnet classic television police procedural detective show", 1951),
    iaDirectRecovery("hill.-street.-blues.-s-01::Hill.Street.Blues.S01E01.Hill.Street.Station.Pilot.mp4", "hill.-street.-blues.-s-01", "Hill.Street.Blues.S01E01.Hill.Street.Station.Pilot.mp4", "Hill Street Blues — Pilot", "hill street blues classic television police procedural detective show", 1981),
    iaDirectRecovery("hill.-street.-blues.-s-01::Hill.Street.Blues.S01E02.Presidential.Fever.mp4", "hill.-street.-blues.-s-01", "Hill.Street.Blues.S01E02.Presidential.Fever.mp4", "Hill Street Blues — Presidential Fever", "hill street blues classic television police procedural detective show", 1981),
    iaDirectRecovery("hill.street.blues.s-03::Hill.street.blues.s03e01.trial.by.fury.webrip.x264.mp4", "hill.street.blues.s-03", "Hill.street.blues.s03e01.trial.by.fury.webrip.x264.mp4", "Hill Street Blues — Trial by Fury", "hill street blues classic television police procedural detective show", 1983),
    iaDirectRecovery("hill.street.blues.s-05::Hill.street.blues.s05e01.mayo,.hold.the.pickle.sdtv.x264.mp4", "hill.street.blues.s-05", "Hill.street.blues.s05e01.mayo,.hold.the.pickle.sdtv.x264.mp4", "Hill Street Blues — Mayo, Hold the Pickle", "hill street blues classic television police procedural detective show", 1985),
    iaDirectRecovery("adam-12.-s-01::Adam-12.S01E01.Log.001.The.Impossible.Mission.mp4", "adam-12.-s-01", "Adam-12.S01E01.Log.001.The.Impossible.Mission.mp4", "Adam-12 — The Impossible Mission", "adam-12 classic television police procedural detective show", 1968),
    iaDirectRecovery("adam-12.-s-01::Adam-12.S01E02.Log.141.The.Color.TV.Bandit.mp4", "adam-12.-s-01", "Adam-12.S01E02.Log.141.The.Color.TV.Bandit.mp4", "Adam-12 — The Color TV Bandit", "adam-12 classic television police procedural detective show", 1968),
    iaDirectRecovery("columbo-pilot-episodes::2 - Ransom For A Dead Man.mp4", "columbo-pilot-episodes", "2 - Ransom For A Dead Man.mp4", "Columbo — Ransom for a Dead Man", "columbo classic television police procedural detective show", 1971),
  ],
  "222": [
    iaDirectRecovery("lee-evans-collection::1. Live At Her Majesty's Theatre (1994).mp4", "lee-evans-collection", "1. Live At Her Majesty's Theatre (1994).mp4", "Lee Evans — Live at Her Majesty's Theatre", "stand-up comedy comedy special live comedy", 1994),
    iaDirectRecovery("lee-evans-collection::2. Live From The West End (1995).mp4", "lee-evans-collection", "2. Live From The West End (1995).mp4", "Lee Evans — Live from the West End", "stand-up comedy comedy special live comedy", 1995),
    iaDirectRecovery("lee-evans-collection::3. Different Planet Tour (1996).mp4", "lee-evans-collection", "3. Different Planet Tour (1996).mp4", "Lee Evans — Different Planet Tour", "stand-up comedy comedy special live comedy", 1996),
    iaDirectRecovery("GeorgeLopezWhyYouCryingFullStandUpComedyShowLive::George Lopez - Why You Crying (Full Stand Up Comedy Show Live).mp4", "GeorgeLopezWhyYouCryingFullStandUpComedyShowLive", "George Lopez - Why You Crying (Full Stand Up Comedy Show Live).mp4", "George Lopez — Why You Crying", "stand-up comedy comedy special live comedy", 2007),
  ],
  "909": [
    iaDirectRecovery("takeovertheophilussundaywww.amenradio.net::Take Over - Theophilus Sunday [www.AmenRadio.net].mp3", "takeovertheophilussundaywww.amenradio.net", "Take Over - Theophilus Sunday [www.AmenRadio.net].mp3", "Take Over — Theophilus Sunday", "gospel spiritual sacred music", 2024, "audio"),
    iaDirectRecovery("nara-ekele-dr.-paul-enenche-feat.-dunamis-voices-osinachi-nwachukwu-www.-amen-radio.net::Nara Ekele - Dr. Paul Enenche feat. Dunamis Voices & Osinachi Nwachukwu [www.AmenRadio.net].mp3", "nara-ekele-dr.-paul-enenche-feat.-dunamis-voices-osinachi-nwachukwu-www.-amen-radio.net", "Nara Ekele - Dr. Paul Enenche feat. Dunamis Voices & Osinachi Nwachukwu [www.AmenRadio.net].mp3", "Nara Ekele — Dunamis Voices", "gospel spiritual sacred music", 2024, "audio"),
    iaDirectRecovery("HolyGhostPower_20170325::A Letter to Jesus.mp3", "HolyGhostPower_20170325", "A Letter to Jesus.mp3", "Jamaican Gospel Music — A Letter to Jesus", "gospel spiritual sacred music", 2017, "audio"),
    iaDirectRecovery("HolyGhostPower_20170325::A Nuh One Prayer Mi.mp3", "HolyGhostPower_20170325", "A Nuh One Prayer Mi.mp3", "Jamaican Gospel Music — A Nuh One Prayer Mi", "gospel spiritual sacred music", 2017, "audio"),
    iaDirectRecovery("HolyGhostPower_20161117::All to Jesus I Surrender.mp3", "HolyGhostPower_20161117", "All to Jesus I Surrender.mp3", "Jamaican Gospel Music — All to Jesus I Surrender", "gospel spiritual sacred music", 2016, "audio"),
    iaDirectRecovery("HolyGhostPower_20161117::Amazing grace.mp3", "HolyGhostPower_20161117", "Amazing grace.mp3", "Jamaican Gospel Music — Amazing Grace", "gospel spiritual sacred music", 2016, "audio"),
    iaDirectRecovery("HolyGhostPower_20161117::Ambassador for Christ.mp3", "HolyGhostPower_20161117", "Ambassador for Christ.mp3", "Jamaican Gospel Music — Ambassador for Christ", "gospel spiritual sacred music", 2016, "audio"),
    iaDirectRecovery("HolyGhostPower_20161117::Around God's Throne.mp3", "HolyGhostPower_20161117", "Around God's Throne.mp3", "Jamaican Gospel Music — Around God's Throne", "gospel spiritual sacred music", 2016, "audio"),
  ],
  "918": [
    iaDirectRecovery("OSC74Dexxed::aJasinski- How It All Falls To Pieces.mp3", "OSC74Dexxed", "aJasinski- How It All Falls To Pieces.mp3", "One Synth Challenge — How It All Falls to Pieces", "electronic music synth radio", 2015, "audio"),
    iaDirectRecovery("OSC74Dexxed::bH-man - Within heart chasm.mp3", "OSC74Dexxed", "bH-man - Within heart chasm.mp3", "One Synth Challenge — Within Heart Chasm", "electronic music synth radio", 2015, "audio"),
    iaDirectRecovery("NS050::01-NS050-Multi-Panel_Christmas-With-Mr-Rice.mp3", "NS050", "01-NS050-Multi-Panel_Christmas-With-Mr-Rice.mp3", "Another Day, Another Way — Multi-Panel", "electronic music ambient compilation radio", 2012, "audio"),
    iaDirectRecovery("CANDY032::01Bubblyfish-SleighRide.mp3", "CANDY032", "01Bubblyfish-SleighRide.mp3", "Christmasasaurus — Bubblyfish", "electronic music electronica IDM radio", 2006, "audio"),
    iaDirectRecovery("OSC74Dexxed::cbh9090 - the -kraviNGs- -badl- [Dexed OSC].mp3", "OSC74Dexxed", "cbh9090 - the -kraviNGs- -badl- [Dexed OSC].mp3", "One Synth Challenge — The KraviNGs", "electronic music synth radio", 2015, "audio"),
    iaDirectRecovery("OSC74Dexxed::dkeith303_-_median.mp3", "OSC74Dexxed", "dkeith303_-_median.mp3", "One Synth Challenge — Median", "electronic music synth radio", 2015, "audio"),
    iaDirectRecovery("NS050::03-NS050-Cocolixe_Swing-Low.mp3", "NS050", "03-NS050-Cocolixe_Swing-Low.mp3", "Another Day, Another Way — Swing Low", "electronic music ambient compilation radio", 2012, "audio"),
    iaDirectRecovery("NS050::04-NS050-Tardiss_The-Light-Between.mp3", "NS050", "04-NS050-Tardiss_The-Light-Between.mp3", "Another Day, Another Way — The Light Between", "electronic music ambient compilation radio", 2012, "audio"),
    iaDirectRecovery("Torley_Wong_-_The_Final_Selection::Torley_Wong-1981_A.D..mp3", "Torley_Wong_-_The_Final_Selection", "Torley_Wong-1981_A.D..mp3", "Torley Wong — 1981 A.D.", "electronic music ambient breakbeat house techno radio", 2005, "audio"),
    iaDirectRecovery("Torley_Wong_-_The_Final_Selection::Torley_Wong-1_001_Dead_Snobs.mp3", "Torley_Wong_-_The_Final_Selection", "Torley_Wong-1_001_Dead_Snobs.mp3", "Torley Wong — Dead Snobs", "electronic music ambient breakbeat house techno radio", 2005, "audio"),
    iaDirectRecovery("stqk011::STQK011_01_-_Zero_Call_-_A-40.mp3", "stqk011", "STQK011_01_-_Zero_Call_-_A-40.mp3", "Zero Call — A-40", "electronic music electro synthwave radio", 2012, "audio"),
    iaDirectRecovery("stqk011::STQK011_02_-_Zero_Call_-_Battle_of_Young.mp3", "stqk011", "STQK011_02_-_Zero_Call_-_Battle_of_Young.mp3", "Zero Call — Battle of Young", "electronic music electro synthwave radio", 2012, "audio"),
    iaDirectRecovery("OSC74Dexxed::eRichard Semper - 3am on a moonlit bay OSC.mp3", "OSC74Dexxed", "eRichard Semper - 3am on a moonlit bay OSC.mp3", "One Synth Challenge — 3AM on a Moonlit Bay", "electronic music synth ambient radio", 2015, "audio"),
    iaDirectRecovery("OSC74Dexxed::fmcaitch - gone.mp3", "OSC74Dexxed", "fmcaitch - gone.mp3", "One Synth Challenge — Gone", "electronic music synth electronica radio", 2015, "audio"),
    iaDirectRecovery("OSC74Dexxed::gz.prime - Waiting for Summer.mp3", "OSC74Dexxed", "gz.prime - Waiting for Summer.mp3", "One Synth Challenge — Waiting for Summer", "electronic music synth ambient radio", 2015, "audio"),
    iaDirectRecovery("OSC74Dexxed::hJ.Ruegg - Anomaly.mp3", "OSC74Dexxed", "hJ.Ruegg - Anomaly.mp3", "One Synth Challenge — Anomaly", "electronic music synth electronica radio", 2015, "audio"),
    iaDirectRecovery("NS050::05-NS050-pEACEFANg_Colonial-Builders-Master-For-Felsenmeer-v2.mp3", "NS050", "05-NS050-pEACEFANg_Colonial-Builders-Master-For-Felsenmeer-v2.mp3", "Another Day, Another Way — Colonial Builders", "electronic music ambient electronica radio", 2012, "audio"),
    iaDirectRecovery("NS050::06-NS050-Limited-Taste_Full-Source_Daylights-Prior-To-Morning-Sun.mp3", "NS050", "06-NS050-Limited-Taste_Full-Source_Daylights-Prior-To-Morning-Sun.mp3", "Another Day, Another Way — Daylights", "electronic music ambient electronica radio", 2012, "audio"),
  ],
  "919": [
    iaDirectRecovery("MIXG032::01_Zipp_-_Pour_Quoi_Royale.mp3", "MIXG032", "01_Zipp_-_Pour_Quoi_Royale.mp3", "Retrovision — Pour Quoi Royale", "funk soul rhythm and blues groove music", 2013, "audio"),
    iaDirectRecovery("MIXG032::02_Dog_On_Springs_-_Footloose_feat_Paul_Whiteman.mp3", "MIXG032", "02_Dog_On_Springs_-_Footloose_feat_Paul_Whiteman.mp3", "Retrovision — Footloose", "funk soul rhythm and blues groove music", 2013, "audio"),
    iaDirectRecovery("funk_cv::funk_ada.mp3", "funk_cv", "funk_ada.mp3", "Funk Kings — Funk Ada", "funk soul rhythm and blues music", 2010, "audio"),
    iaDirectRecovery("funk_cv::funk_cv.mp3", "funk_cv", "funk_cv.mp3", "Funk Kings — Funk CV", "funk soul rhythm and blues music", 2010, "audio"),
    iaDirectRecovery("funk_cv::funk_fdn.mp3", "funk_cv", "funk_fdn.mp3", "Funk Kings — Funk FDN", "funk soul rhythm and blues music", 2010, "audio"),
    iaDirectRecovery("funk_cv::funk_pcc.mp3", "funk_cv", "funk_pcc.mp3", "Funk Kings — Funk PCC", "funk soul rhythm and blues music", 2010, "audio"),
    iaDirectRecovery("MIXG032::03_Astat_-_Daily_Dozen.mp3", "MIXG032", "03_Astat_-_Daily_Dozen.mp3", "Retrovision — Daily Dozen", "funk soul rhythm and blues groove music", 2013, "audio"),
    iaDirectRecovery("MIXG032::04_Fedorov_Mark_-_Bus_Driver.mp3", "MIXG032", "04_Fedorov_Mark_-_Bus_Driver.mp3", "Retrovision — Bus Driver", "funk soul rhythm and blues groove music", 2013, "audio"),
    iaDirectRecovery("MIXG032::05_VAD_-_City_Woman.mp3", "MIXG032", "05_VAD_-_City_Woman.mp3", "Retrovision — City Woman", "funk soul rhythm and blues groove music", 2013, "audio"),
    iaDirectRecovery("MIXG032::06_Zipp_-_Chocobeat.mp3", "MIXG032", "06_Zipp_-_Chocobeat.mp3", "Retrovision — Chocobeat", "funk soul rhythm and blues groove music", 2013, "audio"),
    iaDirectRecovery("MIXG032::07_Igor_Leontyev_-_Remote_District.mp3", "MIXG032", "07_Igor_Leontyev_-_Remote_District.mp3", "Retrovision — Remote District", "funk soul rhythm and blues groove music", 2013, "audio"),
    iaDirectRecovery("MIXG032::08_VAD_-_Night_City.mp3", "MIXG032", "08_VAD_-_Night_City.mp3", "Retrovision — Night City", "funk soul rhythm and blues groove music", 2013, "audio"),
    iaDirectRecovery("MaraudazMusicV58MixedByDonRaySoundsFromTheUnderground::MarauderMusicV58MixedByDon-raySoundsFromTheUnderground.mp3", "MaraudazMusicV58MixedByDonRaySoundsFromTheUnderground", "MarauderMusicV58MixedByDon-raySoundsFromTheUnderground.mp3", "Maraudaz — Sounds from the Underground", "funk soul groove broken beat dance music radio", 2013, "audio"),
    iaDirectRecovery("MidnightMaraudazNoirV57MixedByDonRayTheFutureSoulEpisode::MidnightMaraudazNoirV57MixedByDon-rayTheFutureSoulEpisode.mp3", "MidnightMaraudazNoirV57MixedByDonRayTheFutureSoulEpisode", "MidnightMaraudazNoirV57MixedByDon-rayTheFutureSoulEpisode.mp3", "Midnight Maraudaz — Future Soul", "funk soul groove broken beat dance music radio", 2013, "audio"),
    iaDirectRecovery("BOLTDIGI008::01_uptown_funk.mp3", "BOLTDIGI008", "01_uptown_funk.mp3", "Bolt 008 — Uptown Funk", "funk soul electro groove music radio", 2010, "audio"),
    iaDirectRecovery("fsz050::fsz050_16-chenard_walcker-i_ve_got_my_mojo_working.mp3", "fsz050", "fsz050_16-chenard_walcker-i_ve_got_my_mojo_working.mp3", "The Pusher — I've Got My Mojo Working", "funk soul blues groove music radio", 2006, "audio"),
  ],
  "922": [
    iaDirectRecovery("clubdelcountry::2006/2006-08-14.mp3", "clubdelcountry", "2006/2006-08-14.mp3", "Club del Country — August 14, 2006", "country music americana honky tonk radio", 2006, "audio"),
    iaDirectRecovery("clubdelcountry::2009/2009-09-28Part144-1.mp3", "clubdelcountry", "2009/2009-09-28Part144-1.mp3", "Club del Country — Part 144A", "country music bluegrass honky tonk americana radio", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/2009-09-28Part144-2.mp3", "clubdelcountry", "2009/2009-09-28Part144-2.mp3", "Club del Country — Part 144B", "country music bluegrass honky tonk americana radio", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/2009-09-28Part144-3.mp3", "clubdelcountry", "2009/2009-09-28Part144-3.mp3", "Club del Country — Part 144C", "country music bluegrass honky tonk americana radio", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-10-19Part147-1.mp3", "clubdelcountry", "2009/cdc2009-10-19Part147-1.mp3", "Club del Country — Part 147A", "country music bluegrass honky tonk americana radio", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-10-19Part147-2.mp3", "clubdelcountry", "2009/cdc2009-10-19Part147-2.mp3", "Club del Country — Part 147B", "country music bluegrass honky tonk americana radio", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-10-26Part148-1.mp3", "clubdelcountry", "2009/cdc2009-10-26Part148-1.mp3", "Club del Country — Part 148A", "country music bluegrass honky tonk americana radio", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-11-02Part149-1.mp3", "clubdelcountry", "2009/cdc2009-11-02Part149-1.mp3", "Club del Country — Part 149A", "country music bluegrass honky tonk americana radio", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-12-07Part154-1.mp3", "clubdelcountry", "2009/cdc2009-12-07Part154-1.mp3", "Club del Country — Part 154A", "country music bluegrass honky tonk americana radio", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/2009-09-21Part143-3.mp3", "clubdelcountry", "2009/2009-09-21Part143-3.mp3", "Club del Country — Part 143C", "country music bluegrass honky tonk americana radio", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-10-05Part145-1.mp3", "clubdelcountry", "2009/cdc2009-10-05Part145-1.mp3", "Club del Country — Part 145A", "country music bluegrass honky tonk americana radio", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-10-05Part145-2.mp3", "clubdelcountry", "2009/cdc2009-10-05Part145-2.mp3", "Club del Country — Part 145B", "country music bluegrass honky tonk americana radio", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-10-05Part145-3.mp3", "clubdelcountry", "2009/cdc2009-10-05Part145-3.mp3", "Club del Country — Part 145C", "country music bluegrass honky tonk americana radio", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-10-12Part146-1.mp3", "clubdelcountry", "2009/cdc2009-10-12Part146-1.mp3", "Club del Country — Part 146A", "country music bluegrass honky tonk americana radio", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-10-12Part146-2.mp3", "clubdelcountry", "2009/cdc2009-10-12Part146-2.mp3", "Club del Country — Part 146B", "country music bluegrass honky tonk americana radio", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-10-12Part146-3.mp3", "clubdelcountry", "2009/cdc2009-10-12Part146-3.mp3", "Club del Country — Part 146C", "country music bluegrass honky tonk americana radio", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-10-19Part147-3.mp3", "clubdelcountry", "2009/cdc2009-10-19Part147-3.mp3", "Club del Country — Part 147C", "country music bluegrass honky tonk americana radio", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-11-02Part149-2.mp3", "clubdelcountry", "2009/cdc2009-11-02Part149-2.mp3", "Club del Country — Part 149B", "country music bluegrass honky tonk americana radio", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-11-02Part149-3.mp3", "clubdelcountry", "2009/cdc2009-11-02Part149-3.mp3", "Club del Country — Part 149C", "country music bluegrass honky tonk americana radio", 2009, "audio"),
    iaDirectRecovery("clubdelcountry::2009/cdc2009-12-07Part154-2.mp3", "clubdelcountry", "2009/cdc2009-12-07Part154-2.mp3", "Club del Country — Part 154B", "country music bluegrass honky tonk americana radio", 2009, "audio"),
  ],
  "911": [
    iaDirectRecovery("Free_20s_Jazz_Collection::Eubie_Blake-Charleston_Rag_11KHz.mp3", "Free_20s_Jazz_Collection", "Eubie_Blake-Charleston_Rag_11KHz.mp3", "Eubie Blake — Charleston Rag", "ragtime jazz early recording piano music", 1920, "audio"),
    iaDirectRecovery("Free_20s_Jazz_Collection::Bennie_Motens_KC_Jazz_Band-South_1924.mp3", "Free_20s_Jazz_Collection", "Bennie_Motens_KC_Jazz_Band-South_1924.mp3", "Bennie Moten — South", "ragtime jazz early recording dance band music", 1924, "audio"),
    iaDirectRecovery("Free_20s_Jazz_Collection::Ragtimers-Sister_Kate_11KHz.mp3", "Free_20s_Jazz_Collection", "Ragtimers-Sister_Kate_11KHz.mp3", "Ragtimers — Sister Kate", "ragtime jazz early recording dance band music", 1920, "audio"),
    iaDirectRecovery("Free_20s_Jazz_Collection::Raderman_Jazz_Orch-Dardanella.mp3", "Free_20s_Jazz_Collection", "Raderman_Jazz_Orch-Dardanella.mp3", "Raderman Jazz Orchestra — Dardanella", "ragtime jazz early recording dance band music", 1920, "audio"),
    iaDirectRecovery("TheColumbiansCollection1924-1929DirectedByBenSelvin::Aloma1925TheColumbians.mp3", "TheColumbiansCollection1924-1929DirectedByBenSelvin", "Aloma1925TheColumbians.mp3", "The Columbians — Aloma", "ragtime jazz early recording dance band music", 1925, "audio"),
    iaDirectRecovery("TheColumbiansCollection1924-1929DirectedByBenSelvin::AlongTheOldLakeTrail-letsDoAndSayWeDidnt1924TheColumbians.mp3", "TheColumbiansCollection1924-1929DirectedByBenSelvin", "AlongTheOldLakeTrail-letsDoAndSayWeDidnt1924TheColumbians.mp3", "The Columbians — Along the Old Lake Trail", "ragtime jazz early recording dance band music", 1924, "audio"),
    iaDirectRecovery("AbeLymanCollection1925-1934::AJazzHoliday1928AbeLyman.mp3", "AbeLymanCollection1925-1934", "AJazzHoliday1928AbeLyman.mp3", "Abe Lyman — A Jazz Holiday", "ragtime jazz early recording dance band music", 1928, "audio"),
    iaDirectRecovery("AbeLymanCollection1925-1934::AThousandDreamsOfYou1927AbeLymanOrch.mp3", "AbeLymanCollection1925-1934", "AThousandDreamsOfYou1927AbeLymanOrch.mp3", "Abe Lyman — A Thousand Dreams of You", "ragtime jazz early recording dance band music", 1927, "audio"),
    iaDirectRecovery("PaulWhiteman1920-1935CompleteCollection::ABenchInThePark1930.mp3", "PaulWhiteman1920-1935CompleteCollection", "ABenchInThePark1930.mp3", "Paul Whiteman — A Bench in the Park", "ragtime jazz early recording dance band music", 1930, "audio"),
    iaDirectRecovery("TedLewisCollection1919-1934::12thStreetRag.mp3", "TedLewisCollection1919-1934", "12thStreetRag.mp3", "Ted Lewis — 12th Street Rag", "ragtime jazz early recording dance band music", 1920, "audio"),
  ],
  "202": [
    iaDirectRecovery("funny_or_die_video_c448c08b43::funny_or_die_video_c448c08b43.mp4", "funny_or_die_video_c448c08b43", "funny_or_die_video_c448c08b43.mp4", "Funny or Die — Frank Caliendo as Robin Williams", "sketch comedy comedy television television comedy satire variety comedy", 2007),
    iaDirectRecovery("funny_or_die_video_6fe300366c::funny_or_die_video_6fe300366c.mp4", "funny_or_die_video_6fe300366c", "funny_or_die_video_6fe300366c.mp4", "Funny or Die — The Struggle", "sketch comedy comedy television television comedy satire variety comedy", 2008),
    iaDirectRecovery("funny_or_die_video_a4f0fc202c::funny_or_die_video_a4f0fc202c.mp4", "funny_or_die_video_a4f0fc202c", "funny_or_die_video_a4f0fc202c.mp4", "Funny or Die — Bone Boys", "sketch comedy comedy television television comedy satire variety comedy", 2007),
    iaDirectRecovery("funny_or_die_video_ccf55d37d5::funny_or_die_video_ccf55d37d5.mp4", "funny_or_die_video_ccf55d37d5", "funny_or_die_video_ccf55d37d5.mp4", "Funny or Die — Barack Obama Parody", "sketch comedy comedy television television comedy satire variety comedy parody", 2008),
    iaDirectRecovery("funny_or_die_video_23f31714f1::funny_or_die_video_23f31714f1.mp4", "funny_or_die_video_23f31714f1", "funny_or_die_video_23f31714f1.mp4", "Funny or Die — Puppet Master", "sketch comedy comedy television television comedy satire variety comedy parody", 2007),
    iaDirectRecovery("funny_or_die_video_99dc26bea6::funny_or_die_video_99dc26bea6.mp4", "funny_or_die_video_99dc26bea6", "funny_or_die_video_99dc26bea6.mp4", "Funny or Die — Welcome Back, Mitter", "sketch comedy comedy television television comedy satire variety comedy", 2015),
    iaDirectRecovery("funny_or_die_video_ffb28251cf::funny_or_die_video_ffb28251cf.mp4", "funny_or_die_video_ffb28251cf", "funny_or_die_video_ffb28251cf.mp4", "Funny or Die — Bamboo Shoot Charlie", "sketch comedy comedy television television comedy satire variety comedy", 2008),
    iaDirectRecovery("funny_or_die_video_81fbe5d5e1::funny_or_die_video_81fbe5d5e1.mp4", "funny_or_die_video_81fbe5d5e1", "funny_or_die_video_81fbe5d5e1.mp4", "Funny or Die — Goblet of Fire Parody", "sketch comedy comedy television television comedy satire variety comedy parody", 2008),
    iaDirectRecovery("funny_or_die_video_7a6a553d5c::funny_or_die_video_7a6a553d5c.mp4", "funny_or_die_video_7a6a553d5c", "funny_or_die_video_7a6a553d5c.mp4", "Funny or Die — Emily Panda Bear", "sketch comedy comedy television television comedy satire variety comedy", 2008),
    iaDirectRecovery("funny_or_die_video_85b55a518d::funny_or_die_video_85b55a518d.mp4", "funny_or_die_video_85b55a518d", "funny_or_die_video_85b55a518d.mp4", "Funny or Die — Crumie Video Show", "sketch comedy comedy television television comedy satire variety comedy", 2008),
    iaDirectRecovery("funny_or_die_video_3fb3b7813a::funny_or_die_video_3fb3b7813a.mp4", "funny_or_die_video_3fb3b7813a", "funny_or_die_video_3fb3b7813a.mp4", "Funny or Die — Human Stupidity Fun", "sketch comedy comedy television television comedy satire variety comedy", 2008),
    iaDirectRecovery("funny_or_die_video_dd40ea255c::funny_or_die_video_dd40ea255c.mp4", "funny_or_die_video_dd40ea255c", "funny_or_die_video_dd40ea255c.mp4", "Funny or Die — Kiss Me, Gordon", "sketch comedy comedy television television comedy satire variety comedy", 2008),
  ],
  "923": [
    iaDirectRecovery("aporee_47226_82987::soundmap202512173.mp3", "aporee_47226_82987", "soundmap202512173.mp3", "Aporee — Traditional Market Soundscape", "field recording soundscape urban soundscape environmental recording phonography", 2025, "audio"),
    iaDirectRecovery("aporee_71036_82847::soundmap202512105.mp3", "aporee_71036_82847", "soundmap202512105.mp3", "Aporee — Morning in the Woods", "field recording soundscape nature sounds wildlife sounds environmental recording phonography", 2025, "audio"),
    iaDirectRecovery("aporee_71453_83365::BremnesfortGermanWWIIbunkerisland.mp3", "aporee_71453_83365", "BremnesfortGermanWWIIbunkerisland.mp3", "Aporee — Bunker Island", "field recording soundscape environmental recording industrial soundscape phonography", 2024, "audio"),
    iaDirectRecovery("aporee_71214_83066::soundmap2026021134.mp3", "aporee_71214_83066", "soundmap2026021134.mp3", "Aporee — Evening on the Riverbank", "field recording soundscape nature sounds wildlife sounds rural soundscape environmental recording", 2026, "audio"),
    iaDirectRecovery("aporee_71311_83197::soundmap2025100510.mp3", "aporee_71311_83197", "soundmap2025100510.mp3", "Aporee — Beside the Tracks", "field recording soundscape industrial soundscape urban soundscape environmental recording", 2025, "audio"),
    iaDirectRecovery("aporee_72730_84913::StSaviourswithhumedit.mp3", "aporee_72730_84913", "StSaviourswithhumedit.mp3", "Aporee — Bridge Vibrations", "field recording soundscape industrial soundscape environmental recording phonography", 2006, "audio"),
  ],
  "242": [
    iaDirectRecovery("SPITZ-ssc2007-09v3::ssc2007-09v3_qt4.mp4", "SPITZ-ssc2007-09v3", "ssc2007-09v3_qt4.mp4", "Spitzer — Mapping a Distant Planet", "earth observation satellite imagery earth from space remote sensing planet earth aerial photography", 2007),
    iaDirectRecovery("SPD-HUBBLE-STScI-2005-17a::low_quicktime.mp4", "SPD-HUBBLE-STScI-2005-17a", "low_quicktime.mp4", "Hubble — Deep Impact Collision", "earth observation satellite imagery earth from space remote sensing planet earth space science", 2005),
    iaDirectRecovery("SPITZ-ssc2004-22v2::ssc2004-22v2_qt4.mp4", "SPITZ-ssc2004-22v2", "ssc2004-22v2_qt4.mp4", "Spitzer — Planet Forming Disk", "earth observation satellite imagery earth from space remote sensing planet earth space science", 2004),
    iaDirectRecovery("OurWorldSnowflakes::OW37SnowflakesClean.mp4", "OurWorldSnowflakes", "OW37SnowflakesClean.mp4", "Our World — Snowflakes", "earth observation satellite imagery planet earth aerial photography earth science nature", 2010),
    iaDirectRecovery("NASA_360_program2_HD::NASA_360_program2_HD.mp4", "NASA_360_program2_HD", "NASA_360_program2_HD.mp4", "NASA 360 — Earth and Space", "earth observation satellite imagery earth from space remote sensing planet earth space science", 2008),
    iaDirectRecovery("expedition-28-crew-records-video-of-hurricane-irene-from-the-iss-fki5r9T6dZk::expedition-28-crew-records-video-of-hurricane-irene-from-the-iss-fki5r9T6dZk.mp4", "expedition-28-crew-records-video-of-hurricane-irene-from-the-iss-fki5r9T6dZk", "expedition-28-crew-records-video-of-hurricane-irene-from-the-iss-fki5r9T6dZk.mp4", "ISS — Hurricane Irene from Orbit", "earth observation satellite imagery earth from space remote sensing planet earth aerial photography weather", 2011),
  ],
  "904": [
    iaDirectRecovery("ca200_cjazz::106_Infinitus_Ensemble__The_Pink_Shoes_Of_Marie_Antoinette.mp3", "ca200_cjazz", "106_Infinitus_Ensemble__The_Pink_Shoes_Of_Marie_Antoinette.mp3", "Clinical Archives — Infinitus Ensemble", "jazz contemporary jazz jazz fusion jazz improvisation", 2008, "audio"),
    iaDirectRecovery("ca200_cjazz::107_Model_Of_The_Invisible__Bluffing_The_Archons.mp3", "ca200_cjazz", "107_Model_Of_The_Invisible__Bluffing_The_Archons.mp3", "Clinical Archives — Model of the Invisible", "jazz contemporary jazz jazz fusion jazz improvisation", 2008, "audio"),
    iaDirectRecovery("ca200_cjazz::108_Broken_Quartet__Popsong.mp3", "ca200_cjazz", "108_Broken_Quartet__Popsong.mp3", "Clinical Archives — Broken Quartet", "jazz contemporary jazz jazz fusion jazz improvisation", 2008, "audio"),
    iaDirectRecovery("ca200_cjazz::201_TMK__Les_Faiseurs_de_Zombi.mp3", "ca200_cjazz", "201_TMK__Les_Faiseurs_de_Zombi.mp3", "Clinical Archives — TMK", "jazz contemporary jazz jazz fusion jazz improvisation", 2008, "audio"),
    iaDirectRecovery("ca200_cjazz::202_Benzolnye_Mertvecy__v_mast.mp3", "ca200_cjazz", "202_Benzolnye_Mertvecy__v_mast.mp3", "Clinical Archives — Benzolnye Mertvecy", "jazz contemporary jazz jazz fusion jazz improvisation", 2008, "audio"),
    iaDirectRecovery("ca200_cjazz::203_BF__First_Meeting_Took_Place_In_A_Tram.mp3", "ca200_cjazz", "203_BF__First_Meeting_Took_Place_In_A_Tram.mp3", "Clinical Archives — First Meeting", "jazz contemporary jazz jazz fusion jazz improvisation", 2008, "audio"),
    iaDirectRecovery("ca200_cjazz::204_Phlox__S6jajalgne.mp3", "ca200_cjazz", "204_Phlox__S6jajalgne.mp3", "Clinical Archives — Phlox", "jazz contemporary jazz jazz fusion jazz improvisation", 2008, "audio"),
  ],
  "920": [
    iaDirectRecovery("AbeLymanCollection1925-1934::ACottageForSale1930AbeLymanOrch.vitaphoneSoundtrackV.PhilNeeley.mp3", "AbeLymanCollection1925-1934", "ACottageForSale1930AbeLymanOrch.vitaphoneSoundtrackV.PhilNeeley.mp3", "Abe Lyman — A Cottage for Sale", "78rpm shellac gramophone phonograph early recording dance band vaudeville", 1930, "audio"),
    iaDirectRecovery("AbeLymanCollection1925-1934::AceInTheHole1926AbeLyman.mp3", "AbeLymanCollection1925-1934", "AceInTheHole1926AbeLyman.mp3", "Abe Lyman — Ace in the Hole", "78rpm shellac gramophone phonograph early recording dance band vaudeville", 1926, "audio"),
    iaDirectRecovery("AbeLymanCollection1925-1934::AfterISayImSorry-1926vCkAbeLyman.mp3", "AbeLymanCollection1925-1934", "AfterISayImSorry-1926vCkAbeLyman.mp3", "Abe Lyman — After I Say I'm Sorry", "78rpm shellac gramophone phonograph early recording dance band vaudeville", 1926, "audio"),
    iaDirectRecovery("AbeLymanCollection1925-1934::AintMisbehavin1929AbeLyman.mp3", "AbeLymanCollection1925-1934", "AintMisbehavin1929AbeLyman.mp3", "Abe Lyman — Ain't Misbehavin'", "78rpm shellac gramophone phonograph early recording dance band vaudeville", 1929, "audio"),
    iaDirectRecovery("PaulWhiteman1920-1935CompleteCollection::ABigBouquetForYou.mp3", "PaulWhiteman1920-1935CompleteCollection", "ABigBouquetForYou.mp3", "Paul Whiteman — A Big Bouquet for You", "78rpm shellac gramophone phonograph early recording dance band vaudeville", 1929, "audio"),
    iaDirectRecovery("PaulWhiteman1920-1935CompleteCollection::ABoyAndAGirlWereDancing.mp3", "PaulWhiteman1920-1935CompleteCollection", "ABoyAndAGirlWereDancing.mp3", "Paul Whiteman — A Boy and a Girl Were Dancing", "78rpm shellac gramophone phonograph early recording dance band vaudeville", 1928, "audio"),
    iaDirectRecovery("PaulWhiteman1920-1935CompleteCollection::ABundleOfOldLoveLetters.mp3", "PaulWhiteman1920-1935CompleteCollection", "ABundleOfOldLoveLetters.mp3", "Paul Whiteman — A Bundle of Old Love Letters", "78rpm shellac gramophone phonograph early recording dance band vaudeville", 1930, "audio"),
    iaDirectRecovery("PaulWhiteman1920-1935CompleteCollection::AFadedSummerLove.mp3", "PaulWhiteman1920-1935CompleteCollection", "AFadedSummerLove.mp3", "Paul Whiteman — A Faded Summer Love", "78rpm shellac gramophone phonograph early recording dance band vaudeville", 1930, "audio"),
  ],
});
/* These file names were verified against the IA metadata endpoint during the
   v172 soak. Carrying the known playable derivative with the recovery record
   prevents a warm five-item shelf from waiting on another metadata roundtrip
   before the background rotation can deepen. */
const IA_LONG_TAIL_MEDIA_FILES = Object.freeze({
  /* Existing Monster Island recovery IDs were valid Archive records but had
     no derivative map, so cold hydration still had to rediscover metadata. */
  "1989gojirataibiorante.720p.ac3.cg": "1989 Gojira tai Biorante.720p.ac3.CG.mp4",
  "1992gojirataimosura.720p.ac3.cg": "1992 Gojira tai Mosura.720p.ac3.CG.mp4",
  "thereturnofgodzilla1984": "THE RETURN OF GODZILLA (1984) Japanese version (HD).mp4",
  "GodzillaThingRedMenace": "Godzilla vs. the Thing - Red Menace Reconstruction.mp4",
  "ultraman-monster-movie-feature-1967": "Ultraman Monster Movie Feature (1967).ia.mp4",
  /* Motor City uses the same targeted recovery path: the records are real,
     but explicit derivatives let the second hot item promote without a
     metadata roundtrip during a cold or burst-loaded tune. */
  "Automoti1940": "Automoti1940.mp4",
  "Signal301959": "Signal301959.mp4",
  "RoadRunn1952": "RoadRunn1952.mp4",
  "MasterHa1936": "MasterHa1936.mp4",
  "MasterHa1936_3": "MasterHa1936_3.mp4",
  "VisittoW1950": "VisittoW1950.mp4",
  "Aluminum1956_2": "Aluminum1956_2.mp4",
  "MasterHa1936_2": "MasterHa1936_2.mp4",
  "MasterHa1936_4": "MasterHa1936_4.mp4",
  "Oldsmobi1941": "Oldsmobi1941.mp4",
  "American1958_2": "American1958_2.mp4",
  "DefenseC1941": "DefenseC1941.mp4",
  "CurtissW1944": "CurtissW1944.mp4",
  "American1955": "American1955.mp4",
  "styling_and_the_experimental_car": "styling_and_the_experimental_car.mp4",
  "youtube-F8mWrEDUrgs": "WYC_Peanut_Regatta_-_10_27_2019_Photos_Taken_from_S_V_Alive_and_Free-F8mWrEDUrgs.mp4",
  "youtube-G7qFvL5A9U4": "WYC_Peanut_Regatta_05_26_2019_taken_from_S_V_Selah-G7qFvL5A9U4.mp4",
  "youtube--_MDjbRl6aU": "-_MDjbRl6aU.mp4",
  "youtube-3QyyKJaiD2Q": "3QyyKJaiD2Q.mp4",
  "youtube-B8uXEA9qfBk": "B8uXEA9qfBk.mp4",
  "youtube-KOx3lmwL0ps": "WYC_Peanut_Regatta_-_June_9th_2019_-_Galveston_Bay_Texas-KOx3lmwL0ps.mp4",
  "youtube-IRIldROcDjM": "IRIldROcDjM.mp4",
  "youtube-4nSPQEO8z3I": "4nSPQEO8z3I.mp4",
  "ualrar-UA_Little_Rock_2022_Cardboard_Boat_Regatta": "UA_Little_Rock_2022_Cardboard_Boat_Regatta.mp4",
  "Xcorps64NoodSailingHD2": "Xcorps64NoodSailingHD2.mp4",
  "htvtx-Press_Pass_to_the_City_-_Two_Stars_of_Motown_-_The_Musical": "Press_Pass_to_the_City_-_Two_Stars_of_Motown_-_The_Musical.mp4",
  "tacmmi-Picnic_at_the_Opera_episode_5_season_3": "Picnic_at_the_Opera_episode_5_season_3.mp4",
  "The_Infamous_Stringdusters_Time_to_Part_Live_at_KDHX_3_17_14": "The_Infamous_Stringdusters_Time_to_Part_Live_at_KDHX_3_17_14.mp4",
  "The_Whigs_In_The_Dark_Live_at_KDHX_4_22_10_HD": "The_Whigs_In_The_Dark_Live_at_KDHX_4_22_10_HD.mp4",
  "wrokmi-Ferndale_HS_Marching_Band_at_the_2012_Holiday_Magic_Parade.": "Ferndale_HS_Marching_Band_at_the_2012_Holiday_Magic_Parade..mp4",
  "youtube-4bf1NwOj4NQ": "4bf1NwOj4NQ.mp4",
  "youtube-i7XC7di2Ck0": "i7XC7di2Ck0.mp4",
  "youtube-I_4IiJ79bgQ": "I_4IiJ79bgQ.mp4",
  "youtube-QI-AtDRaK-k": "QI-AtDRaK-k.mp4",
  "wbng-action-news-12-feb-18-1993": "WBNG Action News 12 Feb 18 1993.ia.mp4",
  "wapt-eyewitness-news-16-1997": "WAPT Eyewitness News 16 1997.ia.mp4",
  "wbng-tv-12-action-news-feb-19-1993": "WBNG TV 12 Action News Feb 19 1993.ia.mp4",
  "wwl-eyewitness-news-1991": "WWL Eyewitness News at 10 PM 1991.ia.mp4",
  "wcax-late-news-start-feb-6-1992": "WCAX Late News start Feb 6 1992.mp4",
  "wapt-16-eyewitness-news-episode-1993": "WAPT 16 Eyewitness News episode 1993.ia.mp4",
  "WNYWFox5NewsAt10June29th1994": "WNYW - Fox 5 News at 10, June 29th 1994.mp4",
  "wwl-eyewitness-news-at-noon-july-1996": "WWL Eyewitness News at Noon July 1996.ia.mp4",
  "wbrz-eyewitness-news-1994-full-cast": "WBRZ Eyewitness News 1994 full cast.ia.mp4",
  "wwl-eyewitness-news-at-10-pm-feb-6-1990-b": "WWL Eyewitness news at 10 PM Feb 6 1990 b.mp4",
  "msnbc.com-video-2006-10-08": "mtp_netcast_061008.mp4",
  "BBCNEWS_20190106_113000_Dateline_London": "BBCNEWS_20190106_113000_Dateline_London.mp4",
  "WRC_20131028_072000_Dateline_NBC": "WRC_20131028_072000_Dateline_NBC.mp4",
  "msnbc.com-video-2003-11-04": "n_online_cheat_031104.mp4",
  "msnbc.com-video-2003-05-14": "nn_myers_terror_030514.mp4",
  "nightline-april-26-1999": "DVD Video Recording_Title19.mp4",
  "abc-news-nightline-june-20-1986": "ABC News Nightline (June 20, 1986).mp4",
  "nightline-the-hajj": "Nightline The Hajj.mp4",
  "james-randi-on-dateline-1995": "James Randi on Dateline, 1995.ia.mp4",
  "20220107-105032": "20220107_105032.mp4",
  "20220107-172111_20260728": "20220107_172111.mp4",
  "iVillage_60_Minutes": "iVillage_60_Minutes.mp4",
  "wto-60-minutes-explores-anarchists-and-battle-of-seattle": "WTO - 60 Minutes Explores Anarchists and Battle of Seattle.mp4",
});
/* Keep a single cold tune from opening three identical Archive requests while
   several viewers or the soak harness hit the same rail together. This map is
   intentionally process-local and ephemeral; the durable result remains in
   Cache API/KV below. */
const iaSearchInflight = new Map();
/* A simultaneous 171-channel cold sweep can otherwise open one Archive
   request per editorial rail per channel. Deduplication only helps identical
   queries; these lanes are intentionally different. Bound the upstream search
   fan-out across foreground and waitUntil work, while the normal cache keeps
   warm requests fast. */
const IA_ARCHIVE_SEARCH_FOREGROUND_CONCURRENCY = 4;
const IA_ARCHIVE_SEARCH_BACKGROUND_CONCURRENCY = 2;
let iaArchiveSearchActive = 0;
let iaArchiveSearchForegroundActive = 0;
const iaArchiveSearchForegroundWaiters = [];
const iaArchiveSearchBackgroundWaiters = [];
async function withIaArchiveSearchPermit(task, foreground = false) {
  const canRun = () => foreground
    ? iaArchiveSearchForegroundActive < IA_ARCHIVE_SEARCH_FOREGROUND_CONCURRENCY
    : iaArchiveSearchActive < (IA_ARCHIVE_SEARCH_FOREGROUND_CONCURRENCY + IA_ARCHIVE_SEARCH_BACKGROUND_CONCURRENCY);
  if (!canRun()) {
    await new Promise((resolve) => (foreground ? iaArchiveSearchForegroundWaiters : iaArchiveSearchBackgroundWaiters).push(resolve));
  }
  iaArchiveSearchActive += 1;
  if (foreground) iaArchiveSearchForegroundActive += 1;
  try {
    return await task();
  } finally {
    iaArchiveSearchActive = Math.max(0, iaArchiveSearchActive - 1);
    if (foreground) iaArchiveSearchForegroundActive = Math.max(0, iaArchiveSearchForegroundActive - 1);
    const next = iaArchiveSearchForegroundWaiters.shift() || iaArchiveSearchBackgroundWaiters.shift();
    if (next) next();
  }
}
/* TV, phone, and guide requests can hydrate the same queue at once. Share the
   metadata promise for an identifier so a burst does not fan out into three
   identical Archive metadata requests before the edge cache write is visible. */
const iaMetadataInflight = new Map();
/* A partial queue can be served immediately while its approved candidates are
   rehydrated in the background. Keep that repair single-flight per edge key so
   a fast channel-surfing client cannot open duplicate metadata storms. */
const iaQueueHydrationInflight = new Map();
/* Archive is the shared upstream for both discovery and media metadata. A
   full-catalog tune burst can otherwise let every background refill open its
   own five-worker metadata fan-out. Use the existing per-isolate in-flight
   maps as a pressure signal and lower only the worker count for new refills;
   healthy warm shelves keep their normal parallelism. */
function iaAdaptiveHydrationConcurrency(configured, itemCount) {
  const configuredCount = Math.max(1, Number(configured) || 5);
  const pressure = iaQueueHydrationInflight.size + Math.ceil(iaSearchInflight.size / 4);
  const ceiling = pressure >= 12 ? 1 : pressure >= 6 ? 2 : pressure >= 3 ? 3 : 5;
  return Math.max(1, Math.min(5, configuredCount, ceiling, itemCount));
}
function iaArchiveRetryDelay(attempt, retryAfterSeconds) {
  const retryAfter = Number(retryAfterSeconds);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(IA_ARCHIVE_RETRY_MAX_DELAY_MS, Math.max(80, retryAfter * 1000));
  }
  return Math.min(IA_ARCHIVE_RETRY_MAX_DELAY_MS, IA_ARCHIVE_RETRY_DELAY_MS * (2 ** Math.max(0, Number(attempt) || 0)));
}
const GULF_FILTER = "BBOX(geometry,-98,18,-80,31)";
const KPLER_FIELDS = "mmsi,longitude,latitude,posDt,sog,vesselName,heading,cog,navStatus,destination,vesselType";
/* Public navigation is intentionally limited to named regions. The Worker
   never accepts an arbitrary upstream URL or arbitrary paid-data filter. */
const SHIP_REGIONS = Object.freeze({
  /* Open Waters limits anonymous snapshots to roughly 100 square degrees.
     Split the Gulf into four bounded tiles so a provider fallback cannot turn
     a valid regional desk into an empty response. */
  gulf: { bboxes: ["18,-98,28,-89", "28,-98,31,-89", "18,-89,28,-80", "28,-89,31,-80"] },
  atlantic: { bbox: "0,-75,65,20" },
  /* OpenWaters treats a west-to-east box that crosses the date line as empty.
     Keep the user-facing Pacific desk intact, but query its two valid halves. */
  pacific: { bboxes: ["-55,120,55,180", "-55,-180,55,-75"] },
  americas: { bbox: "-55,-135,65,-35" },
  europe: { bbox: "30,-25,72,45" },
  africa: { bbox: "-38,-20,38,55" },
  indian: { bbox: "-40,40,30,115" },
  asia: { bbox: "-15,90,65,180" },
  world: { bbox: "-90,-180,90,180" },
});

function spreadShipFeatures(features, limit) {
  if (features.length <= limit) return features;
  const buckets = Array.from({ length: 24 }, () => []);
  features.forEach((feature) => {
    const lon = Number(feature && feature.geometry && feature.geometry.coordinates && feature.geometry.coordinates[0]);
    const index = Number.isFinite(lon) ? Math.max(0, Math.min(23, Math.floor((lon + 180) / 15))) : 0;
    buckets[index].push(feature);
  });
  const result = [];
  let added = true;
  while (result.length < limit && added) {
    added = false;
    for (const bucket of buckets) {
      if (bucket.length && result.length < limit) {
        result.push(bucket.shift());
        added = true;
      }
    }
  }
  return result;
}

function normalizeShipSnapshot(payload) {
  /* Providers have used both FeatureCollection and tabular envelopes. Keep
     that difference at the Worker boundary so the browser has one contract. */
  let rows = [];
  if (Array.isArray(payload)) rows = payload;
  else if (payload && Array.isArray(payload.features)) rows = payload.features;
  else if (payload && Array.isArray(payload.data)) rows = payload.data;
  else if (payload && Array.isArray(payload.vessels)) rows = payload.vessels;
  else if (payload && Array.isArray(payload.results)) rows = payload.results;
  else if (payload && Array.isArray(payload.items)) rows = payload.items;
  else if (payload && Array.isArray(payload.records)) rows = payload.records;

  return rows.map((row) => {
    const feature = row && row.geometry ? row : null;
    const source = feature && feature.properties ? feature.properties : (row || {});
    const coords = feature && feature.geometry && Array.isArray(feature.geometry.coordinates)
      ? feature.geometry.coordinates : [];
    const latitude = Number(source.latitude ?? source.lat ?? coords[1]);
    const longitude = Number(source.longitude ?? source.lon ?? source.lng ?? coords[0]);
    const mmsi = source.mmsi ?? source.MMSI ?? source.imo;
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [longitude, latitude] },
      properties: {
        mmsi,
        longitude,
        latitude,
        posDt: source.posDt ?? source.positionTime ?? source.timestamp ?? source.seen,
        sog: source.sog ?? source.speed,
        cog: source.cog,
        heading: source.heading,
        navStatus: source.navStatus ?? source.nav_status,
        destination: source.destination,
        vesselName: source.vesselName ?? source.name ?? source.shipName,
        vesselType: source.vesselType ?? source.type,
      },
    };
  }).filter((feature) => {
    const p = feature.properties;
    return p.mmsi != null && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
      && p.latitude >= -90 && p.latitude <= 90 && p.longitude >= -180 && p.longitude <= 180;
  });
}
const WFIGS_INCIDENTS_URL = "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query";
const WFIGS_FIELDS = ["IncidentName", "IncidentSize", "PercentContained", "FireDiscoveryDateTime", "POOState", "POOCounty", "IncidentTypeCategory", "FireBehaviorGeneral", "FireCauseGeneral", "FireMgmtComplexity", "EstimatedCostToDate", "IncidentManagementOrganization"].join(",");
const GULF_TIDE_STATIONS = [
  ["8771450", "Galveston Pier 21, TX", 29.310, -94.793], ["8770570", "Sabine Pass, TX", 29.728, -93.870],
  ["8774770", "Rockport, TX", 28.022, -97.047], ["8779770", "Port Isabel, TX", 26.061, -97.215],
  ["8761724", "Grand Isle, LA", 29.263, -89.957], ["8735180", "Dauphin Island, AL", 30.250, -88.075],
  ["8729840", "Pensacola, FL", 30.404, -87.211], ["8728690", "Apalachicola, FL", 29.727, -84.981],
  ["8726724", "Clearwater Beach, FL", 27.978, -82.832], ["8724580", "Key West, FL", 24.551, -81.808],
];
const GULF_BUOYS = [
  ["42035", "Galveston", 29.212, -94.207], ["42019", "Freeport", 27.910, -95.353], ["42020", "Corpus Christi", 26.968, -96.695],
  ["42002", "Gulf of Mexico", 25.170, -94.420], ["42040", "Louisiana Offshore", 29.213, -88.207], ["42012", "Orange Beach", 30.060, -87.550],
];
/* Texas-only on-air camera shelf. Every entry below was checked against TxDOT's
   individual snapshot endpoint before shipping. Keep this list fixed: callers
   can choose a rotation slot but cannot make this Worker proxy arbitrary URLs. */
const TEXAS_HIGHWAY_CAMS = [
  ["AUS", "FM-734 @ US-290 EB", "Austin · FM 734 at US 290"],
  ["HOU", "Aldine Westfield Rd @ Treaschwig Rd", "Houston · Aldine Westfield at Treaschwig"],
  ["SAT", "IH 10 at CR 217 (MM 626)", "San Antonio · IH-10 at CR 217"],
  ["CRP", "CRP-IH37 @ Buddy Lawrence", "Corpus Christi · IH-37 at Buddy Lawrence"],
  ["WAC", "I35.LeroyPkwy-Waco", "Waco · I-35 at Leroy Parkway"],
  ["FTW", "BU287 @ Franklin", "Fort Worth · Business 287 at Franklin"],
  ["TYL", "TYL.IH20.SH149", "Tyler · IH-20 at SH-149"],
  ["LBB", "LBB-IH27@98TH", "Lubbock · IH-27 at 98th Street"],
  ["AMA", "AMA-IH27 @ IH40 South", "Amarillo · IH-27 at IH-40"],
  ["BRY", "BRY-IH45@FM977", "Brazos Valley · IH-45 at FM-977"],
  ["YKM", "IH-10 West @ Chew", "El Paso District · IH-10 West at Chew"],
  ["DAL", "IH20 @ Dallas-Tarrant CL", "Dallas · IH-20 at the Dallas–Tarrant line"],
  ["WAC", "LP340.KendallLane-Waco", "Waco · Loop 340 at Kendall Lane"],
  ["WAC", "IH14.Connel.Belton", "Waco area · IH-14 at Connell, Belton"],
];
const TXDOT_CCTV_URL = "https://its.txdot.gov/its/DistrictIts/GetCctvSnapshotByIcdId";
/* One nearby public camera search per world city. OpenEye only provides the
   catalog/attribution; image bytes are fetched from each camera's disclosed
   source URL and relayed as a bounded, cacheable image response. */
const WORLD_CAM_CITIES = [
  ["Paris, France", 48.8566, 2.3522], ["Tokyo, Japan", 35.6762, 139.6503],
  ["Sydney, Australia", -33.8688, 151.2093], ["Cape Town, South Africa", -33.9249, 18.4241],
  ["Buenos Aires, Argentina", -34.6037, -58.3816], ["Reykjavik, Iceland", 64.1466, -21.9426],
  ["Auckland, New Zealand", -36.8509, 174.7645], ["Singapore", 1.3521, 103.8198],
];
const OPEN_EYE_CATALOG_URL = "https://api.openeye.cam/v1/catalog";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "X-Afterglow-Source, X-Afterglow-Cache, X-Afterglow-Queue-Ready, X-Afterglow-Queue-Partial, X-Afterglow-Queue-Fallback, X-Afterglow-Ship-Diagnostics",
    "Vary": "Origin",
  };
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

/* Internet Archive fallback -------------------------------------------------
   Some privacy extensions block archive.org in a browser context. The app uses
   this narrowly-scoped route only for search and metadata; media itself is sent
   straight to the item's ia*.us.archive.org CDN host, so this Worker never
   becomes a high-bandwidth video relay or a general-purpose proxy. */
function safeIaId(id) {
  return /^[A-Za-z0-9._-]{1,180}$/.test(id || "");
}

function iaResponse(upstream, extraHeaders = {}) {
  const headers = new Headers(upstream.headers);
  Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value));
  headers.set("Cache-Control", "public, max-age=300");
  headers.set("X-Afterglow-Source", "internet-archive-relay");
  Object.entries(extraHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(upstream.body, { status: upstream.status, headers });
}

function cacheableJson(body, ttlSeconds, extraHeaders = {}) {
  return json(body, 200, {
    "Cache-Control": "public, max-age=" + ttlSeconds,
    ...extraHeaders,
  });
}

/* Cache API is extremely fast but local to the serving edge.  The dial needs a
   second, shared shelf so a ready program found on one device is immediately
   useful to another device (or after the viewer moves between networks). */
async function sharedQueueGet(env, key) {
  if (!env || !env.REALSIGNAL_QUEUE) return null;
  let timer;
  try {
    const read = env.REALSIGNAL_QUEUE.get(key, { type: "json" });
    return await Promise.race([
      read,
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), IA_SHARED_QUEUE_READ_TIMEOUT_MS); }),
    ]);
  } catch (error) {
    console.warn(JSON.stringify({ event: "shared-queue-read-failed", message: String(error && error.message || error) }));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function sharedQueueFallbackKey(identity) {
  return IA_QUEUE_KV_PREFIX + IA_LAST_GOOD_CACHE_VERSION + ":last-good:" + encodeURIComponent(String(identity || "").trim());
}

function mergeIaFallbackCandidates(previous, payload) {
  const sourceItems = (value) => {
    const candidates = Array.isArray(value && value.candidateItems) && value.candidateItems.length
      ? value.candidateItems
      : ((value && value.items) || []);
    /* The last-good shelf is a playback fallback, not a metadata catalog.
       Keeping raw identifiers here made an old shallow response look deep
       while every later rotation still had to rediscover its media. */
    return candidates.filter((item) => item && item.identifier && item.media && item.media.url);
  };
  const prior = sourceItems(previous), current = sourceItems(payload);
  const diversity = (payload && payload.diversity) || (previous && previous.diversity) || {};
  const cap = (value, fallback) => Math.max(1, Math.min(5, Math.round(Number(value) || fallback)));
  const limits = {
    family: cap(diversity.maxPerFamily, 1),
    creator: cap(diversity.maxPerCreator, 1),
    collection: cap(diversity.maxPerCollection, 2),
    source: 2,
  };
  const ordered = [...current, ...prior], merged = [], seen = new Set();
  const counts = { family: new Map(), creator: new Map(), collection: new Map(), source: new Map() };
  const canAdd = (item, relaxed) => {
    if (!item || !item.identifier || seen.has(item.identifier)) return false;
    if (relaxed) return true;
    const keys = queueDiversityKeys(item, item.lane);
    return (!keys.family || (counts.family.get(keys.family) || 0) < limits.family) &&
      (!keys.creator || (counts.creator.get(keys.creator) || 0) < limits.creator) &&
      (!keys.collection || (counts.collection.get(keys.collection) || 0) < limits.collection) &&
      (!keys.source || (counts.source.get(keys.source) || 0) < limits.source);
  };
  const add = (item) => {
    const keys = queueDiversityKeys(item, item.lane);
    seen.add(item.identifier);
    merged.push(item);
    Object.keys(counts).forEach((key) => {
      if (keys[key]) counts[key].set(keys[key], (counts[key].get(keys[key]) || 0) + 1);
    });
  };
  /* Put the newest verified catalog first so a same-rotation warm handoff
     still opens on the shelf that just proved playable, then retain older
     candidates as the rolling depth behind it. */
  for (const item of ordered) if (canAdd(item, false)) { add(item); if (merged.length >= IA_STRICT_CATALOG_CANDIDATE_MAX) return merged; }
  /* A genuinely sparse lane may have fewer distinct title families than the
     editorial caps allow. Preserve a usable fallback shelf in that case, but
     only after exhausting every diverse verified candidate first. */
  for (const item of ordered) if (canAdd(item, true)) { add(item); if (merged.length >= IA_STRICT_CATALOG_CANDIDATE_MAX) break; }
  return merged;
}

function sharedQueuePut(env, key, payload, ttlSeconds, ctx) {
  if (!env || !env.REALSIGNAL_QUEUE || !payload || !Array.isArray(payload.items) || !payload.items.length) return;
  const options = {
    expirationTtl: Math.max(60, Math.min(86400, Number(ttlSeconds) || IA_QUEUE_TTL_SECONDS)),
  };
  /* Keep the exact rotation cache for fresh programming, plus one last-good
     verified shelf for this exact editorial family. The foreground request
     supplies its stable identity; falling back to a channel number only keeps
     backwards compatibility for an old shelf and never mixes genre contracts. */
  const fallbackKey = payload.lastGoodKey || sharedQueueFallbackKey(payload.channel);
  const payloadCandidates = Array.isArray(payload.candidateItems) && payload.candidateItems.length
    ? payload.candidateItems
    : payload.items;
  const playableCandidateCount = payloadCandidates.filter((item) => item && item.identifier && item.media && item.media.url).length;
  const fullShelf = Number(payload.ready || payload.items.length) >= 5 && playableCandidateCount >= IA_FRESHNESS_CANDIDATE_FLOOR;
  const writes = [env.REALSIGNAL_QUEUE.put(key, JSON.stringify(payload), options)];
  /* Preserve the last complete five-show shelf. A one-item first-frame handoff
     may live briefly at its exact rotation key, but must never replace the
     recovery shelf and turn later tunes into a permanent 1/5 loop. */
  if (fullShelf) {
    writes.push((async () => {
      let previous = null;
      try { previous = await env.REALSIGNAL_QUEUE.get(fallbackKey, { type: "json" }); } catch {}
      const candidateItems = mergeIaFallbackCandidates(previous, payload);
      return env.REALSIGNAL_QUEUE.put(fallbackKey, JSON.stringify({
        ...payload,
        lastGood: true,
        candidateItems,
        candidates: candidateItems.length,
      }), {
        expirationTtl: Math.max(60, Math.min(86400, IA_QUEUE_TTL_SECONDS)),
      });
    })());
  }
  const write = Promise.all(writes).catch((error) => {
    console.warn(JSON.stringify({ event: "shared-queue-write-failed", message: String(error && error.message || error) }));
  });
  if (ctx) ctx.waitUntil(write);
}

function safeChannel(channel) {
  return /^[A-Za-z0-9._ -]{1,80}$/.test(channel || "");
}

function safeQueries(queries) {
  if (!Array.isArray(queries) || !queries.length || queries.length > 16) return null;
  const clean = queries.map((query) => String(query || "").trim()).filter(Boolean);
  /* Manufacturing Marvels has a deliberately strict factory vocabulary. Its
     generated rails are longer than the old generic cap but remain bounded;
     keep the guard finite without rejecting that approved channel before it
     reaches Archive discovery. */
  return clean.length && clean.every((query) => query.length <= 3600) ? clean : null;
}

/* A queue request carries the channel's approved editorial vocabulary. Search
   queries narrow Archive's pool, but its index can still return an item with a
   misleading or stale match. Verify the returned title/subjects before it can
   occupy one of the five on-air slots. */
function safeThemeTerms(terms) {
  if (!Array.isArray(terms)) return [];
  const seen = new Set();
  return terms.map((term) => String(term || "").trim()).filter((term) => {
    const key = term.toLowerCase();
    if (key.length < 3 || key.length > 96 || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 256);
}

function safeDenyTerms(terms) {
  return safeThemeTerms(terms);
}

function safeMediaTypes(types) {
  if (!Array.isArray(types)) return [];
  return [...new Set(types.map((type) => String(type || "").trim().toLowerCase()).filter((type) => type === "movies" || type === "audio"))];
}

function safeQueueRotation(value) {
  const rotation = Number(value);
  return Number.isInteger(rotation) && rotation >= 0 && rotation <= 127 ? rotation : 0;
}

function safeMinRuntimeSeconds(value) {
  const runtime = Math.round(Number(value) || 0);
  return Number.isFinite(runtime) && runtime > 0 ? Math.min(runtime, 86400) : 0;
}

function iaRuntimeSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  const text = String(value || "").trim();
  if (!text) return 0;
  const parts = text.split(":").map(Number);
  if (parts.length === 3 && parts.every(Number.isFinite)) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  if (parts.length === 2 && parts.every(Number.isFinite)) return Math.max(0, parts[0] * 60 + parts[1]);
  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i);
  const minutes = text.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)/i);
  if (hours || minutes) return Math.max(0, (hours ? Number(hours[1]) * 3600 : 0) + (minutes ? Number(minutes[1]) * 60 : 0));
  const numeric = Number.parseFloat(text);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function iaRuntimeAllowed(doc, minimumSeconds) {
  const minimum = safeMinRuntimeSeconds(minimumSeconds);
  if (!minimum) return true;
  const runtime = iaRuntimeSeconds(doc && doc.runtime);
  if (runtime > 0) return runtime >= minimum;
  /* Archive search rows sometimes omit duration even when the metadata file
     has it. Keep unknown-duration programs eligible for later hydration, but
     reject obvious clip/advertisement labels before they can win first play. */
  const label = String(doc && (doc.title || doc.identifier) || "");
  return !/(?:\bshorts?\b|\bclip\b|\btrailer\b|\bteaser\b|\bpreview\b|\bpromo(?:tion)?\b|\bcommercial\b|\bbumper\b|\bhighlight\b)/i.test(label);
}

/* Several IA channel manifests intentionally repeat a collection rail with a
   slightly different era/sort clause. Keep the editorial order, but do not
   spend a foreground Archive request twice on the same normalized query. This
   reduces cold-start burst pressure while leaving all distinct rails available
   to the background depth refill. */
function uniqueIaQueries(queries, limit = 8) {
  const seen = new Set(), result = [];
  for (const value of Array.isArray(queries) ? queries : []) {
    const query = String(value || "").replace(/\s+/g, " ").trim();
    const key = query.toLowerCase();
    if (!query || seen.has(key)) continue;
    seen.add(key);
    result.push(query);
    if (result.length >= Math.max(1, Number(limit) || 8)) break;
  }
  return result;
}

/* A few editorial channels are correctly strict but have Archive queries that
   are too specific for the index to return anything. Broaden only the search
   shape—not the approved vocabulary—so the final theme/deny gates still make
   the genre decision. This is a rescue lane for sparse shelves, never a blind
   cross-genre fallback. */
function iaFallbackQueries(themeTerms, denyTerms, requiredTitleTerms, mediaTypes) {
  const clean = (value) => String(value || "").replace(/[()"\\]/g, " ").replace(/\s+/g, " ").trim();
  const terms = themeTerms.map(clean).filter(Boolean).slice(0, 18).map((term) => '"' + term + '"').join(" OR ");
  if (!terms) return [];
  const denied = denyTerms.map(clean).filter(Boolean).slice(0, 24).map((term) => '"' + term + '"').join(" OR ");
  const type = mediaTypes.includes("audio") && !mediaTypes.includes("movies") ? "audio" : "movies";
  const titles = requiredTitleTerms.map(clean).filter(Boolean).map(term => '"' + term + '"').join(" OR ");
  const suffix = (denied ? " AND NOT subject:(" + denied + ") AND NOT title:(" + denied + ")" : "") + (titles ? " AND title:(" + titles + ")" : "");
  return [
    "mediatype:" + type + " AND (title:(" + terms + ") OR subject:(" + terms + "))" + suffix,
    "mediatype:" + type + " AND subject:(" + terms + ")" + suffix,
  ];
}

/* A stronger editorial lane can require more than a single incidental subject
   tag. Keep the value bounded because this endpoint is public; a client can
   tighten its own shelf, but cannot turn a queue request into unbounded work. */
function safeThemeMinScore(value) {
  const score = Number(value);
  return Number.isInteger(score) && score >= 1 && score <= 12 ? score : 1;
}

/* Diversity is an editorial preference, never a content fallback. These
   small, bounded caps help a five-show shelf span a channel's own approved
   lanes without letting a sparse channel broaden beyond its genre contract. */
function safeDiversity(value) {
  const raw = value && typeof value === "object" ? value : {};
  const cap = (key, fallback) => Math.max(1, Math.min(5, Math.round(Number(raw[key]) || fallback)));
  return {
    maxPerEra: cap("maxPerEra", 1),
    maxPerLane: cap("maxPerLane", 1),
    maxPerCreator: cap("maxPerCreator", 1),
    maxPerCollection: cap("maxPerCollection", 2),
    maxPerFamily: cap("maxPerFamily", 1),
  };
}

function themeText(value) {
  return " " + String(Array.isArray(value) ? value.join(" ") : value || "")
    .normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
}

function matchesTheme(doc, themeTerms, minScore = 1, requiredTitleTerms = []) {
  const title = String(doc && doc.title || "").toLowerCase();
  const subject = themeText(String(doc && doc.subject || ""));
  const titleMatches = requiredTitleTerms.some(term => title.includes(String(term).toLowerCase()));
  const identifier = String(doc && doc.identifier || "");
  const sourceIdentifier = String(doc && doc.sourceIdentifier || "");
  const isExpandedEpisode = identifier.includes("::") || (sourceIdentifier && sourceIdentifier !== identifier);
  const subjectMatches = themeTerms.some(term => {
    const needle = themeText(term);
    return needle && subject.includes(needle);
  });
  /* The client has always enforced require.title_any. Enforce the same gate
     in the relay so a subject-tagged lecture, news item, or collection record
     cannot occupy a verified slot merely because it shares one broad genre
     word. Expanded episode files retain their own title/subject vocabulary. */
  /* An expanded file inherits the approved parent collection's editorial
     context. Its filename may be only an episode number or an opaque tape
     name, so requiring the holiday/cartoon title token on every child would
     collapse a deep series back to the first matching file. Keep the gate
     strict for standalone records and allow only explicitly expanded children
     through to the normal theme/deny/runtime checks. */
  if (requiredTitleTerms.length && !titleMatches && !isExpandedEpisode) return false;
  if (!themeTerms.length) return true;
  return themeScore(doc, themeTerms) >= minScore;
}

function themeScore(doc, themeTerms) {
  if (!themeTerms.length) return 0;
  const title = themeText(String(doc && doc.title || ""));
  const subject = themeText(String(doc && doc.subject || ""));
  return themeTerms.reduce((score, term) => {
    const needle = themeText(term);
    return score + (title.includes(needle) ? 4 : subject.includes(needle) ? 2 : 0);
  }, 0);
}

function matchesDeny(doc, denyTerms) {
  if (!denyTerms.length) return false;
  const haystack = themeText(String(doc && doc.title || "") + " " + String(doc && doc.subject || ""));
  return denyTerms.some((term) => haystack.includes(themeText(term)));
}

function queueTitleKey(doc) {
  return String(doc && doc.title || "")
    .toLowerCase()
    .replace(/\(\d{4}\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function stableKey(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function cachedArchiveJson(cacheKey, ttlSeconds, load, ctx) {
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();
  const payload = await load();
  const response = cacheableJson(payload, ttlSeconds, { "X-Afterglow-Cache": "miss" });
  const write = cache.put(cacheKey, response.clone()).catch((error) => {
    console.warn(JSON.stringify({ event: "archive-cache-write-failed", message: String(error && error.message || error) }));
  });
  if (ctx) ctx.waitUntil(write);
  else await write;
  return payload;
}

/* Live ADS-B edge relay -----------------------------------------------------
   Browser requests to the community ADS-B providers are commonly rejected by
   CORS even though the same public feed works server-side. Keep this endpoint
   deliberately narrow: latitude, longitude and radius only; no arbitrary URL
   proxying. A ten-second edge cache is fresh enough for a television radar
   while allowing many viewers in one area to share the same upstream sample. */
async function timedFetch(url, init = {}, timeoutMs = 4200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function timedJsonFetch(url, timeoutMs = 4200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json", "User-Agent": ADSB_USER_AGENT },
    });
    if (!response.ok) {
      const retryAfter = response.headers.get("Retry-After");
      throw new Error("upstream " + response.status + (retryAfter ? " retry " + retryAfter : ""));
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function cameraSlot(raw, count) {
  if (!/^\d{1,3}$/.test(String(raw || ""))) return null;
  const slot = Number(raw);
  return Number.isInteger(slot) && slot >= 0 && slot < count ? slot : null;
}

function cachedCameraResponse(cached) {
  const headers = new Headers(cached.headers);
  Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value));
  headers.set("X-Afterglow-Cache", "hit");
  return new Response(cached.body, { status: cached.status, headers });
}

function base64Bytes(value) {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

/* Texas Highway Cams -------------------------------------------------------
   TxDOT exposes current camera snapshots as JSON/base64 but does not send CORS
   headers. This route deliberately serves only the fixed Texas shelf above;
   it cannot be used as a generic image proxy. */
async function getTexasHighwayImage(url, ctx) {
  const slot = cameraSlot(url.searchParams.get("cam"), TEXAS_HIGHWAY_CAMS.length);
  if (slot == null) return json({ error: "invalid Texas camera slot" }, 400);
  const camera = TEXAS_HIGHWAY_CAMS[slot];
  const cacheKey = new Request(url.origin + TEXAS_HIGHWAY_IMAGE_PATH + "/cache/v1/" + slot);
  const cache = caches.default, cached = await cache.match(cacheKey);
  if (cached) return cachedCameraResponse(cached);
  try {
    const upstreamUrl = new URL(TXDOT_CCTV_URL);
    upstreamUrl.searchParams.set("districtCode", camera[0]);
    upstreamUrl.searchParams.set("icdId", camera[1]);
    const payload = await timedJsonFetch(upstreamUrl.toString(), 7200);
    if (!payload || typeof payload.snippet !== "string" || payload.snippet.length < 500) throw new Error("TxDOT snapshot unavailable");
    const response = new Response(base64Bytes(payload.snippet), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=" + TEXAS_HIGHWAY_TTL_SECONDS + ", stale-while-revalidate=60",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "X-Content-Type-Options": "nosniff",
        "X-Afterglow-Source": "txdot-live-camera",
        "X-Afterglow-Cache": "miss",
        ...corsHeaders(),
      },
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()).catch((error) => console.warn(JSON.stringify({ event: "txdot-camera-cache-write-failed", slot, message: String(error && error.message || error) }))));
    return response;
  } catch (error) {
    console.warn(JSON.stringify({ event: "txdot-camera-unavailable", slot, message: String(error && error.message || error) }));
    return json({ error: "Texas camera temporarily unavailable" }, 502);
  }
}

function worldCameraCandidates(items) {
  return (Array.isArray(items) ? items : []).filter((item) => item
    && Number(item.is_free) === 1
    && item.state === "live"
    && item.view && item.view.url_type === "image"
    && typeof item.view.url === "string" && item.view.url.startsWith("https://")
    && (!item.redistribution || item.redistribution.frame_reuse === "fetch-from-source" || item.redistribution.preview_embed === true)
  ).sort((a, b) => (Number(b.reputation_score) || 0) - (Number(a.reputation_score) || 0));
}

/* International Live Cams --------------------------------------------------
   OpenEye provides an anonymous, attributed catalog of public cameras. We use
   the catalog only to discover free image sources near fixed world cities,
   validate the image response, and cache the last successful frame. */
async function getWorldCamImage(url, ctx) {
  const slot = cameraSlot(url.searchParams.get("cam"), WORLD_CAM_CITIES.length);
  if (slot == null) return json({ error: "invalid world camera slot" }, 400);
  const city = WORLD_CAM_CITIES[slot];
  const cacheKey = new Request(url.origin + WORLD_CAM_IMAGE_PATH + "/cache/v1/" + slot);
  const cache = caches.default, cached = await cache.match(cacheKey);
  if (cached) return cachedCameraResponse(cached);
  try {
    const catalogUrl = new URL(OPEN_EYE_CATALOG_URL);
    catalogUrl.searchParams.set("near", city[1] + "," + city[2]);
    catalogUrl.searchParams.set("radius_km", "80");
    const catalog = await timedJsonFetch(catalogUrl.toString(), 7200);
    const candidates = worldCameraCandidates(catalog && catalog.items).slice(0, 5);
    let upstream = null, selected = null;
    for (const candidate of candidates) {
      try {
        const attempt = await timedFetch(candidate.view.url, {
          headers: { "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8", "User-Agent": ADSB_USER_AGENT },
          redirect: "follow",
        }, 7200);
        const contentType = String(attempt.headers.get("Content-Type") || "").toLowerCase();
        if (attempt.ok && contentType.startsWith("image/")) { upstream = attempt; selected = candidate; break; }
      } catch { /* try the next approved public camera */ }
    }
    if (!upstream || !selected) throw new Error("no usable public camera frame");
    const contentType = String(upstream.headers.get("Content-Type") || "image/jpeg").split(";")[0];
    const response = new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=" + WORLD_CAM_TTL_SECONDS + ", stale-while-revalidate=600",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "X-Content-Type-Options": "nosniff",
        "X-Afterglow-Source": "openeye-world-camera",
        "X-Afterglow-Cache": "miss",
        ...corsHeaders(),
      },
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()).catch((error) => console.warn(JSON.stringify({ event: "world-camera-cache-write-failed", slot, message: String(error && error.message || error) }))));
    return response;
  } catch (error) {
    console.warn(JSON.stringify({ event: "world-camera-unavailable", city: city[0], message: String(error && error.message || error) }));
    return json({ error: "international camera temporarily unavailable" }, 502);
  }
}

async function timedTextFetch(url, timeoutMs = 6200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "text/html,text/plain,application/xml;q=0.8,*/*;q=0.2", "User-Agent": ADSB_USER_AGENT },
    });
    if (!response.ok) throw new Error("upstream " + response.status);
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeOpenSky(states) {
  return (states || []).map((state) => {
    if (!Array.isArray(state) || state[8] || state[6] == null || state[5] == null) return null;
    return {
      hex: String(state[0] || ""),
      flight: String(state[1] || state[0] || "").trim(),
      lon: state[5],
      lat: state[6],
      alt_baro: state[7] == null ? null : Math.round(Number(state[7]) * 3.28084),
      gs: state[9] == null ? null : Number(state[9]) * 1.94384,
      track: state[10],
      baro_rate: state[11] == null ? null : Math.round(Number(state[11]) * 196.85),
      t: "",
    };
  }).filter(Boolean);
}

async function getAirSnapshot(url, ctx) {
  const lat = Number(url.searchParams.get("lat")), lon = Number(url.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return json({ error: "invalid air-quality coordinates" }, 400);
  }
  const latKey = (Math.round(lat * 10) / 10).toFixed(1), lonKey = (Math.round(lon * 10) / 10).toFixed(1);
  const cacheKey = new Request(url.origin + AIR_PATH + "/cache/v1/" + latKey + "/" + lonKey);
  const cache = caches.default, cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value));
    headers.set("X-Afterglow-Cache", "hit");
    return new Response(cached.body, { status: cached.status, headers });
  }
  try {
    const upstreamUrl = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" + encodeURIComponent(latKey) + "&longitude=" + encodeURIComponent(lonKey) + "&current=us_aqi,pm2_5,pm10,ozone,ragweed_pollen,grass_pollen,birch_pollen";
    const upstream = await timedJsonFetch(upstreamUrl, 7000);
    if (!upstream || !upstream.current || upstream.current.us_aqi == null) throw new Error("air-quality response incomplete");
    const response = json({ source: "open-meteo-air-quality", fetchedAt: new Date().toISOString(), current: upstream.current }, 200, {
      "Cache-Control": "public, max-age=" + AIR_TTL_SECONDS + ", stale-while-revalidate=3600",
      "X-Afterglow-Source": "air-quality-edge",
      "X-Afterglow-Cache": "miss",
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()).catch((error) => {
      console.warn(JSON.stringify({ event: "air-cache-write-failed", message: String(error && error.message || error) }));
    }));
    return response;
  } catch {
    return json({ error: "air-quality provider unavailable" }, 502);
  }
}

/* Local NEXRAD loop relay ---------------------------------------------------
   The browser used to load radar.weather.gov GIFs directly, making a brief
   origin/CORS/network problem replace the television picture with an empty
   panel. This endpoint only permits known NEXRAD station identifiers and
   streams the official animated loop through the edge cache. */
async function getRadarLoop(url) {
  const station = String(url.searchParams.get("station") || "").trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(station)) return json({ error: "invalid radar station" }, 400);
  const source = "https://radar.weather.gov/ridge/standard/" + station + "_loop.gif";
  try {
    const upstream = await timedFetch(source, {
      headers: { "Accept": "image/gif,image/*;q=0.8,*/*;q=0.2", "User-Agent": ADSB_USER_AGENT },
      cf: { cacheEverything: true, cacheTtl: RADAR_TTL_SECONDS },
    }, 8500);
    const contentType = String(upstream.headers.get("Content-Type") || "").toLowerCase();
    if (!upstream.ok || !contentType.startsWith("image/")) throw new Error("radar loop unavailable");
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=" + RADAR_TTL_SECONDS + ", stale-while-revalidate=600",
        "X-Afterglow-Source": "nws-nexrad-edge",
        ...corsHeaders(),
      },
    });
  } catch (error) {
    console.warn(JSON.stringify({ event: "radar-loop-unavailable", station, message: String(error && error.message || error) }));
    return json({ error: "radar loop temporarily unavailable" }, 502);
  }
}

async function getAdsbSnapshot(url, ctx) {
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const radius = Math.max(1, Math.min(250, Math.round(Number(url.searchParams.get("radius")) || 45)));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return json({ error: "invalid ADS-B coordinates" }, 400);
  }
  const latKey = lat.toFixed(2), lonKey = lon.toFixed(2);
  const cacheKey = new Request(url.origin + ADSB_PATH + "/cache/" + latKey + "/" + lonKey + "/" + radius);
  const cache = caches.default, cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value));
    headers.set("X-Afterglow-Cache", "hit");
    return new Response(cached.body, { status: cached.status, headers });
  }

  let source = "adsb.lol", aircraft = null;
  const attempts = [];
  const recordFailure = (name, error) => {
    const message = String(error && (error.message || error.name) || error || "unknown").replace(/[^a-z0-9 .:_-]/gi, "").slice(0, 140);
    attempts.push(name + ":" + message);
  };
  const primaryUrl = "https://api.adsb.lol/v2/point/" + lat.toFixed(3) + "/" + lon.toFixed(3) + "/" + radius;
  try {
    const data = await timedJsonFetch(primaryUrl);
    if (data && Array.isArray(data.ac)) aircraft = data.ac;
    else throw new Error("ADS-B payload missing aircraft array");
  } catch (primaryError) {
    recordFailure("adsb.lol", primaryError);
    if (/429/.test(String(primaryError && primaryError.message || primaryError))) {
      await new Promise((resolve) => setTimeout(resolve, 1100));
      try {
        const retry = await timedJsonFetch(primaryUrl);
        if (retry && Array.isArray(retry.ac)) aircraft = retry.ac;
        else throw new Error("ADS-B retry payload missing aircraft array");
      } catch (retryError) {
        recordFailure("adsb.lol retry", retryError);
      }
    }
    const adsbFiUrl = "https://opendata.adsb.fi/api/v3/lat/" + lat.toFixed(3) + "/lon/" + lon.toFixed(3) + "/dist/" + radius;
    const mirrors = [
      { name: "adsb.fi relay", url: "https://api.cors.syrins.tech/?url=" + encodeURIComponent(adsbFiUrl) },
      { name: "adsb.one", url: "https://api.adsb.one/v2/point/" + lat.toFixed(3) + "/" + lon.toFixed(3) + "/" + radius },
      { name: "adsb.fi", url: adsbFiUrl },
    ];
    for (const mirror of mirrors) {
      if (aircraft) break;
      try {
        const data = await timedJsonFetch(mirror.url);
        const rows = data && (Array.isArray(data.ac) ? data.ac : data.aircraft);
        if (!Array.isArray(rows)) throw new Error("mirror payload missing aircraft array");
        source = mirror.name;
        aircraft = rows;
        break;
      } catch (mirrorError) {
        recordFailure(mirror.name, mirrorError);
      }
    }
  }
  if (!aircraft) {
    source = "opensky";
    try {
      const nauticalMilesPerDegree = 60;
      const latDelta = radius / nauticalMilesPerDegree;
      const lonDelta = Math.min(20, latDelta / Math.max(0.18, Math.cos(lat * Math.PI / 180)));
      const openSkyUrl = "https://opensky-network.org/api/states/all?lamin=" + Math.max(-90, lat - latDelta).toFixed(3) +
        "&lomin=" + Math.max(-180, lon - lonDelta).toFixed(3) + "&lamax=" + Math.min(90, lat + latDelta).toFixed(3) +
        "&lomax=" + Math.min(180, lon + lonDelta).toFixed(3);
      const data = await timedJsonFetch(openSkyUrl, 5200);
      if (data && Array.isArray(data.states)) aircraft = normalizeOpenSky(data.states);
      else throw new Error("OpenSky payload missing states array");
    } catch (openSkyError) {
      recordFailure("opensky", openSkyError);
      console.warn(JSON.stringify({ event: "adsb-providers-unavailable", attempts }));
      return json({ error: "ADS-B providers unavailable", attempts }, 502);
    }
  }

  const response = json({ source, fetchedAt: new Date().toISOString(), ac: aircraft || [] }, 200, {
    "Cache-Control": "public, max-age=" + ADSB_TTL_SECONDS + ", stale-while-revalidate=20",
    "X-Afterglow-Source": source,
    "X-Afterglow-Cache": "miss",
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()).catch((error) => {
    console.warn(JSON.stringify({ event: "adsb-cache-write-failed", message: String(error && error.message || error) }));
  }));
  return response;
}

/* Live space operations desk ------------------------------------------------
   Launch Library's anonymous tier is deliberately modest (15 requests/hour),
   while the JPL endpoints do not send browser CORS headers consistently. One
   fixed, fifteen-minute edge snapshot keeps those sources off the tune path,
   shares a single upstream request among viewers, and prevents this public
   endpoint from becoming an arbitrary proxy. Every provider is normalized to
   the small subset CH957 actually renders. */
function rowObject(payload, row) {
  const out = {};
  (payload && payload.fields || []).forEach((field, index) => { out[field] = row && row[index]; });
  return out;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value, max = 320) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function safeImageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.hostname === "thespacedevs-dev.nyc3.digitaloceanspaces.com") {
      url.hostname = "thespacedevs-prod.nyc3.digitaloceanspaces.com";
    }
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeSpaceLaunch(launch) {
  const pad = launch && launch.pad || {}, location = pad.location || {};
  const provider = launch && launch.launch_service_provider || {}, mission = launch && launch.mission || {};
  const image = launch && launch.image || mission.image || pad.image || {};
  return {
    id: cleanText(launch && launch.id, 80),
    name: cleanText(launch && launch.name, 180),
    net: cleanText(launch && launch.net, 40),
    status: cleanText(launch && launch.status && (launch.status.abbrev || launch.status.name), 40),
    statusDescription: cleanText(launch && launch.status && launch.status.description, 220),
    provider: cleanText(provider.name || provider.abbrev, 100),
    providerAbbrev: cleanText(provider.abbrev, 20),
    pad: cleanText(pad.name, 80),
    location: cleanText(location.name || pad.location && pad.location.name, 140),
    country: cleanText(location.country && location.country.name || pad.country && pad.country.name, 60),
    lat: finiteNumber(pad.latitude != null ? pad.latitude : location.latitude),
    lon: finiteNumber(pad.longitude != null ? pad.longitude : location.longitude),
    mission: cleanText(mission.name, 120),
    missionType: cleanText(mission.type, 60),
    description: cleanText(mission.description, 420),
    orbit: cleanText(mission.orbit && (mission.orbit.name || mission.orbit.abbrev), 60),
    image: safeImageUrl(image.image_url || image.thumbnail_url),
    thumbnail: safeImageUrl(image.thumbnail_url || image.image_url),
    credit: cleanText(image.credit, 80),
    webcastLive: Boolean(launch && launch.webcast_live),
    url: /^https:\/\/ll\.thespacedevs\.com\//.test(String(launch && launch.url || "")) ? launch.url : "",
  };
}

function normalizeCloseApproach(payload, row) {
  const item = rowObject(payload, row), au = finiteNumber(item.dist), h = finiteNumber(item.h);
  const diameter = finiteNumber(item.diameter);
  return {
    id: cleanText(item.des, 60),
    name: cleanText(item.fullname || item.des, 120).replace(/^\s+/, ""),
    date: cleanText(item.cd, 40),
    jd: finiteNumber(item.jd),
    distanceAu: au,
    lunarDistance: au == null ? null : au * 389.1724,
    distanceMiles: au == null ? null : au * 92955807.3,
    velocityKps: finiteNumber(item.v_rel),
    magnitudeH: h,
    diameterKm: diameter,
    estimatedDiameterKm: diameter == null && h != null ? 1329 / Math.sqrt(0.14) * Math.pow(10, -h / 5) : null,
    uncertainty: cleanText(item.t_sigma_f, 24),
  };
}

function normalizeFireball(payload, row) {
  const item = rowObject(payload, row);
  let lat = finiteNumber(item.lat), lon = finiteNumber(item.lon);
  if (lat != null && String(item["lat-dir"] || "").toUpperCase() === "S") lat *= -1;
  if (lon != null && String(item["lon-dir"] || "").toUpperCase() === "W") lon *= -1;
  return {
    date: cleanText(item.date, 40),
    energy: finiteNumber(item.energy),
    impactKt: finiteNumber(item["impact-e"]),
    lat,
    lon,
    altitudeKm: finiteNumber(item.alt),
    velocityKps: finiteNumber(item.vel),
  };
}

function normalizeNasaImage(item) {
  const data = item && item.data && item.data[0] || {}, links = item && item.links || [];
  const image = links.find((link) => link && link.render === "image" && /~medium\./i.test(link.href || "")) ||
    links.find((link) => link && link.render === "image" && /~large\./i.test(link.href || "")) ||
    links.find((link) => link && link.render === "image");
  const thumb = links.find((link) => link && link.render === "image" && (link.rel === "preview" || /~thumb\./i.test(link.href || ""))) || image;
  return {
    id: cleanText(data.nasa_id, 80),
    title: cleanText(data.title, 180),
    description: cleanText(data.description_508 || data.description, 420),
    center: cleanText(data.center, 40),
    date: cleanText(data.date_created, 40),
    credit: cleanText(data.secondary_creator, 100),
    image: safeImageUrl(image && image.href),
    thumbnail: safeImageUrl(thumb && thumb.href),
  };
}

async function fetchUpcomingLaunches() {
  const path = "/2.3.0/launches/upcoming/?limit=10&ordering=net&hide_recent_previous=true";
  try {
    return { payload: await timedJsonFetch("https://ll.thespacedevs.com" + path, 7600), source: "launch-library-live" };
  } catch (error) {
    /* The anonymous production pool can answer 429 even when this Worker's
       fifteen-minute cache is behaving, because the quota is shared upstream.
       The provider explicitly offers lldev for unthrottled development use;
       it is slightly stale but schema-compatible and vastly better than an
       empty launch board. The next edge-cache miss retries production first. */
    const payload = await timedJsonFetch("https://lldev.thespacedevs.com" + path, 7600);
    return { payload, source: "launch-library-mirror" };
  }
}

async function getSpaceSnapshot(url, ctx) {
  const cacheKey = new Request(url.origin + SPACE_PATH + "/cache/v3");
  const cache = caches.default, cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value));
    headers.set("X-Afterglow-Cache", "hit");
    return new Response(cached.body, { status: cached.status, headers });
  }

  const year = new Date().getUTCFullYear();
  const sources = await Promise.allSettled([
    fetchUpcomingLaunches(),
    timedJsonFetch("https://ssd-api.jpl.nasa.gov/cad.api?date-min=now&date-max=%2B30&dist-max=20LD&diameter=true&fullname=true&limit=24&sort=date", 6200),
    timedJsonFetch("https://ssd-api.jpl.nasa.gov/fireball.api?limit=20&req-loc=true", 6200),
    timedJsonFetch("https://images-api.nasa.gov/search?q=deep%20space%20mission&media_type=image&page_size=12&year_start=" + (year - 1), 7600),
  ]);
  const failures = [], value = (index, name) => {
    if (sources[index].status === "fulfilled") return sources[index].value;
    failures.push(name);
    return null;
  };
  const launchResult = value(0, "launches"), launchData = launchResult && launchResult.payload, cadData = value(1, "approaches");
  const fireballData = value(2, "fireballs"), nasaData = value(3, "imagery");
  const launches = (launchData && launchData.results || []).map(normalizeSpaceLaunch).filter((item) => item.name && item.net);
  const approaches = (cadData && cadData.data || []).map((row) => normalizeCloseApproach(cadData, row)).filter((item) => item.name && item.distanceAu != null);
  const fireballs = (fireballData && fireballData.data || []).map((row) => normalizeFireball(fireballData, row)).filter((item) => item.date);
  const imagery = (nasaData && nasaData.collection && nasaData.collection.items || []).map(normalizeNasaImage).filter((item) => item.title && item.image);
  if (!launches.length && !approaches.length && !fireballs.length && !imagery.length) {
    return json({ error: "space data providers unavailable", failures }, 502);
  }
  const payload = { source: "Afterglow Space Desk", fetchedAt: new Date().toISOString(), failures, launchSource: launchResult && launchResult.source || "unavailable", launches, approaches, fireballs, imagery };
  const response = json(payload, 200, {
    "Cache-Control": "public, max-age=" + SPACE_TTL_SECONDS + ", stale-while-revalidate=3600",
    "X-Afterglow-Source": "space-edge-desk",
    "X-Afterglow-Cache": "miss",
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()).catch((error) => {
    console.warn(JSON.stringify({ event: "space-cache-write-failed", message: String(error && error.message || error) }));
  }));
  return response;
}

/* River and lake edge desk --------------------------------------------------
   NWPS publishes a fast nearby-gauge index, but each gauge's thresholds,
   historic crests and 30-day stage/flow series live behind separate calls.
   Hydrate a bounded set of useful gauges once at the edge, downsample to the
   last 72 hours, and return a small television-ready payload. */
function waterDistanceMiles(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180, dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function validWaterValue(value) {
  if (value == null || value === "") return null;
  const number = finiteNumber(value);
  return number != null && number > -900 ? number : null;
}

function waterCategoryRank(category) {
  return ({ major: 5, moderate: 4, minor: 3, action: 2, no_flooding: 1 })[String(category || "").toLowerCase()] || 0;
}

function normalizeWaterGauge(gauge, lat, lon) {
  const observed = gauge && gauge.status && gauge.status.observed || {};
  const forecast = gauge && gauge.status && gauge.status.forecast || {};
  const gaugeLat = finiteNumber(gauge && gauge.latitude), gaugeLon = finiteNumber(gauge && gauge.longitude);
  const secondary = validWaterValue(observed.secondary), secondaryUnit = cleanText(observed.secondaryUnit, 12);
  return {
    lid: cleanText(gauge && gauge.lid, 12),
    name: cleanText(gauge && gauge.name, 160).replace(/^North Texas Lakes at /i, ""),
    state: cleanText(gauge && gauge.state && (gauge.state.abbreviation || gauge.state.name), 30),
    rfc: cleanText(gauge && gauge.rfc && gauge.rfc.abbreviation, 12),
    wfo: cleanText(gauge && gauge.wfo && gauge.wfo.abbreviation, 12),
    lat: gaugeLat,
    lon: gaugeLon,
    distanceMiles: gaugeLat == null || gaugeLon == null ? null : waterDistanceMiles(lat, lon, gaugeLat, gaugeLon),
    isLake: /^HP/i.test(cleanText(gauge && gauge.pedts && gauge.pedts.observed, 12)) || /\b(lake|reservoir|pool)\b/i.test(gauge && gauge.name || ""),
    observed: {
      primary: validWaterValue(observed.primary),
      primaryUnit: cleanText(observed.primaryUnit || "ft", 12),
      secondary,
      secondaryUnit,
      flowCfs: secondary == null ? null : /kcfs/i.test(secondaryUnit) ? secondary * 1000 : /cfs/i.test(secondaryUnit) ? secondary : null,
      category: cleanText(observed.floodCategory, 30).toLowerCase(),
      validTime: cleanText(observed.validTime, 40),
    },
    forecast: {
      primary: validWaterValue(forecast.primary),
      primaryUnit: cleanText(forecast.primaryUnit, 12),
      category: cleanText(forecast.floodCategory, 30).toLowerCase(),
      validTime: /^0001-/.test(String(forecast.validTime || "")) ? "" : cleanText(forecast.validTime, 40),
    },
  };
}

function downsampleWaterSeries(series, hours, maxPoints) {
  const cutoff = Date.now() - hours * 3600000;
  let rows = (series || []).map((point) => ({
    time: cleanText(point && point.validTime, 40),
    at: Date.parse(point && point.validTime),
    primary: validWaterValue(point && point.primary),
    secondary: validWaterValue(point && point.secondary),
  })).filter((point) => point.primary != null && Number.isFinite(point.at) && point.at >= cutoff);
  if (!rows.length) {
    rows = (series || []).slice(-maxPoints).map((point) => ({
      time: cleanText(point && point.validTime, 40),
      at: Date.parse(point && point.validTime),
      primary: validWaterValue(point && point.primary),
      secondary: validWaterValue(point && point.secondary),
    })).filter((point) => point.primary != null && Number.isFinite(point.at));
  }
  if (rows.length <= maxPoints) return rows;
  const step = (rows.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, index) => rows[Math.round(index * step)]);
}

function normalizeFloodThresholds(detail) {
  const categories = detail && detail.flood && detail.flood.categories || {}, out = {};
  ["action", "minor", "moderate", "major"].forEach((name) => {
    const stage = validWaterValue(categories[name] && categories[name].stage);
    if (stage != null) out[name] = stage;
  });
  return out;
}

async function enrichWaterGauge(gauge) {
  const lid = gauge.lid;
  const [detailResult, seriesResult] = await Promise.allSettled([
    timedJsonFetch("https://api.water.noaa.gov/nwps/v1/gauges/" + encodeURIComponent(lid), 6800),
    timedJsonFetch("https://api.water.noaa.gov/nwps/v1/gauges/" + encodeURIComponent(lid) + "/stageflow", 7600),
  ]);
  const detail = detailResult.status === "fulfilled" ? detailResult.value : null;
  const stageflow = seriesResult.status === "fulfilled" ? seriesResult.value : null;
  const observed = downsampleWaterSeries(stageflow && stageflow.observed && stageflow.observed.data, 72, 96);
  const forecast = downsampleWaterSeries(stageflow && stageflow.forecast && stageflow.forecast.data, 240, 120);
  const last = observed[observed.length - 1], dayAgo = observed.reduce((best, point) => {
    const delta = Math.abs(point.at - (Date.now() - 86400000));
    return !best || delta < best.delta ? { point, delta } : best;
  }, null);
  const crests = detail && detail.flood && detail.flood.crests || {};
  return {
    ...gauge,
    usgsId: cleanText(detail && detail.usgsId, 24),
    county: cleanText(detail && detail.county, 80),
    description: cleanText(detail && detail.description, 240),
    thresholds: normalizeFloodThresholds(detail),
    impacts: (detail && detail.flood && detail.flood.impacts || []).slice(0, 8).map((impact) => ({ stage: validWaterValue(impact.stage), statement: cleanText(impact.statement, 220) })),
    crests: (crests.recent || crests.historic || []).slice(0, 8).map((crest) => ({ time: cleanText(crest.occurredTime, 40), stage: validWaterValue(crest.stage), flow: validWaterValue(crest.flow) })),
    hydrograph: safeImageUrl(detail && detail.images && detail.images.hydrograph && detail.images.hydrograph.default),
    observedSeries: observed,
    forecastSeries: forecast,
    trend24h: last && dayAgo ? last.primary - dayAgo.point.primary : null,
    forecastPeak: forecast.reduce((peak, point) => peak == null || point.primary > peak ? point.primary : peak, null),
    seriesPrimaryName: cleanText(stageflow && stageflow.observed && stageflow.observed.primaryName, 30),
    seriesPrimaryUnit: cleanText(stageflow && stageflow.observed && stageflow.observed.primaryUnits, 12),
  };
}

async function getWaterSnapshot(url, ctx) {
  const lat = Number(url.searchParams.get("lat")), lon = Number(url.searchParams.get("lon"));
  const radius = Math.max(20, Math.min(120, Math.round(Number(url.searchParams.get("radius")) || 65)));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return json({ error: "invalid water coordinates" }, 400);
  }
  const latKey = (Math.round(lat * 10) / 10).toFixed(1), lonKey = (Math.round(lon * 10) / 10).toFixed(1);
  const radiusKey = Math.round(radius / 10) * 10;
  const cacheKey = new Request(url.origin + WATER_PATH + "/cache/v2/" + latKey + "/" + lonKey + "/" + radiusKey);
  const cache = caches.default, cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value));
    headers.set("X-Afterglow-Cache", "hit");
    return new Response(cached.body, { status: cached.status, headers });
  }
  const latDelta = radius / 69, lonDelta = Math.min(10, latDelta / Math.max(.2, Math.cos(lat * Math.PI / 180)));
  const upstream = new URL("https://api.water.noaa.gov/nwps/v1/gauges");
  upstream.searchParams.set("bbox.xmin", (lon - lonDelta).toFixed(4));
  upstream.searchParams.set("bbox.ymin", (lat - latDelta).toFixed(4));
  upstream.searchParams.set("bbox.xmax", (lon + lonDelta).toFixed(4));
  upstream.searchParams.set("bbox.ymax", (lat + latDelta).toFixed(4));
  upstream.searchParams.set("srid", "EPSG_4326");
  let list;
  try {
    list = await timedJsonFetch(upstream.toString(), 6800);
  } catch {
    return json({ error: "NWPS gauge index unavailable" }, 502);
  }
  const gauges = (list && list.gauges || []).map((gauge) => normalizeWaterGauge(gauge, lat, lon))
    .filter((gauge) => gauge.lid && gauge.observed.primary != null && gauge.distanceMiles != null && gauge.distanceMiles <= radius * 1.15)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
  const candidates = [], seen = new Set(), add = (gauge) => {
    if (gauge && !seen.has(gauge.lid) && candidates.length < 8) { seen.add(gauge.lid); candidates.push(gauge); }
  };
  gauges.slice(0, 6).forEach(add);
  gauges.slice().sort((a, b) => waterCategoryRank(b.forecast.category || b.observed.category) - waterCategoryRank(a.forecast.category || a.observed.category)).slice(0, 4).forEach(add);
  gauges.filter((gauge) => gauge.isLake).slice(0, 3).forEach(add);
  const enriched = await Promise.all(candidates.map(async (gauge) => {
    try { return await enrichWaterGauge(gauge); } catch { return gauge; }
  }));
  const byLid = new Map(enriched.map((gauge) => [gauge.lid, gauge]));
  const merged = gauges.slice(0, 40).map((gauge) => byLid.get(gauge.lid) || gauge);
  const payload = { source: "NOAA National Water Prediction Service", fetchedAt: new Date().toISOString(), center: { lat, lon, radiusMiles: radius }, gauges: merged };
  const response = json(payload, 200, {
    "Cache-Control": "public, max-age=" + WATER_TTL_SECONDS + ", stale-while-revalidate=900",
    "X-Afterglow-Source": "nwps-edge-desk",
    "X-Afterglow-Cache": "miss",
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()).catch((error) => {
    console.warn(JSON.stringify({ event: "water-cache-write-failed", message: String(error && error.message || error) }));
  }));
  return response;
}

/* Tropical operations edge desk -------------------------------------------
   NHC's active-storm JSON is excellent, but the forecast track, public text
   and current graphics are linked documents. Resolve and normalize those
   official products once at the edge so the television never guesses a cone
   URL or asks the browser to scrape cross-origin advisory pages. */
const NHC_BASE = "https://www.nhc.noaa.gov";
const NHC_OUTLOOKS = [
  { code: "AL", name: "ATLANTIC", text: NHC_BASE + "/text/MIATWOAT.shtml", image2d: NHC_BASE + "/xgtwo/two_atl_2d0.png", image7d: NHC_BASE + "/xgtwo/two_atl_7d0.png" },
  { code: "EP", name: "EASTERN PACIFIC", text: NHC_BASE + "/text/MIATWOEP.shtml", image2d: NHC_BASE + "/xgtwo/two_pac_2d0.png", image7d: NHC_BASE + "/xgtwo/two_pac_7d0.png" },
  { code: "CP", name: "CENTRAL PACIFIC", text: NHC_BASE + "/text/HFOTWOCP.shtml", image2d: NHC_BASE + "/xgtwo/two_cpac_2d0.png", image7d: NHC_BASE + "/xgtwo/two_cpac_7d0.png" },
];
const TROPICAL_SATELLITES = [
  { code: "ATL", name: "TROPICAL ATLANTIC", image: "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/taw/GEOCOLOR/900x540.jpg", source: "NOAA GOES-19 GEOCOLOR" },
  { code: "CAR", name: "CARIBBEAN", image: "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/car/GEOCOLOR/900x540.jpg", source: "NOAA GOES-19 GEOCOLOR" },
  { code: "MEX", name: "MEXICO / GULF", image: "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/mex/GEOCOLOR/900x540.jpg", source: "NOAA GOES-19 GEOCOLOR" },
  { code: "PAC", name: "TROPICAL PACIFIC", image: "https://cdn.star.nesdis.noaa.gov/GOES18/ABI/SECTOR/tpw/GEOCOLOR/900x540.jpg", source: "NOAA GOES-18 GEOCOLOR" },
];

function nhcPreText(html) {
  const source = String(html || ""), match = source.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  return String(match ? match[1] : source)
    .replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function nhcSection(text, start, end) {
  const source = String(text || ""), begin = source.search(start);
  if (begin < 0) return "";
  const tail = source.slice(begin), stop = end ? tail.search(end) : -1;
  return cleanText(stop > 0 ? tail.slice(0, stop) : tail, 1800);
}

function nhcCoordinate(number, hemisphere) {
  const value = finiteNumber(number);
  return value == null ? null : /[SW]/i.test(hemisphere) ? -Math.abs(value) : Math.abs(value);
}

function nhcForecastTime(token, baseValue) {
  const match = String(token || "").match(/(\d{2})\/(\d{2})(\d{2})Z/), base = new Date(baseValue || Date.now());
  if (!match || Number.isNaN(base.getTime())) return "";
  let value = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), Number(match[1]), Number(match[2]), Number(match[3])));
  if (value.getTime() < base.getTime() - 15 * 86400000) value = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, Number(match[1]), Number(match[2]), Number(match[3])));
  if (value.getTime() > base.getTime() + 20 * 86400000) value = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - 1, Number(match[1]), Number(match[2]), Number(match[3])));
  return value.toISOString();
}

function parseNhcForecast(text, lastUpdate) {
  const points = [], pattern = /(FORECAST|OUTLOOK) VALID\s+(\d{2}\/\d{4}Z)\s+(\d+(?:\.\d+)?)([NS])\s+(\d+(?:\.\d+)?)([EW])[\s\S]*?MAX WIND\s+(\d+)\s+KT(?:\.\.\.GUSTS\s+(\d+)\s+KT)?/gi;
  let match;
  while ((match = pattern.exec(String(text || ""))) && points.length < 10) {
    points.push({
      kind: match[1].toUpperCase(), validTime: nhcForecastTime(match[2], lastUpdate), label: match[2],
      lat: nhcCoordinate(match[3], match[4]), lon: nhcCoordinate(match[5], match[6]),
      windKt: finiteNumber(match[7]), gustKt: finiteNumber(match[8]),
    });
  }
  return points;
}

function nhcGraphicUrl(path) {
  try {
    const url = new URL(String(path || "").replace(/&amp;/g, "&"), NHC_BASE);
    return url.protocol === "https:" && url.hostname === "www.nhc.noaa.gov" ? url.toString() : "";
  } catch { return ""; }
}

function parseNhcGraphics(html) {
  const urls = Array.from(String(html || "").matchAll(/(?:src|href)=["']([^"']+(?:png|gif|jpe?g)[^"']*)["']/gi), (match) => nhcGraphicUrl(match[1])).filter(Boolean);
  const pick = (needle) => urls.find((url) => url.toLowerCase().includes(needle)) || "";
  return {
    cone: pick("_5day_cone_with_line_and_wind") || pick("_5day_cone_no_line_and_wind") || pick("_5day_cone_sm"), experimentalCone: pick("_5day_expcone_sm"),
    windProbabilities: pick("_wind_probs_34_f120_sm"), arrivalTime: pick("_earliest_reasonable_toa_no_wsp_34_sm"),
    windHistory: pick("_wind_history_sm"), currentWind: pick("_current_wind_sm"),
  };
}

function tropicalImageRelayUrl(origin, source) {
  return source ? origin + TROPICAL_IMAGE_PATH + "?src=" + encodeURIComponent(source) : "";
}

function relayedTropicalProducts(origin, storms, outlooks, satellites) {
  return {
    storms: storms.map((storm) => ({
      ...storm,
      graphics: Object.fromEntries(Object.entries(storm.graphics || {}).map(([name, source]) => [name, tropicalImageRelayUrl(origin, source)])),
    })),
    outlooks: outlooks.map((outlook) => ({
      ...outlook,
      image2d: tropicalImageRelayUrl(origin, outlook.image2d),
      image7d: tropicalImageRelayUrl(origin, outlook.image7d),
    })),
    satellites: satellites.map((satellite) => ({ ...satellite, image: tropicalImageRelayUrl(origin, satellite.image) })),
  };
}

function safeTropicalImageSource(url) {
  const raw = String(url.searchParams.get("src") || "");
  if (!raw || raw.length > 700) return null;
  try {
    const source = new URL(raw);
    if (source.protocol !== "https:" || source.username || source.password) return null;
    const path = source.pathname;
    const nhc = source.hostname === "www.nhc.noaa.gov" && /^\/(?:storm_graphics|xgtwo)\//.test(path) && /(?:\.png|\.gif|\.jpe?g)$/i.test(path);
    const goes = source.hostname === "cdn.star.nesdis.noaa.gov" && /^\/GOES(?:18|19)\/ABI\/SECTOR\/(?:taw|car|mex|tpw)\/GEOCOLOR\/900x540\.jpg$/i.test(path);
    if (!nhc && !goes) return null;
    source.hash = "";
    return source;
  } catch { return null; }
}

async function getTropicalImage(url, ctx) {
  const source = safeTropicalImageSource(url);
  if (!source) return json({ error: "unsupported tropical image" }, 400);
  const cacheKey = new Request(url.origin + TROPICAL_IMAGE_PATH + "?src=" + encodeURIComponent(source.toString()));
  const cache = caches.default, cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value));
    headers.set("X-Afterglow-Cache", "hit");
    return new Response(cached.body, { status: cached.status, headers });
  }
  let upstream;
  try {
    upstream = await timedFetch(source.toString(), {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: source.hostname === "www.nhc.noaa.gov" ? NHC_BASE + "/" : "https://www.star.nesdis.noaa.gov/",
        "User-Agent": ADSB_USER_AGENT,
      },
    }, 8500);
  } catch (error) {
    return json({ error: "tropical image upstream unavailable", detail: cleanText(error && error.message || error, 120) }, 502);
  }
  const contentType = String(upstream.headers.get("Content-Type") || "").toLowerCase();
  if (!upstream.ok || !contentType.startsWith("image/")) return json({ error: "tropical image upstream rejected", status: upstream.status }, 502);
  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=" + TROPICAL_IMAGE_TTL_SECONDS + ", stale-while-revalidate=900",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Afterglow-Source": source.hostname === "www.nhc.noaa.gov" ? "nhc-image-relay" : "goes-image-relay",
    "X-Afterglow-Cache": "miss",
    ...corsHeaders(),
  });
  for (const name of ["ETag", "Last-Modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  const response = new Response(upstream.body, { status: 200, headers });
  ctx.waitUntil(cache.put(cacheKey, response.clone()).catch((error) => console.warn(JSON.stringify({ event: "tropical-image-cache-write-failed", message: String(error && error.message || error) }))));
  return response;
}

function stormCategory(windKt, classification) {
  const wind = Number(windKt) || 0, cls = cleanText(classification, 12).toUpperCase();
  if (wind >= 137) return "CATEGORY 5";
  if (wind >= 113) return "CATEGORY 4";
  if (wind >= 96) return "CATEGORY 3";
  if (wind >= 83) return "CATEGORY 2";
  if (wind >= 64 || cls === "HU") return "CATEGORY 1";
  if (wind >= 34 || /TS|SS/.test(cls)) return "TROPICAL STORM";
  if (/PT|POST/.test(cls)) return "POST-TROPICAL";
  return "TROPICAL DEPRESSION";
}

function normalizeNhcOutlook(definition, html) {
  const text = nhcPreText(html), areas = [];
  text.split(/\n\s*\n/).forEach((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean), title = lines[0] || "";
    const chance48 = block.match(/48 hours\.\.\.[^\n.]*\.\.\.(?:near\s*)?(\d+)\s*percent/i);
    const chance7 = block.match(/7 days\.\.\.[^\n.]*\.\.\.(?:near\s*)?(\d+)\s*percent/i);
    if (!/:$/.test(title) || !chance48 || !chance7) return;
    areas.push({ name: cleanText(title.replace(/:$/, ""), 100), description: cleanText(block.split("*")[0].replace(title, ""), 420), chance48h: Number(chance48[1]), chance7d: Number(chance7[1]) });
  });
  const issue = text.match(/\b\d{1,4}\s+[AP]M\s+[A-Z]{2,4}\s+[^\n]+\s+\d{4}\b/i);
  return { ...definition, issued: cleanText(issue && issue[0], 80), quiet: /formation is not expected during the next 7 days/i.test(text), areas: areas.slice(0, 12), text: cleanText(text, 1800) };
}

async function enrichNhcStorm(storm) {
  const graphicsUrl = storm && storm.forecastGraphics && storm.forecastGraphics.url;
  const forecastUrl = storm && storm.forecastAdvisory && storm.forecastAdvisory.url;
  const publicUrl = storm && storm.publicAdvisory && storm.publicAdvisory.url;
  const discussionUrl = storm && storm.forecastDiscussion && storm.forecastDiscussion.url;
  const results = await Promise.allSettled([
    graphicsUrl ? timedTextFetch(graphicsUrl, 6800) : Promise.resolve(""),
    forecastUrl ? timedTextFetch(forecastUrl, 6800) : Promise.resolve(""),
    publicUrl ? timedTextFetch(publicUrl, 6800) : Promise.resolve(""),
    discussionUrl ? timedTextFetch(discussionUrl, 6800) : Promise.resolve(""),
  ]);
  const graphicsHtml = results[0].status === "fulfilled" ? results[0].value : "";
  const forecastText = nhcPreText(results[1].status === "fulfilled" ? results[1].value : "");
  const publicText = nhcPreText(results[2].status === "fulfilled" ? results[2].value : "");
  const discussionText = nhcPreText(results[3].status === "fulfilled" ? results[3].value : "");
  const windKt = finiteNumber(storm && storm.intensity), basinCode = cleanText(storm && storm.id, 20).slice(0, 2).toUpperCase();
  return {
    id: cleanText(storm && storm.id, 24).toUpperCase(), bin: cleanText(storm && storm.binNumber, 12).toUpperCase(),
    name: cleanText(storm && storm.name, 80), classification: cleanText(storm && storm.classification, 20).toUpperCase(), category: stormCategory(windKt, storm && storm.classification),
    basinCode, basin: ({ AL: "ATLANTIC", EP: "EASTERN PACIFIC", CP: "CENTRAL PACIFIC" })[basinCode] || basinCode,
    windKt, windMph: windKt == null ? null : Math.round(windKt * 1.15078), pressureMb: finiteNumber(storm && storm.pressure),
    lat: finiteNumber(storm && storm.latitudeNumeric), lon: finiteNumber(storm && storm.longitudeNumeric),
    movementDeg: finiteNumber(storm && storm.movementDir), movementKt: finiteNumber(storm && storm.movementSpeed),
    lastUpdate: cleanText(storm && storm.lastUpdate, 40), advisoryNumber: cleanText(storm && storm.publicAdvisory && storm.publicAdvisory.advNum, 16),
    publicAdvisoryUrl: cleanText(publicUrl, 300), discussionUrl: cleanText(discussionUrl, 300), graphicsUrl: cleanText(graphicsUrl, 300),
    graphics: parseNhcGraphics(graphicsHtml), forecast: parseNhcForecast(forecastText, storm && storm.lastUpdate),
    summary: nhcSection(publicText, /SUMMARY OF .*? INFORMATION/i, /WATCHES AND WARNINGS|DISCUSSION AND OUTLOOK/i) || cleanText(publicText, 1100),
    watchesWarnings: nhcSection(publicText, /WATCHES AND WARNINGS/i, /DISCUSSION AND OUTLOOK/i),
    discussion: cleanText(discussionText, 1800),
  };
}

async function getTropicalSnapshot(url, ctx) {
  const cacheKey = new Request(url.origin + TROPICAL_PATH + "/cache/" + TROPICAL_CACHE_VERSION);
  const cache = caches.default, cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value));headers.set("X-Afterglow-Cache", "hit");
    return new Response(cached.body, { status: cached.status, headers });
  }
  const results = await Promise.allSettled([timedJsonFetch(NHC_BASE + "/CurrentStorms.json", 6800), ...NHC_OUTLOOKS.map((outlook) => timedTextFetch(outlook.text, 6800))]);
  const failures = [], activePayload = results[0].status === "fulfilled" ? results[0].value : null;
  if (!activePayload) failures.push("active-storms");
  const rawStorms = activePayload && Array.isArray(activePayload.activeStorms) ? activePayload.activeStorms.slice(0, 8) : [];
  const storms = await Promise.all(rawStorms.map(async (storm) => { try { return await enrichNhcStorm(storm); } catch { return null; } }));
  const outlooks = NHC_OUTLOOKS.map((definition, index) => {
    const result = results[index + 1];if (result.status !== "fulfilled") { failures.push("outlook-" + definition.code.toLowerCase());return { ...definition, issued: "", quiet: false, areas: [], text: "" }; }
    return normalizeNhcOutlook(definition, result.value);
  });
  if (!activePayload && !outlooks.some((outlook) => outlook.text)) return json({ error: "NHC tropical products unavailable" }, 502);
  const relayed = relayedTropicalProducts(url.origin, storms.filter(Boolean), outlooks, TROPICAL_SATELLITES);
  const payload = { source: "NOAA National Hurricane Center", fetchedAt: new Date().toISOString(), ...relayed, failures };
  const response = json(payload, 200, { "Cache-Control": "public, max-age=" + TROPICAL_TTL_SECONDS + ", stale-while-revalidate=900", "X-Afterglow-Source": "nhc-operations-desk", "X-Afterglow-Cache": "miss" });
  ctx.waitUntil(cache.put(cacheKey, response.clone()).catch((error) => console.warn(JSON.stringify({ event: "tropical-cache-write-failed", message: String(error && error.message || error) }))));
  return response;
}

/* Gulf Marine --------------------------------------------------------------
   The client used to make four unrelated NOAA requests per tune.  The edge
   owns that fan-out now: one bounded marine snapshot is much faster to paint,
   never exposes NOAA's inconsistent endpoint behaviour to the UI, and gives
   the channel a shared five-minute last-good cache. */
function marineDistanceMiles(aLat, aLon, bLat, bLon) {
  const radians = Math.PI / 180, dLat = (bLat - aLat) * radians, dLon = (bLon - aLon) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * radians) * Math.cos(bLat * radians) * Math.sin(dLon / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function nearestMarineStation(list, lat, lon) {
  return list.map(([id, name, stationLat, stationLon]) => ({ id, name, lat: stationLat, lon: stationLon, distanceMiles: marineDistanceMiles(lat, lon, stationLat, stationLon) }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles)[0];
}
function marineValue(payload, field) {
  const row = payload && Array.isArray(payload.data) ? payload.data[0] : null;
  const value = row && Number(row[field]); return Number.isFinite(value) ? value : null;
}
function parseBuoyObservation(text) {
  const line = String(text || "").split(/\r?\n/).find((row) => row.trim() && !row.trim().startsWith("#"));
  if (!line) return null;
  const fields = line.trim().split(/\s+/), value = (index) => { const number = Number(fields[index]); return Number.isFinite(number) && fields[index] !== "MM" ? number : null; };
  return { observedAt: fields.slice(0, 5).join(" "), windDirection: value(5), windKnots: value(6), waveHeightMeters: value(8), dominantPeriodSeconds: value(9), pressureMb: value(12), airTempC: value(13), waterTempC: value(14) };
}
function marineDate(value) { return new Date(value).toISOString().slice(0, 10).replace(/-/g, ""); }
async function getMarineSnapshot(url, ctx) {
  const requestedLat = Number(url.searchParams.get("lat")), requestedLon = Number(url.searchParams.get("lon"));
  const lat = Number.isFinite(requestedLat) && requestedLat >= 18 && requestedLat <= 32 ? requestedLat : 31.55;
  const lon = Number.isFinite(requestedLon) && requestedLon >= -99 && requestedLon <= -80 ? requestedLon : -97.15;
  const cacheKey = new Request(url.origin + MARINE_PATH + "/cache/" + MARINE_CACHE_VERSION + "/" + lat.toFixed(1) + "/" + lon.toFixed(1));
  const cache = caches.default, cached = await cache.match(cacheKey);
  if (cached) { const headers = new Headers(cached.headers); Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value)); headers.set("X-Afterglow-Cache", "hit"); return new Response(cached.body, { status: cached.status, headers }); }
  const station = nearestMarineStation(GULF_TIDE_STATIONS, lat, lon), buoy = nearestMarineStation(GULF_BUOYS, lat, lon);
  const today = new Date(), tomorrow = new Date(Date.now() + 86400000), base = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?application=afterglow&time_zone=lst_ldt&units=english&format=json&station=" + encodeURIComponent(station.id);
  const predictionsUrl = base + "&product=predictions&datum=MLLW&interval=hilo&begin_date=" + marineDate(today) + "&end_date=" + marineDate(tomorrow);
  const waterUrl = base + "&product=water_temperature&date=latest";
  const windUrl = base + "&product=wind&date=latest";
  const forecastPointUrl = "https://api.weather.gov/points/" + station.lat.toFixed(3) + "," + station.lon.toFixed(3);
  const results = await Promise.allSettled([timedJsonFetch(predictionsUrl, 7000), timedJsonFetch(waterUrl, 6000), timedJsonFetch(windUrl, 6000), timedTextFetch("https://www.ndbc.noaa.gov/data/realtime2/" + encodeURIComponent(buoy.id) + ".txt", 7000), timedJsonFetch(forecastPointUrl, 6000)]);
  const failures = [];
  const predictionsPayload = results[0].status === "fulfilled" ? results[0].value : null;
  const predictions = (predictionsPayload && predictionsPayload.predictions || []).map((item) => ({ time: item.t, heightFeet: finiteNumber(item.v), type: item.type === "H" ? "HIGH" : "LOW" })).filter((item) => item.time && item.heightFeet != null);
  if (!predictions.length) failures.push("tides");
  const point = results[4].status === "fulfilled" ? results[4].value : null;
  let forecast = null;
  if (point && point.properties && point.properties.forecast) {
    try { const forecastPayload = await timedJsonFetch(point.properties.forecast, 6500); const period = forecastPayload && forecastPayload.properties && forecastPayload.properties.periods && forecastPayload.properties.periods[0]; if (period) forecast = { name: cleanText(period.name, 60), summary: cleanText(period.detailedForecast, 650) }; } catch { failures.push("coastal-forecast"); }
  } else failures.push("coastal-forecast");
  const windPayload = results[2].status === "fulfilled" ? results[2].value : null;
  const payload = {
    source: "NOAA CO-OPS + NDBC + NWS", fetchedAt: new Date().toISOString(), station, buoy,
    predictions: predictions.slice(0, 10), conditions: { waterTempF: marineValue(results[1].status === "fulfilled" ? results[1].value : null, "v"), windKnots: marineValue(windPayload, "s"), windDirection: marineValue(windPayload, "d") },
    buoyObservation: results[3].status === "fulfilled" ? parseBuoyObservation(results[3].value) : null, forecast, failures,
  };
  if (!predictions.length && !payload.buoyObservation) return json({ error: "marine data unavailable", failures }, 502);
  const response = json(payload, 200, { "Cache-Control": "public, max-age=" + MARINE_TTL_SECONDS + ", stale-while-revalidate=900", "X-Afterglow-Source": "noaa-marine-operations", "X-Afterglow-Cache": "miss" });
  ctx.waitUntil(cache.put(cacheKey, response.clone()).catch((error) => console.warn(JSON.stringify({ event: "marine-cache-write-failed", message: String(error && error.message || error) }))));
  return response;
}

/* Storm Center -------------------------------------------------------------
   SPC's product text has no browser CORS contract and the raw image can be
   late or temporarily unavailable.  Keep the two official products together,
   label the parsed risk, and relay the fixed image through the Worker so the
   desk is always one small, cacheable request from the client. */
const SPC_DAY1_TEXT_URL = "https://www.spc.noaa.gov/products/outlook/day1otlk.txt";
const SPC_DAY1_IMAGE_URL = "https://www.spc.noaa.gov/products/outlook/day1otlk.png";
function stormRisk(text) {
  const source = String(text || "").toUpperCase();
  if (/\bHIGH\s+RISK\b/.test(source)) return "HIGH";
  if (/\bMDT\b|\bMODERATE\s+RISK\b/.test(source)) return "MODERATE";
  if (/\bENH\b|\bENHANCED\s+RISK\b/.test(source)) return "ENHANCED";
  if (/\bSLGT\b|\bSLIGHT\s+RISK\b/.test(source)) return "SLIGHT";
  if (/\bMRGL\b|\bMARGINAL\s+RISK\b/.test(source)) return "MARGINAL";
  return "GENERAL";
}
async function getStormCenterSnapshot(url, ctx) {
  const cacheKey = new Request(url.origin + STORM_CENTER_PATH + "/cache/" + STORM_CENTER_CACHE_VERSION);
  const cache = caches.default, cached = await cache.match(cacheKey);
  if (cached) { const headers = new Headers(cached.headers); Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value)); headers.set("X-Afterglow-Cache", "hit"); return new Response(cached.body, { status: cached.status, headers }); }
  try {
    const text = await timedTextFetch(SPC_DAY1_TEXT_URL, 7000);
    const discussion = cleanText(text, 6000);
    if (!discussion) throw new Error("empty SPC discussion");
    const response = json({ source: "NOAA Storm Prediction Center", fetchedAt: new Date().toISOString(), risk: stormRisk(discussion), discussion, image: url.origin + STORM_CENTER_IMAGE_PATH }, 200, { "Cache-Control": "public, max-age=" + STORM_CENTER_TTL_SECONDS + ", stale-while-revalidate=900", "X-Afterglow-Source": "spc-day1-operations", "X-Afterglow-Cache": "miss" });
    ctx.waitUntil(cache.put(cacheKey, response.clone()).catch((error) => console.warn(JSON.stringify({ event: "storm-center-cache-write-failed", message: String(error && error.message || error) }))));
    return response;
  } catch { return json({ error: "SPC Day 1 outlook unavailable" }, 502); }
}
async function getStormCenterImage(url, ctx) {
  const cacheKey = new Request(url.origin + STORM_CENTER_IMAGE_PATH + "/cache/v1");
  const cache = caches.default, cached = await cache.match(cacheKey);
  if (cached) { const headers = new Headers(cached.headers); Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value)); headers.set("X-Afterglow-Cache", "hit"); return new Response(cached.body, { status: cached.status, headers }); }
  try {
    const upstream = await fetch(SPC_DAY1_IMAGE_URL, { headers: { "User-Agent": ADSB_USER_AGENT, "Accept": "image/png,image/*;q=0.8" }, cf: { cacheTtl: STORM_CENTER_IMAGE_TTL_SECONDS, cacheEverything: true } });
    const type = upstream.headers.get("content-type") || "";
    if (!upstream.ok || !/^image\//i.test(type)) throw new Error("SPC image unavailable");
    const response = new Response(upstream.body, { status: 200, headers: { "Content-Type": type, "Cache-Control": "public, max-age=" + STORM_CENTER_IMAGE_TTL_SECONDS, "X-Afterglow-Source": "spc-day1-image-relay", "X-Afterglow-Cache": "miss", "Cross-Origin-Resource-Policy": "cross-origin", ...corsHeaders() } });
    ctx.waitUntil(cache.put(cacheKey, response.clone()).catch((error) => console.warn(JSON.stringify({ event: "storm-center-image-cache-write-failed", message: String(error && error.message || error) }))));
    return response;
  } catch { return json({ error: "SPC outlook image unavailable" }, 502); }
}

/* Wildfire Watch ------------------------------------------------------------
   WFIGS is the authoritative interagency incident layer.  The browser used to
   query ArcGIS directly on every tune, which made the channel vulnerable to
   CORS, slow origin responses, and a blank national fallback map.  This route
   keeps the request bounded, normalizes the useful operational fields, adds
   local NWS fire-weather alerts, and shares a five-minute edge snapshot. */
function wildfireNumber(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function wildfireDistanceMiles(aLat, aLon, bLat, bLon) {
  const radians = Math.PI / 180, dLat = (bLat - aLat) * radians, dLon = (bLon - aLon) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * radians) * Math.cos(bLat * radians) * Math.sin(dLon / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function normalizeWildfireIncident(feature, center) {
  const attributes = feature && feature.attributes || {}, geometry = feature && feature.geometry || {};
  const lat = wildfireNumber(geometry.y), lon = wildfireNumber(geometry.x);
  if (lat == null || lon == null) return null;
  return {
    name: cleanText(attributes.IncidentName, 110) || "Unnamed incident",
    acres: wildfireNumber(attributes.IncidentSize), contained: wildfireNumber(attributes.PercentContained),
    category: cleanText(attributes.IncidentTypeCategory, 20), state: cleanText(attributes.POOState, 18).replace(/^US-/, ""),
    county: cleanText(attributes.POOCounty, 80), discovered: attributes.FireDiscoveryDateTime || null,
    behavior: cleanText(attributes.FireBehaviorGeneral, 80), cause: cleanText(attributes.FireCauseGeneral, 80),
    complexity: cleanText(attributes.FireMgmtComplexity, 80), costToDate: wildfireNumber(attributes.EstimatedCostToDate),
    management: cleanText(attributes.IncidentManagementOrganization, 100), lat, lon,
    distanceMiles: wildfireDistanceMiles(center.lat, center.lon, lat, lon),
  };
}
function normalizeWildfireAlerts(payload) {
  const allowed = new Set(["Red Flag Warning", "Fire Weather Watch", "Extreme Fire Danger", "Air Quality Alert", "Dense Smoke Advisory"]);
  return (payload && payload.features || []).map((feature) => {
    const properties = feature && feature.properties || {};
    if (!allowed.has(properties.event)) return null;
    return { event: cleanText(properties.event, 64), severity: cleanText(properties.severity, 20), urgency: cleanText(properties.urgency, 20),
      headline: cleanText(properties.headline || properties.description, 240), area: cleanText(properties.areaDesc, 160),
      effective: properties.effective || null, expires: properties.expires || null, id: cleanText(properties.id, 140) };
  }).filter(Boolean).slice(0, 12);
}
async function getWildfireSnapshot(url, ctx) {
  const lat = Number(url.searchParams.get("lat")), lon = Number(url.searchParams.get("lon"));
  const radius = Math.max(50, Math.min(500, Math.round(Number(url.searchParams.get("radius")) || 250)));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return json({ error: "invalid wildfire coordinates" }, 400);
  const latKey = (Math.round(lat * 10) / 10).toFixed(1), lonKey = (Math.round(lon * 10) / 10).toFixed(1), radiusKey = Math.round(radius / 25) * 25;
  const cacheKey = new Request(url.origin + WILDFIRE_PATH + "/cache/v1/" + latKey + "/" + lonKey + "/" + radiusKey);
  const cache = caches.default, cached = await cache.match(cacheKey);
  if (cached) { const headers = new Headers(cached.headers); Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value)); headers.set("X-Afterglow-Cache", "hit"); return new Response(cached.body, { status: cached.status, headers }); }
  const incidentUrl = new URL(WFIGS_INCIDENTS_URL); incidentUrl.search = new URLSearchParams({ f: "json", where: "1=1", outFields: WFIGS_FIELDS, returnGeometry: "true", outSR: "4326", resultRecordCount: "160", orderByFields: "IncidentSize DESC" }).toString();
  const alertsUrl = "https://api.weather.gov/alerts/active?point=" + lat.toFixed(3) + "," + lon.toFixed(3);
  const results = await Promise.allSettled([timedJsonFetch(incidentUrl.toString(), 7500), timedJsonFetch(alertsUrl, 6000)]);
  const failures = [], incidentPayload = results[0].status === "fulfilled" ? results[0].value : null;
  if (!incidentPayload || incidentPayload.error) failures.push("wfigs");
  const incidents = (incidentPayload && incidentPayload.features || []).map((feature) => normalizeWildfireIncident(feature, { lat, lon })).filter(Boolean)
    .sort((a, b) => (b.acres || 0) - (a.acres || 0) || a.distanceMiles - b.distanceMiles);
  if (!incidents.length && failures.includes("wfigs")) return json({ error: "wildfire incident data unavailable" }, 502);
  if (results[1].status !== "fulfilled") failures.push("nws-alerts");
  const nearby = incidents.filter((incident) => incident.distanceMiles <= radius).sort((a, b) => a.distanceMiles - b.distanceMiles).slice(0, 36);
  const payload = { source: "NIFC WFIGS + NWS", fetchedAt: new Date().toISOString(), center: { lat, lon, radiusMiles: radius }, incidents: incidents.slice(0, 100), nearby, national: incidents.slice(0, 30), alerts: normalizeWildfireAlerts(results[1].status === "fulfilled" ? results[1].value : null), failures };
  const response = json(payload, 200, { "Cache-Control": "public, max-age=" + WILDFIRE_TTL_SECONDS + ", stale-while-revalidate=900", "X-Afterglow-Source": "wfigs-nws-operations", "X-Afterglow-Cache": "miss" });
  ctx.waitUntil(cache.put(cacheKey, response.clone()).catch((error) => console.warn(JSON.stringify({ event: "wildfire-cache-write-failed", message: String(error && error.message || error) }))));
  return response;
}

/* Internet Archive will occasionally leave a TCP request open for a very long
   time. A television tune must never inherit that wait: abort the upstream
   request and let the caller use a cached or alternate lane instead. */
async function archiveFetch(input, init = {}, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function searchArchive(query, rows, page, sort, timeoutMs = 3200) {
  const upstreamUrl = new URL("https://archive.org/advancedsearch.php");
  upstreamUrl.searchParams.set("q", query);
  ["identifier", "title", "year", "subject", "runtime", "creator", "collection", "downloads", "mediatype"].forEach((field) => upstreamUrl.searchParams.append("fl[]", field));
  upstreamUrl.searchParams.append("sort[]", sort || "downloads desc");
  upstreamUrl.searchParams.set("rows", String(rows));
  upstreamUrl.searchParams.set("page", String(page));
  upstreamUrl.searchParams.set("output", "json");
  /* Archive's scrape endpoint does not honor advancedsearch's field grammar
     (for example `subject:boxing` becomes an empty result). Keep one precise
     backend here: a fast wrong answer is worse than an alternate lane. */
  let lastError = new Error("archive advanced search unavailable");
  /* The cold tune path deliberately passes the short fast-search budget. A
     second attempt would consume the entire television startup budget before
     the next approved rail can win. Background replenishment keeps the normal
     two-attempt retry for resilience once a playable item is already on air. */
  const maxAttempts = timeoutMs <= IA_FAST_SEARCH_TIMEOUT_MS ? 1 : 2;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let upstream;
    try {
      upstream = await archiveFetch(upstreamUrl.toString(), { cache: "no-store" }, timeoutMs);
      const raw = await upstream.text();
      if (!upstream.ok) throw new Error("archive advanced search " + upstream.status);
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new Error("archive advanced search returned non-JSON");
      }
      return { ...(payload.response || { numFound: 0, docs: [] }), _afterglowSource: "advanced" };
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        const retryAfter = upstream && Number(upstream.headers.get("retry-after"));
        const delay = iaArchiveRetryDelay(attempt, retryAfter);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

async function cachedSearchArchive(cacheOrigin, query, rows, page, sort, ctx, timeoutMs = 3200) {
  const cacheKey = new Request(cacheOrigin + IA_PREFIX + "/cache/search/" + IA_SEARCH_CACHE_VERSION + "/" + await stableKey([query, rows, page, sort].join("|")));
  const inflightKey = cacheKey.url;
  const existing = iaSearchInflight.get(inflightKey);
  if (existing) return existing;
  const pending = cachedArchiveJson(cacheKey, IA_SEARCH_TTL_SECONDS, () => withIaArchiveSearchPermit(() => searchArchive(query, rows, page, sort, timeoutMs), timeoutMs <= IA_FAST_SEARCH_TIMEOUT_MS), ctx)
    .finally(() => { if (iaSearchInflight.get(inflightKey) === pending) iaSearchInflight.delete(inflightKey); });
  iaSearchInflight.set(inflightKey, pending);
  return pending;
}

async function getIaSearch(url, ctx) {
  const q = (url.searchParams.get("q") || "").trim();
  if (!q || q.length > 2400) return json({ error: "invalid archive search" }, 400);
  const rows = Math.max(1, Math.min(100, Number(url.searchParams.get("rows")) || 50));
  const page = Math.max(1, Math.min(10000, Number(url.searchParams.get("page")) || 1));
  const sort = (url.searchParams.get("sort") || "downloads desc").slice(0, 80);
  try {
    const payload = await cachedSearchArchive(url.origin, q, rows, page, sort, ctx);
    return cacheableJson(
      { response: payload },
      IA_SEARCH_TTL_SECONDS,
      { "X-Afterglow-Source": "internet-archive-cache", "X-Afterglow-Archive-Route": payload._afterglowSource || "unknown" },
    );
  } catch {
    return json({ error: "archive search unavailable" }, 502);
  }
}

async function getIaMetadata(id, requestUrl, ctx) {
  if (!safeIaId(id)) return json({ error: "invalid archive identifier" }, 400);
  const cacheKey = new Request(requestUrl.origin + IA_PREFIX + "/cache/metadata/" + id);
  try {
    const payload = await cachedArchiveJson(cacheKey, IA_METADATA_TTL_SECONDS, async () => {
      const upstream = await archiveFetch("https://archive.org/metadata/" + encodeURIComponent(id), {}, 4200);
      if (!upstream.ok) throw new Error("archive metadata " + upstream.status);
      return upstream.json();
    }, ctx);
    return cacheableJson(payload, IA_METADATA_TTL_SECONDS, { "X-Afterglow-Source": "internet-archive-cache" });
  } catch {
    return json({ error: "archive metadata unavailable" }, 502);
  }
}

function queueItem(doc, lane) {
  return {
    identifier: doc.identifier,
    sourceIdentifier: doc.sourceIdentifier || doc.identifier,
    fileName: doc.fileName || null,
    title: doc.title || doc.identifier,
    year: doc.year || null,
    runtime: doc.runtime || null,
    subject: doc.subject || null,
    creator: doc.creator || null,
    collection: doc.collection || null,
    genreVerified: true,
    mediaType: doc.media && doc.media.type ? doc.media.type : null,
    /* Expanded file entries already have a direct Archive CDN URL from the
       manifest we just fetched. Preserve it so the browser never has to turn
       around and fetch the same parent metadata a second time. */
    media: doc.media && doc.media.url ? {
      type: doc.media.type || "video",
      url: doc.media.url,
      alts: Array.isArray(doc.media.alts) ? doc.media.alts.slice(0, 7) : [],
    } : null,
    lane: Number.isInteger(lane) ? lane : null,
  };
}

/* A parent Archive record can be a feature film with several encodes, or a
   genuine collection containing dozens of independently playable episodes.
   These title/metadata hints keep expansion bounded while covering complete
   series, collections, anthologies, seasons, volumes, and chapter containers. */
function archiveContainerHint(doc) {
  const label = String(doc && doc.title || "") + " " + String(doc && doc.subject || "") + " " + String(doc && doc.collection || "");
  return /(?:\bcomplete\b|全集|full\s+(?:series|serial|season|collection)|\b(?:series|season)\s*\d|\bserial\b|\bepisodes?\b|\bchapters?\b|\bcollection\b|\banthology\b|\b(?:box[ _-]?set|volume)\b)/i.test(label);
}

function archiveEpisodeKey(file) {
  return String(file && file.name || "")
    .replace(/\.[^.]+$/, "")
    /* IA commonly publishes an H.264 derivative beside the original. Treat
       those files as one episode instead of two programs. */
    .replace(/(?:[._ -](?:ia|h\.?264|avc|x264|mpeg4|webm|ogv|(?:\d{2,4})kb|mobile|medium|high|low|original|orig))+$/i, "")
    .replace(/[._ -]+/g, " ").trim().toLowerCase();
}

function archiveEpisodeTitle(file, parentTitle) {
  const raw = String(file && (file.title || file.name) || "").split("/").pop()
    .replace(/\.[^.]+$/, "").replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
  return raw && raw.toLowerCase() !== String(parentTitle || "").toLowerCase()
    ? String(parentTitle || "Archive program") + " · " + raw
    : String(parentTitle || "Archive program");
}

/* Archive collections frequently expose title cards, intros, previews, and
   sample derivatives beside the real program. They are valid files, but not
   television programs: promoting one to the hot shelf causes a silent stall
   or a few seconds of slate. Keep this predicate shared by discovery and
   hydration so a bad derivative cannot re-enter through a later path. */
function archiveInterstitialFile(name) {
  return /(?:^|[._ -])(?:intro|intros|titlecard|title-card|trailer|preview|sample|thumb|thumbnail|poster|logo)(?:[._ -]|$)/i.test(String(name || ""));
}

function archiveEpisodeRotation(files, rotation, salt) {
  const ordered = files.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: "base" }));
  if (ordered.length < 2) return ordered;
  let seed = Math.abs(Number(rotation) || 0) + Math.abs(Number(salt) || 0);
  const key = String(ordered[0] && ordered[0].name || "");
  for (let index = 0; index < key.length; index += 1) seed = (seed * 33 + key.charCodeAt(index)) >>> 0;
  const offset = seed % ordered.length;
  return ordered.slice(offset).concat(ordered.slice(0, offset));
}

/* IA often stores an entire season/serial as one item with many independently
   playable files. Expand that manifest into episode candidates before ranking;
   the player receives one direct file URL per candidate. */
async function expandArchiveContainer(doc, cacheOrigin, ctx, rotation = 0, salt = 0, mediaTypes = []) {
  if (!doc || !doc.identifier) return [];
  try {
    const key = new Request(cacheOrigin + IA_PREFIX + "/cache/metadata/" + encodeURIComponent(doc.identifier));
    const payload = await cachedArchiveJson(key, IA_METADATA_TTL_SECONDS, async () => {
      /* This runs only after first tune has already returned. Let a large but
         valid Archive manifest finish rather than borrowing the 4.2s
         first-frame deadline and silently losing its episode files. */
      const upstream = await archiveFetch("https://archive.org/metadata/" + encodeURIComponent(doc.identifier), {}, 8000);
      if (!upstream.ok) throw new Error("archive metadata " + upstream.status);
      return upstream.json();
    }, ctx);
    const files = Array.isArray(payload && payload.files) ? payload.files : [];
    const wantsAudio = mediaTypes.includes("audio") && !mediaTypes.includes("movies");
    const playableCandidates = files.filter((file) => file && file.name && (wantsAudio
      ? /\.mp3$|\.ogg$|\.m4a$|\.flac$/i.test(file.name)
      : /\.mp4$|\.m4v$|\.webm$|\.ogv$/i.test(file.name))
      && !archiveInterstitialFile(file.name)
      && !/(?:cover|torrent|\.txt$|\.xml$|_files$|_meta$|_archive$)/i.test(file.name));
    const byEpisode = new Map();
    for (const file of playableCandidates) {
      const key = archiveEpisodeKey(file);
      if (!key) continue;
      const previous = byEpisode.get(key);
      const score = (candidate) => wantsAudio
        ? (/\.mp3$/i.test(candidate.name) ? 0 : 1)
        : (/h\.?264/i.test(String(candidate && candidate.format || "")) ? 0 : /\.mp4$|\.m4v$/i.test(candidate.name) ? 1 : 2);
      if (!previous || score(file) < score(previous)) byEpisode.set(key, file);
    }
    const rotatedPlayable = archiveEpisodeRotation([...byEpisode.values()], rotation, salt);
    /* A film with alternate encodes is not a series. Labelled containers may
       legitimately have two files; an unlabelled item needs three distinct
       media files before it joins the episode catalog. That catches ordinary
       Archive uploads whose title does not say “complete series” while keeping
       a two-file movie/alternate encode from being split accidentally. */
    const minimumFiles = archiveContainerHint(doc) ? 2 : 3;
    if (rotatedPlayable.length < minimumFiles) return [];
    const playable = sampleArchiveSequence(rotatedPlayable, IA_MAX_EXPANDED_FILES);
    const md = payload.metadata || {};
    const base = String(doc.title || doc.identifier).replace(/\s+/g, " ").trim();
    return playable.map((file) => {
      const title = archiveEpisodeTitle(file, base);
      const seasonEpisode = title.match(/\bS(\d{1,2})E(\d{1,3})\b/i) || title.match(/\b(?:Ch|Chapter|Ep|Episode)[ _-]?(\d{1,3})\b/i);
      return { ...doc, identifier: doc.identifier + "::" + file.name, sourceIdentifier: doc.identifier,
        fileName: file.name, title, season: seasonEpisode ? Number(seasonEpisode[1]) : null,
        episode: seasonEpisode ? Number(seasonEpisode[2]) : null,
        /* Archive `file.length` is byte size, not duration. Feeding it to
           runtime gates rejected valid episodes as millions of seconds long. */
        runtime: file.duration || file.runtime || doc.runtime,
        media: (function() {
          const urls = queueFileUrls(doc.identifier, payload, file.name);
          return urls.length ? { type: wantsAudio ? "audio" : "video", url: urls[0], alts: urls.slice(1, 8) } : null;
        })(),
        collection: Array.isArray(md.collection) ? (md.collection[0] || doc.collection) : (md.collection || doc.collection) };
    });
  } catch (error) {
    console.warn(JSON.stringify({ event: "ia-container-expansion-failed", identifier: doc.identifier, message: String(error && error.message || error) }));
    return [];
  }
}

/* Select evenly across a rotated Archive manifest. A simple slice would make
   every deep collection reopen its earliest episodes until the catalog cache
   expired, even when the manifest contains years of later material. */
function sampleArchiveSequence(items, limit) {
  const source = Array.isArray(items) ? items : [];
  const maximum = Math.max(1, Number(limit) || source.length || 1);
  if (source.length <= maximum) return source.slice();
  if (maximum === 1) return [source[0]];
  const picked = [], seen = new Set();
  for (let index = 0; index < maximum; index += 1) {
    const at = Math.round(index * (source.length - 1) / (maximum - 1));
    if (seen.has(at)) continue;
    seen.add(at);
    picked.push(source[at]);
  }
  return picked;
}

function queueKey(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/* Archive uploads frequently split one television series across several
   identifiers and uploader labels. Creator/collection caps cannot recognize
   that collision, which is how one popular show can crowd a five-item shelf
   even when the rolling catalog contains many other programs. Normalize the
   common series aliases first, then fall back to a conservative title stem so
   episode markers and alternate encode labels do not become separate families. */
const IA_TITLE_FAMILY_ALIASES = Object.freeze([
  ["burns and allen", ["burns and allen", "george burns", "gracie allen"]],
  ["i love lucy", ["i love lucy", "lucille ball"]],
  ["the honeymooners", ["the honeymooners", "ralph kramden"]],
  ["jack benny", ["jack benny"]],
  ["dick van dyke", ["dick van dyke"]],
  ["mary tyler moore", ["mary tyler moore"]],
  ["andy griffith", ["andy griffith", "mayberry"]],
  ["phil silvers", ["phil silvers", "sgt bilko", "sergeant bilko"]],
  ["ed sullivan", ["ed sullivan"]],
  ["red skelton", ["red skelton"]],
  ["jackie gleason", ["jackie gleason"]],
  ["milton berle", ["milton berle"]],
  ["leave it to beaver", ["leave it to beaver"]],
  ["beverly hillbillies", ["beverly hillbillies"]],
  ["green acres", ["green acres"]],
  ["petticoat junction", ["petticoat junction"]],
  ["the addams family", ["the addams family"]],
  ["the munsters", ["the munsters"]],
  ["bewitched", ["bewitched"]],
  ["i dream of jeannie", ["i dream of jeannie"]],
  ["mr ed", ["mr ed", "mister ed"]],
  ["hogan's heroes", ["hogan's heroes", "hogans heroes"]],
  ["gomer pyle", ["gomer pyle"]],
  ["f troop", ["f troop"]],
  ["get smart", ["get smart"]],
  ["twilight zone", ["twilight zone"]],
  ["outer limits", ["outer limits"]],
  ["alfred hitchcock", ["alfred hitchcock"]],
  ["one step beyond", ["one step beyond"]],
  ["night gallery", ["night gallery"]],
]);

function queueTitleFamily(doc) {
  const title = queueKey(doc && doc.title);
  if (!title) return queueKey(doc && (doc.sourceIdentifier || doc.identifier));
  for (const [family, aliases] of IA_TITLE_FAMILY_ALIASES) {
    if (aliases.some((alias) => title.includes(queueKey(alias)))) return family;
  }
  const stem = title
    .replace(/\b(?:episode|ep|chapter|part)\s*(?:title\s*)?(?:\d+|[a-z])?.*$/i, "")
    .replace(/\b(?:s\d{1,2}e\d{1,3}|season\s*\d+|series\s*\d+)\b.*$/i, "")
    .replace(/\b(?:complete(?:\s+series|\s+collection)?|full\s+series|box\s*set)\b/gi, "")
    .replace(/\b(?:19|20)\d{2}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stem.slice(0, 120) || title.slice(0, 120);
}

function queueEraKey(value) {
  const match = String(value || "").match(/(?:18|19|20)\d{2}/);
  return match ? String(Math.floor(Number(match[0]) / 10) * 10) : "";
}

function queueDiversityKeys(doc, lane) {
  return {
    lane: String(lane),
    era: queueEraKey(doc && doc.year),
    creator: queueKey(doc && doc.creator),
    collection: queueKey(doc && doc.collection),
    family: queueTitleFamily(doc),
    /* Files expanded from one Archive item are distinct programs, but one
       complete season still must not occupy the entire five-program shelf. */
    source: queueKey(doc && (doc.sourceIdentifier || doc.identifier)),
  };
}

function iaFreshnessLedgerKey(channel) {
  return IA_QUEUE_KV_PREFIX + "freshness:" + IA_FRESHNESS_LEDGER_VERSION + ":" + encodeURIComponent(String(channel || "").trim());
}

function iaFreshnessRecord(item) {
  if (!item || !item.identifier) return null;
  const keys = queueDiversityKeys(item, item.lane);
  return {
    id: String(item.identifier),
    era: keys.era || "",
    collection: keys.collection || "",
    lane: keys.lane || "",
    issuedAt: Date.now(),
  };
}

function normalizeIaFreshnessLedger(value) {
  const raw = Array.isArray(value) ? value : (value && Array.isArray(value.items) ? value.items : []);
  const seen = new Set();
  const items = raw.map((entry) => {
    if (typeof entry === "string") return { id: entry, era: "", collection: "", lane: "", issuedAt: 0 };
    if (!entry || !entry.id) return null;
    return {
      id: String(entry.id).slice(0, 240),
      era: String(entry.era || "").slice(0, 12),
      collection: String(entry.collection || "").slice(0, 160),
      lane: String(entry.lane || "").slice(0, 24),
      issuedAt: Number(entry.issuedAt) || 0,
    };
  }).filter((entry) => entry && entry.id && !seen.has(entry.id) && seen.add(entry.id));
  return items.slice(-IA_FRESHNESS_LEDGER_MAX);
}

async function loadIaFreshnessLedger(env, channel) {
  if (!env || !env.REALSIGNAL_QUEUE || !channel) return [];
  const key = iaFreshnessLedgerKey(channel);
  const local = iaFreshnessMemory.get(key);
  if (local && local.expiresAt > Date.now()) return local.items;
  if (local) iaFreshnessMemory.delete(key);
  try {
    const payload = await sharedQueueGet(env, key);
    const items = normalizeIaFreshnessLedger(payload);
    iaFreshnessMemory.set(key, { items, expiresAt: Date.now() + IA_FRESHNESS_MEMORY_TTL_MS });
    return items;
  } catch (error) {
    console.warn(JSON.stringify({ event: "ia-freshness-ledger-read-failed", channel, message: String(error && error.message || error) }));
    return [];
  }
}

function queueFreshnessDiffers(item, previous) {
  if (!previous) return true;
  const current = iaFreshnessRecord(item);
  if (!current) return false;
  /* Prefer a different decade or collection on the next opening. When IA
     omits both fields, a different editorial lane is still a meaningful
     change; otherwise keep the candidate eligible instead of starving a
     sparse channel. */
  if (current.era && previous.era && current.era !== previous.era) return true;
  if (current.collection && previous.collection && current.collection !== previous.collection) return true;
  if (current.lane && previous.lane && current.lane !== previous.lane) return true;
  return !current.era && !current.collection && !current.lane;
}

function applyIaFreshness(payload, ledger, count) {
  const history = normalizeIaFreshnessLedger(ledger);
  const excluded = new Set(history.map((entry) => entry.id));
  const candidates = Array.isArray(payload && payload.candidateItems) && payload.candidateItems.length
    ? payload.candidateItems
    : ((payload && payload.items) || []);
  if (!candidates.length) return { payload, issued: [], freshCount: 0, excludedCount: 0 };
  const unique = [];
  const seen = new Set();
  for (const item of candidates) {
    if (!item || !item.identifier || seen.has(item.identifier)) continue;
    seen.add(item.identifier);
    unique.push(item);
  }
  const requested = Math.max(1, Number(count) || 1);
  const playable = unique.filter((item) => item.media && item.media.url);
  const publicItems = Array.isArray(payload && payload.items) && payload.items.length ? payload.items : unique;
  /* A hydrated response keeps unresolved catalog candidates in
     candidateItems. Never promote those into the public shelf just because
     the freshness pass is reordering it; use the already-ready items until
     the background refill supplies more playable depth. */
  const source = playable.length >= requested ? playable : publicItems;
  const fresh = source.filter((item) => !excluded.has(String(item.identifier)));
  /* Repeats are only permitted after the channel has exhausted its unseen
     shelf. Prefer fresh media first, then use the oldest/reasonably rotated
     history as the emergency tail. */
  const eligible = fresh.length >= requested
    ? fresh
    : fresh.concat(source.filter((item) => excluded.has(String(item.identifier))));
  const previous = history.length ? history[history.length - 1] : null;
  let firstIndex = eligible.findIndex((item) => !excluded.has(String(item.identifier)) && queueFreshnessDiffers(item, previous));
  if (firstIndex < 0) firstIndex = eligible.findIndex((item) => !excluded.has(String(item.identifier)));
  if (firstIndex < 0) firstIndex = 0;
  const ordered = firstIndex > 0 ? [eligible[firstIndex], ...eligible.slice(0, firstIndex), ...eligible.slice(firstIndex + 1)] : eligible;
  const orderedCandidates = fresh.length
    ? fresh.concat(unique.filter((item) => !fresh.includes(item)))
    : unique;
  const items = ordered.slice(0, requested);
  const issued = items.map(iaFreshnessRecord).filter(Boolean);
  return {
    payload: {
      ...(payload || {}),
      items,
      candidateItems: orderedCandidates,
      candidates: orderedCandidates.length,
      ready: Math.min(Math.max(Number(payload && payload.ready) || 0, items.length), requested),
      freshness: {
        ledgerSize: history.length,
        freshCount: fresh.length,
        excludedCount: Math.min(history.length, unique.length),
        repeatedFallback: fresh.length < Math.max(1, Number(count) || 1),
      },
    },
    issued,
    freshCount: fresh.length,
    excludedCount: Math.min(history.length, unique.length),
  };
}

function rememberIaFreshness(env, channel, records, ctx) {
  const incoming = normalizeIaFreshnessLedger(records);
  if (!env || !env.REALSIGNAL_QUEUE || !channel || !incoming.length) return;
  const key = iaFreshnessLedgerKey(channel);
  const local = iaFreshnessMemory.get(key);
  const optimistic = normalizeIaFreshnessLedger({
    items: (local && local.expiresAt > Date.now() ? local.items : []).concat(incoming),
  });
  iaFreshnessMemory.set(key, { items: optimistic, expiresAt: Date.now() + IA_FRESHNESS_MEMORY_TTL_MS });
  const work = (async () => {
    try {
      /* Re-read immediately before writing so two devices that tune the same
         channel close together merge their issued shelves instead of one
         request erasing the other request's history. */
      const current = normalizeIaFreshnessLedger(await sharedQueueGet(env, key));
      const merged = normalizeIaFreshnessLedger({ items: current.concat(optimistic).concat(incoming) });
      iaFreshnessMemory.set(key, { items: merged, expiresAt: Date.now() + IA_FRESHNESS_MEMORY_TTL_MS });
      await env.REALSIGNAL_QUEUE.put(key, JSON.stringify({
        version: IA_FRESHNESS_LEDGER_VERSION,
        channel: String(channel),
        items: merged,
        updatedAt: Date.now(),
      }), { expirationTtl: IA_FRESHNESS_LEDGER_TTL_SECONDS });
    } catch (error) {
      console.warn(JSON.stringify({ event: "ia-freshness-ledger-write-failed", channel, message: String(error && error.message || error) }));
    }
  })();
  if (ctx) ctx.waitUntil(work);
  else return work;
}

/* Resolve a queue candidate to a direct Archive CDN URL while it is still in
   the Worker cache. The browser receives a ready-to-play URL, not a metadata
   chore it must perform after the viewer has already pressed SKIP. */
function queueFileUrls(id, payload, name) {
  const archiveBase = "https://archive.org/download/" + encodeURIComponent(id) + "/";
  const dir = String(payload && payload.dir || "").replace(/\/+$/, "");
  const hosts = [payload && payload.server, payload && payload.d1, payload && payload.d2]
    .filter((host, index, all) => typeof host === "string" && /^[a-z0-9.-]+\.archive\.org$/i.test(host) && all.indexOf(host) === index);
  const bases = hosts.map((host) => dir ? "https://" + host + dir + "/" : archiveBase);
  bases.push(archiveBase);
  const encoded = String(name).split("/").map(encodeURIComponent).join("/");
  return bases.map((base) => base + encoded).filter((url, index, all) => all.indexOf(url) === index);
}

async function queuePlayable(id, cacheOrigin, ctx, mediaTypes = [], attempt = 0) {
  try {
    const rawId = String(id || "");
    const separator = rawId.indexOf("::");
    const sourceId = separator >= 0 ? rawId.slice(0, separator) : rawId;
    const requestedFile = separator >= 0 ? rawId.slice(separator + 2) : "";
    const cacheKey = new Request(cacheOrigin + IA_PREFIX + "/cache/metadata/" + encodeURIComponent(sourceId));
    const inflightKey = cacheKey.url;
    let metadata = iaMetadataInflight.get(inflightKey);
    if (!metadata) {
      metadata = cachedArchiveJson(cacheKey, IA_METADATA_TTL_SECONDS, async () => {
        const upstream = await archiveFetch("https://archive.org/metadata/" + encodeURIComponent(sourceId), {}, 4200);
        if (!upstream.ok) {
          const error = new Error("archive metadata " + upstream.status);
          error.retryable = upstream.status === 408 || upstream.status === 425 || upstream.status === 429 || upstream.status >= 500;
          throw error;
        }
        return upstream.json();
      }, ctx).finally(() => {
        if (iaMetadataInflight.get(inflightKey) === metadata) iaMetadataInflight.delete(inflightKey);
      });
      iaMetadataInflight.set(inflightKey, metadata);
    }
    const payload = await metadata;
    const files = payload.files || [];
    const format = (file) => String(file && file.format || "").toLowerCase();
    const video = files.filter((file) => file && file.name && !archiveInterstitialFile(file.name) && (/\.mp4$|\.m4v$/i.test(file.name) || /\.webm$/i.test(file.name) || /\.ogv$/i.test(file.name)))
      .sort((a, b) => {
        const score = (file) => /h\.?264/.test(format(file)) ? 0 : /\.mp4$|\.m4v$/i.test(file.name) ? 1 : /\.webm$/i.test(file.name) ? 2 : 3;
        return score(a) - score(b);
      });
    const audio = files.find((file) => file && file.name && !archiveInterstitialFile(file.name) && /\.mp3$|\.ogg$|\.m4a$|\.flac$/i.test(file.name));
    /* Preserve the queue's declared media contract during hydration. A movie
       catalog record can contain only an audio derivative; returning it to a
       video channel made a seemingly healthy shelf fail at playback time. */
    const wantsVideo = mediaTypes.includes("movies");
    const wantsAudio = mediaTypes.includes("audio");
    const requested = requestedFile && files.find((file) => file && file.name === requestedFile && !archiveInterstitialFile(file.name) && (wantsAudio
      ? /\.mp3$|\.ogg$|\.m4a$|\.flac$/i.test(file.name)
      : /\.mp4$|\.m4v$|\.webm$|\.ogv$/i.test(file.name)));
    const chosen = requested || (wantsVideo ? video[0] : wantsAudio ? audio : (video[0] || audio));
    if (!chosen) return null;
    /* `id` may be synthetic (`parent::file`). URLs must use the real Archive
       identifier as their directory, or every expanded episode 404s. */
    const isVideo = video.includes(chosen);
    if ((wantsVideo && !isVideo) || (wantsAudio && isVideo)) return null;
    const urls = queueFileUrls(sourceId, payload, chosen.name);
    return urls.length ? { type: isVideo ? "video" : "audio", url: urls[0], alts: urls.slice(1, 8) } : null;
  } catch (error) {
    const message = String(error && error.message || error || "");
    const retryable = Boolean(error && error.retryable) || /AbortError|aborted|timeout|timed out|fetch failed|network|archive metadata (408|425|429|5\d\d)/i.test(message);
    if (retryable && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, iaArchiveRetryDelay(attempt)));
      return queuePlayable(id, cacheOrigin, ctx, mediaTypes, attempt + 1);
    }
    return null;
  }
}

async function mapQueueCandidates(items, limit, fn) {
  const results = Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function queueRotationSort(rotation, lane) {
  const modes = ["downloads desc", "date desc", "date asc", "titleSorter asc", "publicdate desc", "week desc"];
  return modes[(Number(rotation) + Number(lane)) % modes.length];
}

function queueRotationPage(rotation, lane, channel = "", background = false) {
  /* Background harvests are allowed to look beyond the first few Archive
     result pages. Keep foreground discovery conservative so a channel change
     stays fast, while deterministic channel/lane seeding gives each rotation
     a different page window without making cache keys nondeterministic. */
  const pageCount = background
    ? (iaDepthRecoveryEnabled(channel) ? 24 : 16)
    : (iaDepthRecoveryEnabled(channel) ? 6 : 3);
  let seed = Math.abs(Number(rotation) || 0) * 7 + Number(lane || 0) * 3;
  const key = String(channel || "");
  for (let index = 0; index < key.length; index += 1) seed = (seed * 33 + key.charCodeAt(index)) >>> 0;
  return 1 + seed % pageCount;
}

async function buildIaQueue(channel, queries, themeTerms, denyTerms, requiredTitleTerms, mediaTypes, themeMinScore, diversity, count, cacheOrigin, ctx, rotation = 0, searchTimeoutMs = 3200, firstApprovedLane = false, expandContainers = !firstApprovedLane, freshnessExcludedIds = null, minRuntimeSeconds = 0) {
  /* `count` is the number of programs the viewer needs immediately. The
     caller also passes a larger candidate budget for strict lanes. The old
     builder accidentally used `count` for both, throwing away the wider
     catalog before metadata hydration could select playable files. Keep the
     wider candidate shelf intact; hydrate only the requested foreground
     count, then let background refill and later rotations consume the rest. */
  const items = [], deferred = [], freshnessDeferred = [], seen = new Set(), seenTitles = new Set(), candidateLimit = Math.max(count, Math.min(IA_STRICT_CATALOG_CANDIDATE_MAX, Number(count) || 5));
  const freshnessExcluded = new Set(Array.isArray(freshnessExcludedIds) ? freshnessExcludedIds.map(String) : []);
  const used = { lane: new Map(), era: new Map(), creator: new Map(), collection: new Map(), family: new Map(), source: new Map() };
  let deferredContainerExpansion = false;
  /* Query lanes are already editorially ordered by the app. Fetch a small
     sample from each lane in parallel, then take one from every lane before
     taking a second: a five-item buffer spans eras/topics instead of becoming
     five nearly identical top-download results. */
  /* The app sends up to eight deliberately separated rails: permanent/full-era,
     current rotation, opposite ends of the era range, and narrow editorial
     rails. Resolve all of them in parallel. Restricting discovery to only the
     first three made sparse channels look as if they were hydrating forever. */
  /* Foreground discovery stays bounded. Background catalog harvest can use
     the full editorial rail set so collection families, era lanes, and
     alternate Archive shelves contribute to the long tail instead of only
     the first eight query strings. */
  const searchQueries = uniqueIaQueries(queries, firstApprovedLane ? 8 : 12);
   const foregroundLaneLimit = firstApprovedLane && iaDepthRecoveryEnabled(channel)
     ? Math.min(4, searchQueries.length)
     : firstApprovedLane && iaColdRescueEnabled(channel) ? 2 : IA_FOREGROUND_DISCOVERY_LANES;
   const rotationRefreshLimit = firstApprovedLane && Number(rotation) > 0
     ? Math.min(iaDepthRecoveryEnabled(channel) ? 4 : 2, searchQueries.length)
     : foregroundLaneLimit;
   const laneLimit = firstApprovedLane
     ? Math.min(rotationRefreshLimit, searchQueries.length)
    : Math.min(8, searchQueries.length);
  const lanePromises = searchQueries.slice(0, laneLimit).map(async (query, lane) => {
    try {
      const rows = firstApprovedLane ? 36 : 60;
      const result = await cachedSearchArchive(cacheOrigin, query, Math.min(rows, Math.max(18, count * 4)), queueRotationPage(rotation, lane, channel, !firstApprovedLane), queueRotationSort(rotation, lane), ctx, searchTimeoutMs);
      // Archive.org collections are catalog pages, not programs. Keeping one in
      // a shelf guarantees a failed playback attempt, so reject them before
      // ranking, caching, or media hydration for every IA channel.
      const docs = (result.docs || []).filter((doc) => doc && safeIaId(doc.identifier) && String(doc.mediatype || "").toLowerCase() !== "collection" && (!mediaTypes.length || mediaTypes.includes(String(doc.mediatype || "").toLowerCase())))
        .sort((a, b) => themeScore(b, themeTerms) - themeScore(a, themeTerms));
      const approved = docs.filter((doc) => matchesTheme(doc, themeTerms, themeMinScore, requiredTitleTerms) && !matchesDeny(doc, denyTerms) && iaRuntimeAllowed(doc, minRuntimeSeconds));
      /* The first rail is returned before metadata expansion for speed. Every
         approved cold shelf gets a bounded background probe: Archive authors
         often omit words like “collection” even when an item contains a full
         season of distinct video files. */
      const catalogCanExpand = !mediaTypes.length || mediaTypes.includes("movies") || mediaTypes.includes("audio");
      if (firstApprovedLane && approved.length && catalogCanExpand) deferredContainerExpansion = true;
      /* The old foreground race expanded up to six complete-series manifests
         per search lane before it could even begin metadata hydration. A fast
         channel tune needs a verified program, not a season index. Keep that
         expensive diversity work behind the first frame and cap it even during
         background refill so channel surfing cannot stampede Archive. */
      const expansionLimit = firstApprovedLane ? IA_FOREGROUND_CONTAINER_EXPANSIONS : IA_BACKGROUND_CONTAINER_EXPANSIONS;
      const effectiveExpansionLimit = firstApprovedLane ? expansionLimit : Math.min(2, expansionLimit);
      /* Strong container signals are promoted first, with one generic
         multi-file probe behind them. The file manifest—not title wording—has
         the final say about whether an ordinary Archive record is a series. */
      const hintedSeeds = catalogCanExpand ? approved.filter(archiveContainerHint) : [];
      const genericSeeds = catalogCanExpand ? approved.filter((doc) => !archiveContainerHint(doc)).slice(0, 1) : [];
      /* The foreground lane must never wait on Archive manifests. The exact
         approved parent is enough to hydrate a first frame; the request-level
         background expansion below revisits that parent and turns its files
         into episode candidates after the viewer is already watching. */
       const expansionSeeds = (firstApprovedLane || !expandContainers) ? [] : hintedSeeds.concat(genericSeeds).slice(0, effectiveExpansionLimit);
      const expandedSets = await mapQueueCandidates(expansionSeeds, IA_CONTAINER_EXPANSION_CONCURRENCY, async (doc, expansionIndex) => {
        const episodes = await expandArchiveContainer(doc, cacheOrigin, ctx, rotation, lane * 31 + expansionIndex, mediaTypes);
        return episodes.filter((episode) => matchesTheme(episode, themeTerms, themeMinScore, requiredTitleTerms) && !matchesDeny(episode, denyTerms) && iaRuntimeAllowed(episode, minRuntimeSeconds));
      });
      const expanded = expandedSets.flat();
      /* Once a parent has yielded independently playable files, the parent is
         only a container index. Keeping it beside its children made a shelf
         look populated while wasting a slot on a duplicate series record. */
      const expandedSources = new Set(expanded.map((doc) => String(doc && (doc.sourceIdentifier || doc.identifier) || "")));
      const approvedPrograms = approved.filter((doc) => !expandedSources.has(String(doc.identifier || "")));
      return [...expanded, ...approvedPrograms].map((doc) => ({ doc, lane }));
    } catch {
      return [];
    }
  });
  let lanes;
  if (firstApprovedLane) {
    /* Cold tuning only needs one approved editorial rail to begin hydration.
       Keep the other fast rails observed under waitUntil so they can still
       warm the search cache, but do not make the viewer wait for their slowest
       response. */
    const settledLanes = Array(lanePromises.length);
    lanePromises.forEach((lanePromise, index) => {
      lanePromise.then((lane) => { settledLanes[index] = lane; }, () => { settledLanes[index] = []; });
    });
    let pending = lanePromises.length;
    const firstLane = await new Promise((resolve, reject) => {
      if (!pending) { reject(new Error("no Archive lanes")); return; }
      lanePromises.forEach((lanePromise) => lanePromise.then((lane) => {
        if (lane.length) { resolve(lane); return; }
        pending -= 1;
        if (!pending) reject(new Error("no approved Archive lane"));
      }).catch(() => {
        pending -= 1;
        if (!pending) reject(new Error("no approved Archive lane"));
      }));
    }).catch(() => []);
  /* A proven shallow/repeat-heavy lane gets a short grace period for a
     second approved rail. This widens the candidate catalog before the
     response when Archive is already warm, while the bounded waitUntil path
     still finishes any slower rail without blocking healthy lanes. */
    if (firstLane.length && (Number(rotation) > 0 || iaDepthRecoveryEnabled(channel)) && lanePromises.length > 1) {
      await Promise.race([
        Promise.allSettled(lanePromises),
        new Promise((resolve) => setTimeout(resolve, iaDepthGraceMs(channel))),
      ]);
    }
    if (ctx) ctx.waitUntil(Promise.allSettled(lanePromises));
    else await Promise.allSettled(lanePromises);
    const supplemental = settledLanes.filter((lane) => Array.isArray(lane) && lane.length && lane !== firstLane);
    lanes = firstLane.length ? [firstLane, ...supplemental] : [];
  } else {
    lanes = await Promise.all(lanePromises);
  }
  /* A parent can be returned by one editorial rail while its expanded files
     arrive from another. Remove those cross-lane parents before the diversity
     pass too; otherwise a complete-series index can still consume one slot
     beside its own episode files. */
  const expandedParents = new Set();
  lanes.flat().forEach((candidate) => {
    const doc = candidate && candidate.doc;
    const source = String(doc && doc.sourceIdentifier || "");
    if (source && String(doc.identifier || "") !== source) expandedParents.add(source);
  });
  const laneDepth = Math.max(0, ...lanes.map((lane) => lane.length));
  /* A few measured long-tail lanes are backed by a single large, verified
     Archive container (for example Club del Country or a complete radio
     collection). The normal two-per-source ceiling is correct for ordinary
     search results, but it artificially collapses those deep collections to
     a shallow shelf. Widen only the proven depth-recovery lanes; every other
     channel keeps the stricter source mix. */
  const sourceCap = iaDepthRecoveryEnabled(channel) ? 4 : 2;
  /* Healthy lanes retain the original underCap("source", keys.source, 2)
     behavior; only measured depth-recovery lanes use the widened cap. */
  function underCap(key, value, cap) { return !value || (used[key].get(value) || 0) < cap; }
  function add(candidate) {
    const keys = queueDiversityKeys(candidate.doc, candidate.lane);
    Object.keys(used).forEach((key) => { if (keys[key]) used[key].set(keys[key], (used[key].get(keys[key]) || 0) + 1); });
    items.push(queueItem(candidate.doc, candidate.lane));
  }
  function diverseEnough(candidate) {
    const keys = queueDiversityKeys(candidate.doc, candidate.lane);
    return underCap("lane", keys.lane, diversity.maxPerLane) &&
      underCap("era", keys.era, diversity.maxPerEra) &&
      underCap("creator", keys.creator, diversity.maxPerCreator) &&
      underCap("collection", keys.collection, diversity.maxPerCollection) &&
      underCap("family", keys.family, diversity.maxPerFamily) &&
      underCap("source", keys.source, sourceCap);
  }
  for (let row = 0; row < laneDepth && items.length < candidateLimit; row += 1) {
    for (const lane of lanes) {
      const candidate = lane[row], doc = candidate && candidate.doc;
      const titleKey = queueTitleKey(doc);
      if (!doc || expandedParents.has(String(doc.identifier || "")) || !matchesTheme(doc, themeTerms, themeMinScore, requiredTitleTerms) || matchesDeny(doc, denyTerms) || seen.has(doc.identifier) || (titleKey && seenTitles.has(titleKey))) continue;
      seen.add(doc.identifier);
      if (titleKey) seenTitles.add(titleKey);
      /* Keep previously issued programs as an emergency tail. Fresh records
         still get first access to the candidate budget, so the next queue
         cannot reopen on the same five items while sparse lanes retain a
         verified fallback instead of going dark. */
      if (freshnessExcluded.has(String(doc.identifier))) {
        freshnessDeferred.push(candidate);
        continue;
      }
      if (diverseEnough(candidate)) add(candidate); else deferred.push(candidate);
      if (items.length >= candidateLimit) break;
    }
  }
  /* Sparse catalogues may not have five distinct decades or uploaders. Fill
     the reserve shelf from the same already-approved candidates, preserving
     hard genre checks and exact-title de-duplication above. */
  for (const candidate of deferred) {
    if (items.length >= candidateLimit) break;
    /* Relaxing era/lane caps may rescue a sparse channel, but family diversity
       remains hard for the public catalog: a deep collection must not turn one
       television series into the whole station. */
    const keys = queueDiversityKeys(candidate.doc, candidate.lane);
    if (!underCap("source", keys.source, sourceCap) || !underCap("family", keys.family, diversity.maxPerFamily)) continue;
    add(candidate);
  }
  /* Only use a recent repeat after every unseen candidate that survived the
     editorial and diversity gates has been exhausted. */
  for (const candidate of freshnessDeferred) {
    if (items.length >= candidateLimit) break;
    const keys = queueDiversityKeys(candidate.doc, candidate.lane);
    if (!underCap("source", keys.source, sourceCap) || !underCap("family", keys.family, diversity.maxPerFamily)) continue;
    add(candidate);
  }
  return {
    channel,
    rotation: Number(rotation) || 0,
    generatedAt: new Date().toISOString(),
    ttlSeconds: IA_QUEUE_TTL_SECONDS,
    minRuntimeSeconds: safeMinRuntimeSeconds(minRuntimeSeconds),
    items: items.slice(0, count),
    /* Keep all approved candidates in the serialized payload. `items` is the
       small public shelf; `candidateItems` is the rolling catalog behind it. */
    candidateItems: items.slice(0, candidateLimit),
    ready: Math.min(items.length, count),
    deferredContainerExpansion,
  };
}

function mergeIaQueuePayload(primary, secondary, candidateCount, flags = {}) {
  const seen = new Set(), merged = [];
  const candidates = (payload) => Array.isArray(payload && payload.candidateItems)
    ? payload.candidateItems
    : ((payload && payload.items) || []);
  for (const item of [...candidates(primary), ...candidates(secondary)]) {
    if (!item || !item.identifier || seen.has(item.identifier)) continue;
    seen.add(item.identifier);
    merged.push(item);
    if (merged.length >= candidateCount) break;
  }
  return { ...(primary || {}), items: merged, candidateItems: merged, candidates: merged.length, ...flags };
}

function rotatePlayableIaShelf(payload, rotation, count) {
  const requested = Math.max(1, Number(count) || 5);
  const playableCandidates = Array.isArray(payload && payload.candidateItems)
    ? payload.candidateItems.filter((item) => item && item.identifier && item.media && item.media.url)
    : [];
  const source = playableCandidates.length >= requested
    ? playableCandidates
    : (Array.isArray(payload && payload.items) ? payload.items : []);
  if (!source.length) return { ...(payload || {}), items: [] };
  /* A rotation represents consuming the public shelf, not advancing one
     record. Step by a full requested shelf so the next tune does not replay
     four of the same five programs when a deeper catalog is available. */
  const offset = source.length > 1 ? (Math.abs(Number(rotation) || 0) * requested) % source.length : 0;
  const rotated = source.slice(offset).concat(source.slice(0, offset));
  return {
    ...(payload || {}),
    items: rotated.slice(0, requested),
    ...(playableCandidates.length >= requested ? { candidateItems: rotated, candidates: rotated.length } : {}),
    ready: Math.min(requested, rotated.length),
  };
}

function iaCatalogCandidateBudget(themeMinScore, count) {
  const requested = Math.max(1, Number(count) || 5);
  const strict = Number(themeMinScore) > 1;
  return Math.min(strict ? IA_STRICT_CATALOG_CANDIDATE_MAX : IA_CATALOG_CANDIDATE_MAX, Math.max(requested, requested * (strict ? 12 : 8)));
}

function iaNeedsCatalogDepth(payload, count, candidateCount) {
  const requested = Math.max(1, Number(count) || 5);
  const candidates = Array.isArray(payload && payload.candidateItems) && payload.candidateItems.length
    ? payload.candidateItems
    : ((payload && payload.items) || []);
  const playable = candidates.filter((item) => item && item.identifier && item.media && item.media.url).length;
  /* Four complete shelves is the minimum useful depth for a channel change.
     Prefer the larger background target when the catalog budget allows it.
     A warm cache can contain many unresolved identifiers while still having
     only the same five playable programs. Count both dimensions so a shallow
     playable shelf cannot suppress the lane's recovery bank. */
  const minimum = Math.min(Number(candidateCount) || requested, Math.max(requested * 3, IA_FRESHNESS_CANDIDATE_FLOOR));
  return candidates.length < minimum || playable < minimum;
}

function iaShouldBypassShallowRotation(payload, rotation, count, candidateCount) {
  /* A shallow exact-rotation cache is useful for the first frame, but it is
     actively harmful on a later tune: rotating five records only changes
     their order and makes the viewer see the same shelf forever. Let the
     request fall through to bounded discovery when a non-zero revision still
     lacks the three-shelf freshness floor. A verified last-good fallback is
     still available at the bottom of getIaQueue if discovery misses. */
  return Math.abs(Number(rotation) || 0) > 0 && iaNeedsCatalogDepth(payload, count, candidateCount);
}

function orderedIaEmergencySeeds(channel, rotation) {
  const seeds = (IA_EMERGENCY_SEEDS[String(channel)] || [])
    .concat(IA_LONG_TAIL_EXPANSIONS[String(channel)] || [])
    .concat(IA_LONG_TAIL_EXPANSIONS_EXTRA[String(channel)] || [])
    .map((item) => {
    const fileName = IA_LONG_TAIL_MEDIA_FILES[String(item && item.identifier || "")];
    if (!fileName || (item && item.media && item.media.url)) return item;
    const url = queueFileUrls(item.identifier, {}, fileName)[0];
    return url ? { ...item, media: { type: "video", url } } : item;
  });
  if (!seeds.length) return [];
  const offset = Math.abs(Number(rotation) || 0) % seeds.length;
  return seeds.slice(offset).concat(seeds.slice(0, offset));
}

function strictRecoveryQueue(channel, rotation, count, themeTerms, denyTerms, requiredTitleTerms, mediaTypes) {
  const seen = new Set();
  const bank = orderedIaEmergencySeeds(channel, 0).filter((item) => {
    if (!item || !item.identifier || !item.media || !item.media.url || seen.has(item.identifier)) return false;
    seen.add(item.identifier);
    return true;
  });
  const offset = bank.length > count ? (Math.abs(Number(rotation) || 0) * count) % bank.length : 0;
  const rotated = bank.slice(offset).concat(bank.slice(0, offset));
  const candidates = rotated.filter((item) => {
    if (!item || !item.identifier || !item.media || !item.media.url) return false;
    if (mediaTypes.length && mediaTypes.includes("movies") && item.media.type !== "video") return false;
    if (mediaTypes.length && mediaTypes.includes("audio") && item.media.type !== "audio") return false;
    return matchesTheme(item, themeTerms, 1, requiredTitleTerms) && !matchesDeny(item, denyTerms);
  });
  return {
    channel,
    rotation,
    generatedAt: new Date().toISOString(),
    ttlSeconds: 60,
    items: candidates.slice(0, count),
    candidateItems: candidates,
    candidates: candidates.length,
    ready: Math.min(count, candidates.length),
    partial: candidates.length < count,
    hydrating: false,
    strictRecovery: true,
  };
}

async function hydrateIaQueue(payload, requestedCount, cacheOrigin, ctx, mediaTypes, onReady, concurrency = 5) {
  /* Keep a few extra candidates behind the five-program shelf. Archive items
     occasionally have no browser-playable derivative; filtering those here
     means the viewer receives five actual media URLs instead of five names
     that each need another network trip in the browser. Stop as soon as the
     requested shelf is playable: waiting for every reserve item's metadata
     made a few slow Archive records hold an otherwise ready channel hostage. */
  const ready = [], items = Array.isArray(payload && payload.candidateItems) && payload.candidateItems.length
    ? payload.candidateItems
    : ((payload && payload.items) || []);
  let cursor = 0;
  async function worker() {
    while (ready.length < requestedCount) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index];
      const mediaContractMatches = item && item.media && item.media.url && (!mediaTypes.length || (mediaTypes.includes("movies") && item.media.type === "video") || (mediaTypes.includes("audio") && item.media.type === "audio"));
      const media = mediaContractMatches ? item.media : await queuePlayable(item.identifier, cacheOrigin, ctx, mediaTypes);
      if (media && ready.length < requestedCount) {
        const hydratedItem = { ...item, media };
        ready.push(hydratedItem);
        if (typeof onReady === "function") onReady(hydratedItem, ready.length);
      }
    }
  }
  const workerCount = iaAdaptiveHydrationConcurrency(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return {
    ...payload,
    items: ready,
    candidateItems: items,
    candidates: items.length,
    ready: ready.length,
    partial: ready.length < requestedCount,
    hydrating: false,
  };
}

function scheduleCachedIaHydration(payload, requestedCount, cacheOrigin, cacheKey, sharedKey, lastGoodKey, env, ctx, mediaTypes, channel, themeTerms, denyTerms, requiredTitleTerms, diversity, themeMinScore, candidateCount, queries) {
  const items = Array.isArray(payload && payload.items) ? payload.items : [];
  const candidates = Array.isArray(payload && payload.candidateItems) ? payload.candidateItems : [];
  if (!candidates.length || candidates.length <= items.length) return;
  const key = cacheKey.url;
  if (iaQueueHydrationInflight.has(key)) return;
  /* A partial cache may have been created by the foreground path before it
     was allowed to expand a complete-series parent. Revisit the first rail as
     part of background repair; starting at rail two left that parent stranded
     forever as a one-program shelf. */
  const reserveQueries = queries.slice(0, Math.min(8, queries.length));
  const fallbackQueries = iaFallbackQueries(themeTerms, denyTerms, requiredTitleTerms, mediaTypes);
  const seed = { ...payload, lastGoodKey, items: candidates.slice(0, candidateCount), candidateItems: candidates, candidates: candidates.length };
  const task = expandAndCacheIaQueue(seed, iaBackgroundReserveQueries(channel, reserveQueries, true), iaBackgroundFallbackQueries(channel, fallbackQueries, true), channel, themeTerms, denyTerms, requiredTitleTerms, mediaTypes, themeMinScore, diversity, requestedCount, candidateCount, cacheOrigin, cacheKey, sharedKey, env, ctx, Number(payload.rotation) || 0)
    .catch((error) => {
      console.warn(JSON.stringify({ event: "ia-cached-rehydration-failed", message: String(error && error.message || error) }));
    })
    .finally(() => iaQueueHydrationInflight.delete(key));
  iaQueueHydrationInflight.set(key, task);
  ctx.waitUntil(task);
}

/* The first fast rail may have already found the exact Archive container that
   matters. Expand that known parent before asking a rotated reserve page to
   find it again: an identifier-only search has one result, so page 2/3 is
   empty and used to make episode expansion silently disappear. Sample up to
   ten episode positions per parent, interleaved across parents, so a deep
   collection adds real variety without swallowing the entire station shelf. */
async function expandSeedArchiveContainers(payload, cacheOrigin, ctx, themeTerms, denyTerms, requiredTitleTerms, mediaTypes, themeMinScore, rotation, catalogLimit = IA_CATALOG_CANDIDATE_MAX) {
  const candidates = Array.isArray(payload && payload.candidateItems) && payload.candidateItems.length
    ? payload.candidateItems
    : ((payload && payload.items) || []);
  const seenParents = new Set();
  const parents = candidates.slice().sort((a, b) => Number(archiveContainerHint(b)) - Number(archiveContainerHint(a))).filter((item) => {
    /* Direct-ready emergency items are already a single playable program.
       Expanded episode records are different: their `::file` identity points
       back to a parent container that must remain eligible for deeper sibling
       harvesting. Skipping those synthetic episodes was the reason a large
       complete-series lane could stay locked to its first five files. */
    const rawIdentifier = String(item && item.identifier || "");
    const expandedEpisode = item && rawIdentifier.includes("::");
    if (item && item.media && item.media.url && !expandedEpisode) return false;
    const sourceId = String(item && (item.sourceIdentifier || (rawIdentifier.includes("::") ? rawIdentifier.split("::")[0] : rawIdentifier)) || "");
    if (!sourceId || seenParents.has(sourceId)) return false;
    seenParents.add(sourceId);
    return true;
  }).slice(0, Math.min(IA_BACKGROUND_CONTAINER_EXPANSIONS, Math.max(1, Math.ceil(Math.min(catalogLimit, IA_STRICT_CATALOG_CANDIDATE_MAX) / IA_BACKGROUND_COLLECTION_EPISODES_PER_PARENT))));
  if (!parents.length) return [];
  const episodeSets = await mapQueueCandidates(parents, IA_CONTAINER_EXPANSION_CONCURRENCY, async (parent, index) => {
    const episodes = await expandArchiveContainer({ ...parent, identifier: parent.sourceIdentifier || parent.identifier }, cacheOrigin, ctx, rotation, index * 47, mediaTypes);
    return episodes.filter((episode) => matchesTheme(episode, themeTerms, themeMinScore, requiredTitleTerms) && !matchesDeny(episode, denyTerms));
  });
  const balancedSets = episodeSets.map((episodes) => sampleArchiveSequence(episodes || [], IA_BACKGROUND_COLLECTION_EPISODES_PER_PARENT));
  const expanded = [];
  for (let row = 0; row < IA_BACKGROUND_COLLECTION_EPISODES_PER_PARENT && expanded.length < catalogLimit; row += 1) {
    balancedSets.forEach((episodes, lane) => {
      if (expanded.length >= catalogLimit) return;
      const episode = episodes[row];
      if (episode) expanded.push(queueItem(episode, lane));
    });
  }
  return expanded;
}

function queueEpisodeDepth(payload) {
  const candidates = Array.isArray(payload && payload.candidateItems) ? payload.candidateItems : [];
  return candidates.reduce((count, item) => count + (String(item && item.identifier || "").includes("::") ? 1 : 0), 0);
}

/* The foreground handoff and the background expansion run concurrently. Once
   a richer episode shelf is cached, an older one-program hydration result must
   never overwrite it just because its metadata request happened to finish
   later. */
async function cacheIaQueueIfRicher(cacheKey, payload, ttlSeconds, headers = {}) {
  const cache = caches.default;
  try {
    const prior = await cache.match(cacheKey);
    if (prior) {
      const priorPayload = await prior.clone().json();
      const priorEpisodes = queueEpisodeDepth(priorPayload), nextEpisodes = queueEpisodeDepth(payload);
      const priorReady = Number(priorPayload && priorPayload.ready || 0), nextReady = Number(payload && payload.ready || 0);
      const playableCount = (value) => {
        const candidates = Array.isArray(value && value.candidateItems) && value.candidateItems.length
          ? value.candidateItems
          : ((value && value.items) || []);
        return candidates.filter((item) => item && item.identifier && item.media && item.media.url).length;
      };
      const priorPlayable = playableCount(priorPayload), nextPlayable = playableCount(payload);
      /* A fast foreground handoff can contain five ready items plus dozens of
         unhydrated candidates. Never let that shallow response overwrite the
         richer playable shelf that its background refill just produced. */
      if (priorEpisodes > nextEpisodes ||
          (priorEpisodes === nextEpisodes && priorPlayable > nextPlayable) ||
          (priorEpisodes === nextEpisodes && priorPlayable === nextPlayable && priorReady > nextReady)) return false;
    }
  } catch {}
  await cache.put(cacheKey, cacheableJson(payload, ttlSeconds, headers));
  return true;
}

async function expandAndCacheIaQueue(payload, reserveQueries, fallbackQueries, channel, themeTerms, denyTerms, requiredTitleTerms, mediaTypes, themeMinScore, diversity, count, candidateCount, cacheOrigin, cacheKey, sharedKey, env, ctx, rotation, forceDiscovery = false) {
  let expanded = payload;
  const minRuntimeSeconds = safeMinRuntimeSeconds(payload && payload.minRuntimeSeconds);
  /* Exact rotation caches can be hydrated by separate requests. Pull the
     family shelf into this refill first so those caches inherit the union of
     verified candidates instead of persisting another shallow, overlapping
     rotation. This read stays entirely in the background expansion path. */
  if (payload && payload.lastGoodKey) {
    const family = await sharedQueueGet(env, payload.lastGoodKey);
    if (family && Array.isArray(family.items) && family.items.length) {
      const familyCandidates = mergeIaFallbackCandidates(family, expanded);
      if (familyCandidates.length > (Array.isArray(expanded.candidateItems) ? expanded.candidateItems.length : 0)) {
        expanded = { ...expanded, items: familyCandidates.slice(0, candidateCount), candidateItems: familyCandidates, candidates: familyCandidates.length };
      }
    }
  }
  /* A warm five-item shelf may have bypassed the cold emergency branch. Add
     the channel's verified recovery records to the background catalog before
     probing broader Archive rails, so stale caches can deepen immediately. */
  const emergencySeeds = orderedIaEmergencySeeds(channel, rotation).filter((item) => iaRuntimeAllowed(item, minRuntimeSeconds));
  if (emergencySeeds.length && iaNeedsCatalogDepth(expanded, count, candidateCount)) {
    expanded = mergeIaQueuePayload(expanded, { items: emergencySeeds, candidateItems: emergencySeeds }, candidateCount, { emergencySeedsMerged: true });
  }
  /* Family shelves can contain records written by an earlier background rail.
     Reapply the full editorial contract after every merge so a noisy Archive
     result can never leak back into a later rotation through shared state. */
  const retainApprovedCandidates = (value) => (Array.isArray(value) ? value : [])
    .filter((item) => matchesTheme(item, themeTerms, themeMinScore, requiredTitleTerms))
    .filter((item) => !matchesDeny(item, denyTerms))
    .filter((item) => iaRuntimeAllowed(item, minRuntimeSeconds));
  {
    const approvedCandidates = retainApprovedCandidates(expanded.candidateItems || expanded.items);
    expanded = { ...expanded, items: approvedCandidates.slice(0, candidateCount), candidateItems: approvedCandidates, candidates: approvedCandidates.length };
  }
  /* Start with collection files from the exact foreground result. This keeps
     the richer episode catalog tied to the same genre-checked parent instead
     of betting the repair on a later rotated search page returning it again. */
  const seedEpisodes = (await expandSeedArchiveContainers(expanded, cacheOrigin, ctx, themeTerms, denyTerms, requiredTitleTerms, mediaTypes, themeMinScore, rotation, candidateCount))
    .filter((episode) => iaRuntimeAllowed(episode, minRuntimeSeconds));
  if (seedEpisodes.length) {
    expanded = mergeIaQueuePayload({ ...expanded, items: seedEpisodes, candidateItems: seedEpisodes }, expanded, candidateCount, { containerExpanded: true });
    /* Write the exact parent’s ready episode files immediately. Reserve-query
       expansion can take longer, but these direct URLs are already verified
       and are enough for the next tune/skip to stop repeating one parent. */
    const seeded = await hydrateIaQueue(expanded, Math.min(count, seedEpisodes.length), cacheOrigin, ctx, mediaTypes);
    if (seeded && seeded.items.length) {
      const seedPayload = { ...seeded, partial: seeded.ready < count, hydrating: seeded.ready < count, containerExpanded: true };
      if (seedPayload.ready > 0) sharedQueuePut(env, sharedKey, seedPayload, IA_PARTIAL_QUEUE_TTL_SECONDS, ctx);
      await cacheIaQueueIfRicher(cacheKey, seedPayload, IA_PARTIAL_QUEUE_TTL_SECONDS, {
        "X-Afterglow-Source": "program-director-container-seed",
        "X-Afterglow-Queue-Ready": String(seedPayload.ready),
        "X-Afterglow-Queue-Partial": "1",
      });
    }
  }
  const threshold = Math.min(candidateCount, 8);
  /* A large candidate list is not the same thing as a deep playable shelf:
     Archive records can lack a browser-playable derivative. Widen whenever
     the hydrated depth is below the requested shelf, even if discovery found
     eight or more names already. The `ready` field belongs to the small public
     shelf and can remain at five after emergency identifiers are appended;
     count verified media URLs in the rolling catalog instead. */
  const expandedCandidates = Array.isArray(expanded && expanded.candidateItems) && expanded.candidateItems.length
    ? expanded.candidateItems
    : ((expanded && expanded.items) || []);
  const expandedPlayable = expandedCandidates.filter((item) => item && item.identifier && item.media && item.media.url).length;
  const needsPlayableDepth = expandedPlayable < Math.min(candidateCount, Math.max(count, iaDepthRecoveryEnabled(channel) ? IA_DEPTH_PLAYABLE_TARGET : IA_BACKGROUND_PLAYABLE_TARGET));
  if ((forceDiscovery || expanded.items.length < threshold || needsPlayableDepth) && reserveQueries.length) {
    const reserve = await buildIaQueue(channel, reserveQueries, themeTerms, denyTerms, requiredTitleTerms, mediaTypes, themeMinScore, diversity, candidateCount, cacheOrigin, ctx, rotation, 3200, false, true, null, minRuntimeSeconds);
    expanded = forceDiscovery
      ? mergeIaQueuePayload(reserve, expanded, candidateCount, { reserve: true, refreshed: true })
      : mergeIaQueuePayload(expanded, reserve, candidateCount, { reserve: true });
  }
  if ((forceDiscovery || expanded.items.length < threshold || needsPlayableDepth) && fallbackQueries.length) {
    const rescue = await buildIaQueue(channel, fallbackQueries, themeTerms, denyTerms, requiredTitleTerms, mediaTypes, themeMinScore, diversity, candidateCount, cacheOrigin, ctx, rotation, 3200, false, true, null, minRuntimeSeconds);
    expanded = forceDiscovery
      ? mergeIaQueuePayload(rescue, expanded, candidateCount, { rescue: true, refreshed: true })
      : mergeIaQueuePayload(expanded, rescue, candidateCount, { rescue: true });
  }
  {
    const approvedCandidates = retainApprovedCandidates(expanded.candidateItems || expanded.items);
    expanded = { ...expanded, items: approvedCandidates.slice(0, candidateCount), candidateItems: approvedCandidates, candidates: approvedCandidates.length };
  }
  if (!expanded.items.length) return null;
  /* Background repair is the only place allowed to spend extra metadata
     budget. Persist a broad verified playable catalog—not just raw
     identifiers—so later rotations can serve fresh shelves immediately even
     when Archive discovery is briefly slow. The public `items` field remains
     the normal five-program contract. */
  /* The background target provides several complete five-item rotations while
     staying entirely behind the first frame; cold tuning still hydrates only
     the requested public shelf. */
  const backgroundTarget = Math.min(candidateCount, Math.max(count * 3, iaDepthRecoveryEnabled(channel) ? IA_DEPTH_PLAYABLE_TARGET : IA_BACKGROUND_PLAYABLE_TARGET));
  const deepHydrated = await hydrateIaQueue(expanded, backgroundTarget, cacheOrigin, ctx, mediaTypes);
  const hydrated = deepHydrated && deepHydrated.items.length
    ? { ...deepHydrated, items: deepHydrated.items.slice(0, count), candidateItems: deepHydrated.items, candidates: deepHydrated.items.length, ready: Math.min(count, deepHydrated.items.length), partial: deepHydrated.items.length < count, hydrating: false, catalogVersion: IA_CATALOG_BUDGET_VERSION, catalogDepth: deepHydrated.items.length, episodeDepth: queueEpisodeDepth(deepHydrated) }
    : null;
  if (!hydrated || !hydrated.items.length) return null;
  const queueTtl = hydrated.ready >= count ? IA_QUEUE_TTL_SECONDS : IA_PARTIAL_QUEUE_TTL_SECONDS;
  if (hydrated.ready >= count) sharedQueuePut(env, sharedKey, hydrated, queueTtl, ctx);
  await cacheIaQueueIfRicher(cacheKey, hydrated, queueTtl, {
    "X-Afterglow-Source": "program-director-background",
    "X-Afterglow-Queue-Ready": String(hydrated.ready),
  });
  return hydrated;
}

/* A first-approved rail is intentionally allowed to return a partial candidate
   shelf so first tune stays fast. Keep only one wider expansion per exact
   rotation in flight, though: the foreground hydration and a later poll can
   both discover that the shelf needs help, and duplicate expansions just
   compete for the same Archive budget. */
function scheduleIaExpansion(seed, reserveQueries, fallbackQueries, channel, themeTerms, denyTerms, requiredTitleTerms, mediaTypes, themeMinScore, diversity, count, candidateCount, cacheOrigin, cacheKey, sharedKey, env, ctx, rotation, forceDiscovery = false) {
  const key = cacheKey && cacheKey.url;
  if (!key || !ctx || iaQueueExpansionInflight.has(key)) return;
  const task = expandAndCacheIaQueue(seed, reserveQueries, fallbackQueries, channel, themeTerms, denyTerms, requiredTitleTerms, mediaTypes, themeMinScore, diversity, count, candidateCount, cacheOrigin, cacheKey, sharedKey, env, ctx, rotation, forceDiscovery)
    .catch((error) => {
      console.warn(JSON.stringify({ event: "ia-background-replenishment-failed", channel, message: String(error && error.message || error) }));
    })
    .finally(() => iaQueueExpansionInflight.delete(key));
  iaQueueExpansionInflight.set(key, task);
  ctx.waitUntil(task);
}

function scheduleIaReplenishment(ready, reserveQueries, fallbackQueries, channel, themeTerms, denyTerms, requiredTitleTerms, mediaTypes, themeMinScore, diversity, count, candidateCount, cacheOrigin, cacheKey, sharedKey, env, ctx, rotation) {
  if (!ready) return;
  const candidateItems = Array.isArray(ready.candidateItems) && ready.candidateItems.length
    ? ready.candidateItems
    : (Array.isArray(ready.items) ? ready.items : []);
  const readyItems = Array.isArray(ready.items) ? ready.items : [];
  const playableCandidates = candidateItems.filter((item) => item && item.identifier && item.media && item.media.url).length;
  /* A complete foreground shelf is still shallow when its candidate catalog
     contains unresolved records. Hydrate a rolling depth in the background
     even when ready already equals the requested five; otherwise the next
     rotation can fall back to the same five forever. */
  const needsPlayableDepth = candidateItems.length > readyItems.length || playableCandidates < Math.min(candidateCount, Math.max(count * 3, IA_FRESHNESS_CANDIDATE_FLOOR));
  if (ready.ready >= count && !needsPlayableDepth) return;
  const seed = { ...ready, items: candidateItems.slice(0, candidateCount), candidateItems, candidates: candidateItems.length };
  scheduleIaExpansion(seed, iaBackgroundReserveQueries(channel, reserveQueries, needsPlayableDepth), iaBackgroundFallbackQueries(channel, fallbackQueries, needsPlayableDepth), channel, themeTerms, denyTerms, requiredTitleTerms, mediaTypes, themeMinScore, diversity, count, candidateCount, cacheOrigin, cacheKey, sharedKey, env, ctx, rotation);
}

async function timeboxQueueHydration(hydration, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      hydration,
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function getIaQueue(request, url, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "queue payload must be JSON" }, 400);
  }
  const channel = String(body && body.channel || "").trim();
  let queries = safeQueries(body && body.queries);
  const themeTerms = safeThemeTerms(body && body.themeTerms);
  const denyTerms = safeDenyTerms(body && body.denyTerms);
  const requiredTitleTerms = safeThemeTerms(body && body.requiredTitleTerms);
  const mediaTypes = safeMediaTypes(body && body.mediaTypes);
  const themeMinScore = safeThemeMinScore(body && body.themeMinScore);
  const minRuntimeSeconds = safeMinRuntimeSeconds(body && body.minRuntimeSeconds);
  const diversity = safeDiversity(body && body.diversity);
  const count = Math.max(1, Math.min(5, Number(body && body.count) || 5));
  if (!safeChannel(channel) || !queries) return json({ error: "invalid queue request" }, 400);
  if (requiredTitleTerms.length) {
    const titles = requiredTitleTerms.map(term => '"' + term.replace(/[()"\\]/g, " ") + '"').join(" OR ");
    queries = queries.map(query => "(" + query + ") AND title:(" + titles + ")");
  }
  /* The app owns a bounded carousel revision. Revision zero is the common,
     globally prewarmed shelf; later revisions are requested only after a
     viewer has actually consumed a queue, which keeps fresh programming from
     putting first tune back on the Archive critical path. */
  const rotation = safeQueueRotation(body && body.rotation);
  /* The five-show recovery shelf spans rotations, but never editorial rules.
     That avoids stale genre bleed after a channel's source contract changes. */
  const familyFingerprint = JSON.stringify({ channel, queries, themeTerms, denyTerms, requiredTitleTerms, mediaTypes, themeMinScore, minRuntimeSeconds, diversity, count });
  const lastGoodDigest = await stableKey(familyFingerprint);
  const fingerprint = JSON.stringify({ channel, queries, themeTerms, denyTerms, requiredTitleTerms, mediaTypes, themeMinScore, minRuntimeSeconds, diversity, count, rotation, catalogBudget: IA_CATALOG_BUDGET_VERSION });
  const digest = await stableKey(fingerprint);
  const cacheKey = new Request(url.origin + IA_PREFIX + "/cache/queue/" + IA_QUEUE_CACHE_VERSION + "/" + digest);
  const sharedKey = IA_QUEUE_KV_PREFIX + IA_QUEUE_CACHE_VERSION + ":" + digest;
  const lastGoodKey = sharedQueueFallbackKey(lastGoodDigest);
  /* Read the durable ledger in parallel with the normal cache path. KV is a
     small control-plane read; it must never become a second Archive search. */
  const freshnessLedgerPromise = loadIaFreshnessLedger(env, channel);
  const edgeCache = caches.default;
  const edgeCachePromise = edgeCache.match(cacheKey);
  const freshnessLedger = await freshnessLedgerPromise;
  /* Do not let a contaminated shared shelf outrank a verified, lane-owned
     recovery bank for the one channel that reproduced this defect. The bank
     is already direct-playable, so this remains a zero-network fast path. */
  if (iaStrictRecoveryEnabled(channel)) {
    const strict = strictRecoveryQueue(channel, rotation, count, themeTerms, denyTerms, requiredTitleTerms, mediaTypes);
    if (strict.ready >= count) {
      const freshStrict = applyIaFreshness(strict, freshnessLedger, count);
      rememberIaFreshness(env, channel, freshStrict.issued, ctx);
      return cacheableJson(freshStrict.payload, 60, {
        "X-Afterglow-Source": "program-director-strict-recovery",
        "X-Afterglow-Queue-Ready": String(freshStrict.payload.ready),
        "X-Afterglow-Queue-Strict": "1",
      });
    }
  }
  try {
    const cache = edgeCache, cached = await edgeCachePromise;
    if (cached) {
      /* A negative queue result is a transport hint, not programming. Never
         let a cached empty response turn into fifteen seconds of dead air;
         re-enter discovery so the next approved rail can win. */
      try {
        let cachedPayload = await cached.clone().json();
        const freshCached = applyIaFreshness(cachedPayload, freshnessLedger, count);
        cachedPayload = freshCached.payload;
        rememberIaFreshness(env, channel, freshCached.issued, ctx);
        /* A zero-ready response is a handoff while Archive metadata is still
           resolving, not a playable shelf. Older deploys cached that handoff
           for ten seconds, so every poll received the same spinner even after
           a later request could have verified the first media URL. Treat any
           zero-ready exact-rotation entry as stale and re-enter the bounded
           foreground path. Ready partial shelves remain valid: they already
           contain at least one verified program and can hydrate in background. */
        const cachedReady = Number(cachedPayload && cachedPayload.ready) || 0;
        if (!cachedPayload || cachedPayload.empty || cachedReady < 1 || !Array.isArray(cachedPayload.items) || !cachedPayload.items.length) {
          await cache.delete(cacheKey).catch(() => false);
        } else {
          const cachedCandidateCount = iaCatalogCandidateBudget(themeMinScore, count);
          const cachedCandidates = Array.isArray(cachedPayload.candidateItems) && cachedPayload.candidateItems.length
            ? cachedPayload.candidateItems
            : ((cachedPayload.items) || []);
          /* A valid exact-rotation response can still be an old five-item
             shelf. Keep serving it immediately on the first frame, but use
             later revisions to force bounded discovery until the rolling
             catalog has the full three-shelf freshness floor. */
          const cachedNeedsFreshRotation = cachedPayload.fallback === true || cachedPayload.stale === true;
          const cachedNeedsCatalogDepth = iaNeedsCatalogDepth(cachedPayload, count, cachedCandidateCount);
          const bypassShallowRotation = (iaDepthRecoveryEnabled(channel) && cachedNeedsCatalogDepth)
            || iaShouldBypassShallowRotation(cachedPayload, rotation, count, cachedCandidateCount);
          if (cachedPayload.items && cachedPayload.items.length && (cachedNeedsFreshRotation || cachedNeedsCatalogDepth)) {
            scheduleIaExpansion(
              { ...cachedPayload, lastGoodKey, items: cachedCandidates.slice(0, cachedCandidateCount), candidateItems: cachedCandidates, candidates: cachedCandidates.length },
              iaBackgroundReserveQueries(channel, queries, cachedNeedsCatalogDepth || cachedNeedsFreshRotation),
              iaBackgroundFallbackQueries(channel, iaFallbackQueries(themeTerms, denyTerms, requiredTitleTerms, mediaTypes), cachedNeedsCatalogDepth || cachedNeedsFreshRotation),
              channel, themeTerms, denyTerms, requiredTitleTerms, mediaTypes, themeMinScore, diversity,
              count, cachedCandidateCount, url.origin, cacheKey, sharedKey, env, ctx, rotation, true
            );
          }
          if (!bypassShallowRotation) {
            const cachedWasRotated = Array.isArray(cachedPayload.candidateItems) && cachedPayload.candidateItems.length > (Array.isArray(cachedPayload.items) ? cachedPayload.items.length : 0);
            const cachedShelfBase = cachedWasRotated
              ? rotatePlayableIaShelf(cachedPayload, rotation, count)
              : cachedPayload;
            const freshCachedShelf = applyIaFreshness(cachedShelfBase, freshnessLedger, count);
            const cachedShelf = freshCachedShelf.payload;
            rememberIaFreshness(env, channel, freshCachedShelf.issued, ctx);
            if (cachedWasRotated) {
              const rotatedResponse = cacheableJson(cachedShelf, 5, {
                "X-Afterglow-Source": "program-director-cache-rotation",
                "X-Afterglow-Cache": "edge-rotated",
                "X-Afterglow-Queue-Ready": String(cachedShelf.ready || cachedShelf.items.length),
              });
              return rotatedResponse;
            }
            if (cachedPayload.partial && Array.isArray(cachedPayload.candidateItems)) {
              const strictQueue = themeMinScore > 1;
              const candidateCount = Math.min(strictQueue ? IA_STRICT_CATALOG_CANDIDATE_MAX : IA_CATALOG_CANDIDATE_MAX, Math.max(count, count * (strictQueue ? 12 : 8)));
              scheduleCachedIaHydration(cachedPayload, count, url.origin, cacheKey, sharedKey, lastGoodKey, env, ctx, mediaTypes, channel, themeTerms, denyTerms, requiredTitleTerms, diversity, themeMinScore, candidateCount, queries);
            }
            return cached;
          }
        }
      } catch {
        return cached;
      }
    }
    const memory = iaQueueMemoryGet(cacheKey.url);
    const memoryNeedsFreshRotation = memory && Math.abs(Number(rotation) || 0) > 0 && iaNeedsCatalogDepth(memory.payload, count, iaCatalogCandidateBudget(themeMinScore, count));
    if (memory && !memoryNeedsFreshRotation) {
      const freshMemory = applyIaFreshness(memory.payload, freshnessLedger, count);
      rememberIaFreshness(env, channel, freshMemory.issued, ctx);
      return cacheableJson(freshMemory.payload, memory.ttlSeconds, {
        "X-Afterglow-Source": "program-director-memory",
        "X-Afterglow-Cache": "memory-burst",
        "X-Afterglow-Queue-Ready": String(freshMemory.payload.ready || freshMemory.payload.items.length),
      });
    }
    const shared = await sharedQueueGet(env, sharedKey);
    const freshShared = shared ? applyIaFreshness(shared, freshnessLedger, count) : { payload: shared, issued: [] };
    rememberIaFreshness(env, channel, freshShared.issued, ctx);
    const freshSharedPayload = freshShared.payload;
    const sharedShelf = freshSharedPayload && Array.isArray(freshSharedPayload.candidateItems) && freshSharedPayload.candidateItems.length > (Array.isArray(freshSharedPayload.items) ? freshSharedPayload.items.length : 0)
      ? rotatePlayableIaShelf(freshSharedPayload, rotation, count)
      : freshSharedPayload;
    if (sharedShelf && Array.isArray(sharedShelf.items) && sharedShelf.items.length && Number(sharedShelf.ready) > 0) {
      const sharedReady = Number(sharedShelf.ready) >= count;
      const sharedCandidateCount = iaCatalogCandidateBudget(themeMinScore, count);
      const sharedCandidates = Array.isArray(shared.candidateItems) && shared.candidateItems.length
        ? shared.candidateItems
        : ((shared.items) || []);
      const sharedNeedsExpansion = iaNeedsCatalogDepth(shared, count, sharedCandidateCount);
      const bypassSharedShallow = (iaDepthRecoveryEnabled(channel) && sharedNeedsExpansion)
        || iaShouldBypassShallowRotation(shared, rotation, count, sharedCandidateCount);
      if (sharedNeedsExpansion) {
        /* Do not wait for a complete-series expansion here. The current shelf
           is already playable; replenish it behind the response so the next
           skip/channel change sees a second, non-overlapping shelf. */
        scheduleIaExpansion(
          { ...shared, lastGoodKey, items: sharedCandidates.slice(0, sharedCandidateCount), candidateItems: sharedCandidates, candidates: sharedCandidates.length },
          iaBackgroundReserveQueries(channel, queries, sharedNeedsExpansion),
          iaBackgroundFallbackQueries(channel, iaFallbackQueries(themeTerms, denyTerms, requiredTitleTerms, mediaTypes), sharedNeedsExpansion),
          channel, themeTerms, denyTerms, requiredTitleTerms, mediaTypes, themeMinScore, diversity,
          count, sharedCandidateCount, url.origin, cacheKey, sharedKey, env, ctx, rotation, true
        );
      }
      if (!bypassSharedShallow) {
      let sharedFallback = null;
      if (!sharedReady && sharedShelf.partial && Array.isArray(sharedShelf.candidateItems) && !sharedNeedsExpansion) {
        const candidateCount = iaCatalogCandidateBudget(themeMinScore, count);
        scheduleCachedIaHydration(shared, count, url.origin, cacheKey, sharedKey, lastGoodKey, env, ctx, mediaTypes, channel, themeTerms, denyTerms, requiredTitleTerms, diversity, themeMinScore, candidateCount, queries);
        /* A partial exact-rotation shelf should start the background refill,
           but it should not force the viewer to live on one program. Serve a
           rotated full last-good shelf while the current rotation finishes. */
        const lastGood = await sharedQueueGet(env, lastGoodKey);
        if (lastGood && Array.isArray(lastGood.items) && lastGood.items.length >= count && Number(lastGood.ready) >= count) {
          sharedFallback = {
            ...rotatePlayableIaShelf(lastGood, rotation, count),
            rotation,
            fallback: true,
            stale: true,
            fallbackRotation: Number(lastGood.rotation) || 0,
            generatedAt: new Date().toISOString(),
          };
        }
      }
      const freshServed = applyIaFreshness(sharedFallback || sharedShelf, freshnessLedger, count);
      rememberIaFreshness(env, channel, freshServed.issued, ctx);
      const served = freshServed.payload;
      iaQueueMemoryPut(cacheKey.url, served, sharedReady || sharedFallback ? IA_QUEUE_MEMORY_TTL_SECONDS : 5);
      const response = cacheableJson(served, sharedReady || sharedFallback ? IA_QUEUE_TTL_SECONDS : 5, {
        "X-Afterglow-Source": sharedFallback ? "program-director-last-good" : "program-director-shared",
        "X-Afterglow-Cache": sharedFallback ? "shared-last-good" : "shared",
        "X-Afterglow-Queue-Ready": String(served.ready),
        ...(sharedFallback ? { "X-Afterglow-Queue-Fallback": "1" } : sharedReady ? {} : { "X-Afterglow-Queue-Partial": "1" }),
      });
      ctx.waitUntil(cache.put(cacheKey, response.clone()).catch((error) => {
        console.warn(JSON.stringify({ event: "shared-queue-edge-write-failed", channel, message: String(error && error.message || error) }));
      }));
      return response;
      }
    }
    /* A reload or companion device can arrive after the exact rotation cache
       expires but before the next approved rail is ready. A full shelf from
       this exact editorial family is always safer than dead air. On a new
       rotation we rotate it immediately, then rebuild that rotation behind the
       response so the next poll receives fresh programming rather than a
       permanent five-item loop. */
    const warmLastGood = await sharedQueueGet(env, lastGoodKey);
    if (warmLastGood && Array.isArray(warmLastGood.items) && warmLastGood.items.length >= count && Number(warmLastGood.ready) >= count) {
      const sameRotation = Number(warmLastGood.rotation || 0) === rotation;
      const warmCandidateCount = iaCatalogCandidateBudget(themeMinScore, count);
      const warmCandidates = Array.isArray(warmLastGood.candidateItems) && warmLastGood.candidateItems.length
        ? warmLastGood.candidateItems
        : warmLastGood.items;
      const warmNeedsExpansion = iaNeedsCatalogDepth(warmLastGood, count, warmCandidateCount);
      const warmNeedsFreshRotation = rotation > 0 && warmNeedsExpansion;
      const freshWarm = applyIaFreshness(warmLastGood, freshnessLedger, count);
      rememberIaFreshness(env, channel, freshWarm.issued, ctx);
      let warmFallback = {
        ...rotatePlayableIaShelf(freshWarm.payload, sameRotation ? 0 : rotation, count),
        rotation,
        fallback: true,
        stale: true,
        fallbackRotation: Number(warmLastGood.rotation) || 0,
        generatedAt: new Date().toISOString(),
      };
      const freshWarmFallback = applyIaFreshness(warmFallback, freshnessLedger, count);
      warmFallback = freshWarmFallback.payload;
      rememberIaFreshness(env, channel, freshWarmFallback.issued, ctx);
      if (!sameRotation || warmNeedsExpansion) {
        const warmSeed = { ...warmLastGood, lastGoodKey, rotation, items: warmCandidates.slice(0, warmCandidateCount), candidateItems: warmCandidates, candidates: warmCandidates.length };
        const warmReserveQueries = iaBackgroundReserveQueries(channel, queries, true);
        const warmFallbackQueries = iaBackgroundFallbackQueries(channel, iaFallbackQueries(themeTerms, denyTerms, requiredTitleTerms, mediaTypes), true);
        scheduleIaExpansion(warmSeed, warmReserveQueries, warmFallbackQueries, channel, themeTerms, denyTerms, requiredTitleTerms, mediaTypes, themeMinScore, diversity, count, warmCandidateCount, url.origin, cacheKey, sharedKey, env, ctx, rotation, true);
      }
      /* A shallow warm shelf is useful as an emergency fallback for healthy
         lanes, but it is exactly what traps a proven repeat-heavy lane on the
         same five items. Let those lanes re-enter their bounded discovery
         path; the warm shelf remains available if that path returns empty. */
      if (!warmNeedsFreshRotation) {
        const warmResponse = cacheableJson(warmFallback, 5, {
          "X-Afterglow-Source": "program-director-warm-start",
          "X-Afterglow-Cache": "shared-last-good",
          "X-Afterglow-Queue-Ready": String(warmFallback.ready || warmFallback.items.length),
          "X-Afterglow-Queue-Fallback": "1",
        });
        iaQueueMemoryPut(cacheKey.url, warmFallback, 5);
        ctx.waitUntil(cache.put(cacheKey, warmResponse.clone()).catch((error) => {
          console.warn(JSON.stringify({ event: "warm-start-queue-edge-write-failed", channel, message: String(error && error.message || error) }));
        }));
        return warmResponse;
      }
    }
    // Hard-locked programming can reject many otherwise plausible Archive.org
    // results. Give those channels a deeper candidate shelf before hydration so
    // a single unplayable item never turns into a visible No Signal screen.
    const strictQueue = themeMinScore > 1;
    const candidateCount = Math.min(strictQueue ? IA_STRICT_CATALOG_CANDIDATE_MAX : IA_CATALOG_CANDIDATE_MAX, Math.max(count, count * (strictQueue ? 12 : 8)));
    /* Cold channel changes must not wait for every diversity rail. The first
       three queries are the app's fast, subject-locked rails; wide collection
       rescue lanes are deliberately deferred until the fast shelf is sparse.
       This keeps the first playable item on the short path while preserving
       the broader catalog for refill and later rotations. */
    const orderedQueries = uniqueIaQueries(queries, 8);
    /* Once a viewer has consumed the opening shelf, do not let the same
       first rail win every later rotation. Put a deep/collection rail beside
       the primary rail for subsequent turns so a shallow family shelf is
       forced to discover a genuinely different Archive family. */
    const rotationQueries = rotation > 0
      ? uniqueIaQueries([
        orderedQueries[0],
        orderedQueries[Math.min(5, orderedQueries.length - 1)],
        ...orderedQueries.slice(-3),
        ...orderedQueries.slice(1),
      ], 8)
      : orderedQueries;
    const fastLaneCount = rotation > 0
      ? Math.min(iaDepthRecoveryEnabled(channel) ? 4 : 2, rotationQueries.length)
      : iaDepthRecoveryEnabled(channel)
        ? Math.min(4, rotationQueries.length)
        : iaColdRescueEnabled(channel) ? Math.min(2, rotationQueries.length) : IA_FOREGROUND_DISCOVERY_LANES;
    const fastQueries = rotationQueries.slice(0, fastLaneCount);
    /* The first-approved cold race intentionally starts with only the first
       rail. Keep the second fast rail at the front of the reserve list so a
       sparse winner can widen into the app's next approved lane immediately;
       otherwise that rail was launched, observed, and then discarded. */
     const reserveQueries = orderedQueries;
     /* Observed underfill lanes have a verified direct-media shelf. Hand that
        shelf to the foreground immediately and let fresh Archive discovery
        continue in the background; waiting on a known-bad search rail defeats
        the television startup contract. Healthy lanes retain the normal fast
        discovery path. */
     const orderedEmergencySeeds = orderedIaEmergencySeeds(channel, rotation).filter((item) => iaRuntimeAllowed(item, minRuntimeSeconds));
     const directEmergencyStart = iaColdRescueEnabled(channel) && orderedEmergencySeeds.some((item) => item && item.media && item.media.url);
     let payload = directEmergencyStart
       ? {
           channel,
           rotation,
           items: orderedEmergencySeeds,
           candidateItems: orderedEmergencySeeds,
           candidates: orderedEmergencySeeds.length,
           ready: 0,
           partial: true,
           hydrating: false,
           emergency: true,
           deferredContainerExpansion: true,
           minRuntimeSeconds,
         }
       : await buildIaQueue(channel, fastQueries, themeTerms, denyTerms, requiredTitleTerms, mediaTypes, themeMinScore, diversity, candidateCount, url.origin, ctx, rotation, IA_FAST_SEARCH_TIMEOUT_MS, true, true, freshnessLedger.map((entry) => entry.id), minRuntimeSeconds);
    const fallbackQueries = iaFallbackQueries(themeTerms, denyTerms, requiredTitleTerms, mediaTypes);
     if (!payload.items.length || (iaColdRescueEnabled(channel) && payload.items.length < count)) {
      /* A rotated fast rail can be empty even while the channel has approved
         material in its next editorial rail. Give that case one bounded,
         vocabulary-preserving rescue race before returning an empty shelf. */
      /* A rotated page is a freshness hint, not a reliable first-page
         replacement. Sparse Archive queries frequently have a healthy page 1
         and an empty or unplayable page 2/3. Retry the channel's own fast rails
         against page 1 for every rotated cold miss; this stays inside the
         editorial vocabulary and avoids turning freshness into No Signal. */
      const stableRescue = rotation > 0 || IA_STABLE_RESCUE_CHANNELS.has(channel);
      const rescueSource = stableRescue ? fastQueries : reserveQueries;
      const rescueQueries = rescueSource.slice(0, Math.min(2, rescueSource.length)).concat(fallbackQueries.slice(0, 1));
      if (rescueQueries.length) {
        const rescueRotation = stableRescue ? 0 : rotation;
         /* Weak lanes get a bounded race across the two rescue rails. Keep
            container expansion out of this recovery race; episode expansion
            remains background work and cannot delay the first playable URL. */
         const rescue = await buildIaQueue(channel, rescueQueries, themeTerms, denyTerms, requiredTitleTerms, mediaTypes, themeMinScore, diversity, candidateCount, url.origin, ctx, rescueRotation, IA_FAST_SEARCH_TIMEOUT_MS, iaColdRescueEnabled(channel), !iaColdRescueEnabled(channel), freshnessLedger.map((entry) => entry.id), minRuntimeSeconds);
        if (rescue.items.length) payload = mergeIaQueuePayload(payload, rescue, candidateCount, { rescue: true });
      }
    }
    const emergencyDepth = Math.min(candidateCount, Math.max(count, 8));
    const emergencyBank = orderedIaEmergencySeeds(channel, rotation).filter((item) => iaRuntimeAllowed(item, minRuntimeSeconds));
    if (emergencyBank.length && payload.items.length < emergencyDepth) {
      /* A verified shelf keeps the television usable during a true cold-source
         miss or a partially hydrated result. Preserve any approved discovery
         candidates, then append direct, already-observed fallback media so a
         one-item Game Show response cannot become No Signal. Rotate the seed
         order so the emergency path is not a fixed five-item loop, and let the
         normal background discovery replace it with fresher material. */
      const orderedSeeds = emergencyBank;
      const discovered = Array.isArray(payload.items) ? payload.items : [];
      const candidates = discovered.concat(orderedSeeds).slice(0, candidateCount);
      payload = {
        ...payload,
        items: discovered.length ? discovered : orderedSeeds.slice(0, count),
        candidateItems: candidates,
        candidates: candidates.length,
        ready: 0,
        emergency: true,
      };
    }
    /* Freshness is applied before hydration as well as at the response edge,
       so the foreground metadata probes spend their budget on unseen items.
       Do not write the ledger yet: only verified/returned shelf items count as
       issued, and the hydration callback below records those. */
    payload = applyIaFreshness(payload, freshnessLedger, count).payload;
    payload = { ...payload, lastGoodKey };
    /* A first-approved rail may return one to four candidates even when the
       channel has more approved material in its reserve lanes. Start widening
       any sub-five shelf immediately in the background; waiting until the
       first hydrate completes made rotated channels look permanently shallow. */
    const needsExpansion = payload.items.length < count || payload.emergency === true || payload.deferredContainerExpansion === true;
    const deepExpansion = payload.items.length < count || payload.emergency === true || payload.deferredContainerExpansion === true;
    /* Reserve and rescue lanes are valuable for diversity but must never sit
       in front of first tune. Start them as observed background work; the
       first three subject-locked rails below can already hydrate and return a
       verified program. A successful background pass overwrites the short
       partial cache and fills the shared ready shelf for the next request. */
    if (needsExpansion) {
      scheduleIaExpansion(payload, iaBackgroundReserveQueries(channel, reserveQueries, deepExpansion), iaBackgroundFallbackQueries(channel, fallbackQueries, deepExpansion), channel, themeTerms, denyTerms, requiredTitleTerms, mediaTypes, themeMinScore, diversity, count, candidateCount, url.origin, cacheKey, sharedKey, env, ctx, rotation, deepExpansion);
    }
    if (!payload.items.length) {
      /* A cold Archive miss is not a programming decision. If this channel has
         a previously verified shelf, serve it immediately while the next
         request retries discovery. The shelf contains hydrated media URLs and
         has already passed the channel's strict theme/deny contract. */
      const lastGood = await sharedQueueGet(env, lastGoodKey);
      if (lastGood && Array.isArray(lastGood.items) && lastGood.items.length >= count && Number(lastGood.ready) >= count) {
        let fallback = {
          ...rotatePlayableIaShelf(lastGood, rotation, count),
          rotation,
          fallback: true,
          stale: true,
          fallbackRotation: Number(lastGood.rotation) || 0,
          generatedAt: new Date().toISOString(),
        };
        const freshFallback = applyIaFreshness(fallback, freshnessLedger, count);
        fallback = freshFallback.payload;
        rememberIaFreshness(env, channel, freshFallback.issued, ctx);
        const fallbackResponse = cacheableJson(fallback, 5, {
          "X-Afterglow-Source": "program-director-last-good",
          "X-Afterglow-Cache": "shared-last-good",
          "X-Afterglow-Queue-Ready": String(fallback.ready || fallback.items.length),
          "X-Afterglow-Queue-Fallback": "1",
        });
        iaQueueMemoryPut(cacheKey.url, fallback, 5);
        ctx.waitUntil(cache.put(cacheKey, fallbackResponse.clone()).catch((error) => {
          console.warn(JSON.stringify({ event: "last-good-queue-edge-write-failed", channel, message: String(error && error.message || error) }));
        }));
        return fallbackResponse;
      }
      /* No candidate exists yet, so this is not hydration. Be truthful and let
         the client immediately try its direct/search fallbacks, then retry the
         director on its bounded backoff instead of polling a phantom job. */
      return json(
        { ...payload, ready: 0, hydrating: false, empty: true },
        200,
        { "X-Afterglow-Source": "program-director", "X-Afterglow-Queue-Ready": "0" },
      );
    }
    let firstReadyResolve;
    const firstReady = new Promise((resolve) => { firstReadyResolve = resolve; });
    const hydration = hydrateIaQueue(payload, count, url.origin, ctx, mediaTypes, (item, readyCount) => {
      if (!firstReadyResolve) return;
      const resolveFirst = firstReadyResolve;
      firstReadyResolve = null;
      resolveFirst({ ...payload, items: [item], candidates: payload.items.length, ready: readyCount, partial: true, hydrating: true });
    }, iaForegroundHydrationConcurrency(channel));
    /* A cold channel gets one short, bounded chance to receive its first
       verified program. The remaining four may still be resolving; making
       the viewer wait for all five was the source of the apparent dead air.
       The full hydration promise continues under waitUntil and populates the
       edge shelf for the next skip or channel change. */
    let hydrated = await timeboxQueueHydration(Promise.race([hydration, firstReady]), IA_FIRST_READY_TIMEOUT_MS);
    if (!hydrated || !hydrated.items || !hydrated.items.length) {
      /* Discovery can return approved identifiers whose derivatives are
         unavailable even though the lane owns a verified rescue bank. Retry
         that bank once after the normal hydration path has truly produced no
         playable item. This closes the old "metadata exists, video is dead"
         hole without making healthy channels pay a second discovery pass. */
      const rescueItems = orderedIaEmergencySeeds(channel, rotation).filter((item) => item && item.identifier && iaRuntimeAllowed(item, minRuntimeSeconds));
      if (rescueItems.length) {
        const rescuePayload = {
          ...payload,
          items: rescueItems.slice(0, candidateCount),
          candidateItems: rescueItems,
          candidates: rescueItems.length,
          emergency: true,
          hydrating: false,
        };
        const rescueHydration = hydrateIaQueue(rescuePayload, count, url.origin, ctx, mediaTypes, undefined, iaForegroundHydrationConcurrency(channel));
        hydrated = await timeboxQueueHydration(rescueHydration, IA_FIRST_READY_TIMEOUT_MS);
      }
    }
    if (hydrated && hydrated.items.length) {
      const freshHydrated = applyIaFreshness(hydrated, freshnessLedger, count);
      hydrated = freshHydrated.payload;
      rememberIaFreshness(env, channel, freshHydrated.issued, ctx);
      if (hydrated.hydrating) {
        /* Persist the first verified program immediately. The full hydration
           callback below may still be resolving the remaining slots, but a
           channel change can happen before it finishes; seeding last-good here
           closes that race without making the viewer wait. */
        if (hydrated.ready > 0) sharedQueuePut(env, sharedKey, hydrated, IA_PARTIAL_QUEUE_TTL_SECONDS, ctx);
        iaQueueMemoryPut(cacheKey.url, hydrated, 5);
        ctx.waitUntil(
            hydration
            .then((ready) => {
              if (!ready || !ready.items.length) return undefined;
              scheduleIaReplenishment(ready, reserveQueries, fallbackQueries, channel, themeTerms, denyTerms, requiredTitleTerms, mediaTypes, themeMinScore, diversity, count, candidateCount, url.origin, cacheKey, sharedKey, env, ctx, rotation);
              const queueTtl = ready.ready >= count ? IA_QUEUE_TTL_SECONDS : IA_PARTIAL_QUEUE_TTL_SECONDS;
              if (ready.ready > 0) sharedQueuePut(env, sharedKey, ready, queueTtl, ctx);
              return cacheIaQueueIfRicher(cacheKey, ready, queueTtl, {
                "X-Afterglow-Source": "program-director",
                "X-Afterglow-Queue-Ready": String(ready.ready),
              });
            })
            .catch(() => {})
        );
        return cacheableJson(hydrated, 5, {
          "X-Afterglow-Source": "program-director",
          "X-Afterglow-Queue-Ready": String(hydrated.ready),
          "X-Afterglow-Queue-Partial": "1",
        });
      }
      const queueTtl = hydrated.ready >= count ? IA_QUEUE_TTL_SECONDS : IA_PARTIAL_QUEUE_TTL_SECONDS;
      scheduleIaReplenishment(hydrated, reserveQueries, fallbackQueries, channel, themeTerms, denyTerms, requiredTitleTerms, mediaTypes, themeMinScore, diversity, count, candidateCount, url.origin, cacheKey, sharedKey, env, ctx, rotation);
      /* A fresh search can verify one to four programs before its wider refill
         completes. Do not replace an already proven five-show buffer with that
         shallow result: use the rotated full shelf for playback while the new
         rotation continues filling in the background. */
      if (hydrated.ready < count) {
        const underfilledLastGood = await sharedQueueGet(env, lastGoodKey);
        if (underfilledLastGood && Array.isArray(underfilledLastGood.items) && underfilledLastGood.items.length >= count && Number(underfilledLastGood.ready) >= count) {
          let fallback = {
            ...rotatePlayableIaShelf(underfilledLastGood, rotation, count),
            rotation,
            fallback: true,
            stale: true,
            fallbackRotation: Number(underfilledLastGood.rotation) || 0,
            generatedAt: new Date().toISOString(),
          };
          const freshFallback = applyIaFreshness(fallback, freshnessLedger, count);
          fallback = freshFallback.payload;
          rememberIaFreshness(env, channel, freshFallback.issued, ctx);
          const fallbackResponse = cacheableJson(fallback, 5, {
            "X-Afterglow-Source": "program-director-last-good",
            "X-Afterglow-Cache": "shared-last-good",
            "X-Afterglow-Queue-Ready": String(fallback.ready),
            "X-Afterglow-Queue-Fallback": "1",
          });
          iaQueueMemoryPut(cacheKey.url, fallback, 5);
          ctx.waitUntil(cache.put(cacheKey, fallbackResponse.clone()).catch((error) => {
            console.warn(JSON.stringify({ event: "underfilled-last-good-cache-write-failed", channel, message: String(error && error.message || error) }));
          }));
          return fallbackResponse;
        }
      }
      const response = cacheableJson(hydrated, queueTtl, {
        "X-Afterglow-Source": "program-director",
        "X-Afterglow-Queue-Ready": String(hydrated.ready),
      });
      iaQueueMemoryPut(cacheKey.url, hydrated, queueTtl);
      ctx.waitUntil(cache.put(cacheKey, response.clone()).catch((error) => {
        console.warn(JSON.stringify({ event: "queue-cache-write-failed", channel, message: String(error && error.message || error) }));
      }));
      if (hydrated.ready > 0) sharedQueuePut(env, sharedKey, hydrated, queueTtl, ctx);
      return response;
    }
    /* Do not send an empty shelf just because Archive metadata is slow. The
       identifiers have already passed the strict editorial filter, and the
       browser can resolve them directly while the Worker keeps hydrating and
       caching the richer five-program shelf in the background. */
    const lastGood = await sharedQueueGet(env, lastGoodKey);
    if (lastGood && Array.isArray(lastGood.items) && lastGood.items.length >= count && Number(lastGood.ready) >= count) {
      let fallback = {
        ...rotatePlayableIaShelf(lastGood, rotation, count),
        rotation,
        fallback: true,
        stale: true,
        fallbackRotation: Number(lastGood.rotation) || 0,
        generatedAt: new Date().toISOString(),
      };
      const freshFallback = applyIaFreshness(fallback, freshnessLedger, count);
      fallback = freshFallback.payload;
      rememberIaFreshness(env, channel, freshFallback.issued, ctx);
      const fallbackResponse = cacheableJson(fallback, 5, {
        "X-Afterglow-Source": "program-director-last-good",
        "X-Afterglow-Cache": "shared-last-good",
        "X-Afterglow-Queue-Ready": String(fallback.ready || fallback.items.length),
        "X-Afterglow-Queue-Fallback": "1",
      });
      iaQueueMemoryPut(cacheKey.url, fallback, 5);
      ctx.waitUntil(cache.put(cacheKey, fallbackResponse.clone()).catch((error) => {
        console.warn(JSON.stringify({ event: "last-good-queue-edge-write-failed", channel, message: String(error && error.message || error) }));
      }));
      return fallbackResponse;
    }
    const initial = { ...payload, items: payload.items.slice(0, Math.min(count, 3)), ready: 0, partial: true, hydrating: true, fallback: true };
    /* Never edge-cache a zero-ready handoff. It is useful to the current
       browser only as a bounded candidate hint; caching it turns a temporary
       metadata delay into a deterministic no-signal loop for every poll. */
    const initialResponse = json(initial, 200, {
      "Cache-Control": "no-store",
      "X-Afterglow-Source": "program-director",
      "X-Afterglow-Queue-Ready": "0",
      "X-Afterglow-Queue-Fallback": "1",
    });
    ctx.waitUntil(
      hydration
        .then((ready) => {
          if (!ready || !ready.items.length) return undefined;
          scheduleIaReplenishment(ready, reserveQueries, fallbackQueries, channel, themeTerms, denyTerms, requiredTitleTerms, mediaTypes, themeMinScore, diversity, count, candidateCount, url.origin, cacheKey, sharedKey, env, ctx, rotation);
          const queueTtl = ready.ready >= count ? IA_QUEUE_TTL_SECONDS : IA_PARTIAL_QUEUE_TTL_SECONDS;
          if (ready.ready > 0) sharedQueuePut(env, sharedKey, ready, queueTtl, ctx);
          return cacheIaQueueIfRicher(cacheKey, ready, queueTtl, {
            "X-Afterglow-Source": "program-director",
            "X-Afterglow-Queue-Ready": String(ready.ready),
          });
        })
        .catch(() => {})
    );
    return initialResponse;
  } catch {
    return json({ error: "archive queue unavailable" }, 502);
  }
}

async function getKplerSnapshot(request, env, ctx) {
  const url = new URL(request.url);
  const regionName = SHIP_REGIONS[url.searchParams.get("region")] ? url.searchParams.get("region") : "gulf";
  const region = SHIP_REGIONS[regionName];
  const shipDiagnostics = [];
  const cacheKey = new Request(url.origin + SNAPSHOT_PATH + "?v=" + SNAPSHOT_CACHE_VERSION + "&region=" + regionName);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value));
    headers.set("X-Afterglow-Source", "ship-cache");
    return new Response(cached.body, { status: cached.status, headers });
  }

  /* Keep the paid Kpler query bounded to the original Gulf desk. Other named
     regions use the public OpenWaters snapshot and still share the same
     normalized browser contract. */
  if (regionName === "gulf" && env.KPLER_API_KEY) {
    /* Kpler deployments have accepted both the OGC filter and a bbox query
       depending on their AIS gateway revision. Probe only this fixed, bounded
       set for the cached Gulf desk; it prevents a request-shape change from
       blanking the channel without allowing arbitrary upstream parameters. */
    const spatialVariants = [
      { filter: GULF_FILTER },
      { bbox: "-98,18,-80,31" },
      { filter: "BBOX(geometry,-98,18,-80,31)" },
    ];
    for (const spatial of spatialVariants) {
      const query = new URLSearchParams({
        ...spatial,
        format: "json",
        limit: "1000",
        fields: KPLER_FIELDS,
        sortBy: "posDt DESC",
      });
      try {
        const upstream = await fetch(KPLER_URL + "?" + query, {
          headers: {
            "Authorization": "Basic " + env.KPLER_API_KEY,
            "Accept": "application/json",
          },
        });
        if (!upstream.ok) {
          shipDiagnostics.push("kpler-" + Object.keys(spatial)[0] + "-" + upstream.status);
          console.warn(JSON.stringify({ event: "ship-kpler-miss", region: regionName, variant: Object.keys(spatial)[0], status: upstream.status }));
          continue;
        }
        const payload = await upstream.json();
        const features = normalizeShipSnapshot(payload).slice(0, 1000);
        if (!features.length) {
          shipDiagnostics.push("kpler-" + Object.keys(spatial)[0] + "-empty");
          console.warn(JSON.stringify({ event: "ship-kpler-empty", region: regionName, variant: Object.keys(spatial)[0] }));
          continue;
        }
        const response = json({
          source: "kpler",
          fetchedAt: new Date().toISOString(),
          type: "FeatureCollection",
          region: regionName,
          features,
        }, 200, {
          "Cache-Control": "public, max-age=" + SNAPSHOT_TTL_SECONDS,
          "X-Afterglow-Source": "kpler-live",
        });
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      } catch (error) {
        shipDiagnostics.push("kpler-" + Object.keys(spatial)[0] + "-error");
        console.warn(JSON.stringify({ event: "ship-kpler-error", region: regionName, variant: Object.keys(spatial)[0], message: String(error && error.message || error).slice(0, 160) }));
        // Try the next fixed syntax, then continue to the public fallback.
      }
    }
  }

  // Open Waters publishes an open, current GeoJSON snapshot. Normalize its
  // vessel properties to the existing Kpler-shaped client contract so the TV
  // channel can recover without a browser key or a provider-specific redraw.
  try {
    const bboxes = Array.isArray(region.bboxes) ? region.bboxes : [region.bbox];
    const payloads = await Promise.all(bboxes.map(async (bbox) => {
      try {
        const fallback = await fetch(OPEN_WATERS_URL + encodeURIComponent(bbox), {
          headers: { "Accept": "application/geo+json, application/json" },
        });
        if (!fallback.ok) return null;
        return fallback.json();
      } catch {
        return null;
      }
    }));
    const features = spreadShipFeatures(payloads.filter(Boolean).flatMap(normalizeShipSnapshot), regionName === "world" ? 500 : 1000);
    if (!features.length) throw new Error("open waters empty");
    const response = json({
      source: "openwaters",
      fetchedAt: new Date().toISOString(),
      type: "FeatureCollection",
      region: regionName,
      features,
    }, 200, {
      "Cache-Control": "public, max-age=" + SNAPSHOT_TTL_SECONDS,
      "X-Afterglow-Source": "openwaters-live",
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    shipDiagnostics.push("openwaters-error");
    console.warn(JSON.stringify({ event: "ship-openwaters-error", region: regionName, message: String(error && error.message || error).slice(0, 160) }));
    return json({ error: "ship snapshot is temporarily unavailable" }, 502, {
      "X-Afterglow-Ship-Diagnostics": shipDiagnostics.slice(0, 4).join(","),
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method === "GET" && url.pathname === SNAPSHOT_PATH) {
      return getKplerSnapshot(request, env, ctx);
    }

    if (request.method === "GET" && url.pathname === ADSB_PATH) {
      return getAdsbSnapshot(url, ctx);
    }

    if (request.method === "GET" && url.pathname === AIR_PATH) {
      return getAirSnapshot(url, ctx);
    }

    if (request.method === "GET" && url.pathname === RADAR_PATH) {
      return getRadarLoop(url);
    }

    if (request.method === "GET" && url.pathname === TEXAS_HIGHWAY_IMAGE_PATH) {
      return getTexasHighwayImage(url, ctx);
    }

    if (request.method === "GET" && url.pathname === WORLD_CAM_IMAGE_PATH) {
      return getWorldCamImage(url, ctx);
    }

    if (request.method === "GET" && url.pathname === SPACE_PATH) {
      return getSpaceSnapshot(url, ctx);
    }

    if (request.method === "GET" && url.pathname === WATER_PATH) {
      return getWaterSnapshot(url, ctx);
    }

    if (request.method === "GET" && url.pathname === TROPICAL_PATH) {
      return getTropicalSnapshot(url, ctx);
    }

    if (request.method === "GET" && url.pathname === TROPICAL_IMAGE_PATH) {
      return getTropicalImage(url, ctx);
    }

    if (request.method === "GET" && url.pathname === WILDFIRE_PATH) {
      return getWildfireSnapshot(url, ctx);
    }

    if (request.method === "GET" && url.pathname === MARINE_PATH) {
      return getMarineSnapshot(url, ctx);
    }

    if (request.method === "GET" && url.pathname === STORM_CENTER_PATH) {
      return getStormCenterSnapshot(url, ctx);
    }

    if (request.method === "GET" && url.pathname === STORM_CENTER_IMAGE_PATH) {
      return getStormCenterImage(url, ctx);
    }

    if (request.method === "GET" && url.pathname === IA_PREFIX + "/search") {
      return getIaSearch(url, ctx);
    }

    if (request.method === "GET" && url.pathname.startsWith(IA_PREFIX + "/metadata/")) {
      return getIaMetadata(decodeURIComponent(url.pathname.slice((IA_PREFIX + "/metadata/").length)), url, ctx);
    }

    if (request.method === "POST" && (url.pathname === IA_QUEUE_PATH || url.pathname === IA_PROGRAM_PATH)) {
      return getIaQueue(request, url, env, ctx);
    }

    // Anything other than a WebSocket upgrade gets a useful health response.
    const upgrade = (request.headers.get("Upgrade") || "").toLowerCase();
    if (upgrade !== "websocket") {
      return json({
        service: "afterglow-ais-relay",
        stream: Boolean(env.AIS_API_KEY),
        snapshot: Boolean(env.KPLER_API_KEY),
        snapshotPath: SNAPSHOT_PATH,
        shipRegions: Object.keys(SHIP_REGIONS),
        archiveQueuePath: IA_QUEUE_PATH,
        archiveProgramPath: IA_PROGRAM_PATH,
        adsbPath: ADSB_PATH,
        texasHighwayImagePath: TEXAS_HIGHWAY_IMAGE_PATH,
        worldCamImagePath: WORLD_CAM_IMAGE_PATH,
        spacePath: SPACE_PATH,
        waterPath: WATER_PATH,
        tropicalPath: TROPICAL_PATH,
        tropicalImagePath: TROPICAL_IMAGE_PATH,
        wildfirePath: WILDFIRE_PATH,
        marinePath: MARINE_PATH,
        stormCenterPath: STORM_CENTER_PATH,
      });
    }

    if (!env.AIS_API_KEY) {
      return new Response(
        "Worker misconfigured: set AIS_API_KEY secret in the Cloudflare dashboard.",
        { status: 500 }
      );
    }

    // ---- Outbound: connect to aisstream.io ----
    // Cloudflare's outbound-WS pattern: fetch() with Upgrade header, then read
    // the `webSocket` off the response and .accept() it.
    let upstream;
    try {
      const resp = await fetch(AISSTREAM_URL, {
        headers: { Upgrade: "websocket" },
      });
      upstream = resp.webSocket;
      if (!upstream) {
        return new Response("aisstream did not upgrade", { status: 502 });
      }
      upstream.accept();
    } catch (e) {
      return new Response("aisstream connect failed: " + (e && e.message), {
        status: 502,
      });
    }

    // ---- Inbound: accept the browser's WebSocket ----
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    // Track whether we've relayed the first subscribe message. When we see it,
    // inject the API key before forwarding to aisstream.
    let subscribed = false;

    server.addEventListener("message", (ev) => {
      try {
        if (!subscribed) {
          // First message from browser is the subscription config (no key).
          // Inject the key and forward.
          let sub;
          try {
            sub = JSON.parse(ev.data);
          } catch {
            // If they sent non-JSON as first message, just pass through raw —
            // aisstream will reject it and that's the correct signal to the client.
            upstream.send(ev.data);
            subscribed = true;
            return;
          }
          sub.APIKey = env.AIS_API_KEY;
          upstream.send(JSON.stringify(sub));
          subscribed = true;
        } else {
          upstream.send(ev.data);
        }
      } catch (e) {
        // Best-effort forward; on any relay error, close the pair so client
        // sees a clean disconnect instead of a stuck-open silent socket.
        try { server.close(1011, "relay-forward-failed"); } catch {}
        try { upstream.close(); } catch {}
      }
    });

    upstream.addEventListener("message", (ev) => {
      try {
        server.send(ev.data);
      } catch (e) {
        try { upstream.close(); } catch {}
      }
    });

    server.addEventListener("close", () => {
      try { upstream.close(); } catch {}
    });
    upstream.addEventListener("close", () => {
      try { server.close(); } catch {}
    });
    server.addEventListener("error", () => {
      try { upstream.close(); } catch {}
    });
    upstream.addEventListener("error", () => {
      try { server.close(); } catch {}
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  },
};
