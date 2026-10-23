/* Presentation commands resolve the current wrapper at invocation time. */
(function () {
  var query = new URLSearchParams(location.search);
  var optedIn = query.get('v6') !== '0' && query.get('castReceiver') !== '1';
  function enabled() {
    return optedIn && !(typeof window.__rsCastIsConnected === 'function' && window.__rsCastIsConnected());
  }
  var commands = { tune: 'tuneNum', favorite: 'toggleFav', next: 'skipOne', 'guide-open': 'openGuide', 'guide-close': 'closeGuide', power: 'togglePower', info: 'toggleInfo', menu: 'toggleOsd', 'channel-step': 'step', 'volume-step': 'setVol', mute: 'toggleMute', cast: '__rsCastRequest' };
  var api = {
    available: optedIn,
    categories: function () {
      return (typeof GUIDE_CATEGORIES !== 'undefined' ? GUIDE_CATEGORIES : []).map(function (group) {
        return { id: String(group.id), label: String(group.label) };
      });
    },
    directory: function () {
      var recent = [];
      try { recent = typeof store !== 'undefined' ? store.get('realsignal:guide-recent', []) : []; } catch (_) {}
      recent = Array.isArray(recent) ? recent.map(String) : [];
      var categories = api.categories().map(function (group) { return group.id; });
      return (typeof publicLineupChannels === 'function' ? publicLineupChannels() : []).filter(function (ch) {
        return typeof isHiddenConsolidatedMember !== 'function' || !isHiddenConsolidatedMember(ch);
      }).map(function (ch) {
        var group = guideCategoryFor(ch), meta = typeof CHANNEL_META !== 'undefined' && CHANNEL_META[ch.nm] || {};
        return { number: Number(ch.num), key: String(ch.key || ch.num), name: canonicalChannelLabel(ch),
          categoryId: String(group.id), categoryLabel: String(group.label), description: String(meta.desc || ''),
          favorite: isFav(ch.num), recentIndex: recent.indexOf(String(ch.num)) };
      }).sort(function (a, b) {
        return categories.indexOf(a.categoryId) - categories.indexOf(b.categoryId) || a.number - b.number;
      });
    },
    snapshot: function (channel) {
      var ch = channel && typeof channel === 'object' ? channel : byNum(Number(channel == null ? curNum : channel));
      return guidePlaybackSnapshot(ch);
    },
    command: function (name, value) {
      if (!enabled() || !Object.prototype.hasOwnProperty.call(commands, name)) return false;
      if (name === 'channel-step' && value !== -1 && value !== 1) return false;
      if (name === 'volume-step' && value !== -0.1 && value !== 0.1) return false;
      var fn = window[commands[name]];
      if (typeof fn !== 'function') return false;
      return name === 'tune' || name === 'favorite' || name === 'channel-step' || name === 'volume-step' ? fn.call(window, value) : fn.call(window);
    }
  };
  Object.defineProperty(api, 'enabled', { get: enabled });
  window.RealSignalPresentation = api;
})();
