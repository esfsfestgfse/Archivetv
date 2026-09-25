/* Per-session rotation state for the Version 2 API. A session+channel is the
 * coordination atom; one viewer's Next action cannot consume another's. */

/* Keep enough verified candidates in the session shelf that a fresh tune is
 * not forced back onto the same five rows. The public player still receives a
 * small immediate shelf; this is only the hidden rotation window. */
const MAX_SEEN = 1024;
const MAX_ITEMS = 96;

function itemId(item) {
  const value = item && (item.identifier || item.id || (item.media && item.media.url));
  return String(value || "").trim().slice(0, 500);
}

function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const out = [];
  for (const item of items.slice(0, MAX_ITEMS)) {
    const id = itemId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

function mergeCatalog(existing, incoming, seenIds) {
  const played = new Set(Array.isArray(seenIds) ? seenIds : []);
  const merged = [];
  const seen = new Set();
  for (const item of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    const id = itemId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(item);
  }
  if (merged.length <= MAX_ITEMS) return merged;
  /* Keep the session catalog stable, but make room for newly discovered rows
     by evicting played entries before unseen ones. This preserves the union
     of the active upstream windows without letting the DO grow unbounded. */
  const unseen = merged.filter((item) => !played.has(itemId(item)));
  const playedItems = merged.filter((item) => played.has(itemId(item)));
  return unseen.concat(playedItems).slice(0, MAX_ITEMS);
}

function rotate(items, offset) {
  if (items.length < 2) return items;
  const start = Math.abs(Number(offset) || 0) % items.length;
  return items.slice(start).concat(items.slice(0, start));
}

export class SessionRotation {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async state() {
    const value = await this.ctx.storage.get("rotation");
    if (!value || typeof value !== "object") return { version: 2, catalog: [], seen: [], cursor: 0, updatedAt: 0 };
    return {
      version: 2,
      catalog: cleanItems(value.catalog),
      seen: Array.isArray(value.seen) ? value.seen.filter(Boolean).slice(-MAX_SEEN) : [],
      cursor: Number(value.cursor) || 0,
      updatedAt: Number(value.updatedAt) || 0,
    };
  }

  async fetch(request) {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    let body;
    try { body = await request.json(); } catch (_) { return Response.json({ error: "invalid rotation payload" }, { status: 400 }); }
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
    const ordered = rotate(fresh, current.cursor);
    const limit = Math.max(1, Math.min(5, Number(body && body.count) || 3));
    const selected = ordered.slice(0, limit);
    const selectedIds = selected.map(itemId).filter(Boolean);
    const seenAfterSelection = new Set(cycleReset ? selectedIds : current.seen.concat(selectedIds));
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
        unseenBeforeSelection: cycleReset ? 0 : fresh.length,
        unseenAfterSelection,
        catalogExhausted: cycleReset,
        cycleReset,
        repeatAllowed: cycleReset,
      },
    });
  }
}

export { itemId, cleanItems, mergeCatalog };
