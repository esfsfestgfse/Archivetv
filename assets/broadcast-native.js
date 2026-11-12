/* Connect the shared clock to the existing RealSignal screen and guide. */
(function () {
  const query = new URLSearchParams(location.search);
  if (query.get('broadcast') === '0' || query.get('v6') === '0' || query.get('castReceiver') === '1') return;
  let app;
  let mount;

  function eligible(ch) {
    return ch && (!ch.source || ch.source === 'v2preview') && !marathonLock[ch.num] &&
      !window.__rsCastIsConnected?.();
  }

  const ready = import('./broadcast-app.mjs?v=7.2.0').then(module => {
    mount = module.mountBroadcastPlayer;
    app = module.createBroadcastApp({
      onGuideChange() {
        refreshGuideData();
        window.RealSignalGuide?.refresh();
        window.RealSignalWatchingShell?.refresh();
      }
    });
    return app.refresh();
  }).catch(() => false);
  setInterval(() => { if (powered && !document.hidden) app?.refresh(); }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    app?.update(true);
    app?.refresh();
  });

  function program(slot) {
    if (!slot) return null;
    return {
      id: String(slot.id),
      title: slot.kind === 'break' ? (slot.title || 'Commercial break') : slot.title,
      provider: slot.provider || (slot.kind === 'break' ? '' : 'Internet Archive'),
      durationSeconds: (slot.endsAt - slot.startsAt) / 1000,
      startsAt: slot.startsAt,
      isAd: slot.kind === 'break'
    };
  }

  function snapshot(ch, viewing) {
    if (!powered || !eligible(ch)) return null;
    if (viewing && ch.num === curNum && !app?.active()) return null;
    const timeline = app?.programs(ch.num, viewing);
    if (!timeline) return null;
    const current = program(timeline.slot);
    const position = timeline.position ?? (Number.isFinite(curVideo?.currentTime) ? curVideo.currentTime : null);
    return {
      channel: { number: ch.num, key: String(ch.key || ch.num), name: canonicalChannelLabel(ch), source: ch.source || 'archive' },
      current, next: program(timeline.next), later: program(timeline.later),
      state: viewing && sigText.textContent === 'TUNING' ? 'ready' : 'playing',
      live: !timeline.ahead, ready: null, capacity: null,
      position, remainingSeconds: position == null ? null : Math.max(0, current.durationSeconds - position)
    };
  }

  async function tune(ch, sl, owner) {
    if (!eligible(ch)) return false;
    if (!app?.received()) await withTO(app ? app.refresh() : ready, 1250).catch(() => false);
    function current() { return powered && owner === token && curNum === ch.num && eligible(ch); }
    if (!current() || !app?.current(ch.num)) return false;
    clearScreen();
    return app.tune(ch.num, {
      isCurrent: current,
      makePlayer: hooks => mount(screenArea, hooks, { muted, volume: vol, loadHls: loadHlsLib, onMuted: () => { if (current()) needSound(true); } }),
      onCard(message, slot) {
        curVideo = null;
        curItem = null;
        audioScreen.classList.add('hide');
        setSig('tuning', 'TUNING');
        showOv(slot?.kind === 'break' ? 'COMMERCIAL BREAK' : 'TUNING…', '', slot?.title || ch.nm);
      },
      onPlaying(slot, video) {
        if (curItem?.id === slot.id && curVideo === video) return;
        const item = program(slot);
        curVideo = video;
        curItem = { ...item, duration: item.durationSeconds, url: slot.url, ch: ch.num, chName: ch.nm,
          source: ch.source || 'archive', embedded: slot.mediaType === 'youtube', isAudio: slot.mediaType === 'audio' };
        hideOv();
        audioScreen.classList.toggle('hide', !curItem.isAudio);
        if (curItem.isAudio) { audioScreen.classList.remove('hasart'); audioTitle.textContent = item.title; }
        setSig('live', app.watchingAhead() ? 'WATCHING AHEAD' : 'ON AIR');
        showNow(ch, { ...sl, isAd: item.isAd }, item.title, item.provider);
        bug.classList.remove('hide');
        window.RealSignalWatchingShell?.refresh();
      },
      onFallback() { if (current()) tuneNum(ch.num, true); },
      onCaughtUp() { quickBanner('NO LATER PROGRAM IN THE GUIDE'); }
    });
  }

  window.RealSignalBroadcast = {
    tune, snapshot,
    listing: ch => powered && eligible(ch) ? app?.listing(ch.num) : null,
    active: () => !!app?.active(),
    stop: () => app?.stop(),
    next: () => app?.next(),
    backToLive: () => app?.backToLive(),
    watchingAhead: () => !!app?.watchingAhead()
  };
  window.backToSharedBroadcast = () => {
    if (app?.backToLive()) window.RealSignalWatchingShell?.refresh();
  };
})();
