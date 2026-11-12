import assert from 'node:assert/strict';
import test from 'node:test';
import { createBroadcastApp } from '../assets/broadcast-app.mjs';

const first = { id: 'first', kind: 'program', title: 'The live program', startsAt: 1000, endsAt: 2000 };
const second = { id: 'second', kind: 'program', title: 'The next program', startsAt: 2000, endsAt: 3000 };

function setup() {
  let time = 1500;
  let callbacks;
  const loads = [];
  const app = createBroadcastApp({
    now: () => time,
    fetchSchedule: async () => ({ stations: [{ channel: '10', slots: [first, second] }] })
  });
  const hooks = {
    isCurrent: () => true,
    makePlayer(options) {
      callbacks = options;
      return { load: (slot, live) => loads.push([slot?.id, live]), dispose() {} };
    },
    onFallback() {},
    onPlaying() {},
    onCard() {}
  };
  return { app, hooks, loads, setTime(value) { time = value; }, callbacks: () => callbacks };
}

test('the regular tuner and guide agree on the live program while Next is private', async t => {
  const { app, hooks, loads, setTime } = setup();
  t.after(() => app.stop());
  await app.refresh();
  assert.equal(app.tune('999', hooks), false);
  assert.match(app.listing(10).now, /The live program/);
  assert.match(app.listing(10).next, /The next program/);
  assert.equal(app.tune(10, hooks), true);
  assert.equal(app.next(), true);
  assert.equal(app.watchingAhead(), true);
  assert.match(app.listing(10).now, /The live program/);
  assert.equal(app.backToLive(), true);
  assert.deepEqual(loads, [['first', true], ['second', false], ['first', true]]);
  setTime(2001);
  app.update();
  assert.deepEqual(loads.at(-1), ['second', true]);
  assert.match(app.listing(10).now, /The next program/);
});

test('a failed shared program falls back once and the next window stays eligible', async t => {
  const { app, hooks, callbacks, setTime } = setup();
  t.after(() => app.stop());
  let fallback = 0;
  hooks.onFallback = () => { fallback++; };
  await app.refresh();
  app.tune(10, hooks);
  callbacks().onCard('Program temporarily unavailable');
  callbacks().onCard('Program temporarily unavailable');
  await Promise.resolve();
  assert.equal(fallback, 1);
  assert.equal(app.listing(10), null);
  assert.equal(app.tune(10, hooks), false);
  setTime(2001);
  assert.equal(app.tune(10, hooks), true);
});
