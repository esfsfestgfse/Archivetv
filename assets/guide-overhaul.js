/* RealSignal 2.1 guide behavior: recent viewing is local-only and never
   changes channel order unless the viewer explicitly selects a view mode. */
(function () {
  var RECENT_KEY = "realsignal:guide-recent";
  function readRecent() {
    try {
      var rows = typeof store !== "undefined" && store.get ? store.get(RECENT_KEY, []) : [];
      return Array.isArray(rows) ? rows.map(String).filter(Boolean).slice(0, 18) : [];
    } catch (_) { return []; }
  }
  function writeRecent(rows) { try { if (typeof store !== "undefined" && store.set) store.set(RECENT_KEY, rows.slice(0, 18)); } catch (_) {} }
  function remember(num) {
    var value = String(num || ""); if (!value) return;
    var rows = readRecent().filter(function (item) { return item !== value; });
    rows.unshift(value); writeRecent(rows);
    updateControls();
  }
  function refresh() {
    if (typeof window.renderRail === "function") window.renderRail();
    if (typeof window.primeGuideQueues === "function" && typeof window.visibleChannels === "function") window.primeGuideQueues(window.visibleChannels());
  }
  var originalTune = window.tuneNum;
  if (typeof originalTune === "function") window.tuneNum = function (num) { remember(num); return originalTune.apply(this, arguments); };
  var originalVisible = window.visibleChannels;
  if (typeof originalVisible === "function") window.visibleChannels = function () {
    var rows = originalVisible.apply(this, arguments) || [];
    if (window.__rsGuideRecentOnly) {
      var recent = readRecent();
      rows = recent.map(function (num) { return rows.find(function (item) { return String(item && item.num) === num; }); }).filter(Boolean);
    }
    if (window.__rsGuideRecentSort) {
      var order = readRecent();
      rows = rows.slice().sort(function (a, b) {
        var ai = order.indexOf(String(a && a.num)), bi = order.indexOf(String(b && b.num));
        if (ai < 0) ai = 999; if (bi < 0) bi = 999;
        return ai - bi || Number(a.num) - Number(b.num);
      });
    }
    return rows;
  };
  function updateControls() {
    var recent = document.getElementById("rsGuideRecent");
    if (recent) { var count = recent.querySelector(".guide-recent-count"); if (count) count.textContent = String(readRecent().length); recent.classList.toggle("active", !!window.__rsGuideRecentOnly); }
    var sort = document.getElementById("rsGuideSort");
    if (sort) { sort.textContent = window.__rsGuideRecentSort ? "RECENT FIRST" : "CHANNEL ORDER"; sort.classList.toggle("active", !!window.__rsGuideRecentSort); }
  }
  function init() {
    var fav = document.getElementById("favFilter");
    if (fav && !document.getElementById("rsGuideRecent")) {
      var recent = document.createElement("button"); recent.type = "button"; recent.id = "rsGuideRecent"; recent.className = "btn guide-favorites guide-recent"; recent.innerHTML = "↻ RECENT <span class=\"guide-recent-count\">0</span>"; recent.setAttribute("aria-pressed", "false"); recent.title = "Show channels watched recently";
      recent.addEventListener("click", function () { window.__rsGuideRecentOnly = !window.__rsGuideRecentOnly; recent.setAttribute("aria-pressed", String(!!window.__rsGuideRecentOnly)); updateControls(); refresh(); });
      fav.parentNode.insertBefore(recent, fav.nextSibling);
    }
    var toolbar = document.querySelector(".guide-directory .guide-toolbar");
    if (toolbar && !document.getElementById("rsGuideSort")) {
      var tools = document.createElement("div"); tools.className = "guide-view-tools";
      var sort = document.createElement("button"); sort.type = "button"; sort.id = "rsGuideSort"; sort.className = "guide-view-tool"; sort.textContent = "CHANNEL ORDER"; sort.title = "Toggle channel order"; sort.setAttribute("aria-pressed", "false");
      sort.addEventListener("click", function () { window.__rsGuideRecentSort = !window.__rsGuideRecentSort; sort.setAttribute("aria-pressed", String(!!window.__rsGuideRecentSort)); updateControls(); refresh(); });
      tools.appendChild(sort); toolbar.appendChild(tools);
    }
    updateControls();
  }
  window.__rsGuideRemember = remember;
  setTimeout(init, 0);
})();
