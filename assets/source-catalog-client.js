/* RealSignal server-catalog client bridge.
 *
 * Source Suite discovery is attempted at the API boundary first. PeerTube is
 * retained as a bounded canary fallback when the API is unavailable; YouTube
 * stays server-only so no browser credential or direct Data API call returns.
 * This bridge deliberately claims one provider lane so client adapters do not
 * duplicate the same server result.
 */
(function () {
  var originalProvider = window.v2Provider;
  if (typeof originalProvider !== "function" || typeof window.fetch !== "function") return;
  var inFlight = Object.create(null);
  var claimed = Object.create(null);
  var refreshPending = Object.create(null);
  var FRESHNESS_KEY = 'realsignal:source-freshness:v1';

  function readFreshness() {
    try { var value = JSON.parse(localStorage.getItem(FRESHNESS_KEY) || '{}'); return value && typeof value === 'object' ? value : {}; }
    catch (_) { return {}; }
  }

  function itemKey(item) {
    return String(item && (item.id || item.identifier || item.sourceIdentifier || (item.media && item.media.url) || item.url) || '').trim().slice(0, 500);
  }

  function recentFor(profileKey) {
    var all = readFreshness();
    return Array.isArray(all[profileKey]) ? all[profileKey].slice(-48) : [];
  }

  function remember(profileKey, items) {
    var ids = (Array.isArray(items) ? items : []).map(itemKey).filter(Boolean);
    if (!ids.length) return;
    var all = readFreshness();
    var next = (Array.isArray(all[profileKey]) ? all[profileKey] : []).concat(ids);
    var seen = Object.create(null);
    all[profileKey] = next.filter(function (id) { if (seen[id]) return false; seen[id] = true; return true; }).slice(-48);
    try { localStorage.setItem(FRESHNESS_KEY, JSON.stringify(all)); } catch (_) { /* storage is an optimization */ }
  }

  function request(profile, rotation, refresh) {
    var profileKey = String(profile && (profile.profileKey || profile.name) || "").toLowerCase().replace(/[^a-z0-9._:-]+/g, "-");
    var refreshKey = refresh ? "|refresh" : "";
    var key = profileKey + "|" + String(Number(rotation) || 0) + refreshKey;
    if (inFlight[key]) return inFlight[key];
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timeout = setTimeout(function () { if (controller) controller.abort(); }, 8500);
    /* The Worker owns the approved descriptor. Sending only the stable key
       prevents a modified browser profile from changing provider queries or
       persistence rules at the API boundary. */
    var body = {
      profileKey: profileKey,
      rotation: Number(rotation) || 0,
      refresh: !!refresh,
      /* The API may still return a smaller stale shelf immediately. This
         target tells the server to refill it instead of declaring two items
         a healthy catalog. */
      minimumReady: 12,
      recentIds: recentFor(profileKey)
    };
    inFlight[key] = fetch(IA_API_BASE + "/source/catalog", {
      method: "POST",
      mode: "cors",
      headers: { "content-type": "application/json", "x-realsignal-client": "source-suite" },
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      if (!response.ok) throw new Error("server catalog " + response.status);
      return response.json().then(function (value) {
        if (value && Array.isArray(value.items)) remember(profileKey, value.items);
        return value;
      });
    }).catch(function () { return null; }).finally(function () { clearTimeout(timeout); });
    setTimeout(function () { delete inFlight[key]; delete claimed[key]; }, 30000);
    return inFlight[key];
  }

  function refreshStaleShelf(profile, rotation, stale, onFirst) {
    if (!stale || !stale.hydrating || !Array.isArray(stale.items)) return;
    var profileKey = String(profile && (profile.profileKey || profile.name) || "").toLowerCase().replace(/[^a-z0-9._:-]+/g, "-");
    var key = profileKey + "|" + String(Number(rotation) || 0);
    if (refreshPending[key]) return;
    refreshPending[key] = true;
    /* Do not hold up the first playable item. The Worker is already refreshing
       D1 in the background; this second request lets the active browser adopt
       the completed shelf as soon as it is available instead of reusing the
       stale response held by the normal request coalescer. */
    setTimeout(function () {
      request(profile, rotation, true).then(function (fresh) {
        if (!fresh || !Array.isArray(fresh.items) || fresh.items.length <= stale.items.length) return;
        remember(profileKey, fresh.items);
        if (typeof onFirst === "function") onFirst({
          provider: "Server Catalog",
          items: fresh.items,
          health: fresh.lanes || fresh.health || {},
          serverCatalog: true,
          backgroundRefresh: true,
        });
      }).catch(function () { /* stale shelf remains the safe playback fallback */ }).finally(function () {
        setTimeout(function () { delete refreshPending[key]; }, 30_000);
      });
    }, 120);
  }

  window.v2Provider = async function (name, profile, rotation, onFirst) {
    if (!profile || !Array.isArray(profile.providers) || (profile.providers.indexOf("youtube") < 0 && profile.providers.indexOf("peertube") < 0)) return originalProvider.apply(this, arguments);
    var profileKey = String(profile.profileKey || profile.name || "").toLowerCase().replace(/[^a-z0-9._:-]+/g, "-");
    var key = profileKey + "|" + String(Number(rotation) || 0);
    var server = await request(profile, rotation, false);
    if (server && Array.isArray(server.items) && server.items.length) {
      refreshStaleShelf(profile, rotation, server, onFirst);
      if (name === "youtube" && server.providerAvailability && server.providerAvailability.youtube === false) return { provider: "YouTube", items: [], health: { serverCatalog: true, skipped: "youtube-provider-unconfigured" } };
      if (!claimed[key]) {
        claimed[key] = true;
        var lane = { provider: "Server Catalog", items: server.items, health: server.lanes || server.health || {}, serverCatalog: true };
        if (typeof onFirst === "function") onFirst(lane);
        return lane;
      }
      return { provider: name, items: [], health: { serverCatalog: true, skipped: "shared-server-lane" } };
    }
    if (name === "youtube") return { provider: "YouTube", items: [], health: { serverCatalog: true, skipped: "server-catalog-unavailable" } };
    return originalProvider.apply(this, arguments);
  };
})();
