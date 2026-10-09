/* RealSignal server-side Source Suite adapters.
 *
 * The browser sends only a stable profile key. This module owns the approved
 * provider queries, discovery, television-length filtering, landscape
 * validation, and the normalized item shape returned to every client surface.
 * YouTube uses the optional YOUTUBE_API_KEY Worker secret. PeerTube uses its
 * public API and direct media renditions. Vimeo and OK.ru are opt-in,
 * server-only adapters that return official platform embeds and never download
 * third-party media. OK.ru prefers its signed REST API when the three
 * Cloudflare secrets are present, then uses OK's publicly declared video
 * sitemap/player metadata during maintenance before falling back to a small,
 * reviewable public-embed manifest.
 */

import { createHash } from "node:crypto";
import { okSearchRows, okSearchResultRows, okSearchPageRequest, okQueryOffset, okEmbedMetadata, okTitleSearchQueries, okPublicSearchUrl, okProgramIdentity, okProgramName, okMovieIdentities, okBalancedCandidates, okTVIndexTitles, okDiscoveryCursor } from "./ok_public_search.js";
import { OK_VERIFIED_SEARCH_SEED } from "./ok_verified_search_seed.js";
import { okAnimationFamily, okAnimationQueries, okAnimationIdentity, okAnimationPrecheck, okAnimationVerified } from "./ok_animation_catalog.js";
import { okCuratedChannel, okCuratedQueries, okCuratedIdentity, okCuratedPrecheck, okCuratedVerified } from "./ok_curated_tv_catalog.js";
import { okMusicChannel, okMusicQueries, okMusicPrecheck, okMusicVerified, okMusicIdentities } from "./ok_music_catalog.js";
import { OK_ANIMATION_VERIFIED_SEED } from "./ok_animation_verified_seed.js";
import { SOURCE_PROFILE_REGISTRY } from "./source_suite_profile_registry.js";
import { OK_PUBLIC_EMBED_MANIFEST } from "./ok_public_embed_catalog.js";
import { VIMEO_FIELDS, vimeoDiscoveryCursor, vimeoSearchPage, vimeoItem, vimeoOEmbedVerified, vimeoBalancedItems, vimeoJson, vimeoProgramOkay, vimeoProgramIdentity, vimeoLanguageKnown, vimeoOriginalSeriesEvidence } from "./vimeo_catalog.js";

const SOURCE_MIN_RUNTIME = 15 * 60;
const SOURCE_MIN_ASPECT_RATIO = 1.2;
/* The client still promotes only a small hot shelf. The server keeps a much
   larger verified window so a channel can rotate across real television-length
   material instead of reopening the same five records. */
const SOURCE_MAX_ITEMS = 96;
/* A source shelf is not considered deep merely because one or two playable
   embeds exist. Keep the playback path stale-first, but make twelve verified
   items the refill target so the catalog can rotate instead of repeating. */
const SOURCE_MIN_READY = 12;
const SOURCE_MAX_QUERIES = 8;
/* Search is quota-expensive and should deepen the durable catalog over time,
   not fan every editorial query out on every tune. Each rotation advances a
   bounded window; D1 retains the union from prior windows. */
const SOURCE_QUERY_WINDOW = 4;
/* A small opt-in expansion for catalog lanes that have proved shallow in
   production. Most lanes stay at four upstream searches; profiles marked
   queryWindow: 6 get extra diversity during background catalog repair only. */
const SOURCE_MAX_QUERY_WINDOW = 6;
const SOURCE_YOUTUBE_QUERY_CONCURRENCY = 2;
const SOURCE_MAX_CONCURRENCY = 4;
const SOURCE_TIMEOUT_MS = 7000;
/* PeerTube federation search is fast, but the selected instance often needs
   a few seconds to return file/playlist metadata. The viewer still receives
   the stale verified shelf immediately; this budget only controls background
   catalog deepening and prevents healthy licensed films from being discarded
   before their playable file is visible. */
const SOURCE_DETAIL_TIMEOUT_MS = 3500;
/* A provider that cannot produce a verified lane inside this budget is not a
   playback candidate. Let the other provider win, record the slow provider as
   unhealthy, and keep it out of the next shelf until its cooldown expires. */
const SOURCE_PROVIDER_BUDGET_MS = 4500;
const SOURCE_FIRST_LANE_TIMEOUT_MS = 5000;
const OK_SITEMAP_MAINTENANCE_TIMEOUT_MS = 30_000;
const SOURCE_DEFAULT_INSTANCES = [
  "https://video.blender.org",
  "https://framatube.org",
  "https://peertube.uno",
  "https://tilvids.com",
  "https://peertube.doesstuff.social",
  "https://peertube.dngr.us",
  "https://search.joinpeertube.org",
];

function text(value, limit = 500) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, limit);
}

function list(values, limit = SOURCE_MAX_QUERIES) {
  return (Array.isArray(values) ? values : [])
    .map((value) => text(value, 180))
    .filter(Boolean)
    .slice(0, limit);
}

function unique(items) {
  const seen = new Set();
  return items.filter((item) => {
    const id = text(item && (item.id || item.uuid || item.rawId), 300);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function rotate(values, rotation) {
  const source = values.slice();
  if (!source.length) return source;
  const offset = ((Number(rotation) || 0) % source.length + source.length) % source.length;
  return source.slice(offset).concat(source.slice(0, offset));
}

function aspectRatio(value) {
  const width = Number(value && (value.width || value.videoWidth || value.embedWidth));
  const height = Number(value && (value.height || value.videoHeight || value.embedHeight));
  if (width > 0 && height > 0) return width / height;
  const ratio = Number(value && (value.aspectRatio || value.ratio));
  if (Number.isFinite(ratio) && ratio > 0) return ratio;
  const label = text(value && value.resolution && (value.resolution.label || value.resolution.name), 40);
  return /^\d{3,4}p$/i.test(label) ? 16 / 9 : 0;
}

function isoDuration(value) {
  const match = text(value, 40).match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  return match ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) : 0;
}

function withTimeout(promise, ms = SOURCE_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("source timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function fetchJson(url, options = {}) {
  const response = await withTimeout(fetch(url, options));
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.clone().json();
      const first = Array.isArray(body && body.error && body.error.errors) ? body.error.errors[0] : null;
      detail = text(first && (first.reason || first.message) || body && body.error && body.error.message || body && body.message, 180);
    } catch (_) { /* provider may return an HTML or empty error body */ }
    const error = new Error(`source http ${response.status}${detail ? ` · ${detail}` : ""}`);
    error.status = response.status;
    error.providerDetail = detail;
    throw error;
  }
  return response.json();
}

async function fetchText(url, options = {}, timeoutMs = 10_000) {
  const response = await withTimeout(fetch(url, options), timeoutMs);
  if (!response.ok) throw new Error(`source http ${response.status}`);
  const bytes = await withTimeout(response.arrayBuffer(), timeoutMs);
  const contentType = text(response.headers.get("content-type"), 120).toLowerCase();
  if (/gzip/i.test(contentType) || /\.gz(?:$|\?)/i.test(url)) {
    if (typeof DecompressionStream !== "function") throw new Error("gzip decompression unavailable");
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
  }
  return new TextDecoder().decode(bytes);
}

const OK_API_DEFAULT_SERVER = "https://api.ok.ru/fb.do";
const OK_API_VIDEO_TYPES = ["USER_VIDEO", "GROUP_VIDEO"];
const OK_VIDEO_SITEMAP_INDEX = "https://ok.ru/sitemap-index-video.xml.gz";

function md5Hex(value) {
  return createHash("md5").update(String(value || ""), "utf8").digest("hex");
}

function okApiConfig(env) {
  const applicationKey = text(env && env.OK_APPLICATION_KEY, 240);
  const applicationSecret = text(env && env.OK_APPLICATION_SECRET, 240);
  const sessionSecret = text(env && env.OK_SESSION_SECRET, 240);
  const sessionKey = text(env && env.OK_SESSION_KEY, 600);
  const accessToken = text(env && env.OK_ACCESS_TOKEN, 600);
  return applicationKey && (sessionKey || accessToken) && (applicationSecret || sessionSecret) ? {
    applicationKey,
    applicationSecret,
    sessionSecret,
    sessionKey,
    accessToken,
    apiServer: text(env && env.OK_API_SERVER, 600) || OK_API_DEFAULT_SERVER,
  } : null;
}

function okApiSignature(params, sessionSecret) {
  const signed = Object.keys(params)
    .filter((key) => key !== "access_token" && key !== "session_key" && key !== "sig")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("");
  return md5Hex(`${signed}${sessionSecret}`).toLowerCase();
}

async function okApiCall(method, params, env) {
  const config = okApiConfig(env);
  if (!config) throw new Error("OK API secrets not configured");
  const requestParams = {
    ...params,
    application_key: config.applicationKey,
    format: "json",
    method,
  };
  if (config.sessionKey) requestParams.session_key = config.sessionKey;
  else requestParams.access_token = config.accessToken;
  const requestSecret = config.sessionSecret || md5Hex(`${config.accessToken || config.sessionKey}${config.applicationSecret}`).toLowerCase();
  requestParams.sig = okApiSignature(requestParams, requestSecret);
  const url = `${config.apiServer}${config.apiServer.includes("?") ? "&" : "?"}${new URLSearchParams(requestParams)}`;
  const data = await fetchJson(url, { headers: { Accept: "application/json", Referer: "https://esfsfestgfse.github.io/Archivetv/" } });
  if (data && (data.error_code || data.errorCode || data.error_msg || data.errorMessage)) {
    throw new Error(`OK API ${text(data.error_code || data.errorCode || "error", 40)} · ${text(data.error_msg || data.errorMessage || "request failed", 180)}`);
  }
  return data || {};
}

function okApiScalar(value) {
  if (Array.isArray(value)) return value.length ? value[0] : "";
  return value;
}

function okApiObject(value) {
  if (Array.isArray(value)) return value.find((entry) => entry && typeof entry === "object") || null;
  return value && typeof value === "object" ? value : null;
}

function okApiDurationValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  /* OK.ru responses in the wild contain both second-valued VideoBean
     durations and legacy millisecond-sized values under the generic
     `duration` field. A multi-day "movie" is a unit signal, not a real
     program, so normalize only implausibly large values here. */
  return numeric > 24 * 60 * 60 ? numeric / 1000 : numeric;
}

function okApiDuration(row) {
  const seconds = okApiDurationValue(okApiScalar(row && row.duration_seconds));
  if (seconds > 0) return seconds;
  const milliseconds = Number(okApiScalar(row && row.duration_ms));
  if (Number.isFinite(milliseconds) && milliseconds > 0) return milliseconds / 1000;
  const duration = okApiDurationValue(okApiScalar(row && row.duration));
  if (duration > 0) return duration;
  return okApiDurationValue(okApiScalar(row && row.length));
}

function okApiId(value) {
  const raw = text(okApiScalar(value), 200);
  if (!raw) return "";
  const match = raw.match(/(?:video|movie|content)[:/_-]?(\d+)/i);
  return text(match ? match[1] : raw, 120);
}

function okApiRows(data) {
  const rows = [];
  const seenObjects = new Set();
  function visit(value, depth = 0) {
    if (!value || depth > 7) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, depth + 1));
      return;
    }
    if (typeof value !== "object") return;
    if (seenObjects.has(value)) return;
    seenObjects.add(value);
    const id = okApiId(value.id || value.videoId || value.video_id || value.content_id || value.contentId || value.movieId || value.movie_id || value.ref);
    const title = text(okApiScalar(value.title || value.name || value.caption), 500);
    const duration = okApiDuration(value);
    const hasVideoShape = Boolean(id && (title || duration || value.url || value.permalink || value.videoUrl || value.url_hls || value.url_mp4 || value.width || value.height));
    if (hasVideoShape) rows.push(value);
    Object.values(value).forEach((child) => visit(child, depth + 1));
  }
  visit(data);
  return rows;
}

async function okApiTagQueries(seed, env) {
  const query = text(seed, 180);
  if (query.length < 3) return [];
  const data = await okApiCall("search.tagSearch", {
    query,
    count: 20,
    filter: JSON.stringify({ types: OK_API_VIDEO_TYPES }),
  }, env);
  const tags = Array.isArray(data && data.tags) ? data.tags : [];
  return tags
    .map((tag) => text(okApiScalar(tag && (tag.query || tag.name || tag.tag)), 180))
    .filter((tag) => tag.length >= 3);
}

function okXmlDecode(value) {
  return text(value, 2000)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function okSitemapTag(block, tag) {
  const match = String(block || "").match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return okXmlDecode(match && match[1] || "");
}

function okSitemapEntries(xml, profile) {
  return Array.from(String(xml || "").matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)).map((match) => {
    const block = match[1] || "";
    const video = block.match(/<video:video\b[^>]*>([\s\S]*?)<\/video:video>/i);
    const videoBlock = video && video[1] || "";
    const title = okSitemapTag(videoBlock, "video:title");
    /* Every approved OK profile currently carries title quality markers. They
       are the user-requested discovery contract, so discard the other 99% of
       a shard before decoding descriptions, embeds, thumbnails, and dates. */
    if (profile && Array.isArray(profile.titleRequiredTerms) && profile.titleRequiredTerms.length
        && !(profile.titleRequiredTerms || []).some((term) => termsMatch(title.toLowerCase(), [term]))) return null;
    return {
      sourceUrl: okSitemapTag(block, "loc"),
      title,
      description: okSitemapTag(videoBlock, "video:description"),
      embedUrl: okSitemapTag(videoBlock, "video:player_loc"),
      embedAllowed: /<video:player_loc\b[^>]*allow_embed\s*=\s*["']?yes["']?/i.test(videoBlock),
      thumbnailUrl: okSitemapTag(videoBlock, "video:thumbnail_loc"),
      duration: Number(okSitemapTag(videoBlock, "video:duration")) || 0,
      year: okSitemapTag(videoBlock, "video:publication_date"),
    };
  }).filter((item) => item && item.sourceUrl && item.title && item.embedUrl);
}

function okSitemapShardUrls(xml) {
  return Array.from(String(xml || "").matchAll(/<loc>(https?:\/\/ok\.ru\/sitemap-part-video-[^<]+?\.xml\.gz)<\/loc>/gi))
    .map((match) => match[1])
    .filter((url, index, all) => all.indexOf(url) === index);
}

let okSitemapShardCache = { at: 0, indexUrl: "", urls: [] };

function okThumbnailDimensions(url) {
  const match = text(url, 1400).match(/(?:size=|[?&](?:width|w)=)(\d{2,5})[x&](?:height|h)=?(\d{2,5})/i)
    || text(url, 1400).match(/(?:^|[^0-9])(\d{3,5})x(\d{3,5})(?:[^0-9]|$)/i);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : { width: 0, height: 0 };
}

function okEmbedDimensions(html) {
  const decoded = String(html || "")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&apos;/gi, "'")
    .replace(/\\u0026/gi, "&");
  const pairs = Array.from(decoded.matchAll(/\"width\"\s*:\s*\"?(\d+)\"?\s*,\s*\"height\"\s*:\s*\"?(\d+)\"?/gi))
    .map((match) => ({ width: Number(match[1]), height: Number(match[2]) }))
    .filter((pair) => pair.width > 0 && pair.height > 0);
  return pairs.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0] || { width: 0, height: 0 };
}

function okSitemapQuery(profile, item) {
  const title = text(item.title, 1200).toLowerCase();
  const haystack = text([item.title, item.description].join(" "), 5000).toLowerCase();
  const titleSeeds = Array.isArray(profile.okApiTitleQueries) ? profile.okApiTitleQueries : [];
  const titleHit = titleSeeds.find((seed) => {
    const compactSeed = text(seed, 180).toLowerCase().replace(/[^a-z0-9]+/g, "");
    const compactTitle = title.replace(/[^a-z0-9]+/g, "");
    return compactSeed.length >= 4 && compactTitle.includes(compactSeed);
  });
  const quality = (profile.titleRequiredTerms || []).find((term) => termsMatch(title, [term]));
  if (titleHit) return `${titleHit}${quality ? ` ${quality}` : ""}`;
  /* The sitemap is the broad discovery rail. Do not require a hand-curated
     title list to find a real film: a long-form OK title carrying one of the
     requested release-quality markers is enough to enter the normal strict
     admission pipeline. `accepted()` still enforces the one-hour runtime,
     landscape/embed/English checks, and all deny terms. */
  if (profile.profileKey === "ok-movie-channel" && quality && Number(item.duration) >= 60 * 60
      && !termsMatch(title, ["episode", "season", "series", "tv show", "television", "sitcom", "cartoon", "trailer", "clip"])) {
    return `movie-quality ${quality}`;
  }
  if (profile.profileKey === "ok-movie-channel" && termsMatch(haystack, [...OK_MOVIE_CONTEXT_TERMS, ...OK_MOVIE_STRONG_TERMS])) return `movie ${quality || ""}`.trim();
  if (profile.profileKey === "ok-tv-channel" && termsMatch(haystack, profile.topics || [])) return `television ${quality || ""}`.trim();
  return "";
}

async function okSitemap(profile, rotation, env, options = {}) {
  const firstLane = options.firstLane === true;
  if (firstLane) return { provider: "OK.ru", items: [], health: { sitemap: true, skipped: true, reason: "maintenance-only sitemap discovery", firstLane } };
  const indexUrl = text(env && env.OK_VIDEO_SITEMAP_INDEX, 600) || OK_VIDEO_SITEMAP_INDEX;
  let shardUrls = okSitemapShardCache.indexUrl === indexUrl && Date.now() - okSitemapShardCache.at < 6 * 60 * 60 * 1000 ? okSitemapShardCache.urls : [];
  if (!shardUrls.length) {
    const indexXml = await fetchText(indexUrl, { headers: { Accept: "application/xml, text/xml", "User-Agent": "RealSignal-public-catalog/1.0" } });
    shardUrls = okSitemapShardUrls(indexXml);
    okSitemapShardCache = { at: Date.now(), indexUrl, urls: shardUrls };
  }
  const shardUrl = rotate(shardUrls, rotation)[0];
  if (!shardUrl) return { provider: "OK.ru", items: [], health: { sitemap: true, skipped: true, reason: "no video sitemap shards", firstLane } };
  const shardXml = await fetchText(shardUrl, { headers: { Accept: "application/xml, text/xml", "User-Agent": "RealSignal-public-catalog/1.0" } }, 28_000);
  const entries = okSitemapEntries(shardXml, profile);
  const candidates = entries.map((entry) => {
    const query = okSitemapQuery(profile, entry);
    if (!query) return null;
    const id = text(entry.sourceUrl.match(/\/video\/(\d+)/i)?.[1], 120);
    return id ? {
      id: `ok:${id}`,
      rawId: id,
      title: entry.title,
      description: entry.description,
      duration: entry.duration,
      year: entry.year,
      url: entry.embedUrl,
      embedUrl: entry.embedUrl,
      sourceUrl: entry.sourceUrl,
      thumbnailUrl: entry.thumbnailUrl,
      embedAllowed: entry.embedAllowed === true,
      type: "embed",
      rights: "OK.ru public embed; playback remains subject to provider availability",
      query,
    } : null;
  }).filter(Boolean).filter((item) => accepted(profile, { ...item, aspectRatio: 16 / 9 }, "OK.ru", false));
  const knownDimensions = candidates.map((item) => ({ item, dimensions: okThumbnailDimensions(item.thumbnailUrl) }));
  const known = knownDimensions
    .filter(({ dimensions }) => dimensions.width > 0 && dimensions.height > 0)
    .map(({ item, dimensions }) => ({ ...item, ...dimensions, aspectRatio: dimensions.width / dimensions.height }))
    .filter((item) => accepted(profile, item, "OK.ru"))
    .map((item) => normalized(item, "OK.ru", item.query));
  const unknown = knownDimensions.filter(({ dimensions }) => !(dimensions.width > 0 && dimensions.height > 0)).map(({ item }) => item);
  const details = await mapLimit(unknown.slice(0, 6), 2, async (item) => {
    try {
      const html = await fetchText(item.embedUrl, { headers: { Accept: "text/html", "User-Agent": "RealSignal-public-catalog/1.0" } });
      const dimensions = okEmbedDimensions(html);
      const hydrated = { ...item, aspectRatio: dimensions.width && dimensions.height ? dimensions.width / dimensions.height : 0, width: dimensions.width, height: dimensions.height };
      return accepted(profile, hydrated, "OK.ru") ? normalized(hydrated, "OK.ru", item.query) : null;
    } catch (_) { return null; }
  });
  return {
    provider: "OK.ru",
    items: unique(known.concat(details.filter(Boolean))).slice(0, SOURCE_MAX_ITEMS),
    health: { sitemap: true, indexUrl, shardUrl, shards: shardUrls.length, entries: entries.length, candidates: candidates.length, thumbnailVerified: known.length, embedVerified: details.filter(Boolean).length, firstLane },
  };
}

function okApiDimensions(row) {
  const sources = [row, okApiScalar(row && row.dimensions), okApiScalar(row && row.initial_dimensions), okApiScalar(row && row.video_info), okApiScalar(row && row.videoInfo), okApiScalar(row && row.video)];
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const width = Number(okApiScalar(source.width || source.video_width || source.standard_width || source.standardWidth || source.w || source.video_info && source.video_info.width)) || 0;
    const height = Number(okApiScalar(source.height || source.video_height || source.standard_height || source.standardHeight || source.h || source.video_info && source.video_info.height)) || 0;
    if (width > 0 && height > 0) return { width, height };
    const raw = text(okApiScalar(source.value || source.size || source.resolution || source.dimensions), 80);
    const match = raw.match(/(\d{2,5})\s*[x×]\s*(\d{2,5})/i);
    if (match) return { width: Number(match[1]), height: Number(match[2]) };
  }
  return { width: 0, height: 0 };
}

function okApiItem(row, query) {
  const dimensions = okApiDimensions(row);
  const width = dimensions.width;
  const height = dimensions.height;
  const id = okApiId(row.id || row.videoId || row.video_id || row.content_id || row.contentId || row.movieId || row.movie_id || row.ref);
  const permalink = text(okApiScalar(row.permalink || row.sourceUrl || row.source_url || row.url || row.videoUrl), 1400);
  const blocked = okApiScalar(row.blocked);
  const published = okApiScalar(row.is_published || row.isPublished);
  const directLinkAccess = okApiScalar(row.direct_link_access || row.directLinkAccess);
  if (!id || !permalink || blocked === true || published === false || directLinkAccess === false) return null;
  const title = text(okApiScalar(row.title || row.name || row.caption), 500);
  const description = text(okApiScalar(row.description || row.text), 1800);
  const tags = Array.isArray(row.tags) ? row.tags.map((tag) => text(okApiScalar(tag), 100)).filter(Boolean).join(" ") : text(okApiScalar(row.tags), 600);
  const embedUrl = `https://ok.ru/videoembed/${encodeURIComponent(id)}`;
  return {
    id: `ok:${id}`,
    rawId: id,
    title,
    description,
    tags,
    category: text(okApiScalar(row.content_type || row.contentType || row.category), 120),
    account: text(okApiScalar(row.owner_name || row.ownerName || row.provider || row.partner_name), 180),
    language: text(okApiScalar(row.language || row.lang), 40),
    year: text(okApiScalar(row.created || row.created_ms || row.publish_at), 20),
    rights: "OK.ru public embed; provider authorization required",
    duration: okApiDuration(row),
    aspectRatio: width > 0 && height > 0 ? width / height : 0,
    type: "embed",
    url: embedUrl,
    embedUrl,
    sourceUrl: /^https?:\/\//i.test(permalink) ? permalink : `https://ok.ru/video/${id}`,
    embedAllowed: Boolean(width > 0 && height > 0 && embedUrl),
    query,
  };
}

export async function okTitleSearch(profile, rotation, env, options = {}) {
  const firstLane = options.firstLane === true;
  const animation = okAnimationFamily(profile);
  const curated = okCuratedChannel(profile);
  const music = okMusicChannel(profile);
  // Music metadata work belongs exclusively to background ingestion.
  if (music && options.maintenance !== true) return { provider: "OK.ru", items: okBalancedCandidates([(OK_VERIFIED_SEARCH_SEED[profile.profileKey] || []).map(item => qualifySourceItem(profile,item)).filter(Boolean)],"music",SOURCE_MAX_ITEMS), health: { skipped: true, reason: "verified-music-catalog-only" } };
  const errors = [];
  const cursor = firstLane ? rotation : await okDiscoveryCursor(env.realsignal_catalog, profile.profileKey, rotation);
  let seriesTitles = [];
  const indexPage = Math.floor(cursor / 80);
  if (!firstLane && profile.profileKey === "ok-tv-channel") {
    try {
      const shows = await fetchJson(`https://api.tvmaze.com/shows?page=${indexPage}`, { cf: { cacheTtl: 86400, cacheEverything: true } });
      seriesTitles = okTVIndexTitles(shows, cursor % 80);
    } catch (error) { errors.push(`series index: ${text(error?.message, 100)}`); }
  }
  const queries = (music ? okMusicQueries(profile,cursor) : animation ? okAnimationQueries(profile, cursor) : curated ? okCuratedQueries(profile, cursor) : okTitleSearchQueries(profile, cursor, { seriesTitles, deep: !firstLane })).slice(0, firstLane ? 2 : 6);
  const offsets = [];
  const pages = await mapLimit(queries, 2, async (query) => {
    try {
      const path = `$.okQueryOffsets.q${createHash("sha256").update(query.toLowerCase()).digest("hex").slice(0, 16)}`;
      const offset = firstLane ? 0 : await okQueryOffset(env.realsignal_catalog, profile.profileKey, path);
      offsets.push({ query, offset });
      const request = okSearchPageRequest(query, offset);
      const payload = await fetchJson(request.url, request.options);
      if (!payload.success) throw new Error("public search page unavailable");
      if (!payload.result?.videos) {
        if (!firstLane) await okQueryOffset(env.realsignal_catalog, profile.profileKey, path, true);
        return [];
      }
      const rows = okSearchResultRows(payload.result);
      if (!firstLane && (!payload.result.videos.hasMore || !rows.length)) await okQueryOffset(env.realsignal_catalog, profile.profileKey, path, true);
      return rows.map((row) => okApiItem(row, query)).filter(Boolean);
    } catch (error) {
      errors.push(text(error?.message, 120));
      try {
        const html = await fetchText(okPublicSearchUrl(query), { headers: { Accept: "text/html" } }, 6000);
        return okSearchRows(html).map(row => okApiItem(row, query)).filter(Boolean);
      } catch (_) { return []; }
    }
  });
  const kind = music ? "music" : profile.profileKey === "ok-tv-channel" || animation || curated ? "tv" : "movie";
  const candidates = okBalancedCandidates(pages.map(page => page.filter(item => accepted(profile, item, "OK.ru"))), kind, music ? 16 : firstLane ? 12 : 36);
  const identityCache = new Map();
  const animationMisses = [];
  const curatedMisses = [];
  let movieIdentities = new Map();
  let musicIdentities = new Map();
  if (music) {
    const known = [...(OK_VERIFIED_SEARCH_SEED[profile.profileKey] || [])];
    if (env.realsignal_catalog) {
      try {
        const stored = await env.realsignal_catalog.prepare("SELECT p.metadata_json FROM programs p JOIN channel_programs cp ON cp.program_id=p.id WHERE cp.channel_key=? ORDER BY cp.last_seen_at DESC LIMIT 512").bind(profile.profileKey).all();
        for (const row of stored.results || []) { try { known.push(JSON.parse(row.metadata_json)); } catch (_) {} }
      } catch (_) { /* bootstrap remains usable */ }
    }
    musicIdentities = await okMusicIdentities(candidates,known,url => fetchJson(url,{ headers: { "User-Agent": "RealSignal/5.5.81 (https://github.com/esfsfestgfse/Archivetv)" }, cf: { cacheTtl: 604800, cacheEverything: true } }));
  }
  if (kind === "movie") {
    // An identity lookup can delay NEW discoveries, never erase a known shelf.
    const known = [...(OK_VERIFIED_SEARCH_SEED[profile.profileKey] || [])];
    if (env.realsignal_catalog) {
      try {
        const stored = await env.realsignal_catalog.prepare("SELECT metadata_json FROM programs WHERE provider=? AND status='active' ORDER BY last_seen_at DESC LIMIT 256").bind("OK.ru").all();
        for (const row of stored.results || []) { try { known.push(JSON.parse(row.metadata_json)); } catch (_) {} }
      } catch (_) { /* bootstrap identities remain available */ }
    }
    const nameOf = item => `${String(item.title).match(/\b(?:19|20)\d{2}\b/)?.[0] || ""}:${okProgramName(item.title, "movie").toLowerCase()}`;
    const identities = new Map(known.filter(item => item.language === "en" && item.identityReference).map(item => [nameOf(item), { language: "en", identityReference: item.identityReference, identityProvider: "Wikidata" }]));
    for (const item of candidates) if (identities.has(nameOf(item))) movieIdentities.set(item.id, identities.get(nameOf(item)));
    try { const discovered = await okMovieIdentities(candidates.filter(item => !movieIdentities.has(item.id)), url => fetchJson(url, { headers: { "User-Agent": "RealSignal/5.5.81 (catalog metadata; https://github.com/esfsfestgfse/Archivetv)" }, cf: { cacheTtl: 86400, cacheEverything: true } })); for (const [key, identity] of discovered) movieIdentities.set(key, identity); }
    catch (error) { errors.push(`film identity: ${text(error?.message, 100)}`); }
  }
  const verified = await mapLimit(candidates, 3, async (item) => {
    try {
      const identity = music ? musicIdentities.get(item.id) : animation ? await okAnimationIdentity(profile,item,url=>fetchJson(url,{},6000),identityCache) : curated ? await okCuratedIdentity(profile,item) : kind === "tv" ? await okProgramIdentity(item, "tv", (url) => fetchJson(url, {}, 6000), identityCache) : movieIdentities.get(item.id);
      if (!identity) { if (animation && animationMisses.length < 8) animationMisses.push({title:item.title,programName:okProgramName(item.title,"tv"),stage:"show-identity"}); if (curated && curatedMisses.length < 8) curatedMisses.push({title:item.title,stage:"curated-program-identity"}); return null; }
      const html = await fetchText(item.embedUrl, { headers: { Accept: "text/html" } }, 6000);
      const metadata = okEmbedMetadata(html, item.rawId);
      if (!metadata) return null;
      const hydrated = { ...item, ...metadata, ...identity, id: item.id };
      return qualifySourceItem(profile,{...hydrated,provider:"OK.ru"});
    } catch (_) { return null; }
  });
  return { provider: "OK.ru", items: verified.filter(Boolean), health: {
    titleSearch: true, queries, queryPages: offsets, discoveryCursor: cursor, seriesIndexPage: seriesTitles.length ? indexPage : null, candidates: candidates.length,
    verifiedEmbeds: verified.filter(Boolean).length, errors, firstLane,
    ...(animation ? { animationMisses } : {}),
    ...(curated ? { curatedMisses } : {}),
    ...(errors.length === queries.length ? { error: "public title search unavailable" } : {}),
  } };
}

// The identical gate is applied to newly discovered items AND old D1 rows.
export function isOKSourceProfile(value) {
  const profile = typeof value === "string" ? SOURCE_PROFILE_REGISTRY[value] : value;
  return !!profile && Array.isArray(profile.providers) && profile.providers.some(provider => /^ok-(?:search|manifest|api)$/.test(provider));
}

export function qualifySourceItem(profile, item) {
  if (!profile || !item) return null;
  if (okAnimationFamily(profile) && !okAnimationVerified(profile,item)) return null;
  if (okCuratedChannel(profile) && !okCuratedVerified(profile,item)) return null;
  if (okMusicChannel(profile) && !okMusicVerified(profile,item)) return null;
  if (item.provider === "Vimeo" && (item.embedVerified !== true || item.publicEmbed !== true || !vimeoProgramOkay(item, profile.intent === "film" ? "movie" : "tv") || !vimeoLanguageKnown(item))) return null;
  if (item.provider === "Vimeo" && profile.intent === "television" && !item.seriesId && !vimeoOriginalSeriesEvidence(item)) return null;
  if (/^ok-(?:movie|tv)-channel$/.test(profile.profileKey)) {
    // Search words and an English-looking title are not language evidence.
    // Recheck persisted rows too: legacy tag results included foreign animation.
    const tv = profile.profileKey === "ok-tv-channel";
    const reference = String(item.identityReference || "");
    if (item.language !== "en" || (tv
      ? !/^https:\/\/www\.tvmaze\.com\/shows\/\d+(?:\/|$)/.test(reference) || !/^tvmaze:\d+$/.test(String(item.seriesId || ""))
      : !/^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/.test(reference))) return null;
  }
  const url = text(item.embedUrl || item.media?.url || item.mediaUrl || item.url, 1400);
  const okEmbed = item.provider === "OK.ru" && /^https:\/\/ok\.ru\/videoembed\/\d+(?:[?#]|$)/i.test(url);
  const candidate = okEmbed ? { ...item, type: "embed", url, embedUrl: url, embedAllowed: true } : item;
  return accepted(profile, candidate, candidate.provider) ? normalized(candidate, candidate.provider, candidate.query) : null;
}

function normalizedProfile(body) {
  const profileKey = text(body && (body.profileKey || body.channel || body.name), 120).toLowerCase().replace(/[^a-z0-9._:-]+/g, "-");
  const approved = SOURCE_PROFILE_REGISTRY[profileKey];
  if (!approved) return null;
  const queryLimit = Math.max(SOURCE_MAX_QUERIES, Math.min(32, Number(approved.queryLimit) || SOURCE_MAX_QUERIES));
  return {
    profileKey,
    name: approved.name,
    queries: list(approved.queries, queryLimit),
    okApiQueries: list(approved.okApiQueries, queryLimit),
    okApiBroadQueries: list(approved.okApiBroadQueries, queryLimit),
    okApiTitleQueries: list(approved.okApiTitleQueries, queryLimit),
    okApiTitleQualifiers: list(approved.okApiTitleQualifiers, 8),
    queryWindow: Math.max(1, Math.min(approved.deepCatalog === true ? 10 : SOURCE_MAX_QUERY_WINDOW, Number(approved.queryWindow) || SOURCE_QUERY_WINDOW)),
    peerTubeQueryWindow: Math.max(1, Math.min(approved.deepCatalog === true ? 10 : SOURCE_MAX_QUERY_WINDOW, Number(approved.peerTubeQueryWindow) || Number(approved.queryWindow) || SOURCE_QUERY_WINDOW)),
    peerTubeInstanceLimit: Math.max(1, Math.min(8, Number(approved.peerTubeInstanceLimit) || 8)),
    peerTubeDetailLimit: Math.max(SOURCE_MIN_READY, Math.min(32, Number(approved.peerTubeDetailLimit) || 32)),
    peerTubeFallbackQueryWindow: Math.max(1, Math.min(approved.deepCatalog === true ? 10 : SOURCE_MAX_QUERY_WINDOW, Number(approved.peerTubeFallbackQueryWindow) || SOURCE_QUERY_WINDOW)),
    deepCatalog: approved.deepCatalog === true,
    match: list(approved.match, 40),
    deny: list(approved.deny, 96),
    intent: text(approved.intent, 40).toLowerCase(),
    topics: list(approved.topics, 32),
    strictTopicTerms: list(approved.strictTopicTerms, 16),
    formats: list(approved.formats, 24),
    titleRequiredTerms: list(approved.titleRequiredTerms, 24),
    formatRelaxed: approved.formatRelaxed === true,
    minRuntimeSeconds: Math.max(okMusicChannel({profileKey}) ? 120 : SOURCE_MIN_RUNTIME, Number(approved.minRuntimeSeconds) || 0),
    minTitleYear: Math.max(0, Number(approved.minTitleYear) || 0),
    minContentYear: Math.max(0, Number(approved.minContentYear) || 0),
    movieLane: text(approved.movieLane, 24).toLowerCase(),
    laneRequired: list(approved.laneRequired, 16),
    laneDeny: list(approved.laneDeny, 16),
    persistedRelaxed: approved.persistedRelaxed === true || approved.formatRelaxed === true,
    persistedMatch: list(approved.persistedMatch, 24),
    fallbackProfiles: list(approved.fallbackProfiles, 4),
    peerTubeInstances: list(approved.peerTubeInstances, 8),
    peerTubeQueries: list(approved.peerTubeQueries, queryLimit),
    youtubeChannelWindow: Math.max(1, Math.min(6, Number(approved.youtubeChannelWindow) || 2)),
    youtubeChannelHandles: list(approved.youtubeChannelHandles, 12),
    youtubeChannelIdentityRequired: list(approved.youtubeChannelIdentityRequired, 16),
    youtubeDiscoveryWindow: Math.max(0, Math.min(6, Number(approved.youtubeDiscoveryWindow) || 0)),
    youtubeDiscoveryQueries: list(approved.youtubeDiscoveryQueries, 12),
    youtubeDiscoveredChannelWindow: Math.max(0, Math.min(12, Number(approved.youtubeDiscoveredChannelWindow) || 0)),
    youtubeChannelDiscoveryOnMaintenance: approved.youtubeChannelDiscoveryOnMaintenance !== false,
    youtubeChannelPageWindow: Math.max(1, Math.min(4, Number(approved.youtubeChannelPageWindow) || (approved.deepCatalog === true ? 3 : 1))),
    youtubeSearchPageWindow: Math.max(1, Math.min(3, Number(approved.youtubeSearchPageWindow) || 1)),
    youtubeSearchOnViewer: approved.youtubeSearchOnViewer !== false,
    youtubeSearchOnMaintenance: approved.youtubeSearchOnMaintenance !== false,
    youtubeChannelDeny: list(approved.youtubeChannelDeny, 24),
    youtubeChannelRequired: list(approved.youtubeChannelRequired, 16),
    providers: list(approved.providers, 4).map((value) => value.toLowerCase()),
  };
}


function termsMatch(haystack, terms) {
  return terms.some((term) => {
    const value = text(term, 180).toLowerCase();
    if (!value) return false;
    return value.includes(" ") ? haystack.includes(value) : new RegExp(`(?:^|[^a-z0-9])${value.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`, "i").test(haystack);
  });
}

function rightsOkay(item, provider) {
  const rights = text(item && item.rights, 240);
  if (provider === "YouTube") return true;
  /* Vimeo/OK rows are admitted only when the platform has explicitly exposed
     the item for embedding in the authenticated response. This is a playback
     permission check, not a claim that RealSignal owns the media. */
  if ((provider === "Vimeo" || provider === "OK.ru") && item && item.embedAllowed === true) return true;
  const value = text(rights, 240).toLowerCase();
  return !!value && !/(?:unknown|all rights reserved)/i.test(value) && /(?:creative commons|public domain|no known copyright|no known restriction|attribution|free culture|unlicense|government work|copyright free|royalty[- ]free|open publication|free art|cc[- ]?(?:by|0|nc|sa))/i.test(value);
}

function englishOkay(item) {
  const declared = text(item && (item.language || item.defaultAudioLanguage || item.defaultLanguage), 40).toLowerCase();
  if (declared && !/^en(?:[-_]|$)/i.test(declared)) return false;
  const sample = text([item && item.title, item && item.description, item && item.account].join(" "), 3000);
  if (/[\u0400-\u04ff\u0600-\u06ff\u0900-\u097f\u1100-\u11ff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0590-\u05ff\u0e00-\u0e7f]/.test(sample)) return false;
  if (/(?:[._ -](?:FRENCH|GERMAN|PORTUGUESE|SPANISH|ITALIAN|LATINO|CASTELLANO|HINDI|CHINESE)[._ -]|\bes-ES\b|\besp\b|\bsubbed\b|\bdonghua\b)/i.test(sample)) return false;
  if (/(?:\b(?:TRUEFRENCH|VOSTFR|SUBFRENCH|SUBESP|HUN|RUS|LAT|DUBLADO|DUBBED|DUAL|MULTI)\b|\[(?:TR|FR|ES|RU)\])/i.test(sample)) return false;
  if (/(?:[._ -](?:TR|FR|ES|RU|HU|DE)[._ -]|\((?:spanish|french|german|italian|portuguese)\b|\bteljes\s+film\b|\bmagyar\b)/i.test(sample)) return false;
  if (/\b(?:UKR|DVO|UKRAINIAN|DUBLAJ|COMMENTARY\s+ONLY|AUDIO\s+ONLY|HDCAM|CAMRIP)\b/i.test(sample)) return false;
  // Unaccented "television" is English too; it cannot be language evidence.
  return !/\b(?:hindi|tamil|telugu|bengali|bangla|marathi|malayalam|kannada|punjabi|urdu|indonesian|vietnamese|thai|arabic|espa[nñ]ol|portugu[eê]s|fran[cç]ais|deutsch|russian|turkish|korean|japanese|mandarin|pide|deseo|cuestionable|cap[ií]tulo|episodio|temporada|pel[ií]cula|televisión|serie)\b/i.test(sample);
}

const OK_MOVIE_STRONG_TERMS = ["4k", "2160p", "1080p", "yts", "yts.am", "yify", "bdrip", "blu-ray", "bluray", "dvdrip", "dvd rip", "vhsrip", "vhs rip", "fullmovie", "full movie", "feature film", "complete movie", "full film"];
const OK_MOVIE_CONTEXT_TERMS = ["movie", "film", "feature", "cinema", "hollywood", "american movie", "classic movie", "action movie", "western movie", "comedy movie", "drama movie", "horror movie", "thriller movie", "science fiction movie", "english movie", "full length movie"];
const OK_NON_MOVIE_TERMS = ["aviation", "aircraft", "airplane", "flight", "landing", "takeoff", "concert", "tour", "live album", "music performance", "music video", "hdr", "dolby vision", "fps", "video ultra hd", "demo", "test pattern", "sample video", "nature relaxation", "screen saver", "gameplay", "walkthrough", "visualizer"];

function okMovieTitleQualified(profile, item) {
  if (!profile || profile.profileKey !== "ok-movie-channel" || !profile.titleRequiredTerms.length) return false;
  const title = text(item && item.title, 500).toLowerCase();
  const haystack = text([item && item.title, item && item.description, item && item.tags, item && item.category, item && item.account].join(" "), 5000).toLowerCase();
  const query = text(item && item.query, 180).toLowerCase();
  if (!termsMatch(title, profile.titleRequiredTerms)) return false;
  if (termsMatch(haystack, OK_NON_MOVIE_TERMS)) return false;
  const strongRelease = termsMatch(title, OK_MOVIE_STRONG_TERMS) || termsMatch(query, OK_MOVIE_STRONG_TERMS);
  const titleEvidence = termsMatch(haystack, profile.match);
  const movieContext = termsMatch(query, OK_MOVIE_CONTEXT_TERMS);
  return strongRelease || titleEvidence || movieContext;
}

function accepted(profile, item, provider, checkAspect = true) {
  if (okMusicChannel(profile)) return okMusicPrecheck(profile,item,checkAspect);
  if (okAnimationFamily(profile)) return okAnimationPrecheck(profile,item,checkAspect);
  if (okCuratedChannel(profile)) return okCuratedPrecheck(profile,item,checkAspect);
  const title = text(item && item.title, 500);
  /* Provider search phrases are editorial context, but television/film lanes
     also require a program-form signal in the actual title. That prevents a
     broad search from admitting an unrelated lecture or listicle. */
  /* The search query is provenance, not evidence. Counting it here lets an
     unrelated result pass merely because the provider echoed the requested
     genre phrase. Editorial evidence must come from the returned item's own
     title, description, tags, category, or channel identity. */
  const haystack = text([title, item && item.description, item && item.tags, item && item.category, item && item.account].join(" "), 5000).toLowerCase();
  const titleHaystack = title.toLowerCase();
  const duration = Number(item && item.duration) || 0;
  const ratio = aspectRatio(item);
  const source = provider || text(item && item.provider, 60);
  const minimumRuntime = Math.max(SOURCE_MIN_RUNTIME, Number(profile.minRuntimeSeconds) || 0);
  if (!item || !(item.id || item.uuid || item.rawId) || !title || duration < minimumRuntime || (checkAspect && ratio < SOURCE_MIN_ASPECT_RATIO)) return false;
  if (profile.titleRequiredTerms.length && !termsMatch(titleHaystack, profile.titleRequiredTerms)) return false;
  const qualityMovieTitle = okMovieTitleQualified(profile, item);
  const okEpisode = source === "OK.ru" && profile.profileKey === "ok-tv-channel" && /\b(?:s\d{1,2}[ ._-]*e\d{1,3}|\d{1,2}x\d{1,3})\b/i.test(title);
  if (source === "OK.ru" && profile.profileKey === "ok-movie-channel" && termsMatch(haystack,
    [...OK_NON_MOVIE_TERMS, "full set", "dj set", "video tracklist", "festival set", "english subtitle movies"])) return false;
  if (source === "OK.ru" && profile.profileKey === "ok-tv-channel" && /(?:\bbtth\b|battle through the heavens|sword of coming|renegade imm?ortal|slay the gods|apotheosis|donghua|\banime\b|chinese animation)/i.test(haystack)) return false;
  if (profile.minTitleYear) {
    const titleYears = Array.from(title.matchAll(/(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/g)).map((match) => Number(match[1])).filter(Boolean);
    if (titleYears.some((year) => year < profile.minTitleYear)) return false;
  }
  if (profile.minContentYear) {
    const contentYears = Array.from(haystack.matchAll(/(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/g)).map((match) => Number(match[1])).filter(Boolean);
    if (contentYears.some((year) => year < profile.minContentYear)) return false;
  }
  if (/(?:#?shorts?\b|vertical\s+video|how[ -]+to|tutorial|reaction|trailer|teaser|promo|advertisement|commercial|fan\s+edit|lyrics\s+video)/i.test(haystack)) return false;
  if (profile.deny.some((term) => haystack.includes(text(term, 180).toLowerCase()))) return false;
  if (!rightsOkay(item, source)) return false;
  if (["YouTube", "Vimeo", "OK.ru"].includes(source) && !englishOkay(item)) return false;
  /* A channel seed is only a starting point. Re-check the returned channel
     identity so an approved handle cannot silently turn into a fan-upload or
     unrelated mirror later. This is intentionally separate from video-topic
     matching: movies must come from a channel that is itself recognizably a
     film/distributor outlet. */
  if (source === "YouTube" && profile.youtubeChannelIdentityRequired.length
      && !termsMatch(text([item.account, item.channelTitle, item.channelDescription].join(" "), 1600).toLowerCase(), profile.youtubeChannelIdentityRequired)) return false;
  const trustedYouTubeChannel = source === "YouTube" && text(item && item.channelSeed, 120) && (profile.youtubeChannelHandles.includes(text(item && item.channelSeed, 120)) || item.channelDiscovered === true);
  const strictTopicTerms = Array.isArray(profile.strictTopicTerms) ? profile.strictTopicTerms : [];
  const identityHaystack = text([title, item && item.account, item && item.channelTitle].join(" "), 1800).toLowerCase();
  if (strictTopicTerms.length && !strictTopicTerms.some((term) => identityHaystack.includes(text(term, 180).toLowerCase()))) return false;
  if (/^(?:television|film|performance)$/.test(profile.intent || "")) {
    const programDeny = /(?:history of|documentary about|retrospective|video essay|analysis|explained|lecture|seminar|webinar|conference|panel discussion|making of|movie making|filmmaking|film making|studio tour|educational film|behind the scenes|demo reel|showreel|workshop|masterclass|recap|production reel|festival reel|fan[ -]?made|fan animation|unofficial|mashup|amv|gacha|roleplay|my little pony|\bpony\b)/i;
    if (programDeny.test(haystack)) return false;
    if (profile.topics.length && !termsMatch(haystack, profile.topics) && !qualityMovieTitle && !okEpisode) return false;
    if (profile.formats.length && !termsMatch(titleHaystack, profile.formats)
      && !(profile.formatRelaxed === true && duration >= 20 * 60)
      && !(profile.formatRelaxed === true && minimumRuntime <= 15 * 60 && duration >= 15 * 60)
      && !(trustedYouTubeChannel && duration >= 20 * 60)) return false;
  }
  if (profile.movieLane === "modern" && profile.laneDeny.some((term) => titleHaystack.includes(text(term, 180).toLowerCase()))) return false;
  if (profile.movieLane === "indie" && profile.laneRequired.length && !trustedYouTubeChannel && !profile.laneRequired.some((term) => haystack.includes(text(term, 180).toLowerCase()))) return false;
  const required = profile.match.length ? profile.match : profile.queries;
  return !required.length || termsMatch(haystack, required) || qualityMovieTitle || okEpisode;
}

function okAdmissionStats(profile, candidates) {
  const stats = {
    runtime: 0,
    aspect: 0,
    aspectUnknown: 0,
    aspectPortrait: 0,
    embed: 0,
    language: 0,
    blocked: 0,
    topic: 0,
    format: 0,
    genre: 0,
    accepted: 0,
    other: 0,
  };
  const minimumRuntime = Math.max(SOURCE_MIN_RUNTIME, Number(profile && profile.minRuntimeSeconds) || 0);
  for (const item of candidates) {
    const title = text(item && item.title, 500);
    const haystack = text([title, item && item.description, item && item.tags, item && item.category, item && item.account].join(" "), 5000).toLowerCase();
    const titleHaystack = title.toLowerCase();
    const duration = Number(item && item.duration) || 0;
    const ratio = aspectRatio(item);
    const source = "OK.ru";
    const qualityMovieTitle = okMovieTitleQualified(profile, item);
    if (!item || !(item.id || item.uuid || item.rawId) || !title) { stats.other += 1; continue; }
    if (duration < minimumRuntime) { stats.runtime += 1; continue; }
    if (ratio < SOURCE_MIN_ASPECT_RATIO) {
      stats.aspect += 1;
      if (ratio > 0) stats.aspectPortrait += 1;
      else stats.aspectUnknown += 1;
      continue;
    }
    if (profile.titleRequiredTerms.length && !termsMatch(titleHaystack, profile.titleRequiredTerms)) { stats.format += 1; continue; }
    if (!rightsOkay(item, source)) { stats.embed += 1; continue; }
    if (!englishOkay(item)) { stats.language += 1; continue; }
    if (/(?:#?shorts?\b|vertical\s+video|how[ -]+to|tutorial|reaction|trailer|teaser|promo|advertisement|commercial|fan\s+edit|lyrics\s+video)/i.test(haystack)
        || profile.deny.some((term) => haystack.includes(text(term, 180).toLowerCase()))) { stats.blocked += 1; continue; }
    if (/^(?:television|film|performance)$/.test(profile.intent || "")) {
      const programDeny = /(?:history of|documentary about|retrospective|video essay|analysis|explained|lecture|seminar|webinar|conference|panel discussion|making of|movie making|filmmaking|film making|studio tour|educational film|behind the scenes|demo reel|showreel|workshop|masterclass|recap|production reel|festival reel|fan[ -]?made|fan animation|unofficial|mashup|amv|gacha|roleplay|my little pony|\bpony\b)/i;
      if (programDeny.test(haystack)) { stats.blocked += 1; continue; }
      if (profile.topics.length && !termsMatch(haystack, profile.topics) && !qualityMovieTitle) { stats.topic += 1; continue; }
      if (profile.formats.length && !termsMatch(titleHaystack, profile.formats)
          && !(profile.formatRelaxed === true && duration >= 20 * 60)
          && !(profile.formatRelaxed === true && minimumRuntime <= 15 * 60 && duration >= 15 * 60)) { stats.format += 1; continue; }
    }
    const required = profile.match.length ? profile.match : profile.queries;
    if (required.length && !termsMatch(haystack, required) && !qualityMovieTitle) { stats.genre += 1; continue; }
    if (accepted(profile, item, source)) stats.accepted += 1;
    else stats.other += 1;
  }
  return stats;
}

function normalized(item, provider, query) {
  return {
    id: text(item.id, 300),
    title: text(item.title, 500),
    description: text(item.description, 1800),
    tags: text(item.tags, 600),
    category: text(item.category, 120),
    account: text(item.account, 180),
    channelSeed: text(item.channelSeed, 120),
    channelDiscovered: item.channelDiscovered === true,
    year: text(item.year, 12).slice(0, 4),
    rights: text(item.rights, 240),
    provider,
    durationUnit: provider === "OK.ru" ? "seconds" : "",
    query: text(query, 180),
    type: item.type || "video",
    url: text(item.url, 1400),
    embedUrl: text(item.embedUrl, 1400),
    sourceUrl: text(item.sourceUrl, 1400),
    duration: Number(item.duration) || 0,
    aspectRatio: aspectRatio(item),
    embedded: item.type === "embed",
    embedAllowed: item.embedAllowed === true,
    ...(provider === "Vimeo" ? { embedVerified: item.embedVerified === true, publicEmbed: item.publicEmbed === true, verifiedAt: Number(item.verifiedAt) || 0 } : {}),
    language: text(item.language, 40),
    seriesTitle: text(item.seriesTitle, 150),
    seriesId: text(item.seriesId, 100),
    identityReference: text(item.identityReference, 300),
    identityProvider: text(item.identityProvider, 50),
    ...(item.musicVerified ? { musicVerified: true, musicVerificationVersion: item.musicVerificationVersion, musicArtist: text(item.musicArtist,100), musicArtistId: text(item.musicArtistId,80), musicTrack: text(item.musicTrack,160), musicTrackKey: text(item.musicTrackKey,300), musicRecordingId: text(item.musicRecordingId,80), musicReleaseYear: Number(item.musicReleaseYear) } : {}),
    ...(okAnimationFamily({profileKey:item.animationFamily ? `ok-${item.animationFamily}-channel` : ''}) ? {animationFamily:item.animationFamily,animationVerified:item.animationVerified===true,animationVerificationVersion:item.animationVerificationVersion,animationEpisodeRuntime:Number(item.animationEpisodeRuntime)||0} : {}),
    ...(item.curatedFamily ? {curatedFamily:text(item.curatedFamily,40),curatedVerified:item.curatedVerified===true,curatedVerificationVersion:Number(item.curatedVerificationVersion)||0,episodeIdentity:text(item.episodeIdentity,40)} : {}),
  };
}

async function mapLimit(values, limit, fn) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      try { output[index] = await fn(values[index], index); }
      catch (_) { output[index] = null; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return output;
}

function youtubeQueries(profile, rotation) {
  return rotate(profile.queries, rotation).slice(0, profile.queryWindow || SOURCE_QUERY_WINDOW);
}

function youtubeDuration(value) {
  return isoDuration(value);
}

function youtubeSearchDuration(profile, rotation) {
  /* YouTube's API defines “long” as over twenty minutes, while RealSignal's
     television floor is fifteen. Full television/film/performance lanes are
     intentionally long-form: a 15–20 minute search bucket starves full
     episodes, stage shows, and features even though those items pass the
     shared runtime verifier. Other documentary/craft lanes alternate the API
     buckets across rotations, retaining valid 15–20 minute programs without
     doubling search quota or admitting short-form video. */
  const intent = text(profile && profile.intent, 40).toLowerCase();
  if (/^(?:television|film|performance)$/.test(intent) || profile && profile.longForm === true) return "long";
  return Math.abs(Number(rotation) || 0) % 2 ? "medium" : "long";
}

function youtubeSearchPageCount(profile, options = {}) {
  /* Search pages are the quota-expensive escape hatch, not the cold-start
     playback path. Deep maintenance may walk a small number of continuation
     pages; viewer requests use channel upload playlists instead. */
  return options.maintenance === true ? Math.max(1, Number(profile.youtubeSearchPageWindow) || 1) : 1;
}

async function youtubeDiscoverChannels(profile, rotation, env, options = {}) {
  const firstLane = options.firstLane === true;
  const key = text(env && env.YOUTUBE_API_KEY, 180);
  const queries = rotate(profile.youtubeDiscoveryQueries || [], rotation).slice(0, firstLane ? 1 : (profile.youtubeDiscoveryWindow || 0));
  if (!key || !queries.length) return { items: [], health: { queries: 0, candidates: 0, accepted: 0 } };
  const jobs = queries.map((query) => async () => {
    const params = new URLSearchParams({
      part: "snippet",
      type: "channel",
      maxResults: firstLane ? "8" : "25",
      q: query,
      regionCode: "US",
      relevanceLanguage: "en",
      safeSearch: "moderate",
      key,
    });
    const data = await fetchJson("https://www.googleapis.com/youtube/v3/search?" + params, { headers: { Referer: "https://esfsfestgfse.github.io/Archivetv/" } });
    return (data.items || []).map((item) => {
      const channelId = text(item && item.id && item.id.channelId, 80);
      const snippet = item && item.snippet || {};
      const identity = text([snippet.title, snippet.description].join(" "), 2500).toLowerCase();
      if (!/^UC[a-zA-Z0-9_-]{20,}$/.test(channelId)) return null;
      if ((profile.youtubeChannelDeny || []).some((term) => identity.includes(text(term, 180).toLowerCase()))) return null;
      if ((profile.youtubeChannelRequired || []).length && !termsMatch(identity, profile.youtubeChannelRequired)) return null;
      return { seed: channelId, discovered: true, title: text(snippet.title, 180), query };
    }).filter(Boolean);
  });
  const results = await mapLimit(jobs, 2, async (job) => {
    try { return { items: await job(), error: "" }; }
    catch (error) { return { items: [], error: text(error && (error.providerDetail || error.message), 180) || "discovery request failed" }; }
  });
  const responses = results.flatMap((result) => Array.isArray(result && result.items) ? result.items : []).filter(Boolean);
  const accepted = unique(responses.map((item) => ({ id: item.seed, ...item })));
  return {
    items: accepted.slice(0, firstLane ? 1 : (profile.youtubeDiscoveredChannelWindow || 0)),
    health: { queries: queries.length, candidates: responses.length, accepted: accepted.length, errors: results.map((result) => result && result.error).filter(Boolean).slice(0, 8) },
  };
}

async function youtubeChannelUploads(profile, rotation, env, options = {}) {
  const firstLane = options.firstLane === true;
  const key = text(env && env.YOUTUBE_API_KEY, 180);
  const anchors = rotate(profile.youtubeChannelHandles || [], rotation).slice(0, firstLane ? 1 : (profile.youtubeChannelWindow || 2)).map((seed) => ({ seed, discovered: false }));
  const discoveryEnabled = profile.deepCatalog === true && options.maintenance === true && profile.youtubeChannelDiscoveryOnMaintenance !== false;
  const discovery = discoveryEnabled ? await youtubeDiscoverChannels(profile, rotation, env, options) : { items: [], health: { queries: 0, candidates: 0, accepted: 0 } };
  const discovered = discovery.items.map((item) => ({ seed: item.seed, discovered: true }));
  const seeds = [...anchors, ...discovered].filter((item, index, all) => all.findIndex((candidate) => candidate.seed === item.seed) === index).slice(0, firstLane ? 1 : Math.max(profile.youtubeChannelWindow || 2, anchors.length + discovered.length));
  if (!key || !seeds.length) return { items: [], health: { seeds: seeds.length, resolved: 0, candidates: 0, discovered: discovery.health } };
  const jobs = seeds.map((seedInfo) => async () => {
    const seed = seedInfo.seed;
    const channelParams = new URLSearchParams({ part: "contentDetails", key });
    if (/^UC[a-zA-Z0-9_-]{20,}$/.test(seed)) channelParams.set("id", seed);
    else channelParams.set("forHandle", String(seed).replace(/^@/, ""));
    const channel = await fetchJson("https://www.googleapis.com/youtube/v3/channels?" + channelParams, { headers: { Referer: "https://esfsfestgfse.github.io/Archivetv/" } });
    const playlistId = channel && channel.items && channel.items[0] && channel.items[0].contentDetails && channel.items[0].contentDetails.relatedPlaylists && channel.items[0].contentDetails.relatedPlaylists.uploads;
    if (!playlistId) return { seed, resolved: false, items: [] };
    /* One upload page is enough for a cold start. Maintenance rotates through
       older upload pages so a deep channel does not keep reopening the same
       newest fifty videos. Playlist pagination is cheap compared with
       videos.list and remains bounded to four pages per approved seed. */
    const pageWindow = options.maintenance === true ? profile.youtubeChannelPageWindow : 1;
    const pageStart = options.maintenance === true
      ? Math.abs((Number(rotation) || 0) + seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)) % pageWindow
      : 0;
    const pageLimit = Math.min(4, pageStart + pageWindow);
    let pageToken = "";
    const pageItems = [];
    let pagesFetched = 0;
    for (let page = 0; page < pageLimit; page += 1) {
      const uploadsParams = new URLSearchParams({ part: "snippet", playlistId, maxResults: firstLane ? "25" : "50", key });
      if (pageToken) uploadsParams.set("pageToken", pageToken);
      const uploads = await fetchJson("https://www.googleapis.com/youtube/v3/playlistItems?" + uploadsParams, { headers: { Referer: "https://esfsfestgfse.github.io/Archivetv/" } });
      pagesFetched += 1;
      if (page >= pageStart) pageItems.push(...(uploads && uploads.items || []));
      pageToken = text(uploads && uploads.nextPageToken, 120);
      if (!pageToken) break;
    }
    const items = pageItems.map((item) => {
      const videoId = text(item && item.snippet && item.snippet.resourceId && item.snippet.resourceId.videoId, 120);
      const snippet = item && item.snippet || {};
      return videoId ? {
        id: `yt:${videoId}`,
        rawId: videoId,
        query: `channel:${seed}`,
        channelSeed: seed,
        channelDiscovered: seedInfo.discovered === true,
        title: text(snippet.title),
        description: text(snippet.description, 1800),
        account: text(snippet.videoOwnerChannelTitle || snippet.channelTitle, 180),
        year: text(snippet.publishedAt, 12),
      } : null;
    }).filter(Boolean);
    return { seed, resolved: true, pages: pagesFetched, items };
  });
  const lanes = (await mapLimit(jobs, 2, async (job) => {
    try { return await job(); }
    catch (error) { return { seed: "", resolved: false, pages: 0, items: [], error: text(error && (error.providerDetail || error.message), 180) || "channel upload request failed" }; }
  })).filter(Boolean);
  return {
    items: unique(lanes.flatMap((lane) => lane.items || [])),
    health: {
      seeds: seeds.length,
      resolved: lanes.filter((lane) => lane.resolved).length,
      candidates: lanes.reduce((sum, lane) => sum + (lane.items || []).length, 0),
      pages: lanes.reduce((sum, lane) => sum + Number(lane.pages || 0), 0),
      errors: lanes.map((lane) => lane.error).filter(Boolean).slice(0, 8),
      discovered: discovery.health,
    },
  };
}

async function youtube(profile, rotation, env, options = {}) {
  const firstLane = options.firstLane === true;
  const key = text(env && env.YOUTUBE_API_KEY, 180);
  if (!key) return { provider: "YouTube", items: [], health: { skipped: true, reason: "YOUTUBE_API_KEY not configured" } };
  const queries = youtubeQueries(profile, rotation).slice(0, firstLane ? 1 : undefined);
  const orders = ["relevance", "date", "viewCount"];
  const order = orders[(Number(rotation) || 0) % orders.length];
  /* A deep profile may be backed entirely by approved channel upload rails.
     In that case maintenance search only burns quota and invites unrelated
     fan uploads; the upload pages are the durable discovery source. */
  const searchEnabled = profile.youtubeSearchOnViewer !== false || (options.maintenance === true && profile.youtubeSearchOnMaintenance !== false);
  const jobs = searchEnabled ? queries.map((query) => async () => {
    const pageItems = [];
    let pageToken = "";
    let totalResults = 0;
    let pagesFetched = 0;
    for (let page = 0; page < youtubeSearchPageCount(profile, options); page += 1) {
      const searchParams = new URLSearchParams({
        part: "snippet",
        type: "video",
        maxResults: firstLane ? "12" : (profile.deepCatalog === true ? "50" : "25"),
        order,
        regionCode: "US",
        relevanceLanguage: "en",
        safeSearch: "moderate",
        q: query,
        key,
      });
      if (pageToken) searchParams.set("pageToken", pageToken);
      /* Deep movie lanes search broadly, then enforce runtime after videos.list
         hydration. The API's long-duration bucket can return an empty result
         set for legitimate full films, while the detail response gives us the
         exact duration and embed status we need for admission. */
      if (profile.deepCatalog !== true) searchParams.set("videoDuration", youtubeSearchDuration(profile, rotation));
      const searchUrl = "https://www.googleapis.com/youtube/v3/search?" + searchParams;
      const data = await fetchJson(searchUrl, { headers: { Referer: "https://esfsfestgfse.github.io/Archivetv/" } });
      pagesFetched += 1;
      totalResults = Math.max(totalResults, Number(data.pageInfo && data.pageInfo.totalResults) || 0);
      pageItems.push(...(data.items || []).map((item) => ({
        id: `yt:${text(item.id && item.id.videoId, 120)}`,
        rawId: text(item.id && item.id.videoId, 120),
        query,
        title: text(item.snippet && item.snippet.title),
        description: text(item.snippet && item.snippet.description, 1800),
        account: text(item.snippet && item.snippet.channelTitle, 180),
        year: text(item.snippet && item.snippet.publishedAt, 12),
        language: text(item.snippet && (item.snippet.defaultAudioLanguage || item.snippet.defaultLanguage), 40),
      })).filter((item) => item.rawId));
      pageToken = text(data.nextPageToken, 120);
      if (!pageToken) break;
    }
    return {
      items: pageItems,
      totalResults,
      pagesFetched,
      hasNextPage: Boolean(pageToken),
    };
  }) : [];
  const channelLane = await youtubeChannelUploads(profile, rotation, env, options);
  const searchResponses = await mapLimit(jobs, SOURCE_YOUTUBE_QUERY_CONCURRENCY, (job) => job());
  const searchCandidates = searchResponses.flatMap((response) => Array.isArray(response && response.items) ? response.items : []);
  const candidates = unique([...(channelLane.items || []), ...searchCandidates]);
  const totalResults = searchResponses.reduce((sum, response) => sum + Number(response && response.totalResults || 0), 0);
  const pages = searchResponses.reduce((sum, response) => sum + Number(response && response.pagesFetched || 0), 0);
  const ids = unique(candidates).map((item) => item.rawId).slice(0, firstLane ? 25 : (profile.deepCatalog === true ? 150 : 75));
  if (!ids.length) return { provider: "YouTube", items: [], health: { searched: searchEnabled ? queries.length : 0, searchEnabled, candidates: 0, totalResults, pages, channelSeeds: channelLane.health } };
  /* videos.list accepts at most 50 IDs. Chunking also means one oversized
     discovery pass cannot invalidate an otherwise healthy YouTube lane. */
  const detailBatches = await mapLimit(Array.from({ length: Math.ceil(ids.length / 50) }, (_, index) => ids.slice(index * 50, index * 50 + 50)), firstLane ? 1 : 2, async (batch) => {
    const detailUrl = "https://www.googleapis.com/youtube/v3/videos?" + new URLSearchParams({ part: "snippet,contentDetails,status,player", id: batch.join(","), key });
    return fetchJson(detailUrl);
  });
  const detailItems = detailBatches.filter(Boolean).flatMap((batch) => batch.items || []);
  const byId = new Map(detailItems.map((item) => [item.id, item]));
  const items = candidates.map((candidate) => {
    const item = byId.get(candidate.rawId);
    if (!item || item.status && item.status.embeddable !== true) return null;
    // YouTube may omit player dimensions even for a normal landscape video.
    // The long-form search gate prevents Shorts and short clips while this
    // fallback keeps valid TV-length videos from being discarded as unknown.
    const ratio = aspectRatio(item.player) || 16 / 9;
    const hydrated = {
      ...candidate,
      title: text(item.snippet && item.snippet.title) || candidate.title,
      description: text(item.snippet && item.snippet.description, 1800),
      tags: text(item.snippet && item.snippet.tags, 600),
      category: text(item.snippet && item.snippet.categoryId, 120),
      account: text(item.snippet && item.snippet.channelTitle, 180),
      year: text(item.snippet && item.snippet.publishedAt, 12),
      rights: "Standard YouTube license",
      duration: youtubeDuration(item.contentDetails && item.contentDetails.duration),
      aspectRatio: ratio,
      type: "embed",
      url: `https://www.youtube-nocookie.com/embed/${candidate.rawId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${candidate.rawId}`,
      sourceUrl: `https://www.youtube.com/watch?v=${candidate.rawId}`,
    };
    return accepted(profile, hydrated, "YouTube") ? normalized(hydrated, "YouTube", candidate.query) : null;
  }).filter(Boolean);
  return { provider: "YouTube", items: unique(items).slice(0, firstLane ? 12 : SOURCE_MAX_ITEMS), health: { searched: searchEnabled ? queries.length : 0, searchEnabled, candidates: candidates.length, searchCandidates: searchCandidates.length, totalResults, pages, channelSeeds: channelLane.health, details: detailItems.length, detailBatches: detailBatches.length, firstLane } };
}

function peerTubeInstances(env, profile) {
  const configured = text(env && env.PEERTUBE_INSTANCES, 1500);
  const values = (configured ? configured.split(",") : SOURCE_DEFAULT_INSTANCES).map((value) => {
    try { return new URL(value.trim()).origin; } catch (_) { return ""; }
  }).filter((value, index, all) => value && all.indexOf(value) === index);
  const preferred = (profile && Array.isArray(profile.peerTubeInstances) ? profile.peerTubeInstances : []).map((value) => {
    try { return new URL(value).origin; } catch (_) { return ""; }
  }).filter((value, index, all) => value && all.indexOf(value) === index);
  const pool = preferred.length ? preferred : values;
  const limit = Math.max(1, Math.min(8, Number(profile && profile.peerTubeInstanceLimit) || 8));
  return pool.slice(0, limit);
}

function peerTubeFile(detail) {
  const files = (detail && Array.isArray(detail.files) ? detail.files : []).concat((detail && Array.isArray(detail.streamingPlaylists) ? detail.streamingPlaylists : []).flatMap((playlist) => Array.isArray(playlist && playlist.files) ? playlist.files : []));
  return files.filter((file) => {
    const url = text(file && file.fileUrl, 1400);
    const mime = text(file && (file.mimetype || file.mimeType || file.type), 80);
    return url && (file.hasVideo !== false) && (/\.(?:mp4|webm|ogv)(?:[?#]|$)/i.test(url) || /^video\//i.test(mime));
  }).sort((a, b) => Math.abs(Number(a.resolution && a.resolution.id || 720) - 720) - Math.abs(Number(b.resolution && b.resolution.id || 720) - 720))[0] || null;
}

async function peerTube(profile, rotation, env, options = {}) {
  const firstLane = options.firstLane === true;
  const instances = peerTubeInstances(env, profile);
  const peerTubePool = profile.peerTubeQueries.length ? profile.peerTubeQueries : profile.queries;
  const queries = rotate(peerTubePool, rotation).slice(0, firstLane ? 1 : (profile.peerTubeQueryWindow || profile.queryWindow || SOURCE_QUERY_WINDOW));
  const sortModes = ["-match", "-publishedAt", "-views", "-likes"];
  const sort = sortModes[(Number(rotation) || 0) % sortModes.length];
  async function search(querySet) {
    const searchInstances = firstLane ? instances.slice(0, 1) : instances;
    const jobs = searchInstances.flatMap((instance) => querySet.map((query) => ({ instance, query })));
    const searched = await mapLimit(jobs, firstLane ? 2 : SOURCE_MAX_CONCURRENCY, async ({ instance, query }) => {
      const url = `${instance}/api/v1/search/videos?${new URLSearchParams({ search: query, count: firstLane ? "8" : "12", sort })}`;
      const data = await fetchJson(url);
      return (data.data || []).map((item) => {
        let host = instance;
        try { host = new URL(item.url || instance).origin; } catch (_) { /* retain configured host */ }
        return {
          instance: host,
          query,
          uuid: text(item.uuid || item.id, 140),
          title: text(item.name || item.title || "Untitled"),
          description: text(item.description || item.truncatedDescription, 1800),
          tags: text(item.tags, 600),
          category: text(item.category && item.category.label, 120),
          account: text(item.account && item.account.displayName, 180),
          rights: text(item.licence && (item.licence.label || item.licence.name), 240),
          duration: Number(item.duration) || 0,
          aspectRatio: Number(item.aspectRatio) || 0,
          sourceUrl: text(item.url || `${host}/videos/watch/${item.uuid || item.id}`, 1400),
        };
      }).filter((item) => item.uuid);
    });
    return { jobs: jobs.length, items: searched.flat() };
  }
  const initial = await search(queries);
  let searchedJobs = initial.jobs;
  let raw = unique(initial.items).filter((item) => accepted(profile, item, "PeerTube", false));
  /* A catalog with four or ten items is still shallow for television. Expand
     until the verified shelf has a real rotation window, not merely enough
     rows to start one video. */
  if (!firstLane && raw.length < SOURCE_MIN_READY) {
    const used = new Set(queries.map((query) => query.toLowerCase()));
    const curatedRemainder = rotate(peerTubePool, (Number(rotation) || 0) + queries.length);
    const fallbackPool = unique(curatedRemainder.concat(profile.match, profile.queries).map((query) => text(query, 180)));
    const fallbackQueries = fallbackPool
      .filter((query) => !used.has(query.toLowerCase())).slice(0, profile.peerTubeFallbackQueryWindow || SOURCE_QUERY_WINDOW);
    if (fallbackQueries.length) {
      const fallback = await search(fallbackQueries);
      searchedJobs += fallback.jobs;
      raw = unique(raw.concat(fallback.items)).filter((item) => accepted(profile, item, "PeerTube", false));
    }
  }
  raw = raw.slice(0, firstLane ? 8 : (profile.peerTubeDetailLimit || 32));
  const detailed = await mapLimit(raw, firstLane ? 6 : SOURCE_MAX_CONCURRENCY, async (item) => {
    const detail = await withTimeout(fetchJson(`${item.instance}/api/v1/videos/${encodeURIComponent(item.uuid)}`), SOURCE_DETAIL_TIMEOUT_MS);
    const file = peerTubeFile(detail);
    if (!file) return null;
    const hydrated = {
      ...item,
      id: `pt:${new URL(item.instance).hostname}/${item.uuid}`,
      rights: text((detail.licence && (detail.licence.label || detail.licence.name)) || item.rights, 240),
      duration: Number(detail.duration || item.duration) || 0,
      aspectRatio: aspectRatio(file) || item.aspectRatio || 16 / 9,
      type: "video",
      url: text(file.fileUrl, 1400),
      sourceUrl: text(item.sourceUrl, 1400),
    };
    return accepted(profile, hydrated, "PeerTube") ? normalized(hydrated, "PeerTube", item.query) : null;
  });
  return { provider: "PeerTube", items: unique(detailed.filter(Boolean)).slice(0, firstLane ? 8 : SOURCE_MAX_ITEMS), health: { searched: searchedJobs, candidates: raw.length, details: detailed.filter(Boolean).length, instances: firstLane ? Math.min(1, instances.length) : instances.length, firstLane } };
}

async function vimeo(profile, rotation, env, options = {}) {
  const firstLane = options.firstLane === true;
  const deadline = Date.now() + (options.maintenance === true ? 27_000 : 4000);
  const searchDeadline = deadline - (options.maintenance === true ? 10_000 : 1200);
  const token = text(env && env.VIMEO_ACCESS_TOKEN, 240);
  const cursor = firstLane ? rotation : await vimeoDiscoveryCursor(env.realsignal_catalog, profile.profileKey, rotation);
  const window = profile.queryWindow || SOURCE_QUERY_WINDOW;
  const queries = rotate(profile.queries, cursor * window).slice(0, firstLane ? 1 : window);
  if (!token || !queries.length) return { provider: "Vimeo", items: [], health: { skipped: !token, reason: token ? "no approved queries" : "VIMEO_ACCESS_TOKEN not configured", queries: 0 } };
  const queryPages = [], errors = [];
  const jobs = queries.map((query) => async () => {
    if (Date.now() >= searchDeadline) return [];
    const sort = Math.floor(cursor / Math.max(1, Math.ceil(profile.queries.length / window))) % 2 ? "date" : "relevant";
    const page = firstLane ? 1 : await vimeoSearchPage(env.realsignal_catalog, profile.profileKey, query, sort);
    const params = new URLSearchParams({ query, per_page: firstLane ? "12" : "50", page: String(page), sort, direction: "desc", fields: VIMEO_FIELDS });
    const data = await vimeoJson("https://api.vimeo.com/videos?" + params, {
      headers: { Authorization: `bearer ${token}`, Accept: "application/vnd.vimeo.*+json;version=3.4" },
    }, Math.min(firstLane ? 2500 : 8000, searchDeadline - Date.now()));
    const rows = Array.isArray(data?.data) ? data.data : [];
    queryPages.push({ query, sort, page, returned: rows.length, total: Number(data.total) || 0 });
    if (!firstLane) await vimeoSearchPage(env.realsignal_catalog, profile.profileKey, query, sort, data.paging?.next || Number(data.total) > page * 50 ? page + 1 : 1);
    return rows.map(item => vimeoItem(item, query)).filter(Boolean);
  });
  const responses = await mapLimit(jobs, 2, async (job) => {
    try { return { items: await job(), error: "" }; }
    catch (error) { return { items: [], error: text(error && (error.providerDetail || error.message), 180) || "Vimeo request failed" }; }
  });
  const candidates = unique(responses.flatMap((response) => response.items || []));
  const kind = profile.intent === "film" ? "movie" : "tv";
  const qualified = vimeoBalancedItems(candidates.filter((item) => item.publicEmbed && vimeoProgramOkay(item, kind) && accepted(profile, item, "Vimeo"))).slice(0, firstLane ? 3 : 24);
  const identityCache = new Map();
  const verified = await mapLimit(qualified, 3, async item => {
    if (Date.now() >= deadline) return null;
    try {
      let identity = null;
      if (kind === "tv" || !vimeoLanguageKnown(item)) {
        if (item.language && !vimeoLanguageKnown(item)) return null;
        try {
          identity = await vimeoProgramIdentity(item, kind,
            url => vimeoJson(url, { headers: { "User-Agent": "RealSignal/5.5.81 (public catalog identity; https://github.com/esfsfestgfse/Archivetv)", Accept: "application/json" } }, Math.max(1, Math.min(3000, deadline - Date.now()))), identityCache);
        } catch (error) {
          if (!(kind === "tv" ? vimeoOriginalSeriesEvidence(item) : vimeoLanguageKnown(item))) throw error;
          errors.push(text(error?.message, 120));
        }
        if (identity?.rejectedIdentity && !vimeoOriginalSeriesEvidence(item) || !identity && !(kind === "tv" ? vimeoOriginalSeriesEvidence(item) : vimeoLanguageKnown(item))) return null;
        if (identity?.rejectedIdentity) identity = null;
      }
      if (Date.now() >= deadline) return null;
      const data = await vimeoJson(`https://vimeo.com/api/oembed.json?${new URLSearchParams({ url: item.sourceUrl })}`, {}, Math.min(2500, deadline - Date.now()));
      const playable = vimeoOEmbedVerified(item, data);
      const identified = playable && { ...playable, ...(identity || {}) };
      return identified ? qualifySourceItem(profile, { ...identified, provider: "Vimeo" }) : null;
    } catch (error) { errors.push(text(error?.message, 120)); return null; }
  });
  const items = verified.filter(Boolean);
  return {
    provider: "Vimeo",
    items,
    health: { searched: queries.length, discoveryCursor: cursor, queryPages, candidates: candidates.length, qualified: qualified.length, details: items.length,
      admission: { runtime: candidates.filter(item => item.duration < profile.minRuntimeSeconds).length, notPublic: candidates.filter(item => !item.publicEmbed).length, portrait: candidates.filter(item => item.aspectRatio > 0 && item.aspectRatio < SOURCE_MIN_ASPECT_RATIO).length },
      candidateSamples: candidates.slice(0, 6).map(item => ({ title: item.title, duration: item.duration, aspectRatio: item.aspectRatio, publicEmbed: item.publicEmbed, language: item.language })),
      error: queryPages.length ? undefined : responses.find(response => response.error)?.error,
      errors: [...responses.map((response) => response.error).filter(Boolean), ...errors].slice(0, 8), firstLane },
  };
}

async function okApi(profile, rotation, env, options = {}) {
  const firstLane = options.firstLane === true;
  if (!okApiConfig(env)) return { provider: "OK.ru", items: [], health: { api: true, skipped: true, reason: "OK_APPLICATION_KEY, OK_SESSION_KEY or OK_ACCESS_TOKEN, and OK_SESSION_SECRET or OK_APPLICATION_SECRET are not configured" } };
  const pool = Array.isArray(profile.okApiQueries) && profile.okApiQueries.length ? profile.okApiQueries : profile.queries;
  const broadPool = Array.isArray(profile.okApiBroadQueries) ? profile.okApiBroadQueries : [];
  const titlePool = Array.isArray(profile.okApiTitleQueries) ? profile.okApiTitleQueries : [];
  const titleQualifiers = Array.isArray(profile.okApiTitleQualifiers) ? profile.okApiTitleQualifiers : [];
  /* A single cold-start tag was too easy to miss on OK.ru. Keep the fast
     lane bounded, but search three approved terms in parallel so a normal
     viewer request can find a real long-form item without waiting for
     maintenance mode. */
  const queryCount = firstLane ? Math.min(3, Math.max(1, Number(profile.queryWindow) || 3)) : (profile.queryWindow || SOURCE_QUERY_WINDOW);
  const markerCount = firstLane ? 1 : Math.max(1, Math.floor(queryCount * 0.4));
  const titleCount = titlePool.length ? (firstLane ? 1 : 2) : 0;
  let expandedTags = [];
  let expandedTitleTags = [];
  /* OK's supported search surface is tag-oriented, not a title index. One
     maintenance-only tag expansion gives broad lanes a chance to discover
     title-specific hashtags without adding a cold-start round trip. The
     item-level titleRequiredTerms gate remains the final admission authority. */
  if (!firstLane && broadPool.length) {
    try {
      const seed = rotate(broadPool, Number(rotation || 0))[0];
      expandedTags = await okApiTagQueries(seed, env);
    } catch (error) {
      expandedTags = [];
    }
  }
  if (!firstLane && titlePool.length) {
    try {
      const seed = rotate(titlePool, Number(rotation || 0))[0];
      expandedTitleTags = await okApiTagQueries(seed, env);
    } catch (error) {
      expandedTitleTags = [];
    }
  }
  const tagTerms = profile.profileKey === "ok-movie-channel"
    ? [...OK_MOVIE_CONTEXT_TERMS, ...OK_MOVIE_STRONG_TERMS]
    : ["television", "tv", "show", "series", "episode", "sitcom", "drama", "comedy", "western"];
  expandedTags = expandedTags.filter((tag) => termsMatch(text(tag, 180).toLowerCase(), tagTerms)).slice(0, 2);
  expandedTitleTags = expandedTitleTags.filter((tag) => {
    const value = text(tag, 180).toLowerCase();
    return titlePool.some((seed) => termsMatch(value, [seed])) || termsMatch(value, tagTerms);
  }).slice(0, 2);
  const markerQueries = rotate(pool, rotation).slice(0, markerCount);
  const titleQueries = rotate(titlePool, rotation).slice(0, titleCount).map((query, index) => {
    const qualifier = titleQualifiers.length ? titleQualifiers[(Number(rotation || 0) + index) % titleQualifiers.length] : "";
    return qualifier ? `${query} ${qualifier}` : query;
  });
  /* Always reserve room for the broad semantic rail. Generic quality tags
     such as `4k` are useful only as a secondary recall source; they cannot
     crowd out `movie`, `full movie`, or the equivalent television terms. */
  const broadQueries = rotate(broadPool, Number(rotation || 0)).slice(0, queryCount);
  const queries = Array.from(new Set([...markerQueries, ...titleQueries, ...expandedTitleTags, ...expandedTags, ...broadQueries]
    .map((query) => text(query, 180))
    .filter(Boolean))).slice(0, queryCount);
  const jobs = queries.map((query) => async () => {
    const items = [];
    let anchor = "";
    let pages = 0;
    for (let page = 0; page < (firstLane ? 1 : 2); page += 1) {
      const data = await okApiCall("search.tagContents", {
        query,
        count: firstLane ? 20 : 100,
        anchor,
        filter: JSON.stringify({ types: OK_API_VIDEO_TYPES }),
        fields: "video.*",
      }, env);
      pages += 1;
      items.push(...okApiRows(data).map((row) => ({ ...row, __query: query })));
      anchor = text(data && (data.anchor || data.next_anchor || data.nextAnchor), 240);
      if (!anchor) break;
    }
    return { query, pages, items };
  });
  const responses = await mapLimit(jobs, firstLane ? 2 : 2, async (job) => {
    try { return { ...(await job()), error: "" }; }
    catch (error) { return { items: [], pages: 0, error: text(error && (error.providerDetail || error.message), 220) || "OK API request failed" }; }
  });
  const candidates = unique(responses.flatMap((response) => response.items || [])
    .map((row) => okApiItem(row, row && row.__query || ""))
    .filter(Boolean));
  const items = candidates.filter((item) => accepted(profile, item, "OK.ru"));
  return {
    provider: "OK.ru",
    items: items.slice(0, firstLane ? 8 : SOURCE_MAX_ITEMS).map((item) => normalized(item, "OK.ru", item.query)),
    health: {
      api: true,
      searched: queries.length,
      searchTerms: queries,
      expandedTags: expandedTags.slice(0, 12),
      expandedTitleTags: expandedTitleTags.slice(0, 12),
      pages: responses.reduce((sum, response) => sum + Number(response.pages || 0), 0),
      candidates: candidates.length,
      details: items.length,
      candidateSamples: candidates.slice(0, 24).map((item) => ({
        title: item.title,
        duration: item.duration,
        aspectRatio: item.aspectRatio,
        query: item.query,
        category: item.category,
        account: item.account,
      })),
      admission: okAdmissionStats(profile, candidates),
      errors: responses.map((response) => response.error).filter(Boolean).slice(0, 8),
      firstLane,
    },
  };
}

function okPublicManifest(profile, rotation, options = {}) {
  const firstLane = options.firstLane === true;
  const candidates = [...(OK_PUBLIC_EMBED_MANIFEST[profile.profileKey] || []), ...(OK_VERIFIED_SEARCH_SEED[profile.profileKey] || []), ...(OK_ANIMATION_VERIFIED_SEED[profile.profileKey] || [])];
  const qualified = rotate(unique(candidates), rotation).map((item) => qualifySourceItem(profile, item)).filter(Boolean);
  const items = okMusicChannel(profile) ? okBalancedCandidates([qualified],"music",SOURCE_MAX_ITEMS) : qualified;
  return {
    provider: "OK.ru",
    items: items.slice(0, firstLane && !okMusicChannel(profile) ? 8 : SOURCE_MAX_ITEMS).map((item) => normalized(item, "OK.ru", item.query)),
    health: { manifest: true, searched: 0, candidates: candidates.length, details: items.length, errors: [], firstLane, constrained: items.length < SOURCE_MIN_READY },
  };
}

function providers(profile, rotation, env, options = {}) {
  const disabled = new Set((options.disabledProviders instanceof Set ? Array.from(options.disabledProviders) : (Array.isArray(options.disabledProviders) ? options.disabledProviders : []))
    .map((value) => String(value || "").toLowerCase()));
  return profile.providers
    .filter((provider) => !disabled.has(String(provider).toLowerCase()))
    .map((provider) => {
      const label = provider === "youtube" ? "YouTube" : provider === "peertube" ? "PeerTube" : provider === "vimeo" ? "Vimeo" : provider.startsWith("ok") ? "OK.ru" : provider;
      const startedAt = Date.now();
      const task = Promise.resolve()
        .then(() => provider === "youtube" ? youtube(profile, rotation, env, options)
          : provider === "peertube" ? peerTube(profile, rotation, env, options)
          : provider === "vimeo" ? vimeo(profile, rotation, env, options)
          : provider === "ok-api" ? okApi(profile, rotation, env, options)
          : provider === "ok-search" ? okTitleSearch(profile, rotation, env, options)
          : provider === "ok-sitemap" ? okSitemap(profile, rotation, env, options)
          : (provider === "ok" || provider === "ok-manifest") ? okPublicManifest(profile, rotation, options)
          : { provider: label, items: [], health: { skipped: true, reason: "unsupported provider" } });
      return Promise.resolve()
        .then(() => options.maintenance === true ? withTimeout(task, ["ok-sitemap", "ok-search", "vimeo"].includes(provider) ? OK_SITEMAP_MAINTENANCE_TIMEOUT_MS : 12_000) : withTimeout(task, SOURCE_PROVIDER_BUDGET_MS))
        .then((lane) => ({
          ...lane,
          health: { ...(lane && lane.health || {}), durationMs: Date.now() - startedAt },
        }))
        .catch((error) => ({
          provider: label,
          items: [],
          health: {
            error: text(error, 160) || "source failure",
            reason: String(error && error.message || error).toLowerCase().includes("timeout") ? "provider-timeout" : "provider-failure",
            durationMs: Date.now() - startedAt,
          },
        }));
    });
}

export function sourceProfile(body) {
  return normalizedProfile(body);
}

export async function discoverSourceCatalog(body, env, rotation = 0) {
  const profile = normalizedProfile(body);
  if (!profile) return { profileKey: "", items: [], lanes: [], ready: 0, candidates: 0, catalogVersion: "source-server-1", source: "server-source-catalog", error: "unknown source profile" };
  const lanes = await Promise.all(sourceTasks(profile, env, rotation).map((task) => task.catch((error) => ({ provider: "unknown", items: [], health: { error: text(error, 160) } }))));
  const items = unique(lanes.flatMap((lane) => lane.items || [])).slice(0, SOURCE_MAX_ITEMS);
  return { profileKey: profile.profileKey, items, lanes, ready: items.length, candidates: items.length, catalogVersion: "source-server-1", source: "server-source-catalog" };
}

export function sourceCatalogTasks(body, env, rotation = 0, options = {}) {
  const profile = normalizedProfile(body);
  if (!profile) return { profile: null, tasks: [] };
  return { profile, tasks: sourceTasks(profile, env, rotation, options) };
}

/* The public OK sitemap is deliberately maintenance-only because reading and
   inflating a compressed shard is much heavier than a normal viewer request.
   When an OK lane is cold or shallow, schedule that maintenance rail in the
   background instead of silently omitting it from the refresh. The foreground
   still uses the fast API/manifest lane and never waits on sitemap discovery. */
export function sourceRefreshTasks(body, env, rotation = 0, options = {}) {
  const profile = normalizedProfile(body);
  if (!profile) return [];
  // Choose the plan BEFORE starting promises; previously every refill launched
  // a discarded foreground discovery plus an identical maintenance discovery.
  return sourceTasks(profile, env, rotation, profile.providers.includes("ok-sitemap") ? { ...options, maintenance: true } : options);
}

/* Holiday family lanes can be sparse even when their seasonal children are
   healthy. Keep the fallback explicit in the approved registry: it reuses the
   same verified YouTube/PeerTube adapters and lets the generic holiday station
   inherit already-qualified Christmas/Halloween material without inventing a
   second discovery path or weakening any item-level filters. */
function sourceTasks(profile, env, rotation, options = {}) {
  const tasks = providers(profile, rotation, env, options);
  /* Deep maintenance is an editorial rebuild of this lane, not a family
     fallback merge. Searching fallback profiles here made the movie lanes
     look larger while reintroducing overlap and spending the maintenance
     budget on unrelated catalogs. Viewer requests still retain their fast
     fallback safety net. */
  const fallbackTasks = options.maintenance === true && profile.deepCatalog === true ? [] : (profile.fallbackProfiles || [])
    .map((profileKey) => normalizedProfile({ profileKey }))
    .filter(Boolean)
    .flatMap((fallback) => providers(fallback, rotation, env, { ...options, disabledProviders: [] }));
  return tasks.concat(fallbackTasks);
}


export function mergeSourceLanes(profileKey, lanes) {
  const candidates = unique((lanes || []).flatMap((lane) => Array.isArray(lane && lane.items) ? lane.items : []));
  const items = okMusicChannel({profileKey}) ? okBalancedCandidates([candidates],"music",SOURCE_MAX_ITEMS) : candidates.slice(0, SOURCE_MAX_ITEMS);
  return { profileKey, items, ready: items.length, candidates: items.length, catalogVersion: "source-server-1", source: "server-source-catalog" };
}

export const SOURCE_LIMITS = { SOURCE_MIN_RUNTIME, SOURCE_MIN_ASPECT_RATIO, SOURCE_MAX_ITEMS, SOURCE_MIN_READY, SOURCE_MAX_QUERIES, SOURCE_QUERY_WINDOW, SOURCE_DETAIL_TIMEOUT_MS, SOURCE_PROVIDER_BUDGET_MS, SOURCE_FIRST_LANE_TIMEOUT_MS, OK_SITEMAP_MAINTENANCE_TIMEOUT_MS };
