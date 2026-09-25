/* Verified guide bridge.
 *
 * The guide paints from local state immediately. This small background bridge
 * then replaces only the active channel's current/next metadata with the
 * server's verified queue, so opening the guide never waits on a network call
 * and the listing never invents a clock-based program schedule.
 */
(function () {
  var cache = Object.create(null);
  var inflight = Object.create(null);
  var ttl = 10000;

  function channel() {
    try {
      if (typeof byNum !== "function" || typeof curNum === "undefined") return null;
      return byNum(Number(curNum));
    } catch (_) { return null; }
  }

  function keyFor(ch) {
    if (!ch) return "";
    return String(ch.source === "v2preview" ? (ch.previewKey || ch.num) : ch.num);
  }

  function refreshGuide() {
    try {
      if (typeof guideUpdatePreview === "function") guideUpdatePreview();
      if (typeof refreshGuideRows === "function") refreshGuideRows();
    } catch (_) { /* guide paint remains local-first */ }
  }

  function fetchVerified() {
    var ch = channel();
    var key = keyFor(ch);
    if (!key || typeof fetch !== "function" || typeof IA_API_BASE === "undefined") return;
    var now = Date.now();
    if (cache[key] && now - cache[key].at < ttl) return;
    if (inflight[key]) return;
    inflight[key] = fetch(IA_API_BASE + "/guide?channel=" + encodeURIComponent(key) + "&limit=8", {
      method: "GET",
      mode: "cors",
      headers: { "x-realsignal-client": "verified-guide" }
    }).then(function (response) {
      if (!response.ok) throw new Error("verified guide " + response.status);
      return response.json();
    }).then(function (value) {
      if (!value || value.verified !== true) return;
      cache[key] = value;
      window.__rsVerifiedGuide = cache;
      refreshGuide();
    }).catch(function () { /* local queue data is the safe fallback */ }).finally(function () {
      delete inflight[key];
    });
  }

  window.__rsRefreshVerifiedGuide = fetchVerified;
  window.__rsVerifiedGuide = cache;
  /* Guide open is intentionally not intercepted. Polling is cheap, cached,
     and also covers the Cast/remote path where another wrapper owns openGuide. */
  setInterval(function () {
    try {
      var wrap = document.getElementById("gwrap");
      if (wrap && wrap.classList.contains("show")) fetchVerified();
    } catch (_) {}
  }, 700);
})();
