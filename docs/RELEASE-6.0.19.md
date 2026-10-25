# RealSignal 6.0.19 — Repeat measurement repair

The daily beta-monitoring automation was deleted at the user's request. This release uses controlled local checks instead of waiting for other viewers.

## Repair

The old counter could report zero repeats for confirmed A → B → A starts inside one channel tune. It also omitted YouTube clock-confirmed starts from freshness bookkeeping and could stop observing a pooled video element when its file changed without a new tune.

Confirmed program starts now share one bounded, channel-specific history. A/B/A counts a repeat; duplicate callbacks/resumes do not. Identical media on a different channel is not automatically that channel's repeat. The unique-program count counts identities rather than repeat-start records. Ads, signoff and missing identities do not become channel-program history.

Native file changes re-arm measurement and invalidate old-frame callbacks. Actual native/audio start evidence and verified YouTube clock evidence retain separate labels. An iframe load or transport probe cannot establish program playback; a YouTube clock never becomes a decoded visible frame. Automatic native progression after the initial channel frame does not reuse the original channel-start latency.

No queue selection, catalog admission, source discovery, watched-item ledger, channel numbering, guide or player lifecycle was changed. Measurement history remains a bounded 250-start page-session window, not proof of lifetime or full-catalog freshness.

## Verification

- New negative tests reproduced the old undercount and pooled-element observation failure before implementation. All 27 telemetry-correlation tests pass after repair, including stale callbacks, duplicate events, cross-channel identity, audio, unknown latency, ads and distinct-program totals.
- All 89 offline CI/API commands and three build-stamp fixtures pass.
- The actual runtime in Chrome observed three generated, rendered A/B/A starts, two unique programs and exactly one repeat in the same tune. Only the initial frame contributed channel-start latency. This is a controlled decoder/compositor fixture, not a third-party content or physical-device certification. Very short/backgrounded fixture attempts initially missed frames; the final control kept each visible program running long enough to observe it independently before advancing.
- A local replay used saved real catalogs with the unchanged API compaction/session selector: Classic TV, Classic Cartoons, both Game Show eras, Auto Racing, Uptown Comedy, Garden Ledger and Cartoon Time Machine. Each made 15 distinct selections without an early repeat: 120 selections across eight lanes. This is an offline selection test, not 120 decoded-playback successes or a semantic audit of every item.
- The replay adapter models the configured SQLite-backed Durable Object storage rather than the legacy KV helper limit. [Cloudflare documents different limits for the two backends](https://developers.cloudflare.com/durable-objects/platform/limits/). No production storage fix was inferred from the initial adapter mismatch.

The client titles, visible stamps, cache keys and API release advance together to 6.0.19. Controlled generated-video fixtures and captured catalogs remain local and are not shipped into the lineup. Version 8 continuity remains deferred. No scheduled task remains active for this work.
