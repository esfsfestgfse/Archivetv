/* Read-only program snapshots shared by the desktop and mobile presentation. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RealSignalGuideContract = api;
})(typeof window !== 'undefined' ? window : this, function () {
  function text(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
  function seconds(value, zero) {
    if (value == null || typeof value === 'boolean' || text(value) === '') return null;
    var n = Number(value);
    return Number.isFinite(n) && (zero ? n >= 0 : n > 0) ? n : null;
  }
  function firstSeconds(values) {
    for (var i = 0; i < values.length; i++) { var value = seconds(values[i]); if (value != null) return value; }
    return null;
  }
  function program(item) {
    if (!item) return null;
    var media = item.media || {}, meta = item.meta || {};
    return {
      id: text(item.identifier || item.id || meta.identifier || meta.id),
      title: text(item.title || meta.title || item.identifier || item.id),
      durationSeconds: firstSeconds([item.duration, item.runtime, item.runtimeSeconds, item.duration_seconds, media.runtime, media.duration, meta.media && meta.media.runtime]),
      provider: text(item.provider || meta.provider || (item.source === 'archive' ? 'Internet Archive' : '')),
      isAd: !!item.isAd
    };
  }
  function playable(item) {
    var media = item && item.media || {};
    return !!item && !!text(media.url || item.url || item.embedUrl);
  }
  function select(input) {
    input = input || {};
    var ch = input.channel, cap = Math.max(1, Math.min(3, Number(input.capacity) || 3));
    var result = {
      channel: ch ? { number: Number(ch.num), key: text(ch.key || ch.num), name: text(ch.nm), source: text(ch.source || 'archive') } : null,
      current: null, next: null, later: null, state: 'standby', live: false,
      ready: 0, capacity: cap, position: null, remainingSeconds: null
    };
    if (!ch || input.powered === false) return result;
    if (ch.source && ch.source !== 'v2preview') {
      var live = input.live || {};
      var defaults = { livetv: 'Select a live channel', sports: 'Scores & live coverage', weather: 'Current conditions & forecast', liveradio: 'Station directory' };
      result.current = { id: '', title: text(live.now || live.text || defaults[ch.source] || ch.nm), durationSeconds: null, provider: text(live.source), isAd: false };
      result.next = live.nextProgram ? program(live.nextProgram) : null;
      result.live = true; result.state = 'live'; result.ready = null; result.capacity = null;
      return result;
    }
    var current = input.current;
    if (current && Number(current.ch) === Number(ch.num)) result.current = program(current);
    var seen = Object.create(null), items = [];
    if (result.current && result.current.id) seen[result.current.id] = true;
    (Array.isArray(input.queue) ? input.queue : []).forEach(function (raw) {
      if (!playable(raw)) return;
      var item = program(raw);
      if (!item.id || !item.title || seen[item.id]) return;
      seen[item.id] = true; items.push(item);
    });
    result.next = items[0] || null; result.later = items[1] || null;
    result.ready = Math.min(cap, items.length + (result.current ? 1 : 0));
    result.state = result.current ? 'playing' : items.length ? 'ready' : 'pending';
    if (result.current && input.position) {
      var elapsed = seconds(input.position.currentTime, true);
      var duration = seconds(input.position.duration) || result.current.durationSeconds;
      if (elapsed != null && duration != null && elapsed <= duration) {
        result.position = elapsed;
        result.remainingSeconds = duration - elapsed;
        result.current.durationSeconds = duration;
      }
    }
    return result;
  }
  function runtime(item) {
    var value = item && item.durationSeconds;
    if (value == null) return '';
    var minutes = Math.max(1, Math.round(value / 60));
    return minutes >= 60 ? Math.floor(minutes / 60) + 'H ' + (minutes % 60) + 'M' : minutes + 'M';
  }
  function label(item) { return item.title + (runtime(item) ? ' · ' + runtime(item) : ''); }
  function listing(snapshot) {
    var s = snapshot, current = s.current, next = s.next;
    var result = { now: 'PROGRAM INFORMATION PENDING', next: 'NEXT · PROGRAM INFORMATION PENDING', detail: '', state: s.state, live: s.live, ready: s.ready, capacity: s.capacity };
    if (s.state === 'standby') { result.now = 'TELEVISION IS OFF'; result.next = 'PRESS POWER'; return result; }
    if (s.live) {
      result.now = 'LIVE · ' + current.title;
      result.next = next ? 'NEXT · ' + label(next) : s.channel.source === 'livetv' ? 'PROGRAM INFORMATION UNAVAILABLE' : 'CONTINUOUS LIVE SERVICE';
      result.detail = current.provider || s.channel.name;
      return result;
    }
    if (current) { result.now = (current.isAd ? 'BREAK · ' : 'NOW · ') + current.title; result.detail = [runtime(current), current.provider].filter(Boolean).join(' · '); }
    else if (next) { result.now = 'UP NEXT · ' + label(next); result.detail = next.provider; next = s.later; }
    if (next) result.next = (current ? 'NEXT · ' : 'THEN · ') + label(next);
    return result;
  }
  return { select: select, listing: listing };
});
