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
 * bundle. The snapshot endpoint is intentionally fixed to the Gulf coverage
 * used by channel 965, so this public client cannot turn the Worker into an
 * arbitrary paid-data proxy.
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
const SNAPSHOT_PATH = "/snapshot";
const IA_PREFIX = "/ia";
const IA_QUEUE_PATH = IA_PREFIX + "/queue";
const IA_PROGRAM_PATH = IA_PREFIX + "/program";
const SNAPSHOT_TTL_SECONDS = 60;
const IA_SEARCH_TTL_SECONDS = 21600;
/* Bump this when the normalized search response changes so an older edge
   entry cannot be mistaken for the current program-director result. */
const IA_SEARCH_CACHE_VERSION = "v4";
const IA_METADATA_TTL_SECONDS = 86400;
const IA_QUEUE_TTL_SECONDS = 21600;
const IA_PARTIAL_QUEUE_TTL_SECONDS = 90;
const IA_QUEUE_CACHE_VERSION = "v8";
const GULF_FILTER = "BBOX(geometry,-98,18,-80,31)";
const KPLER_FIELDS = "mmsi,longitude,latitude,posDt,sog,vesselName,heading,cog,navStatus,destination,vesselType";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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

function safeChannel(channel) {
  return /^[A-Za-z0-9._ -]{1,80}$/.test(channel || "");
}

function safeQueries(queries) {
  if (!Array.isArray(queries) || !queries.length || queries.length > 16) return null;
  const clean = queries.map((query) => String(query || "").trim()).filter(Boolean);
  return clean.length && clean.every((query) => query.length <= 2400) ? clean : null;
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

async function searchArchive(query, rows, page, sort) {
  const upstreamUrl = new URL("https://archive.org/advancedsearch.php");
  upstreamUrl.searchParams.set("q", query);
  ["identifier", "title", "year", "subject", "runtime", "downloads"].forEach((field) => upstreamUrl.searchParams.append("fl[]", field));
  upstreamUrl.searchParams.append("sort[]", sort || "downloads desc");
  upstreamUrl.searchParams.set("rows", String(rows));
  upstreamUrl.searchParams.set("page", String(page));
  upstreamUrl.searchParams.set("output", "json");
  /* Archive's scrape endpoint does not honor advancedsearch's field grammar
     (for example `subject:boxing` becomes an empty result). Keep one precise
     backend here: a fast wrong answer is worse than an alternate lane. */
  const upstream = await archiveFetch(upstreamUrl.toString(), { cache: "no-store" }, 5200);
  if (!upstream.ok) throw new Error("archive advanced search " + upstream.status);
  const payload = await upstream.json();
  return { ...(payload.response || { numFound: 0, docs: [] }), _afterglowSource: "advanced" };
}

async function cachedSearchArchive(cacheOrigin, query, rows, page, sort, ctx) {
  const cacheKey = new Request(cacheOrigin + IA_PREFIX + "/cache/search/" + IA_SEARCH_CACHE_VERSION + "/" + await stableKey([query, rows, page, sort].join("|")));
  return cachedArchiveJson(cacheKey, IA_SEARCH_TTL_SECONDS, () => searchArchive(query, rows, page, sort), ctx);
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

function queueItem(doc) {
  return {
    identifier: doc.identifier,
    title: doc.title || doc.identifier,
    year: doc.year || null,
    runtime: doc.runtime || null,
    subject: doc.subject || null,
  };
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

async function queuePlayable(id, cacheOrigin, ctx, attempt = 0) {
  try {
    const cacheKey = new Request(cacheOrigin + IA_PREFIX + "/cache/metadata/" + id);
    const payload = await cachedArchiveJson(cacheKey, IA_METADATA_TTL_SECONDS, async () => {
      const upstream = await archiveFetch("https://archive.org/metadata/" + encodeURIComponent(id), {}, 4200);
      if (!upstream.ok) throw new Error("archive metadata " + upstream.status);
      return upstream.json();
    }, ctx);
    const files = payload.files || [];
    const format = (file) => String(file && file.format || "").toLowerCase();
    const video = files.filter((file) => file && file.name && (/\.mp4$|\.m4v$/i.test(file.name) || /\.webm$/i.test(file.name) || /\.ogv$/i.test(file.name)))
      .sort((a, b) => {
        const score = (file) => /h\.?264/.test(format(file)) ? 0 : /\.mp4$|\.m4v$/i.test(file.name) ? 1 : /\.webm$/i.test(file.name) ? 2 : 3;
        return score(a) - score(b);
      });
    const audio = files.find((file) => file && file.name && /\.mp3$|\.ogg$|\.m4a$|\.flac$/i.test(file.name));
    const chosen = video[0] || audio;
    if (!chosen) return null;
    const urls = queueFileUrls(id, payload, chosen.name);
    return urls.length ? { type: video[0] ? "video" : "audio", url: urls[0], alts: urls.slice(1, 8) } : null;
  } catch {
    if (attempt < 1) {
      await new Promise((resolve) => setTimeout(resolve, 180));
      return queuePlayable(id, cacheOrigin, ctx, attempt + 1);
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
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function buildIaQueue(channel, queries, count, cacheOrigin, ctx) {
  const items = [], seen = new Set(), seenTitles = new Set(), candidateLimit = count;
  /* Query lanes are already editorially ordered by the app. Fetch a small
     sample from each lane in parallel, then take one from every lane before
     taking a second: a five-item buffer spans eras/topics instead of becoming
     five nearly identical top-download results. */
  /* The app sends up to eight deliberately separated rails: permanent/full-era,
     current rotation, opposite ends of the era range, and narrow editorial
     rails. Resolve all of them in parallel. Restricting discovery to only the
     first three made sparse channels look as if they were hydrating forever. */
  const lanes = await Promise.all(queries.slice(0, Math.min(8, queries.length)).map(async (query) => {
    try {
      const result = await cachedSearchArchive(cacheOrigin, query, Math.min(24, Math.max(12, count * 3)), 1, "downloads desc", ctx);
      return (result.docs || []).filter((doc) => doc && safeIaId(doc.identifier));
    } catch {
      return [];
    }
  }));
  const laneDepth = Math.max(0, ...lanes.map((lane) => lane.length));
  for (let row = 0; row < laneDepth && items.length < candidateLimit; row += 1) {
    for (const lane of lanes) {
      const doc = lane[row];
      const titleKey = queueTitleKey(doc);
      if (!doc || seen.has(doc.identifier) || (titleKey && seenTitles.has(titleKey))) continue;
      seen.add(doc.identifier);
      if (titleKey) seenTitles.add(titleKey);
      items.push(queueItem(doc));
      if (items.length >= candidateLimit) break;
    }
  }
  return {
    channel,
    generatedAt: new Date().toISOString(),
    ttlSeconds: IA_QUEUE_TTL_SECONDS,
    items: items.slice(0, count),
    ready: Math.min(items.length, count),
  };
}

async function hydrateIaQueue(payload, requestedCount, cacheOrigin, ctx) {
  /* Keep a few extra candidates behind the five-program shelf. Archive items
     occasionally have no browser-playable derivative; filtering those here
     means the viewer receives five actual media URLs instead of five names
     that each need another network trip in the browser. */
  const enriched = await mapQueueCandidates(payload.items, 5, async (item) => ({ ...item, media: await queuePlayable(item.identifier, cacheOrigin, ctx) }));
  const ready = enriched.filter((item) => item.media).slice(0, requestedCount);
  return {
    ...payload,
    items: ready,
    candidates: payload.items.length,
    ready: ready.length,
    partial: ready.length < requestedCount,
    hydrating: false,
  };
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

async function getIaQueue(request, url, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "queue payload must be JSON" }, 400);
  }
  const channel = String(body && body.channel || "").trim();
  const queries = safeQueries(body && body.queries);
  const count = Math.max(1, Math.min(5, Number(body && body.count) || 5));
  if (!safeChannel(channel) || !queries) return json({ error: "invalid queue request" }, 400);
  const cacheKey = new Request(url.origin + IA_PREFIX + "/cache/queue/" + IA_QUEUE_CACHE_VERSION + "/" + await stableKey(JSON.stringify({ channel, queries, count })));
  try {
    const cache = caches.default, cached = await cache.match(cacheKey);
    if (cached) return cached;
    const candidateCount = Math.min(15, Math.max(count, count * 3));
    const payload = await buildIaQueue(channel, queries, candidateCount, url.origin, ctx);
    if (!payload.items.length) {
      /* No candidate exists yet, so this is not hydration. Be truthful and let
         the client immediately try its direct/search fallbacks, then retry the
         director on its bounded backoff instead of polling a phantom job. */
      return cacheableJson(
        { ...payload, ready: 0, hydrating: false, empty: true },
        15,
        { "X-Afterglow-Source": "program-director", "X-Afterglow-Queue-Ready": "0" },
      );
    }
    const hydration = hydrateIaQueue(payload, count, url.origin, ctx);
    /* A cold channel gets one short, bounded chance to receive ready media.
       If Archive is slow, return the discovery shelf immediately and finish
       hydration in the background; the browser's own fallback can still use
       those identifiers without turning a channel change into a long wait. */
    const hydrated = await timeboxQueueHydration(hydration, 4800);
    if (hydrated && hydrated.items.length) {
      const queueTtl = hydrated.ready >= count ? IA_QUEUE_TTL_SECONDS : IA_PARTIAL_QUEUE_TTL_SECONDS;
      const response = cacheableJson(hydrated, queueTtl, {
        "X-Afterglow-Source": "program-director",
        "X-Afterglow-Queue-Ready": String(hydrated.ready),
      });
      ctx.waitUntil(cache.put(cacheKey, response.clone()).catch((error) => {
        console.warn(JSON.stringify({ event: "queue-cache-write-failed", channel, message: String(error && error.message || error) }));
      }));
      return response;
    }
    const initial = { ...payload, items: payload.items.slice(0, count), ready: 0, hydrating: true };
    ctx.waitUntil(
      hydration
        .then((ready) => {
          if (!ready || !ready.items.length) return undefined;
          const queueTtl = ready.ready >= count ? IA_QUEUE_TTL_SECONDS : IA_PARTIAL_QUEUE_TTL_SECONDS;
          return cache.put(cacheKey, cacheableJson(ready, queueTtl, {
            "X-Afterglow-Source": "program-director",
            "X-Afterglow-Queue-Ready": String(ready.ready),
          }));
        })
        .catch(() => {})
    );
    return cacheableJson(initial, 20, { "X-Afterglow-Source": "program-director", "X-Afterglow-Queue-Ready": "0" });
  } catch {
    return json({ error: "archive queue unavailable" }, 502);
  }
}

async function getKplerSnapshot(request, env, ctx) {
  if (!env.KPLER_API_KEY) {
    return json({ error: "snapshot provider is not configured" }, 503);
  }

  // One fixed cache key prevents a public caller from varying the query and
  // consuming paid Kpler quota. Cached results also keep an upstream blip from
  // blanking the screen for every connected Afterglow client.
  const url = new URL(request.url);
  const cacheKey = new Request(url.origin + SNAPSHOT_PATH);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value));
    headers.set("X-Afterglow-Source", "kpler-cache");
    return new Response(cached.body, { status: cached.status, headers });
  }

  const query = new URLSearchParams({
    filter: GULF_FILTER,
    format: "json",
    limit: "1000",
    fields: KPLER_FIELDS,
    sortBy: "posDt DESC",
  });
  let upstream;
  try {
    upstream = await fetch(KPLER_URL + "?" + query, {
      headers: {
        "Authorization": "Basic " + env.KPLER_API_KEY,
        "Accept": "application/json",
      },
    });
  } catch {
    return json({ error: "snapshot provider is unreachable" }, 502);
  }
  if (!upstream.ok) {
    // Do not relay an upstream diagnostic: it can contain account or contract
    // details that do not belong in a public client.
    return json({ error: "snapshot provider rejected the request", status: upstream.status }, 502);
  }

  let payload;
  try {
    payload = await upstream.json();
  } catch {
    return json({ error: "snapshot provider returned invalid data" }, 502);
  }
  const response = json({
    source: "kpler",
    fetchedAt: new Date().toISOString(),
    ...payload,
  }, 200, {
    "Cache-Control": "public, max-age=" + SNAPSHOT_TTL_SECONDS,
    "X-Afterglow-Source": "kpler-live",
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
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

    if (request.method === "GET" && url.pathname === IA_PREFIX + "/search") {
      return getIaSearch(url, ctx);
    }

    if (request.method === "GET" && url.pathname.startsWith(IA_PREFIX + "/metadata/")) {
      return getIaMetadata(decodeURIComponent(url.pathname.slice((IA_PREFIX + "/metadata/").length)), url, ctx);
    }

    if (request.method === "POST" && (url.pathname === IA_QUEUE_PATH || url.pathname === IA_PROGRAM_PATH)) {
      return getIaQueue(request, url, ctx);
    }

    // Anything other than a WebSocket upgrade gets a useful health response.
    const upgrade = (request.headers.get("Upgrade") || "").toLowerCase();
    if (upgrade !== "websocket") {
      return json({
        service: "afterglow-ais-relay",
        stream: Boolean(env.AIS_API_KEY),
        snapshot: Boolean(env.KPLER_API_KEY),
        snapshotPath: SNAPSHOT_PATH,
        archiveQueuePath: IA_QUEUE_PATH,
        archiveProgramPath: IA_PROGRAM_PATH,
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
