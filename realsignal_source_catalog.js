/* RealSignal server-side Source Suite adapters.
 *
 * The browser sends only a stable profile key. This module owns the approved
 * provider queries, discovery, television-length filtering, landscape
 * validation, and the normalized item shape returned to every client surface.
 * YouTube uses the optional YOUTUBE_API_KEY Worker secret. PeerTube uses its
 * public API and direct media renditions. Vimeo and OK.ru are opt-in,
 * server-only adapters that return official platform embeds and never scrape
 * or download third-party media. OK.ru prefers its signed REST API when the
 * three Cloudflare secrets are present, then falls back to a credential-free,
 * reviewable public-embed manifest.
 */

import { createHash } from "node:crypto";
import { SOURCE_PROFILE_REGISTRY } from "./source_suite_profile_registry.js";
import { OK_PUBLIC_EMBED_MANIFEST } from "./ok_public_embed_catalog.js";

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

const OK_API_DEFAULT_SERVER = "https://api.ok.ru/fb.do";
const OK_API_VIDEO_TYPES = ["USER_VIDEO", "GROUP_VIDEO"];

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

function okApiDuration(row) {
  const seconds = Number(okApiScalar(row && row.duration_seconds));
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  const milliseconds = Number(okApiScalar(row && row.duration_ms));
  if (Number.isFinite(milliseconds) && milliseconds > 0) return milliseconds / 1000;
  const duration = Number(okApiScalar(row && row.duration));
  if (Number.isFinite(duration) && duration > 0) return duration / 1000;
  const length = Number(okApiScalar(row && row.length));
  return Number.isFinite(length) && length > 0 ? length / 1000 : 0;
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

function okApiItem(row, query) {
  const width = Number(okApiScalar(row.width || row.video_width || row.dimensions && row.dimensions.width || row.initial_dimensions && row.initial_dimensions.width)) || 0;
  const height = Number(okApiScalar(row.height || row.video_height || row.dimensions && row.dimensions.height || row.initial_dimensions && row.initial_dimensions.height)) || 0;
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

function normalizedProfile(body) {
  const profileKey = text(body && (body.profileKey || body.channel || body.name), 120).toLowerCase().replace(/[^a-z0-9._:-]+/g, "-");
  const approved = SOURCE_PROFILE_REGISTRY[profileKey];
  if (!approved) return null;
  const queryLimit = Math.max(SOURCE_MAX_QUERIES, Math.min(16, Number(approved.queryLimit) || SOURCE_MAX_QUERIES));
  return {
    profileKey,
    name: approved.name,
    queries: list(approved.queries, queryLimit),
    okApiQueries: list(approved.okApiQueries, queryLimit),
    queryWindow: Math.max(1, Math.min(approved.deepCatalog === true ? 10 : SOURCE_MAX_QUERY_WINDOW, Number(approved.queryWindow) || SOURCE_QUERY_WINDOW)),
    peerTubeQueryWindow: Math.max(1, Math.min(approved.deepCatalog === true ? 10 : SOURCE_MAX_QUERY_WINDOW, Number(approved.peerTubeQueryWindow) || Number(approved.queryWindow) || SOURCE_QUERY_WINDOW)),
    peerTubeInstanceLimit: Math.max(1, Math.min(8, Number(approved.peerTubeInstanceLimit) || 8)),
    peerTubeDetailLimit: Math.max(SOURCE_MIN_READY, Math.min(32, Number(approved.peerTubeDetailLimit) || 32)),
    peerTubeFallbackQueryWindow: Math.max(1, Math.min(approved.deepCatalog === true ? 10 : SOURCE_MAX_QUERY_WINDOW, Number(approved.peerTubeFallbackQueryWindow) || SOURCE_QUERY_WINDOW)),
    deepCatalog: approved.deepCatalog === true,
    match: list(approved.match, 40),
    deny: list(approved.deny, 48),
    intent: text(approved.intent, 40).toLowerCase(),
    topics: list(approved.topics, 32),
    strictTopicTerms: list(approved.strictTopicTerms, 16),
    formats: list(approved.formats, 24),
    formatRelaxed: approved.formatRelaxed === true,
    minRuntimeSeconds: Math.max(SOURCE_MIN_RUNTIME, Number(approved.minRuntimeSeconds) || 0),
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
  return !/\b(?:hindi|tamil|telugu|bengali|bangla|marathi|malayalam|kannada|punjabi|urdu|indonesian|vietnamese|thai|arabic|espa[nñ]ol|portugu[eê]s|fran[cç]ais|deutsch|russian|turkish|korean|japanese|mandarin)\b/i.test(sample);
}

function accepted(profile, item, provider, checkAspect = true) {
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
    if (profile.topics.length && !termsMatch(haystack, profile.topics)) return false;
    if (profile.formats.length && !termsMatch(titleHaystack, profile.formats)
      && !(profile.formatRelaxed === true && duration >= 20 * 60)
      && !(trustedYouTubeChannel && duration >= 20 * 60)) return false;
  }
  if (profile.movieLane === "modern" && profile.laneDeny.some((term) => titleHaystack.includes(text(term, 180).toLowerCase()))) return false;
  if (profile.movieLane === "indie" && profile.laneRequired.length && !trustedYouTubeChannel && !profile.laneRequired.some((term) => haystack.includes(text(term, 180).toLowerCase()))) return false;
  const required = profile.match.length ? profile.match : profile.queries;
  return !required.length || termsMatch(haystack, required);
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
    query: text(query, 180),
    type: item.type || "video",
    url: text(item.url, 1400),
    embedUrl: text(item.embedUrl, 1400),
    sourceUrl: text(item.sourceUrl, 1400),
    duration: Number(item.duration) || 0,
    aspectRatio: aspectRatio(item),
    embedded: item.type === "embed",
    embedAllowed: item.embedAllowed === true,
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
  const token = text(env && env.VIMEO_ACCESS_TOKEN, 240);
  const queries = rotate(profile.queries, rotation).slice(0, firstLane ? 1 : (profile.queryWindow || SOURCE_QUERY_WINDOW));
  if (!token || !queries.length) return { provider: "Vimeo", items: [], health: { skipped: !token, reason: token ? "no approved queries" : "VIMEO_ACCESS_TOKEN not configured", queries: 0 } };
  const jobs = queries.map((query) => async () => {
    const params = new URLSearchParams({ query, per_page: firstLane ? "8" : "25", sort: Number(rotation || 0) % 2 ? "date" : "relevant", direction: "desc" });
    const data = await fetchJson("https://api.vimeo.com/videos?" + params, {
      headers: { Authorization: `bearer ${token}`, Accept: "application/vnd.vimeo.*+json;version=3.4" },
    });
    return (Array.isArray(data && data.data) ? data.data : []).map((item) => {
      const uri = text(item && item.uri, 120);
      const id = text(uri.match(/(?:videos\/)?(\d+)/i)?.[1] || item && item.id, 120);
      const width = Number(item && item.width) || 0;
      const height = Number(item && item.height) || 0;
      const embedUrl = text(item && item.player_embed_url, 1400) || (id ? `https://player.vimeo.com/video/${id}` : "");
      return id ? {
        id: `vimeo:${id}`,
        title: text(item && item.name, 500),
        description: text(item && item.description, 1800),
        tags: text(Array.isArray(item && item.tags) ? item.tags.map((tag) => tag && (tag.name || tag)).join(" ") : item && item.tags, 600),
        category: text(item && item.categories && item.categories[0] && item.categories[0].name, 120),
        account: text(item && item.user && item.user.name, 180),
        language: text(item && (item.language || item.default_language), 40),
        year: text(item && item.created_time, 12),
        rights: text(item && (item.license || item.license_name), 240),
        duration: Number(item && item.duration) || 0,
        aspectRatio: width > 0 && height > 0 ? width / height : 0,
        type: "embed",
        url: embedUrl,
        embedUrl,
        sourceUrl: text(item && item.link, 1400) || `https://vimeo.com/${id}`,
        embedAllowed: Boolean(embedUrl && (item && (item.player_embed_url || item.embed))),
        query,
      } : null;
    }).filter(Boolean);
  });
  const responses = await mapLimit(jobs, 2, async (job) => {
    try { return { items: await job(), error: "" }; }
    catch (error) { return { items: [], error: text(error && (error.providerDetail || error.message), 180) || "Vimeo request failed" }; }
  });
  const candidates = unique(responses.flatMap((response) => response.items || []));
  const items = candidates.filter((item) => accepted(profile, item, "Vimeo"));
  return {
    provider: "Vimeo",
    items: items.slice(0, firstLane ? 8 : SOURCE_MAX_ITEMS).map((item) => normalized(item, "Vimeo", item.query)),
    health: { searched: queries.length, candidates: candidates.length, details: items.length, errors: responses.map((response) => response.error).filter(Boolean).slice(0, 8), firstLane },
  };
}

async function okApi(profile, rotation, env, options = {}) {
  const firstLane = options.firstLane === true;
  if (!okApiConfig(env)) return { provider: "OK.ru", items: [], health: { api: true, skipped: true, reason: "OK_APPLICATION_KEY, OK_SESSION_KEY or OK_ACCESS_TOKEN, and OK_SESSION_SECRET or OK_APPLICATION_SECRET are not configured" } };
  const pool = Array.isArray(profile.okApiQueries) && profile.okApiQueries.length ? profile.okApiQueries : profile.queries;
  const queries = rotate(pool, rotation).slice(0, firstLane ? 1 : (profile.queryWindow || SOURCE_QUERY_WINDOW));
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
  const responses = await mapLimit(jobs, firstLane ? 1 : 2, async (job) => {
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
      pages: responses.reduce((sum, response) => sum + Number(response.pages || 0), 0),
      candidates: candidates.length,
      details: items.length,
      errors: responses.map((response) => response.error).filter(Boolean).slice(0, 8),
      firstLane,
    },
  };
}

function okPublicManifest(profile, rotation, options = {}) {
  const firstLane = options.firstLane === true;
  const candidates = Array.isArray(OK_PUBLIC_EMBED_MANIFEST[profile.profileKey]) ? OK_PUBLIC_EMBED_MANIFEST[profile.profileKey] : [];
  const items = rotate(unique(candidates), rotation).filter((item) => accepted(profile, item, "OK.ru"));
  return {
    provider: "OK.ru",
    items: items.slice(0, firstLane ? 8 : SOURCE_MAX_ITEMS).map((item) => normalized(item, "OK.ru", item.query)),
    health: { manifest: true, searched: 0, candidates: candidates.length, details: items.length, errors: [], firstLane, constrained: items.length < SOURCE_MIN_READY },
  };
}

function providers(profile, rotation, env, options = {}) {
  const disabled = new Set((options.disabledProviders instanceof Set ? Array.from(options.disabledProviders) : (Array.isArray(options.disabledProviders) ? options.disabledProviders : []))
    .map((value) => String(value || "").toLowerCase()));
  return profile.providers
    .filter((provider) => !disabled.has(String(provider).toLowerCase()))
    .map((provider) => {
      const label = provider === "youtube" ? "YouTube" : provider === "peertube" ? "PeerTube" : provider === "vimeo" ? "Vimeo" : (provider === "ok" || provider === "ok-api" || provider === "ok-manifest") ? "OK.ru" : provider;
      const startedAt = Date.now();
      const task = Promise.resolve()
        .then(() => provider === "youtube" ? youtube(profile, rotation, env, options)
          : provider === "peertube" ? peerTube(profile, rotation, env, options)
          : provider === "vimeo" ? vimeo(profile, rotation, env, options)
          : provider === "ok-api" ? okApi(profile, rotation, env, options)
          : (provider === "ok" || provider === "ok-manifest") ? okPublicManifest(profile, rotation, options)
          : { provider: label, items: [], health: { skipped: true, reason: "unsupported provider" } });
      return Promise.resolve()
        .then(() => options.maintenance === true ? withTimeout(task, 12_000) : withTimeout(task, SOURCE_PROVIDER_BUDGET_MS))
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
  const items = unique((lanes || []).flatMap((lane) => Array.isArray(lane && lane.items) ? lane.items : [])).slice(0, SOURCE_MAX_ITEMS);
  return { profileKey, items, ready: items.length, candidates: items.length, catalogVersion: "source-server-1", source: "server-source-catalog" };
}

export const SOURCE_LIMITS = { SOURCE_MIN_RUNTIME, SOURCE_MIN_ASPECT_RATIO, SOURCE_MAX_ITEMS, SOURCE_MIN_READY, SOURCE_MAX_QUERIES, SOURCE_QUERY_WINDOW, SOURCE_DETAIL_TIMEOUT_MS, SOURCE_PROVIDER_BUDGET_MS, SOURCE_FIRST_LANE_TIMEOUT_MS };
