/* Official Vimeo Player SDK. No token, media extraction, or duration timer. */
(function (root) {
  'use strict';
  var active = null, sdk = null;
  function qualify(profile, item) {
    if (!item) return false;
    var identity = [item.title, item.description, item.tags, item.category, item.account].join(' ');
    if (/\b(?:wedding|weddings|videography|satsang|sermon|church service|bible study|meditation session|dj set|concert|gaming|gameplay|livestream|live stream|webinar|seminar|conference|keynote|growth mindset|fixed mindset|business presentation|podcast|fan[ -]?made|parody|television restoration|tv restoration|sample episode|full episode sample)\b/i.test(identity)) return false;
    if (profile.intent !== 'television') return true;
    if (/\b(?:anime|animation|animated|cartoon|miraculous|zombizou|watamote|crayon shin[ -]?chan)\b/i.test(identity)) return false;
    if (item.seriesId) return true;
    var name = String(item.title || '').split(/\b(?:s\d{1,2}[ ._-]*e\d{1,3}|episode\s*\d+|ep\.?\s*\d+|season\s*\d+|full pilot episode|full episode)\b/i)[0].replace(/^[\s\-:]+|[\s\-:]+$/g, '').trim();
    return name.length >= 3 && !/^(?:episode|pilot|season|television|tv show|series)$/i.test(name) && /\b(?:original (?:series|show)|web series|written by|writer|direct(?:or|ed)|producer|produced|production|created (?:by|for)|crew|cast|screenplay|starring|scripted|drama series|comedy series|docureality television series)\b/i.test(String(item.description || ''));
  }
  function loadSDK() {
    if (root.Vimeo && root.Vimeo.Player) return Promise.resolve(root.Vimeo.Player);
    if (!sdk) sdk = new Promise(function (resolve, reject) {
      var script = document.createElement('script'), timer;
      function finish(error) { clearTimeout(timer); script.onload = script.onerror = null; if (error) { sdk = null; script.remove(); reject(error); } else resolve(root.Vimeo.Player); }
      script.src = 'https://player.vimeo.com/api/player.js';
      script.onload = function () { finish(root.Vimeo && root.Vimeo.Player ? null : new Error('Vimeo SDK unavailable')); };
      script.onerror = function () { finish(new Error('Vimeo SDK unavailable')); };
      timer = setTimeout(function () { finish(new Error('Vimeo SDK timeout')); }, 10000);
      document.head.appendChild(script);
    });
    return sdk;
  }
  function stop() { if (active) active.cleanup(); }
  function volume(level, muted) { if (active && active.player) active.player.setVolume(muted ? 0 : Math.max(0, Math.min(1, Number(level) || 0))).catch(function () {}); }
  function toggle() {
    if (!active || !active.player) return false;
    var state = active;
    state.player.getPaused().then(function (paused) { if (active === state) return paused ? state.player.play() : state.player.pause(); }).catch(function () {});
    return true;
  }
  function play(options) {
    stop();
    return new Promise(function (resolve) {
      var frame = document.createElement('iframe'), player = null, disposed = false, ready = false, playing = false, advanced = false, settled = false;
      var state = { player: null, cleanup: cleanup }, handlers = {}, timer;
      function settle(value) { if (!settled) { settled = true; resolve(value); } }
      function current() { return !disposed && active === state && options.isCurrent(); }
      function cleanup() {
        if (disposed) return;
        disposed = true; clearTimeout(timer);
        if (player) { Object.keys(handlers).forEach(function (event) { player.off(event, handlers[event]); }); player.destroy().catch(function () {}); }
        frame.remove();
        if (active === state) active = null;
        settle(false);
      }
      function fail(error) {
        if (!current()) return;
        if (root.console && root.console.warn) root.console.warn('Vimeo player failed:', options.item.id, error && error.message || 'unknown player error');
        var wasReady = ready;
        cleanup();
        if (wasReady && options.onError) options.onError(error);
      }
      function started() {
        if (!current() || playing) return;
        playing = true; frame.dataset.playbackState = 'playing';
        if (options.onStarted) options.onStarted();
      }
      var url;
      try { url = new URL(options.item.embedUrl || options.item.url); } catch (_) { settle(false); return; }
      if (url.origin !== 'https://player.vimeo.com' || !/^\/video\/\d+$/.test(url.pathname)) { settle(false); return; }
      url.searchParams.set('autoplay', '1'); url.searchParams.set('muted', '1'); url.searchParams.set('playsinline', '1'); url.searchParams.set('loop', '0');
      frame.title = options.item.title || 'Vimeo program'; frame.src = url.href;
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin'; frame.dataset.playbackState = 'loading';
      // Keep the native Play control visible if the browser blocks autoplay.
      options.container.appendChild(frame); active = state;
      timer = setTimeout(function () { if (!ready) fail(new Error('Vimeo player readiness timeout')); }, 20000);
      loadSDK().then(function (Player) {
        if (!current()) { cleanup(); return; }
        player = new Player(frame); state.player = player;
        // A play command/event can precede decoded video. Promote only when
        // the official player reports advancing media time.
        handlers.timeupdate = function (data) { if (Number(data && data.seconds) > 0) started(); };
        handlers.ended = function () { if (current() && playing && !advanced) { advanced = true; if (options.onEnded) options.onEnded(); } };
        handlers.error = fail;
        Object.keys(handlers).forEach(function (event) { player.on(event, handlers[event]); });
        return player.ready().then(function () {
          if (!current()) { cleanup(); return; }
          ready = true; clearTimeout(timer); if (!playing) frame.dataset.playbackState = 'ready';
          if (options.onReady) options.onReady(); settle(true);
          // Muted autoplay is permitted on more browsers. User volume/mute
          // controls can subsequently request sound through the same SDK.
          player.play().catch(function (error) { if (error && error.name !== 'NotAllowedError') fail(error); });
        });
      }).catch(fail);
    });
  }
  root.RealSignalVimeoEmbed = { play: play, stop: stop, volume: volume, toggle: toggle, qualify: qualify };
})(window);
