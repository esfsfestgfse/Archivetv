# RealSignal 6.0.10 — focused playback and editorial repairs

## Changes

- Fetch the official YouTube SDK before Power/catalog discovery; bind immediately when already available. Preserve the reusable player, per-program callback isolation, catalog and viewing history.
- Auto Racing 54 rejects reproduced newscasts and car slideshows. Full races and race reviews remain allowed.
- Uptown Comedy 225 uses Black comedy program/performer evidence rather than generic stand-up queries. Preserve subject evidence after playback conversion and retain its six valid file-level recovery records.
- Blues 905 rejects the identified hosted radio-program family and explicit podcasts/spoken programs, including cached audio before local/Cast publication. Preserve blues recordings and foreign-language music.
- Cartoon Time Machine rejects game walkthroughs, theme-song quizzes and the observed VHS essay. Actual cartoon compilations remain allowed. Existing AI admission remains in force.
- Desktop/mobile title, visible stamp and API release identifier advance together.

## Verification before release

- 86 existing offline Node commands: zero failures.
- 63 focused IA/source admission tests pass; regression fixtures cover all four IA gate copies, API fallback, relay and cached Blues playback.
- YouTube lifecycle checks include pending SDK readiness, volume intent, cancellation, stale callbacks and one-time EOF handling. Three build-stamp and three fixture-network tests pass.
- Isolated desktop Source Suite: decoded 1280×720 video, Next completed in 612 ms; rapid skips and guide open/close retained advancing video.
- Mobile HTML at 390×844: decoded 640×360 video, Next completed in 608 ms; guide open 86 ms / close 9.5 ms. This is browser layout testing, not a physical-phone certification.
- Regular Chrome: Auto Racing played a 2024 NASCAR full race at 854×480; switching to Source Suite played a different 854×480 program (1.6 s tune completion). Earlier sampled Uptown Comedy played Katt Williams; Blues played two different music tracks.

## Limits and unresolved issue

The regular Chrome profile reproducibly leaves a minimal delayed-player control blank, while the identical control in the isolated browser decodes 1280×720 and starts at ~1.5 s. The exact profile/extension cause is unproven. SDK prefetch removes a serial request and observed app paths pass, but this release does not claim universal Chrome compatibility. No extensions, browser settings, catalogs or history were reset.

Clock telemetry is not a decoded-frame metric; decoded geometry/advancing media were inspected separately. Natural EOF is covered by controlled lifecycle tests, not a full real-program end-to-end viewing session. This focused repair is not a full-channel or physical Cast certification.

Rollback: revert the release commit through the normal workflows. Existing `youtubeSDK=0` escape hatch remains available. No schema migration or catalog wipe is required.
