# Source Suite startup repair

> **For agentic workers:** Use superpowers:executing-plans. Execute inline with one final independent review.

**Goal:** Repair the reproduced YouTube startup/false-success path without changing catalogs or the other providers.

**Architecture:** Replace undocumented iframe messaging with the official YouTube IFrame API in one shared runtime. A playing state plus advancing media time settles startup; SDK readiness alone does not. Transient player failures must not remove catalog items.

**Tech stack:** Existing plain JavaScript clients, official YouTube SDK, Node VM regression fixtures, real Chrome and mobile-layout browser checks.

**Spec:** User-approved staged Version 7 reliability work; saved reproduction in `docs/2026-10-24-playback-reliability.md`.

## Global constraints

- Preserve catalogs, freshness history, channel identities and all other source adapters.
- No settings/extensions changes, credentials, new paid services, or Version 7 stamp.
- Ship only after actual decoded playback in Chrome; unit events are not visible-frame certification.

## Review focus

- Cancelled tunes must not promote or advance an old program.
- Autoplay/startup timeouts must not reject otherwise valid catalog items.
- Readiness, state callbacks and clocks must not fabricate first-visible-frame telemetry.
- App mute/volume/pause must reach the active player.
- Natural EOF advances once; metadata duration must never truncate playback.

## Task 1: Shared official-player lifecycle

Files: `assets/youtube-embed-runtime.js`, `scripts/test-youtube-embed-runtime.js`, both client HTML files, CI workflow.

Interface: `RealSignalYouTubeEmbed.play(options)` resolves `{status, code}`; statuses playing, pending, unavailable, cancelled. `stop`, `volume`, `toggle` share one active owner. Options carry item/container/isCurrent/onReady/onStarted/onPending/onEnded/onError.

- [ ] Write controlled SDK boundary fixtures for ready-without-play, stalled clock, actual advancing playback, blocked autoplay, definite unavailable vs transient error, EOF once, controls, cancellation and SDK load failure.
- [ ] Run tests RED, implement minimal runtime, run GREEN.
- [ ] Integrate both clients; transient/pending startup stops the rejection loop without poisoning catalogs. Add integration regressions for that branch.
- [ ] Verify real Chrome first start, Next, guide open/close, rapid away/back and audio-to-video handoff; verify mobile layout. Withhold if decoded video fails.

## Task 2: Verify and release the scoped repair

- [ ] Run relevant suite and full offline/visible-stamp gate; obtain one independent review and fix Important findings with RED→GREEN.
- [ ] Bump visible clients to 6.0.7, document actual evidence and remaining editorial defects. Gate the new player with `youtubeSDK=1` until the remaining blank-frame case is resolved; preserve the production default.
- [ ] Commit explicit files, push normally under standing authorization, check CI/Pages and public playback. No Worker deployment is necessary for client-only work.

Auto Racing, Uptown Comedy and Blues editorial work remains the next separate scoped repair; do not mix Worker admission changes into an unresolved player experiment.
