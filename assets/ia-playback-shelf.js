/* IA-only guarded rollout. Metadata preparation is not viewing; only the decoded start
   commits a reservation. One owner supplies guide, preload, Next and EOF. */
(function () {
  function create(options) {
    var channels = Object.create(null);
    function state(key) {
      if (!channels[key]) {
        var outbox = (options.journal?.load(key) || []).map(function (packet) { return { packet: packet, revision: 0, restored: true }; });
        channels[key] = { items: [], removed: Object.create(null), outbox: outbox, flushing: null, inflight: null, playing: '', revision: 0, generation: 0 };
      }
      return channels[key];
    }
    function id(item) { return String(item && (item.identifier || item.id) || ''); }
    function rows(key) { var value = state(key); return value.items.filter(function (item) { return id(item) !== value.playing && !value.removed[id(item)]; }); }
    function flush(value) {
      if (value.flushing) return value.flushing;
      value.flushing = (async function () {
        while (value.outbox.length) {
          var entry = value.outbox[0], packet = entry.packet, acknowledgement;
          try { acknowledgement = await options.report(packet); }
          catch (error) {
            // An evicted saved start can no longer be committed. Retire its replay so newer starts can drain.
            if (!(entry.restored && packet.event === 'started' && error?.status === 400)) {
              acknowledgement = await options.report(packet);
            }
          }
          if (packet.event === 'started') options.journal?.remove(packet.channel, packet);
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
      if (type === 'started' && options.journal) { packet.recordedAt = Date.now(); options.journal.add(key, packet); }
      value.outbox.push({ packet: packet, revision: value.revision });
      return flush(value);
    }
    function reserve(key, body) {
      var value = state(key);
      if (value.inflight) return value.inflight;
      var revision;
      value.inflight = flush(value).then(function () {
        revision = value.revision;
        var sessionRefill = value.items.length > 0;
        var count = String(key) === '53' || sessionRefill && readyBackup(key) ? 5 : 3;
        return options.queue(Object.assign({}, body, { channel: String(key), count: count, iaRepair: true, sessionRefill: sessionRefill }));
      }).then(async function (payload) {
        // Events overlapping the request must be reconciled in their server cycle,
        // not hidden forever or accidentally resurrected from a stale preload.
        await flush(value);
        var previousHead = id(rows(key)[0]);
        var generation = payload.v2 && payload.v2.cycleGeneration;
        var newCycle = payload.v2 && payload.v2.cycleReset || Number.isSafeInteger(generation) && generation > value.generation;
        if (Number.isSafeInteger(generation) && generation >= 0) {
          value.generation = Math.max(value.generation, generation);
          Object.keys(value.removed).forEach(function (id) { if (value.removed[id].generation < value.generation) delete value.removed[id]; });
        } else if (payload.v2 && payload.v2.cycleReset && revision === value.revision) value.removed = Object.create(null);
        var ready = (payload.items || []).filter(function (item) { return item && item.media && item.media.url; });
        // Keep the program already listed while its reservation remains valid.
        var listed = !newCycle && previousHead ? ready.findIndex(function (item) { return id(item) === previousHead; }) : -1;
        if (listed > 0) ready.unshift(ready.splice(listed, 1)[0]);
        // A pending refill can keep an existing reservation in the same cycle.
        if (ready.length || !payload.hydrating || newCycle) {
          value.items = ready;
          value.preparedStart = payload.preparedStart === true;
        }
        return rows(key);
      }).finally(function () { value.inflight = null; });
      return value.inflight;
    }
    return { reserve: reserve, event: event, rows: rows, hasPreparedStart: function (key) { return state(key).preparedStart === true; }, peek: function (key) { return rows(key)[0] || null; } };
  }
  function archiveRoute(item, url) {
    var identifier = String(item.identifier || item.id || ''), separator = identifier.indexOf('::');
    if (separator <= 0 || !url) return null;
    var source = identifier.slice(0, separator).replace(/^ia:/i, ''), file = identifier.slice(separator + 2);
    try {
      var parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return null;
      var path = parsed.hostname === 'archive.org' ? parsed.pathname.match(/^\/download\/([^/]+)\/(.+)$/)
        : parsed.hostname.endsWith('.archive.org') && parsed.pathname.match(/^\/\d+\/items\/([^/]+)\/(.+)$/);
      if (path && decodeURIComponent(path[1]) === source && decodeURIComponent(path[2]) === file) {
        return { host: parsed.hostname, source: source, file: file };
      }
    } catch (_) {}
    return null;
  }
  function sameFileAlternate(item) {
    var route = archiveRoute(item, (item.media || item).url);
    if (!route || route.host === 'archive.org') return '';
    return 'https://archive.org/download/' + encodeURIComponent(route.source) + '/' + route.file.split('/').map(encodeURIComponent).join('/');
  }

  // Connection quality is viewer-specific. Keep a bounded local history of
  // requested routes, including the delay of Archive's download redirect.
  var routeStorageKey = 'realsignal:archive-route-history:v1', routeHistory;
  function tracksRoutes(channel) { return wholeLineup || [10, 11, 12, 22, 53, 150].includes(Number(channel)); }
  function routeStats() {
    if (!routeHistory) {
      routeHistory = Object.create(null);
      try { Object.assign(routeHistory, JSON.parse(localStorage.getItem(routeStorageKey)) || {}); } catch (_) {}
    }
    return routeHistory;
  }
  function routeKey(route) {
    // The download entry point can send unrelated files to different servers.
    return route.host === 'archive.org' ? route.host + ':' + route.source + '::' + route.file : route.host;
  }
  function routeSample(key, now) {
    var row = routeStats()[key];
    return row && Number.isFinite(row.ms) && now >= row.at && now - row.at < (row.timedOut ? 30 * 60_000 : 86400_000) ? row : null;
  }
  function recordRoute(channel, item, url, firstFrameMs) {
    if (!tracksRoutes(channel)) return '';
    var route = archiveRoute(item, url);
    if (!route || (firstFrameMs !== null && !Number.isFinite(firstFrameMs))) return '';
    var stats = routeStats(), key = routeKey(route), now = Date.now(), old = routeSample(key, now);
    var measured = firstFrameMs === null ? 5000 : Math.max(600, Math.min(4000, firstFrameMs));
    stats[key] = {
      at: now, timedOut: firstFrameMs === null,
      ms: old && !old.timedOut && firstFrameMs !== null ? Math.round(old.ms * 0.4 + measured * 0.6) : measured
    };
    Object.keys(stats).sort(function (a, b) { return stats[b].at - stats[a].at; }).slice(32)
      .forEach(function (host) { delete stats[host]; });
    try { localStorage.setItem(routeStorageKey, JSON.stringify(stats)); } catch (_) {}
    return route.host;
  }
  function rankedMedia(channel, item) {
    var media = item.media || item;
    if (!tracksRoutes(channel) || !archiveRoute(item, media.url)) return media;
    var now = Date.now(), used = new Set();
    var choices = [media.url].concat(media.alts || (media.alt ? [media.alt] : []), sameFileAlternate(item))
      .flatMap(function (url) {
        var route = archiveRoute(item, url);
        if (!route || used.has(route.host)) return [];
        used.add(route.host);
        var sample = routeSample(routeKey(route), now);
        return [{ url: url, score: sample ? sample.ms : 4000 }];
      }).sort(function (a, b) { return a.score - b.score; });
    return Object.assign({}, media, { url: choices[0].url, alts: choices.slice(1).map(function (choice) { return choice.url; }) });
  }
  function warmMirror(item, url, onReady) {
    if (!archiveRoute(item, url)) return null;
    var video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    function loaded() { if (video.readyState >= 2 && video.videoWidth > 0) onReady(); }
    video.addEventListener('loadeddata', loaded);
    var startedAt = performance.now();
    video.src = url;
    video.load();
    return {
      video: video, startedAt: startedAt,
      release: function (keep) {
        video.removeEventListener('loadeddata', loaded);
        if (!keep) {
          video.removeAttribute('src');
          video.load();
        }
        return video;
      }
    };
  }
  function lifecycle(active, recover) {
    var started = false, failed = false;
    return {
      start: function () { if (!active() || failed) return false; started = true; return true; },
      fail: function () { if (!active() || !started || failed) return false; failed = true; recover(); return true; },
      started: function () { return started; }
    };
  }
  var query = new URLSearchParams(location.search), optIn = query.get('iaRepair');
  var promotion = typeof document !== 'undefined' && document.querySelector('meta[name="realsignal-ia-repair-channels"]');
  var promoted = promotion ? String(promotion.content || '').split(',').map(function (id) { return id.trim(); }).filter(Boolean) : [];
  var wholeLineup = promoted.includes('*'), fallbackUntil = Object.create(null);
  var enabled = optIn !== '0' && (optIn === '1' || promoted.length > 0), client = null;
  function beginTune(channel) {
    if (fallbackUntil[channel] <= Date.now()) delete fallbackUntil[channel];
  }
  function fallbackForChannel(channel) {
    if (!wholeLineup || !enabledForChannel(channel)) return false;
    fallbackUntil[channel] = Date.now() + 60_000;
    return true;
  }
  function identityPilot(channel) {
    return enabled && query.get('iaProgramIdentity') === '1' && query.get('castReceiver') !== '1' &&
      ['150', '502', '929'].includes(String(channel));
  }
  function readyBackup(channel) {
    if (['2', '3', '10', '108'].includes(String(channel))) {
      return enabled && (wholeLineup || optIn === '1' || promoted.includes(String(channel))) && query.get('castReceiver') !== '1';
    }
    return String(channel) === '502' && identityPilot(channel);
  }
  function repeatInIdentityFallback(channel, id) {
    return identityPilot(channel) && fallbackUntil[channel] > Date.now() &&
      typeof id === 'string' && iaViewerRecentIds('identity:' + channel).includes(id);
  }
  function enabledForChannel(channel) {
    // Receiver acknowledgements need their own physical-device certification.
    if (!enabled || fallbackUntil[channel] || query.get('castReceiver') === '1') return false;
    try { if (typeof window.__rsCastIsConnected === 'function' && window.__rsCastIsConnected()) return false; }
    catch (_) { return false; }
    return wholeLineup || optIn === '1' || promoted.indexOf(String(channel)) >= 0;
  }
  function apiBase() {
    var override = new URLSearchParams(location.search).get('iaRepairApi') || '';
    if (/^https:\/\/realsignal-ia-audit-api\.tdy1990\.workers\.dev\/api\/v3$/.test(override) || /^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/api\/v3$/.test(override)) return override;
    return IA_API_BASE;
  }
  // A decoded start is recorded synchronously so a reload or tab close cannot
  // lose it while a previous command is still waiting for its acknowledgement.
  var startJournal = {
    load: function (channel) {
      try {
        var rows = JSON.parse(localStorage.getItem('realsignal:ia-start:' + iaSessionId() + ':' + channel) || '[]');
        var now = Date.now();
        return Array.isArray(rows) ? rows.filter(function (row) {
          return row?.channel === String(channel) && row.event === 'started' && typeof row.id === 'string' &&
            row.id.length > 0 && row.id.length <= 500 && now - row.recordedAt >= 0 && now - row.recordedAt < 86400_000;
        }).slice(-12) : [];
      } catch (_) { return []; }
    },
    save: function (channel, rows) {
      try {
        var key = 'realsignal:ia-start:' + iaSessionId() + ':' + channel;
        if (rows.length) localStorage.setItem(key, JSON.stringify(rows.slice(-12)));
        else localStorage.removeItem(key);
      } catch (_) {}
    },
    add: function (channel, packet) { this.save(channel, this.load(channel).concat(packet)); },
    remove: function (channel, packet) {
      this.save(channel, this.load(channel).filter(function (row) { return row.id !== packet.id || row.recordedAt !== packet.recordedAt; }));
    }
  };
  async function request(path, body) {
    var sessionBody = Object.assign({}, body, { sessionId: iaSessionId() });
    if (identityPilot(body.channel)) sessionBody.archiveProgramIdentity = true;
    var timeout = wholeLineup && path === '/ia/queue' ? 5500 : 12000;
    var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, timeout);
    try {
      var response = await fetch(apiBase() + path, { method: 'POST', mode: 'cors', headers: { 'content-type': 'application/json', 'x-realsignal-session': iaSessionId() }, body: JSON.stringify(sessionBody), signal: controller.signal, keepalive: path === '/ia/playback' });
      if (!response.ok) {
        var error = Error('IA repair ' + response.status);
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  window.RealSignalIAShelf = {
    enabled: enabled, fullRollout: wholeLineup, enabledForChannel: enabledForChannel, beginTune: beginTune, fallbackForChannel: fallbackForChannel, create: create, lifecycle: lifecycle, sameFileAlternate: sameFileAlternate,
    identityPilot: identityPilot, repeatInIdentityFallback: repeatInIdentityFallback, readyBackup: readyBackup,
    tracksRoutes: tracksRoutes, rankedMedia: rankedMedia, recordRoute: recordRoute, warmMirror: warmMirror,
    queue: function (body) {
      var prepared = query.get('iaPrepared');
      var preparedStart = prepared !== '0' && (wholeLineup || (prepared === '1' && ['10', '53', '150'].includes(String(body.channel))));
      return request('/ia/queue', Object.assign({}, body, { iaRepair: true, serverCatalog: true }, preparedStart ? { preparedStart: true } : {}));
    },
    client: function () { return client || (client = create({ journal: startJournal, queue: function (body) { return window.RealSignalIAShelf.queue(body); }, report: function (body) { return request('/ia/playback', body); } })); }
  };
})();
