# RealSignal 2.0 readiness

Build under test: `1.9.7-desktop.170-ia-long-tail` and `1.9.7-mobile.170-ia-long-tail`.

Worker release: v166 is the current production baseline; v167 is the long-tail IA release in this document.

## What is covered

- IA queue rotation, fallback refill, episode expansion, title identity, and genre locks.
- Source Suite five-item ready buffer, catalog retention, YouTube/PeerTube language and aspect-ratio rules, and fast-start hydration.
- Guide incremental rendering, stable row identity, open/close behavior, and Next/channel ordering.
- Commercial video-only rules, seven-day freshness history, and long-program ad budgeting.
- Radio, live-data lifecycle guards, cast race/standby handling, media resolution, and desktop/mobile parity.
- Local-only Release 2 telemetry for tune latency, first visible frame, stalls, media errors, repeats, and source recovery.

## Measured results in this pass

The deterministic regression suite passed across desktop and mobile. Source Suite hydration measured:

| Surface | First program | Full catalog |
| --- | ---: | ---: |
| Desktop | 34 ms | 102 ms |
| Mobile | 10 ms | 98 ms |

Guide open/close completed in under 30 ms in the visible-playback harness for the sampled lanes.

The headless visible-frame probe did not receive provider-backed media in this environment. IA and Source Suite returned zero playable items, and Source Suite reported zero results from both PeerTube and YouTube. That is recorded as an external provider/network gate, not treated as a code fix without a real provider response.

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

The next engineering action is a real-network telemetry capture. If provider results remain empty there, investigate relay credentials, upstream availability, and browser/network policy before changing channel ranking or queue logic.

## Focused long-tail IA pass — v170

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

Direct media entries are only promoted when byte-range probing returns a playable response; ID-only candidates remain eligible for the normal Internet Archive file resolver. The ten lanes above now have wider candidate banks without changing the channel rules for any clean lane. Channels `63`, `101`, `103`, `105`, `122`, `238`, `508`, `510`, `702`, and `915` were measured but left unchanged unless their evidence crossed the patch threshold.

### v167 acceptance evidence

Run after the Worker deploy and record the resulting JSON alongside this document:

```powershell
node scripts\soak-ia-queues.js --manifest C:\Users\tdy19\Documents\Codex\ia-manifest-153.json --channels 12,63,77,101,102,103,105,117,122,202,238,239,240,508,510,700,702,901,915,927 --count 5 --require-ready 1 --rotations 3 --rotation-delay-ms 3000 --concurrency 1 --timeout-ms 15000 --depth-timeout-ms 6000 --poll-ms 1000 --out C:\Users\tdy19\Documents\Codex\2026-08-14\can\ia-long-tail-v170-pass1.json
node scripts\analyze-ia-soak.js C:\Users\tdy19\Documents\Codex\2026-08-14\can\ia-long-tail-v170-pass1.json C:\Users\tdy19\Documents\Codex\ia-manifest-153.json
```

The release gate is: no timeout, no underfilled shelf, distinct rotation shelves for the repaired lanes, and no newly introduced failure in the measured clean lanes. Queue readiness is not the same as a visible DOM frame; the latter still requires a real browser/device telemetry run.

## Monitoring and repair runbook

Use the same commands for nightly or pre-release checks. Keep reports timestamped and do not treat a single provider outage as a channel-ranking regression.

```powershell
node scripts\check-worker-contract.js
node scripts\test-ia-collection-depth.js
node scripts\test-release2-runtime.js
node scripts\probe-emergency-urls.js <identifier> ...
node scripts\soak-ia-queues.js --manifest C:\Users\tdy19\Documents\Codex\ia-manifest-153.json --channels <comma-separated-lanes> --count 5 --require-ready 1 --rotations 3 --concurrency 1 --timeout-ms 15000 --depth-timeout-ms 6000 --poll-ms 1000 --out <report.json>
node scripts\analyze-ia-soak.js <report.json> C:\Users\tdy19\Documents\Codex\ia-manifest-153.json
```

Monitor these signals: first visible frame, tune latency, ready depth, full item depth, duplicate count, media errors, stalls, provider response status, and no-signal recovery. Patch only a lane that fails twice under separate rotations or fails a direct-media probe; retain short cooldowns and the last-good shelf for transient upstream outages.

## v2 release record

- Client stamps: desktop/mobile `1.9.7.*.170-ia-long-tail`.
- IA cache namespace: queue and last-good `v78`.
- Production Worker before this release: v169, version ID `01f0dc66-3137-483f-b62f-6a029cd67c8a`.
- Post-deploy Worker v170 version ID and post-patch soak totals must be recorded here before the release is called complete.
- Keep the nightly IA health sweep as the regression guard; it should alert on underfill, repeat concentration, timeout, or provider-health changes and remain quiet when the state is unchanged.
