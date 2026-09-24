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

function rotate(items, offset) {
  if (items.length < 2) return items;
  const start = Math.abs(Number(offset) || 0) % items.length;
  return items.slice(start).concat(items.slice(0, start));
}

export class SessionRotation {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async state() {
    const value = await this.ctx.storage.get("rotation");
    if (!value || typeof value !== "object") return { version: 1, seen: [], cursor: 0, updatedAt: 0 };
    return { version: 1, seen: Array.isArray(value.seen) ? value.seen.filter(Boolean).slice(-MAX_SEEN) : [], cursor: Number(value.cursor) || 0, updatedAt: Number(value.updatedAt) || 0 };
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
    const freshCandidates = recent.size ? rawCandidates.filter((item) => !recent.has(itemId(item))) : rawCandidates;
    const candidates = freshCandidates.length ? freshCandidates : rawCandidates;
    const current = await this.state();
    const prior = new Set(current.seen);
    let fresh = candidates.filter((item) => !prior.has(itemId(item)));
    let cycleReset = false;
    if (!fresh.length && candidates.length) { fresh = candidates; cycleReset = true; }
    const suppliedRotation = Number(body && body.rotation);
    const ordered = rotate(fresh, Number.isFinite(suppliedRotation) ? suppliedRotation : current.cursor);
    const limit = Math.max(1, Math.min(5, Number(body && body.count) || 3));
    const selected = ordered.slice(0, limit);
    /* A small catalog can have fewer unseen rows than a five-item TV shelf
       after a previous rotation. Fill only the missing five-item slots from
       candidates that are not in the current fresh set; because candidates
       already excludes the bounded recent window, this preserves freshness
       while avoiding a partial shelf and the resulting tuning delay. Keep
       count<5 behavior unchanged for callers that intentionally request a
       smaller shelf. */
    if (limit === 5 && selected.length < limit) {
      const selectedKeys = new Set(selected.map(itemId));
      for (const item of rotate(candidates, current.cursor + 1)) {
        const id = itemId(item);
        if (!id || selectedKeys.has(id)) continue;
        selected.push(item);
        selectedKeys.add(id);
        if (selected.length >= limit) break;
      }
    }
    const selectedIds = selected.map(itemId).filter(Boolean);
    const next = { version: 1, seen: (cycleReset ? selectedIds : current.seen.concat(selectedIds)).slice(-MAX_SEEN), cursor: current.cursor + 1, updatedAt: Date.now() };
    await this.ctx.storage.put("rotation", next);
    return Response.json({ items: selected, cursor: next.cursor, cycleReset, seen: next.seen.length });
  }
}

export { itemId, cleanItems };
