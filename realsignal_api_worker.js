/**
 * RealSignal API Worker — migration façade
 *
 * This is the first Version 2 boundary. It gives desktop, mobile, Cast, and
 * future native clients one stable API while the existing relay continues to
 * own the proven upstream adapters during migration.
 *
 * The relay is reached through a Cloudflare Service Binding, never through its
 * public URL. That keeps the boundary internal and lets the catalog/queue
 * implementation move behind this contract without a client release.
 */

const API_PREFIX = "/api/v1";
const RELAY_ROUTES = new Map([
  ["/ia/search", "/ia/search"],
  ["/ia/queue", "/ia/queue"],
  ["/ia/program", "/ia/program"],
]);

function corsHeaders(contentType = "application/json; charset=utf-8") {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-RealSignal-Client",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Expose-Headers": "*",
    "Content-Type": contentType,
    "X-RealSignal-API": "v1",
  };
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), ...extra },
  });
}

function apiRoute(pathname) {
  if (pathname === `${API_PREFIX}/health`) return { kind: "health" };
  for (const [suffix, relayPath] of RELAY_ROUTES) {
    if (pathname === `${API_PREFIX}${suffix}`) return { kind: "relay", relayPath };
  }
  if (pathname.startsWith(`${API_PREFIX}/ia/metadata/`)) {
    const id = pathname.slice(`${API_PREFIX}/ia/metadata/`.length);
    return id ? { kind: "relay", relayPath: `/ia/metadata/${id}` } : null;
  }
  return null;
}

async function relayRequest(request, relayPath) {
  const source = new URL(request.url);
  const target = new URL(source.origin);
  target.pathname = relayPath;
  target.search = source.search;
  /* Queue/program requests are bounded JSON control payloads. Materialize
     only this small contract so the Service Binding works consistently across
     Workers and local Fetch implementations without forwarding a live body
     stream that requires runtime-specific duplex flags. */
  let body;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.arrayBuffer();
    if (body.byteLength > 131072) throw new Error("API request body exceeds 128 KiB");
  }
  return new Request(target, {
    method: request.method,
    headers: request.headers,
    body,
  });
}

async function forwardToRelay(request, env, relayPath) {
  if (!env.RELAY || typeof env.RELAY.fetch !== "function") {
    return json({ error: "RealSignal API relay binding is not configured" }, 503, {
      "Cache-Control": "no-store",
    });
  }
  let upstream;
  try {
    upstream = await env.RELAY.fetch(await relayRequest(request, relayPath));
  } catch (error) {
    console.warn(JSON.stringify({
      event: "api-relay-forward-failed",
      route: relayPath,
      message: String(error && error.message || error).slice(0, 180),
    }));
    return json({ error: "RealSignal API relay unavailable" }, 502, { "Cache-Control": "no-store" });
  }
  const headers = new Headers(upstream.headers);
  for (const [key, value] of Object.entries(corsHeaders(headers.get("content-type") || "application/json; charset=utf-8"))) headers.set(key, value);
  headers.set("X-RealSignal-API", "v1");
  headers.set("X-RealSignal-Upstream-Status", String(upstream.status));
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders("text/plain; charset=utf-8") });
    if (request.method !== "GET" && request.method !== "POST") return json({ error: "method not allowed" }, 405, { Allow: "GET,POST,OPTIONS" });

    const route = apiRoute(new URL(request.url).pathname);
    if (!route) return json({ error: "not found" }, 404);
    if (route.kind === "health") {
      return json({
        service: "realsignal-api",
        apiVersion: "v1",
        status: "ready",
        capabilities: ["ia-search", "ia-metadata", "ia-queue", "ia-program"],
        migration: "relay-backed",
        checkedAt: new Date().toISOString(),
      }, 200, { "Cache-Control": "no-store" });
    }
    if (request.method === "GET" && (route.relayPath === "/ia/queue" || route.relayPath === "/ia/program")) return json({ error: "method not allowed" }, 405, { Allow: "POST,OPTIONS" });
    return forwardToRelay(request, env, route.relayPath);
  },
};
