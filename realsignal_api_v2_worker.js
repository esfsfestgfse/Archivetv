/* RealSignal Version 2 API.
 *
 * This is a safe parallel entrypoint. The old v1 façade remains in the repo
 * as a rollback reference while V2 adds per-session rotation, background D1
 * catalog writes, and a queue consumer around the proven ais-relay adapter.
 */

import { SessionRotation } from "./realsignal_api_rotation.js";
import { EdgeRateLimiter } from "./realsignal_api_rate_limit.js";
import { RokuSession } from "./realsignal_roku_session.js";
import { mergeSourceLanes, sourceCatalogTasks, sourceProfile, SOURCE_LIMITS } from "./realsignal_source_catalog.js";
import { IA_CANONICAL_PILOT_PROFILES, IA_CANONICAL_SCHEMA_VERSION, canonicalGuide, selectCanonicalItems } from "./ia_canonical_station.mjs";
import { IA_CANONICAL_PILOT_MANIFESTS } from "./ia_canonical_pilot_manifest.js";

const API_PREFIX = "/api/v2";
const V3_PREFIX = "/api/v3";
const V3_RELEASE = "5.5.59-ok-movie-series-exclusion";
const MAX_BODY_BYTES = 128 * 1024;
/* D1 is a rolling catalog, not a second five-item shelf. Persist enough
   verified candidates for three public rotations so API fallback does not
   collapse every IA lane back to the same warm-up set. */
/* Keep a large server-side candidate window. Clients still receive a small
   playable shelf, but discovery and rotation are no longer trapped inside the
   same five rows at every cold start. */
const MAX_CATALOG_ITEMS = 96;
/* Keep the recent exclusion window large enough to prevent opening repeats,
   but bounded so a smaller verified catalog can still produce the full
   five-item shelf on a cold rotation. A 32-item window left lane 915 with
   only four unseen rows from its 36-item catalog. */
const FRESHNESS_LEDGER_LIMIT = 20;
const FRESHNESS_CACHE_TTL_MS = 15_000;
const MAX_SESSION = 80;
/* Only the lane proven to return a four-item cold shelf gets a bounded
   post-rotation refill. Healthy channels keep the one-pass fast path. */
const IA_ROTATION_REFILL_LANES = new Set(["915"]);
/* These lanes were repeatedly slow even when D1 already held verified
   playback rows. Serve the catalog first for them; relay discovery remains
   the background repair path when D1 has no usable row. */
/* V3 telemetry can promote a lane here only after production evidence shows
   repeated fallback/slow switching while D1 already has verified media. */
const IA_FAST_CATALOG_LANES = new Set([
  /* Verified D1 shelves keep cold tunes off the shared Archive burst path. */
  "10", "11", "12", "56", "64", "69", "76", "110", "150", "154", "158", "205", "222", "231", "922",
  /* These three relay-owned sports/automotive lanes passed availability but
     reopened the same shelf after rotation. Stable D1 ordering gives the
     session ledger a fixed union to walk instead of a moving relay window. */
  /* Holiday lanes have verified instant shelves but some still need a
     background relay refresh to grow beyond their shallow D1 catalog. */
  "705", "706", "707", "708", "709",
  /* 4.1.208 targeted freshness repair: the clean 179-lane soak found these
     lanes reopening the same relay shelf even though D1 already contains a
     verified catalog. Keep the repair local: full-catalog rotation is used
     only for measured repeat-heavy lanes, while the relay remains the
     discovery path for every other channel. */
  "13", "19", "21", "54", "67", "70", "71", "73", "78", "83",
  "105", "109", "112", "114", "125", "129", "130", "131", "152", "156",
  "201", "226", "242", "501", "502", "508", "900", "901", "912", "926",
]);
/* These seasonal lanes have title-verified recovery shelves. Some older D1
   rows predate subject persistence, so a clearly seasonal title must remain
   eligible even when its stored subject is blank. The title gate is still
   mandatory; this does not relax generic IA fallback globally. */
const IA_HOLIDAY_TITLE_LANES = new Set(["704", "705", "706", "707", "708", "709"]);
const IA_CANONICAL_PILOT_VALUES = new Set(["1", "true", "on", "pilot"]);
const IA_CANONICAL_SHADOW_VALUES = new Set(["1", "true", "on", "shadow"]);
/* Keep the first real-client rollout intentionally small. The V2 session
   catalog is proven in hosted requests for these lanes, but remains opt-in
   until visible playback and guide behavior are measured in the app. */
/* The isolated Worker is now the full-backend certification target. Keep the
   browser client on its smaller 19-lane opt-in until this full low-concurrency
   soak passes; this lets us certify every IA lane without exposing production
   users to an unproven client rollout. */
const IA_SESSION_CATALOG_CANARY_CHANNELS = new Set([
  "2", "3", "10", "11", "12", "13", "14", "15", "17", "18", "19", "20", "21",
  "51", "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63",
  "64", "65", "66", "67", "68", "69", "70", "71", "72", "73", "74", "75", "76",
  "77", "78", "79", "80", "81", "82", "83", "100", "101", "102", "103", "104",
  "105", "106", "107", "108", "109", "110", "111", "112", "113", "114", "115",
  "116", "117", "118", "119", "120", "121", "122", "123", "124", "125", "126",
  "127", "128", "129", "130", "131", "132", "133", "134", "150", "151", "152",
  "153", "154", "155", "156", "157", "158", "200", "201", "202", "203", "204",
  "205", "206", "208", "209", "210", "211", "212", "213", "214", "215", "216",
  "217", "219", "220", "222", "223", "224", "225", "226", "227", "228", "229",
  "230", "231", "232", "233", "234", "235", "236", "237", "238", "239", "240",
  "241", "242", "500", "501", "502", "507", "508", "509", "510", "511", "575",
  "700", "701", "702", "703", "704", "705", "706", "707", "708", "709", "900",
  "901", "902", "903", "904", "905", "906", "907", "908", "909", "910", "911",
  "912", "913", "914", "915", "916", "917", "918", "919", "920", "921", "922",
  "923", "926", "927", "928", "929",
]);
const IA_CANONICAL_PROFILE_BY_CHANNEL = new Map(Object.values(IA_CANONICAL_PILOT_PROFILES).map((profile) => [String(profile.channel), profile.profileKey]));
/* A relay response can be playable while still being too shallow for a
   rolling television catalog. Enrich any IA lane below the three-shelf floor
   from D1; a healthy relay response that already carries enough candidates
   keeps the fastest handoff and does not pay for the read. */
const IA_MIN_ROLLING_CATALOG_DEPTH = 15;
/* These lanes additionally need stale-row re-scoring because their measured
   D1 history contained old genreVerified flags from before the current rules. */
const IA_DEPTH_REPAIR_LANES = new Set([
  "15", "18", "21", "114", "200", "203", "214", "501", "502", "507", "704", "705", "706", "921",
  /* v4.1.156 freshness audit: these lanes still had stale D1 rows that were
     admitted by an old genreVerified flag even when the current profile would
     reject them. Re-score them before fallback/guide selection while the
     relay's verified file banks refill the catalog. */
  "3", "11", "20", "66", "81", "118", "212", "500", "902", "905", "906", "907", "914", "929",
]);
/* The six lanes repaired from live Archive family manifests must not let an
   older D1 shelf mask the new file-level rail. The relay remains the fast,
   verified source of truth for these lanes while the complete union is
   persisted back to D1 asynchronously through the normal catalog job. */
const IA_ARCHIVE_FAMILY_DEPTH_LANES = new Set(["11", "20", "81", "118", "914", "929"]);
/* Some IA collections store the genre in the series/film title rather than
   the child filename. These are deliberately lane-specific aliases for the
   two long-tail lanes that failed the serial certification when their relay
   response was empty; they are not a global relaxation of genre filtering. */
const IA_FALLBACK_ALIASES = Object.freeze({
  "116": Object.freeze(["black charley", "fight for your life", "abby", "brother from another planet", "fighting mad", "foxy brown", "trouble man", "lord shango", "cleopatra jones", "black fist", "human tornado"]),
  "123": Object.freeze(["man in room 17", "world at war", "keeping up appearances", "jason king", "viz", "tomorrow's world", "roger mellie", "garth marenghi", "darkplace", "bbc", "british"]),
});
/* Targeted requalification for two lanes exposed by the expanded canary.
   These are positive editorial gates, not a global relaxation: a persisted
   row must still carry the lane's subject/title signal before it can reach the
   rolling shelf. */
const IA_STRICT_TOPIC_LANES = new Map([
  ["20", ["judge show", "court show", "people's court", "divorce court", "judge judy", "judge wapner", "judge mathis", "judge joe brown", "small claims court", "civil court", "television judge show"]],
]);
const IA_STRICT_TOPIC_EXCLUSIONS = new Map([
  ["20", ["disney", "big bands", "hammer hand", "hammerhand", "mgtow", "men's rights", "gender wars"]],
]);
const IA_ENGLISH_FOCUS_LANES = new Set(["11"]);
const IA_NON_ENGLISH_SIGNAL_TERMS = [
  "hindi", "indian", "mahabharat", "bhagwan", "tamil", "telugu", "bengali", "bangla", "marathi", "malayalam", "kannada", "punjabi", "urdu", "arabic", "spanish", "portuguese", "french", "german", "russian", "turkish", "korean", "japanese", "mandarin",
];
const YOUTUBE_SPORT_HANDLES = new Set([
  "NFL", "NCAAFootball", "NBA", "marchmadness", "MLB", "NHL", "wnba", "NCAA",
  "premierleague", "MLS", "FIFA", "lolesports", "iccmedia", "WorldRugby", "aflcomau",
  "UCI_Cycling", "Formula1", "NASCAR", "IndyCar", "FormulaE", "motogp", "ufc",
  "BellatorMMA", "ONEChampionship", "toprank", "PGATOUR", "LPGATOUR", "tennistv",
  "WTA", "PDCTV", "WorldSnooker",
]);
const YOUTUBE_TIMEOUT_MS = 6500;
const RATE_LIMITS = Object.freeze({
  /* A viewer can move through a large Source Suite without the edge guard
     mistaking normal tuning for abuse. Provider work is still deduplicated
     below and the upstream adapters remain bounded. */
  "source-catalog": Object.freeze({ windowMs: 60_000, max: 60 }),
  /* Queue traffic includes guide refreshes, fast channel surfing, and the
     certification sweep. Keep the guard, but do not let a normal burst of
     channel changes turn into a false empty shelf. Provider adapters remain
     separately bounded below. */
  queue: Object.freeze({ windowMs: 60_000, max: 240 }),
  "youtube-uploads": Object.freeze({ windowMs: 60_000, max: 30 }),
  /* Roku sessions are opt-in control traffic. Keep a generous bounded guard
     so a broken remote cannot turn polling into an unbounded Worker bill. */
  "roku-session": Object.freeze({ windowMs: 60_000, max: 180 }),
});
/* This is a small edge guard, not durable product state. It absorbs accidental
   provider-triggering bursts in each Worker isolate while durable channel
   rotation remains independent. */
const requestBuckets = new Map();
const freshnessReadCache = new Map();
const shallowCatalogRefreshCache = new Map();
const sourceRefreshCache = new Map();

function corsHeaders(contentType = "application/json; charset=utf-8") {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-RealSignal-Client, X-RealSignal-Session",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Expose-Headers": "X-RealSignal-API, X-RealSignal-Release, X-RealSignal-Request, X-RealSignal-Source, X-RealSignal-Queue",
    "Content-Type": contentType,
    "X-RealSignal-API": "v2",
  };
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(), ...extra } });
}

/* Only cache GET responses whose body is independent of a viewer session.
   Playback shelves and freshness writes stay out of this helper; those are
   stateful and must never be shared between viewers. */
async function edgeJson(request, ctx, body, status = 200, extra = {}, ttlSeconds = 0) {
  const canCache = request && request.method === "GET" && status === 200 && ttlSeconds > 0
    && typeof caches !== "undefined" && caches.default && ctx && typeof ctx.waitUntil === "function";
  if (!canCache) return json(body, status, extra);
  const cacheKey = new Request(new URL(request.url).toString(), { method: "GET" });
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set("X-RealSignal-Cache", "hit");
    return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
  }
  const headers = {
    ...extra,
    "Cache-Control": extra["Cache-Control"] || `public, max-age=${ttlSeconds}, stale-while-revalidate=${Math.max(ttlSeconds * 4, 30)}`,
    "X-RealSignal-Cache": "miss",
  };
  const response = json(body, status, headers);
  ctx.waitUntil(caches.default.put(cacheKey, response.clone()).catch((error) => {
    console.warn(JSON.stringify({ event: "edge-cache-write-failed", error: String(error).slice(0, 160) }));
  }));
  return response;
}

function requestId() { return crypto.randomUUID(); }

function safeSession(value) {
  const normalized = String(value || "anonymous").replace(/[^a-zA-Z0-9._:-]/g, "_").slice(0, MAX_SESSION);
  return normalized || "anonymous";
}

function requestClientKey(request) {
  const forwarded = String(request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "").split(",")[0].trim();
  return (forwarded || "anonymous").slice(0, 96);
}

function rateLimit(request, kind) {
  const limit = RATE_LIMITS[kind];
  if (!limit) return null;
  const now = Date.now();
  const key = `${kind}:${requestClientKey(request)}`;
  let bucket = requestBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= limit.windowMs) bucket = { startedAt: now, count: 0 };
  bucket.count += 1;
  requestBuckets.set(key, bucket);
  if (requestBuckets.size > 2048) {
    for (const [candidate, value] of requestBuckets) if (now - value.startedAt >= limit.windowMs) requestBuckets.delete(candidate);
    while (requestBuckets.size > 2048) requestBuckets.delete(requestBuckets.keys().next().value);
  }
  if (bucket.count <= limit.max) return null;
  const retryAfter = Math.max(1, Math.ceil((bucket.startedAt + limit.windowMs - now) / 1000));
  return json({ error: "request rate limit exceeded", requestId: requestId(), retryAfterSeconds: retryAfter }, 429, { "Cache-Control": "no-store", "Retry-After": String(retryAfter) });
}

async function durableRateLimit(request, env, kind) {
  const limit = RATE_LIMITS[kind];
  if (!limit || !env.RATE_LIMITER || typeof env.RATE_LIMITER.getByName !== "function") return rateLimit(request, kind);
  const client = requestClientKey(request);
  const bucketKey = `${kind}:${client}`.slice(0, 240);
  try {
    const stub = env.RATE_LIMITER.getByName(bucketKey);
    const response = await stub.fetch("https://realsignal.invalid/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bucketKey: kind, windowMs: limit.windowMs, max: limit.max }),
    });
    if (response.status !== 429) return null;
    const payload = await response.json().catch(() => ({}));
    return json({ error: "request rate limit exceeded", requestId: requestId(), retryAfterSeconds: Number(payload.retryAfterSeconds || 1) }, 429, { "Cache-Control": "no-store", "Retry-After": String(payload.retryAfterSeconds || 1) });
  } catch (error) {
    /* A limiter outage must not take the television off the air. Fall back to
       the bounded isolate guard and record the degradation for telemetry. */
    console.warn(JSON.stringify({ event: "durable-rate-limit-fallback", kind, error: String(error).slice(0, 160) }));
    return rateLimit(request, kind);
  }
}

function routeFor(pathname) {
  for (const [prefix, apiVersion] of [[API_PREFIX, "v2"], [V3_PREFIX, "v3"]]) {
    if (pathname === `${prefix}/health`) return { kind: "health", apiVersion };
    if (pathname === `${prefix}/youtube/uploads`) return { kind: "youtube-uploads", apiVersion };
    if (pathname === `${prefix}/telemetry`) return { kind: "telemetry", apiVersion };
    if (pathname === `${prefix}/health/channels`) return { kind: "channel-health", apiVersion };
    if (pathname === `${prefix}/health/summary`) return { kind: "health-summary", apiVersion };
    if (pathname === `${prefix}/guide`) return { kind: "guide", apiVersion };
    if (pathname === `${prefix}/ia/queue` || pathname === `${prefix}/ia/program`) return { kind: "queue", apiVersion, prefix };
    if (apiVersion === "v3" && pathname === `${prefix}/ia/canonical/shadow`) return { kind: "canonical-shadow", apiVersion };
    if (pathname === `${prefix}/ia/search`) return { kind: "relay", relayPath: "/ia/search", apiVersion };
    if (pathname.startsWith(`${prefix}/ia/metadata/`)) {
      const id = pathname.slice(`${prefix}/ia/metadata/`.length);
      return id ? { kind: "relay", relayPath: `/ia/metadata/${id}`, apiVersion } : null;
    }
    if (pathname === `${prefix}/source/catalog`) return { kind: "source-catalog", apiVersion };
    if (pathname === `${prefix}/source/status`) return { kind: "source-status", apiVersion };
    if (pathname === `${prefix}/catalog`) return { kind: "catalog", apiVersion };
    if (apiVersion === "v3" && pathname === `${prefix}/roku/session`) return { kind: "roku-session", apiVersion };
  }
  return null;
}

function makeRokuPairingCode() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
}

function rokuResponse(response, id) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(headers.get("content-type") || "application/json; charset=utf-8"))) headers.set(key, value);
  headers.set("Cache-Control", "no-store");
  headers.set("X-RealSignal-API", "v3");
  headers.set("X-RealSignal-Request", id);
  headers.set("X-RealSignal-Source", "roku-session");
  headers.set("X-RealSignal-Release", V3_RELEASE);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function handleRokuSession(request, env, ctx, id) {
  if (!env.ROKU_SESSION || typeof env.ROKU_SESSION.getByName !== "function") {
    return json({ error: "Roku preview is not configured", requestId: id }, 503, { "Cache-Control": "no-store", "X-RealSignal-Release": V3_RELEASE });
  }
  const url = new URL(request.url);
  if (request.method === "GET") {
    const code = String(url.searchParams.get("code") || request.headers.get("X-RealSignal-Roku-Code") || "").trim().slice(0, 96);
    if (!code) return json({ error: "Roku session code is required", requestId: id }, 400, { "Cache-Control": "no-store", "X-RealSignal-Release": V3_RELEASE });
    const stub = env.ROKU_SESSION.getByName(`roku:${safeSession(code)}`);
    const response = await stub.fetch(new Request(`https://roku.internal/session?code=${encodeURIComponent(code)}&since=${encodeURIComponent(url.searchParams.get("since") || "0")}`, { method: "GET", headers: { "X-RealSignal-Roku-Code": code } }));
    return rokuResponse(response, id);
  }
  if (request.method !== "POST") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "GET,POST,OPTIONS" });
  let body;
  try { body = await readBoundedJson(request); }
  catch (error) { return json({ error: error instanceof RangeError ? error.message : "invalid JSON body", requestId: id }, 400, { "Cache-Control": "no-store", "X-RealSignal-Release": V3_RELEASE }); }
  const action = String(body && body.action || "").trim().toLowerCase();
  if (action === "create") {
    const code = makeRokuPairingCode();
    const stub = env.ROKU_SESSION.getByName(`roku:${safeSession(code)}`);
    const init = await stub.fetch(new Request(`https://roku.internal/session?code=${encodeURIComponent(code)}&action=init`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-RealSignal-Roku-Code": code },
      body: JSON.stringify({ action: "init", code, state: body.state || {} }),
    }));
    if (!init.ok) return rokuResponse(init, id);
    const payload = await init.json().catch(() => ({}));
    return json({ ...payload, pairingCode: code, endpoint: `${url.origin}/api/v3/roku/session`, expiresAt: payload.expiresAt, receiverProtocol: "opt-in-session-v1", requestId: id }, 201, { "Cache-Control": "no-store", "X-RealSignal-Release": V3_RELEASE, "X-RealSignal-Source": "roku-session" });
  }
  const code = String(body && body.code || url.searchParams.get("code") || request.headers.get("X-RealSignal-Roku-Code") || "").trim().slice(0, 96);
  if (!code) return json({ error: "Roku session code is required", requestId: id }, 400, { "Cache-Control": "no-store", "X-RealSignal-Release": V3_RELEASE });
  const stub = env.ROKU_SESSION.getByName(`roku:${safeSession(code)}`);
  const response = await stub.fetch(new Request(`https://roku.internal/session?code=${encodeURIComponent(code)}`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-RealSignal-Roku-Code": code },
    body: JSON.stringify({ ...body, code }),
  }));
  return rokuResponse(response, id);
}

async function fetchYouTubeJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), YOUTUBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`YouTube ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function handleYouTubeUploads(request, env, id) {
  const handle = new URL(request.url).searchParams.get("handle") || "";
  if (!YOUTUBE_SPORT_HANDLES.has(handle)) return json({ error: "YouTube channel is not approved", requestId: id }, 404);
  if (!env.YOUTUBE_API_KEY) return json({ error: "YouTube provider is not configured", requestId: id }, 503, { "Cache-Control": "no-store" });
  try {
    const key = encodeURIComponent(env.YOUTUBE_API_KEY);
    const channel = await fetchYouTubeJson(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails&forHandle=${encodeURIComponent(handle)}&key=${key}`);
    const playlistId = channel && channel.items && channel.items[0] && channel.items[0].contentDetails && channel.items[0].contentDetails.relatedPlaylists && channel.items[0].contentDetails.relatedPlaylists.uploads;
    if (!playlistId) return json({ handle, items: [], requestId: id }, 200, { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" });
    const uploads = await fetchYouTubeJson(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=12&key=${key}`);
    return json({ handle, playlistId, items: uploads && Array.isArray(uploads.items) ? uploads.items : [], requestId: id }, 200, { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" });
  } catch (error) {
    console.warn(JSON.stringify({ event: "youtube-sports-fetch-failed", requestId: id, handle, error: String(error).slice(0, 160) }));
    return json({ error: "YouTube provider temporarily unavailable", requestId: id }, 503, { "Cache-Control": "no-store" });
  }
}

async function readBoundedJson(request) {
  const advertised = Number(request.headers.get("content-length") || 0);
  if (advertised > MAX_BODY_BYTES) throw new RangeError("request body exceeds 128 KiB");
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_BODY_BYTES) {
        try { await reader.cancel(); } catch (_) { /* best effort */ }
        throw new RangeError("request body exceeds 128 KiB");
      }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch (_) { throw new SyntaxError("invalid JSON body"); }
}

function relayRequest(request, relayPath, body) {
  const source = new URL(request.url);
  const target = new URL(`https://relay.internal${relayPath}`);
  target.search = source.search;
  const headers = new Headers({ "content-type": "application/json" });
  const client = request.headers.get("x-realsignal-client");
  if (client) headers.set("x-realsignal-client", client.slice(0, 80));
  return new Request(target, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function forwardToRelay(request, env, relayPath, body, id) {
  if (!env.RELAY || typeof env.RELAY.fetch !== "function") return json({ error: "relay binding is not configured", requestId: id }, 503, { "Cache-Control": "no-store" });
  try {
    const upstream = await env.RELAY.fetch(relayRequest(request, relayPath, body));
    const headers = new Headers(upstream.headers);
    for (const [key, value] of Object.entries(corsHeaders(headers.get("content-type") || "application/json; charset=utf-8"))) headers.set(key, value);
    headers.set("X-RealSignal-API", "v2");
    headers.set("X-RealSignal-Request", id);
    headers.set("X-RealSignal-Source", "ais-relay");
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    console.error(JSON.stringify({ event: "v2-relay-forward-failed", requestId: id, route: relayPath, error: String(error).slice(0, 180) }));
    return json({ error: "relay temporarily unavailable", requestId: id }, 503, { "Cache-Control": "no-store" });
  }
}

function compactCatalogItem(item) {
  const id = String(item && (item.identifier || item.id || (item.media && item.media.url)) || "").slice(0, 500);
  if (!id) return null;
  const provider = String(item.provider || item.source || "internet-archive").slice(0, 60);
  return {
    id,
    provider,
    sourceIdentifier: String(item.sourceIdentifier || item.identifier || id).slice(0, 500),
    title: String(item.title || "Untitled").slice(0, 500),
    description: String(item.description || "").slice(0, 2000),
    subject: String(item.subject || item.subjects || "").slice(0, 1200),
    tags: String(item.tags || "").slice(0, 1200),
    category: String(item.category || "").slice(0, 240),
    account: String(item.account || "").slice(0, 240),
    query: String(item.query || "").slice(0, 240),
    duration: Number(item.duration || item.runtime) || null,
    durationUnit: provider === "OK.ru" ? "seconds" : "",
    aspectRatio: Number(item.aspectRatio) || null,
    mediaType: String((item.media && item.media.type) || item.type || "video").slice(0, 30),
    mediaUrl: String((item.media && item.media.url) || item.url || "").slice(0, 1500),
    sourceUrl: String(item.sourceUrl || "").slice(0, 1500),
    rights: String(item.rights || "").slice(0, 300),
    year: String(item.year || "").slice(0, 20),
    genreVerified: item.genreVerified === true,
    recoveryVerified: item.recoveryVerified === true,
  };
}

function queueItemKey(item) {
  return String(item && (item.identifier || item.id || (item.media && item.media.url) || item.url) || "").trim();
}

function queueItemPlayable(item) {
  return Boolean(item && String((item.media && item.media.url) || item.mediaUrl || item.url || "").trim());
}

/* IA file records can differ only by container/bitrate suffix. Treat those
   encodings as one catalog program at the API boundary too, otherwise the
   relay's deep bank is widened and then immediately made shallow again by
   the adapter's exact-ID merge. */
function queueItemIdentity(item) {
  const raw = queueItemKey(item);
  if (!raw) return "";
  const source = String(item && (item.sourceIdentifier || item.source_identifier) || (raw.includes("::") ? raw.split("::")[0] : raw)).trim().toLowerCase();
  const file = String(item && item.fileName || (raw.includes("::") ? raw.slice(raw.indexOf("::") + 2) : "")).trim().toLowerCase();
  if (!file) return source;
  const stem = file
    .replace(/\.(?:mp4|m4v|mov|ogv|webm|mp3|flac|ogg|oga|wav|m4a|aac)(?:[?#].*)?$/i, "")
    .replace(/(?:[._-](?:orig|original|source|512kb|256kb|128kb|64kb|low|small|preview|proxy))$/i, "");
  return `${source}::${stem}`;
}

function uniqueQueueItems(items, body, limit = MAX_CATALOG_ITEMS) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = queueItemIdentity(item);
    if (!key || seen.has(key) || !catalogFallbackAllowed(item, body)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  /* Collection expansion produces a parent index plus direct child files.
     Once a child is present, the parent is not another program and must not
     consume a freshness slot or make the next rotation look repetitive. */
  const expandedSources = new Set(out
    .filter((item) => queueItemKey(item).includes("::"))
    .map((item) => String(item && (item.sourceIdentifier || item.source_identifier || queueItemKey(item).split("::")[0]) || "").trim())
    .filter(Boolean));
  return out.filter((item) => {
    const id = queueItemKey(item);
    const source = String(item && (item.sourceIdentifier || item.source_identifier || id) || "").trim();
    return !(id === source && expandedSources.has(source));
  });
}

function stableCatalogItems(items, body, limit = MAX_CATALOG_ITEMS) {
  const unique = uniqueQueueItems(items, body, limit);
  return unique.sort((left, right) => {
    const leftKey = queueItemIdentity(left);
    const rightKey = queueItemIdentity(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

/* `items` is the on-air shelf, not the catalog. A relay recovery can carry
   dozens of verified candidates in the same response, but exposing all of
   them as `items` makes clients refill from the catalog head and repeat the
   same opening programs. Keep the deep union in `candidateItems` while
   enforcing the small, predictable playback contract at the API edge. */
function limitPublicIaShelf(payload, count) {
  if (!payload || typeof payload !== "object") return payload;
  const requested = Math.max(1, Math.min(5, Number(count) || 3));
  const items = Array.isArray(payload.items) ? payload.items.slice(0, requested) : [];
  const rawReady = Number(payload.ready);
  const ready = Number.isFinite(rawReady)
    ? Math.min(requested, Math.max(0, rawReady), items.length)
    : items.length;
  return { ...payload, items, ready };
}

function catalogJob(body, payload) {
  const sourceItems = Array.isArray(payload && payload.candidateItems) && payload.candidateItems.length
    ? payload.candidateItems
    : (Array.isArray(payload && payload.items) ? payload.items : []);
  const items = uniqueQueueItems(sourceItems, body).map(compactCatalogItem).filter(Boolean);
  if (!items.length) return null;
  return {
    type: "catalog-upsert",
    channelKey: String(body.channel || "unknown").slice(0, 120),
    rules: {
      themeTerms: Array.isArray(body.themeTerms) ? body.themeTerms.slice(0, 40).map(String) : [],
      denyTerms: Array.isArray(body.denyTerms) ? body.denyTerms.slice(0, 40).map(String) : [],
      mediaTypes: Array.isArray(body.mediaTypes) ? body.mediaTypes.slice(0, 5).map(String) : [],
    },
    items,
    queuedAt: Date.now(),
  };
}

async function enqueueCatalog(env, body, payload) {
  if (!env.realsignal_catalog_refresh || typeof env.realsignal_catalog_refresh.send !== "function") return;
  const job = catalogJob(body, payload);
  if (!job) return;
  try { await env.realsignal_catalog_refresh.send(job, { contentType: "json" }); }
  catch (error) { console.warn(JSON.stringify({ event: "catalog-job-not-queued", error: String(error).slice(0, 160) })); }
}

function shouldRefreshShallowCatalog(channel) {
  const key = normalizedChannelKey(channel);
  if (!key) return false;
  const now = Date.now();
  const last = Number(shallowCatalogRefreshCache.get(key) || 0);
  if (now - last < 30_000) return false;
  shallowCatalogRefreshCache.set(key, now);
  return true;
}

async function refreshShallowCatalog(env, request, body, id, currentDepth) {
  if (!env.RELAY || typeof env.RELAY.fetch !== "function") return;
  if ((!env.realsignal_catalog_refresh || typeof env.realsignal_catalog_refresh.send !== "function") && (!env.realsignal_catalog || typeof env.realsignal_catalog.batch !== "function")) return;
  if (Number(currentDepth) >= IA_MIN_ROLLING_CATALOG_DEPTH) return;
  /* The foreground request only needs a playable five-item shelf. The
     background repair must ask the adapter for the larger catalog, use a
     different rotation seed, and ignore recent-play exclusions while writing
     the durable catalog. Otherwise the freshness ledger can accidentally
     prevent the very unseen candidates we need to persist. */
  const refreshBody = {
    ...body,
    count: MAX_CATALOG_ITEMS,
    rotation: (Number(body.rotation) || 0) + Math.max(17, IA_MIN_ROLLING_CATALOG_DEPTH),
    recentIds: [],
    freshnessLedger: false,
  };
  delete refreshBody.sessionId;
  delete refreshBody.session;
  try {
    const upstream = await forwardToRelay(request, env, "/ia/queue", refreshBody, id);
    if (!upstream.ok) return;
    const payload = await upstream.json();
    const sourceItems = Array.isArray(payload && payload.candidateItems) && payload.candidateItems.length
      ? payload.candidateItems
      : (Array.isArray(payload && payload.items) ? payload.items : []);
    const items = uniqueQueueItems(sourceItems, refreshBody, MAX_CATALOG_ITEMS);
    if (items.length <= Number(currentDepth)) return;
    const job = catalogJob(refreshBody, { ...payload, items, candidateItems: items });
    if (!job) return;
    /* A shallow fast lane must become deeper even when the refresh queue is
       delayed or temporarily unavailable. Persist the already-verified relay
       union in the same waitUntil task; the foreground tune still returns
       from D1 immediately, while the next tune sees the expanded shelf. */
    if (IA_FAST_CATALOG_LANES.has(String(body.channel)) && env.realsignal_catalog && typeof env.realsignal_catalog.batch === "function") {
      await upsertCatalogJob(env, job);
    } else {
      await enqueueCatalog(env, refreshBody, { ...payload, items, candidateItems: items });
    }
  } catch (error) {
    console.warn(JSON.stringify({ event: "shallow-catalog-refresh-failed", requestId: id, channel: String(body.channel), error: String(error).slice(0, 160) }));
  }
}

async function upsertCatalogJob(env, job) {
  if (!env.realsignal_catalog || typeof env.realsignal_catalog.batch !== "function" || !job || !Array.isArray(job.items)) return;
  const now = Date.now();
  const statements = [];
  for (const item of job.items.slice(0, MAX_CATALOG_ITEMS)) {
    statements.push(env.realsignal_catalog.prepare(`INSERT INTO programs (id, provider, source_identifier, title, description, duration_seconds, aspect_ratio, media_type, media_url, source_url, rights, year, metadata_json, first_seen_at, last_seen_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active') ON CONFLICT(id) DO UPDATE SET provider=excluded.provider, source_identifier=excluded.source_identifier, title=excluded.title, description=excluded.description, duration_seconds=excluded.duration_seconds, aspect_ratio=excluded.aspect_ratio, media_type=excluded.media_type, media_url=excluded.media_url, source_url=excluded.source_url, rights=excluded.rights, year=excluded.year, last_seen_at=excluded.last_seen_at, status='active'`).bind(item.id, item.provider, item.sourceIdentifier, item.title, item.description, item.duration, item.aspectRatio, item.mediaType, item.mediaUrl, item.sourceUrl, item.rights, item.year, JSON.stringify(item), now, now));
    statements.push(env.realsignal_catalog.prepare(`INSERT INTO channel_programs (channel_key, program_id, score, last_seen_at) VALUES (?, ?, ?, ?) ON CONFLICT(channel_key, program_id) DO UPDATE SET score=excluded.score, last_seen_at=excluded.last_seen_at`).bind(job.channelKey, item.id, 0, now));
  }
  if (job.rules) statements.push(env.realsignal_catalog.prepare(`INSERT INTO channel_rules (channel_key, rules_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(channel_key) DO UPDATE SET rules_json=excluded.rules_json, updated_at=excluded.updated_at`).bind(job.channelKey, JSON.stringify(job.rules), now));
  if (statements.length) await env.realsignal_catalog.batch(statements);
}

async function rotateShelf(env, body, payload, request) {
  if (!env.ROTATION || typeof env.ROTATION.getByName !== "function") return { payload, rotation: { configured: false } };
  const sessionHeader = request && request.headers ? request.headers.get("x-realsignal-session") : "";
  const session = safeSession(body.sessionId || body.session || sessionHeader || `ip-${requestClientKey(request)}`);
  const channel = safeSession(body.channel || "unknown");
  const stub = env.ROTATION.getByName(`session:${session}:channel:${channel}`);
  const rawCandidates = Array.isArray(payload && payload.candidateItems) && payload.candidateItems.length
    ? payload.candidateItems
    : ((payload && payload.items) || []);
  const candidates = uniqueQueueItems(rawCandidates, body);
  const count = Math.max(1, Math.min(5, Number(body.count) || 3));
  /* Freshness is bounded by the available catalog. Excluding a recent window
     larger than catalog size minus the requested shelf can leave the DO with
     four unseen rows from a 21-item catalog. Reserve the full shelf first,
     then apply the remaining recent history. */
  const recentValues = Array.from(recentCatalogIds(body));
  const recentLimit = candidates.length >= count ? Math.max(0, candidates.length - count) : recentValues.length;
  const boundedRecentIds = freshnessExclusionIds(body, recentLimit);
  const response = await stub.fetch(new Request("https://rotation.internal/select", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: candidates, recentIds: boundedRecentIds, count, rotation: Number(body.rotation) || 0 }) }));
  if (!response.ok) throw new Error(`rotation ${response.status}`);
  const selected = await response.json();
  const upstreamReady = Number.isFinite(Number(payload.ready)) ? Number(payload.ready) : (Array.isArray(payload.items) ? payload.items.length : 0);
  /* Keep these as live references. A repeated shelf can trigger the bounded
     same-DO retry below; the response must carry the retry's fresh items,
     catalog, and readiness rather than the stale pre-retry snapshot. */
  let selectedItems = Array.isArray(selected.items) ? selected.items : [];
  let selectedCatalog = Array.isArray(selected.catalog) && selected.catalog.length ? selected.catalog : candidates;
  /* A loaded catalog must never return a previously seen item while the DO
     still reports unseen material. A rare stale/racing shelf can violate that
     invariant when the upstream candidate window changes during a burst. Ask
     the same DO once more; it now has the first selection in its seen ledger
     and will advance to the remaining unseen rows. A true exhausted cycle is
     still allowed to repeat and is reported explicitly. */
  if (!selected.cycleReset && Array.isArray(selected.selectionRepeatIds) && selected.selectionRepeatIds.length) {
    const retry = await stub.fetch(new Request("https://rotation.internal/select", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: candidates, recentIds: boundedRecentIds.concat(selected.selectionRepeatIds), count, rotation: Number(selected.cursor) || 0 }) }));
    if (retry.ok) {
      const retrySelected = await retry.json();
      if (retrySelected && (!Array.isArray(retrySelected.selectionRepeatIds) || !retrySelected.selectionRepeatIds.length || retrySelected.cycleReset)) {
        Object.assign(selected, retrySelected);
        selectedItems = Array.isArray(selected.items) ? selected.items : selectedItems;
        selectedCatalog = Array.isArray(selected.catalog) && selected.catalog.length ? selected.catalog : selectedCatalog;
      }
    }
  }
  /* The relay may intentionally return one verified first-frame item while
     its candidate catalog already carries additional direct media URLs. Once
     rotation selects those playable candidates, readiness must describe the
     returned shelf—not the relay's earlier handoff count. */
  const playableSelected = selectedItems.filter((item) => {
    const media = item && item.media;
    return Boolean((media && media.url) || item && item.mediaUrl || item && item.url);
  }).length;
  const selectedReady = Math.max(upstreamReady, playableSelected);
  const exhaustion = selected && selected.exhaustion && typeof selected.exhaustion === 'object' ? selected.exhaustion : {};
  return { payload: { ...payload, items: selectedItems, candidateItems: selectedCatalog, candidates: selectedCatalog.length, ready: Math.min(selectedReady, selectedItems.length), v2: { sessionScoped: true, cursor: selected.cursor, cycleReset: !!selected.cycleReset, catalogSize: Number(selected.catalogSize) || selectedCatalog.length, catalogAdded: Number(selected.catalogAdded) || 0, unseen: Number(selected.unseen) || 0, seenInCatalog: Number(exhaustion.seenInCatalog) || 0, seenInCatalogBeforeSelection: Number(exhaustion.seenInCatalogBeforeSelection) || 0, unseenBeforeSelection: Number(exhaustion.unseenBeforeSelection) || 0, unseenAfterSelection: Number(exhaustion.unseenAfterSelection) || 0, catalogExhausted: !!exhaustion.catalogExhausted, repeatAllowed: !!exhaustion.repeatAllowed, selectionRepeatIds: Array.isArray(selected.selectionRepeatIds) ? selected.selectionRepeatIds : [] } }, rotation: selected };
}

function rotateCatalogItems(items, rotation) {
  if (!Array.isArray(items) || !items.length) return [];
  const offset = ((Number(rotation) || 0) % items.length + items.length) % items.length;
  return items.slice(offset).concat(items.slice(0, offset));
}

function catalogFallbackAllowed(item, body) {
  const title = String(item && item.title || "").toLowerCase();
  const description = String(item && item.description || "").toLowerCase();
  const subject = String(item && (item.subject || item.subjects) || "").toLowerCase();
  /* Collection-expanded episode/file rows often inherit the genre only in
     their archive identifier while the individual filename is generic. Keep
     that signal in the strict fallback filter so a valid episode is not
     discarded merely because its child title omits the parent collection. */
  const sourceIdentifier = String(item && (item.sourceIdentifier || item.source_identifier || item.identifier || item.id) || "").toLowerCase();
  const normalizedSourceIdentifier = sourceIdentifier.replace(/[-_:.]+/g, " ");
  const tags = String(item && (item.tags || item.tag) || "").toLowerCase();
  const category = String(item && item.category || "").toLowerCase();
  const account = String(item && (item.account || item.channelTitle) || "").toLowerCase();
  const provider = String(item && (item.provider || item.source) || "").toLowerCase();
  /* OK.ru search metadata can occasionally overstate a short foreign-language
     upload. Keep the English-only Source Suite contract enforced when an old
     row is read back from D1, not just when a fresh provider response arrives. */
  if ((provider === "ok.ru" || provider === "ok") && (/[\u0400-\u04ff\u0600-\u06ff\u0590-\u05ff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(`${title} ${description} ${account}`)
    || /\b(?:pide|deseo|cuestionable|cap[ií]tulo|episodio|temporada|pel[ií]cula|televisi[oó]n|serie|hindi|tamil|telugu|bengali|arabic|russian|korean|japanese)\b/i.test(`${title} ${description} ${account}`))) return false;
  const profileStrictTopicTerms = Array.isArray(body && body.strictTopicTerms) ? body.strictTopicTerms : [];
  const identityHaystack = `${title} ${account}`;
  if (profileStrictTopicTerms.length && !profileStrictTopicTerms.some((term) => {
    const needle = String(term || "").trim().toLowerCase();
    return needle && identityHaystack.includes(needle);
  })) return false;
  /* Query text is retained for provenance, never as a genre signal. A search
     for “cannabis history” must not make an unrelated history upload look
     like Green Culture after it is persisted. */
  const haystack = `${title} ${description} ${subject} ${tags} ${category} ${account} ${sourceIdentifier} ${normalizedSourceIdentifier}`;
  const movieLane = String(body && body.movieLane || "").trim().toLowerCase();
  const laneRequired = Array.isArray(body && body.laneRequired) ? body.laneRequired : [];
  const laneDeny = Array.isArray(body && body.laneDeny) ? body.laneDeny : [];
  if (movieLane === "modern" && laneDeny.some((term) => {
    const needle = String(term || "").trim().toLowerCase();
    return needle && haystack.includes(needle);
  })) return false;
  if (movieLane === "indie" && laneRequired.length && !laneRequired.some((term) => {
    const needle = String(term || "").trim().toLowerCase();
    return needle && haystack.includes(needle);
  })) return false;
  const holidayChannel = String(body && body.channel || "");
  const trustedHolidayRecovery = IA_HOLIDAY_TITLE_LANES.has(holidayChannel)
    && item && item.recoveryVerified === true
    && item.media && item.media.url
    && Array.isArray(body && body.themeTerms)
    && body.themeTerms.some((term) => {
      const needle = String(term || "").trim().toLowerCase();
      return needle && subject.includes(needle);
    });
  /* A verified child file may inherit a parent identifier such as
     “halloween-cartoon-collection”. Do not let that parent bookkeeping word
     veto the child after the relay has already verified its media and subject. */
  const denyHaystack = trustedHolidayRecovery
    ? `${title} ${description} ${subject} ${tags} ${category} ${account}`
    : haystack;
  const denyTerms = Array.isArray(body && body.denyTerms) ? body.denyTerms : [];
  if (denyTerms.some((term) => {
    const needle = String(term || "").trim().toLowerCase();
    return needle && denyHaystack.includes(needle);
  })) return false;
  const strictTopicExclusions = IA_STRICT_TOPIC_EXCLUSIONS.get(holidayChannel);
  if (strictTopicExclusions && strictTopicExclusions.some((term) => title.includes(term))) return false;
  const strictTopicTerms = IA_STRICT_TOPIC_LANES.get(holidayChannel);
  if (strictTopicTerms && !strictTopicTerms.some((term) => haystack.includes(term))) return false;
  if (IA_ENGLISH_FOCUS_LANES.has(holidayChannel)) {
    if (IA_NON_ENGLISH_SIGNAL_TERMS.some((term) => haystack.includes(term))) return false;
    if (/[\u0400-\u04ff\u0600-\u06ff\u0590-\u05ff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u1100-\u11ff\u0e00-\u0e7f]/.test(haystack)) return false;
  }
  /* A relay-verified item has already passed the channel's full source-side
     genre rules. Preserve that provenance when a child film title is
     editorially correct but does not literally repeat the required phrase
     (for example, a factory film titled "Master Hands"). */
  const requiredTitleTerms = Array.isArray(body && body.requiredTitleTerms) ? body.requiredTitleTerms : [];
  const holidayTitleVerified = IA_HOLIDAY_TITLE_LANES.has(holidayChannel) && requiredTitleTerms.some((term) => {
    const needle = String(term || "").trim().toLowerCase();
    if (needle.length < 5 || !title.includes(needle)) return false;
    /* A single broad seasonal word is not enough for an old persisted row:
       “Frosty Glaze” and a news upload mentioning “Grinch” are not cartoons.
       Require the lane's format signal as well, while leaving relay-verified
       direct Archive children trusted through their provenance flag. */
    /* The cartoon holiday lanes need the same title re-score. Their seasonal
       words also occur in music, parade, meme, and upload-metadata videos;
       the TV lanes intentionally keep their broader television admission. */
    if (!["704", "705", "706"].includes(holidayChannel)) return true;
    const formatTerms = ["cartoon", "animation", "animated", "special", "rudolph", "frosty", "grinch", "mickey", "santa", "charlie brown", "pink panther", "scooby", "garfield", "spooky", "turkey", "mayflower", "pooh", "oswald", "jerky", "drumstick", "holiday", "winter"];
    /* Christmas search terms such as “Rudolph” and “Grinch” also occur in
       news, interviews, political clips, memes, and closing-logo uploads.
       Those false positives were the last remaining 704 genre bleed, so
       reject the known non-cartoon shapes before admitting a title-only row. */
    const nonCartoonTerms = [
      "interview", "ww2", "wehrmacht", "national socialist", "nsdap", "german",
      "carabinero", "disfrazado", "funcionaria", "la pintana", "golpearon",
      "politic", "election", "campaign", "press conference", "news report",
      "closing logo", "closing logos", "opening logo", "prank call", "meme",
      "trypophobia", "animation meme", "gameplay", "roblox", "minecraft",
      "national anthem", "labor day", "parade", "trio", "singing", "music",
      "concert", "choir", "presents:", "presents ", "villains", "(esses)",
      "smp", "!sneak", "!razer", "server", "speedrun", "gaming", "new life",
      "starts a factory", "factory gameplay",
      "credits remix", "remix", "missing children", "rudolph valentino",
      "vandercook lake",
      "opening to", "closing to", "opening/closing", "airing",
      "reaction", "commentary", "screen recording", "live broadcast",
    ];
    if (nonCartoonTerms.some((term) => title.includes(term))) return false;
    const cartoonStructureTerms = [
      "cartoon", "animation", "animated", "special", "christmas", "halloween",
      "thanksgiving", "reindeer", "snowman", "mickey", "charlie brown",
      "pink panther", "scooby", "garfield", "casper", "grinch night",
      "mayflower", "oswald", "pooh", "santa",
    ];
    if (!cartoonStructureTerms.some((term) => title.includes(term))) return false;
    return formatTerms.some((format) => title.includes(format));
  });
  /* Hand-verified holiday recovery files are allowed to keep their editorial
     subject signal even when the child filename is generic (for example,
     “The Skeleton Dance” or “Jerky Turkey”). This remains narrow: the row
     needs recovery provenance, a playable URL, and a seasonal subject signal. */
  const archiveFamilyRecovery = IA_ARCHIVE_FAMILY_DEPTH_LANES.has(String(body && body.channel || ""))
    && item && item.recoveryVerified === true
    && item.media && item.media.url;
  const relayVerified = (item && item.genreVerified === true && !IA_DEPTH_REPAIR_LANES.has(String(body && body.channel || ""))) || holidayTitleVerified || trustedHolidayRecovery || archiveFamilyRecovery;
  const strictManufacturingLane = String(body && body.channel || "") === "200";
  const manufacturingSubjectMatch = strictManufacturingLane && Array.isArray(body && body.themeTerms)
    && body.themeTerms.some((term) => {
      const needle = String(term || "").trim().toLowerCase();
      return needle && subject.includes(needle);
    });
  const titleRequirementMatch = IA_HOLIDAY_TITLE_LANES.has(holidayChannel)
    ? holidayTitleVerified
    : requiredTitleTerms.some((term) => {
    const needle = String(term || "").trim().toLowerCase();
    return needle && title.includes(needle);
  });
  if (requiredTitleTerms.length && !relayVerified && !manufacturingSubjectMatch && !titleRequirementMatch) return false;
  const channelAliases = IA_FALLBACK_ALIASES[String(body && body.channel || "")] || [];
  const laneAliases = String(body && body.channel || "") === "917"
    ? ["metallica", "black sabbath", "ozzy osbourne", "motorhead", "motörhead", "judas priest", "iron maiden", "slayer"].concat(channelAliases)
    : channelAliases;
  const persistedMatch = Array.isArray(body && body.persistedMatch) ? body.persistedMatch : [];
  const themeTerms = Array.isArray(body && body.themeTerms) ? body.themeTerms.concat(persistedMatch, laneAliases) : persistedMatch.concat(laneAliases);
  if (strictManufacturingLane && !manufacturingSubjectMatch) return false;
  /* Relay items have already passed the strict Archive genre/deny gates. Keep
     that provenance when V2 sees an expanded episode whose child filename does
     not repeat the parent topic. */
  /* Older catalog rows for the measured repair lanes were written with a
     stale genreVerified flag. Re-score those rows against today's channel
     vocabulary instead of allowing historical trust to preserve bleed. */
  if (themeTerms.length && !relayVerified) {
    let score = 0;
    for (const term of themeTerms) {
      const needle = String(term || "").trim().toLowerCase();
      if (!needle) continue;
      if (title.includes(needle)) score += 4;
      else if (subject.includes(needle) || haystack.includes(needle)) score += 2;
    }
    const minimum = Math.max(1, Math.min(12, Number(body && body.themeMinScore) || 1));
    if (score < minimum) return false;
  }
  const mediaTypes = Array.isArray(body && body.mediaTypes) ? body.mediaTypes.map((value) => String(value).toLowerCase()) : [];
  /* Audio lanes declare their type in media.type on relay responses. */
  const mediaType = String(item && (item.mediaType || item.type || (item.media && item.media.type)) || "video").toLowerCase();
  const audio = mediaType === "audio" || mediaType === "audio/mpeg" || mediaType === "audio/mp3";
  if (mediaTypes.length === 1 && mediaTypes[0] === "audio" && !audio) return false;
  if (mediaTypes.length && mediaTypes.indexOf("audio") < 0 && audio) return false;
  if (body && body.sourceCatalog === true) {
    const runtime = Number(item && (item.duration || item.runtime)) || 0;
    const minimumRuntime = Math.max(SOURCE_LIMITS.SOURCE_MIN_RUNTIME, Number(body.minRuntimeSeconds) || 0);
    const ratio = Number(item && item.aspectRatio) || 0;
    if (runtime < minimumRuntime) return false;
    if (ratio < SOURCE_LIMITS.SOURCE_MIN_ASPECT_RATIO) return false;
    if (audio || (mediaType !== "video" && mediaType !== "embed")) return false;
    const minTitleYear = Math.max(0, Number(body.minTitleYear) || 0);
    if (minTitleYear) {
      const titleYears = Array.from(title.matchAll(/(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/g)).map((match) => Number(match[1])).filter(Boolean);
      if (titleYears.some((year) => year < minTitleYear)) return false;
    }
    const minContentYear = Math.max(0, Number(body.minContentYear) || 0);
    if (minContentYear) {
      const contentYears = Array.from(haystack.matchAll(/(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/g)).map((match) => Number(match[1])).filter(Boolean);
      if (contentYears.some((year) => year < minContentYear)) return false;
    }
    /* Requalify stale rows against language and explicit profile topics before
       they reach a guide or ready shelf. */
    const declaredLanguage = String(item && item.language || "").trim().toLowerCase();
    if (declaredLanguage && !/^en(?:[-_]|$)/i.test(declaredLanguage)) return false;
    if (/[\u0400-\u04ff\u0600-\u06ff\u0590-\u05ff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u1100-\u11ff\u0e00-\u0e7f]/.test(haystack)) return false;
    if (/(?:\b(?:hindi|tamil|telugu|bengali|bangla|marathi|malayalam|kannada|punjabi|urdu|indonesian|vietnamese|thai|arabic|espa[nñ]ol|portugu[eê]s|fran[cç]ais|deutsch|russian|turkish|korean|japanese|mandarin|sinhala|italian)\b)/i.test(haystack)) return false;
    const topicTerms = Array.isArray(body.topics) ? body.topics : [];
    const normalizedHaystack = haystack.replace(/[\-_/:]+/g, " ");
    const topicMatch = topicTerms.some((term) => {
      const needle = String(term || "").trim().toLowerCase();
      return needle && (haystack.includes(needle) || normalizedHaystack.includes(needle.replace(/[\-_/:]+/g, " ")));
    });
    const persistedTopicSignal = Array.isArray(body.persistedMatch) && body.persistedMatch.some((term) => {
      const needle = String(term || "").trim().toLowerCase();
      return needle && (title.includes(needle) || haystack.includes(needle));
    });
    if (topicTerms.length && !topicMatch && !(body.persistedRelaxed === true && persistedTopicSignal)) return false;
    /* Requalify persisted Source Suite rows whenever an entertainment lane
       changes its editorial contract. Otherwise an older documentary entry
       can survive indefinitely just because it happens to share one topic
       word with the new TV/film lane. */
    if (/^(?:television|film|performance)$/.test(String(body.intent || ""))) {
      const programDeny = /(?:history of|documentary about|retrospective|video essay|analysis|explained|lecture|seminar|webinar|conference|panel discussion|making of|movie making|filmmaking|film making|studio tour|educational film|behind the scenes|demo reel|showreel|workshop|masterclass|recap|production reel|festival reel|fan[ -]?made|fan animation|unofficial|mashup|amv|gacha|roleplay|my little pony|\bpony\b)/i;
      const formats = Array.isArray(body.programFormats) ? body.programFormats : [];
      const topics = Array.isArray(body.topics) ? body.topics : [];
      if (programDeny.test(haystack)) return false;
      const persistedSignal = persistedMatch.some((term) => {
        const needle = String(term || "").trim().toLowerCase();
        return needle && haystack.includes(needle);
      });
      if (topics.length && !topics.some((term) => {
        const needle = String(term || "").trim().toLowerCase();
        return needle && haystack.includes(needle);
      }) && !(body.persistedRelaxed === true && persistedSignal)) return false;
      const relaxedLongForm = body.persistedRelaxed === true && runtime >= 20 * 60;
      if (formats.length && !formats.some((term) => {
        const needle = String(term || "").trim().toLowerCase();
        return needle && title.includes(needle);
      }) && !relaxedLongForm) return false;
    }
  }
  return true;
}

function recentCatalogIds(body) {
  return new Set((Array.isArray(body && body.recentIds) ? body.recentIds : [])
    .map((value) => String(value || "").trim().slice(0, 500))
    .filter(Boolean)
    .slice(-48));
}

/* D1 freshness rows are read newest-first. Client-only requests historically
   sent recentIds oldest-first, so keep the ordering explicit instead of using
   one ambiguous slice direction for both paths. */
function freshnessExclusionIds(body, limit) {
  const recent = Array.from(recentCatalogIds(body));
  const bounded = Math.max(0, Number(limit) || 0);
  if (!bounded || !recent.length) return [];
  return body && body.freshnessLedger === true
    ? recent.slice(0, bounded)
    : recent.slice(-bounded);
}

function normalizedChannelKey(value) {
  return String(value || "").replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 120);
}

function canonicalPilotProfile(channel) {
  const normalized = normalizedChannelKey(channel);
  const profileKey = IA_CANONICAL_PROFILE_BY_CHANNEL.get(normalized);
  return profileKey ? { profile: IA_CANONICAL_PILOT_PROFILES[profileKey], manifest: IA_CANONICAL_PILOT_MANIFESTS[profileKey] } : { profile: null, manifest: null };
}

function canonicalPilotEnabled(env, channel) {
  const flag = String(env && env.IA_CANONICAL_PILOT || "").trim().toLowerCase();
  if (!IA_CANONICAL_PILOT_VALUES.has(flag)) return false;
  const normalized = normalizedChannelKey(channel);
  const allowList = String(env && env.IA_CANONICAL_PILOT_CHANNELS || "").split(",").map((value) => normalizedChannelKey(value)).filter(Boolean);
  if (allowList.length && !allowList.includes(normalized)) return false;
  const { profile, manifest } = canonicalPilotProfile(normalized);
  const decadeCounts = manifest && manifest.decadeCounts && typeof manifest.decadeCounts === "object" ? manifest.decadeCounts : {};
  const balanced = !!(profile && (profile.requiredDecades || []).every((decade) => Number(decadeCounts[String(decade)] || 0) > 0));
  return !!(manifest && profile && manifest.verified === true && Array.isArray(manifest.items) && manifest.items.length >= Number(profile.minCatalog || 0) && balanced);
}

function canonicalShadowEnabled(env, channel) {
  const flag = String(env && env.IA_CANONICAL_SHADOW || "").trim().toLowerCase();
  if (!IA_CANONICAL_SHADOW_VALUES.has(flag)) return false;
  const normalized = normalizedChannelKey(channel);
  const allowList = String(env && env.IA_CANONICAL_SHADOW_CHANNELS || "").split(",").map((value) => normalizedChannelKey(value)).filter(Boolean);
  if (allowList.length && !allowList.includes(normalized)) return false;
  const { profile, manifest } = canonicalPilotProfile(normalized);
  const decadeCounts = manifest && manifest.decadeCounts && typeof manifest.decadeCounts === "object" ? manifest.decadeCounts : {};
  const balanced = !!(profile && (profile.requiredDecades || []).every((decade) => Number(decadeCounts[String(decade)] || 0) > 0));
  return !!(manifest && profile && manifest.verified === true && Array.isArray(manifest.items) && manifest.items.length >= Number(profile.minCatalog || 0) && balanced);
}

function canonicalPilotPayload(manifest, profile, body, count) {
  const selection = selectCanonicalItems(manifest, Array.isArray(body && body.recentIds) ? body.recentIds : [], count, Number(body && body.rotation) || 0);
  if (!selection.items.length) return null;
  return {
    items: selection.items,
    candidateItems: selection.candidateItems,
    ready: selection.items.length,
    candidates: selection.candidateItems.length,
    catalogDepth: selection.catalogDepth,
    unseenCatalogItems: selection.unseenCount,
    seenCatalogItems: selection.seenCount,
    catalogExhausted: selection.catalogExhausted,
    repeatAllowed: selection.repeatAllowed,
    freshnessExcluded: selection.seenCount,
    freshnessWindow: Array.isArray(body && body.recentIds) ? body.recentIds.length : 0,
    freshnessLedger: body && body.freshnessLedger === true,
    fallback: false,
    stale: false,
    catalogFallback: false,
    canonicalPilot: true,
    canonicalSchemaVersion: IA_CANONICAL_SCHEMA_VERSION,
    canonicalProfileKey: profile.profileKey,
    canonicalGeneratedAt: manifest.generatedAt,
    verified: true,
    hydrating: false,
    v2: {
      sessionScoped: false,
      selectionFallback: false,
      cursor: selection.cursor,
      cycleReset: selection.catalogExhausted,
      catalogSize: selection.catalogDepth,
      catalogAdded: 0,
      unseen: selection.unseenCount,
      seenInCatalog: selection.seenCount,
      unseenAfterSelection: Math.max(0, selection.unseenCount - selection.items.length),
      catalogExhausted: selection.catalogExhausted,
      repeatAllowed: selection.repeatAllowed,
      selectionRepeatIds: [],
    },
  };
}

function canonicalShadowSummary(liveBody, liveStatus, canonicalPayload, profile, recentIds) {
  const liveItems = Array.isArray(liveBody && liveBody.candidateItems) && liveBody.candidateItems.length
    ? liveBody.candidateItems
    : Array.isArray(liveBody && liveBody.items) ? liveBody.items : [];
  const canonicalItems = [...(canonicalPayload.candidateItems || []), ...(canonicalPayload.items || [])];
  const keyOf = (item) => String(item && (item.id || item.programId || item.identifier || item.mediaUrl || item.url) || "").trim();
  const liveKeys = new Set(liveItems.map(keyOf).filter(Boolean));
  const canonicalKeys = new Set(canonicalItems.map(keyOf).filter(Boolean));
  let overlap = 0;
  for (const key of canonicalKeys) if (liveKeys.has(key)) overlap += 1;
  const liveDepth = Number(liveBody && (liveBody.catalogDepth || liveBody.candidates || liveItems.length)) || 0;
  const canonicalDepth = Number(canonicalPayload.catalogDepth || canonicalItems.length) || 0;
  const eligible = canonicalPayload.verified === true && canonicalDepth >= Number(profile.minCatalog || 0);
  return {
    live: {
      status: Number(liveStatus) || 0,
      available: Number(liveStatus) >= 200 && Number(liveStatus) < 300,
      source: String(liveBody && liveBody.source || "relay-unavailable").slice(0, 120),
      ready: Number(liveBody && liveBody.ready) || (Array.isArray(liveBody && liveBody.items) ? liveBody.items.length : 0),
      candidates: Number(liveBody && liveBody.candidates) || liveItems.length,
      catalogDepth: liveDepth,
    },
    canonical: {
      verified: canonicalPayload.verified === true,
      profileKey: profile.profileKey,
      ready: canonicalPayload.ready,
      candidates: canonicalPayload.candidates,
      catalogDepth: canonicalDepth,
      unseen: canonicalPayload.unseenCatalogItems,
      repeatAllowed: canonicalPayload.repeatAllowed,
      freshnessExcluded: canonicalPayload.freshnessExcluded,
    },
    comparison: {
      overlappingItems: overlap,
      canonicalOnlyItems: Math.max(0, canonicalKeys.size - overlap),
      liveOnlyItems: Math.max(0, liveKeys.size - overlap),
      recentIdsConsidered: Array.isArray(recentIds) ? recentIds.length : 0,
      canonicalEligible: eligible,
      promotionDecision: eligible ? "needs-canary" : "hold",
    },
  };
}

async function handleCanonicalShadow(request, env, id) {
  let body;
  try { body = await readBoundedJson(request); }
  catch (error) { return json({ error: error instanceof RangeError ? error.message : "invalid JSON body", requestId: id }, error instanceof RangeError ? 413 : 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "shadow payload must be an object", requestId: id }, 400);
  if (!String(body.channel || "").trim()) return json({ error: "channel is required", requestId: id }, 400);
  if (!canonicalShadowEnabled(env, body.channel)) return json({ error: "canonical shadow is not enabled for this channel", requestId: id }, 404);
  const canonical = canonicalPilotProfile(body.channel);
  const count = Math.max(1, Math.min(5, Number(body.count) || 5));
  const recentIds = Array.isArray(body.recentIds) ? body.recentIds.slice(0, FRESHNESS_LEDGER_LIMIT) : [];
  const canonicalPayload = canonicalPilotPayload(canonical.manifest, canonical.profile, { ...body, recentIds, freshnessLedger: true }, count);
  if (!canonicalPayload) return json({ error: "canonical manifest has no selectable items", requestId: id }, 503);

  /* Shadow comparison is deliberately relay-only. It never enables the D1
     server catalog or returns canonical items as playback, so this endpoint
     cannot alter the current viewer path. */
  const liveBody = { ...body, count, recentIds, freshnessLedger: false, serverCatalog: false };
  delete liveBody.sessionId;
  delete liveBody.session;
  const upstream = await forwardToRelay(request, env, "/ia/queue", liveBody, id);
  let parsed = null;
  try { parsed = await upstream.json(); } catch (_) { parsed = null; }
  const summary = canonicalShadowSummary(parsed, upstream.status, canonicalPayload, canonical.profile, recentIds);
  console.log(JSON.stringify({ event: "canonical-shadow-comparison", requestId: id, channel: String(body.channel), ...summary.comparison }));
  return json({ apiVersion: "v3", release: V3_RELEASE, requestId: id, generatedAt: new Date().toISOString(), ...summary }, 200, { "Cache-Control": "no-store", "X-RealSignal-Release": V3_RELEASE, "X-RealSignal-Source": "ia-canonical-shadow" });
}

function persistCanonicalPilotManifest(env, manifest, profile, ctx) {
  if (!manifest || !profile || !env.realsignal_catalog || typeof env.realsignal_catalog.batch !== "function") return;
  const now = Date.now();
  const statements = [];
  for (const item of Array.isArray(manifest.items) ? manifest.items : []) {
    const metadata = JSON.stringify({
      canonical: true,
      schemaVersion: manifest.schemaVersion,
      profileKey: profile.profileKey,
      decade: item.decade,
      collection: item.collection,
      familyKey: item.familyKey,
      subject: item.subject,
      tags: item.tags,
      playability: item.playability,
    });
    statements.push(env.realsignal_catalog.prepare("INSERT INTO programs (id, provider, source_identifier, title, description, duration_seconds, aspect_ratio, media_type, media_url, source_url, rights, year, metadata_json, first_seen_at, last_seen_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET provider=excluded.provider, source_identifier=excluded.source_identifier, title=excluded.title, description=excluded.description, duration_seconds=excluded.duration_seconds, media_url=excluded.media_url, source_url=excluded.source_url, rights=excluded.rights, year=excluded.year, metadata_json=excluded.metadata_json, last_seen_at=excluded.last_seen_at, status='active'").bind(item.programId, "Internet Archive", item.archiveId, item.title, item.description || "", item.runtimeSeconds || null, null, "video", item.mediaUrl, item.sourceUrl, item.rights || "", item.year || "", metadata, now, now, "active"));
    statements.push(env.realsignal_catalog.prepare("INSERT INTO channel_programs (channel_key, program_id, score, last_seen_at) VALUES (?, ?, ?, ?) ON CONFLICT(channel_key, program_id) DO UPDATE SET score=excluded.score, last_seen_at=excluded.last_seen_at").bind(profile.channel, item.programId, 1, now));
  }
  if (!statements.length) return;
  const work = (async () => {
    try {
      for (let index = 0; index < statements.length; index += 32) await env.realsignal_catalog.batch(statements.slice(index, index + 32));
    } catch (error) {
      console.warn(JSON.stringify({ event: "canonical-manifest-persist-failed", profile: profile.profileKey, error: String(error).slice(0, 180) }));
    }
  })();
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(work); else work.catch(() => {});
}

async function readFreshnessIds(env, channel, limit = FRESHNESS_LEDGER_LIMIT) {
  if (!env.realsignal_catalog || typeof env.realsignal_catalog.prepare !== "function") return [];
  const channelKey = normalizedChannelKey(channel);
  if (!channelKey) return [];
  const now = Date.now();
  const cached = freshnessReadCache.get(channelKey);
  if (cached && now - cached.at < FRESHNESS_CACHE_TTL_MS) return cached.ids.slice(0, limit);
  try {
    const result = await env.realsignal_catalog.prepare("SELECT program_id FROM channel_freshness WHERE channel_key=? ORDER BY last_served_at DESC LIMIT ?").bind(channelKey, Math.max(1, Math.min(64, limit))).all();
    const ids = (result.results || []).map((row) => String(row.program_id || "").trim().slice(0, 500)).filter(Boolean);
    freshnessReadCache.set(channelKey, { at: now, ids });
    return ids;
  } catch (_) {
    /* The API remains compatible during the migration window. A missing V4
       table must never turn a playable queue into No Signal. */
    freshnessReadCache.set(channelKey, { at: now, ids: [] });
    return [];
  }
}

async function withFreshnessLedger(env, body) {
  const channel = normalizedChannelKey(body && body.channel);
  if (!channel) return body;
  const ledgerIds = await readFreshnessIds(env, channel);
  if (!ledgerIds.length) return body;
  const clientIds = Array.isArray(body.recentIds) ? body.recentIds : [];
  const merged = [];
  const seen = new Set();
  /* Keep the D1 rows first because they are already newest-first. Client
     history is appended only as a secondary exclusion source. */
  for (const value of ledgerIds.concat(clientIds)) {
    const id = String(value || "").trim().slice(0, 500);
    if (id && !seen.has(id)) { seen.add(id); merged.push(id); }
  }
  return { ...body, recentIds: merged.slice(0, 48), freshnessLedger: true };
}

async function rememberFreshness(env, channel, items, ctx) {
  if (!env.realsignal_catalog || typeof env.realsignal_catalog.batch !== "function") return;
  const channelKey = normalizedChannelKey(channel);
  const ids = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const id = (typeof item === "string" ? item : queueItemKey(item)).trim().slice(0, 500);
    if (id && !seen.has(id)) { seen.add(id); ids.push(id); }
    if (ids.length >= 8) break;
  }
  if (!channelKey || !ids.length) return;
  const now = Date.now();
  const work = (async () => {
    try {
      const statements = ids.map((id) => env.realsignal_catalog.prepare("INSERT INTO channel_freshness (channel_key, program_id, last_served_at, play_count) VALUES (?, ?, ?, 1) ON CONFLICT(channel_key, program_id) DO UPDATE SET last_served_at=excluded.last_served_at, play_count=channel_freshness.play_count+1").bind(channelKey, id, now));
      await env.realsignal_catalog.batch(statements);
      freshnessReadCache.delete(channelKey);
    } catch (_) {
      /* V4 telemetry/freshness is additive; playback remains independent of a
         not-yet-applied migration or a transient D1 write failure. */
    }
  })();
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(work); else await work;
}

/* Freshness is a preference, not a hard ban. If a catalog has new material,
   exclude the client's recent shelf. If it does not, return the last-good
   catalog rather than turning a healthy channel into No Signal. */
function applyFreshness(items, body) {
  if (!Array.isArray(items) || !items.length) return [];
  const requestedCount = Math.max(1, Math.min(5, Number(body && body.count) || 3));
  const recentLimit = items.length >= requestedCount ? Math.max(0, items.length - requestedCount) : recentCatalogIds(body).size;
  const boundedRecent = new Set(freshnessExclusionIds(body, recentLimit));
  const fresh = items.filter((item) => !boundedRecent.has(queueItemKey(item)));
  return fresh.length ? fresh : items;
}

function localRotationFallback(payload, body) {
  const count = Math.max(1, Math.min(5, Number(body && body.count) || 3));
  const candidateItems = stableCatalogItems(
    Array.isArray(payload && payload.candidateItems) && payload.candidateItems.length
      ? payload.candidateItems
      : ((payload && payload.items) || []),
    body,
    MAX_CATALOG_ITEMS,
  );
  const fresh = applyFreshness(candidateItems, body);
  const playable = fresh.filter((item) => item && ((item.media && item.media.url) || item.mediaUrl || item.url));
  const source = playable.length >= count ? playable : fresh;
  const rotationStep = body && body.sourceCatalog === true ? 1 : count;
  const items = rotateCatalogItems(source, (Number(body && body.rotation) || 0) * rotationStep).slice(0, count);
  const playableSelected = items.filter((item) => item && ((item.media && item.media.url) || item.mediaUrl || item.url)).length;
  return {
    ...payload,
    items,
    candidateItems,
    candidates: candidateItems.length,
    ready: playable.length >= count ? playableSelected : items.length,
    fallback: true,
    v2: {
      sessionScoped: false,
      selectionFallback: true,
      cursor: Number(body && body.rotation) || 0,
      cycleReset: false,
      catalogSize: candidateItems.length,
      catalogAdded: 0,
      unseen: Math.max(0, fresh.length - items.length),
      seenInCatalog: 0,
      seenInCatalogBeforeSelection: 0,
      unseenBeforeSelection: fresh.length,
      unseenAfterSelection: Math.max(0, fresh.length - items.length),
      catalogExhausted: false,
      repeatAllowed: false,
      selectionRepeatIds: [],
    },
  };
}

async function catalogFallback(env, body, requestedLimit = SOURCE_LIMITS.SOURCE_MAX_ITEMS, options = {}) {
  if (!env.realsignal_catalog || typeof env.realsignal_catalog.prepare !== "function") return null;
  const ignoreFreshness = options && options.ignoreFreshness === true;
  const freshnessDisabled = body && body.freshnessLedger === false;
  const effectiveBody = ignoreFreshness
    ? { ...body, recentIds: [], freshnessLedger: false }
    : freshnessDisabled
      ? { ...body, recentIds: Array.isArray(body.recentIds) ? body.recentIds : [], freshnessLedger: false }
      : await withFreshnessLedger(env, body);
  const channel = normalizedChannelKey(effectiveBody.channel);
  const limit = Math.max(1, Math.min(SOURCE_LIMITS.SOURCE_MAX_ITEMS, Number(requestedLimit) || SOURCE_LIMITS.SOURCE_MAX_ITEMS));
  const result = await env.realsignal_catalog.prepare(`SELECT p.* FROM programs p JOIN channel_programs cp ON cp.program_id=p.id WHERE cp.channel_key=? AND p.status='active' AND p.media_url IS NOT NULL ORDER BY cp.last_seen_at DESC LIMIT ?`).bind(channel, limit).all();
  const items = (result.results || []).map((row) => {
    let metadata = {};
    try { metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {}; } catch (_) { /* tolerate old rows */ }
    /* Older Archive harvests persisted the resolved file URL in metadata_json
       before the normalized media_url column was populated. Treat that as a
       playable record instead of counting it as catalog depth and then
       silently discarding it from every shelf. This is deliberately limited
       to explicit mediaUrl/media_url fields from the catalog row; discovery
       and URL guessing still stay out of the request path. */
    const mediaUrl = String(row.media_url || metadata.mediaUrl || metadata.media_url || "").trim();
    const mediaType = row.media_type || metadata.mediaType || metadata.media_type || "video";
    const sourceUrl = row.source_url || metadata.sourceUrl || metadata.source_url || "";
    const provider = String(row.provider || metadata.provider || "").trim();
    const storedDuration = Number(row.duration_seconds || metadata.duration || metadata.runtime) || 0;
    /* OK.ru rows written before 5.5.42 stored the provider's millisecond
       duration directly in duration_seconds. New rows carry an explicit
       seconds marker. Convert only the legacy rows so the runtime floors
       remain correct without double-converting fresh catalog entries. */
    const duration = provider === "OK.ru" && metadata.durationUnit !== "seconds"
      ? storedDuration / 1000
      : storedDuration;
    return {
      id: row.id,
      identifier: row.id,
      sourceIdentifier: row.source_identifier || row.id,
      title: row.title,
      description: row.description || "",
      subject: metadata.subject || metadata.subjects || "",
      tags: metadata.tags || "",
      category: metadata.category || "",
      account: metadata.account || "",
      query: metadata.query || "",
      genreVerified: metadata.genreVerified === true,
      recoveryVerified: metadata.recoveryVerified === true,
      language: metadata.language || metadata.defaultAudioLanguage || metadata.defaultLanguage || "",
      provider,
      year: row.year || "",
      duration: duration || null,
      runtime: duration || null,
      aspectRatio: Number(row.aspect_ratio || metadata.aspectRatio || metadata.aspect_ratio || metadata.ratio) || null,
      mediaType,
      media: { type: mediaType, url: mediaUrl },
      type: mediaType === "embed" ? "embed" : "video",
      url: mediaUrl,
      embedUrl: mediaType === "embed" ? mediaUrl : "",
      sourceUrl,
      rights: row.rights || "",
      staleCatalog: true,
    };
  });
  const blockedProviders = options && options.blockedProviders instanceof Set ? options.blockedProviders : new Set();
  /* A row from a provider currently in cooldown is not a fallback. Returning
     it here would make the guide and ready shelf suggest the exact provider
     that just timed out. Filter it before requalification and rotation. */
  const eligibleItems = items.filter((item) => !blockedProviders.has(sourceProviderKey(item && item.provider)));
  const filtered = stableCatalogItems(eligibleItems, effectiveBody);
  /* A catalog row without a resolved media URL is useful evidence for a
     background repair, but it is not a playable program. Keep it in the
     candidate union while measuring depth/freshness and selecting the public
     shelf only from rows that can actually start. */
  const playableCatalog = filtered.filter(queueItemPlayable);
  const fresh = ignoreFreshness ? playableCatalog : applyFreshness(playableCatalog, effectiveBody);
  /* Source Suite may legitimately exhaust a small catalog. Repeat only after
     every verified row has appeared; never turn exhaustion into a 503 or hide
     the real catalog depth from the guide. */
  const exhausted = !ignoreFreshness && effectiveBody.sourceCatalog === true && playableCatalog.length > 0 && fresh.length === 0;
  const selected = exhausted ? playableCatalog : fresh;
  const seenCount = Math.max(0, playableCatalog.length - fresh.length);
  const requestedCount = Math.max(1, Math.min(5, Number(effectiveBody && effectiveBody.count) || 3));
  /* IA rotations represent consuming the five-item public shelf. Source
     profiles keep their historical one-record cursor, but the Archive
     recovery rail must advance by a complete shelf or the API fallback will
     return four of the same five programs on every Next action. */
  const rotationStep = effectiveBody && effectiveBody.sourceCatalog === true ? 1 : requestedCount;
  const ordered = rotateCatalogItems(selected, (Number(effectiveBody.rotation) || 0) * rotationStep);
  const shelf = ordered.slice(0, requestedCount);
  return shelf.length ? {
    /* Keep the public contract consistent with the live relay: `items` is the
       immediately playable shelf, while `candidateItems` is the larger
       catalog behind it. Returning every fallback row as `items` made a
       transient relay outage look like a 96-program simultaneous queue and
       caused the guide/freshness layer to miscount repeats. */
    items: shelf,
    candidateItems: filtered,
    ready: shelf.length,
    candidates: filtered.length,
    catalogDepth: filtered.length,
    playableCatalogDepth: playableCatalog.length,
    unseenCatalogItems: fresh.length,
    seenCatalogItems: seenCount,
    catalogExhausted: exhausted,
    repeatAllowed: exhausted,
    fallback: true,
    stale: true,
    catalogFallback: true,
    freshnessExcluded: seenCount,
    freshnessWindow: recentCatalogIds(effectiveBody).size,
    freshnessLedger: effectiveBody.freshnessLedger === true,
    rotation: Number(effectiveBody.rotation) || 0,
  } : null;
}

/* A family profile is an editorial union, not a second upstream search. When
   a broad seasonal lane has no usable shelf of its own, reuse the already
   verified D1 shelves from its narrower seasonal members. This keeps the
   viewer on a fast, playable path even while the broad profile's providers
   are cooling down or returning sparse results. */
async function familyCatalogFallback(env, profile, requestedLimit = SOURCE_LIMITS.SOURCE_MAX_ITEMS, depth = 0, visited = new Set()) {
  const fallbackProfiles = Array.isArray(profile && profile.fallbackProfiles) ? profile.fallbackProfiles : [];
  const profileKey = String(profile && profile.profileKey || "");
  if (!fallbackProfiles.length || depth > 2 || visited.has(profileKey)) return [];
  const nextVisited = new Set(visited);
  if (profileKey) nextVisited.add(profileKey);
  const rows = [];
  for (const profileKey of fallbackProfiles.slice(0, 4)) {
    const alias = sourceProfile({ profileKey });
    if (!alias) continue;
    const cached = await catalogFallback(env, {
      channel: alias.profileKey,
      sourceCatalog: true,
      denyTerms: alias.deny,
      themeTerms: alias.match,
      intent: alias.intent,
      topics: alias.topics,
      strictTopicTerms: alias.strictTopicTerms,
      programFormats: alias.formats,
      minTitleYear: alias.minTitleYear,
      minContentYear: alias.minContentYear,
      minRuntimeSeconds: alias.minRuntimeSeconds,
      movieLane: alias.movieLane,
      laneRequired: alias.laneRequired,
      laneDeny: alias.laneDeny,
      persistedRelaxed: alias.persistedRelaxed,
      persistedMatch: alias.persistedMatch,
      themeMinScore: 1,
    }, requestedLimit, { ignoreFreshness: true, blockedProviders: new Set() }).catch(() => null);
    if (cached && Array.isArray(cached.candidateItems) && cached.candidateItems.length) {
      rows.push(...cached.candidateItems);
    } else if (depth < 2 && Array.isArray(alias.fallbackProfiles) && alias.fallbackProfiles.length) {
      const nested = await familyCatalogFallback(env, alias, requestedLimit, depth + 1, nextVisited).catch(() => []);
      rows.push(...nested);
    }
  }
  /* The alias shelves have already passed their own 15-minute, aspect-ratio,
     media-type, deny, and genre rules. Only dedupe here; re-running the broad
     profile's match vocabulary would throw away valid titles such as Rudolph
     or Casper that do not contain the generic phrase "holiday cartoon". */
  const familyBody = profile && profile.intent === "film"
    ? {
        sourceCatalog: true,
        denyTerms: profile.deny,
        themeTerms: profile.match,
        persistedMatch: [],
        topics: profile.topics,
        strictTopicTerms: profile.strictTopicTerms,
        programFormats: profile.formats,
        minTitleYear: profile.minTitleYear,
        minContentYear: profile.minContentYear,
        minRuntimeSeconds: profile.minRuntimeSeconds,
        movieLane: profile.movieLane,
        laneRequired: profile.laneRequired,
        laneDeny: profile.laneDeny,
        intent: profile.intent,
        themeMinScore: 1,
      }
    : { sourceCatalog: true, denyTerms: [], themeTerms: [], persistedMatch: [], topics: [], programFormats: [], themeMinScore: 0 };
  return uniqueQueueItems(rows, familyBody, requestedLimit);
}

function sourceProvidersFromItems(items) {
  const providers = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const provider = sourceProviderKey(item && item.provider);
    if (provider === "youtube" || provider === "peertube") providers.add(provider);
  }
  return providers;
}

async function handleQueue(request, env, ctx, id) {
  let body;
  try { body = await readBoundedJson(request); }
  catch (error) { return json({ error: error instanceof RangeError ? error.message : "invalid JSON body", requestId: id }, error instanceof RangeError ? 413 : 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "queue payload must be an object", requestId: id }, 400);
  if (!String(body.channel || "").trim()) return json({ error: "channel is required", requestId: id }, 400);
  /* IA freshness is owned by the relay/client played-only ledger. This API
     route is an adapter and must not turn a queued shelf into watched history
     or let stale D1 rows suppress the same candidates on every tune. Keep the
     server rotation path available only for an explicit future opt-in. */
  const requestedServerCatalog = body.serverCatalog === true;
  const catalogCanary = body.catalogCanary === "v2-session";
  const useServerCatalog = requestedServerCatalog && (!catalogCanary || IA_SESSION_CATALOG_CANARY_CHANNELS.has(String(body.channel)));
  body = useServerCatalog
    ? await withFreshnessLedger(env, body)
    : { ...body, freshnessLedger: false, recentIds: Array.isArray(body.recentIds) ? body.recentIds : [] };
  const apiVersion = new URL(request.url).pathname.startsWith(V3_PREFIX) ? "v3" : "v2";
  const count = Math.max(1, Math.min(5, Number(body.count) || 3));
  const upstreamBody = { ...body, count };
  delete upstreamBody.sessionId;
  delete upstreamBody.session;
  const canonical = canonicalPilotProfile(body.channel);
  if (canonicalPilotEnabled(env, body.channel)) {
    const canonicalPayload = canonicalPilotPayload(canonical.manifest, canonical.profile, body, count);
    if (canonicalPayload) {
      persistCanonicalPilotManifest(env, canonical.manifest, canonical.profile, ctx);
      const headers = new Headers(corsHeaders());
      headers.set("X-RealSignal-API", apiVersion);
      if (apiVersion === "v3") headers.set("X-RealSignal-Release", V3_RELEASE);
      headers.set("X-RealSignal-Request", id);
      headers.set("X-RealSignal-Source", "ia-canonical-pilot");
      headers.set("X-RealSignal-Queue", JSON.stringify({ ready: canonicalPayload.ready, background: false, canonicalPilot: true, catalogDepth: canonicalPayload.catalogDepth }));
      return new Response(JSON.stringify({ ...canonicalPayload, apiVersion, release: apiVersion === "v3" ? V3_RELEASE : undefined }), { status: 200, headers });
    }
  }
  const archiveFamilyRelayRail = IA_ARCHIVE_FAMILY_DEPTH_LANES.has(String(body.channel));
  if (useServerCatalog && IA_FAST_CATALOG_LANES.has(String(body.channel)) && !archiveFamilyRelayRail) {
    try {
      /* Feed the full verified D1 catalog into session rotation. The rotation
         object applies the persistent freshness ledger for the opening pick,
         then walks unseen rows from the larger catalog on later Next actions. */
        const fastCatalog = await catalogFallback(env, body, MAX_CATALOG_ITEMS, { ignoreFreshness: true });
      if (fastCatalog && Array.isArray(fastCatalog.items) && fastCatalog.items.length) {
        if (fastCatalog.candidateItems.length < IA_MIN_ROLLING_CATALOG_DEPTH && shouldRefreshShallowCatalog(body.channel)) {
          /* Keep the first frame on the local verified shelf. Refill a shallow
             fast lane from the relay asynchronously so discovery never blocks
             a tune and the next visit sees a wider rotation catalog. */
          ctx.waitUntil(refreshShallowCatalog(env, request, body, id, fastCatalog.candidateItems.length));
        }
        let fastRotated;
        try { fastRotated = await rotateShelf(env, body, fastCatalog, request); }
        catch (error) {
          console.warn(JSON.stringify({ event: "fast-catalog-rotation-fallback", requestId: id, channel: String(body.channel), error: String(error).slice(0, 160) }));
          fastRotated = { payload: localRotationFallback(fastCatalog, body), rotation: { configured: false, fallback: true } };
        }
        const headers = new Headers(corsHeaders());
        headers.set("X-RealSignal-API", apiVersion);
        if (apiVersion === "v3") headers.set("X-RealSignal-Release", V3_RELEASE);
        headers.set("X-RealSignal-Request", id);
        headers.set("X-RealSignal-Source", "d1-catalog-fast-lane+session-rotation");
        headers.set("X-RealSignal-Queue", JSON.stringify({ ready: Number(fastRotated.payload.ready || (fastRotated.payload.items || []).length), background: false, fastCatalogLane: true }));
        /* The D1 fast lane is already the verified playback shelf. Leaving the
           generic catalog-fallback flags on it makes clients immediately start
           another hydration loop, which showed up in telemetry as stalls and
           duplicate queue work on the proven weak lane. */
        const fastPayload = {
          ...fastRotated.payload,
          fallback: false,
          stale: false,
          catalogFallback: false,
          staleCatalog: false,
          apiVersion,
          release: apiVersion === "v3" ? V3_RELEASE : undefined,
          fastCatalogLane: true,
        };
        return new Response(JSON.stringify(fastPayload), { status: 200, headers });
      }
    } catch (error) {
      console.warn(JSON.stringify({ event: "fast-catalog-read-failed", requestId: id, channel: String(body.channel), error: String(error).slice(0, 160) }));
    }
  }
  const upstream = await forwardToRelay(request, env, "/ia/queue", upstreamBody, id);
  let payload;
  let catalogRecovery = false;
  if (!upstream.ok) {
    try { payload = await catalogFallback(env, body); catalogRecovery = !!payload; } catch (error) { console.warn(JSON.stringify({ event: "catalog-fallback-failed", requestId: id, error: String(error).slice(0, 160) })); }
    if (!payload) return upstream;
  } else {
    try { payload = await upstream.clone().json(); } catch (_) { return upstream; }
    /* Treat the relay as a source adapter, not as the final catalog authority.
       Re-apply the lane contract here before anything reaches D1 or the
       session rotation. This removes stale/contaminated rows already present
       in older catalogs and collapses duplicate collection/file records. */
    const upstreamItems = uniqueQueueItems(Array.isArray(payload && payload.items) ? payload.items : [], body, MAX_CATALOG_ITEMS);
    const upstreamCandidates = uniqueQueueItems(
      Array.isArray(payload && payload.candidateItems) && payload.candidateItems.length ? payload.candidateItems : upstreamItems,
      body,
      MAX_CATALOG_ITEMS,
    );
    payload = limitPublicIaShelf({
      ...payload,
      items: upstreamItems,
      candidateItems: upstreamCandidates,
      candidates: upstreamCandidates.length,
      ready: Math.min(Number(payload && payload.ready) || upstreamItems.length, upstreamItems.length),
    }, count);
    const upstreamCandidateDepth = upstreamCandidates.length;
    const upstreamPlayableCandidateDepth = upstreamCandidates.filter(queueItemPlayable).length;
    const relayOwnsRotatedShelf = payload && payload.rotationApplied === true && upstreamItems.length >= count;
    /* Candidate depth alone is not enough: older relay/D1 unions can contain
       approved identifiers whose resolved file URL was lost at persistence
       time. Count playable rows for the repair gate so those lanes pull their
       real Archive files instead of reopening the same five playable rows. */
    const needsCatalogDepthRepair = upstreamPlayableCandidateDepth < IA_MIN_ROLLING_CATALOG_DEPTH;
    /* A persistent freshness ledger can legitimately consume most of a small
       upstream shelf. Refill from the deeper D1 catalog before rotation when
       the remaining unseen window cannot satisfy the requested shelf; do not
       relax freshness or recycle a recently served program just to reach five. */
    const recentWindow = recentCatalogIds(body).size;
    const needsFreshnessRefill = recentWindow >= count && upstreamPlayableCandidateDepth < Math.min(MAX_CATALOG_ITEMS, recentWindow + count);
    /* A full relay-owned rotation is already the correct public shelf. D1 is
       allowed to deepen the catalog in the background, but replacing this
       shelf synchronously makes a moving D1 union slide the rotation cursor
       back onto the same opening programs. */
    if (!relayOwnsRotatedShelf && (upstreamItems.length < count || needsCatalogDepthRepair || needsFreshnessRefill)) {
      try {
        const fallback = await catalogFallback(env, body, Math.max(MAX_CATALOG_ITEMS, count));
        const fallbackItems = fallback && Array.isArray(fallback.candidateItems) && fallback.candidateItems.length ? fallback.candidateItems : (fallback ? fallback.items : []);
        const seen = new Set(upstreamCandidates.map(queueItemKey));
        const additions = uniqueQueueItems(fallbackItems, body).filter((item) => !seen.has(queueItemKey(item)));
        if (additions.length) {
          const currentCandidates = Array.isArray(payload.candidateItems) && payload.candidateItems.length ? payload.candidateItems : upstreamItems;
          const mergedCandidates = stableCatalogItems([...currentCandidates, ...fallbackItems], body, MAX_CATALOG_ITEMS);
          /* Put the already-rotated recovery shelf first. The old merge put
             upstreamItems first, so a deep D1 recovery catalog was present in
             `candidateItems` but the public five-item shelf still came from
             the stale relay opening window. */
          const recoveryShelf = fallback && Array.isArray(fallback.items) ? fallback.items : [];
          const mergedPlayable = mergedCandidates.filter((item) => item && item.identifier && ((item.media && item.media.url) || item.mediaUrl || item.url));
          /* The relay may already have selected the correct rotation window.
             D1 enrichment must not rotate that shelf a second time; doing so
             moved the public window back onto the old opening items whenever
             the fallback catalog was alphabetically wider than the relay. */
          const upstreamAlreadyRotated = payload && payload.rotationApplied === true && upstreamItems.length >= count;
          const rotatedRecovery = upstreamAlreadyRotated
            ? upstreamItems.slice(0, count)
            : rotateCatalogItems(mergedPlayable, (Number(body.rotation) || 0) * count).slice(0, count);
          const mergedItems = uniqueQueueItems([...rotatedRecovery, ...recoveryShelf, ...upstreamItems, ...additions], body, MAX_CATALOG_ITEMS);
          payload = limitPublicIaShelf({
            ...payload,
            items: mergedItems,
            candidateItems: mergedCandidates,
            ready: Math.min(mergedItems.length, count),
            candidates: mergedCandidates.length,
            catalogRecovery: true,
          }, count);
          catalogRecovery = true;
        }
      } catch (error) { console.warn(JSON.stringify({ event: "catalog-shallow-recovery-failed", requestId: id, error: String(error).slice(0, 160) })); }
    }
  }
  const responseCandidateItems = Array.isArray(payload && payload.candidateItems)
    ? payload.candidateItems
    : (Array.isArray(payload && payload.items) ? payload.items : []);
  const responseCandidateDepth = responseCandidateItems.filter(queueItemPlayable).length;
  if (responseCandidateDepth < IA_MIN_ROLLING_CATALOG_DEPTH && shouldRefreshShallowCatalog(body.channel)) {
    /* Non-fast lanes get the same non-blocking catalog repair. The API still
       returns the current playable shelf immediately; this only makes the
       next request deeper and fresher. */
    ctx.waitUntil(refreshShallowCatalog(env, request, body, id, responseCandidateDepth));
  }
  /* Some relay-owned lanes have a verified playable catalog behind the public
     five-item handoff but do not carry the relay's full-window marker. Rotate
     that catalog at the API edge before returning it. This is deliberately
     skipped for recovery merges and already-rotated shelves, and never runs on
     Source Suite, so it cannot double-advance a shelf or create a new media
     hydration path. */
  const playableCandidateDepth = Array.isArray(payload && payload.candidateItems)
    ? payload.candidateItems.filter(queueItemPlayable).length
    : 0;
  if (!useServerCatalog && !catalogRecovery && payload && payload.rotationApplied !== true && playableCandidateDepth > count) {
    payload = localRotationFallback(payload, body);
  }
  let rotated;
  if (!useServerCatalog || archiveFamilyRelayRail) {
    /* The relay already owns IA rotation and its played-only freshness ledger.
       Return its verified shelf unchanged so the API Durable Object cannot
       mark queued items as seen or recreate the same-five regression. */
    rotated = { payload, rotation: { configured: false, relayOwned: true } };
  } else {
    try { rotated = await rotateShelf(env, body, payload, request); }
    catch (error) {
      console.warn(JSON.stringify({ event: "v2-rotation-fallback", requestId: id, error: String(error).slice(0, 160) }));
      rotated = { payload: localRotationFallback(payload, body), rotation: { configured: false, fallback: true } };
    }
  }
  if (useServerCatalog && IA_ROTATION_REFILL_LANES.has(String(body.channel)) && Number(rotated.payload && rotated.payload.ready || 0) < count) {
    /* The session DO has already recorded the first fresh selections. Add a
       deeper D1 shelf and ask it once more for the missing unseen slot; this
       preserves freshness while preventing a four-item cold shelf. */
    try {
      const refill = await catalogFallback(env, body, MAX_CATALOG_ITEMS);
      const refillItems = refill && Array.isArray(refill.candidateItems) && refill.candidateItems.length
        ? refill.candidateItems
        : (refill && refill.items) || [];
      const currentCandidates = Array.isArray(rotated.payload && rotated.payload.candidateItems) && rotated.payload.candidateItems.length
        ? rotated.payload.candidateItems
        : (rotated.payload && rotated.payload.items) || [];
      const mergedCandidates = uniqueQueueItems([...currentCandidates, ...refillItems], body, MAX_CATALOG_ITEMS);
      if (mergedCandidates.length > currentCandidates.length) {
        const retryPayload = { ...rotated.payload, candidateItems: mergedCandidates, candidates: mergedCandidates.length };
        const retry = await rotateShelf(env, { ...body, rotation: (Number(body.rotation) || 0) + 1 }, retryPayload, request);
        if (Number(retry.payload && retry.payload.ready || 0) > Number(rotated.payload && rotated.payload.ready || 0)) rotated = retry;
      }
    } catch (error) {
      console.warn(JSON.stringify({ event: "rotation-refill-failed", requestId: id, channel: String(body.channel), error: String(error).slice(0, 160) }));
    }
  }
  rotated = { ...rotated, payload: limitPublicIaShelf(rotated.payload, count) };
  if (catalogJob(body, rotated.payload)) ctx.waitUntil(enqueueCatalog(env, body, rotated.payload));
  const headers = new Headers(corsHeaders());
  headers.set("X-RealSignal-API", apiVersion);
  if (apiVersion === "v3") headers.set("X-RealSignal-Release", V3_RELEASE);
  headers.set("X-RealSignal-Request", id);
  headers.set("X-RealSignal-Source", useServerCatalog
    ? (catalogRecovery ? "d1-catalog+session-rotation" : "ais-relay+session-rotation")
    : (catalogRecovery ? "d1-catalog+relay-owned" : "ais-relay+relay-owned"));
  headers.set("X-RealSignal-Queue", JSON.stringify({ ready: Number(rotated.payload.ready || (rotated.payload.items || []).length), background: !!rotated.payload.hydrating }));
  /* A catalog recovery is a successful queue response. Returning the relay's
     original 4xx/5xx here made the browser discard the valid D1 shelf and
     retry the same dead upstream path. */
  return new Response(JSON.stringify({ ...rotated.payload, apiVersion, release: apiVersion === "v3" ? V3_RELEASE : undefined }), { status: catalogRecovery ? 200 : upstream.status, headers });
}

async function handleCatalog(request, env, ctx) {
  if (!env.realsignal_catalog || typeof env.realsignal_catalog.prepare !== "function") return json({ error: "catalog binding is not configured" }, 503);
  const url = new URL(request.url);
  const channel = String(url.searchParams.get("channel") || "").slice(0, 120);
  if (!channel) return json({ error: "channel is required" }, 400);
  const limit = Math.max(1, Math.min(MAX_CATALOG_ITEMS, Number(url.searchParams.get("limit")) || 20));
  const result = await env.realsignal_catalog.prepare(`SELECT p.* FROM programs p JOIN channel_programs cp ON cp.program_id=p.id WHERE cp.channel_key=? AND p.status='active' ORDER BY cp.last_seen_at DESC LIMIT ?`).bind(channel, limit).all();
  return edgeJson(request, ctx, { channel, items: result.results || [], source: "d1-catalog" }, 200, { "Cache-Control": "public, max-age=15, stale-while-revalidate=60" }, 15);
}

const V3_EVENT_TYPES = new Set([
  "tune-complete", "first-visible-frame", "guide-open", "guide-close", "queue-sample",
  "repeat", "control", "stall", "media-error", "tune-failed", "startup-timeout",
  "source-recovery", "source-recovery-failed", "source-success", "source-failure",
]);

function finiteMetric(value, min = 0, max = 86_400_000) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function telemetryEvents(body) {
  const source = Array.isArray(body && body.events) ? body.events : [body];
  return source.slice(0, 40).map((event) => {
    const type = String(event && event.type || "").slice(0, 48);
    if (!V3_EVENT_TYPES.has(type)) return null;
    const channel = String(event && (event.channel || event.channelKey) || "").replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 120);
    if (!channel) return null;
    return {
      type,
      channel,
      surface: String(event && event.surface || body && body.surface || "unknown").slice(0, 24),
      castConnected: event && event.castConnected === true || body && body.castConnected === true ? 1 : 0,
      valueMs: finiteMetric(event && (event.ms != null ? event.ms : event.valueMs)),
      queueDepth: finiteMetric(event && (event.depth != null ? event.depth : event.queueDepth), 0, 1000),
      programId: String(event && (event.programKey || event.programId) || "").slice(0, 500),
      sourceKey: String(event && (event.source || event.sourceKey) || "").slice(0, 120),
      status: String(event && event.status || "").slice(0, 80),
      metadata: JSON.stringify({ reason: String(event && event.reason || "").slice(0, 120) }),
    };
  }).filter(Boolean);
}

function telemetryDeltas(event) {
  const value = event.valueMs == null ? 0 : event.valueMs;
  const hasValue = event.valueMs != null ? 1 : 0;
  return {
    samples: 1,
    firstCount: event.type === "first-visible-frame" && hasValue ? 1 : 0,
    firstTotal: event.type === "first-visible-frame" ? value : 0,
    firstLast: event.type === "first-visible-frame" ? event.valueMs : null,
    switchCount: event.type === "tune-complete" && hasValue ? 1 : 0,
    switchTotal: event.type === "tune-complete" ? value : 0,
    switchLast: event.type === "tune-complete" ? event.valueMs : null,
    guideCount: (event.type === "guide-open" || event.type === "guide-close") && hasValue ? 1 : 0,
    guideTotal: (event.type === "guide-open" || event.type === "guide-close") ? value : 0,
    guideLast: (event.type === "guide-open" || event.type === "guide-close") ? event.valueMs : null,
    queueCount: event.type === "queue-sample" && event.queueDepth != null ? 1 : 0,
    queueTotal: event.type === "queue-sample" && event.queueDepth != null ? event.queueDepth : 0,
    queueLast: event.type === "queue-sample" ? event.queueDepth : null,
    repeats: event.type === "repeat" ? 1 : 0,
    skips: event.type === "control" ? 1 : 0,
    stalls: event.type === "stall" ? 1 : 0,
    failures: ["media-error", "tune-failed", "startup-timeout", "source-recovery-failed"].includes(event.type) ? 1 : 0,
    recoveries: ["source-recovery", "source-success"].includes(event.type) ? 1 : 0,
  };
}

async function persistTelemetry(env, events, clientKey) {
  if (!events.length || !env.realsignal_catalog || typeof env.realsignal_catalog.batch !== "function") return;
  const now = Date.now();
  const statements = [];
  for (const event of events) {
    const id = `${now.toString(36)}-${crypto.randomUUID()}`;
    statements.push(env.realsignal_catalog.prepare(`INSERT INTO playback_events (id, channel_key, client_key, surface, cast_connected, event_type, value_ms, queue_depth, program_id, source_key, created_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, event.channel, clientKey, event.surface, event.castConnected, event.type, event.valueMs, event.queueDepth, event.programId, event.sourceKey, now, event.metadata));
    const d = telemetryDeltas(event);
    statements.push(env.realsignal_catalog.prepare(`INSERT INTO channel_health (channel_key, samples, first_frame_count, first_frame_total_ms, first_frame_last_ms, switch_count, switch_total_ms, switch_last_ms, guide_count, guide_total_ms, guide_last_ms, queue_samples, queue_total_depth, queue_last_depth, repeats, skips, stalls, failures, recoveries, last_status, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(channel_key) DO UPDATE SET samples=channel_health.samples+excluded.samples, first_frame_count=channel_health.first_frame_count+excluded.first_frame_count, first_frame_total_ms=channel_health.first_frame_total_ms+excluded.first_frame_total_ms, first_frame_last_ms=COALESCE(excluded.first_frame_last_ms, channel_health.first_frame_last_ms), switch_count=channel_health.switch_count+excluded.switch_count, switch_total_ms=channel_health.switch_total_ms+excluded.switch_total_ms, switch_last_ms=COALESCE(excluded.switch_last_ms, channel_health.switch_last_ms), guide_count=channel_health.guide_count+excluded.guide_count, guide_total_ms=channel_health.guide_total_ms+excluded.guide_total_ms, guide_last_ms=COALESCE(excluded.guide_last_ms, channel_health.guide_last_ms), queue_samples=channel_health.queue_samples+excluded.queue_samples, queue_total_depth=channel_health.queue_total_depth+excluded.queue_total_depth, queue_last_depth=COALESCE(excluded.queue_last_depth, channel_health.queue_last_depth), repeats=channel_health.repeats+excluded.repeats, skips=channel_health.skips+excluded.skips, stalls=channel_health.stalls+excluded.stalls, failures=channel_health.failures+excluded.failures, recoveries=channel_health.recoveries+excluded.recoveries, last_status=COALESCE(NULLIF(excluded.last_status, ''), channel_health.last_status), last_seen_at=excluded.last_seen_at`).bind(event.channel, d.samples, d.firstCount, d.firstTotal, d.firstLast, d.switchCount, d.switchTotal, d.switchLast, d.guideCount, d.guideTotal, d.guideLast, d.queueCount, d.queueTotal, d.queueLast, d.repeats, d.skips, d.stalls, d.failures, d.recoveries, event.status, now));
    if (event.sourceKey && (event.type === "source-success" || event.type === "source-failure")) {
      const successes = event.type === "source-success" ? 1 : 0;
      const failures = event.type === "source-failure" ? 1 : 0;
      const cooldown = event.type === "source-failure" ? now + 5 * 60 * 1000 : 0;
      statements.push(env.realsignal_catalog.prepare(`INSERT INTO source_health (source_key, successes, failures, cooldown_until, last_error, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(source_key) DO UPDATE SET successes=source_health.successes+excluded.successes, failures=source_health.failures+excluded.failures, cooldown_until=CASE WHEN excluded.failures>0 THEN excluded.cooldown_until ELSE 0 END, last_error=CASE WHEN excluded.failures>0 THEN excluded.last_error ELSE source_health.last_error END, updated_at=excluded.updated_at`).bind(event.sourceKey, successes, failures, cooldown, event.type === "source-failure" ? event.status || "provider failure" : "", now));
    }
  }
  await env.realsignal_catalog.batch(statements);
}

async function handleTelemetry(request, env, ctx, id) {
  let body;
  try { body = await readBoundedJson(request); }
  catch (error) { return json({ error: error instanceof RangeError ? error.message : "invalid JSON body", requestId: id }, error instanceof RangeError ? 413 : 400); }
  const events = telemetryEvents(body);
  if (!events.length) return json({ error: "no valid telemetry events", requestId: id }, 400);
  const clientKey = requestClientKey(request);
  const work = persistTelemetry(env, events, clientKey).catch((error) => {
    console.warn(JSON.stringify({ event: "v3-telemetry-write-failed", requestId: id, error: String(error).slice(0, 180) }));
  });
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(work); else await work;
  return json({ accepted: events.length, apiVersion: "v3", release: V3_RELEASE, requestId: id }, 202, { "Cache-Control": "no-store", "X-RealSignal-Release": V3_RELEASE });
}

async function handleChannelHealth(request, env, ctx) {
  if (!env.realsignal_catalog || typeof env.realsignal_catalog.prepare !== "function") return json({ error: "catalog binding is not configured" }, 503);
  const limit = Math.max(1, Math.min(100, Number(new URL(request.url).searchParams.get("limit")) || 30));
  const result = await env.realsignal_catalog.prepare(`SELECT channel_key, samples, first_frame_count, CASE WHEN first_frame_count>0 THEN ROUND(first_frame_total_ms/first_frame_count) ELSE NULL END AS first_frame_avg_ms, first_frame_last_ms, switch_count, CASE WHEN switch_count>0 THEN ROUND(switch_total_ms/switch_count) ELSE NULL END AS switch_avg_ms, switch_last_ms, guide_count, CASE WHEN guide_count>0 THEN ROUND(guide_total_ms/guide_count) ELSE NULL END AS guide_avg_ms, queue_samples, CASE WHEN queue_samples>0 THEN ROUND(queue_total_depth/queue_samples) ELSE NULL END AS queue_avg_depth, queue_last_depth, repeats, skips, stalls, failures, recoveries, last_status, last_seen_at FROM channel_health ORDER BY failures DESC, stalls DESC, repeats DESC, last_seen_at DESC LIMIT ?`).bind(limit).all();
  return edgeJson(request, ctx, { apiVersion: "v3", release: V3_RELEASE, channels: result.results || [] }, 200, { "Cache-Control": "public, max-age=15, stale-while-revalidate=60", "X-RealSignal-Release": V3_RELEASE }, 15);
}

function channelHealthScore(row) {
  const failures = Number(row.failures || 0);
  const stalls = Number(row.stalls || 0);
  const repeats = Number(row.repeats || 0);
  const firstFrame = Number(row.first_frame_avg_ms || 0);
  const switchMs = Number(row.switch_avg_ms || 0);
  let score = 100;
  score -= Math.min(42, failures * 12);
  score -= Math.min(24, stalls * 8);
  score -= Math.min(20, repeats * 4);
  if (firstFrame > 3000) score -= Math.min(18, Math.round((firstFrame - 3000) / 500));
  if (switchMs > 1500) score -= Math.min(12, Math.round((switchMs - 1500) / 500));
  return Math.max(0, Math.min(100, Math.round(score)));
}

async function handleHealthSummary(request, env, ctx) {
  if (!env.realsignal_catalog || typeof env.realsignal_catalog.prepare !== "function") return json({ error: "catalog binding is not configured" }, 503);
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 40));
  const hours = Math.max(1, Math.min(168, Number(url.searchParams.get("hours")) || 24));
  const since = Date.now() - (hours * 60 * 60 * 1000);
  /* Summary windows must be calculated from events inside the requested period.
     Filtering cumulative channel_health rows by last_seen_at made one old outlier
     poison every later 24-hour report. The lifetime scorecard remains available at
     /health/channels; this endpoint now means exactly what windowHours says. */
  const channelQuery = env.realsignal_catalog.prepare(`WITH recent AS (
    SELECT channel_key, event_type, value_ms, queue_depth, created_at
    FROM playback_events
    WHERE created_at>=?
  ), aggregated AS (
    SELECT channel_key,
      COUNT(*) AS samples,
      SUM(CASE WHEN event_type='first-visible-frame' AND value_ms IS NOT NULL THEN 1 ELSE 0 END) AS first_frame_count,
      ROUND(AVG(CASE WHEN event_type='first-visible-frame' THEN value_ms END)) AS first_frame_avg_ms,
      SUM(CASE WHEN event_type='tune-complete' AND value_ms IS NOT NULL THEN 1 ELSE 0 END) AS switch_count,
      ROUND(AVG(CASE WHEN event_type='tune-complete' THEN value_ms END)) AS switch_avg_ms,
      SUM(CASE WHEN event_type IN ('guide-open','guide-close') AND value_ms IS NOT NULL THEN 1 ELSE 0 END) AS guide_count,
      ROUND(AVG(CASE WHEN event_type IN ('guide-open','guide-close') THEN value_ms END)) AS guide_avg_ms,
      SUM(CASE WHEN event_type='queue-sample' AND queue_depth IS NOT NULL THEN 1 ELSE 0 END) AS queue_samples,
      ROUND(AVG(CASE WHEN event_type='queue-sample' THEN queue_depth END), 1) AS queue_avg_depth,
      SUM(CASE WHEN event_type='repeat' THEN 1 ELSE 0 END) AS repeats,
      SUM(CASE WHEN event_type='control' THEN 1 ELSE 0 END) AS skips,
      SUM(CASE WHEN event_type='stall' THEN 1 ELSE 0 END) AS stalls,
      SUM(CASE WHEN event_type IN ('media-error','tune-failed','startup-timeout','source-recovery-failed') THEN 1 ELSE 0 END) AS failures,
      SUM(CASE WHEN event_type IN ('source-recovery','source-success') THEN 1 ELSE 0 END) AS recoveries,
      MAX(created_at) AS last_seen_at
    FROM recent GROUP BY channel_key
  ), latest AS (
    SELECT channel_key, event_type, value_ms, queue_depth,
      ROW_NUMBER() OVER (PARTITION BY channel_key, event_type ORDER BY created_at DESC) AS rn
    FROM recent
    WHERE event_type IN ('first-visible-frame','tune-complete','guide-open','guide-close','queue-sample')
  )
  SELECT a.*,
    MAX(CASE WHEN l.event_type='first-visible-frame' AND l.rn=1 THEN l.value_ms END) AS first_frame_last_ms,
    MAX(CASE WHEN l.event_type='tune-complete' AND l.rn=1 THEN l.value_ms END) AS switch_last_ms,
    MAX(CASE WHEN l.event_type IN ('guide-open','guide-close') AND l.rn=1 THEN l.value_ms END) AS guide_last_ms,
    MAX(CASE WHEN l.event_type='queue-sample' AND l.rn=1 THEN l.queue_depth END) AS queue_last_depth,
    '' AS last_status
  FROM aggregated a LEFT JOIN latest l ON l.channel_key=a.channel_key
  GROUP BY a.channel_key
  ORDER BY a.failures DESC, a.stalls DESC, a.repeats DESC, a.last_seen_at DESC
  LIMIT ?`).bind(since, limit).all();
  const sourceQuery = env.realsignal_catalog.prepare(`SELECT source_key, successes, failures, cooldown_until, last_error, updated_at FROM source_health WHERE updated_at>=? ORDER BY failures DESC, successes DESC, updated_at DESC LIMIT 100`).bind(since).all();
  const surfaceQuery = env.realsignal_catalog.prepare(`SELECT surface, cast_connected, COUNT(*) AS events, SUM(CASE WHEN event_type='first-visible-frame' THEN 1 ELSE 0 END) AS frames, SUM(CASE WHEN event_type IN ('media-error','tune-failed','startup-timeout','source-recovery-failed') THEN 1 ELSE 0 END) AS failures FROM playback_events WHERE created_at>=? GROUP BY surface, cast_connected ORDER BY events DESC`).bind(since).all();
  const totalsQuery = env.realsignal_catalog.prepare(`SELECT COUNT(*) AS events, SUM(CASE WHEN event_type='first-visible-frame' THEN 1 ELSE 0 END) AS frames, SUM(CASE WHEN event_type IN ('media-error','tune-failed','startup-timeout','source-recovery-failed') THEN 1 ELSE 0 END) AS failures, SUM(CASE WHEN event_type='repeat' THEN 1 ELSE 0 END) AS repeats, SUM(CASE WHEN event_type='stall' THEN 1 ELSE 0 END) AS stalls, SUM(CASE WHEN event_type='source-recovery' THEN 1 ELSE 0 END) AS recoveries FROM playback_events WHERE created_at>=?`).bind(since).first();
  const [channels, sources, surfaces, totals] = await Promise.all([channelQuery, sourceQuery, surfaceQuery, totalsQuery]);
  let freshness = [];
  try {
    const ledger = await env.realsignal_catalog.prepare(`SELECT channel_key, COUNT(*) AS ledger_items, MAX(last_served_at) AS last_served_at, SUM(play_count) AS plays FROM channel_freshness GROUP BY channel_key ORDER BY last_served_at DESC LIMIT 100`).all();
    freshness = ledger.results || [];
  } catch (_) { /* V4 migration may still be rolling through environments. */ }
  const channelRows = (channels.results || []).map((row) => {
    const score = channelHealthScore(row);
    return { ...row, score, band: score >= 85 ? "healthy" : score >= 65 ? "watch" : "repair" };
  });
  const sourceRows = (sources.results || []).map((row) => ({ ...row, cooldownActive: Number(row.cooldown_until || 0) > Date.now() }));
  const totalRows = totals || {};
  const scores = channelRows.map((row) => row.score);
  const overallScore = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;
  return edgeJson(request, ctx, { apiVersion: "v3", release: V3_RELEASE, windowHours: hours, generatedAt: new Date().toISOString(), overallScore, status: overallScore == null ? "waiting" : overallScore >= 85 ? "healthy" : overallScore >= 65 ? "watch" : "repair", totals: { events: Number(totalRows.events || 0), frames: Number(totalRows.frames || 0), failures: Number(totalRows.failures || 0), repeats: Number(totalRows.repeats || 0), stalls: Number(totalRows.stalls || 0), recoveries: Number(totalRows.recoveries || 0) }, channels: channelRows, sources: sourceRows, surfaces: surfaces.results || [], freshness }, 200, { "Cache-Control": "public, max-age=15, stale-while-revalidate=60", "X-RealSignal-Release": V3_RELEASE }, 15);
}

async function handleGuide(request, env, ctx) {
  const url = new URL(request.url);
  const channel = String(url.searchParams.get("channel") || "").replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 120);
  if (!channel) return json({ error: "channel is required" }, 400);
  const limit = Math.max(2, Math.min(20, Number(url.searchParams.get("limit")) || 8));
  const canonical = canonicalPilotProfile(channel);
  if (canonicalPilotEnabled(env, channel)) {
    const recentIds = await readFreshnessIds(env, channel);
    const guide = canonicalGuide(canonical.manifest, recentIds, limit);
    return edgeJson(request, ctx, {
      apiVersion: "v3",
      release: V3_RELEASE,
      channel,
      ...guide,
      verified: true,
      queueModel: "rolling-1-plus-2",
      freshnessLedger: recentIds.length > 0,
      source: "ia-canonical-manifest",
      canonicalPilot: true,
      canonicalSchemaVersion: IA_CANONICAL_SCHEMA_VERSION,
      canonicalProfileKey: canonical.profile.profileKey,
      canonicalGeneratedAt: canonical.manifest.generatedAt,
      generatedAt: new Date().toISOString(),
    }, 200, { "Cache-Control": "public, max-age=10, stale-while-revalidate=30", "X-RealSignal-Release": V3_RELEASE, "X-RealSignal-Source": "ia-canonical-pilot" }, 10);
  }
  if (!env.realsignal_catalog || typeof env.realsignal_catalog.prepare !== "function") return json({ error: "catalog binding is not configured" }, 503);
  const sourceProfileForGuide = sourceProfile({ profileKey: channel });
  const blockedProvidersForGuide = sourceProfileForGuide ? await readSourceCooldowns(env, sourceProfileForGuide.profileKey) : new Set();
  const guideLimit = Math.min(40, limit * Math.max(1, blockedProvidersForGuide.size + 1));
  let result;
  try {
    result = await env.realsignal_catalog.prepare(`SELECT p.id, p.title, p.description, p.provider, p.duration_seconds, p.media_type, p.media_url, p.source_url, p.rights, p.year, cp.last_seen_at, cf.last_served_at, cf.play_count, COUNT(*) OVER () AS catalog_depth, SUM(CASE WHEN cf.last_served_at IS NULL THEN 1 ELSE 0 END) OVER () AS unseen_count FROM programs p JOIN channel_programs cp ON cp.program_id=p.id LEFT JOIN channel_freshness cf ON cf.channel_key=cp.channel_key AND cf.program_id=p.id WHERE cp.channel_key=? AND p.status='active' AND p.media_url IS NOT NULL ORDER BY CASE WHEN cf.last_served_at IS NULL THEN 0 ELSE 1 END, cf.last_served_at ASC, cp.last_seen_at DESC LIMIT ?`).bind(channel, guideLimit).all();
  } catch (_) {
    /* Serve the verified guide during the short migration window before the
       V4 freshness table has been applied in every environment. */
    result = await env.realsignal_catalog.prepare(`SELECT p.id, p.title, p.description, p.provider, p.duration_seconds, p.media_type, p.media_url, p.source_url, p.rights, p.year, cp.last_seen_at, COUNT(*) OVER () AS catalog_depth FROM programs p JOIN channel_programs cp ON cp.program_id=p.id WHERE cp.channel_key=? AND p.status='active' AND p.media_url IS NOT NULL ORDER BY cp.last_seen_at DESC LIMIT ?`).bind(channel, guideLimit).all();
  }
  const items = (result.results || []).map((item) => ({
    ...item,
    duration: Number(item.duration_seconds || 0) || null,
    runtime: Number(item.duration_seconds || 0) || null,
    provider: item.provider || "verified catalog",
  })).filter((item) => !blockedProvidersForGuide.has(sourceProviderKey(item.provider))).slice(0, limit);
  const catalogDepth = Number(items[0] && items[0].catalog_depth) || items.length;
  const unseenCount = Number.isFinite(Number(items[0] && items[0].unseen_count)) ? Number(items[0].unseen_count) : catalogDepth;
  const seenCount = Math.max(0, catalogDepth - unseenCount);
  const catalogExhausted = catalogDepth > 0 && unseenCount === 0;
  return edgeJson(request, ctx, { apiVersion: "v3", release: V3_RELEASE, channel, current: items[0] || null, next: items[1] || null, items, verified: true, queueModel: "rolling-1-plus-2", catalogDepth, unseenCount, seenCount, catalogExhausted, repeatAllowed: catalogExhausted, freshnessLedger: items.some((item) => item.last_served_at != null), generatedAt: new Date().toISOString(), source: "d1-verified-catalog" }, 200, { "Cache-Control": "public, max-age=10, stale-while-revalidate=30", "X-RealSignal-Release": V3_RELEASE }, 10);
}

async function firstSourceLane(tasks) {
  return new Promise((resolve) => {
    let remaining = tasks.length;
    let settled = false;
    if (!remaining) return resolve({ items: [], lanes: [], ready: 0 });
    tasks.forEach((task) => {
      Promise.resolve(task).then((lane) => {
        const items = Array.isArray(lane && lane.items) ? lane.items : [];
        if (!settled && items.length) {
          settled = true;
          resolve({ items, lanes: [lane], ready: items.length, candidates: items.length, hydrating: true });
        }
        remaining -= 1;
        if (!remaining && !settled) resolve({ items: [], lanes: [], ready: 0, candidates: 0, hydrating: false });
      }).catch(() => {
        remaining -= 1;
        if (!remaining && !settled) resolve({ items: [], lanes: [], ready: 0, candidates: 0, hydrating: false });
      });
    });
  });
}

function sourceProviderKey(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("youtube")) return "youtube";
  if (normalized.includes("peertube")) return "peertube";
  if (normalized.includes("vimeo")) return "vimeo";
  if (normalized.includes("ok.ru") || normalized === "ok" || normalized.startsWith("ok-api") || normalized.startsWith("ok-manifest") || normalized.includes("odnoklassniki")) return "ok";
  return normalized.replace(/[^a-z0-9._-]+/g, "-").slice(0, 40) || "unknown";
}

function sourceProviderAvailability(env, items = [], disabled = [], cooldownProviders = []) {
  const present = sourceProvidersFromItems(Array.isArray(items) ? items : []);
  const blocked = new Set((Array.isArray(disabled) ? disabled : []).concat(Array.isArray(cooldownProviders) ? cooldownProviders : []).map((value) => sourceProviderKey(value)));
  /* OK.ru prefers the signed API when its three secrets exist, but keeps the
     public-embed manifest available as a safe fallback during setup or API
     outages. The manifest adapter reports zero ready items when a lane has
     no approved public embeds instead of inventing content. */
  const okApiConfigured = Boolean(env && env.OK_APPLICATION_KEY && (env.OK_SESSION_KEY || env.OK_ACCESS_TOKEN) && (env.OK_SESSION_SECRET || env.OK_APPLICATION_SECRET));
  const okManifestConfigured = !env || env.OK_PUBLIC_EMBED_MANIFEST_ENABLED !== "false";
  const okConfigured = okApiConfigured || okManifestConfigured;
  const configured = {
    youtube: Boolean(env && env.YOUTUBE_API_KEY),
    peertube: true,
    vimeo: Boolean(env && env.VIMEO_ACCESS_TOKEN),
    ok: okConfigured,
    okApi: okApiConfigured,
  };
  return Object.fromEntries(Object.entries(configured).map(([provider, ready]) => [provider, !blocked.has(provider) && (present.has(provider) || ready)]).concat([['cooldownProviders', Array.from(blocked)] ]));
}

async function readSourceCooldowns(env, profileKey) {
  if (!env.realsignal_catalog || typeof env.realsignal_catalog.prepare !== "function") return new Set();
  try {
    const prefix = `${String(profileKey || "").slice(0, 100)}:%`;
    /* Older releases wrote a cooldown for the harmless "no verified items"
       case. Ignore those legacy rows immediately. A single transport miss is
       also not enough to empty a channel: require two recorded provider
       failures before applying the short recovery cooldown. */
    const result = await env.realsignal_catalog.prepare("SELECT source_key, cooldown_until FROM source_health WHERE source_key LIKE ? AND cooldown_until>? AND COALESCE(last_error, '')<>'no verified items' AND COALESCE(failures, 0)>=2").bind(prefix, Date.now()).all();
    return new Set((result.results || []).map((row) => sourceProviderKey(String(row.source_key || "").split(":").pop())));
  } catch (_) { return new Set(); }
}

/* Read-only, client-equivalent source catalog inspection.  Unlike
   /source/catalog it never schedules provider discovery, so health audits can
   inspect the editorially requalified D1 shelf without turning an audit into
   a search burst. */
async function handleSourceStatus(request, env, ctx) {
  const url = new URL(request.url);
  const profileKey = String(url.searchParams.get("profileKey") || url.searchParams.get("channel") || "").slice(0, 120);
  const profile = sourceProfile({ profileKey });
  if (!profile) return json({ error: "unknown source profile" }, 404);
  const cooldowns = await readSourceCooldowns(env, profile.profileKey);
  const cached = await catalogFallback(env, {
    channel: profile.profileKey,
    sourceCatalog: true,
    denyTerms: profile.deny,
    themeTerms: profile.match,
    intent: profile.intent,
    topics: profile.topics,
    strictTopicTerms: profile.strictTopicTerms,
    programFormats: profile.formats,
    minTitleYear: profile.minTitleYear,
    minContentYear: profile.minContentYear,
    minRuntimeSeconds: profile.minRuntimeSeconds,
    movieLane: profile.movieLane,
    laneRequired: profile.laneRequired,
    laneDeny: profile.laneDeny,
    persistedRelaxed: profile.persistedRelaxed,
    persistedMatch: profile.persistedMatch,
    themeMinScore: 1,
  }, SOURCE_LIMITS.SOURCE_MAX_ITEMS, { ignoreFreshness: true, blockedProviders: cooldowns });
  let items = cached && Array.isArray(cached.candidateItems) ? cached.candidateItems : [];
  let source = cached ? "d1-requalified-source-catalog" : "d1-requalified-source-catalog-empty";
  if (!items.length && Array.isArray(profile.fallbackProfiles) && profile.fallbackProfiles.length) {
    items = await familyCatalogFallback(env, profile, SOURCE_LIMITS.SOURCE_MAX_ITEMS);
    if (items.length) source = "d1-family-source-catalog";
  }
  return edgeJson(request, ctx, {
    apiVersion: "v3",
    release: V3_RELEASE,
    profileKey: profile.profileKey,
    name: profile.name,
    items,
    ready: items.length,
    catalogDepth: Number(cached && cached.catalogDepth || items.length),
    source,
    providerAvailability: sourceProviderAvailability(env, items, [], Array.from(cooldowns)),
    generatedAt: new Date().toISOString(),
  }, 200, { "Cache-Control": "public, max-age=15, stale-while-revalidate=60", "X-RealSignal-Release": V3_RELEASE }, 15);
}


async function persistSourceHealth(env, profile, lanes) {
  if (!env.realsignal_catalog || typeof env.realsignal_catalog.batch !== "function") return;
  const now = Date.now();
  const statements = [];
  for (const lane of Array.isArray(lanes) ? lanes : []) {
    const provider = sourceProviderKey(lane && lane.provider);
    if (provider === "unknown") continue;
    const health = lane && lane.health && typeof lane.health === "object" ? lane.health : {};
    const items = Array.isArray(lane && lane.items) ? lane.items : [];
    /* A missing optional YouTube secret is configuration, not provider health.
       More importantly, an empty query is an editorial miss—not an outage.
       Quarantining a healthy provider for five minutes after one sparse search
       made shallow lanes stay shallow instead of advancing to their next
       query window. Only transport/provider errors earn a cooldown. */
    const skipped = health.skipped === true;
    const failed = !skipped && !!health.error;
    const key = `${profile.profileKey}:${provider}`.slice(0, 120);
    const successes = failed ? 0 : 1;
    const failures = failed ? 1 : 0;
    const cooldown = failed ? now + 5 * 60 * 1000 : 0;
    const error = failed ? String(health.error || "no verified items").slice(0, 240) : "";
    statements.push(env.realsignal_catalog.prepare("INSERT INTO source_health (source_key, successes, failures, cooldown_until, last_error, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(source_key) DO UPDATE SET successes=source_health.successes+excluded.successes, failures=source_health.failures+excluded.failures, cooldown_until=CASE WHEN excluded.failures>0 THEN excluded.cooldown_until ELSE 0 END, last_error=CASE WHEN excluded.failures>0 THEN excluded.last_error ELSE source_health.last_error END, updated_at=excluded.updated_at").bind(key, successes, failures, cooldown, error, now));
  }
  if (statements.length) {
    try { await env.realsignal_catalog.batch(statements); } catch (_) { /* source health cannot block playback */ }
  }
}

async function persistSourceLanes(env, profile, lanes, options = {}) {
  const merged = mergeSourceLanes(profile.profileKey, lanes);
  await persistSourceHealth(env, profile, lanes);
  const job = catalogJob({ channel: profile.profileKey, themeTerms: profile.match, denyTerms: profile.deny, mediaTypes: ["video", "embed"] }, merged);
  if (!job) return merged;
  /* Viewer requests remain queue-backed and non-blocking. Controlled
     maintenance refreshes need an honest depth result, so they write the
     already-verified provider union directly before returning. */
  if (options && options.direct === true) {
    await upsertCatalogJob(env, job);
  } else if (env.realsignal_catalog_refresh && typeof env.realsignal_catalog_refresh.send === "function") {
    await env.realsignal_catalog_refresh.send(job, { contentType: "json" });
  } else {
    await upsertCatalogJob(env, job);
  }
  return merged;
}

function scheduleSourceRefresh(env, ctx, normalized, tasks, requestId, force = false) {
  const refreshKey = String(normalized && normalized.profileKey || "");
  const now = Date.now();
  const previous = sourceRefreshCache.get(refreshKey) || 0;
  if (!refreshKey || (!force && now - previous < 15_000)) return Promise.resolve({ skipped: true, reason: "refresh already scheduled" });
  sourceRefreshCache.set(refreshKey, now);
  if (sourceRefreshCache.size > 512) {
    for (const [key, at] of sourceRefreshCache) if (now - at >= 15_000) sourceRefreshCache.delete(key);
  }
  const background = Promise.all(tasks.map((task) => Promise.resolve(task).catch((error) => ({ provider: "unknown", items: [], health: { error: String(error).slice(0, 160) } })))).then((lanes) => persistSourceLanes(env, normalized, lanes)).catch((error) => {
    console.error(JSON.stringify({ event: "source-catalog-persist-failed", requestId, profileKey: normalized.profileKey, error: String(error).slice(0, 200) }));
  });
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(background);
  return background;
}

async function handleSourceCatalog(request, env, ctx, id) {
  let body;
  try { body = await readBoundedJson(request); }
  catch (error) { return json({ error: error instanceof RangeError ? error.message : "invalid JSON body", requestId: id }, error instanceof RangeError ? 413 : 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "source catalog payload must be an object", requestId: id }, 400);
  const maintenance = body.maintenance === true;
  const profile = sourceProfile(body);
  if (!profile) return json({ error: "unknown source profile", requestId: id }, 404);
  if (!profile.queries.length) return json({ error: "source profile has no discovery queries", requestId: id }, 503);
  const apiVersion = new URL(request.url).pathname.startsWith(V3_PREFIX) ? "v3" : "v2";
  const rotation = Number(body.rotation) || 0;
  const ledgerIds = await readFreshnessIds(env, profile.profileKey);
  const playedIds = Array.from(new Set((Array.isArray(body.playedIds) ? body.playedIds : [])
    .map((value) => String(value || "").trim().slice(0, 500)).filter(Boolean))).slice(0, 8);
  /* Client history is newest-first. Keep the order intact so the freshness
     filter excludes the newest played items first instead of accidentally
     preferring the oldest part of the ledger. */
  const sourceRecentIds = Array.from(new Set((Array.isArray(body.recentIds) ? body.recentIds : []).concat(ledgerIds))).slice(0, 48);
  /* Viewer requests honor provider cooldowns so a slow or failing source can
     never block a shelf. A bounded maintenance repair is different: it is the
     health check that decides whether a cooled provider has recovered, so it
     must be allowed to probe both movie rails again. */
  const disabledProviders = maintenance ? new Set() : await readSourceCooldowns(env, profile.profileKey);
  const cached = await catalogFallback(env, {
    channel: profile.profileKey,
    rotation,
    sourceCatalog: true,
    denyTerms: profile.deny,
    themeTerms: profile.match,
    intent: profile.intent,
    topics: profile.topics,
    strictTopicTerms: profile.strictTopicTerms,
    programFormats: profile.formats,
    minTitleYear: profile.minTitleYear,
    minContentYear: profile.minContentYear,
    minRuntimeSeconds: profile.minRuntimeSeconds,
    movieLane: profile.movieLane,
    laneRequired: profile.laneRequired,
    laneDeny: profile.laneDeny,
    persistedRelaxed: profile.persistedRelaxed,
    persistedMatch: profile.persistedMatch,
    themeMinScore: 1,
    recentIds: sourceRecentIds,
    freshnessLedger: true,
  }, SOURCE_LIMITS.SOURCE_MAX_ITEMS, { blockedProviders: disabledProviders }).catch((error) => {
    console.warn(JSON.stringify({ event: "source-catalog-read-failed", requestId: id, error: String(error).slice(0, 160) }));
    return null;
  });
  const familyFallbackItems = !maintenance && !cached?.items?.length && Array.isArray(profile.fallbackProfiles) && profile.fallbackProfiles.length
    ? await familyCatalogFallback(env, profile, SOURCE_LIMITS.SOURCE_MAX_ITEMS)
    : [];
  if (familyFallbackItems.length) {
    /* A family recovery shelf is an immediate safety net, not the permanent
       catalog. Keep it on air, but still run this profile's own providers in
       the background so a shallow lane can repair itself instead of serving
       the same fallback item forever. */
    const familySourcePlan = sourceCatalogTasks(body, env, rotation, { disabledProviders, maintenance });
    if (familySourcePlan.profile && familySourcePlan.tasks.length) {
      scheduleSourceRefresh(env, ctx, familySourcePlan.profile, familySourcePlan.tasks, id);
    }
    const familyBody = { ...body, recentIds: sourceRecentIds, freshnessLedger: true, count: Math.max(1, Number(body.count) || 5) };
    const freshFamilyItems = applyFreshness(familyFallbackItems, familyBody);
    if (playedIds.length) rememberFreshness(env, profile.profileKey, playedIds, ctx);
    const familyProviders = sourceProvidersFromItems(freshFamilyItems);
    return json({
      profileKey: profile.profileKey,
      items: rotateCatalogItems(freshFamilyItems, rotation),
      ready: freshFamilyItems.length,
      candidates: familyFallbackItems.length,
      catalogDepth: familyFallbackItems.length,
      unseenCatalogItems: freshFamilyItems.length,
      seenCatalogItems: Math.max(0, familyFallbackItems.length - freshFamilyItems.length),
      catalogExhausted: false,
      repeatAllowed: false,
      hydrating: false,
      staleCatalog: false,
      adaptiveFreshness: true,
      freshnessLedger: true,
      freshnessExcluded: Math.max(0, familyFallbackItems.length - freshFamilyItems.length),
      freshnessWindow: sourceRecentIds.length,
      fallbackProfiles: profile.fallbackProfiles,
      catalogVersion: "source-server-1",
      source: "d1-family-source-catalog",
      providerAvailability: sourceProviderAvailability(env, familyFallbackItems, []),
      apiVersion,
      release: apiVersion === "v3" ? V3_RELEASE : undefined,
    }, 200, { "Cache-Control": "public, max-age=10, stale-while-revalidate=60", "X-RealSignal-Request": id, "X-RealSignal-Source": "d1-family-source-catalog", "X-RealSignal-Release": apiVersion === "v3" ? V3_RELEASE : "2.2.2" });
  }
  const minimumReady = Math.max(1, Math.min(SOURCE_LIMITS.SOURCE_MIN_READY, Number(body.minimumReady) || SOURCE_LIMITS.SOURCE_MIN_READY));
  /* Never make a viewer wait for a full refill when D1 already has playable
     rows. A shallow shelf is served immediately and refilled in the
     background; a deep shelf is served as a normal cache hit. */
  const staleReady = Math.max(1, Math.min(3, Number(body.staleReady) || 2));
  const hasFreshFallback = cached && Array.isArray(cached.items) && cached.items.length > 0 && sourceRecentIds.length > 0;
  const forceDeepRefresh = body.refresh === true && cached && Array.isArray(cached.items) && cached.items.length < minimumReady;
  /* Refresh is a hint to refill, never permission to strand a viewer on a
     503. If a verified shelf exists, serve it immediately and let the source
     adapters replace it in the background. */
  if (!maintenance && cached && Array.isArray(cached.items) && (cached.items.length >= staleReady || hasFreshFallback) && !forceDeepRefresh) {
    if (cached.items.length < minimumReady) {
      const { profile: normalized, tasks } = sourceCatalogTasks(body, env, rotation, { disabledProviders });
      scheduleSourceRefresh(env, ctx, normalized, tasks, id);
    }
    const hydrating = body.refresh === true || cached.items.length < minimumReady;
    if (playedIds.length) rememberFreshness(env, profile.profileKey, playedIds, ctx);
    return json({ ...cached, profileKey: profile.profileKey, catalogVersion: "source-server-1", source: "d1-source-catalog", hydrating, staleCatalog: hydrating, adaptiveFreshness: true, freshnessLedger: true, providerAvailability: sourceProviderAvailability(env, cached.items, Array.from(disabledProviders)), apiVersion, release: apiVersion === "v3" ? V3_RELEASE : undefined }, 200, { "Cache-Control": "public, max-age=10, stale-while-revalidate=60", "X-RealSignal-Request": id, "X-RealSignal-Source": "d1-source-catalog", "X-RealSignal-Release": apiVersion === "v3" ? V3_RELEASE : "2.2.2" });
  }
  const sourcePlan = sourceCatalogTasks(body, env, rotation, { disabledProviders, maintenance });
  const normalized = sourcePlan.profile;
  const tasks = sourcePlan.tasks;
  const firstLaneTasks = sourceCatalogTasks(body, env, rotation, { disabledProviders, firstLane: true, maintenance }).tasks;
  let firstTimer;
  let first;
  if (forceDeepRefresh) {
    /* This request was launched by the already-playing client as a background
       refill. Return the first verified provider lane within the same bounded
       window as a cold start; the full provider union continues in the
       background and is persisted without making refresh wait 20+ seconds. */
    first = await Promise.race([
      firstSourceLane(firstLaneTasks.length ? firstLaneTasks : tasks),
      new Promise((resolve) => {
        firstTimer = setTimeout(() => resolve({ items: [], lanes: [], ready: 0, candidates: 0, hydrating: true, timedOut: true }), SOURCE_LIMITS.SOURCE_FIRST_LANE_TIMEOUT_MS);
      }),
    ]).finally(() => clearTimeout(firstTimer));
  } else {
    first = await Promise.race([
      firstSourceLane(firstLaneTasks.length ? firstLaneTasks : tasks),
      new Promise((resolve) => {
        firstTimer = setTimeout(() => resolve({ items: [], lanes: [], ready: 0, candidates: 0, hydrating: true, timedOut: true }), SOURCE_LIMITS.SOURCE_FIRST_LANE_TIMEOUT_MS);
      }),
    ]).finally(() => clearTimeout(firstTimer));
  }
  scheduleSourceRefresh(env, ctx, normalized, tasks, id, forceDeepRefresh);
  if (body.maintenance === true) {
    /* The normal path above deliberately returns the first verified lane so a
       viewer never waits on both providers. A maintenance refresh is the
       explicit exception: await the full provider union and persist it
       synchronously so the returned depth is measurable and durable. */
    const lanes = await Promise.all(tasks.map((task) => Promise.resolve(task).catch((error) => ({ provider: "unknown", items: [], health: { error: String(error).slice(0, 160) } }))));
    const merged = await persistSourceLanes(env, normalized, lanes, { direct: true });
    const maintenanceBody = {
      channel: normalized.profileKey,
      sourceCatalog: true,
      denyTerms: normalized.deny,
      themeTerms: normalized.match,
      intent: normalized.intent,
      topics: normalized.topics,
      strictTopicTerms: normalized.strictTopicTerms,
      programFormats: normalized.formats,
      minTitleYear: normalized.minTitleYear,
      minContentYear: normalized.minContentYear,
      minRuntimeSeconds: normalized.minRuntimeSeconds,
      movieLane: normalized.movieLane,
      laneRequired: normalized.laneRequired,
      laneDeny: normalized.laneDeny,
      persistedRelaxed: normalized.persistedRelaxed,
      persistedMatch: normalized.persistedMatch,
      themeMinScore: 1,
    };
    const verified = uniqueQueueItems(merged.items, maintenanceBody, SOURCE_LIMITS.SOURCE_MAX_ITEMS);
    return json({
      profileKey: normalized.profileKey,
      items: verified,
      ready: verified.length,
      candidates: verified.length,
      catalogDepth: verified.length,
      unseenCatalogItems: verified.length,
      seenCatalogItems: 0,
      catalogExhausted: false,
      repeatAllowed: false,
      lanes,
      hydrating: false,
      maintenance: true,
      adaptiveFreshness: true,
      freshnessLedger: true,
      catalogVersion: "source-server-1",
      source: "server-source-catalog-maintenance",
      providerAvailability: sourceProviderAvailability(env, verified, Array.from(disabledProviders)),
      limits: SOURCE_LIMITS,
      apiVersion,
      release: apiVersion === "v3" ? V3_RELEASE : undefined,
    }, verified.length ? 200 : 503, { "Cache-Control": "no-store", "X-RealSignal-Request": id, "X-RealSignal-Source": "server-source-catalog-maintenance", "X-RealSignal-Release": apiVersion === "v3" ? V3_RELEASE : "2.2.2" });
  }
  const cachedItems = forceDeepRefresh && cached && Array.isArray(cached.candidateItems) ? cached.candidateItems : (forceDeepRefresh && cached && Array.isArray(cached.items) ? cached.items : []);
  const discoveredItems = forceDeepRefresh
    ? uniqueQueueItems(cachedItems.concat(first.items || []), { ...body, sourceCatalog: true, denyTerms: profile.deny, themeTerms: profile.match, strictTopicTerms: profile.strictTopicTerms, minContentYear: profile.minContentYear, minRuntimeSeconds: profile.minRuntimeSeconds, movieLane: profile.movieLane, laneRequired: profile.laneRequired, laneDeny: profile.laneDeny, themeMinScore: 1 }, SOURCE_LIMITS.SOURCE_MAX_ITEMS)
    : first.items;
  const freshnessBody = { ...body, recentIds: sourceRecentIds, freshnessLedger: true };
  const unseenFirstItems = applyFreshness(discoveredItems, freshnessBody);
  const catalogExhausted = discoveredItems.length > 0 && unseenFirstItems.length === 0;
  const freshFirstItems = catalogExhausted ? discoveredItems : unseenFirstItems;
  if (playedIds.length) rememberFreshness(env, normalized.profileKey, playedIds, ctx);
  return json({ profileKey: normalized.profileKey, items: freshFirstItems, ready: freshFirstItems.length, candidates: discoveredItems.length, catalogDepth: discoveredItems.length, unseenCatalogItems: unseenFirstItems.length, seenCatalogItems: Math.max(0, discoveredItems.length - unseenFirstItems.length), catalogExhausted, repeatAllowed: catalogExhausted, lanes: first.lanes, hydrating: true, adaptiveFreshness: true, freshnessLedger: true, freshnessExcluded: Math.max(0, discoveredItems.length - unseenFirstItems.length), freshnessWindow: recentCatalogIds(freshnessBody).size, catalogVersion: "source-server-1", source: forceDeepRefresh ? "server-source-catalog-refresh" : "server-source-catalog", providerAvailability: sourceProviderAvailability(env, freshFirstItems, Array.from(disabledProviders)), limits: SOURCE_LIMITS, apiVersion, release: apiVersion === "v3" ? V3_RELEASE : undefined }, freshFirstItems.length ? 200 : 503, { "Cache-Control": "no-store", "X-RealSignal-Request": id, "X-RealSignal-Source": "server-source-catalog", "X-RealSignal-Release": apiVersion === "v3" ? V3_RELEASE : "2.2.2" });
}

const worker = {
  async fetch(request, env, ctx) {
    const id = requestId();
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders("text/plain; charset=utf-8") });
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return json({ error: "method not allowed", requestId: id }, 405, { Allow: "GET,POST,PUT,PATCH,DELETE,OPTIONS" });
    const url = new URL(request.url);
    const route = routeFor(url.pathname);
    try {
      if (route && route.kind === "health") {
        const v3 = route.apiVersion === "v3";
        return json({ service: "realsignal-api", apiVersion: v3 ? "v3" : "v2", release: v3 ? V3_RELEASE : "2.2.2", status: "ready", capabilities: ["ia-search", "ia-metadata", "ia-queue", "session-rotation", "catalog-jobs", "source-catalog", "adaptive-catalog", "freshness-ledger", ...(v3 ? ["verified-guide", "server-telemetry", "source-health", "edge-manifests", "durable-rate-limit", "queue-dead-letter", "version5-gate", "roku-session", ...(IA_CANONICAL_PILOT_VALUES.has(String(env.IA_CANONICAL_PILOT || "").trim().toLowerCase()) ? ["ia-canonical-pilot"] : []), ...(IA_CANONICAL_SHADOW_VALUES.has(String(env.IA_CANONICAL_SHADOW || "").trim().toLowerCase()) ? ["ia-canonical-shadow"] : [])] : []), "youtube-sports"], bindings: { relay: !!env.RELAY, rotation: !!env.ROTATION, rateLimiter: !!env.RATE_LIMITER, rokuSession: !!env.ROKU_SESSION, catalog: !!env.realsignal_catalog, refreshQueue: !!env.realsignal_catalog_refresh }, checkedAt: new Date().toISOString() }, 200, { "Cache-Control": "no-store", "X-RealSignal-Request": id, "X-RealSignal-Release": v3 ? V3_RELEASE : "2.2.2" });
      }
      if (route && route.kind === "telemetry") {
        if (request.method !== "POST") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "POST,OPTIONS" });
        const limited = await durableRateLimit(request, env, "queue");
        if (limited) return limited;
        return await handleTelemetry(request, env, ctx, id);
      }
      if (route && route.kind === "channel-health") {
        if (request.method !== "GET") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "GET,OPTIONS" });
        return await handleChannelHealth(request, env, ctx);
      }
      if (route && route.kind === "health-summary") {
        if (request.method !== "GET") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "GET,OPTIONS" });
        return await handleHealthSummary(request, env, ctx);
      }
      if (route && route.kind === "roku-session") {
        const limited = await durableRateLimit(request, env, "roku-session");
        if (limited) return limited;
        return await handleRokuSession(request, env, ctx, id);
      }
      if (route && route.kind === "guide") {
        if (request.method !== "GET") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "GET,OPTIONS" });
        return await handleGuide(request, env, ctx);
      }
      if (route && route.kind === "canonical-shadow") {
        if (request.method !== "POST") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "POST,OPTIONS" });
        const limited = await durableRateLimit(request, env, "queue");
        if (limited) return limited;
        return await handleCanonicalShadow(request, env, id);
      }
      if (route && route.kind === "youtube-uploads") {
        if (request.method !== "GET") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "GET,OPTIONS" });
        const limited = await durableRateLimit(request, env, route.kind);
        if (limited) return limited;
        return await handleYouTubeUploads(request, env, id);
      }
      if (route && route.kind === "source-catalog") {
        if (request.method !== "POST") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "POST,OPTIONS" });
        const limited = await durableRateLimit(request, env, route.kind);
        if (limited) return limited;
        return await handleSourceCatalog(request, env, ctx, id);
      }
      if (route && route.kind === "source-status") {
        if (request.method !== "GET") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "GET,OPTIONS" });
        return await handleSourceStatus(request, env, ctx);
      }
      if (route && route.kind === "catalog") {
        if (request.method !== "GET") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "GET,OPTIONS" });
        return await handleCatalog(request, env, ctx);
      }
      if (!route) return json({ error: "not found", requestId: id }, 404);
      if (route.kind === "queue") {
        if (request.method !== "POST") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "POST,OPTIONS" });
        /* Playback is the product. Do not rate-limit normal channel changes;
           expensive discovery/provider routes remain protected below. */
        return await handleQueue(request, env, ctx, id);
      }
      if (request.method !== "GET") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "GET,OPTIONS" });
      return await forwardToRelay(request, env, route.relayPath, undefined, id);
    } catch (error) {
      console.error(JSON.stringify({ event: "api-request-failed", requestId: id, path: url.pathname, error: String(error).slice(0, 200) }));
      return json({ error: "internal server error", requestId: id }, 500, { "Cache-Control": "no-store" });
    }
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      try { await upsertCatalogJob(env, message.body); message.ack(); }
      catch (error) { console.error(JSON.stringify({ event: "catalog-upsert-failed", messageId: message.id, attempts: message.attempts, error: String(error).slice(0, 200) })); message.retry({ delaySeconds: Math.min(300, Math.max(5, Number(message.attempts || 1) * 15)) }); }
    }
  },
};

export { SessionRotation, EdgeRateLimiter, RokuSession, freshnessExclusionIds };
export default worker;
