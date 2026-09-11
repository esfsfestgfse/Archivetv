/* Per-session rotation state for the Version 2 API. A session+channel is the
 * coordination atom; one viewer's Next action cannot consume another's. */

const MAX_SEEN = 256;
const MAX_ITEMS = 24;

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
    const candidates = cleanItems(body && body.items);
    const current = await this.state();
    const prior = new Set(current.seen);
    let fresh = candidates.filter((item) => !prior.has(itemId(item)));
    let cycleReset = false;
    if (!fresh.length && candidates.length) { fresh = candidates; cycleReset = true; }
    const suppliedRotation = Number(body && body.rotation);
    const ordered = rotate(fresh, Number.isFinite(suppliedRotation) ? suppliedRotation : current.cursor);
    const limit = Math.max(1, Math.min(5, Number(body && body.count) || 3));
    const selected = ordered.slice(0, limit);
    const selectedIds = selected.map(itemId).filter(Boolean);
    const next = { version: 1, seen: (cycleReset ? selectedIds : current.seen.concat(selectedIds)).slice(-MAX_SEEN), cursor: current.cursor + 1, updatedAt: Date.now() };
    await this.ctx.storage.put("rotation", next);
    return Response.json({ items: selected, cursor: next.cursor, cycleReset, seen: next.seen.length });
  }
}

export { itemId, cleanItems };
