/* RealSignal server-side Source Suite adapters.
 *
 * The browser sends only a stable profile key. This module owns the approved
 * provider queries, discovery, television-length filtering, landscape
 * validation, and the normalized item shape returned to every client surface.
 * YouTube uses the optional YOUTUBE_API_KEY Worker secret. PeerTube uses its
 * public API and direct media renditions, never unverifiable embeds.
 */

import { SOURCE_PROFILE_REGISTRY } from "./source_suite_profile_registry.js";

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
const SOURCE_DETAIL_TIMEOUT_MS = 1800;
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
  if (!response.ok) throw new Error(`source http ${response.status}`);
  return response.json();
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
    queryWindow: Math.max(1, Math.min(SOURCE_MAX_QUERY_WINDOW, Number(approved.queryWindow) || SOURCE_QUERY_WINDOW)),
    peerTubeQueryWindow: Math.max(1, Math.min(SOURCE_MAX_QUERY_WINDOW, Number(approved.peerTubeQueryWindow) || Number(approved.queryWindow) || SOURCE_QUERY_WINDOW)),
    peerTubeInstanceLimit: Math.max(1, Math.min(8, Number(approved.peerTubeInstanceLimit) || 8)),
    peerTubeDetailLimit: Math.max(SOURCE_MIN_READY, Math.min(32, Number(approved.peerTubeDetailLimit) || 32)),
    peerTubeFallbackQueryWindow: Math.max(1, Math.min(SOURCE_MAX_QUERY_WINDOW, Number(approved.peerTubeFallbackQueryWindow) || SOURCE_QUERY_WINDOW)),
    match: list(approved.match, 40),
    deny: list(approved.deny, 48),
    intent: text(approved.intent, 40).toLowerCase(),
    topics: list(approved.topics, 32),
    formats: list(approved.formats, 24),
    formatRelaxed: approved.formatRelaxed === true,
    persistedRelaxed: approved.persistedRelaxed === true || approved.formatRelaxed === true,
    persistedMatch: list(approved.persistedMatch, 24),
    peerTubeInstances: list(approved.peerTubeInstances, 8),
    peerTubeQueries: list(approved.peerTubeQueries, queryLimit),
    providers: list(approved.providers, 2).map((value) => value.toLowerCase()),
  };
}

function termsMatch(haystack, terms) {
  return terms.some((term) => {
    const value = text(term, 180).toLowerCase();
    if (!value) return false;
    return value.includes(" ") ? haystack.includes(value) : new RegExp(`(?:^|[^a-z0-9])${value.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`, "i").test(haystack);
  });
}

function rightsOkay(rights, provider) {
  if (provider === "YouTube") return true;
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
  if (!item || !(item.id || item.uuid || item.rawId) || !title || duration < SOURCE_MIN_RUNTIME || (checkAspect && ratio < SOURCE_MIN_ASPECT_RATIO)) return false;
  if (/(?:#?shorts?\b|vertical\s+video|how[ -]+to|tutorial|reaction|trailer|teaser|promo|advertisement|commercial|fan\s+edit|lyrics\s+video)/i.test(haystack)) return false;
  if (profile.deny.some((term) => haystack.includes(text(term, 180).toLowerCase()))) return false;
  if (!rightsOkay(item.rights, source)) return false;
  if (source === "YouTube" && !englishOkay(item)) return false;
  if (/^(?:television|film|performance)$/.test(profile.intent || "")) {
    const programDeny = /(?:history of|documentary about|retrospective|video essay|analysis|explained|lecture|seminar|webinar|conference|panel discussion|making of|behind the scenes|demo reel|showreel|workshop|masterclass|recap|production reel|festival reel)/i;
    if (programDeny.test(haystack)) return false;
    if (profile.topics.length && !termsMatch(haystack, profile.topics)) return false;
    if (profile.formats.length && !termsMatch(titleHaystack, profile.formats)
      && !(profile.formatRelaxed === true && duration >= 20 * 60)) return false;
  }
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

async function youtube(profile, rotation, env) {
  const key = text(env && env.YOUTUBE_API_KEY, 180);
  if (!key) return { provider: "YouTube", items: [], health: { skipped: true, reason: "YOUTUBE_API_KEY not configured" } };
  const queries = youtubeQueries(profile, rotation);
  const orders = ["relevance", "date", "viewCount"];
  const order = orders[(Number(rotation) || 0) % orders.length];
  const jobs = queries.map((query) => async () => {
    const searchUrl = "https://www.googleapis.com/youtube/v3/search?" + new URLSearchParams({
      part: "snippet",
      type: "video",
      videoDuration: youtubeSearchDuration(profile, rotation),
      videoEmbeddable: "true",
      maxResults: "25",
      order,
      q: query,
      key,
    });
    const data = await fetchJson(searchUrl);
    return (data.items || []).map((item) => ({
      id: `yt:${text(item.id && item.id.videoId, 120)}`,
      rawId: text(item.id && item.id.videoId, 120),
      query,
      title: text(item.snippet && item.snippet.title),
      description: text(item.snippet && item.snippet.description, 1800),
      account: text(item.snippet && item.snippet.channelTitle, 180),
      year: text(item.snippet && item.snippet.publishedAt, 12),
      language: text(item.snippet && (item.snippet.defaultAudioLanguage || item.snippet.defaultLanguage), 40),
    })).filter((item) => item.rawId);
  });
  const candidates = (await mapLimit(jobs, SOURCE_YOUTUBE_QUERY_CONCURRENCY, (job) => job())).flat();
  const ids = unique(candidates).map((item) => item.rawId).slice(0, 75);
  if (!ids.length) return { provider: "YouTube", items: [], health: { searched: queries.length, candidates: 0 } };
  /* videos.list accepts at most 50 IDs. Chunking also means one oversized
     discovery pass cannot invalidate an otherwise healthy YouTube lane. */
  const detailBatches = await mapLimit(Array.from({ length: Math.ceil(ids.length / 50) }, (_, index) => ids.slice(index * 50, index * 50 + 50)), 2, async (batch) => {
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
  return { provider: "YouTube", items: unique(items).slice(0, SOURCE_MAX_ITEMS), health: { searched: queries.length, candidates: candidates.length, details: detailItems.length, detailBatches: detailBatches.length } };
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

async function peerTube(profile, rotation, env) {
  const instances = peerTubeInstances(env, profile);
  const peerTubePool = profile.peerTubeQueries.length ? profile.peerTubeQueries : profile.queries;
  const queries = rotate(peerTubePool, rotation).slice(0, profile.peerTubeQueryWindow || profile.queryWindow || SOURCE_QUERY_WINDOW);
  const sortModes = ["-match", "-publishedAt", "-views", "-likes"];
  const sort = sortModes[(Number(rotation) || 0) % sortModes.length];
  async function search(querySet) {
    const jobs = instances.flatMap((instance) => querySet.map((query) => ({ instance, query })));
    const searched = await mapLimit(jobs, SOURCE_MAX_CONCURRENCY, async ({ instance, query }) => {
      const url = `${instance}/api/v1/search/videos?${new URLSearchParams({ search: query, count: "12", sort })}`;
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
  if (raw.length < SOURCE_MIN_READY) {
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
  raw = raw.slice(0, profile.peerTubeDetailLimit || 32);
  const detailed = await mapLimit(raw, SOURCE_MAX_CONCURRENCY, async (item) => {
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
  return { provider: "PeerTube", items: unique(detailed.filter(Boolean)).slice(0, SOURCE_MAX_ITEMS), health: { searched: searchedJobs, candidates: raw.length, details: detailed.filter(Boolean).length, instances: instances.length } };
}

function providers(profile, rotation, env, options = {}) {
  const disabled = new Set((options.disabledProviders instanceof Set ? Array.from(options.disabledProviders) : (Array.isArray(options.disabledProviders) ? options.disabledProviders : []))
    .map((value) => String(value || "").toLowerCase()));
  return profile.providers
    .filter((provider) => !disabled.has(String(provider).toLowerCase()))
    .map((provider) => {
      const label = provider === "youtube" ? "YouTube" : "PeerTube";
      const startedAt = Date.now();
      const task = Promise.resolve()
        .then(() => provider === "youtube" ? youtube(profile, rotation, env) : peerTube(profile, rotation, env));
      return Promise.resolve()
        .then(() => withTimeout(task, SOURCE_PROVIDER_BUDGET_MS))
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
  const lanes = await Promise.all(providers(profile, rotation, env).map((task) => task.catch((error) => ({ provider: "unknown", items: [], health: { error: text(error, 160) } }))));
  const items = unique(lanes.flatMap((lane) => lane.items || [])).slice(0, SOURCE_MAX_ITEMS);
  return { profileKey: profile.profileKey, items, lanes, ready: items.length, candidates: items.length, catalogVersion: "source-server-1", source: "server-source-catalog" };
}

export function sourceCatalogTasks(body, env, rotation = 0, options = {}) {
  const profile = normalizedProfile(body);
  if (!profile) return { profile: null, tasks: [] };
  return { profile, tasks: providers(profile, rotation, env, options) };
}

export function mergeSourceLanes(profileKey, lanes) {
  const items = unique((lanes || []).flatMap((lane) => Array.isArray(lane && lane.items) ? lane.items : [])).slice(0, SOURCE_MAX_ITEMS);
  return { profileKey, items, ready: items.length, candidates: items.length, catalogVersion: "source-server-1", source: "server-source-catalog" };
}

export const SOURCE_LIMITS = { SOURCE_MIN_RUNTIME, SOURCE_MIN_ASPECT_RATIO, SOURCE_MAX_ITEMS, SOURCE_MIN_READY, SOURCE_MAX_QUERIES, SOURCE_QUERY_WINDOW, SOURCE_DETAIL_TIMEOUT_MS, SOURCE_PROVIDER_BUDGET_MS, SOURCE_FIRST_LANE_TIMEOUT_MS };
