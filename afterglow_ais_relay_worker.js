/**
 * Afterglow AIS Relay — Cloudflare Worker
 * ============================================================================
 * Provides resilient vessel data to the Afterglow Ship Tracker.
 *
 * aisstream.io explicitly documents "we block direct browser connections",
 * so the Ship Tracker channel (num 965) can't reach them from the app directly.
 * This Worker has two independent paths:
 *   - WebSocket relay to aisstream.io for low-latency messages when available.
 *   - Cached HTTP snapshots from Kpler AIS when the stream is unavailable.
 * Both provider keys stay on the Cloudflare side and never enter the browser
 * bundle. The snapshot endpoint is intentionally fixed to the Gulf coverage
 * used by channel 965, so this public client cannot turn the Worker into an
 * arbitrary paid-data proxy.
 *
 * Deployment: see docs/AIS_RELAY_DEPLOY.md for one-time setup steps.
 *
 * Client contract:
 *   1. Browser opens `wss://ais-relay.tdy1990.workers.dev/`
 *   2. First message from browser must be the SubscriptionMessage JSON
 *      (BoundingBoxes, FiltersShipMMSI, FilterMessageTypes) MINUS the APIKey
 *      field — the Worker injects that from its env secret before forwarding.
 *   3. Every subsequent message in either direction is forwarded verbatim.
 *   4. Either side closing drops the paired connection.
 *
 * Env vars (set as Secrets in Workers dashboard):
 *   AIS_API_KEY     optional aisstream.io API key for the WebSocket stream
 *   KPLER_API_KEY   optional Kpler API key, already encoded for `Basic <key>`
 * ============================================================================ */

/* IMPORTANT: Cloudflare Workers `fetch()` accepts https:// only. The wss:// upgrade happens
   because of the Upgrade: websocket header, not the URL scheme. Using wss:// throws
   "Fetch API cannot load" and returns 502 to the client. */
const AISSTREAM_URL = "https://stream.aisstream.io/v0/stream";
const KPLER_URL = "https://api.kpler.com/v2/maritime/ais-latest";
const SNAPSHOT_PATH = "/snapshot";
const SNAPSHOT_TTL_SECONDS = 60;
const GULF_FILTER = "BBOX(geometry,-98,18,-80,31)";
const KPLER_FIELDS = "mmsi,longitude,latitude,posDt,sog,vesselName,heading,cog,navStatus,destination,vesselType";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

async function getKplerSnapshot(request, env, ctx) {
  if (!env.KPLER_API_KEY) {
    return json({ error: "snapshot provider is not configured" }, 503);
  }

  // One fixed cache key prevents a public caller from varying the query and
  // consuming paid Kpler quota. Cached results also keep an upstream blip from
  // blanking the screen for every connected Afterglow client.
  const url = new URL(request.url);
  const cacheKey = new Request(url.origin + SNAPSHOT_PATH);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value));
    headers.set("X-Afterglow-Source", "kpler-cache");
    return new Response(cached.body, { status: cached.status, headers });
  }

  const query = new URLSearchParams({
    filter: GULF_FILTER,
    format: "json",
    limit: "1000",
    fields: KPLER_FIELDS,
    sortBy: "posDt DESC",
  });
  let upstream;
  try {
    upstream = await fetch(KPLER_URL + "?" + query, {
      headers: {
        "Authorization": "Basic " + env.KPLER_API_KEY,
        "Accept": "application/json",
      },
    });
  } catch {
    return json({ error: "snapshot provider is unreachable" }, 502);
  }
  if (!upstream.ok) {
    // Do not relay an upstream diagnostic: it can contain account or contract
    // details that do not belong in a public client.
    return json({ error: "snapshot provider rejected the request", status: upstream.status }, 502);
  }

  let payload;
  try {
    payload = await upstream.json();
  } catch {
    return json({ error: "snapshot provider returned invalid data" }, 502);
  }
  const response = json({
    source: "kpler",
    fetchedAt: new Date().toISOString(),
    ...payload,
  }, 200, {
    "Cache-Control": "public, max-age=" + SNAPSHOT_TTL_SECONDS,
    "X-Afterglow-Source": "kpler-live",
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method === "GET" && url.pathname === SNAPSHOT_PATH) {
      return getKplerSnapshot(request, env, ctx);
    }

    // Anything other than a WebSocket upgrade gets a useful health response.
    const upgrade = (request.headers.get("Upgrade") || "").toLowerCase();
    if (upgrade !== "websocket") {
      return json({
        service: "afterglow-ais-relay",
        stream: Boolean(env.AIS_API_KEY),
        snapshot: Boolean(env.KPLER_API_KEY),
        snapshotPath: SNAPSHOT_PATH,
      });
    }

    if (!env.AIS_API_KEY) {
      return new Response(
        "Worker misconfigured: set AIS_API_KEY secret in the Cloudflare dashboard.",
        { status: 500 }
      );
    }

    // ---- Outbound: connect to aisstream.io ----
    // Cloudflare's outbound-WS pattern: fetch() with Upgrade header, then read
    // the `webSocket` off the response and .accept() it.
    let upstream;
    try {
      const resp = await fetch(AISSTREAM_URL, {
        headers: { Upgrade: "websocket" },
      });
      upstream = resp.webSocket;
      if (!upstream) {
        return new Response("aisstream did not upgrade", { status: 502 });
      }
      upstream.accept();
    } catch (e) {
      return new Response("aisstream connect failed: " + (e && e.message), {
        status: 502,
      });
    }

    // ---- Inbound: accept the browser's WebSocket ----
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    // Track whether we've relayed the first subscribe message. When we see it,
    // inject the API key before forwarding to aisstream.
    let subscribed = false;

    server.addEventListener("message", (ev) => {
      try {
        if (!subscribed) {
          // First message from browser is the subscription config (no key).
          // Inject the key and forward.
          let sub;
          try {
            sub = JSON.parse(ev.data);
          } catch {
            // If they sent non-JSON as first message, just pass through raw —
            // aisstream will reject it and that's the correct signal to the client.
            upstream.send(ev.data);
            subscribed = true;
            return;
          }
          sub.APIKey = env.AIS_API_KEY;
          upstream.send(JSON.stringify(sub));
          subscribed = true;
        } else {
          upstream.send(ev.data);
        }
      } catch (e) {
        // Best-effort forward; on any relay error, close the pair so client
        // sees a clean disconnect instead of a stuck-open silent socket.
        try { server.close(1011, "relay-forward-failed"); } catch {}
        try { upstream.close(); } catch {}
      }
    });

    upstream.addEventListener("message", (ev) => {
      try {
        server.send(ev.data);
      } catch (e) {
        try { upstream.close(); } catch {}
      }
    });

    server.addEventListener("close", () => {
      try { upstream.close(); } catch {}
    });
    upstream.addEventListener("close", () => {
      try { server.close(); } catch {}
    });
    server.addEventListener("error", () => {
      try { upstream.close(); } catch {}
    });
    upstream.addEventListener("error", () => {
      try { server.close(); } catch {}
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  },
};
