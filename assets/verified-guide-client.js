/* Verified guide bridge.
 *
 * The guide paints from local state immediately. This small background bridge
 * then replaces active and currently visible Source Suite rows with the
 * server's verified queue, so opening the guide never waits on a network call
 * and the listing never invents a clock-based program schedule.
 */
(function () {
  var cache = Object.create(null);
  var inflight = Object.create(null);
  var ttl = 20000;

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

  function fetchKey(key) {
    if (!key || typeof fetch !== "function" || typeof IA_API_BASE === "undefined") return;
    var now = Date.now();
    if (cache[key] && now - cache[key].at < ttl) return;
    if (inflight[key]) return;
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, 5000);
    inflight[key] = fetch(IA_API_BASE + "/guide?channel=" + encodeURIComponent(key) + "&limit=8", {
      method: "GET",
      mode: "cors",
      headers: { "x-realsignal-client": "verified-guide" },
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      if (!response.ok) throw new Error("verified guide " + response.status);
      return response.json();
    }).then(function (value) {
      if (!value || value.verified !== true) return;
      value.at = Date.now();
      cache[key] = value;
      window.__rsVerifiedGuide = cache;
      refreshGuide();
    }).catch(function () { /* local queue data is the safe fallback */ }).finally(function () {
      clearTimeout(timer);
      delete inflight[key];
    });
  }

  function fetchVerified() {
    fetchKey(keyFor(channel()));
  }

  function prefetchVisibleRows() {
    var wrap = document.getElementById("gwrap");
    if (!wrap || !wrap.classList.contains("show") || typeof byNum !== "function") return;
    var rows = Array.prototype.slice.call(document.querySelectorAll("button.chcell[data-channel-num]"));
    var remaining = 4;
    rows.some(function (row) {
      if (remaining <= 0) return true;
      var rect = row.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > (window.innerHeight || document.documentElement.clientHeight || 900)) return false;
      var ch;
      try { ch = byNum(Number(row.dataset.channelNum)); } catch (_) { ch = null; }
      if (!ch || ch.source !== "v2preview") return false;
      var key = keyFor(ch);
      if (!key || inflight[key] || (cache[key] && Date.now() - cache[key].at < ttl)) return false;
      remaining -= 1;
      fetchKey(key);
      return false;
    });
  }

  window.__rsRefreshVerifiedGuide = fetchVerified;
  window.__rsVerifiedGuide = cache;
  /* Guide open is intentionally not intercepted. Polling is cheap, cached,
     and also covers the Cast/remote path where another wrapper owns openGuide. */
  setInterval(function () {
    try {
      var wrap = document.getElementById("gwrap");
      if (wrap && wrap.classList.contains("show")) { fetchVerified(); prefetchVisibleRows(); }
    } catch (_) {}
  }, 700);
})();
