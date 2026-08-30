#!/usr/bin/env node
/*
 * Version 2 video-source pilot.
 *
 * This is intentionally read-only: it probes candidate catalogs and playback
 * endpoints but does not change PROGRAM/CH or add a source to production.
 * A provider qualifies for a channel only when it has metadata, rights
 * evidence, a reachable playback/embed endpoint, and five unique candidates.
 *
 * Optional credentials:
 *   YOUTUBE_API_KEY        (falls back to the existing app key, if present)
 *   VIMEO_ACCESS_TOKEN     (Vimeo search is token-backed)
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DESKTOP = path.join(ROOT, "the_dial_desktop.html");
const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i].startsWith("--")) args.set(process.argv[i], process.argv[i + 1] || "");
}
const outputPath = args.get("--out") ? path.resolve(args.get("--out")) : null;
const timeoutMs = Math.max(3000, Number(args.get("--timeout-ms") || 9000));
const maxQueries = Math.max(1, Math.min(5, Number(args.get("--queries") || 3)));
const maxCandidates = Math.max(5, Math.min(10, Number(args.get("--candidates") || 5)));
const requestedProviders = String(args.get("--providers") || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);

const CHANNELS = [
  {
    key: "public-health-archive",
    name: "Public Health Archive",
    queries: ["public health film", "sanitation film", "medical education film", "hospital documentary", "epidemiology film"],
    deny: ["fictional", "horror", "music video", "commercial", "cartoon", "gameplay"],
  },
  {
    key: "signal-room",
    name: "The Signal Room",
    queries: ["telegraph history film", "telephone history film", "radio engineering film", "broadcasting history film", "communications technology film"],
    deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "podcast"],
  },
  {
    key: "darkroom",
    name: "The Darkroom",
    queries: ["photography film", "darkroom film processing", "camera history film", "photographic technique film", "cinematography film"],
    deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "wedding photography service"],
  },
  {
    key: "restoration-row",
    name: "Restoration Row",
    queries: ["art restoration documentary", "furniture restoration documentary", "car restoration documentary", "building restoration documentary", "book restoration documentary", "museum conservation film", "tool restoration", "film restoration documentary"],
    deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "restoration gameplay", "restoration video game"],
  },
  {
    key: "consumer-report",
    name: "Consumer Report",
    queries: ["consumer education film", "product safety film", "consumer testing documentary", "household buying guide film", "consumer rights film"],
    deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "unboxing", "influencer", "affiliate"],
  },
  {
    key: "map-room",
    name: "The Map Room",
    queries: ["cartography film", "map making documentary", "geography film", "surveying film", "map history documentary"],
    deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "map mod", "game map"],
  },
  {
    key: "military-archive",
    name: "Military Archive",
    queries: ["military history film", "armed forces history documentary", "military training film archive", "wartime documentary film", "military technology history"],
    deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "airsoft", "paintball", "recruitment ad"],
  },
  {
    key: "public-works",
    name: "Public Works",
    queries: ["public works documentary", "civil engineering film", "municipal infrastructure film", "transit construction documentary", "water utility film"],
    deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "real estate ad", "product ad"],
  },
  {
    key: "sound-lab",
    name: "The Sound Lab",
    queries: ["sound recording technology film", "acoustics documentary", "audio engineering film", "radio studio technology film", "recording studio history"],
    deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "concert", "live performance", "song"],
  },
  {
    key: "workshop",
    name: "The Workshop",
    queries: ["workshop tools film", "machine shop documentary", "fabrication film", "craft technique documentary", "making things film"],
    deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "unboxing", "influencer", "affiliate"],
  },
  {
    key: "field-notes",
    name: "Field Notes",
    queries: ["field biology film", "ecology field study documentary", "natural history field film", "wildlife research film", "environmental science documentary"],
    deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "hunting show", "fishing show", "reality show"],
  },
  {
    key: "classroom",
    name: "The Classroom",
    queries: ["educational film classroom", "science teaching film", "civics educational film", "school instructional film", "educational documentary archive"],
    deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "lecture advertisement", "product training"],
  },
  /* 1.9.3 source expansion: same editorial discipline as IA lanes, but restricted to
     independent-video providers so these profiles never promote an Internet Archive item. */
  { key: "newsreel-exchange", name: "Newsreel Exchange", providers: ["peertube", "youtube"], queries: ["historic news footage documentary", "newsreel history", "archival journalism film", "world events documentary", "television news history"], deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "movie trailer", "opinion vlog"] },
  { key: "foodways", name: "Foodways", providers: ["peertube", "youtube"], queries: ["cooking history documentary", "food culture documentary", "regional cuisine film", "kitchen history film", "culinary traditions documentary"], deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "unboxing", "influencer", "affiliate"] },
  { key: "wild-earth-desk", name: "Wild Earth Desk", providers: ["peertube", "youtube"], queries: ["wildlife field research documentary", "ecology fieldwork film", "animal behavior documentary", "conservation science film", "natural history expedition"], deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "hunting show", "fishing show", "pet influencer"] },
  { key: "mission-control", name: "Mission Control", providers: ["peertube", "youtube"], queries: ["space mission documentary", "astronaut training film", "rocket engineering documentary", "spaceflight history", "planetary mission film"], deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "science fiction", "flat earth", "conspiracy"] },
  { key: "backroad-journal", name: "Backroad Journal", providers: ["peertube", "youtube"], queries: ["rural life documentary", "roadside travel film", "small town documentary", "farm life history film", "American road documentary"], deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "real estate", "luxury resort", "influencer"] },
  { key: "storm-lab", name: "Storm Lab", providers: ["peertube", "youtube"], queries: ["meteorology documentary", "storm research film", "hurricane science documentary", "tornado science film", "weather instrument history"], deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "weather prank", "conspiracy", "storm chaser vlog"] },
  { key: "atomic-age-files", name: "Atomic Age Files", providers: ["peertube", "youtube"], queries: ["cold war civil defense film", "atomic age documentary", "nuclear history film", "air raid preparedness film", "space race cold war history"], deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "science fiction", "conspiracy", "recruitment ad"] },
  { key: "lesson-reel", name: "Lesson Reel", providers: ["peertube", "youtube"], queries: ["classroom instructional film", "science lesson documentary", "civics education film", "vocational training film", "teaching history documentary"], deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "lecture advertisement", "product training", "webinar"] },
  { key: "local-signal", name: "Local Signal", providers: ["peertube", "youtube"], queries: ["community television documentary", "public access television history", "local cable access film", "community media project", "municipal public affairs video"], deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "campaign ad", "real estate", "influencer"] },
  { key: "comfort-television", name: "Comfort Television", providers: ["peertube", "youtube"], queries: ["craft demonstration television", "home improvement history film", "gardening television documentary", "quiet making documentary", "public television lifestyle"], deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "unboxing", "influencer", "affiliate", "reality dating"] },
  { key: "comedy-circuit", name: "Comedy Circuit", providers: ["peertube", "youtube"], queries: ["stand up comedy history", "comedy performance documentary", "comedy club film", "sketch comedy archive", "comic interview documentary"], deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "prank", "reaction", "podcast"] },
  { key: "rhythm-archives", name: "Rhythm Archives", providers: ["peertube", "youtube"], queries: ["music history documentary", "live soul performance archive", "jazz performance film", "rhythm and blues documentary", "recording artist profile"], deny: ["fictional", "commercial", "cartoon", "gameplay", "reaction", "lyrics video", "fan edit"] },
  { key: "freedom-stories", name: "Freedom Stories", providers: ["peertube", "youtube"], queries: ["civil rights documentary", "social movement history film", "human rights archive", "labor movement documentary", "voting rights history"], deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "campaign ad", "conspiracy", "opinion vlog"] },
  { key: "black-stage", name: "Black Stage", providers: ["peertube", "youtube"], queries: ["Black performance history documentary", "African American theatre film", "Black comedy archive", "Black dance documentary", "soul performance history"], deny: ["fictional", "commercial", "cartoon", "gameplay", "reaction", "fan edit", "lyrics video"] },
  { key: "documentary-desk", name: "Documentary Desk", providers: ["peertube", "youtube"], queries: ["public media documentary", "investigative documentary film", "science documentary television", "history documentary program", "independent documentary"], deny: ["fictional", "music video", "commercial", "cartoon", "gameplay", "trailer", "reaction", "vlog"] },
];

const providerFilter = name => !requestedProviders.length || requestedProviders.includes(name);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fetchWithTimeout(url, init = {}, ms = timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
async function jsonFetch(url, init = {}) {
  const response = await fetchWithTimeout(url, init);
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch (_) {}
  if (!response.ok) throw new Error(`http ${response.status}`);
  if (!body) throw new Error("invalid JSON");
  return { response, body };
}
function first(...values) {
  return values.find(value => {
    const normalized = String(value ?? "").trim().toLowerCase();
    return normalized && normalized !== "undefined" && normalized !== "null";
  });
}
function text(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(text).filter(Boolean).join(" ");
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function absoluteUrl(value, base) {
  try { return new URL(String(value), base).toString(); } catch (_) { return ""; }
}
function unique(items) {
  const seen = new Set();
  return items.filter(item => { const key = String(item.id || item.url || item.title || ""); if (!key || seen.has(key)) return false; seen.add(key); return true; });
}
function containsAny(value, terms) {
  const haystack = text(value).toLowerCase();
  return terms.some(term => haystack.includes(String(term).toLowerCase()));
}
function isHowTo(value) {
  return /\bhow[\s-]+to\b/i.test(text(value));
}
function relevance(profile, item) {
  const haystack = text([item.title, item.description, item.subjects, item.tags]).toLowerCase();
  const hits = profile.queries.filter(query => query.split(/\s+/).filter(x => x.length > 3).some(term => haystack.includes(term.toLowerCase()))).length;
  return { hits, denied: containsAny(haystack, profile.deny) };
}
function candidate(item, fields = {}) {
  return {
    id: String(first(fields.id, item.id, item.identifier, item.uuid, "")),
    title: text(first(fields.title, item.title, item.name, "Untitled")),
    description: text(first(fields.description, item.description, item.summary, "")),
    year: first(fields.year, item.year, item.date, null),
    rights: text(first(fields.rights, item.rights, item.license, item.licence, item.license_label, "")),
    rightsUrl: String(first(fields.rightsUrl, item.licenseUrl, item.licence?.url, "")),
    playbackUrl: String(first(fields.playbackUrl, item.playbackUrl, item.url, "")),
    embedUrl: String(first(fields.embedUrl, item.embedUrl, "")),
    source: fields.source || "",
    raw: item,
  };
}

function existingYouTubeKey() {
  const source = fs.readFileSync(DESKTOP, "utf8");
  return process.env.YOUTUBE_API_KEY || ((source.match(/var YOUTUBE_KEY\s*=\s*"([^"]+)"/) || [])[1] || "");
}

async function probeHttp(url, mode = "media") {
  if (!url) return { ok: false, reason: "missing playback URL" };
  try {
    const headers = mode === "media" ? { Range: "bytes=0-1023", Accept: "video/*,audio/*,*/*" } : {};
    const response = await fetchWithTimeout(url, { headers, redirect: "follow" });
    const contentType = response.headers.get("content-type") || "";
    const length = Number(response.headers.get("content-length") || 0);
    if (mode === "media") {
      const body = await response.arrayBuffer();
      const playableType = /video|audio|mpeg|ogg|webm|mp4|m3u8/i.test(contentType) || /\.(mp4|m4v|webm|ogv|m3u8|mp3|ogg)(?:[?#]|$)/i.test(response.url);
      return { ok: response.ok && playableType, status: response.status, contentType, bytes: body.byteLength || length, finalUrl: response.url };
    }
    await response.arrayBuffer();
    return { ok: response.ok, status: response.status, contentType, finalUrl: response.url };
  } catch (error) { return { ok: false, reason: String(error && error.message || error) }; }
}

async function searchArchive(profile) {
  const candidates = [];
  for (const query of profile.queries.slice(0, maxQueries)) {
    const q = `mediatype:movies AND (${query.split(/\s+/).map(term => `"${term}"`).join(" AND ")})`;
    const url = "https://archive.org/advancedsearch.php?" + new URLSearchParams({ q, "fl[]": "identifier,title,description,year,license,rights,subject,mediatype", rows: "10", page: "1", output: "json" });
    try {
      const { body } = await jsonFetch(url);
      for (const doc of body?.response?.docs || []) candidates.push(candidate(doc, { source: "Internet Archive", id: doc.identifier, rights: doc.license || doc.rights, year: doc.year }));
    } catch (error) { return { provider: "internet-archive", displayName: "Internet Archive", error: String(error), candidates: [] }; }
  }
  return { provider: "internet-archive", displayName: "Internet Archive", candidates: unique(candidates) };
}

async function enrichArchive(item) {
  try {
    const { body } = await jsonFetch("https://archive.org/metadata/" + encodeURIComponent(item.id));
    const files = Array.isArray(body.files) ? body.files : [];
    const playable = files.filter(file => file && file.name && (/\.mp4$|\.m4v$/i.test(file.name) || /\.webm$/i.test(file.name) || /\.ogv$/i.test(file.name)) && !/thumb|sample|_orig/i.test(String(file.name || "")))
      .sort((a, b) => {
        const score = file => /h\.?264/i.test(String(file.format || "")) ? 0 : /\.mp4$|\.m4v$/i.test(file.name) ? 1 : /\.webm$/i.test(file.name) ? 2 : 3;
        return score(a) - score(b);
      })[0];
    const fileUrl = playable ? "https://archive.org/download/" + encodeURIComponent(item.id) + "/" + encodeURIComponent(playable.name) : "";
    return { ...item, rights: text(first(item.rights, body.metadata?.license, body.metadata?.rights)), rightsUrl: body.metadata?.licenseurl || "", playbackUrl: fileUrl, metadataOk: Boolean(body.metadata?.title || item.title), mediaFormat: playable?.format || "" };
  } catch (error) { return { ...item, metadataError: String(error) }; }
}

async function searchYouTube(profile) {
  const key = existingYouTubeKey();
  if (!key) return { provider: "youtube", displayName: "YouTube", skipped: true, reason: "YOUTUBE_API_KEY not configured", candidates: [] };
  const candidates = [];
  for (const query of profile.queries.slice(0, maxQueries)) {
    const url = "https://www.googleapis.com/youtube/v3/search?" + new URLSearchParams({ part: "snippet", type: "video", maxResults: "50", q: query, videoEmbeddable: "true", videoSyndicated: "true", safeSearch: "moderate", key });
    try {
      const { body } = await jsonFetch(url);
      for (const item of body.items || []) {
        const id = item.id?.videoId;
        if (id && !isHowTo([item.snippet?.title, item.snippet?.description])) candidates.push(candidate(item.snippet || {}, { source: "YouTube", id, title: item.snippet?.title, description: item.snippet?.description, year: item.snippet?.publishedAt, playbackUrl: `https://www.youtube.com/watch?v=${id}`, embedUrl: `https://www.youtube-nocookie.com/embed/${id}` }));
      }
    } catch (error) { return { provider: "youtube", displayName: "YouTube", error: String(error), candidates: [] }; }
  }
  const ids = unique(candidates).map(item => item.id).slice(0, 50);
  try {
    const { body } = await jsonFetch("https://www.googleapis.com/youtube/v3/videos?" + new URLSearchParams({ part: "snippet,contentDetails,status", id: ids.join(","), key }));
    const byId = new Map((body.items || []).map(item => [item.id, item]));
    return { provider: "youtube", displayName: "YouTube", candidates: unique(candidates).map(item => {
      const full = byId.get(item.id) || {};
      return { ...item, rights: full.snippet?.license || "standard YouTube license", metadataOk: Boolean(full.snippet?.title && full.contentDetails?.duration), embeddable: full.status?.embeddable === true, playbackUrl: `https://www.youtube.com/watch?v=${item.id}`, embedUrl: `https://www.youtube-nocookie.com/embed/${item.id}` };
    }) };
  } catch (error) { return { provider: "youtube", displayName: "YouTube", error: String(error), candidates: [] }; }
}

async function searchVimeo(profile) {
  const token = process.env.VIMEO_ACCESS_TOKEN || "";
  if (!token) return { provider: "vimeo", displayName: "Vimeo", skipped: true, reason: "VIMEO_ACCESS_TOKEN not configured", candidates: [] };
  const candidates = [];
  for (const query of profile.queries.slice(0, maxQueries)) {
    const url = "https://api.vimeo.com/videos?" + new URLSearchParams({ query, per_page: "10", sort: "relevant", direction: "desc" });
    try {
      const { body } = await jsonFetch(url, { headers: { Authorization: `bearer ${token}`, Accept: "application/vnd.vimeo.*+json;version=3.4" } });
      for (const item of body.data || []) {
        const id = String(item.uri || "").split("/").pop();
        if (id) candidates.push(candidate(item, { source: "Vimeo", id, title: item.name, description: item.description, year: item.created_time, rights: item.license, rightsUrl: item.license_url, playbackUrl: item.link, embedUrl: item.embed?.html ? `https://player.vimeo.com/video/${id}` : "" }));
      }
    } catch (error) { return { provider: "vimeo", displayName: "Vimeo", error: String(error), candidates: [] }; }
  }
  return { provider: "vimeo", displayName: "Vimeo", candidates: unique(candidates) };
}

async function searchPeerTube(profile) {
  const instances = String(process.env.PEERTUBE_INSTANCES || "https://video.blender.org,https://framatube.org,https://peertube.uno,https://tilvids.com")
    .split(",").map(value => value.trim().replace(/\/$/, "")).filter(Boolean).slice(0, 6);
  const candidates = [];
  for (const instance of instances) {
    for (const query of profile.queries.slice(0, maxQueries)) {
      const url = instance + "/api/v1/search/videos?" + new URLSearchParams({ search: query, count: "10", sort: "-match" });
      try {
        const { body } = await jsonFetch(url);
        for (const item of body.data || []) {
          const uuid = first(item.uuid, item.id, "");
          if (uuid) candidates.push(candidate(item, { source: `PeerTube · ${new URL(instance).hostname}`, id: `${new URL(instance).hostname}/${uuid}`, title: item.name, description: item.description, year: item.publishedAt, rights: item.licence?.label || item.licence?.name || item.licence, rightsUrl: item.licence?.url, playbackUrl: item.url, embedUrl: item.embedPath ? absoluteUrl(item.embedPath, instance) : `${instance}/videos/embed/${uuid}` }));
        }
      } catch (error) {
        /* One instance going offline must not erase results from the others. */
        continue;
      }
      await sleep(120);
    }
  }
  return { provider: "peertube", displayName: "PeerTube", candidates: unique(candidates) };
}

function collectUrls(value, base, out = []) {
  if (typeof value === "string") {
    const url = absoluteUrl(value, base);
    if (url && /\.(mp4|webm|ogv|m3u8|mp3)(?:[?#]|$)/i.test(url)) out.push(url);
  } else if (Array.isArray(value)) value.forEach(item => collectUrls(item, base, out));
  else if (value && typeof value === "object") Object.values(value).forEach(item => collectUrls(item, base, out));
  return out;
}
async function searchLoc(profile) {
  const candidates = [];
  for (const query of profile.queries.slice(0, maxQueries)) {
    const url = "https://www.loc.gov/film-and-videos/?" + new URLSearchParams({ q: query, fo: "json", c: "10" });
    try {
      const { body } = await jsonFetch(url);
      for (const item of body.results || []) {
        const id = String(item.id || "");
        if (id) candidates.push(candidate(item, { source: "Library of Congress", id, title: item.title, description: item.description, year: item.date, rights: item.rights || item.rights_advisory, rightsUrl: item.rights_url, playbackUrl: "" }));
      }
    } catch (error) { return { provider: "loc", displayName: "Library of Congress", error: String(error), candidates: [] }; }
  }
  const enriched = [];
  for (const item of unique(candidates).slice(0, maxCandidates * 2)) {
    try {
      const { body } = await jsonFetch(item.id + (item.id.includes("?") ? "&" : "?") + "fo=json");
      const urls = collectUrls(body, item.id);
      enriched.push({ ...item, rights: text(first(item.rights, body.item?.rights, body.item?.rights_advisory, body.rights)), rightsUrl: String(first(item.rightsUrl, body.item?.rights_url, "")), playbackUrl: urls[0] || "", metadataOk: Boolean(body.item?.title || item.title) });
    } catch (error) {
      enriched.push({ ...item, metadataError: String(error) });
      if (/429/.test(String(error))) await sleep(1800);
    }
    await sleep(700);
  }
  return { provider: "loc", displayName: "Library of Congress", candidates: enriched };
}

const SEARCHERS = { "internet-archive": searchArchive, youtube: searchYouTube, vimeo: searchVimeo, peertube: searchPeerTube, loc: searchLoc };
async function testProvider(profile, provider) {
  const search = await SEARCHERS[provider](profile);
  if (search.skipped || search.error) return { ...search, checks: { metadata: false, rights: false, playback: false, fiveItemQueue: false }, qualified: false };
  const screened = search.candidates.map(item => ({ ...item, relevance: relevance(profile, item) })).filter(item => item.id && item.relevance.hits > 0 && !item.relevance.denied).slice(0, maxCandidates * 2);
  const items = provider === "internet-archive" ? await Promise.all(screened.map(enrichArchive)) : screened;
  const tested = [];
  for (const item of items.slice(0, maxCandidates * 2)) {
    const metadata = item.metadataOk !== false && Boolean(item.id && item.title);
    const rights = Boolean(item.rights || item.rightsUrl || provider === "youtube");
    const playback = provider === "youtube"
      ? Boolean(item.embeddable) && (await probeHttp(item.embedUrl, "page")).ok
      : provider === "vimeo"
        ? Boolean(item.embedUrl || item.playbackUrl) && (await probeHttp(item.embedUrl || item.playbackUrl, "page")).ok
        : provider === "peertube"
          ? Boolean(item.embedUrl) && (await probeHttp(item.embedUrl, "page")).ok
        : Boolean(item.playbackUrl) && (await probeHttp(item.playbackUrl, "media")).ok;
    tested.push({ id: item.id, title: item.title, year: item.year, rights: item.rights, rightsUrl: item.rightsUrl, metadata, rightsEvidence: rights, playback, mediaFormat: item.mediaFormat || "", relevanceHits: item.relevance.hits });
    if (tested.filter(item => item.metadata && item.rightsEvidence && item.playback).length >= maxCandidates) break;
  }
  const verified = tested.filter(item => item.metadata && item.rightsEvidence && item.playback);
  const checks = { metadata: verified.length >= maxCandidates, rights: verified.length >= maxCandidates, playback: verified.length >= maxCandidates, fiveItemQueue: verified.length >= maxCandidates };
  return { ...search, candidatesTested: tested.length, verifiedCount: verified.length, checks, qualified: Object.values(checks).every(Boolean), verified: verified.slice(0, maxCandidates) };
}

async function main() {
  const started = Date.now();
  const providers = Object.keys(SEARCHERS).filter(providerFilter);
  const channels = [];
  for (const profile of CHANNELS) {
    const results = {};
    const profileProviders = (profile.providers || providers).filter(providerFilter);
    for (const provider of profileProviders) {
      results[provider] = await testProvider(profile, provider);
      console.log(`${profile.name} · ${results[provider].displayName}: ${results[provider].qualified ? "QUALIFIED" : results[provider].skipped ? "SKIPPED" : "not qualified"}`);
      await sleep(150);
    }
    channels.push({ key: profile.key, name: profile.name, providers: results });
  }
  const report = { generatedAt: new Date().toISOString(), elapsedMs: Date.now() - started, maxQueries, requiredQueueSize: maxCandidates, channels };
  if (outputPath) { fs.mkdirSync(path.dirname(outputPath), { recursive: true }); fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n"); console.log(`Wrote ${outputPath}`); }
  const qualified = channels.flatMap(channel => Object.values(channel.providers).filter(result => result.qualified).map(result => `${channel.name} / ${result.displayName}`));
  console.log(`Qualified source-channel pairs: ${qualified.length}`);
  for (const pair of qualified) console.log(`QUALIFIED ${pair}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
