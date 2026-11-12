import { retainPublishedSlots, slotAt } from './broadcast-clock.mjs';
import { createBroadcastPlayer } from './broadcast-player.mjs?v=7.2.1';

const scheduleUrl = 'https://realsignal-broadcast-canary.tdy1990.workers.dev/broadcast-schedule-v2.json';
const timeLabel = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

async function fetchPublishedSchedule() {
  const options = { credentials: 'omit', cache: 'no-cache', signal: AbortSignal.timeout(5000) };
  let response = await fetch(scheduleUrl, options);
  if (response.status === 404) response = await fetch(scheduleUrl.replace('-v2.json', '.json'), options);
  if (!response.ok) throw new Error('Broadcast schedule unavailable');
  return response.json();
}

function nextProgram(station, slot) {
  return station?.slots.find(row => row.kind === 'program' && row.startsAt > slot.startsAt);
}

export function createBroadcastApp({ fetchSchedule = fetchPublishedSchedule, now = Date.now, onGuideChange = () => {} } = {}) {
  let stations = new Map();
  const failedSlots = new Map();
  let active;
  let timer;
  let loading;
  let received = false;

  function current(channel) {
    const number = String(channel);
    const station = stations.get(number);
    const slot = station && slotAt(station, now())?.slot;
    const failed = failedSlots.get(number);
    if (slot && !(failed?.startsAt === slot.startsAt && failed?.url === slot.url)) return slot;
    return null;
  }

  function listing(channel) {
    const slot = current(channel);
    if (!slot) return null;
    const next = nextProgram(stations.get(String(channel)), slot);
    return {
      now: 'NOW · ' + (slot.kind === 'break' ? 'Commercial break' : slot.title),
      next: next ? 'NEXT ' + timeLabel.format(next.startsAt) + ' · ' + next.title : 'PROGRAM DATA PENDING',
      detail: 'SHARED BROADCAST' + (slot.provider ? ' · ' + slot.provider : ''),
      state: 'live', live: true, ready: null, capacity: null
    };
  }

  function programs(channel, viewing = false) {
    const number = String(channel);
    const live = current(number);
    if (!live) return null;
    const ahead = viewing && active?.channel === number ? active.ahead : null;
    const slot = ahead || live;
    const station = stations.get(number);
    const next = nextProgram(station, slot);
    return { slot, next, later: next && nextProgram(station, next),
      position: ahead ? null : Math.max(0, (now() - slot.startsAt) / 1000), ahead: !!ahead };
  }

  function refresh() {
    if (loading) return loading;
    loading = Promise.resolve().then(fetchSchedule).then(data => {
      if (!Array.isArray(data.stations)) return false;
      stations = new Map(data.stations.filter(row => Array.isArray(row.slots)).map(row => {
        const channel = String(row.channel);
        return [channel, { ...row, slots: retainPublishedSlots(stations.get(channel)?.slots || [], row.slots) }];
      }));
      received = true;
      update();
      onGuideChange();
      return true;
    }).catch(() => false).finally(() => { loading = null; });
    return loading;
  }

  function stop() {
    const session = active;
    active = null;
    clearInterval(timer);
    session?.player.dispose();
  }

  function fallback(session, failed) {
    if (active !== session) return;
    if (failed) failedSlots.set(session.channel, session.slot);
    stop();
    queueMicrotask(() => { if (session.hooks.isCurrent()) session.hooks.onFallback(); });
  }

  function update(force = false) {
    const session = active;
    if (!session) return;
    if (!session.hooks.isCurrent()) { stop(); return; }
    const slot = session.ahead || current(session.channel);
    if (!slot) { fallback(session, false); return; }
    const changed = session.slot !== slot;
    session.slot = slot;
    session.player.load(slot, !session.ahead, force);
    if (changed) onGuideChange();
  }

  function tune(channel, hooks) {
    if (!current(channel)) return false;
    stop();
    const session = { channel: String(channel), hooks, ahead: null, slot: null };
    session.player = hooks.makePlayer({
      onCard(message) {
        if (active !== session || !hooks.isCurrent()) return;
        if (message === 'Program temporarily unavailable') {
          if (session.ahead) backToLive();
          else fallback(session, true);
        } else hooks.onCard(message, session.slot);
      },
      onPlaying(slot, video) {
        if (active === session && hooks.isCurrent()) hooks.onPlaying(slot, video);
      },
      onEnded(slot, live) {
        if (active !== session || !hooks.isCurrent()) return;
        if (!live) {
          session.ahead = nextProgram(stations.get(session.channel), slot) || null;
          update(true);
        } else if (slot.endsAt - now() > 2000 && slot.kind === 'program') fallback(session, true);
        else if (now() < slot.endsAt) hooks.onCard('Station break', slot);
        else update();
      }
    });
    active = session;
    timer = setInterval(() => update(), 500);
    update();
    return true;
  }

  function next() {
    if (!active) return false;
    const slot = nextProgram(stations.get(active.channel), active.slot);
    if (slot) {
      active.ahead = slot;
      update(true);
    } else active.hooks.onCaughtUp?.();
    return true;
  }

  function backToLive() {
    if (!active?.ahead) return false;
    active.ahead = null;
    update(true);
    return true;
  }

  return {
    tune, stop, refresh, update, current, listing, programs, next, backToLive,
    active: () => !!active, watchingAhead: () => !!active?.ahead, received: () => received
  };
}

export function mountBroadcastPlayer(container, hooks, { muted, volume, loadHls, onMuted }) {
  const video = document.createElement('video');
  video.playsInline = true;
  video.volume = volume;
  video.muted = muted;
  const embedHost = document.createElement('div');
  embedHost.style.cssText = 'position:absolute;inset:0';
  embedHost.hidden = true;
  container.append(video, embedHost);

  const embed = {
    async play({ slot, current, startSeconds, onPlaying, onEnded, onFailure }) {
      const sdk = slot.mediaType === 'ok' ? window.RealSignalOKEmbed
        : slot.mediaType === 'vimeo' ? window.RealSignalVimeoEmbed : window.RealSignalYouTubeEmbed;
      if (!sdk) { onFailure(); return; }
      embedHost.hidden = false;
      const result = await sdk.play({
        item: { embedUrl: slot.url, title: slot.title }, container: embedHost,
        isCurrent: current, startSeconds, muted: video.muted, volume: video.volume,
        onReady() {}, onStarted: onPlaying, onEnded, onError: onFailure, onPending: onFailure, onMuted
      });
      if (current() && (result === false || result?.status === 'unavailable')) onFailure();
    },
    stop() {
      window.RealSignalYouTubeEmbed?.stop();
      window.RealSignalOKEmbed?.stop();
      window.RealSignalVimeoEmbed?.stop();
      embedHost.replaceChildren();
      embedHost.hidden = true;
    }
  };
  const player = createBroadcastPlayer({
    video, embed,
    async playVideo(element) {
      try { await element.play(); }
      catch (error) {
        if (error?.name !== 'NotAllowedError' || element.muted) throw error;
        element.muted = true;
        await element.play();
        onMuted();
      }
    },
    async attachHls(element, url, options) {
      const runtime = window.RealSignalPeerTubeMedia;
      if (!runtime) { options.onError(); return; }
      runtime.attach(element, url, { ...options, loadHls });
    },
    onCard(message) { video.style.display = 'none'; hooks.onCard(message); },
    onPlaying(slot) {
      const embedded = ['youtube', 'ok', 'vimeo'].includes(slot.mediaType);
      video.style.display = embedded || slot.mediaType === 'audio' ? 'none' : '';
      hooks.onPlaying(slot, embedded ? null : video);
    },
    onEnded: hooks.onEnded
  });
  return {
    load: player.load,
    dispose() {
      player.dispose();
      video.removeAttribute('src');
      video.load();
      video.remove();
      embedHost.remove();
    }
  };
}
