/* RealSignal Version 2 API.
 *
 * This is a safe parallel entrypoint. The old v1 façade remains in the repo
 * as a rollback reference while V2 adds per-session rotation, background D1
 * catalog writes, and a queue consumer around the proven ais-relay adapter.
 */

import { SessionRotation } from "./realsignal_api_rotation.js";
import { mergeSourceLanes, sourceCatalogTasks, sourceProfile, SOURCE_LIMITS } from "./realsignal_source_catalog.js";

const API_PREFIX = "/api/v2";
const MAX_BODY_BYTES = 128 * 1024;
const MAX_CATALOG_ITEMS = 12;
const MAX_SESSION = 80;
const YOUTUBE_SPORT_HANDLES = new Set([
  "NFL", "NCAAFootball", "NBA", "marchmadness", "MLB", "NHL", "wnba", "NCAA",
  "premierleague", "MLS", "FIFA", "lolesports", "iccmedia", "WorldRugby", "aflcomau",
  "UCI_Cycling", "Formula1", "NASCAR", "IndyCar", "FormulaE", "motogp", "ufc",
  "BellatorMMA", "ONEChampionship", "toprank", "PGATOUR", "LPGATOUR", "tennistv",
  "WTA", "PDCTV", "WorldSnooker",
]);
const YOUTUBE_TIMEOUT_MS = 6500;
const RATE_LIMITS = Object.freeze({
  "source-catalog": Object.freeze({ windowMs: 60_000, max: 30 }),
  queue: Object.freeze({ windowMs: 60_000, max: 60 }),
  "youtube-uploads": Object.freeze({ windowMs: 60_000, max: 30 }),
});
/* This is a small edge guard, not durable product state. It absorbs accidental
   provider-triggering bursts in each Worker isolate while durable channel
   rotation remains independent. */
const requestBuckets = new Map();

function corsHeaders(contentType = "application/json; charset=utf-8") {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-RealSignal-Client, X-RealSignal-Session",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Expose-Headers": "X-RealSignal-API, X-RealSignal-Request, X-RealSignal-Source, X-RealSignal-Queue",
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
  if (pathname === `${API_PREFIX}/health`) return { kind: "health" };
  if (pathname === `${API_PREFIX}/youtube/uploads`) return { kind: "youtube-uploads" };
  if (pathname === `${API_PREFIX}/ia/queue` || pathname === `${API_PREFIX}/ia/program`) return { kind: "queue" };
  if (pathname === `${API_PREFIX}/ia/search`) return { kind: "relay", relayPath: "/ia/search" };
  if (pathname.startsWith(`${API_PREFIX}/ia/metadata/`)) {
    const id = pathname.slice(`${API_PREFIX}/ia/metadata/`.length);
    return id ? { kind: "relay", relayPath: `/ia/metadata/${id}` } : null;
  }
  if (pathname === `${API_PREFIX}/source/catalog`) return { kind: "source-catalog" };
  if (pathname === `${API_PREFIX}/catalog`) return { kind: "catalog" };
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
    duration: Number(item.duration || item.runtime) || null,
    aspectRatio: Number(item.aspectRatio) || null,
    mediaType: String((item.media && item.media.type) || item.type || "video").slice(0, 30),
    mediaUrl: String((item.media && item.media.url) || item.url || "").slice(0, 1500),
    sourceUrl: String(item.sourceUrl || "").slice(0, 1500),
    rights: String(item.rights || "").slice(0, 300),
    year: String(item.year || "").slice(0, 20),
  };
}

function catalogJob(body, payload) {
  const items = (Array.isArray(payload && payload.items) ? payload.items : []).slice(0, MAX_CATALOG_ITEMS).map(compactCatalogItem).filter(Boolean);
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
  const response = await stub.fetch(new Request("https://rotation.internal/select", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: payload.items, count: Math.max(1, Math.min(5, Number(body.count) || 3)), rotation: Number(body.rotation) || 0 }) }));
  if (!response.ok) throw new Error(`rotation ${response.status}`);
  const selected = await response.json();
  const upstreamReady = Number.isFinite(Number(payload.ready)) ? Number(payload.ready) : (Array.isArray(payload.items) ? payload.items.length : 0);
  return { payload: { ...payload, items: selected.items || [], ready: Math.min(upstreamReady, (selected.items || []).length), v2: { sessionScoped: true, cursor: selected.cursor, cycleReset: !!selected.cycleReset } }, rotation: selected };
}

function rotateCatalogItems(items, rotation) {
  if (!Array.isArray(items) || !items.length) return [];
  const offset = ((Number(rotation) || 0) % items.length + items.length) % items.length;
  return items.slice(offset).concat(items.slice(0, offset));
}

async function catalogFallback(env, body, requestedLimit = 12) {
  if (!env.realsignal_catalog || typeof env.realsignal_catalog.prepare !== "function") return null;
  const channel = String(body.channel || "").slice(0, 120);
  const limit = Math.max(1, Math.min(SOURCE_LIMITS.SOURCE_MAX_ITEMS, Number(requestedLimit) || 12));
  const result = await env.realsignal_catalog.prepare(`SELECT p.* FROM programs p JOIN channel_programs cp ON cp.program_id=p.id WHERE cp.channel_key=? AND p.status='active' AND p.media_url IS NOT NULL ORDER BY cp.last_seen_at DESC LIMIT ?`).bind(channel, limit).all();
  const items = (result.results || []).map((row) => ({
    id: row.id,
    identifier: row.id,
    sourceIdentifier: row.source_identifier || row.id,
    title: row.title,
    description: row.description || "",
    provider: row.provider,
    year: row.year || "",
    runtime: Number(row.duration_seconds) || null,
    media: { type: row.media_type || "video", url: row.media_url },
    type: row.media_type === "embed" ? "embed" : "video",
    url: row.media_url,
    embedUrl: row.media_type === "embed" ? row.media_url : "",
    sourceUrl: row.source_url || "",
    rights: row.rights || "",
    staleCatalog: true,
  }));
  return items.length ? { items: rotateCatalogItems(items, body.rotation), ready: items.length, candidates: items.length, fallback: true, stale: true, catalogFallback: true, rotation: Number(body.rotation) || 0 } : null;
}

async function handleQueue(request, env, ctx, id) {
  let body;
  try { body = await readBoundedJson(request); }
  catch (error) { return json({ error: error instanceof RangeError ? error.message : "invalid JSON body", requestId: id }, error instanceof RangeError ? 413 : 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "queue payload must be an object", requestId: id }, 400);
  if (!String(body.channel || "").trim()) return json({ error: "channel is required", requestId: id }, 400);
  const count = Math.max(1, Math.min(5, Number(body.count) || 3));
  const upstreamBody = { ...body, count };
  delete upstreamBody.sessionId;
  delete upstreamBody.session;
  const upstream = await forwardToRelay(request, env, "/ia/queue", upstreamBody, id);
  let payload;
  let catalogRecovery = false;
  if (!upstream.ok) {
    try { payload = await catalogFallback(env, body); catalogRecovery = !!payload; } catch (error) { console.warn(JSON.stringify({ event: "catalog-fallback-failed", requestId: id, error: String(error).slice(0, 160) })); }
    if (!payload) return upstream;
  } else {
    try { payload = await upstream.clone().json(); } catch (_) { return upstream; }
  }
  let rotated;
  try { rotated = await rotateShelf(env, body, payload, request); }
  catch (error) {
    console.warn(JSON.stringify({ event: "v2-rotation-fallback", requestId: id, error: String(error).slice(0, 160) }));
    rotated = { payload, rotation: { configured: false, fallback: true } };
  }
  if (catalogJob(body, rotated.payload)) ctx.waitUntil(enqueueCatalog(env, body, rotated.payload));
  const headers = new Headers(corsHeaders());
  headers.set("X-RealSignal-API", "v2");
  headers.set("X-RealSignal-Request", id);
  headers.set("X-RealSignal-Source", catalogRecovery ? "d1-catalog+session-rotation" : "ais-relay+session-rotation");
  headers.set("X-RealSignal-Queue", JSON.stringify({ ready: Number(rotated.payload.ready || (rotated.payload.items || []).length), background: !!rotated.payload.hydrating }));
  return new Response(JSON.stringify({ ...rotated.payload, apiVersion: "v2" }), { status: upstream.status, headers });
}

async function handleCatalog(request, env) {
  if (!env.realsignal_catalog || typeof env.realsignal_catalog.prepare !== "function") return json({ error: "catalog binding is not configured" }, 503);
  const url = new URL(request.url);
  const channel = String(url.searchParams.get("channel") || "").slice(0, 120);
  if (!channel) return json({ error: "channel is required" }, 400);
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit")) || 20));
  const result = await env.realsignal_catalog.prepare(`SELECT p.* FROM programs p JOIN channel_programs cp ON cp.program_id=p.id WHERE cp.channel_key=? AND p.status='active' ORDER BY cp.last_seen_at DESC LIMIT ?`).bind(channel, limit).all();
  return json({ channel, items: result.results || [], source: "d1-catalog" }, 200, { "Cache-Control": "public, max-age=15, stale-while-revalidate=60" });
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

async function persistSourceLanes(env, profile, lanes) {
  const merged = mergeSourceLanes(profile.profileKey, lanes);
  const job = catalogJob({ channel: profile.profileKey, themeTerms: profile.match, denyTerms: profile.deny, mediaTypes: ["video", "embed"] }, merged);
  if (!job) return merged;
  if (env.realsignal_catalog_refresh && typeof env.realsignal_catalog_refresh.send === "function") {
    await env.realsignal_catalog_refresh.send(job, { contentType: "json" });
  } else {
    await upsertCatalogJob(env, job);
  }
  return merged;
}

async function handleSourceCatalog(request, env, ctx, id) {
  let body;
  try { body = await readBoundedJson(request); }
  catch (error) { return json({ error: error instanceof RangeError ? error.message : "invalid JSON body", requestId: id }, error instanceof RangeError ? 413 : 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "source catalog payload must be an object", requestId: id }, 400);
  const profile = sourceProfile(body);
  if (!profile) return json({ error: "unknown source profile", requestId: id }, 404);
  if (!profile.queries.length) return json({ error: "source profile has no discovery queries", requestId: id }, 503);
  const rotation = Number(body.rotation) || 0;
  const cached = await catalogFallback(env, { channel: profile.profileKey, rotation }, SOURCE_LIMITS.SOURCE_MAX_ITEMS).catch((error) => {
    console.warn(JSON.stringify({ event: "source-catalog-read-failed", requestId: id, error: String(error).slice(0, 160) }));
    return null;
  });
  const minimumReady = Math.max(1, Math.min(5, Number(body.minimumReady) || 2));
  if (cached && Array.isArray(cached.items) && cached.items.length >= minimumReady && body.refresh !== true) {
    return json({ ...cached, profileKey: profile.profileKey, catalogVersion: "source-server-1", source: "d1-source-catalog", hydrating: false, providerAvailability: { youtube: !!env.YOUTUBE_API_KEY, peertube: true }, apiVersion: "v2" }, 200, { "Cache-Control": "public, max-age=10, stale-while-revalidate=60", "X-RealSignal-Request": id, "X-RealSignal-Source": "d1-source-catalog" });
  }
  const { profile: normalized, tasks } = sourceCatalogTasks(body, env, rotation);
  let firstTimer;
  const first = await Promise.race([
    firstSourceLane(tasks),
    new Promise((resolve) => {
      firstTimer = setTimeout(() => resolve({ items: [], lanes: [], ready: 0, candidates: 0, hydrating: true, timedOut: true }), SOURCE_LIMITS.SOURCE_FIRST_LANE_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(firstTimer));
  const background = Promise.all(tasks.map((task) => Promise.resolve(task).catch((error) => ({ provider: "unknown", items: [], health: { error: String(error).slice(0, 160) } })))).then((lanes) => persistSourceLanes(env, normalized, lanes)).catch((error) => {
    console.error(JSON.stringify({ event: "source-catalog-persist-failed", requestId: id, profileKey: normalized.profileKey, error: String(error).slice(0, 200) }));
  });
  ctx.waitUntil(background);
  return json({ profileKey: normalized.profileKey, items: first.items, ready: first.ready, candidates: first.candidates, lanes: first.lanes, hydrating: true, catalogVersion: "source-server-1", source: "server-source-catalog", providerAvailability: { youtube: !!env.YOUTUBE_API_KEY, peertube: true }, limits: SOURCE_LIMITS, apiVersion: "v2" }, first.items.length ? 200 : 503, { "Cache-Control": "no-store", "X-RealSignal-Request": id, "X-RealSignal-Source": "server-source-catalog" });
}

const worker = {
  async fetch(request, env, ctx) {
    const id = requestId();
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders("text/plain; charset=utf-8") });
    if (request.method !== "GET" && request.method !== "POST") return json({ error: "method not allowed", requestId: id }, 405, { Allow: "GET,POST,OPTIONS" });
    const url = new URL(request.url);
    const route = routeFor(url.pathname);
    try {
      if (route && route.kind === "health") return json({ service: "realsignal-api", apiVersion: "v2", status: "ready", capabilities: ["ia-search", "ia-metadata", "ia-queue", "session-rotation", "catalog-jobs", "source-catalog", "youtube-sports"], bindings: { relay: !!env.RELAY, rotation: !!env.ROTATION, catalog: !!env.realsignal_catalog, refreshQueue: !!env.realsignal_catalog_refresh }, checkedAt: new Date().toISOString() }, 200, { "Cache-Control": "no-store", "X-RealSignal-Request": id });
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
      console.error(JSON.stringify({ event: "v2-request-failed", requestId: id, path: url.pathname, error: String(error).slice(0, 200) }));
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

export { SessionRotation };
export default worker;
