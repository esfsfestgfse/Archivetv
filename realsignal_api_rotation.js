/* Per-session rotation state for the Version 2 API. A session+channel is the
 * coordination atom; one viewer's Next action cannot consume another's. */
import { normalizeIaFileRecord, qualifyIaFileRecord, iaKnownVideoPolicyViolation, iaSportingLifeAllowed, iaCourtroomAllowed, iaCookingAllowed, iaHuntingAllowed, iaReviewedFileAllowed } from './ia_file_contract.js';
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

function resolvedMedia(item) {
  return /^https?:\/\//i.test(String(item?.media?.url || item?.mediaUrl || item?.url || '').trim());
}

function mergeCatalog(existing, incoming, seenIds, limit = MAX_ITEMS, requirePlayable = false, historyIdentity = itemId) {
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
  const unseen = merged.filter((item) => !played.has(historyIdentity(item)));
  const playedItems = merged.filter((item) => played.has(historyIdentity(item)));
  // Pending discovery cannot occupy every bounded rotation slot while a
  // resolved first-play item waits outside the window. D1 keeps the full index.
  if (requirePlayable) return [...unseen.filter(resolvedMedia), ...playedItems.filter(resolvedMedia),
    ...unseen.filter(item => !resolvedMedia(item)), ...playedItems.filter(item => !resolvedMedia(item))].slice(0, limit);
  return unseen.concat(playedItems).slice(0, limit);
}

function rotate(items, offset) {
  if (items.length < 2) return items;
  const start = Math.abs(Number(offset) || 0) % items.length;
  return items.slice(start).concat(items.slice(0, start));
}

function normalizedFamily(value) {
  return String(value || "")
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function familyId(item) {
  const source = item.sourceIdentifier || itemId(item).split("::")[0];
  const explicit = item.seriesTitle || item.family || item.seriesId;
  const title = String(item.title || "").trim();
  const gameTitle = normalizedFamily(title).replace(/^the /, '');
  if (/^(?:\d+ )*pyramid(?: |$)/.test(gameTitle)) return 'pyramid';
  const gameShow = gameTitle.match(/^(what s my line|to tell the truth|i ve got a secret|beat the clock|price is right|family feud|match game|password plus|super password|password|card sharks|press your luck|wheel of fortune|jeopardy|supermarket sweep|weakest link|figure it out|family game night|nickelodeon guts|divided|crystal maze|hollywood squares|newlywed game|let s make a deal|sale of the century|tic tac dough|joker s wild|concentration|you bet your life|queen for a day|strike it rich|treasure hunt|truth or consequences|do you trust your wife)(?: |$)/);
  if (gameShow) return gameShow[1];
  const titleParts = title.split(/\s+[·—]\s+/, 2);
  // Re-score old guest-based labels using the host title, not episode guests.
  const televisionShow = normalizedFamily(titleParts[0]).match(/\b(jack benny|burns and allen|i love lucy|honeymooners|dick van dyke|mary tyler moore|andy griffith|leave it to beaver|green acres|addams family|munsters|bewitched|i dream of jeannie|get smart|clutch cargo|space angel|top cat|pink panther show|new scooby doo movies|scooby doo show|flintstones|jetsons)\b/);
  if (televisionShow) return televisionShow[1];
  const titleFamily = titleParts.length > 1 && titleParts[0].trim().length >= 3 ? titleParts[0].trim() : "";
  /* Archive commonly copies each upload identifier into `seriesId`, which
     makes three episodes of the same show look like three unrelated families.
     When that synthetic value matches the source identifier, prefer the
     editorial series prefix already present in our normalized display title. */
  const explicitIsUploadId = explicit && normalizedFamily(explicit) === normalizedFamily(source);
  return normalizedFamily(titleFamily && (!explicit || explicitIsUploadId) ? titleFamily : (explicit || titleFamily || source));
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
function appendBalanced(selected, pool, count, diversity = {}, allowRelaxation = true) {
  const ids = new Set(selected.map(itemId)), families = new Map();
  selected.forEach(item => families.set(familyId(item), (families.get(familyId(item)) || 0) + 1));
  const cap = Math.max(1, Math.min(count, Number(diversity.maxPerFamily) || count));
  let relaxed = false;
  for (const loosen of allowRelaxation ? [false, true] : [false]) {
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

  async state(limit = MAX_ITEMS, requirePlayable = false) {
    const prefix = limit === MAX_RESERVATION_ITEMS ? 'ia-reservation' : requirePlayable ? 'ia-rotation' : '';
    const value = (prefix && await readIaChunkedState(this.ctx.storage, prefix)) || await this.ctx.storage.get("rotation");
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
    const allowed = item => body.requirePlayable !== true || (!iaKnownVideoPolicyViolation(item, { channel: body.stationChannel })
      && iaReviewedFileAllowed(item, body.stationChannel)
      && (String(body.stationChannel) !== '80' || iaHuntingAllowed(item))
      && (String(body.stationChannel) !== '201' || iaCookingAllowed(item))
      && (String(body.stationChannel) !== '20' || iaCourtroomAllowed(item))
      && (String(body.stationChannel) !== '65' || iaSportingLifeAllowed(item)));
    const rawCandidates = cleanItems(body && body.items).filter(allowed);
    const recent = new Set((Array.isArray(body && body.recentIds) ? body.recentIds : [])
      .map((value) => String(value || "").trim().slice(0, 500))
      .filter(Boolean)
      .slice(-48));
    const current = await this.state(MAX_ITEMS, body.requirePlayable === true);
    // Standard IA clients report actual plays separately from the hot shelf.
    // Old state counted every prefetched tail as watched and reset a 65-item
    // catalog after only ~22 viewed programs. Never inherit that queued ledger
    // when an explicit played-only history is available. Source Suite and the
    // guarded reserve/commit protocol retain their existing ownership.
    const playedOnly = body.requirePlayable === true && body.playedOnly === true && Array.isArray(body.viewerRecentIds);
    const viewerIds = playedOnly ? body.viewerRecentIds.filter(id => typeof id === 'string' && !/[\r\n]/.test(id))
      .map(id => id.trim().slice(0, 500)).filter(Boolean).slice(-256) : current.seen;
    const historyIdentity = playedOnly ? episodeKey : itemId;
    const prior = new Set(viewerIds.map(id => playedOnly ? episodeKey(id) : id));
    // Legacy playback reports may name the parent alias while this same row
    // now carries its actual file. Resolve only matching reported row IDs;
    // do not ban every unplayed sibling in that collection.
    if (playedOnly) for (const item of [...current.catalog, ...rawCandidates]) {
      if (prior.has(episodeKey(itemId(item)))) prior.add(episodeKey(item));
    }
    const catalogIdentities = new Set();
    const catalog = mergeCatalog(current.catalog.filter(allowed), rawCandidates, [...prior], MAX_ITEMS, body.requirePlayable === true, historyIdentity)
      .filter(item => {
        if (!playedOnly) return true;
        const key = historyIdentity(item);
        if (catalogIdentities.has(key)) return false;
        catalogIdentities.add(key); return true;
      });
    // Keep discovery records in the durable catalog, but never select them as
    // on-air media or mark them seen while their playback URL is unresolved.
    const eligible = body.requirePlayable === true
      ? catalog.filter(resolvedMedia)
      : catalog;
    const globallyFresh = recent.size ? eligible.filter((item) => !recent.has(itemId(item))) : eligible;
    const sessionFresh = globallyFresh.filter((item) => !prior.has(historyIdentity(item)));
    /* Prefer rows outside the cross-session freshness window, but fall back to
       any session-unseen row before resetting. The pool is the persisted union,
       not the latest upstream shelf, so changing relay pages cannot replay an
       item that this session has already consumed. */
    const alternateSessionFresh = eligible.filter((item) => !prior.has(historyIdentity(item)));
    const candidates = cleanItems([...sessionFresh, ...alternateSessionFresh]);
    let fresh = candidates;
    let cycleReset = false;
    if (!fresh.length && eligible.length) { fresh = eligible; cycleReset = true; }
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
    const balanceFamilies = body.requirePlayable === true && Number(body.diversity?.maxPerFamily) > 0;
    const selected = balanceFamilies ? [] : ordered.slice(0, limit);
    if (balanceFamilies) appendBalanced(selected, ordered, limit, body.diversity);
    const selectedIds = selected.map(itemId).filter(Boolean);
    const selectionRepeatIds = cycleReset ? [] : selectedIds.filter((id) => prior.has(playedOnly ? episodeKey(id) : id));
    const seenAfterSelection = new Set(playedOnly ? [...prior] : cycleReset ? selectedIds : current.seen.concat(selectedIds));
    const seenInCatalogBeforeSelection = eligible.filter((item) => prior.has(historyIdentity(item))).length;
    const unseenAfterSelection = eligible.filter((item) => !seenAfterSelection.has(historyIdentity(item))).length;
    const seenInCatalog = eligible.length - unseenAfterSelection;
    const next = {
      version: 2,
      catalog,
      seen: (playedOnly ? viewerIds : cycleReset ? selectedIds : current.seen.concat(selectedIds)).slice(-MAX_SEEN),
      cursor: current.cursor + 1,
      updatedAt: Date.now(),
    };
    if (body.requirePlayable === true && (new TextEncoder().encode(JSON.stringify(next)).length >= 120_000
      || await this.ctx.storage.get('ia-rotation:index'))) {
      await this.ctx.storage.transaction(storage => writeIaChunkedState(storage, 'ia-rotation', next));
    } else await this.ctx.storage.put("rotation", next);
    return Response.json({
      items: selected,
      catalog,
      cursor: next.cursor,
      cycleReset,
      seen: next.seen.length,
      catalogSize: catalog.length,
      catalogAdded: Math.max(0, catalog.length - current.catalog.length),
      ...(body.requirePlayable === true ? { playableCatalogSize: eligible.length, pendingCatalogSize: catalog.length - eligible.length } : {}),
      unseen: unseenAfterSelection,
      exhaustion: {
        catalogSize: catalog.length,
        ...(body.requirePlayable === true ? { scope: 'resolved-session-window', playableCatalogSize: eligible.length, pendingCatalogSize: catalog.length - eligible.length } : {}),
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
    // Older shelves used a bare Archive parent ID even after resolving a file.
    // Preserve that exact episode when later discovery upgrades it to parent::file.
    const canonicalIds = new Map([...current.catalog, ...catalog].map(item => {
      const record = normalizeIaFileRecord(item);
      return [itemId(item), record.fileName ? record.sourceIdentifier + '::' + record.fileName : itemId(item)];
    }));
    const canonicalId = id => canonicalIds.get(id) || id;
    const seen = new Set(current.seen.map(canonicalId));
    let seenEpisodes = new Set([...seen].map(episodeKey));
    const hasSeen = id => seenEpisodes.has(episodeKey(canonicalId(id)));
    const cooldowns = Object.fromEntries(Object.entries(current.cooldowns || {}).filter(([, until]) => Number(until) > now).map(([id, until]) => [episodeKey(canonicalId(id)), until]));
    let reserved = (current.reserved || []).map(id => catalog.find(item => episodeKey(item) === episodeKey(id))).filter(Boolean).map(itemId)
      .filter(id => ids.has(id) && episodeKey(canonicalId(id)) !== episodeKey(canonicalId(current.playing)) && !hasSeen(id) && !cooldowns[episodeKey(canonicalId(id))]);
    const requestedId = String(body.id || "").trim().slice(0, 500);
    const id = catalog.find(item => episodeKey(item) === episodeKey(requestedId))?.identifier || requestedId;
    let committed = false;
    if (body.mode === "commit" || body.mode === "release") {
      // The bounded catalog can evict an already played episode while a large
      // collection is imported. Its terminal acknowledgement is still owned by
      // this session's durable seen ledger. Rejecting it poisons the client's
      // ordered outbox, so every later refill retries the same 400 forever.
      // This is acknowledgement only: it cannot admit or start unknown media.
      const terminal = body.mode === "commit" && (body.event === "completed" || body.event === "skipped");
      if (!id || !ids.has(id) && !(terminal && hasSeen(id))) return Response.json({ error: "unknown program identity" }, { status: 400 });
      reserved = reserved.filter(value => value !== id);
      if (body.mode === "commit") {
        committed = !hasSeen(id);
        seen.add(canonicalId(id));
        seenEpisodes.add(episodeKey(canonicalId(id)));
        if (!terminal) current.playing = id;
        else if (episodeKey(canonicalId(current.playing)) === episodeKey(canonicalId(id))) current.playing = "";
      } else {
        cooldowns[episodeKey(canonicalId(id))] = now + 5 * 60_000;
        if (current.playing === id) current.playing = "";
      }
    }
    const count = Math.max(1, Math.min(5, Number(body.count) || 3));
    const recent = new Set((Array.isArray(body.recentIds) ? body.recentIds : []).map(id => episodeKey(canonicalId(id))));
    const eligible = catalog.filter(item => episodeKey(item) !== episodeKey(canonicalId(current.playing)) && !cooldowns[episodeKey(item)]);
    let fresh = eligible.filter(item => !hasSeen(itemId(item)));
    /* Exact-episode freshness is necessary but not sufficient for television.
       A 500-item catalog can still feel repetitive when the next shelf chooses
       another Jack Benny episode while dozens of entirely unseen shows remain.
       Derive show history from committed items and exhaust unseen families
       before returning to a different episode of a recently played series.
       Reservations are deliberately excluded: preload alone is not a watch. */
    const catalogByEpisode = new Map(catalog.map(item => [episodeKey(item), item]));
    const seenFamilies = new Set([...seen].map(id => catalogByEpisode.get(episodeKey(id))).filter(Boolean).map(familyId));
    const cycleReset = body.mode === "reserve" && !fresh.length && eligible.length > 0;
    const cycleGeneration = (current.cycleGeneration || 0) + (cycleReset ? 1 : 0);
    if (cycleReset) { seen.clear(); seenEpisodes.clear(); fresh = eligible; reserved = []; }
    const selected = reserved.map(id => catalog.find(item => itemId(item) === id)).filter(Boolean);
    let relaxed = false;
    if (body.mode === "reserve") {
      const offset = current.cursor || Number(body.rotation) || 0;
      const unseenFamilies = fresh.filter(item => !seenFamilies.has(familyId(item)));
      const repeatFamilies = fresh.filter(item => seenFamilies.has(familyId(item)));
      const pools = [
        unseenFamilies.filter(item => !recent.has(episodeKey(item))),
        unseenFamilies.filter(item => recent.has(episodeKey(item))),
        repeatFamilies.filter(item => !recent.has(episodeKey(item))),
        repeatFamilies.filter(item => recent.has(episodeKey(item))),
      ].map(pool => rotate(pool, offset));
      // Priority does not waive diversity. Try every eligible series before
      // filling duplicate-series slots from a genuinely constrained catalog.
      for (const pool of pools) {
        if (selected.length >= count) break;
        appendBalanced(selected, pool, count, body.diversity, false);
      }
      if (selected.length < count) relaxed = appendBalanced(selected, pools.flat(), count, body.diversity);
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
