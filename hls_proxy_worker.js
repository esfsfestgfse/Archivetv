const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const ALLOWED_HOSTS = ["jmp2.uk", "pluto.tv", "plutotv.net"];
const MAX_UPSTREAM_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function isAllowedHost(hostname) {
  const host = hostname.toLowerCase();
  return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function corsHeaders(contentType, cacheControl = "no-store") {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Access-Control-Expose-Headers": "*",
    "Cache-Control": cacheControl,
    "Content-Type": contentType,
  };
}

function errorResponse(message, status = 400) {
  return new Response(message, {
    status,
    headers: corsHeaders("text/plain; charset=utf-8"),
  });
}

function proxyUrl(requestUrl, targetUrl) {
  const url = new URL(requestUrl);
  url.search = "";
  url.searchParams.set("url", targetUrl);
  return url.toString();
}

function isKeyUrl(url) {
  return /(?:^|[/?])[^/?#]+\.key(?:[?#]|$)/i.test(url);
}

function isManifestUrl(url, contentType) {
  if (isKeyUrl(url)) return false;
  return /\.m3u8(?:[?#]|$)/i.test(url) || /mpegurl/i.test(contentType || "");
}

function rewriteUriAttributes(line, baseUrl, requestUrl) {
  return line.replace(/URI=(['"])([^'"]+)\1/gi, (match, quote, uri) => {
    if (/^(?:data:|blob:)/i.test(uri)) return match;
    try {
      return `URI=${quote}${proxyUrl(requestUrl, new URL(uri, baseUrl).toString())}${quote}`;
    } catch (_) {
      return match;
    }
  });
}

function rewriteManifest(manifest, baseUrl, requestUrl) {
  return manifest
    .split(/\r?\n/)
    .map((line) => {
      const withAttributes = rewriteUriAttributes(line, baseUrl, requestUrl);
      if (!withAttributes || withAttributes.startsWith("#")) return withAttributes;
      try {
        return proxyUrl(requestUrl, new URL(withAttributes.trim(), baseUrl).toString());
      } catch (_) {
        return withAttributes;
      }
    })
    .join("\n");
}

async function fetchUpstream(targetUrl, request) {
  let current = new URL(targetUrl);
  for (let hop = 0; hop <= MAX_UPSTREAM_REDIRECTS; hop += 1) {
    if (!ALLOWED_PROTOCOLS.has(current.protocol) || !isAllowedHost(current.hostname)) {
      throw new Error("upstream redirect escaped the relay allowlist");
    }
    const response = await fetch(current.toString(), {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      redirect: "manual",
      headers: {
        Accept: "*/*",
        "User-Agent": "RealSignal HLS relay/1.0",
      },
    });
    if (!REDIRECT_STATUSES.has(response.status)) return { response, url: current.toString() };
    if (hop === MAX_UPSTREAM_REDIRECTS) throw new Error("upstream redirect limit exceeded");
    const location = response.headers.get("location");
    if (!location) throw new Error("upstream redirect missing location");
    current = new URL(location, current);
  }
  throw new Error("upstream redirect limit exceeded");
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders("text/plain") });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return errorResponse("method not allowed", 405);
    }

    const requested = new URL(request.url).searchParams.get("url");
    if (!requested) return errorResponse("missing ?url=");

    let target;
    try {
      target = new URL(requested);
    } catch (_) {
      return errorResponse("invalid upstream URL");
    }
    if (!ALLOWED_PROTOCOLS.has(target.protocol)) {
      return errorResponse("upstream URL must use http or https");
    }
    if (!isAllowedHost(target.hostname)) {
      return errorResponse("upstream host is not enabled for this relay", 403);
    }

    let upstream;
    try {
      upstream = await fetchUpstream(target.toString(), request);
    } catch (_) {
      return errorResponse("upstream fetch failed", 502);
    }

    const response = upstream.response;
    const finalUrl = upstream.url;
    const contentType = response.headers.get("content-type") || "";

    // Pluto sometimes labels AES-128 keys as application/vnd.apple.mpegurl.
    // A key is always binary; never read or rewrite it as playlist text.
    if (isKeyUrl(finalUrl) || isKeyUrl(target.toString())) {
      const headers = new Headers(corsHeaders("application/octet-stream", "no-store"));
      const length = response.headers.get("content-length");
      if (length) headers.set("Content-Length", length);
      return new Response(request.method === "HEAD" ? null : response.body, {
        status: response.status,
        headers,
      });
    }

    if (isManifestUrl(finalUrl, contentType)) {
      let body;
      try {
        body = await response.text();
      } catch (_) {
        return errorResponse("upstream manifest read failed", 502);
      }
      const rewritten = rewriteManifest(body, finalUrl, request.url);
      return new Response(request.method === "HEAD" ? null : rewritten, {
        status: response.status,
        headers: corsHeaders("application/vnd.apple.mpegurl; charset=utf-8", "no-store"),
      });
    }

    const passthroughType = contentType || "application/octet-stream";
    return new Response(request.method === "HEAD" ? null : response.body, {
      status: response.status,
      headers: corsHeaders(passthroughType, "public, max-age=5"),
    });
  },
};
