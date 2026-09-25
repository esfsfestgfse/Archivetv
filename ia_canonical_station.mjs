/*
 * Canonical Internet Archive station contracts.
 *
 * This module is deliberately pure. Discovery/build jobs may create manifests
 * from it, while the API uses the same validation and rotation rules at read
 * time. The pilot is intentionally limited to three existing IA channels.
 */

export const IA_CANONICAL_SCHEMA_VERSION = "ia-canonical-1";

const GENERIC_COLLECTIONS = new Set([
  "movies",
  "moviesandfilms",
  "feature_films",
  "opensource_movies",
  "opensource_media",
  "community",
  "communitymedia",
  "television",
]);

const text = (value) => String(value == null ? "" : value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function arrayText(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value) ? [text(value)] : [];
}

function parseYear(value) {
  const match = String(value == null ? "" : value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function parseRuntime(value) {
  if (Number.isFinite(Number(value)) && Number(value) > 0) return Math.round(Number(value));
  const raw = text(value);
  if (!raw) return 0;
  const parts = raw.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1]);
  const minutes = Number(raw.match(/(\d+(?:\.\d+)?)\s*(?:min|m\b)/i)?.[1]);
  return Number.isFinite(minutes) ? Math.round(minutes * 60) : 0;
}

function firstSpecificCollection(value) {
  /* Generic Archive buckets are not useful editorial families. Returning an
     empty value here lets the stable archive identifier become the family key,
     so one large generic bucket cannot crowd every other collection out of a
     balanced station. */
  return arrayText(value).find((entry) => !GENERIC_COLLECTIONS.has(entry.toLowerCase())) || "";
}

function decadeFor(year) {
  const numeric = Number(year);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric / 10) * 10 : null;
}

function haystackFor(item) {
  return [item.title, item.seriesTitle, item.description, item.subject, item.tags, item.collection]
    .flatMap(arrayText)
    .join(" ")
    .toLowerCase();
}

function containsAny(haystack, terms) {
  return (terms || []).some((term) => haystack.includes(String(term).toLowerCase()));
}

export const IA_CANONICAL_PILOT_PROFILES = Object.freeze({
  "classic-tv": Object.freeze({
    profileKey: "classic-tv",
    channel: "10",
    name: "Classic Rerun TV",
    source: "internet-archive",
    era: [1950, 1989],
    minRuntimeSeconds: 900,
    maxRuntimeSeconds: 4 * 60 * 60,
    targetCatalog: 36,
    minCatalog: 12,
    maxPerCollection: 3,
    maxPerFamily: 3,
    decadeTargets: Object.freeze({ 1950: 0.25, 1960: 0.3, 1970: 0.25, 1980: 0.2 }),
    searchQueries: Object.freeze([
      "classic television full episode",
      "classic sitcom television episode",
      "classic television anthology full episode",
      "classic television drama full episode",
    ]),
    includeAny: Object.freeze(["television", "sitcom", "sitcoms", "tv episode", "television episode", "anthology", "comedy series", "drama series"]),
    titleAny: Object.freeze([]),
    excludeAny: Object.freeze(["trailer", "preview", "review", "reaction", "podcast", "lecture", "seminar", "how to", "commercial", "music video", "short film", "radio only"]),
    collections: Object.freeze(["classic_tv", "classic_tv_1950s", "classic_tv_1960s", "classic_tv_1970s", "classic_tv_1980s", "opensource_movies"]),
  }),
  "classic-cartoons": Object.freeze({
    profileKey: "classic-cartoons",
    channel: "150",
    name: "Classic Cartoons",
    source: "internet-archive",
    era: [1930, 1979],
    minRuntimeSeconds: 180,
    maxRuntimeSeconds: 4 * 60 * 60,
    targetCatalog: 48,
    minCatalog: 15,
    maxPerCollection: 4,
    maxPerFamily: 3,
    decadeTargets: Object.freeze({ 1930: 0.15, 1940: 0.25, 1950: 0.25, 1960: 0.2, 1970: 0.15 }),
    searchQueries: Object.freeze([
      "classic cartoon full episode",
      "golden age animation cartoon",
      "theatrical cartoon collection",
      "classic animated television episode",
    ]),
    includeAny: Object.freeze(["cartoon", "cartoons", "animated", "animation", "looney tunes", "popeye", "bugs bunny", "tom and jerry", "fleischer", "woody woodpecker", "theatrical cartoon"]),
    titleAny: Object.freeze(["cartoon", "cartoons", "animated", "animation", "looney", "popeye", "bugs", "fleischer", "woody woodpecker"]),
    excludeAny: Object.freeze(["trailer", "preview", "review", "reaction", "podcast", "lecture", "seminar", "how to", "tutorial", "making of", "behind the scenes", "commercial", "music video", "anime opening", "animation history documentary"]),
    collections: Object.freeze(["classic_cartoons", "animationandcartoons", "saturdaymorningcartoons", "cartoons", "vhskids", "classic_tv"]),
  }),
  "game-shows": Object.freeze({
    profileKey: "game-shows",
    channel: "12",
    name: "Game Show Channel",
    source: "internet-archive",
    era: [1940, 2026],
    minRuntimeSeconds: 900,
    maxRuntimeSeconds: 4 * 60 * 60,
    targetCatalog: 36,
    minCatalog: 12,
    maxPerCollection: 3,
    maxPerFamily: 3,
    decadeTargets: Object.freeze({ 1940: 0.1, 1950: 0.2, 1960: 0.2, 1970: 0.2, 1980: 0.15, 1990: 0.1, 2000: 0.05 }),
    searchQueries: Object.freeze([
      "classic television game show full episode",
      "quiz show full episode television",
      "panel show full episode television",
      "game show complete episode",
    ]),
    includeAny: Object.freeze(["game show", "game-show", "quiz show", "quiz-show", "panel show", "panel-show", "match game", "jeopardy", "price is right", "family feud", "password", "pyramid", "newlywed game", "hollywood squares", "let's make a deal", "press your luck"]),
    titleAny: Object.freeze([]),
    excludeAny: Object.freeze(["trailer", "preview", "review", "reaction", "podcast", "lecture", "seminar", "how to", "commercial", "music video", "gameplay", "video game", "esports", "retrospective", "history of game shows"]),
    collections: Object.freeze(["gameshows", "gameshows_miscellaneous", "game_shows", "buzzr", "classic_tv", "classic_tv_1950s", "classic_tv_1960s", "classic_tv_1970s", "classic_tv_1980s", "classic_tv_1990s", "classic_tv_2000s"]),
  }),
});

export function normalizeCanonicalItem(raw, profile) {
  const sourceIdentifier = text(raw.archiveId || raw.sourceIdentifier || raw.identifier || raw.id);
  const file = text(raw.file || raw.sourceFile || "");
  const title = text(raw.canonicalTitle || raw.title || raw.name || sourceIdentifier);
  const year = parseYear(raw.year || raw.date || title);
  const runtimeSeconds = parseRuntime(raw.runtimeSeconds || raw.durationSeconds || raw.duration || raw.runtime);
  const collection = firstSpecificCollection(raw.collection || raw.collections);
  const description = text(raw.description);
  const subject = arrayText(raw.subject || raw.subjects);
  const tags = arrayText(raw.tags);
  const mediaUrl = text(raw.mediaUrl || raw.url || "");
  const programId = text(raw.programId || `ia:${sourceIdentifier}${file ? `::${file}` : ""}`);
  const familyKey = text(raw.familyKey || raw.seriesTitle || raw.series || collection || sourceIdentifier).toLowerCase();
  return {
    programId,
    id: programId,
    identifier: programId,
    archiveId: sourceIdentifier,
    file,
    canonicalTitle: title,
    title,
    seriesTitle: text(raw.seriesTitle || raw.series || ""),
    year,
    decade: decadeFor(year),
    runtimeSeconds,
    duration: runtimeSeconds || null,
    runtime: runtimeSeconds || null,
    collection,
    familyKey,
    description,
    subject,
    tags,
    genres: arrayText(raw.genres),
    mediaUrl,
    media: { type: "video", url: mediaUrl },
    url: mediaUrl,
    sourceUrl: text(raw.sourceUrl || (sourceIdentifier ? `https://archive.org/details/${encodeURIComponent(sourceIdentifier)}` : "")),
    provider: "Internet Archive",
    rights: text(raw.rights || raw.license),
    playability: text(raw.playability || "verified"),
    family: familyKey,
    profileKey: profile?.profileKey || text(raw.profileKey),
    metadataVersion: IA_CANONICAL_SCHEMA_VERSION,
  };
}

export function canonicalItemAccepted(item, profile) {
  if (!profile || !item || !item.programId || !item.mediaUrl) return false;
  if (!item.runtimeSeconds || item.runtimeSeconds < profile.minRuntimeSeconds || item.runtimeSeconds > profile.maxRuntimeSeconds) return false;
  if (!Number.isFinite(Number(item.year)) || item.year < profile.era[0] || item.year > profile.era[1]) return false;
  const haystack = haystackFor(item);
  if (containsAny(haystack, profile.excludeAny)) return false;
  if (profile.includeAny?.length && !containsAny(haystack, profile.includeAny)) return false;
  if (profile.titleAny?.length && !containsAny([item.title, item.seriesTitle].join(" ").toLowerCase(), profile.titleAny)) return false;
  return true;
}

function targetForDecade(profile, decade) {
  return Number(profile.decadeTargets?.[decade] || 0);
}

export function buildCanonicalManifest(profile, rawItems, generatedAt = new Date().toISOString()) {
  const normalized = (Array.isArray(rawItems) ? rawItems : [])
    .map((item) => normalizeCanonicalItem(item, profile))
    .filter((item) => canonicalItemAccepted(item, profile));
  const unique = new Map();
  for (const item of normalized) {
    const existing = unique.get(item.programId);
    if (!existing || item.runtimeSeconds > existing.runtimeSeconds) unique.set(item.programId, item);
  }
  const pool = Array.from(unique.values());
  const collectionCounts = new Map();
  const familyCounts = new Map();
  const decadeCounts = new Map();
  const selected = [];
  const ordered = [...pool].sort((a, b) => (targetForDecade(profile, b.decade) - targetForDecade(profile, a.decade)) || (b.runtimeSeconds - a.runtimeSeconds) || a.title.localeCompare(b.title));
  const desired = Math.min(profile.targetCatalog || 96, ordered.length);
  const canAdd = (item, relax = false) => {
    const collectionCount = collectionCounts.get(item.collection || item.archiveId) || 0;
    const familyCount = familyCounts.get(item.familyKey || item.programId) || 0;
    if (!relax && collectionCount >= profile.maxPerCollection) return false;
    if (!relax && familyCount >= profile.maxPerFamily) return false;
    return true;
  };
  const add = (item) => {
    selected.push(item);
    collectionCounts.set(item.collection || item.archiveId, (collectionCounts.get(item.collection || item.archiveId) || 0) + 1);
    familyCounts.set(item.familyKey || item.programId, (familyCounts.get(item.familyKey || item.programId) || 0) + 1);
    decadeCounts.set(item.decade, (decadeCounts.get(item.decade) || 0) + 1);
  };
  for (const item of ordered) {
    if (selected.length >= desired) break;
    const target = targetForDecade(profile, item.decade);
    const currentShare = selected.length ? (decadeCounts.get(item.decade) || 0) / selected.length : 0;
    if (target > 0 && currentShare > target + 0.12) continue;
    if (canAdd(item)) add(item);
  }
  if (selected.length < desired) {
    for (const item of ordered) {
      if (selected.length >= desired || selected.some((candidate) => candidate.programId === item.programId)) continue;
      if (canAdd(item, true)) add(item);
    }
  }
  return {
    schemaVersion: IA_CANONICAL_SCHEMA_VERSION,
    profileKey: profile.profileKey,
    channel: profile.channel,
    name: profile.name,
    source: profile.source,
    generatedAt,
    rules: {
      era: profile.era,
      minRuntimeSeconds: profile.minRuntimeSeconds,
      maxRuntimeSeconds: profile.maxRuntimeSeconds,
      maxPerCollection: profile.maxPerCollection,
      maxPerFamily: profile.maxPerFamily,
      decadeTargets: profile.decadeTargets,
      freshness: "persistent-ledger-with-exhaustion-repeat",
    },
    catalogDepth: selected.length,
    minCatalog: profile.minCatalog,
    verified: selected.length >= profile.minCatalog,
    items: selected,
    decadeCounts: Object.fromEntries([...decadeCounts.entries()].sort((a, b) => a[0] - b[0])),
  };
}

export function toQueueItem(item) {
  return {
    ...item,
    genreVerified: true,
    canonical: true,
    media: { type: "video", url: item.mediaUrl },
    type: "video",
    url: item.mediaUrl,
    sourceUrl: item.sourceUrl,
    duration: item.runtimeSeconds || null,
    runtime: item.runtimeSeconds || null,
  };
}

export function selectCanonicalItems(manifest, recentIds = [], count = 3, rotation = 0) {
  const catalog = Array.isArray(manifest?.items) ? manifest.items : [];
  const wanted = Math.max(1, Math.min(5, Number(count) || 3));
  const recent = new Set((Array.isArray(recentIds) ? recentIds : []).map((id) => String(id || "").trim()).filter(Boolean));
  const unseen = catalog.filter((item) => !recent.has(item.programId));
  const pool = unseen.length ? unseen : catalog;
  const start = pool.length ? Math.abs(Number(rotation) || 0) % pool.length : 0;
  const items = [];
  for (let offset = 0; offset < pool.length && items.length < wanted; offset += 1) items.push(toQueueItem(pool[(start + offset) % pool.length]));
  return {
    items,
    candidateItems: catalog.map(toQueueItem),
    catalogDepth: catalog.length,
    unseenCount: unseen.length,
    seenCount: Math.max(0, catalog.length - unseen.length),
    catalogExhausted: catalog.length > 0 && unseen.length === 0,
    repeatAllowed: catalog.length > 0 && unseen.length === 0,
    cursor: start,
  };
}

export function canonicalGuide(manifest, recentIds = [], limit = 8) {
  const selection = selectCanonicalItems(manifest, recentIds, Math.max(2, Math.min(20, Number(limit) || 8)), 0);
  return {
    current: selection.items[0] || null,
    next: selection.items[1] || null,
    items: selection.items,
    catalogDepth: selection.catalogDepth,
    unseenCount: selection.unseenCount,
    seenCount: selection.seenCount,
    catalogExhausted: selection.catalogExhausted,
    repeatAllowed: selection.repeatAllowed,
  };
}
