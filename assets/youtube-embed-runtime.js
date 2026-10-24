/* Official IFrame API ownership. Readiness is not playback or a visible frame. */
(function (root) {
  'use strict';
  var active = null, sdk = null;
  function loadSDK() {
    if (root.YT && root.YT.Player) return Promise.resolve(root.YT.Player);
    if (!sdk) sdk = new Promise(function (resolve, reject) {
      var script = document.createElement('script'), previous = root.onYouTubeIframeAPIReady, timer, finished = false;
      function finish(error) {
        if (finished) return;
        finished = true; clearTimeout(timer); script.onerror = null;
        if (root.onYouTubeIframeAPIReady === ready) root.onYouTubeIframeAPIReady = previous;
        if (error) { sdk = null; script.remove(); reject(error); }
        else resolve(root.YT.Player);
      }
      function ready() {
        try { if (typeof previous === 'function') previous(); } catch (_) {}
        finish(root.YT && root.YT.Player ? null : new Error('YouTube SDK unavailable'));
      }
      root.onYouTubeIframeAPIReady = ready;
      script.src = 'https://www.youtube.com/iframe_api'; script.async = true;
      script.onerror = function () { finish(new Error('YouTube SDK unavailable')); };
      timer = setTimeout(function () { finish(new Error('YouTube SDK timeout')); }, 8000);
      document.head.appendChild(script);
    });
    return sdk;
  }
  function stop() { if (active) active.cleanup(); }
  function volume(level, muted) {
    if (!active) return false;
    active.level = level; active.muted = !!muted;
    if (!active.player || !active.ready) return false;
    try {
      active.player.setVolume(Math.round(Math.max(0, Math.min(1, Number(level) || 0)) * 100));
      if (muted) active.player.mute(); else active.player.unMute();
      return true;
    } catch (_) { return false; }
  }
  function toggle() {
    if (!active || !active.player || !active.ready) return false;
    try { if (active.player.getPlayerState() === 1) active.player.pauseVideo(); else active.player.playVideo(); } catch (_) {}
    return true;
  }
  function play(options, retried) {
    stop();
    return new Promise(function (resolve) {
      var url;
      try { url = new URL(options.item.embedUrl || options.item.url); } catch (_) { resolve({status:'unavailable'}); return; }
      if (!/^https:\/\/www\.youtube(?:-nocookie)?\.com$/.test(url.origin) || !/^\/embed\/[A-Za-z0-9_-]{11}$/.test(url.pathname)) { resolve({status:'unavailable'}); return; }
      var frame = document.createElement('iframe'), player = null, disposed = false, settled = false, started = false, advanced = false, mutedRetry = false, lastTime = null, timer, mountGuard, clock, restarting = false;
      var state = {player:null, ready:false, level:options.volume, muted:!!options.muted, cleanup:cleanup};
      function current() { return !disposed && active === state && options.isCurrent(); }
      function settle(status, code) { if (!settled) { settled = true; resolve({status:status, code:code}); } }
      function cleanup() {
        if (disposed) return;
        disposed = true; clearTimeout(timer); clearTimeout(mountGuard); clearInterval(clock);
        if (player) { try { player.destroy(); } catch (_) {} }
        frame.remove(); if (active === state) active = null;
        if (!restarting) settle('cancelled');
      }
      function pending(code) {
        if (!current()) return;
        clearTimeout(timer); clearTimeout(mountGuard); frame.dataset.playbackState = 'pending';
        settle('pending', code); if (options.onPending) options.onPending({code:code, ready:state.ready});
        // Keep the native controls and event owner alive for a later user Play.
      }
      function fail(event) {
        if (!current()) return;
        var code = Number(event && event.data), unavailable = code === 100 || code === 101 || code === 150;
        if (!unavailable) { pending(code || 'player-error'); return; }
        var needsNotice = started || settled;
        settle('unavailable', code); cleanup();
        if (needsNotice && options.onError) options.onError({code:code});
      }
      function sample() {
        if (!current()) { cleanup(); return; }
        if (!state.ready || started) return;
        try {
          var time = Number(player.getCurrentTime());
          if (player.getPlayerState() !== 1 || !Number.isFinite(time)) { lastTime = null; return; }
          if (lastTime !== null && time - lastTime >= 0.05) {
            started = true; clearTimeout(timer); clearInterval(clock); frame.dataset.playbackState = 'playing';
            if (options.onStarted) options.onStarted(); settle('playing');
          }
          lastTime = time;
        } catch (_) {}
      }
      url.searchParams.set('autoplay', '1'); url.searchParams.set('controls', '1');
      url.searchParams.set('enablejsapi', '1'); url.searchParams.set('playsinline', '1');
      url.searchParams.set('origin', root.location.origin);
      frame.src = url.href; frame.title = options.item.title || 'YouTube program';
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin'; frame.dataset.playbackState = 'loading';
      frame.dataset.playbackMount = retried ? '2' : '1';
      options.container.appendChild(frame); active = state;
      timer = setTimeout(function () { pending('startup-timeout'); }, 12000);
      if (!retried) mountGuard = setTimeout(function () {
        if (!current() || state.ready) return;
        restarting = true; cleanup();
        play(Object.assign({}, options, {volume:state.level, muted:state.muted}), true).then(function (result) { settle(result.status, result.code); });
      }, 4000);
      clock = setInterval(sample, 200);
      loadSDK().then(function (Player) {
        if (!current()) { cleanup(); return; }
        player = new Player(frame, {events:{
          onReady:function (event) {
            if (!current()) return;
            player = event.target; state.player = player; state.ready = true;
            clearTimeout(mountGuard);
            frame.dataset.playbackState = 'ready'; volume(state.level, state.muted);
            if (options.onReady) options.onReady();
            player.playVideo(); sample();
          },
          onStateChange:function (event) {
            if (!current()) return;
            if (Number(event.data) === 0 && started && !advanced) { advanced = true; if (options.onEnded) options.onEnded(); }
            else sample();
          },
          onAutoplayBlocked:function () {
            if (!current() || mutedRetry || !player) return;
            mutedRetry = true; player.mute(); player.playVideo();
            if (options.onMuted) options.onMuted();
          },
          onError:fail
        }});
        state.player = player;
      }).catch(function () { pending('sdk-unavailable'); });
    });
  }
  root.RealSignalYouTubeEmbed = {play:play, stop:stop, volume:volume, toggle:toggle};
})(window);
