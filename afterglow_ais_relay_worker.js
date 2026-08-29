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
const OPEN_WATERS_GULF_URL = "https://ais.openwaters.io/v1/vessels?bbox=18,-98,31,-80";
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
const IA_METADATA_TTL_SECONDS = 86400;
const IA_QUEUE_TTL_SECONDS = 21600;
const IA_PARTIAL_QUEUE_TTL_SECONDS = 90;
const IA_QUEUE_CACHE_VERSION = "v19";
const GULF_FILTER = "BBOX(geometry,-98,18,-80,31)";
const KPLER_FIELDS = "mmsi,longitude,latitude,posDt,sog,vesselName,heading,cog,navStatus,destination,vesselType";

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
    "Access-Control-Expose-Headers": "X-Afterglow-Source, X-Afterglow-Cache",
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
  };
}

function themeText(value) {
  return " " + String(Array.isArray(value) ? value.join(" ") : value || "")
    .normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
}

function matchesTheme(doc, themeTerms, minScore = 1) {
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

async function searchArchive(query, rows, page, sort) {
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

function queueItem(doc, lane) {
  return {
    identifier: doc.identifier,
    title: doc.title || doc.identifier,
    year: doc.year || null,
    runtime: doc.runtime || null,
    subject: doc.subject || null,
    creator: doc.creator || null,
    collection: doc.collection || null,
    lane: Number.isInteger(lane) ? lane : null,
  };
}

function queueKey(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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

async function queuePlayable(id, cacheOrigin, ctx, mediaTypes = [], attempt = 0) {
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
    /* Preserve the queue's declared media contract during hydration. A movie
       catalog record can contain only an audio derivative; returning it to a
       video channel made a seemingly healthy shelf fail at playback time. */
    const wantsVideo = mediaTypes.includes("movies");
    const wantsAudio = mediaTypes.includes("audio");
    const chosen = wantsVideo ? video[0] : wantsAudio ? audio : (video[0] || audio);
    if (!chosen) return null;
    const urls = queueFileUrls(id, payload, chosen.name);
    return urls.length ? { type: chosen === video[0] ? "video" : "audio", url: urls[0], alts: urls.slice(1, 8) } : null;
  } catch {
    if (attempt < 1) {
      await new Promise((resolve) => setTimeout(resolve, 180));
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
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function buildIaQueue(channel, queries, themeTerms, denyTerms, mediaTypes, themeMinScore, diversity, count, cacheOrigin, ctx) {
  const items = [], deferred = [], seen = new Set(), seenTitles = new Set(), candidateLimit = count;
  const used = { lane: new Map(), era: new Map(), creator: new Map(), collection: new Map() };
  /* Query lanes are already editorially ordered by the app. Fetch a small
     sample from each lane in parallel, then take one from every lane before
     taking a second: a five-item buffer spans eras/topics instead of becoming
     five nearly identical top-download results. */
  /* The app sends up to eight deliberately separated rails: permanent/full-era,
     current rotation, opposite ends of the era range, and narrow editorial
     rails. Resolve all of them in parallel. Restricting discovery to only the
     first three made sparse channels look as if they were hydrating forever. */
  const lanes = await Promise.all(queries.slice(0, Math.min(8, queries.length)).map(async (query, lane) => {
    try {
      const result = await cachedSearchArchive(cacheOrigin, query, Math.min(24, Math.max(12, count * 3)), 1, "downloads desc", ctx);
      // Archive.org collections are catalog pages, not programs. Keeping one in
      // a shelf guarantees a failed playback attempt, so reject them before
      // ranking, caching, or media hydration for every IA channel.
      return (result.docs || []).filter((doc) => doc && safeIaId(doc.identifier) && String(doc.mediatype || "").toLowerCase() !== "collection" && (!mediaTypes.length || mediaTypes.includes(String(doc.mediatype || "").toLowerCase())))
        .sort((a, b) => themeScore(b, themeTerms) - themeScore(a, themeTerms)).map((doc) => ({ doc, lane }));
    } catch {
      return [];
    }
  }));
  const laneDepth = Math.max(0, ...lanes.map((lane) => lane.length));
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
      underCap("collection", keys.collection, diversity.maxPerCollection);
  }
  for (let row = 0; row < laneDepth && items.length < candidateLimit; row += 1) {
    for (const lane of lanes) {
      const candidate = lane[row], doc = candidate && candidate.doc;
      const titleKey = queueTitleKey(doc);
      if (!doc || !matchesTheme(doc, themeTerms, themeMinScore) || matchesDeny(doc, denyTerms) || seen.has(doc.identifier) || (titleKey && seenTitles.has(titleKey))) continue;
      seen.add(doc.identifier);
      if (titleKey) seenTitles.add(titleKey);
      if (diverseEnough(candidate)) add(candidate); else deferred.push(candidate);
      if (items.length >= candidateLimit) break;
    }
  }
  /* Sparse catalogues may not have five distinct decades or uploaders. Fill
     the reserve shelf from the same already-approved candidates, preserving
     hard genre checks and exact-title de-duplication above. */
  for (const candidate of deferred) {
    if (items.length >= candidateLimit) break;
    add(candidate);
  }
  return {
    channel,
    generatedAt: new Date().toISOString(),
    ttlSeconds: IA_QUEUE_TTL_SECONDS,
    items: items.slice(0, count),
    ready: Math.min(items.length, count),
  };
}

async function hydrateIaQueue(payload, requestedCount, cacheOrigin, ctx, mediaTypes) {
  /* Keep a few extra candidates behind the five-program shelf. Archive items
     occasionally have no browser-playable derivative; filtering those here
     means the viewer receives five actual media URLs instead of five names
     that each need another network trip in the browser. Stop as soon as the
     requested shelf is playable: waiting for every reserve item's metadata
     made a few slow Archive records hold an otherwise ready channel hostage. */
  const ready = [], items = payload.items || [];
  let cursor = 0;
  async function worker() {
    while (ready.length < requestedCount) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index], media = await queuePlayable(item.identifier, cacheOrigin, ctx, mediaTypes);
      if (media && ready.length < requestedCount) ready.push({ ...item, media });
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, items.length) }, worker));
  return {
    ...payload,
    items: ready,
    candidates: items.length,
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
  const themeTerms = safeThemeTerms(body && body.themeTerms);
  const denyTerms = safeDenyTerms(body && body.denyTerms);
  const mediaTypes = safeMediaTypes(body && body.mediaTypes);
  const themeMinScore = safeThemeMinScore(body && body.themeMinScore);
  const diversity = safeDiversity(body && body.diversity);
  const count = Math.max(1, Math.min(5, Number(body && body.count) || 5));
  if (!safeChannel(channel) || !queries) return json({ error: "invalid queue request" }, 400);
  const cacheKey = new Request(url.origin + IA_PREFIX + "/cache/queue/" + IA_QUEUE_CACHE_VERSION + "/" + await stableKey(JSON.stringify({ channel, queries, themeTerms, denyTerms, mediaTypes, themeMinScore, diversity, count })));
  try {
    const cache = caches.default, cached = await cache.match(cacheKey);
    if (cached) return cached;
    // Hard-locked programming can reject many otherwise plausible Archive.org
    // results. Give those channels a deeper candidate shelf before hydration so
    // a single unplayable item never turns into a visible No Signal screen.
    const strictQueue = themeMinScore > 1;
    const candidateCount = Math.min(strictQueue ? 30 : 20, Math.max(count, count * (strictQueue ? 6 : 4)));
    const payload = await buildIaQueue(channel, queries, themeTerms, denyTerms, mediaTypes, themeMinScore, diversity, candidateCount, url.origin, ctx);
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
    const hydration = hydrateIaQueue(payload, count, url.origin, ctx, mediaTypes);
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
  // One fixed cache key prevents public callers from varying the query and
  // keeps either upstream provider from blanking every connected client.
  const url = new URL(request.url);
  const cacheKey = new Request(url.origin + SNAPSHOT_PATH + "?v=" + SNAPSHOT_CACHE_VERSION);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value));
    headers.set("X-Afterglow-Source", "ship-cache");
    return new Response(cached.body, { status: cached.status, headers });
  }

  if (env.KPLER_API_KEY) {
    const query = new URLSearchParams({
      filter: GULF_FILTER,
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
      if (upstream.ok) {
        const payload = await upstream.json();
        const features = normalizeShipSnapshot(payload).slice(0, 1000);
        if (!features.length) throw new Error("kpler empty or unrecognized");
        const response = json({
          source: "kpler",
          fetchedAt: new Date().toISOString(),
          type: "FeatureCollection",
          features,
        }, 200, {
          "Cache-Control": "public, max-age=" + SNAPSHOT_TTL_SECONDS,
          "X-Afterglow-Source": "kpler-live",
        });
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      }
    } catch {
      // Continue to the keyless public fallback below. Provider errors are not
      // exposed to the browser because they can include account diagnostics.
    }
  }

  // Open Waters publishes an open, current GeoJSON snapshot. Normalize its
  // vessel properties to the existing Kpler-shaped client contract so the TV
  // channel can recover without a browser key or a provider-specific redraw.
  try {
    const fallback = await fetch(OPEN_WATERS_GULF_URL, {
      headers: { "Accept": "application/geo+json, application/json" },
    });
    if (!fallback.ok) throw new Error("open waters " + fallback.status);
    const payload = await fallback.json();
    const features = normalizeShipSnapshot(payload).slice(0, 1000);
    if (!features.length) throw new Error("open waters empty");
    const response = json({
      source: "openwaters",
      fetchedAt: new Date().toISOString(),
      type: "FeatureCollection",
      features,
    }, 200, {
      "Cache-Control": "public, max-age=" + SNAPSHOT_TTL_SECONDS,
      "X-Afterglow-Source": "openwaters-live",
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch {
    return json({ error: "ship snapshot is temporarily unavailable" }, 502);
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
