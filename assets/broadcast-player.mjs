/* Each source owns its callbacks, timer and decoded picture. */
export function createBroadcastPlayer({ video, now = Date.now, onCard, onPlaying, onEnded,
  setTimer = setTimeout, clearTimer = clearTimeout, embed, attachHls, playVideo = element => element.play() }) {
  let loaded;
  let generation = 0;
  let events;
  let deadline;

  function cleanup() {
    events?.abort();
    clearTimer(deadline);
  }

  function load(slot, live, force = false) {
    if (!force && loaded === slot) return;
    loaded = slot;
    const currentGeneration = ++generation;
    cleanup();
    embed?.stop();
    video.pause();
    video.removeAttribute('src');
    video.load();
    onCard(slot?.kind === 'break' ? 'Commercial break' : slot ? 'Tuning…' : 'Schedule window ended');
    if (!slot?.url) return;
    const current = () => generation === currentGeneration;
    if (slot.mediaType === 'youtube') {
      if (!embed) {
        onCard('Program temporarily unavailable');
        return;
      }
      const showFailure = () => { if (current()) onCard('Program temporarily unavailable'); };
      embed.play({ slot, current, startSeconds: () => live ? Math.max(0, (now() - slot.startsAt) / 1000) : 0,
        onPlaying: () => { if (current()) onPlaying(slot); },
        onEnded: () => { if (current()) onEnded(slot, live); },
        onFailure: showFailure }).catch(showFailure);
      return;
    }
    events = new AbortController();
    const { signal } = events;
    let playing = false;
    function failed() {
      if (!current()) return;
      cleanup();
      video.pause();
      video.removeAttribute('src');
      video.load();
      onCard(slot.kind === 'break' ? 'Commercial break' : 'Program temporarily unavailable');
    }
    deadline = setTimer(failed, 6500);
    video.addEventListener('error', failed, { signal, once: true });
    video.addEventListener('loadedmetadata', () => {
      if (!current()) return;
      const offset = live ? Math.max(0, (now() - slot.startsAt) / 1000) : 0;
      const pictureRequired = slot.mediaType !== 'audio';
      if (!(video.duration > offset) ||
          (pictureRequired && (!(video.videoWidth > 0) || video.videoHeight > video.videoWidth))) {
        failed();
        return;
      }
      if (offset > 0) video.currentTime = offset;
      playVideo(video).catch(failed);
    }, { signal, once: true });
    function showPicture() {
      if (!current()) return;
      clearTimer(deadline);
      if (live) {
        const offset = Math.max(0, (now() - slot.startsAt) / 1000);
        if (now() >= slot.endsAt || offset >= video.duration) {
          failed();
          onEnded(slot, true);
          return;
        }
        if (Math.abs(video.currentTime - offset) > 2) {
          deadline = setTimer(failed, 5000);
          video.currentTime = offset;
          return;
        }
      }
      onPlaying(slot);
    }
    video.addEventListener('playing', () => {
      playing = true;
      showPicture();
    }, { signal });
    video.addEventListener('seeked', () => { if (playing) showPicture(); }, { signal });
    for (const event of ['waiting', 'stalled']) video.addEventListener(event, () => {
      if (!current()) return;
      clearTimer(deadline);
      deadline = setTimer(failed, 5000);
    }, { signal });
    video.addEventListener('ended', () => {
      if (current()) onEnded(slot, live);
    }, { signal });
    if (slot.mediaType === 'hls') {
      if (!attachHls) { failed(); return; }
      attachHls(video, slot.url, { signal, isCurrent: current, onReady() {}, onError: failed }).catch(failed);
    } else {
      video.src = slot.url;
      video.load();
    }
  }

  function dispose() {
    generation++;
    cleanup();
    embed?.stop();
    video.pause();
  }
  return { load, dispose };
}
