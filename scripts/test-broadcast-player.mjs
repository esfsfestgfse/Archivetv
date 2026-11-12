import assert from 'node:assert/strict';
import test from 'node:test';
import { createBroadcastPlayer } from '../assets/broadcast-player.mjs';

function fixture() {
  class Video extends EventTarget {
    currentTime = 0;
    duration = 1200;
    videoWidth = 640;
    videoHeight = 480;
    paused = true;
    starts = [];
    src = '';
    load() { this.currentTime = 0; }
    pause() { this.paused = true; }
    removeAttribute() { this.src = ''; }
    play() {
      this.paused = false;
      return new Promise((resolve, reject) => this.starts.push({ resolve, reject }));
    }
  }
  const video = new Video(), cards = [], pictures = [], ended = [], timers = new Map();
  let serial = 0;
  let clock = 100_000;
  const player = createBroadcastPlayer({
    video, now: () => clock,
    onCard: message => cards.push(message), onPlaying: slot => pictures.push(slot.id),
    onEnded: slot => ended.push(slot.id),
    setTimer: fn => { const id = ++serial; timers.set(id, fn); return id; },
    clearTimer: id => timers.delete(id)
  });
  const a = { id: 'a', kind: 'program', url: 'https://archive.org/a.mp4', startsAt: 0, endsAt: 1200_000 };
  const b = { ...a, id: 'b', url: 'https://archive.org/b.mp4', startsAt: 50_000 };
  const emit = name => video.dispatchEvent(new Event(name));
  return { player, video, cards, pictures, ended, timers, a, b, emit, advance: ms => { clock += ms; } };
}

test('a rejected play promise from the old station cannot pause or hide the new picture', async () => {
  const h = fixture();
  h.player.load(h.a, true); h.emit('loadedmetadata');
  const old = h.video.starts[0];
  h.player.load(h.b, true); h.emit('loadedmetadata'); h.emit('playing');
  const cards = h.cards.length;
  old.reject(new Error('superseded'));
  await Promise.resolve();
  assert.equal(h.video.paused, false);
  assert.equal(h.cards.length, cards);
  assert.deepEqual(h.pictures, ['b']);
});

test('a queued old timeout cannot cancel a new station or remove its event handlers', () => {
  const h = fixture();
  h.player.load(h.a, true);
  const oldDeadline = [...h.timers.values()][0];
  h.player.load(h.b, true);
  oldDeadline();
  h.emit('loadedmetadata'); h.emit('playing');
  assert.equal(h.video.paused, false);
  assert.deepEqual(h.pictures, ['b']);
});

test('live joins seek by the clock while watch-ahead starts at zero and Back to Live resynchronizes', () => {
  const h = fixture();
  h.player.load(h.a, true); h.emit('loadedmetadata');
  assert.equal(h.video.currentTime, 100);
  h.player.load(h.b, false); h.emit('loadedmetadata');
  assert.equal(h.video.currentTime, 0);
  h.advance(20_000);
  h.player.load(h.a, true, true); h.emit('loadedmetadata');
  assert.equal(h.video.currentTime, 120);
});

test('failed commercials show a card and leave the next scheduled program playable', () => {
  const h = fixture();
  const ad = { ...h.a, id: 'spot', kind: 'break' };
  h.player.load(ad, true); h.emit('error');
  assert.match(h.cards.at(-1), /Commercial break/);
  h.player.load(h.b, true); h.emit('loadedmetadata'); h.emit('playing'); h.emit('ended');
  assert.deepEqual(h.pictures, ['b']);
  assert.deepEqual(h.ended, ['b']);
});

test('audio-only and portrait decodes never become a visible television picture', () => {
  for (const [width, height] of [[0, 0], [480, 640]]) {
    const h = fixture();
    h.player.load(h.a, true);
    h.video.videoWidth = width; h.video.videoHeight = height;
    h.emit('loadedmetadata'); h.emit('playing');
    assert.deepEqual(h.pictures, []);
    assert.equal(h.video.paused, true);
  }
});

test('an audio broadcast joins at the scheduled offset without a video track', () => {
  const h = fixture();
  h.video.videoWidth = 0;
  h.video.videoHeight = 0;
  h.player.load({ ...h.a, mediaType: 'audio', url: 'https://archive.org/track.mp3' }, true);
  h.emit('loadedmetadata');
  h.emit('playing');
  assert.equal(h.video.currentTime, 100);
  assert.deepEqual(h.pictures, ['a']);
  assert.equal(h.video.paused, false);
});

test('a slow live start catches up before revealing the picture', () => {
  const h = fixture();
  h.player.load(h.a, true); h.emit('loadedmetadata');
  h.advance(5_000);
  h.emit('playing');
  assert.equal(h.video.currentTime, 105);
  assert.deepEqual(h.pictures, []);
  h.emit('seeked');
  assert.deepEqual(h.pictures, ['a']);
});

test('a stall has a bounded wait and can still advance to the next scheduled source', () => {
  const h = fixture();
  h.player.load(h.a, true); h.emit('loadedmetadata'); h.emit('playing'); h.emit('waiting');
  assert.equal(h.timers.size, 1);
  [...h.timers.values()][0]();
  assert.equal(h.video.paused, true);
  h.player.load(h.b, true); h.emit('loadedmetadata'); h.emit('playing');
  assert.deepEqual(h.pictures, ['a', 'b']);
});
