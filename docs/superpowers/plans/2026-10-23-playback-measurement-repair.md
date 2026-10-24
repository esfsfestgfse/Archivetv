# Embed stalls and trustworthy playback measurements

> Execute inline with superpowers:executing-plans and one final fresh-context review.

**Goal:** Reproduce embed stalls, repair proven measurement gaps, then investigate IA54/225/905 without changing catalogs or history.
**Architecture:** Preserve playback/catalog ownership. Test real functions with controlled browser events; use a static diagnostic page for matched YouTube media across browsers. Measure decoded video separately from embed player state and queue readiness.
**Tech stack:** Existing HTML clients, vanilla JS, Node tests, existing GitHub CI/Pages.
**Spec:** User's ordered request; docs/2026-10-23-beta-baseline.md provides starting evidence. Base a5367c2, version6.0.5.

## Global constraints

- No broad backend rebuild, channel hiding/removal/renumbering, catalog narrowing or history reset.
- Roku/Vimeo/FAST expansion remain paused. No extension/settings changes, paid services or secrets.
- No first-frame success from iframe load alone; retain failed samples and unknown measurements.
- Reuse the existing externally managed worktree. Normal push/deploy is already authorized; bump6.0.6 for the tested application change, not Version7.

## Review focus

- Staged transparent video becomes visible after its first compositor callback: one correct frame event.
- Rapid channel changes/disconnected media cannot report against the new channel or keep observers spinning.
- Missing queue data is unknown, not zero; current queue is the latest sample, not the historic maximum.
- YouTube player failures, autoplay blocking and unavailable media must not look like successful video.
- Dashboard failure counters require serial reproduction; don't prune healthy lanes from historical flags alone.

### Task1: matched embed reproduction

Files: ignored output/v6-reliability diagnostic HTML/JSON; production client only if the cause is proven.
Interface: real public YouTube embeds, same IDs/parameters across Chrome and in-app browser; DOM-visible event traces.

- [x] Compare matched IDs in the real app and static harness. Chrome stalls reproduced; clean client and paired controls played.
- [x] Candidate tests and controlled repair completed, but candidate withheld after inconsistent real Chrome replay. Preserve exact baseline YouTube function and document the unresolved boundary.

### Task2: measurement races and queue accuracy

Files: assets/release2-runtime.js; scripts/test-ia-telemetry-correlation.js; optional focused test helper; both HTML asset queries/stamps.
Interfaces: observeMedia(node), queueDepth(), summary(), remoteMetric(); existing RealSignalIAShelf client.rows(channel).

- [x] Add RED→GREEN tests for staged/reused media, stale callbacks, live owner/legacy depth, unknown values and false outgoing-media attribution.
- [x] Final84-command offline gate passes with all focused regressions.
- [x] Compare compositor and ordinary telemetry on actual desktop and390×844 video; do not infer iframe first-frame timings.

### Task3: dashboard lanes and release

Files: scoped channel code/tests only if a failure reproduces; docs/2026-10-23-playback-reliability.md.
Interfaces: normal app tune/Next/guide; health summary; current IA shelf.

- [x] Test54/225/905 serially; decoded media and skip/queue evidence saved.
- [x] Fix reproduced Audio→Video pooled-element contamination in both clients; preserve and document remaining catalog/editorial findings.
- [x] One read-only review completed and Important findings fixed; local tests green. Hosted checks occur on the release commit.
- [ ] Push/deploy6.0.6 with visible stamps; verify production and provide the evidence/remaining limits.
