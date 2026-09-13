/* RealSignal server-catalog client bridge.
 *
 * Source Suite discovery is attempted at the API boundary first. The legacy
 * browser adapters remain the canary fallback when the API is unavailable or
 * has no verified item yet. This bridge deliberately claims one provider lane
 * so the two client adapters do not duplicate the same server result.
 */
(function () {
  var originalProvider = window.v2Provider;
  if (typeof originalProvider !== "function" || typeof window.fetch !== "function") return;
  var inFlight = Object.create(null);
  var claimed = Object.create(null);

  function request(profile, rotation) {
    var profileKey = String(profile && (profile.profileKey || profile.name) || "").toLowerCase().replace(/[^a-z0-9._:-]+/g, "-");
    var key = profileKey + "|" + String(Number(rotation) || 0);
    if (inFlight[key]) return inFlight[key];
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timeout = setTimeout(function () { if (controller) controller.abort(); }, 8500);
    var body = {
      profileKey: profileKey,
      name: String(profile && profile.name || "").slice(0, 160),
      queries: Array.isArray(profile && profile.queries) ? profile.queries.slice(0, 8) : [],
      match: Array.isArray(profile && profile.match) ? profile.match.slice(0, 40) : [],
      deny: Array.isArray(profile && profile.deny) ? profile.deny.slice(0, 48) : [],
      providers: Array.isArray(profile && profile.providers) ? profile.providers.slice(0, 2) : ["peertube", "youtube"],
      rotation: Number(rotation) || 0,
      minimumReady: 2
    };
    inFlight[key] = fetch(IA_API_BASE + "/source/catalog", {
      method: "POST",
      mode: "cors",
      headers: { "content-type": "application/json", "x-realsignal-client": "source-suite" },
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      if (!response.ok) throw new Error("server catalog " + response.status);
      return response.json();
    }).catch(function () { return null; }).finally(function () { clearTimeout(timeout); });
    setTimeout(function () { delete inFlight[key]; delete claimed[key]; }, 30000);
    return inFlight[key];
  }

  window.v2Provider = async function (name, profile, rotation, onFirst) {
    if (!profile || !Array.isArray(profile.providers) || (profile.providers.indexOf("youtube") < 0 && profile.providers.indexOf("peertube") < 0)) return originalProvider.apply(this, arguments);
    var profileKey = String(profile.profileKey || profile.name || "").toLowerCase().replace(/[^a-z0-9._:-]+/g, "-");
    var key = profileKey + "|" + String(Number(rotation) || 0);
    var server = await request(profile, rotation);
    if (server && Array.isArray(server.items) && server.items.length) {
      if (name === "youtube" && server.providerAvailability && server.providerAvailability.youtube === false) return originalProvider.apply(this, arguments);
      if (!claimed[key]) {
        claimed[key] = true;
        var lane = { provider: "Server Catalog", items: server.items, health: server.lanes || server.health || {}, serverCatalog: true };
        if (typeof onFirst === "function") onFirst(lane);
        return lane;
      }
      return { provider: name, items: [], health: { serverCatalog: true, skipped: "shared-server-lane" } };
    }
    return originalProvider.apply(this, arguments);
  };
})();
