/* IA-only canary. Metadata preparation is not viewing; only the decoded start
   commits a reservation. One owner supplies guide, preload, Next and EOF. */
(function () {
  function create(options) {
    var channels = Object.create(null);
    function state(key) { return channels[key] || (channels[key] = { items: [], removed: Object.create(null), outbox: [], flushing: null, inflight: null, playing: '', revision: 0, generation: 0 }); }
    function id(item) { return String(item && (item.identifier || item.id) || ''); }
    function rows(key) { var value = state(key); return value.items.filter(function (item) { return id(item) !== value.playing && !value.removed[id(item)]; }); }
    function flush(value) {
      if (value.flushing) return value.flushing;
      value.flushing = (async function () {
        while (value.outbox.length) {
          var entry = value.outbox[0], packet = entry.packet, acknowledgement;
          try { acknowledgement = await options.report(packet); }
          catch (_) { acknowledgement = await options.report(packet); }
          var generation = acknowledgement && acknowledgement.cycleGeneration;
          if (Number.isSafeInteger(generation) && generation >= 0) {
            value.generation = Math.max(value.generation, generation);
            var removed = value.removed[packet.id];
            if (removed && removed.revision === entry.revision) removed.generation = generation;
          }
          value.outbox.shift();
        }
      })().finally(function () { value.flushing = null; });
      return value.flushing;
    }
    function event(key, item, type) {
      var value = state(key), identity = id(item);
      if (!identity) return Promise.resolve();
      value.revision++;
      value.removed[identity] = { revision: value.revision, generation: value.generation };
      if (type === 'started') value.playing = identity;
      else if (value.playing === identity) value.playing = '';
      var metadata = item.meta || item;
      var packet = { channel: String(key), id: identity, event: type, title: metadata.title || item.title || '', subject: metadata.subject || '', year: metadata.year || '', collection: metadata.collection || '' };
      value.outbox.push({ packet: packet, revision: value.revision });
      return flush(value);
    }
    function reserve(key, body) {
      var value = state(key);
      if (value.inflight) return value.inflight;
      var revision;
      value.inflight = flush(value).then(function () { revision = value.revision; return options.queue(Object.assign({}, body, { channel: String(key), count: 3, iaRepair: true })); }).then(async function (payload) {
        // Events overlapping the request must be reconciled in their server cycle,
        // not hidden forever or accidentally resurrected from a stale preload.
        await flush(value);
        var generation = payload.v2 && payload.v2.cycleGeneration;
        if (Number.isSafeInteger(generation) && generation >= 0) {
          value.generation = Math.max(value.generation, generation);
          Object.keys(value.removed).forEach(function (id) { if (value.removed[id].generation < value.generation) delete value.removed[id]; });
        } else if (payload.v2 && payload.v2.cycleReset && revision === value.revision) value.removed = Object.create(null);
        value.items = (payload.items || []).filter(function (item) { return item && item.media && item.media.url; });
        return rows(key);
      }).finally(function () { value.inflight = null; });
      return value.inflight;
    }
    return { reserve: reserve, event: event, rows: rows, peek: function (key) { return rows(key)[0] || null; } };
  }
  function lifecycle(active, recover) {
    var started = false, failed = false;
    return {
      start: function () { if (!active() || failed) return false; started = true; return true; },
      fail: function () { if (!active() || !started || failed) return false; failed = true; recover(); return true; },
      started: function () { return started; }
    };
  }
  var enabled = new URLSearchParams(location.search).get('iaRepair') === '1', client = null;
  function apiBase() {
    var override = new URLSearchParams(location.search).get('iaRepairApi') || '';
    if (/^https:\/\/realsignal-ia-audit-api\.tdy1990\.workers\.dev\/api\/v3$/.test(override) || /^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/api\/v3$/.test(override)) return override;
    return IA_API_BASE;
  }
  async function request(path, body) {
    var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 12000);
    try {
      var response = await fetch(apiBase() + path, { method: 'POST', mode: 'cors', headers: { 'content-type': 'application/json', 'x-realsignal-session': iaSessionId() }, body: JSON.stringify(Object.assign({}, body, { sessionId: iaSessionId() })), signal: controller.signal });
      if (!response.ok) throw Error('IA repair ' + response.status);
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  window.RealSignalIAShelf = {
    enabled: enabled, create: create, lifecycle: lifecycle,
    queue: function (body) { return request('/ia/queue', Object.assign({}, body, { iaRepair: true, serverCatalog: true })); },
    client: function () { return client || (client = create({ queue: function (body) { return window.RealSignalIAShelf.queue(body); }, report: function (body) { return request('/ia/playback', body); } })); }
  };
})();
