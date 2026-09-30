/* Sharded public request budgets for the API.
 *
 * One Durable Object is addressed per client+route key, so normal viewers do
 * not contend on a global limiter. The counter lives in SQLite-backed DO
 * storage and therefore survives isolate eviction while keeping the hot path
 * small and deterministic.
 */

export class EdgeRateLimiter {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS request_buckets (
          bucket_key TEXT PRIMARY KEY,
          started_at INTEGER NOT NULL,
          count INTEGER NOT NULL
        )
      `);
    });
  }

  async fetch(request) {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    let body;
    try { body = await request.json(); } catch (_) { return Response.json({ error: "invalid rate-limit payload" }, { status: 400 }); }
    const windowMs = Math.max(1_000, Math.min(3_600_000, Number(body && body.windowMs) || 60_000));
    const max = Math.max(1, Math.min(10_000, Number(body && body.max) || 1));
    const now = Date.now();
    const key = String(body && body.bucketKey || "default").slice(0, 160);
    const current = this.ctx.storage.sql.exec(
      "SELECT started_at, count FROM request_buckets WHERE bucket_key = ?",
      key,
    ).toArray()[0];
    const expired = !current || now - Number(current.started_at) >= windowMs;
    const startedAt = expired ? now : Number(current.started_at);
    const count = expired ? 1 : Number(current.count || 0) + 1;
    this.ctx.storage.sql.exec(
      "INSERT INTO request_buckets(bucket_key, started_at, count) VALUES (?, ?, ?) ON CONFLICT(bucket_key) DO UPDATE SET started_at=excluded.started_at, count=excluded.count",
      key,
      startedAt,
      count,
    );
    const allowed = count <= max;
    const retryAfterSeconds = Math.max(1, Math.ceil((startedAt + windowMs - now) / 1000));
    return Response.json({ allowed, count, max, retryAfterSeconds }, {
      status: allowed ? 200 : 429,
      headers: allowed ? {} : { "Retry-After": String(retryAfterSeconds) },
    });
  }
}
