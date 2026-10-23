# Live TV / Sports recovery implementation plan

> Native execution using executing-plans, with one final focused review.

**Goal:** Repair proven FAST selection/connection failures, retain selected Sports
content, and add only new catalog options that pass actual playback checks.
**Architecture:** Keep existing providers, HLS services and UI. Correct playlist
parsing/catalog variants and select a compatible existing proxy before playback.
Give each intra-channel playback attempt its own owner/deadline; never switch to
an unrelated feed on failure. No schema or general proxy migration is needed.
Browser testing later proved Roku requires the existing HLS relay to allow its
specific `delivery.roku.com` CDN: the shortener lacks CORS and the generic relay
resolves relative child links against the wrong host. This narrow repair is
deployed first, with redirect-boundary tests; no unrestricted proxy is added.
**Tech stack:** Existing HTML/JS, hls.js, Node VM tests and browser playback.
**Spec:** User request 2026-10-23: pause genre work, improve Live TV/FAST and Sports;
no automatic sports rotation. Existing V6 design/rollback/history constraints apply.

## Evidence and boundaries

-21/21 configured feeds returned200. A populated feed is not playback proof.
-Tubi/Plex/FLS primary HLS relay403; Roku redirect502; existing fallback returned
 manifests. Prefer that compatible service without broadening relay permissions.
-Distro quoted User-Agent commas corrupt the current EXTINF title parser.
-Primary promotion during dedupe can include itself in alternates; source selectors
 inspect only the primary, losing other provider views. Preserve acyclic variants.
-The existing extra FAST static test fails on stale `label:"Live now"` text before
 changes. Replace stale text assertions with actual selection/lifecycle coverage.
-No IA catalog/lineup changes, paid infrastructure, DRM/geo bypass or provider
 availability guarantees. Roku device work/Vimeo remain paused.

## Review focus

1.Stale hls.js callbacks/retry timers cannot destroy or replace a newer selection.
2. A manifest that never arrives has a bounded startup deadline, including library load.
3. A TV stream with only audio never gets a successful video health mark.
4. Provider filtering and stored catalogs preserve alternate routes without cycles.
5. Old saved sportsRotate=true cannot resume rotation; refresh never tears down live TV.

## Task1 — catalog correctness and route choice

Files: both HTMLs; `scripts/test-live-tv-recovery.js`.
Interfaces: `tvChannelVariants(c)`, `mergeTVChannels(items)`,
`tvChannelForSource(c,regex)`, `tvPlaybackProxies(c)`.

-[ ] RED tests: quoted commas, stable channel title; acyclic promoted variants;
 source selection finds alternate providers; compatible built-in route chosen;
 explicitly custom proxy order retained; source URL/header directives preserved.
-[ ] Correct parser, canonical merge/source views and use the compatible proxy.
-[ ] Run tests plus provider/registry/parity contracts, zero new failures.

## Task2 — playback ownership and manual Sports

Files: both HTMLs; same actual-function Node tests.

-[ ] RED tests: delayed library / old fatal / old retry do not affect newer video;
 pre-manifest timeout advances only same-channel routes; no audio-only video success;
 persisted sportsRotate does not trigger a different sport.
-[ ] Add per-selection cancellation and bounded startup/recovery to existing playTV;
 preserve source alternates and Cast handoff. Remove Sports rotation/menu action.
-[ ] Preserve selected sport and avoid rebuilding live video during score refresh.
-[ ] Run focused behavioral suites; zero failures.

## Task3 — options, verification and release

-[ ] Research public catalog sources. Candidate Tablo166/FireTV67 feeds returned
 manifests; do not add until segment/decoded-browser checks pass. Reject unproven
 Rakuten/Orka/MetaX candidates for now rather than advertise them as working.
-[ ] Wire admitted sources and source selectors consistently, bounded refresh.
-[ ] Run full offline CI, public-source samples and real browser playback/rapid picks,
 Sports selection and guide controls. Record provider failures honestly.
-[ ] One fresh scoped reviewer, fix substantive findings RED→GREEN.
-[ ] Bump6.0.1, push normally, require hosted CI/Pages, verify public stamp/default.
-[ ] Deliver provider findings, changes, limits and release link.
