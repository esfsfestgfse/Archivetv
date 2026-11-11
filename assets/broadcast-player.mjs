/* Each source owns its callbacks, timer and decoded picture. */
export function createBroadcastPlayer({ video, now = Date.now, onCard, onPlaying, onEnded,
  setTimer = setTimeout, clearTimer = clearTimeout }) {
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
    video.pause();
    video.removeAttribute('src');
    video.load();
    onCard(slot?.kind === 'break' ? 'Commercial break' : slot ? 'Tuning…' : 'Schedule window ended');
    if (!slot?.url) return;
    events = new AbortController();
    const { signal } = events;
    const current = () => generation === currentGeneration;
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
      if (!(video.duration > offset) || !(video.videoWidth > 0) || video.videoHeight > video.videoWidth) {
        failed();
        return;
      }
      if (offset > 0) video.currentTime = offset;
      video.play().catch(failed);
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
    video.src = slot.url;
    video.load();
  }

  function dispose() {
    generation++;
    cleanup();
    video.pause();
  }
  return { load, dispose };
}
