# RealSignal 5.6.12 — IA viewer freshness

## Target and cause

This is a small follow-up to 5.6.11, not another catalog rewrite. Production rotations had reproduced premature repeats on Modern Rerun TV (11) and Blighty (118): only 6 and 9 distinct selections respectively in twelve skips.

The regular IA client did not send its own played/skipped history with queue requests. The relay also ignored the request's recent IDs, relying on asynchronous shared history. Rapid skips could therefore outrun shared-history propagation and receive a familiar opening again. The API's shared-history enrichment could crowd out client IDs in its combined recent list.

## Repair

- Desktop and mobile retain up to 256 played/skipped program IDs per channel, import recent skip history, and send a separate `viewerRecentIds` field through the existing API/relay request.
- Queue construction and preloading do not mark programs watched. Playback-report network failures do not discard local history.
- Standard IA selection combines that viewer history with shared history for this request only. It does not persist private exclusions into shared caches, write permanent bans, or change guarded reservation state.
- Accepted file-level IDs retain up to 500 characters instead of truncating long filenames to 240 and losing episode identity.
- A tiny fallback catalog selects its remaining unseen program before replaying an exhausted one; repeats remain possible after genuine exhaustion.
- Exact edge-cache hits now return their freshness-adjusted order rather than the original watched-first response. The shared cache itself is not personalized or overwritten.
- Existing collection depth, editorial filters, landscape/language/runtime gates, and complete short-cartoon exception remain intact. No channels, bindings, services, or schema changes.

## Local evidence

| Check | Result |
| --- | --- |
| Focused behavioral tests | 90 passed, including RED/GREEN repeat, client history, long-ID, exhaustion, and exact-edge-cache cases |
| Full repository CI command list | 79 commands passed after version-stamp update |
| Standalone deep-harvesting contract | Passed |
| Actual local API/relay rotations | 18 distinct selections each on 11 and 118; 36 selections, zero repeats/errors |
| Available media URLs | Channel 11: 2–3 per response; channel 118: 3 throughout |
| Indexed catalog minima in that run | 41 / 28; not decoded-video counts |

The real desktop player decoded different media before and after Next: Silver Spoons (640×480), ER (640×360), Pride and Prejudice (854×480), Sherlock (1280×720), and Blackadder (640×480). Video dimensions were nonzero, readyState was 4, and playback time advanced. Next changed media URLs in the first post-click observation (roughly 0.4–1.3 seconds). That measures handoff observation, **not exact first-visible-frame latency**. The earlier prolonged recovery did not reproduce, so playback deadlines were not changed speculatively.

Screenshot capture timed out; no screenshot-based or physical mobile/Cast certification is claimed. Client protocol tests cover both desktop and mobile.

One bounded reviewer found the exact-edge-cache response issue. It was reproduced in a failing route test, repaired, and the 90-test focused suite passed. No unresolved Critical/Important review findings remain.

## Release verification

Local verification complete; production deployment and hosted rotation results will be recorded after the normal push completes.

## Limits and next work

- This does not create new content. Constrained catalogs can still exhaust, and the bounded 256-item local ledger cannot promise never-ending uniqueness.
- A selection with a media URL is not the same as a decoded frame; automated queue evidence and browser decode evidence stay separate.
- One complete-lineup readiness pass is planned after deployment, with deeper rotation checks concentrated on the two reproduced failure lanes and representative controls.
- Continue measuring remaining shallow catalogs and actual first-frame latency. Avoid another broad rebuild or speculative skip patch without a reproducible failure.
