/* Per-session rotation state for the Version 2 API. A session+channel is the
 * coordination atom; one viewer's Next action cannot consume another's. */
import { normalizeIaFileRecord, qualifyIaFileRecord } from './ia_file_contract.js';
import { handleIaOwnedState, readIaChunkedState, writeIaChunkedState } from './ia_durable_state.js';

/* Keep enough verified candidates in the session shelf that a fresh tune is
 * not forced back onto the same five rows. The public player still receives a
 * small immediate shelf; this is only the hidden rotation window. */
const MAX_SEEN = 1024;
const MAX_ITEMS = 96;
const MAX_RESERVATION_ITEMS = 1024;

function itemId(item) {
  const value = item && (item.identifier || item.id || (item.media && item.media.url));
  return String(value || "").trim().slice(0, 500);
}

function cleanItems(items, limit = MAX_ITEMS) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const id = itemId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

function mergeCatalog(existing, incoming, seenIds, limit = MAX_ITEMS) {
  const played = new Set(Array.isArray(seenIds) ? seenIds : []);
  const merged = [];
  const positions = new Map();
  for (const item of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    const id = itemId(item);
    if (!id) continue;
    if (positions.has(id)) {
      const index = positions.get(id), previous = merged[index];
      const known = Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined && value !== null && value !== ""));
      merged[index] = { ...previous, ...known };
      if (previous.media || item.media) merged[index].media = { ...previous.media, ...item.media };
      continue;
    }
    positions.set(id, merged.length);
    merged.push(item);
  }
  if (merged.length <= limit) return merged;
  /* Keep the session catalog stable, but make room for newly discovered rows
     by evicting played entries before unseen ones. This preserves the union
     of the active upstream windows without letting the DO grow unbounded. */
  const unseen = merged.filter((item) => !played.has(itemId(item)));
  const playedItems = merged.filter((item) => played.has(itemId(item)));
  return unseen.concat(playedItems).slice(0, limit);
}

function rotate(items, offset) {
  if (items.length < 2) return items;
  const start = Math.abs(Number(offset) || 0) % items.length;
  return items.slice(start).concat(items.slice(0, start));
}

function familyId(item) {
  return String(item.seriesId || item.seriesTitle || item.family || item.sourceIdentifier || itemId(item).split("::")[0]);
}

function episodeKey(item) {
  return normalizeIaFileRecord(typeof item === 'string' ? { identifier: item } : item).logicalId;
}

function reservationCatalog(existing, incoming, seen) {
  const rows = mergeCatalog(existing, incoming, seen, MAX_RESERVATION_ITEMS), positions = new Map(), result = [];
  for (const item of rows) {
    const key = episodeKey(item);
    if (positions.has(key)) {
      // Keep one complete encoding record; never graft another file's identity onto its URL.
      const index = positions.get(key);
      if (Number(item.media && item.media.verifiedAt) > Number(result[index].media && result[index].media.verifiedAt)) result[index] = item;
    } else { positions.set(key, result.length); result.push(item); }
  }
  return result;
}

/* Apply editorial balance to the small shelf, never to the stored inventory.
   A sparse family pool may relax the cap only after all other families get a
   turn; the result explicitly reports that constrained condition. */
function appendBalanced(selected, pool, count, diversity = {}) {
  const ids = new Set(selected.map(itemId)), families = new Map();
  selected.forEach(item => families.set(familyId(item), (families.get(familyId(item)) || 0) + 1));
  const cap = Math.max(1, Math.min(count, Number(diversity.maxPerFamily) || count));
  let relaxed = false;
  for (const loosen of [false, true]) {
    for (const item of pool) {
      if (selected.length >= count) return relaxed;
      const id = itemId(item), family = familyId(item);
      if (ids.has(id) || (!loosen && (families.get(family) || 0) >= cap)) continue;
      if (loosen && (families.get(family) || 0) >= cap) relaxed = true;
      selected.push(item); ids.add(id); families.set(family, (families.get(family) || 0) + 1);
    }
  }
  return relaxed;
}

export class SessionRotation {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async state(limit = MAX_ITEMS) {
    const value = (limit === MAX_RESERVATION_ITEMS && await readIaChunkedState(this.ctx.storage, 'ia-reservation')) || await this.ctx.storage.get("rotation");
    if (!value || typeof value !== "object") return { version: 2, catalog: [], seen: [], cursor: 0, updatedAt: 0 };
    return {
      version: 2,
      catalog: cleanItems(value.catalog, limit),
      seen: Array.isArray(value.seen) ? value.seen.filter(Boolean).slice(-MAX_SEEN) : [],
      cursor: Number(value.cursor) || 0,
      cycleGeneration: Number(value.cycleGeneration) || 0,
      updatedAt: Number(value.updatedAt) || 0,
      reserved: Array.isArray(value.reserved) ? value.reserved.slice(0, 5) : [],
      cooldowns: value.cooldowns && typeof value.cooldowns === "object" ? value.cooldowns : {},
      playing: String(value.playing || ""),
    };
  }

  async fetch(request) {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    let body;
    try { body = await request.json(); } catch (_) { return Response.json({ error: "invalid rotation payload" }, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "invalid rotation payload" }, { status: 400 });
    if (body.mode === 'ia-state') return handleIaOwnedState(this.ctx, body);
    if (["reserve", "commit", "release", "peek"].includes(body.mode)) {
      const run = () => this.reservation(body);
      return this.ctx.blockConcurrencyWhile ? this.ctx.blockConcurrencyWhile(run) : run();
    }
    const rawCandidates = cleanItems(body && body.items);
    const recent = new Set((Array.isArray(body && body.recentIds) ? body.recentIds : [])
      .map((value) => String(value || "").trim().slice(0, 500))
      .filter(Boolean)
      .slice(-48));
    const current = await this.state();
    const catalog = mergeCatalog(current.catalog, rawCandidates, current.seen);
    const prior = new Set(current.seen);
    const globallyFresh = recent.size ? catalog.filter((item) => !recent.has(itemId(item))) : catalog;
    const sessionFresh = globallyFresh.filter((item) => !prior.has(itemId(item)));
    /* Prefer rows outside the cross-session freshness window, but fall back to
       any session-unseen row before resetting. The pool is the persisted union,
       not the latest upstream shelf, so changing relay pages cannot replay an
       item that this session has already consumed. */
    const alternateSessionFresh = catalog.filter((item) => !prior.has(itemId(item)));
    const candidates = cleanItems([...sessionFresh, ...alternateSessionFresh]);
    let fresh = candidates;
    let cycleReset = false;
    if (!fresh.length && catalog.length) { fresh = catalog; cycleReset = true; }
    const limit = Math.max(1, Math.min(5, Number(body && body.count) || 3));
    /* When a catalog is genuinely exhausted, begin the new cycle at a shelf
       boundary. Advancing by one record here made the first post-exhaustion
       shelf overlap the tail of the previous cycle, even though repeats were
       correctly allowed at that point. Keep the normal cursor behavior for
       unseen material; only the reset path needs a full-shelf step. */
    const offset = cycleReset ? current.cursor * limit : current.cursor;
    const nonrecent = fresh.filter(item => !recent.has(itemId(item)));
    const recentOnly = fresh.filter(item => recent.has(itemId(item)));
    const ordered = rotate(nonrecent, offset).concat(rotate(recentOnly, offset));
    const selected = ordered.slice(0, limit);
    const selectedIds = selected.map(itemId).filter(Boolean);
    const selectionRepeatIds = cycleReset ? [] : selectedIds.filter((id) => prior.has(id));
    const seenAfterSelection = new Set(cycleReset ? selectedIds : current.seen.concat(selectedIds));
    const seenInCatalogBeforeSelection = catalog.filter((item) => prior.has(itemId(item))).length;
    const unseenAfterSelection = catalog.filter((item) => !seenAfterSelection.has(itemId(item))).length;
    const seenInCatalog = catalog.length - unseenAfterSelection;
    const next = {
      version: 2,
      catalog,
      seen: (cycleReset ? selectedIds : current.seen.concat(selectedIds)).slice(-MAX_SEEN),
      cursor: current.cursor + 1,
      updatedAt: Date.now(),
    };
    await this.ctx.storage.put("rotation", next);
    return Response.json({
      items: selected,
      catalog,
      cursor: next.cursor,
      cycleReset,
      seen: next.seen.length,
      catalogSize: catalog.length,
      catalogAdded: Math.max(0, catalog.length - current.catalog.length),
      unseen: unseenAfterSelection,
      exhaustion: {
        catalogSize: catalog.length,
        seenInCatalog,
        seenInCatalogBeforeSelection,
        unseenBeforeSelection: cycleReset ? 0 : fresh.length,
        unseenAfterSelection,
        catalogExhausted: cycleReset,
        cycleReset,
        repeatAllowed: cycleReset,
      },
      selectionRepeatIds,
    });
  }

  async reservation(body) {
    const current = await this.state(MAX_RESERVATION_ITEMS);
    const rejected = new Set((body.rejectedIds || []).map(episodeKey));
    const qualified = item => !rejected.has(episodeKey(item)) && (!body.rules || qualifyIaFileRecord(item, body.rules).accepted);
    const catalog = reservationCatalog(current.catalog.filter(qualified), cleanItems(body.items, MAX_RESERVATION_ITEMS).filter(qualified), current.seen);
    const ids = new Set(catalog.map(itemId)), now = Date.now();
    const seen = new Set(current.seen);
    let seenEpisodes = new Set(current.seen.map(episodeKey));
    const hasSeen = id => seenEpisodes.has(episodeKey(id));
    const cooldowns = Object.fromEntries(Object.entries(current.cooldowns || {}).filter(([, until]) => Number(until) > now).map(([id, until]) => [episodeKey(id), until]));
    let reserved = (current.reserved || []).map(id => catalog.find(item => episodeKey(item) === episodeKey(id))).filter(Boolean).map(itemId)
      .filter(id => ids.has(id) && episodeKey(id) !== episodeKey(current.playing) && !hasSeen(id) && !cooldowns[episodeKey(id)]);
    const requestedId = String(body.id || "").trim().slice(0, 500);
    const id = catalog.find(item => episodeKey(item) === episodeKey(requestedId))?.identifier || requestedId;
    let committed = false;
    if (body.mode === "commit" || body.mode === "release") {
      if (!id || !ids.has(id)) return Response.json({ error: "unknown program identity" }, { status: 400 });
      reserved = reserved.filter(value => value !== id);
      if (body.mode === "commit") {
        committed = !hasSeen(id);
        seen.add(id);
        seenEpisodes.add(episodeKey(id));
        current.playing = body.event === "completed" || body.event === "skipped" ? "" : id;
      } else {
        cooldowns[episodeKey(id)] = now + 5 * 60_000;
        if (current.playing === id) current.playing = "";
      }
    }
    const count = Math.max(1, Math.min(5, Number(body.count) || 3));
    const recent = new Set((Array.isArray(body.recentIds) ? body.recentIds : []).map(episodeKey));
    const eligible = catalog.filter(item => episodeKey(item) !== episodeKey(current.playing) && !cooldowns[episodeKey(item)]);
    let fresh = eligible.filter(item => !hasSeen(itemId(item)));
    const cycleReset = body.mode === "reserve" && !fresh.length && eligible.length > 0;
    const cycleGeneration = (current.cycleGeneration || 0) + (cycleReset ? 1 : 0);
    if (cycleReset) { seen.clear(); seenEpisodes.clear(); fresh = eligible; reserved = []; }
    const selected = reserved.map(id => catalog.find(item => itemId(item) === id)).filter(Boolean);
    let relaxed = false;
    if (body.mode === "reserve") {
      const offset = current.cursor || Number(body.rotation) || 0;
      relaxed = appendBalanced(selected, rotate(fresh.filter(item => !recent.has(episodeKey(item))), offset), count, body.diversity);
      if (selected.length < count) relaxed = appendBalanced(selected, rotate(fresh.filter(item => recent.has(episodeKey(item))), offset), count, body.diversity) || relaxed;
      reserved = selected.map(itemId);
    }
    const next = { version: 3, catalog, seen: [...seen].slice(-MAX_RESERVATION_ITEMS), reserved,
      cooldowns, playing: current.playing || "", cursor: current.cursor + (committed ? 1 : 0), cycleGeneration, updatedAt: now };
    if (body.mode !== "peek") {
      const write = storage => writeIaChunkedState(storage, 'ia-reservation', next);
      await this.ctx.storage.transaction(write);
    }
    const unseen = catalog.filter(item => !hasSeen(itemId(item))).length;
    return Response.json({ items: selected.slice(0, count), catalog, cursor: next.cursor, cycleReset, cycleGeneration,
      seen: seen.size, seenIds: next.seen, cooldownIds: Object.keys(cooldowns), reservationIds: reserved, reserved: reserved.length, playing: next.playing, catalogSize: catalog.length,
      catalogAdded: Math.max(0, catalog.length - current.catalog.length), unseen,
      diversityRelaxed: relaxed, committed, selectionRepeatIds: [],
      exhaustion: { catalogSize: catalog.length, seenInCatalog: catalog.length - unseen,
        unseenBeforeSelection: fresh.length, unseenAfterSelection: unseen,
        catalogExhausted: cycleReset, cycleReset, repeatAllowed: cycleReset } });
  }
}

export { itemId, cleanItems, mergeCatalog };
