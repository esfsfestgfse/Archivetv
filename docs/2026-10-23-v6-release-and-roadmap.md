# RealSignal 6.0.0 — Retro Cable

## Release scope

6.0.0 promotes the approved watching shell and program guide from the opt-in
release candidate to the normal desktop/mobile experience. No `v6=1` is needed.
The tab titles, visible diagnostics and version chips identify 6.0.0.

- Large, aspect-correct picture fitted to the browser viewport.
- Compact green channel/time/date readout and labeled controls for Power,
  channel stepping, Guide, Next, Info, Menu, volume, mute and Cast.
- Searchable guide with categories, favorites, recent channels, current/next,
  known runtimes, source and remaining time. Watch is a separate explicit action;
  browsing does not tune or rebuild catalogs.
- Responsive narrow/short layouts, keyboard focus, retained guide selection and
  scroll, and one presentation owner during Cast transitions.
- Shared inter-program commercial policy: one prepared spot, at most 60 seconds;
  video on TV, audio on audio channels, no stacking over source-owned services.
  Short cartoons accrue a 25-minute block. Existing holiday spacing remains.
- Independent ad/era history, background preparation, no ad discovery at EOF.
  A cold or failed ad yields to programming. Startup is bounded to 900ms and
  stalled ads recover after 1.5 seconds. Decoded portrait ads are rejected.
- Ended programs clear both rejoin caches before a break, preventing a cached
  finished show from reopening. Capped/stalled ads pause before advancing.

No channel removal, merging, numbering, time restrictions, automatic hiding,
catalog/schema migration, source change or watch-history reset is part of this
release. Existing rolling playback shelves and server rotation remain in place.
The normal Cast sender/receiver presentation and protocol are preserved, not
replaced by a new receiver UI. Roku and Vimeo remain paused.

## Release links and rollback

- Desktop: <https://esfsfestgfse.github.io/Archivetv/the_dial_desktop.html?build=6.0.0>
- Mobile: <https://esfsfestgfse.github.io/Archivetv/the_dial_mobile.html?build=6.0.0>
- Presentation rollback: append `&v6=0` to either link. This keeps the same player,
  catalogs and history with the previous shell/guide; it is not a backend rollback.
- Full code rollback reference: `567984246a006f8af72ca03bf9f1d9d04e52719d`
  (6.0.0-rc.1). Revert the release through a new commit and normal deployment;
  never reset main or delete viewer history. No database downgrade is required.

## Evidence and limits

The final offline CI command set ran **62 commands with zero failures**, including
both HTML entrypoints, provider/rotation/admission checks and Cast contracts.
Python build-stamp fixtures passed. New tests first reproduced portrait-ad
admission, cap-without-pause, retained EOF caches and opt-in-only presentation;
each was repaired before publication. The independent reviewer identified the
schedule-cache and cap issues; both received direct regression tests.

Local browser evidence used real external video, not mocked metadata:

- Channel 226 started a decoded, advancing documentary in 684ms; Next played a
  different episode in 705ms. Mobile HTML samples also decoded advancing video;
  one recorded 1,626ms to the visible frame and one startup buffering event.
- Classic Cartoons 150 was slow: several tuning retries preceded a successful
  start, whose compositor audit recorded 39,131ms. This is retained as a real
  latency observation, not excluded from reporting or called an instant pass.
  These background-browser samples are not a controlled device p95 benchmark.
- Current/next titles and runtimes matched the documentary queue. Guide search,
  Watch, close/reopen and Next were operated through their visible controls.
- 1440x900 desktop, 390x844 phone, 320x568 narrow and 640x360 landscape were
  inspected. No horizontal page overflow was observed; Watch/Next stayed in
  bounds. These are browser viewports, not physical-phone/font-zoom certification.
- Explicit `v6=0` on desktop/mobile opened only the legacy guide and mounted no
  V6 dock. Browser CI now operates visible V6 controls and separately tests rollback.

Release commit: `86d107a8b31eded3e3a2ad0e199517538b4b0b7c`.
[Hosted CI](https://github.com/esfsfestgfse/Archivetv/actions/runs/39948801786)
passed all three jobs. Desktop and mobile each swept 281 registered entries with
zero JavaScript page errors, passed all 12 functional checks (including explicit
rollback), and passed the telemetry dashboard checks. This sweep mocks external
providers; it is not real playback certification for 281 channels.

[Pages release validation/deployment](https://github.com/esfsfestgfse/Archivetv/actions/runs/39948801826)
passed. Its production IA smoke returned 24/24 first-play-ready and full-depth
queues, zero duplicate items, zero timeouts and no flagged lanes to retry.
Its average response was 596ms (274–2,108ms). These are queue measurements, not
decoded frames.

Public default desktop/mobile titles and visible stamps were checked after
deployment. Production 226 played an advancing decoded documentary at 528ms;
Next played a different episode at 681ms, with no recorded repeat/stall in those
samples. The public 390x844 mobile guide rendered 268 canonical rows, no page
overflow, and Watch bottom825px. Local proof: `output/v6-release/public-guide-6.0.0.png`.

An additional native-control End-seek test hit buffering on the last bytes of an
external file and did not establish a real commercial EOF cycle. Do not treat
the automated cap/cancellation/EOF tests as a sustained visible-ad certification;
seek recovery and real-provider break cycles remain in the next measured pass.

Untuned guide rows can legitimately say pending; no invented schedules are used.
Recursive upstream titles remain a metadata cleanup item. This release does not
certify universal sub-second starts, exhaustive ad-era coverage, uninterrupted
external-provider availability, or newly tested physical Cast behavior.

## Next development — in order

### 1. Stabilize 6.0.x using real measurements

First investigate the reproduced slow 150 start and seek-near-EOF buffering. Correlate channel command,
catalog response, selected file, decoder events and first visible frame; compare
cold and warm runs under the same conditions. Distinguish provider delay from
client scheduling before changing either. Test rapid Next/channel changes and
post-program recovery, then fix only reproduced causes. Keep ad preparation
behind program/ready-shelf traffic rather than increasing concurrent warmups.

Completion evidence: first-frame and Next p50/p95, failed-start/stall rate,
ready depth and repeat windows before/after on the same channel sample. Preserve
slow and failed samples. No HTTP-200 or queue-only result substitutes for playback.

### 2. Finish guide data quality, not another visual rewrite

Normalize exact episode/file titles and remove repeated parent-collection text.
Enrich current/next from the existing verified server manifests, without discovery
on guide open. Distinguish ready, playing, live and genuinely unavailable entries.
Retain selection/focus during updates; test keyboard, enlarged text and touch.

Completion evidence: displayed current/next identity matches actual playback,
no fake durations, no tune/history mutation from browsing, and measured painted
guide-open/close p95 on desktop and a real phone. The 150ms target is not yet certified.

### 3. Improve commercial coverage and prove real break rotation

Measure visible spots, eras, channel matching, failed starts and return-to-program
timing over sustained sessions. Build a deeper transport/decoder-qualified ad pool
in the background. Preserve video/audio boundaries, landscape rules, cartoon
blocks, holiday/Drive-In identity and fail-open behavior. No unapproved mid-film ads.

Completion evidence: varied spots across multiple breaks, no repeating finished
program, stale timer, audio-only TV ad or dead signal, including Next/power-off
during a break. Existing provider advertising must remain untouched.

### 4. Deepen measured weak catalogs without sacrificing fast playback

Keep the rolling `1 playing + 2 ready + background` shelf, larger catalogs and
persistent freshness history. Work by unique playable files, shows and collections,
not raw search counts. Expand complete-series files, balance shows/eras, and
preserve classic/modern genre rules and the short-cartoon exception. Source Suite
stays YouTube/PeerTube with its long-form and content restrictions. Do not change
the working OK architecture merely to make all providers look identical.

Completion evidence: multiple real rotations with increasing unseen programs and
show diversity, no early repeats or genre bleed, and no first-frame regression.
Do not add new channels or silently hide shallow ones to improve the numbers.

### 5. Continue backend/code cleanup in small verified slices

Extract shared desktop/mobile behavior behind the existing command/snapshot
contracts. Keep one owner for tuning, cancellation, EOF, guide data and commercials.
Move data out of executable HTML only with parity checks. Remove an old helper or
override only after proving its replacement owns every live caller. Preserve
catalog depth, rollback, source health and watched history throughout.

Completion evidence: smaller duplicated runtime, equivalent provider/rotation
behavior and passing browser/contract tests after each slice. No wholesale rewire.

### 6. Polish the four retained live families

Live TV: usable selection/guide and clear recovery. Sports: balanced genuinely
live ordering and score freshness. Weather: readable forecasts and alert locations.
Radio: organized stations, now-playing metadata and recovery. Align each with the
V6 frame without restoring removed map/ship/data channels. FAST expansion stays
out of scope unless a measured failure requires a targeted repair.

### 7. Public-release preparation

Load-test catalog/manifest endpoints independently from provider media. Prioritize
CDN caching, bounded background ingestion, server freshness/rotation consistency,
provider circuit breakers and cost/abuse controls that do not block normal tuning.
Document source permission/availability expectations before public distribution.
Keep telemetry privacy-conscious, source-specific and outside the playback critical
path. Canary changes with explicit rollback triggers and versioned releases.

Completion evidence: realistic simultaneous-viewer results, infrastructure costs,
clear incident/recovery procedure, sustained real-phone/Cast checks and a tested
rollback. No paid infrastructure or new account permissions without approval.

## Operating rule

Ship one measured improvement at a time with a new visible version. Do not restart
expensive all-channel audits for cosmetic changes; use focused tests per patch and
scheduled broad regression. The immediate next task is the slow-start diagnosis,
not a new source suite, channel expansion, Roku work or another wholesale UI rebuild.
