# RealSignal 2.0 readiness

Build under test: `1.9.7-desktop.174-source-suite-depth` and `1.9.7-mobile.174-source-suite-depth`.

Current production Worker: v172 (`64d89292-9dd0-4b8b-87f4-b586c720074c`). This document records the cumulative v167–v172 long-tail IA hardening chain plus the v174 Source Suite depth repair. The client stamp is 174 for the shared desktop/mobile Source Suite build.

## What is covered

- IA queue rotation, fallback refill, episode expansion, title identity, and genre locks.
- Source Suite five-item ready buffer, catalog retention, YouTube/PeerTube language and aspect-ratio rules, and fast-start hydration.
- Guide incremental rendering, stable row identity, open/close behavior, and Next/channel ordering.
- Commercial video-only rules, seven-day freshness history, and long-program ad budgeting.
- Radio, live-data lifecycle guards, cast race/standby handling, media resolution, and desktop/mobile parity.
- Local-only Release 2 telemetry for tune latency, first visible frame, stalls, media errors, repeats, and source recovery.

## Measured results in this pass

The deterministic regression suite passed across desktop and mobile. The v172 Source Suite browser proof measured:

| Surface | First program | Full catalog |
| --- | ---: | ---: |
| Desktop | 34 ms | 102 ms |
| Mobile | 10 ms | 98 ms |
| Cartoon Time Machine browser catalog | 13 verified items | 10 YouTube + 3 PeerTube |

Guide open/close completed in under 30 ms in the visible-playback harness for the sampled lanes.

The focused Chrome visible-frame probe reached a first visible frame on all five sampled IA/Source lanes (`12,75,104,219,555`) with no browser errors. Cold starts were approximately 2.28 seconds at the median across that earlier sample; one warm shelf promoted a frame in 5 ms. The queue soak and browser frame are recorded separately because queue readiness is not proof that a media element has painted.

## Release gates

Before calling 2.0 production-ready, run the telemetry-enabled build in a normal browser/network session:

1. Tune representative IA, Source Suite, sports, radio, and live-data channels.
2. Exercise Next, rapid channel changes, and guide open/close.
3. Capture `window.__rsRelease2Telemetry.summary()` after each lane rotation.
4. Confirm every sampled TV lane gets a visible video frame, Source Suite reaches five distinct queued items, and no lane produces a dead signal after recovery.
5. Confirm commercials remain visible video on TV channels and audio-only on radio.
6. Record provider failures separately from application failures; patch only failures that reproduce with a valid provider response.

## 2.0 structure

- `release2-runtime.js`: opt-in local telemetry and online/visibility recovery hook.
- `the_dial_desktop.html` / `the_dial_mobile.html`: shared playback, guide, catalog, ad, and cast behavior with aligned build stamps.
- `scripts/`: deterministic contracts plus the visible-frame probe.
- `docs/`: deployment and operational runbooks.

The remaining release gate is the full scheduled IA workflow plus a longer Source Suite freshness run. If provider results remain empty there, investigate relay credentials, upstream availability, and browser/network policy before changing channel ranking or queue logic.

## Focused long-tail IA pass — v171

This pass is intentionally selective. It changes only lanes that reproduced underfill or repeat-heavy rotation in the v166 long-tail soak.

Pre-patch evidence from 20 sampled lanes, three five-item rotations, serial load:

| Measure | Result |
| --- | ---: |
| First-play ready | 20/20 |
| Full-depth lanes | 19/20 |
| Full-depth rotations | 58/60 |
| Duplicate items | 116 |
| Timeouts | 0 |
| Average queue readiness | 67 ms (27–196 ms) |

The delayed retest reproduced the repeat loop on Festival Circuit (117), Museum of Motion (240), Christmas Channel (700), and Soul Train Vault (927): each filled its shelf but retained the same emergency five across later rotations. Game Show (12) also reproduced a four-item shelf in one rotation. These are real catalog/shelf problems, not relay timeouts.

### Lanes changed

- `12` Game Show Channel — removed the invalid Concentration direct URL that returned 404; the remaining verified game-show shelf is allowed to hydrate normally.
- `77` Grand Prix — expanded the emergency shelf with distinct Formula One races/highlights across 1985–2001.
- `102` Western Channel — expanded with additional verified western films and runtime-hydrated candidates.
- `117` The Festival Circuit — added distinct festival and independent-film candidates.
- `202` Joke Joint — added distinct comedy specials/sketch candidates, including episode-level collection entries.
- `238` The Reading Room — added direct book discussions, author readings, poetry, and literature lectures so the shelf is not limited to five unresolved book-talk IDs.
- `239` Design & Architecture — replaced unresolved-only additions with verified architecture, preservation, planning, and public-works media.
- `240` Museum of Motion — replaced the unauthorized/invalid direct WCFTR item with a runtime-hydrated candidate and added verified early-cinema/film-preservation items.
- `700` Christmas Channel — replaced the unauthorized/invalid Funny or Die direct item with a runtime-hydrated candidate and added holiday films/specials across eras.
- `901` Rock — added a broader runtime-hydrated music shelf across classic rock, live performance, radio, and newer recordings.
- `927` Soul Train Vault — expanded with distinct episode-level Soul Train entries from the 1970s and 1980s.

The v168 acceptance run then identified a separate repeat cluster. v169 added direct media for additional Britcom episodes (`122`), comedy sketch/stand-up entries (`202`), and reggae/dub audio items (`915`). v170 completes Game Show's fallback bank with byte-range-verified episodes and adds three verified Britcom programs. No changes were made to lanes that only had a single transient timeout or that improved to distinct 15-item rotation shelves.

Direct media entries are only promoted when byte-range probing returns a playable response; ID-only candidates remain eligible for the normal Internet Archive file resolver. The eleven lanes above now have wider candidate banks without changing the channel rules for any clean lane. Channels `63`, `101`, `103`, `105`, `508`, `510`, and `702` were measured but left unchanged because their evidence did not reproduce a persistent underfill or repeat failure in the focused pass.

### v171 acceptance sweep command

Run after the Worker deploy and record the resulting JSON alongside this document:

```powershell
node scripts\soak-ia-queues.js --manifest C:\Users\tdy19\Documents\Codex\ia-manifest-153.json --channels 12,63,77,101,102,103,105,117,122,202,238,239,240,508,510,700,702,901,915,927 --count 5 --require-ready 1 --rotations 3 --rotation-delay-ms 3000 --concurrency 1 --timeout-ms 15000 --depth-timeout-ms 6000 --poll-ms 1000 --out C:\Users\tdy19\Documents\Codex\2026-08-14\can\ia-long-tail-v171-pass1.json
node scripts\analyze-ia-soak.js C:\Users\tdy19\Documents\Codex\2026-08-14\can\ia-long-tail-v171-pass1.json C:\Users\tdy19\Documents\Codex\ia-manifest-153.json
```

The release gate is: no timeout, no underfilled shelf, distinct rotation shelves for the repaired lanes, and no newly introduced failure in the measured clean lanes. Queue readiness is not the same as a visible DOM frame; the latter still requires a real browser/device telemetry run.

### v171 final focused result

Report: `C:\Users\tdy19\Documents\Codex\2026-08-14\can\ia-long-tail-v171-focus.json`.

| Measure | Result |
| --- | ---: |
| First-play ready | 6/6 |
| Full-depth rotations | 18/18 |
| Underfilled lanes | 0 |
| No-signal lanes | 0 |
| Timeouts | 0 |
| Duplicate items | 6 |
| Average first-play readiness | 194 ms (149–287 ms) |

The analyzer reports 15 unique items across the three rotations for Reading Room (`238`), Design & Architecture (`239`), and Reggae & Dub (`915`). Game Show (`12`), Britcom (`122`), and Joke Joint (`202`) each provide 13 unique items across the 15 observed slots; the remaining two repeats are normal shelf wraparound, with no underfill or failed start. All six repaired lanes reached five ready items on every rotation.

## Monitoring and repair runbook

Use the same commands for nightly or pre-release checks. The scheduled guard is `.github/workflows/ia-health.yml` (one paced run nightly, plus manual dispatch). Keep reports timestamped and do not treat a single provider outage as a channel-ranking regression.

```powershell
node scripts\check-worker-contract.js
node scripts\test-ia-collection-depth.js
node scripts\test-release2-runtime.js
node scripts\probe-emergency-urls.js <identifier> ...
node scripts\soak-ia-queues.js --manifest C:\Users\tdy19\Documents\Codex\ia-manifest-153.json --channels <comma-separated-lanes> --count 5 --require-ready 1 --rotations 3 --concurrency 1 --timeout-ms 15000 --depth-timeout-ms 6000 --poll-ms 1000 --out <report.json>
node scripts\analyze-ia-soak.js <report.json> C:\Users\tdy19\Documents\Codex\ia-manifest-153.json
```

Monitor these signals: first visible frame, tune latency, ready depth, full item depth, duplicate count, media errors, stalls, provider response status, and no-signal recovery. Patch only a lane that fails twice under separate rotations or fails a direct-media probe; retain short cooldowns and the last-good shelf for transient upstream outages.

## v172 selective long-tail acceptance

The v172 relay repair changed two narrow failure points: playable depth is now counted from hydrated media URLs rather than unresolved identifiers, and the five repeat-heavy recovery lanes carry verified IA derivatives into the background shelf. No other IA lane was changed from the overloaded full sweep.

The seven-lane proof (`74,75,104,219,228,229,236`) reached 7/7 first-play ready, 21/21 full-depth rotations, 0 timeouts, and 214 ms average first-play readiness before the final derivative refinement. The final five-lane proof (`75,104,219,228,229`) reached 5/5 first-play ready, 15/15 full-depth rotations, 0 no-signal lanes, 0 timeouts, 6 duplicate items across 15 rotations, and 237 ms average first-play readiness (188–336 ms). Regatta, Vintage Local News, and Deadline produced 15 unique items each; Music Films and The Chronicle produced 11 and 13 unique items respectively.

Reports:

- `C:\Users\tdy19\Documents\Codex\2026-08-14\can\ia-repeat-cluster-v172-final.json`
- `C:\Users\tdy19\Documents\Codex\2026-08-14\can\ia-repeat-cluster-v172-final3.json`

The full 171-channel run remains a saturation diagnostic: it measured first-play readiness and queue depth under simultaneous load, while the serial v172 proofs determine whether a lane defect is reproducible. Queue readiness is still distinct from a visible browser frame; the nightly workflow records the former, and `release2-runtime.js` records the latter when run in a real browser/device session.

## v174 Source Suite depth and freshness pass

The Source Suite cold-start probe reproduced the original shallow-catalog failure on Cartoon Time Machine and a separate false-positive/underfill pattern on Cook's Table: the client was treating a two-item cache as healthy, the final metadata gate was rejecting valid long-form provider records, and practical queries were allowing unrelated PeerTube science/technology records through. The fix is shared by desktop and mobile:

- source caches now require five qualified catalog items before they are considered fresh;
- the cache namespace advanced from v18 through v21 so old shallow shelves are discarded;
- hydrated YouTube and PeerTube records use the same coarse candidate gate as discovery, preserving strict runtime, landscape, language, and deny-list checks without rejecting records solely because a provider category is missing;
- the cartoon lane rejects educational, instructional, informational, PSA, safety, training, and classroom records that were reproducibly bleeding into entertainment programming.
- Cook's Table now applies a title/tag/category/account cooking gate instead of trusting the search query alone, and rejects hardware, software, laboratory, gaming, and other false positives;
- the seeded Source Suite shelf carries six bounded, rights-checked long-form cooking records, with the cold path verifying them concurrently and yielding the first shelf before the broader provider refresh begins;
- verified PeerTube direct files receive a Source Suite-only 15-second first-frame window because several public instances expose their first decoded frame well after metadata is available; IA and non-Source playback keep their existing timers.

The post-fix browser probe returned 13 verified long-form items for Cartoon Time Machine: 10 embeddable YouTube items and 3 direct-file PeerTube items. The focused Cook's Table run retained five verified long-form items after strict filtering and produced a visible frame in the browser harness; provider latency remained variable, so it is tracked as a Source Suite provider-latency concern rather than hidden as an application success. The catalog remained above the five-item floor instead of settling on the original repeated shelf. The long tail still needs continued measurement; no claim is made that one short probe exhausts the available YouTube or PeerTube universe.

## v2 release record

- Client stamps: desktop/mobile `1.9.7.*.174-source-suite-depth`.
- IA cache namespace: queue and last-good `v79`.
- Source Suite cache namespace: `v21` with a five-item verified-catalog floor.
- Production Worker before this release: v170, version ID `89ce6dd6-52df-4dcf-9a7b-4e0dbc3f9037`.
- Current production Worker: v172, version ID `64d89292-9dd0-4b8b-87f4-b586c720074c`.
- v172 selective long-tail proof: 5/5 first-play ready, 15/15 full-depth rotations, 0 no-signal lanes, 0 timeouts, 6 duplicate items, 237 ms average first-play readiness.
- v171 post-deploy soak: 6/6 first-play ready, 18/18 full-depth rotations, 0 underfilled lanes, 0 no-signal lanes, 0 timeouts.
- Keep the nightly IA health sweep as the regression guard; it should alert on underfill, repeat concentration, timeout, or provider-health changes and remain quiet when the state is unchanged.
