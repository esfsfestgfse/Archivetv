/* RealSignal Version 2 API.
 *
 * This is a safe parallel entrypoint. The old v1 façade remains in the repo
 * as a rollback reference while V2 adds per-session rotation, background D1
 * catalog writes, and a queue consumer around the proven ais-relay adapter.
 */

import { SessionRotation } from "./realsignal_api_rotation.js";
import { mergeSourceLanes, sourceCatalogTasks, sourceProfile, SOURCE_LIMITS } from "./realsignal_source_catalog.js";
import { IA_CANONICAL_PILOT_PROFILES, IA_CANONICAL_SCHEMA_VERSION, canonicalGuide, selectCanonicalItems } from "./ia_canonical_station.mjs";
import { IA_CANONICAL_PILOT_MANIFESTS } from "./ia_canonical_pilot_manifest.js";

const API_PREFIX = "/api/v2";
const V3_PREFIX = "/api/v3";
const V3_RELEASE = "4.0.9-source-depth-fast-admission";
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
  "10", "11", "12", "56", "64", "110", "150", "154", "158", "205", "222", "922",
]);
const IA_CANONICAL_PILOT_VALUES = new Set(["1", "true", "on", "pilot"]);
const IA_CANONICAL_PROFILE_BY_CHANNEL = new Map(Object.values(IA_CANONICAL_PILOT_PROFILES).map((profile) => [String(profile.channel), profile.profileKey]));
/* A relay response can be playable while still being too shallow for a
   rolling television catalog. Enrich any IA lane below the three-shelf floor
   from D1; a healthy relay response that already carries enough candidates
   keeps the fastest handoff and does not pay for the read. */
const IA_MIN_ROLLING_CATALOG_DEPTH = 15;
/* These lanes additionally need stale-row re-scoring because their measured
   D1 history contained old genreVerified flags from before the current rules. */
const IA_DEPTH_REPAIR_LANES = new Set([
  "15", "18", "21", "114", "200", "203", "214", "501", "502", "507", "921",
]);
/* Some IA collections store the genre in the series/film title rather than
   the child filename. These are deliberately lane-specific aliases for the
   two long-tail lanes that failed the serial certification when their relay
   response was empty; they are not a global relaxation of genre filtering. */
const IA_FALLBACK_ALIASES = Object.freeze({
  "116": Object.freeze(["black charley", "fight for your life", "abby", "brother from another planet", "fighting mad", "foxy brown", "trouble man", "lord shango", "cleopatra jones", "black fist", "human tornado"]),
  "123": Object.freeze(["man in room 17", "world at war", "keeping up appearances", "jason king", "viz", "tomorrow's world", "roger mellie", "garth marenghi", "darkplace", "bbc", "british"]),
});
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
  queue: Object.freeze({ windowMs: 60_000, max: 60 }),
  "youtube-uploads": Object.freeze({ windowMs: 60_000, max: 30 }),
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

function routeFor(pathname) {
  for (const [prefix, apiVersion] of [[API_PREFIX, "v2"], [V3_PREFIX, "v3"]]) {
    if (pathname === `${prefix}/health`) return { kind: "health", apiVersion };
    if (pathname === `${prefix}/youtube/uploads`) return { kind: "youtube-uploads", apiVersion };
    if (pathname === `${prefix}/telemetry`) return { kind: "telemetry", apiVersion };
    if (pathname === `${prefix}/health/channels`) return { kind: "channel-health", apiVersion };
    if (pathname === `${prefix}/health/summary`) return { kind: "health-summary", apiVersion };
    if (pathname === `${prefix}/guide`) return { kind: "guide", apiVersion };
    if (pathname === `${prefix}/ia/queue` || pathname === `${prefix}/ia/program`) return { kind: "queue", apiVersion, prefix };
    if (pathname === `${prefix}/ia/search`) return { kind: "relay", relayPath: "/ia/search", apiVersion };
    if (pathname.startsWith(`${prefix}/ia/metadata/`)) {
      const id = pathname.slice(`${prefix}/ia/metadata/`.length);
      return id ? { kind: "relay", relayPath: `/ia/metadata/${id}`, apiVersion } : null;
    }
    if (pathname === `${prefix}/source/catalog`) return { kind: "source-catalog", apiVersion };
    if (pathname === `${prefix}/source/status`) return { kind: "source-status", apiVersion };
    if (pathname === `${prefix}/catalog`) return { kind: "catalog", apiVersion };
  }
  return null;
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
  return {
    id,
    provider: String(item.provider || item.source || "internet-archive").slice(0, 60),
    sourceIdentifier: String(item.sourceIdentifier || item.identifier || id).slice(0, 500),
    title: String(item.title || "Untitled").slice(0, 500),
    description: String(item.description || "").slice(0, 2000),
    subject: String(item.subject || item.subjects || "").slice(0, 1200),
    tags: String(item.tags || "").slice(0, 1200),
    category: String(item.category || "").slice(0, 240),
    account: String(item.account || "").slice(0, 240),
    query: String(item.query || "").slice(0, 240),
    duration: Number(item.duration || item.runtime) || null,
    aspectRatio: Number(item.aspectRatio) || null,
    mediaType: String((item.media && item.media.type) || item.type || "video").slice(0, 30),
    mediaUrl: String((item.media && item.media.url) || item.url || "").slice(0, 1500),
    sourceUrl: String(item.sourceUrl || "").slice(0, 1500),
    rights: String(item.rights || "").slice(0, 300),
    year: String(item.year || "").slice(0, 20),
    genreVerified: item.genreVerified === true,
  };
}

function queueItemKey(item) {
  return String(item && (item.identifier || item.id || (item.media && item.media.url) || item.url) || "").trim();
}

function uniqueQueueItems(items, body, limit = MAX_CATALOG_ITEMS) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = queueItemKey(item);
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
  if (!env.realsignal_catalog_refresh || typeof env.realsignal_catalog_refresh.send !== "function") return;
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
    await enqueueCatalog(env, refreshBody, { ...payload, items, candidateItems: items });
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
  const selectedItems = Array.isArray(selected.items) ? selected.items : [];
  const selectedCatalog = Array.isArray(selected.catalog) && selected.catalog.length ? selected.catalog : candidates;
  /* The relay may intentionally return one verified first-frame item while
     its candidate catalog already carries additional direct media URLs. Once
     rotation selects those playable candidates, readiness must describe the
     returned shelf—not the relay's earlier handoff count. */
  const playableSelected = selectedItems.filter((item) => {
    const media = item && item.media;
    return Boolean((media && media.url) || item && item.mediaUrl || item && item.url);
  }).length;
  const selectedReady = Math.max(upstreamReady, playableSelected);
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
      if (retrySelected && (!Array.isArray(retrySelected.selectionRepeatIds) || !retrySelected.selectionRepeatIds.length || retrySelected.cycleReset)) Object.assign(selected, retrySelected);
    }
  }
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
  /* Query text is retained for provenance, never as a genre signal. A search
     for “cannabis history” must not make an unrelated history upload look
     like Green Culture after it is persisted. */
  const haystack = `${title} ${description} ${subject} ${tags} ${category} ${account} ${sourceIdentifier} ${normalizedSourceIdentifier}`;
  const denyTerms = Array.isArray(body && body.denyTerms) ? body.denyTerms : [];
  if (denyTerms.some((term) => {
    const needle = String(term || "").trim().toLowerCase();
    return needle && haystack.includes(needle);
  })) return false;
  /* A relay-verified item has already passed the channel's full source-side
     genre rules. Preserve that provenance when a child film title is
     editorially correct but does not literally repeat the required phrase
     (for example, a factory film titled "Master Hands"). */
  const relayVerified = item && item.genreVerified === true && !IA_DEPTH_REPAIR_LANES.has(String(body && body.channel || ""));
  const strictManufacturingLane = String(body && body.channel || "") === "200";
  const manufacturingSubjectMatch = strictManufacturingLane && Array.isArray(body && body.themeTerms)
    && body.themeTerms.some((term) => {
      const needle = String(term || "").trim().toLowerCase();
      return needle && subject.includes(needle);
    });
  const requiredTitleTerms = Array.isArray(body && body.requiredTitleTerms) ? body.requiredTitleTerms : [];
  if (requiredTitleTerms.length && !relayVerified && !manufacturingSubjectMatch && !requiredTitleTerms.some((term) => {
    const needle = String(term || "").trim().toLowerCase();
    return needle && title.includes(needle);
  })) return false;
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
    const ratio = Number(item && item.aspectRatio) || 0;
    if (runtime < SOURCE_LIMITS.SOURCE_MIN_RUNTIME) return false;
    if (ratio < SOURCE_LIMITS.SOURCE_MIN_ASPECT_RATIO) return false;
    if (audio || (mediaType !== "video" && mediaType !== "embed")) return false;
    /* Requalify persisted Source Suite rows whenever an entertainment lane
       changes its editorial contract. Otherwise an older documentary entry
       can survive indefinitely just because it happens to share one topic
       word with the new TV/film lane. */
    if (/^(?:television|film|performance)$/.test(String(body.intent || ""))) {
      const programDeny = /(?:history of|documentary about|retrospective|video essay|analysis|explained|lecture|seminar|webinar|conference|panel discussion|making of|behind the scenes|demo reel|showreel|workshop|masterclass|recap|production reel|festival reel)/i;
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
      if (formats.length && !formats.some((term) => {
        const needle = String(term || "").trim().toLowerCase();
        return needle && title.includes(needle);
      })) return false;
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
  const candidateItems = uniqueQueueItems(
    Array.isArray(payload && payload.candidateItems) && payload.candidateItems.length
      ? payload.candidateItems
      : ((payload && payload.items) || []),
    body,
    MAX_CATALOG_ITEMS,
  );
  const fresh = applyFreshness(candidateItems, body);
  const items = rotateCatalogItems(fresh, Number(body && body.rotation) || 0).slice(0, count);
  return {
    ...payload,
    items,
    candidateItems,
    candidates: candidateItems.length,
    ready: items.length,
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
  const effectiveBody = ignoreFreshness
    ? { ...body, recentIds: [], freshnessLedger: false }
    : await withFreshnessLedger(env, body);
  const channel = normalizedChannelKey(effectiveBody.channel);
  const limit = Math.max(1, Math.min(SOURCE_LIMITS.SOURCE_MAX_ITEMS, Number(requestedLimit) || SOURCE_LIMITS.SOURCE_MAX_ITEMS));
  const result = await env.realsignal_catalog.prepare(`SELECT p.* FROM programs p JOIN channel_programs cp ON cp.program_id=p.id WHERE cp.channel_key=? AND p.status='active' AND p.media_url IS NOT NULL ORDER BY cp.last_seen_at DESC LIMIT ?`).bind(channel, limit).all();
  const items = (result.results || []).map((row) => {
    let metadata = {};
    try { metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {}; } catch (_) { /* tolerate old rows */ }
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
      provider: row.provider,
      year: row.year || "",
      duration: Number(row.duration_seconds || metadata.duration || metadata.runtime) || null,
      runtime: Number(row.duration_seconds || metadata.duration || metadata.runtime) || null,
      aspectRatio: Number(row.aspect_ratio || metadata.aspectRatio || metadata.aspect_ratio || metadata.ratio) || null,
      mediaType: row.media_type || "video",
      media: { type: row.media_type || "video", url: row.media_url },
      type: row.media_type === "embed" ? "embed" : "video",
      url: row.media_url,
      embedUrl: row.media_type === "embed" ? row.media_url : "",
      sourceUrl: row.source_url || "",
      rights: row.rights || "",
      staleCatalog: true,
    };
  });
  const blockedProviders = options && options.blockedProviders instanceof Set ? options.blockedProviders : new Set();
  /* A row from a provider currently in cooldown is not a fallback. Returning
     it here would make the guide and ready shelf suggest the exact provider
     that just timed out. Filter it before requalification and rotation. */
  const eligibleItems = items.filter((item) => !blockedProviders.has(sourceProviderKey(item && item.provider)));
  const filtered = uniqueQueueItems(eligibleItems, effectiveBody);
  const fresh = ignoreFreshness ? filtered : applyFreshness(filtered, effectiveBody);
  /* Source Suite may legitimately exhaust a small catalog. Repeat only after
     every verified row has appeared; never turn exhaustion into a 503 or hide
     the real catalog depth from the guide. */
  const exhausted = !ignoreFreshness && effectiveBody.sourceCatalog === true && filtered.length > 0 && fresh.length === 0;
  const selected = exhausted ? filtered : fresh;
  const seenCount = Math.max(0, filtered.length - fresh.length);
  return selected.length ? {
    items: rotateCatalogItems(selected, effectiveBody.rotation),
    candidateItems: filtered,
    ready: selected.length,
    candidates: filtered.length,
    catalogDepth: filtered.length,
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

async function handleQueue(request, env, ctx, id) {
  let body;
  try { body = await readBoundedJson(request); }
  catch (error) { return json({ error: error instanceof RangeError ? error.message : "invalid JSON body", requestId: id }, error instanceof RangeError ? 413 : 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "queue payload must be an object", requestId: id }, 400);
  if (!String(body.channel || "").trim()) return json({ error: "channel is required", requestId: id }, 400);
  body = await withFreshnessLedger(env, body);
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
      rememberFreshness(env, body.channel, canonicalPayload.items, ctx);
      return new Response(JSON.stringify({ ...canonicalPayload, apiVersion, release: apiVersion === "v3" ? V3_RELEASE : undefined }), { status: 200, headers });
    }
  }
  if (IA_FAST_CATALOG_LANES.has(String(body.channel))) {
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
        rememberFreshness(env, body.channel, fastRotated.payload.items, ctx);
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
    payload = { ...payload, items: upstreamItems, candidateItems: upstreamCandidates, candidates: upstreamCandidates.length, ready: Math.min(Number(payload && payload.ready) || upstreamItems.length, upstreamItems.length) };
    const upstreamCandidateDepth = upstreamCandidates.length;
    const needsCatalogDepthRepair = upstreamCandidateDepth < IA_MIN_ROLLING_CATALOG_DEPTH;
    /* A persistent freshness ledger can legitimately consume most of a small
       upstream shelf. Refill from the deeper D1 catalog before rotation when
       the remaining unseen window cannot satisfy the requested shelf; do not
       relax freshness or recycle a recently served program just to reach five. */
    const recentWindow = recentCatalogIds(body).size;
    const needsFreshnessRefill = recentWindow >= count && upstreamCandidateDepth < Math.min(MAX_CATALOG_ITEMS, recentWindow + count);
    if (upstreamItems.length < count || needsCatalogDepthRepair || needsFreshnessRefill) {
      try {
        const fallback = await catalogFallback(env, body, Math.max(MAX_CATALOG_ITEMS, count));
        const fallbackItems = fallback && Array.isArray(fallback.candidateItems) && fallback.candidateItems.length ? fallback.candidateItems : (fallback ? fallback.items : []);
        const seen = new Set(upstreamCandidates.map(queueItemKey));
        const additions = uniqueQueueItems(fallbackItems, body).filter((item) => !seen.has(queueItemKey(item)));
        if (additions.length) {
          const currentCandidates = Array.isArray(payload.candidateItems) && payload.candidateItems.length ? payload.candidateItems : upstreamItems;
          const mergedCandidates = uniqueQueueItems([...currentCandidates, ...fallbackItems], body, MAX_CATALOG_ITEMS);
          const mergedItems = uniqueQueueItems([...upstreamItems, ...additions], body, MAX_CATALOG_ITEMS);
          payload = { ...payload, items: mergedItems, candidateItems: mergedCandidates, ready: Math.min(mergedItems.length, count), candidates: mergedCandidates.length, catalogRecovery: true };
          catalogRecovery = true;
        }
      } catch (error) { console.warn(JSON.stringify({ event: "catalog-shallow-recovery-failed", requestId: id, error: String(error).slice(0, 160) })); }
    }
  }
  const responseCandidateDepth = Array.isArray(payload && payload.candidateItems)
    ? payload.candidateItems.length
    : (Array.isArray(payload && payload.items) ? payload.items.length : 0);
  if (responseCandidateDepth < IA_MIN_ROLLING_CATALOG_DEPTH && shouldRefreshShallowCatalog(body.channel)) {
    /* Non-fast lanes get the same non-blocking catalog repair. The API still
       returns the current playable shelf immediately; this only makes the
       next request deeper and fresher. */
    ctx.waitUntil(refreshShallowCatalog(env, request, body, id, responseCandidateDepth));
  }
  let rotated;
  try { rotated = await rotateShelf(env, body, payload, request); }
  catch (error) {
    console.warn(JSON.stringify({ event: "v2-rotation-fallback", requestId: id, error: String(error).slice(0, 160) }));
    rotated = { payload: localRotationFallback(payload, body), rotation: { configured: false, fallback: true } };
  }
  if (IA_ROTATION_REFILL_LANES.has(String(body.channel)) && Number(rotated.payload && rotated.payload.ready || 0) < count) {
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
  if (catalogJob(body, rotated.payload)) ctx.waitUntil(enqueueCatalog(env, body, rotated.payload));
  const headers = new Headers(corsHeaders());
  headers.set("X-RealSignal-API", apiVersion);
  if (apiVersion === "v3") headers.set("X-RealSignal-Release", V3_RELEASE);
  headers.set("X-RealSignal-Request", id);
  headers.set("X-RealSignal-Source", catalogRecovery ? "d1-catalog+session-rotation" : "ais-relay+session-rotation");
  headers.set("X-RealSignal-Queue", JSON.stringify({ ready: Number(rotated.payload.ready || (rotated.payload.items || []).length), background: !!rotated.payload.hydrating }));
  rememberFreshness(env, body.channel, rotated.payload.items, ctx);
  /* A catalog recovery is a successful queue response. Returning the relay's
     original 4xx/5xx here made the browser discard the valid D1 shelf and
     retry the same dead upstream path. */
  return new Response(JSON.stringify({ ...rotated.payload, apiVersion, release: apiVersion === "v3" ? V3_RELEASE : undefined }), { status: catalogRecovery ? 200 : upstream.status, headers });
}

async function handleCatalog(request, env) {
  if (!env.realsignal_catalog || typeof env.realsignal_catalog.prepare !== "function") return json({ error: "catalog binding is not configured" }, 503);
  const url = new URL(request.url);
  const channel = String(url.searchParams.get("channel") || "").slice(0, 120);
  if (!channel) return json({ error: "channel is required" }, 400);
  const limit = Math.max(1, Math.min(MAX_CATALOG_ITEMS, Number(url.searchParams.get("limit")) || 20));
  const result = await env.realsignal_catalog.prepare(`SELECT p.* FROM programs p JOIN channel_programs cp ON cp.program_id=p.id WHERE cp.channel_key=? AND p.status='active' ORDER BY cp.last_seen_at DESC LIMIT ?`).bind(channel, limit).all();
  return json({ channel, items: result.results || [], source: "d1-catalog" }, 200, { "Cache-Control": "public, max-age=15, stale-while-revalidate=60" });
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

async function handleChannelHealth(request, env) {
  if (!env.realsignal_catalog || typeof env.realsignal_catalog.prepare !== "function") return json({ error: "catalog binding is not configured" }, 503);
  const limit = Math.max(1, Math.min(100, Number(new URL(request.url).searchParams.get("limit")) || 30));
  const result = await env.realsignal_catalog.prepare(`SELECT channel_key, samples, first_frame_count, CASE WHEN first_frame_count>0 THEN ROUND(first_frame_total_ms/first_frame_count) ELSE NULL END AS first_frame_avg_ms, first_frame_last_ms, switch_count, CASE WHEN switch_count>0 THEN ROUND(switch_total_ms/switch_count) ELSE NULL END AS switch_avg_ms, switch_last_ms, guide_count, CASE WHEN guide_count>0 THEN ROUND(guide_total_ms/guide_count) ELSE NULL END AS guide_avg_ms, queue_samples, CASE WHEN queue_samples>0 THEN ROUND(queue_total_depth/queue_samples) ELSE NULL END AS queue_avg_depth, queue_last_depth, repeats, skips, stalls, failures, recoveries, last_status, last_seen_at FROM channel_health ORDER BY failures DESC, stalls DESC, repeats DESC, last_seen_at DESC LIMIT ?`).bind(limit).all();
  return json({ apiVersion: "v3", release: V3_RELEASE, channels: result.results || [] }, 200, { "Cache-Control": "public, max-age=15, stale-while-revalidate=60", "X-RealSignal-Release": V3_RELEASE });
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

async function handleHealthSummary(request, env) {
  if (!env.realsignal_catalog || typeof env.realsignal_catalog.prepare !== "function") return json({ error: "catalog binding is not configured" }, 503);
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 40));
  const hours = Math.max(1, Math.min(168, Number(url.searchParams.get("hours")) || 24));
  const since = Date.now() - (hours * 60 * 60 * 1000);
  const channelQuery = env.realsignal_catalog.prepare(`SELECT channel_key, samples, first_frame_count, CASE WHEN first_frame_count>0 THEN ROUND(first_frame_total_ms/first_frame_count) ELSE NULL END AS first_frame_avg_ms, first_frame_last_ms, switch_count, CASE WHEN switch_count>0 THEN ROUND(switch_total_ms/switch_count) ELSE NULL END AS switch_avg_ms, switch_last_ms, guide_count, CASE WHEN guide_count>0 THEN ROUND(guide_total_ms/guide_count) ELSE NULL END AS guide_avg_ms, queue_samples, CASE WHEN queue_samples>0 THEN ROUND(queue_total_depth/queue_samples) ELSE NULL END AS queue_avg_depth, queue_last_depth, repeats, skips, stalls, failures, recoveries, last_status, last_seen_at FROM channel_health WHERE last_seen_at>=? ORDER BY failures DESC, stalls DESC, repeats DESC, last_seen_at DESC LIMIT ?`).bind(since, limit).all();
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
  return json({ apiVersion: "v3", release: V3_RELEASE, windowHours: hours, generatedAt: new Date().toISOString(), overallScore, status: overallScore == null ? "waiting" : overallScore >= 85 ? "healthy" : overallScore >= 65 ? "watch" : "repair", totals: { events: Number(totalRows.events || 0), frames: Number(totalRows.frames || 0), failures: Number(totalRows.failures || 0), repeats: Number(totalRows.repeats || 0), stalls: Number(totalRows.stalls || 0), recoveries: Number(totalRows.recoveries || 0) }, channels: channelRows, sources: sourceRows, surfaces: surfaces.results || [], freshness }, 200, { "Cache-Control": "public, max-age=15, stale-while-revalidate=60", "X-RealSignal-Release": V3_RELEASE });
}

async function handleGuide(request, env) {
  const url = new URL(request.url);
  const channel = String(url.searchParams.get("channel") || "").replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 120);
  if (!channel) return json({ error: "channel is required" }, 400);
  const limit = Math.max(2, Math.min(20, Number(url.searchParams.get("limit")) || 8));
  const canonical = canonicalPilotProfile(channel);
  if (canonicalPilotEnabled(env, channel)) {
    const recentIds = await readFreshnessIds(env, channel);
    const guide = canonicalGuide(canonical.manifest, recentIds, limit);
    return json({
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
    }, 200, { "Cache-Control": "public, max-age=10, stale-while-revalidate=30", "X-RealSignal-Release": V3_RELEASE, "X-RealSignal-Source": "ia-canonical-pilot" });
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
  return json({ apiVersion: "v3", release: V3_RELEASE, channel, current: items[0] || null, next: items[1] || null, items, verified: true, queueModel: "rolling-1-plus-2", catalogDepth, unseenCount, seenCount, catalogExhausted, repeatAllowed: catalogExhausted, freshnessLedger: items.some((item) => item.last_served_at != null), generatedAt: new Date().toISOString(), source: "d1-verified-catalog" }, 200, { "Cache-Control": "public, max-age=10, stale-while-revalidate=30", "X-RealSignal-Release": V3_RELEASE });
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
  return normalized.replace(/[^a-z0-9._-]+/g, "-").slice(0, 40) || "unknown";
}

async function readSourceCooldowns(env, profileKey) {
  if (!env.realsignal_catalog || typeof env.realsignal_catalog.prepare !== "function") return new Set();
  try {
    const prefix = `${String(profileKey || "").slice(0, 100)}:%`;
    /* Older releases wrote a cooldown for the harmless "no verified items"
       case. Ignore those legacy rows immediately; real provider errors remain
       eligible for their short recovery cooldown. */
    const result = await env.realsignal_catalog.prepare("SELECT source_key, cooldown_until FROM source_health WHERE source_key LIKE ? AND cooldown_until>? AND COALESCE(last_error, '')<>'no verified items'").bind(prefix, Date.now()).all();
    return new Set((result.results || []).map((row) => sourceProviderKey(String(row.source_key || "").split(":").pop())));
  } catch (_) { return new Set(); }
}

/* Read-only, client-equivalent source catalog inspection.  Unlike
   /source/catalog it never schedules provider discovery, so health audits can
   inspect the editorially requalified D1 shelf without turning an audit into
   a search burst. */
async function handleSourceStatus(request, env) {
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
    programFormats: profile.formats,
    persistedRelaxed: profile.persistedRelaxed,
    persistedMatch: profile.persistedMatch,
    themeMinScore: 1,
  }, SOURCE_LIMITS.SOURCE_MAX_ITEMS, { ignoreFreshness: true, blockedProviders: cooldowns });
  const items = cached && Array.isArray(cached.candidateItems) ? cached.candidateItems : [];
  return json({
    apiVersion: "v3",
    release: V3_RELEASE,
    profileKey: profile.profileKey,
    name: profile.name,
    items,
    ready: items.length,
    catalogDepth: Number(cached && cached.catalogDepth || items.length),
    source: cached ? "d1-requalified-source-catalog" : "d1-requalified-source-catalog-empty",
    providerAvailability: { youtube: !cooldowns.has("youtube"), peertube: !cooldowns.has("peertube"), cooldownProviders: Array.from(cooldowns) },
    generatedAt: new Date().toISOString(),
  }, 200, { "Cache-Control": "public, max-age=15, stale-while-revalidate=60", "X-RealSignal-Release": V3_RELEASE });
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
  const disabledProviders = await readSourceCooldowns(env, profile.profileKey);
  const cached = await catalogFallback(env, {
    channel: profile.profileKey,
    rotation,
    sourceCatalog: true,
    denyTerms: profile.deny,
    themeTerms: profile.match,
    intent: profile.intent,
    topics: profile.topics,
    programFormats: profile.formats,
    persistedRelaxed: profile.persistedRelaxed,
    persistedMatch: profile.persistedMatch,
    themeMinScore: 1,
    recentIds: sourceRecentIds,
    freshnessLedger: true,
  }, SOURCE_LIMITS.SOURCE_MAX_ITEMS, { blockedProviders: disabledProviders }).catch((error) => {
    console.warn(JSON.stringify({ event: "source-catalog-read-failed", requestId: id, error: String(error).slice(0, 160) }));
    return null;
  });
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
  if (cached && Array.isArray(cached.items) && (cached.items.length >= staleReady || hasFreshFallback) && !forceDeepRefresh) {
    if (cached.items.length < minimumReady) {
      const { profile: normalized, tasks } = sourceCatalogTasks(body, env, rotation, { disabledProviders });
      scheduleSourceRefresh(env, ctx, normalized, tasks, id);
    }
    const hydrating = body.refresh === true || cached.items.length < minimumReady;
    if (playedIds.length) rememberFreshness(env, profile.profileKey, playedIds, ctx);
    return json({ ...cached, profileKey: profile.profileKey, catalogVersion: "source-server-1", source: "d1-source-catalog", hydrating, staleCatalog: hydrating, adaptiveFreshness: true, freshnessLedger: true, providerAvailability: { youtube: !!env.YOUTUBE_API_KEY && !disabledProviders.has("youtube"), peertube: !disabledProviders.has("peertube"), cooldownProviders: Array.from(disabledProviders) }, apiVersion, release: apiVersion === "v3" ? V3_RELEASE : undefined }, 200, { "Cache-Control": "public, max-age=10, stale-while-revalidate=60", "X-RealSignal-Request": id, "X-RealSignal-Source": "d1-source-catalog", "X-RealSignal-Release": apiVersion === "v3" ? V3_RELEASE : "2.2.2" });
  }
  const { profile: normalized, tasks } = sourceCatalogTasks(body, env, rotation, { disabledProviders });
  let firstTimer;
  let first;
  if (forceDeepRefresh) {
    /* This request was launched by the already-playing client as a background
       refill. Return the first verified provider lane within the same bounded
       window as a cold start; the full provider union continues in the
       background and is persisted without making refresh wait 20+ seconds. */
    first = await Promise.race([
      firstSourceLane(tasks),
      new Promise((resolve) => {
        firstTimer = setTimeout(() => resolve({ items: [], lanes: [], ready: 0, candidates: 0, hydrating: true, timedOut: true }), SOURCE_LIMITS.SOURCE_FIRST_LANE_TIMEOUT_MS);
      }),
    ]).finally(() => clearTimeout(firstTimer));
  } else {
    first = await Promise.race([
      firstSourceLane(tasks),
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
      programFormats: normalized.formats,
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
      providerAvailability: { youtube: !!env.YOUTUBE_API_KEY && !disabledProviders.has("youtube"), peertube: !disabledProviders.has("peertube"), cooldownProviders: Array.from(disabledProviders) },
      limits: SOURCE_LIMITS,
      apiVersion,
      release: apiVersion === "v3" ? V3_RELEASE : undefined,
    }, verified.length ? 200 : 503, { "Cache-Control": "no-store", "X-RealSignal-Request": id, "X-RealSignal-Source": "server-source-catalog-maintenance", "X-RealSignal-Release": apiVersion === "v3" ? V3_RELEASE : "2.2.2" });
  }
  const cachedItems = forceDeepRefresh && cached && Array.isArray(cached.candidateItems) ? cached.candidateItems : (forceDeepRefresh && cached && Array.isArray(cached.items) ? cached.items : []);
  const discoveredItems = forceDeepRefresh
    ? uniqueQueueItems(cachedItems.concat(first.items || []), { ...body, sourceCatalog: true, denyTerms: profile.deny, themeTerms: profile.match, themeMinScore: 1 }, SOURCE_LIMITS.SOURCE_MAX_ITEMS)
    : first.items;
  const freshnessBody = { ...body, recentIds: sourceRecentIds, freshnessLedger: true };
  const unseenFirstItems = applyFreshness(discoveredItems, freshnessBody);
  const catalogExhausted = discoveredItems.length > 0 && unseenFirstItems.length === 0;
  const freshFirstItems = catalogExhausted ? discoveredItems : unseenFirstItems;
  if (playedIds.length) rememberFreshness(env, normalized.profileKey, playedIds, ctx);
  return json({ profileKey: normalized.profileKey, items: freshFirstItems, ready: freshFirstItems.length, candidates: discoveredItems.length, catalogDepth: discoveredItems.length, unseenCatalogItems: unseenFirstItems.length, seenCatalogItems: Math.max(0, discoveredItems.length - unseenFirstItems.length), catalogExhausted, repeatAllowed: catalogExhausted, lanes: first.lanes, hydrating: true, adaptiveFreshness: true, freshnessLedger: true, freshnessExcluded: Math.max(0, discoveredItems.length - unseenFirstItems.length), freshnessWindow: recentCatalogIds(freshnessBody).size, catalogVersion: "source-server-1", source: forceDeepRefresh ? "server-source-catalog-refresh" : "server-source-catalog", providerAvailability: { youtube: !!env.YOUTUBE_API_KEY && !disabledProviders.has("youtube"), peertube: !disabledProviders.has("peertube"), cooldownProviders: Array.from(disabledProviders) }, limits: SOURCE_LIMITS, apiVersion, release: apiVersion === "v3" ? V3_RELEASE : undefined }, freshFirstItems.length ? 200 : 503, { "Cache-Control": "no-store", "X-RealSignal-Request": id, "X-RealSignal-Source": "server-source-catalog", "X-RealSignal-Release": apiVersion === "v3" ? V3_RELEASE : "2.2.2" });
}

const worker = {
  async fetch(request, env, ctx) {
    const id = requestId();
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders("text/plain; charset=utf-8") });
    if (request.method !== "GET" && request.method !== "POST") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "GET,POST,OPTIONS" });
    const url = new URL(request.url);
    const route = routeFor(url.pathname);
    try {
      if (route && route.kind === "health") {
        const v3 = route.apiVersion === "v3";
        return json({ service: "realsignal-api", apiVersion: v3 ? "v3" : "v2", release: v3 ? V3_RELEASE : "2.2.2", status: "ready", capabilities: ["ia-search", "ia-metadata", "ia-queue", "session-rotation", "catalog-jobs", "source-catalog", "adaptive-catalog", "freshness-ledger", ...(v3 ? ["verified-guide", "server-telemetry", "source-health", ...(IA_CANONICAL_PILOT_VALUES.has(String(env.IA_CANONICAL_PILOT || "").trim().toLowerCase()) ? ["ia-canonical-pilot"] : [])] : []), "youtube-sports"], bindings: { relay: !!env.RELAY, rotation: !!env.ROTATION, catalog: !!env.realsignal_catalog, refreshQueue: !!env.realsignal_catalog_refresh }, checkedAt: new Date().toISOString() }, 200, { "Cache-Control": "no-store", "X-RealSignal-Request": id, "X-RealSignal-Release": v3 ? V3_RELEASE : "2.2.2" });
      }
      if (route && route.kind === "telemetry") {
        if (request.method !== "POST") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "POST,OPTIONS" });
        const limited = rateLimit(request, "queue");
        if (limited) return limited;
        return await handleTelemetry(request, env, ctx, id);
      }
      if (route && route.kind === "channel-health") {
        if (request.method !== "GET") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "GET,OPTIONS" });
        return await handleChannelHealth(request, env);
      }
      if (route && route.kind === "health-summary") {
        if (request.method !== "GET") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "GET,OPTIONS" });
        return await handleHealthSummary(request, env);
      }
      if (route && route.kind === "guide") {
        if (request.method !== "GET") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "GET,OPTIONS" });
        return await handleGuide(request, env);
      }
      if (route && route.kind === "youtube-uploads") {
        if (request.method !== "GET") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "GET,OPTIONS" });
        const limited = rateLimit(request, route.kind);
        if (limited) return limited;
        return await handleYouTubeUploads(request, env, id);
      }
      if (route && route.kind === "source-catalog") {
        if (request.method !== "POST") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "POST,OPTIONS" });
        const limited = rateLimit(request, route.kind);
        if (limited) return limited;
        return await handleSourceCatalog(request, env, ctx, id);
      }
      if (route && route.kind === "source-status") {
        if (request.method !== "GET") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "GET,OPTIONS" });
        return await handleSourceStatus(request, env);
      }
      if (route && route.kind === "catalog") {
        if (request.method !== "GET") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "GET,OPTIONS" });
        return await handleCatalog(request, env);
      }
      if (!route) return json({ error: "not found", requestId: id }, 404);
      if (route.kind === "queue") {
        if (request.method !== "POST") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "POST,OPTIONS" });
        const limited = rateLimit(request, route.kind);
        if (limited) return limited;
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

export { SessionRotation, freshnessExclusionIds };
export default worker;
