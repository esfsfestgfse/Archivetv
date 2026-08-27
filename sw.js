/* v4 (2026-08-27): force a one-time eviction of shells from the earlier cache generation.
   The app has received substantial desktop/mobile changes since v3; a fresh cache name means
   every installed copy takes the current shell on its next visit, while remaining offline-safe. */
const CACHE = "archive-tv-v4";
const SHELL = ["the_dial_mobile.html", "manifest.json", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* Network-first for the app shell itself, so a fresh build always loads when you're online
   (this app gets updated often) — falls back to the last cached copy only if truly offline. */
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; /* never intercept live-data API calls, only same-origin shell files */
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        /* Only cache successful 200s. Without this guard a transient 5xx or a 404 during a
           network hiccup would poison the offline cache and be served on the next offline load. */
        if (res && res.ok && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
