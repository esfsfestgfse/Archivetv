/* Inter-program eligibility and an ad ledger separate from program history. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RealSignalCommercials = api;
})(typeof window !== 'undefined' ? window : this, function () {
  function create(store) {
    function read(key) { try { return store.get(key, {}) || {}; } catch (_) { return {}; } }
    function save(key, value) { try { store.set(key, value); } catch (_) {} }
    function era(item) { var year = String(item.year || '').match(/\b(?:19|20)\d{2}\b/); return year ? String(Math.floor(Number(year[0]) / 10) * 10) : 'undated'; }
    return {
      due: function (ch, seconds) {
        if (!ch || ch.source || ch.gl === 'commercials') return false;
        if (String(ch.cat).toUpperCase() !== 'TOON') return true;
        var blocks = read('realsignal:commercial-blocks:v1'), key = String(ch.num);
        var total = Number(blocks[key] || 0) + Math.max(0, Number(seconds) || 0), ready = total >= 25 * 60;
        blocks[key] = ready ? 0 : total; save('realsignal:commercial-blocks:v1', blocks);
        return ready;
      },
      choose: function (items, score) {
        var history = read('realsignal:commercial-history:v1'), seen = history.seen || {}, eras = history.eras || {};
        var fresh = items.filter(function (item) { return !seen[item.identifier]; });
        var choices = (fresh.length ? fresh : items).slice();
        choices.sort(function (a, b) { return Number(eras[era(a)] || 0) - Number(eras[era(b)] || 0) ||
          (score ? score(b) - score(a) : 0) || Number(seen[a.identifier] || 0) - Number(seen[b.identifier] || 0); });
        return choices[0] || null;
      },
      remember: function (item) {
        if (!item || !item.identifier) return;
        var history = read('realsignal:commercial-history:v1'); history.seen = history.seen || {}; history.eras = history.eras || {};
        history.seen[item.identifier] = Date.now(); var key = era(item); history.eras[key] = Number(history.eras[key] || 0) + 1;
        var ids = Object.keys(history.seen).sort(function (a, b) { return history.seen[b] - history.seen[a]; });
        ids.slice(128).forEach(function (id) { delete history.seen[id]; });
        save('realsignal:commercial-history:v1', history);
      }
    };
  }
  return { create: create };
});
