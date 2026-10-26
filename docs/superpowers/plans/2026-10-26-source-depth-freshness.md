# Source Suite depth and freshness implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this approved continuation inline, with one final scoped review.

**Goal:** Improve actual accessible Source Suite depth and rotation without relaxing genre, language, runtime or landscape admission.

**Architecture:** Keep the durable D1 catalog union and existing background YouTube/PeerTube discovery. Replace the newest-only source read window with an unseen/oldest-served window; retain a larger bounded browser working set and longer actual-play history. Batch limits remain performance controls, not total catalog limits.

**Tech stack:** Existing JavaScript clients, Cloudflare Worker/D1, Node SQLite/VM regression fixtures, Chrome-only testing.

**Spec:** User-approved repair-first approach in this conversation; keep lineup intact, deepen measured weak profiles, show a deliverable and Version 7 status afterward.

## Constraints

- Preserve IA, OK/Vimeo, catalogs, history, reservations and channel numbers.
- Source Suite remains YouTube/PeerTube, English, landscape and at least 15 minutes; movie floors and stricter editorial gates remain intact.
- No broad search flood, new services, channel hiding, automatic merges or daily jobs.
- Distinguish bounded qualified catalog samples, full stored depth, runtime playback and visible-frame evidence.
- Ship a new visible version only after regression checks; Version 7 is not certified by this bounded pass.

## Tasks

- [x] Audit all 70 YouTube/PeerTube profiles through read-only production status/guide routes. Baseline: no empty catalogs, 11 below 12, one below five. Counts are qualified windows up to 96, not full durable totals.
- [x] Run one serial maintenance refresh on those 11 profiles, preserving existing records. Record provider health and actual depth gains; do not pad constrained lanes.
- [x] Reproduce source-window starvation and truncated history in existing SQLite/client VM regressions. Repair only ordinary YouTube/PeerTube history/window behavior; test older/unserved rows beyond the old 96-item page and existing source guards.
- [x] Increase ordinary Source Suite browser working capacity to 512 and actual-play history to 1024; rank fresh items before truncating the working set. Keep the five-item ready buffer separate from catalog depth and preserve OK/Vimeo behavior.
- [x] Test multiple real catalog rotations and targeted Chrome playback/Next/guide on representative Source Suite lanes; record source response/iframe clock/decoded-frame evidence separately.
- [x] Run the existing offline gate, one scoped review, then commit/push/deploy with desktop/mobile/API stamp 6.0.28. Verify public stamps and deployed outcomes.
- [x] Deliver a measured report and summarize the remaining Version 7 gates.

## Review focus

1. Recently watched rows must not recur while older admitted rows remain outside a window.
2. Cache growth/truncation must retain unseen additions rather than preferring an old full page.
3. Source-specific constraints and creator identity must survive database read/merge paths.
4. Query ordering must remain bounded and preserve IA/OK/Vimeo query semantics.
5. No ready item, queued tail or diagnostic status read should be counted as an actual play.

## 6.0.29 measured follow-up

- [x] Reproduce Documentary Desk's legacy fragmented-MP4 and native-HLS failures using real media.
- [x] Select complete video playlists and recover retained IDs without wiping history.
- [x] Add Hls.js ownership, abort/teardown and post-start fatal recovery regressions; address both scoped review findings.
- [x] Add named discovery rails to the four measured shallow profiles and preserve their long-form normalization.
- [x] Reproduce and reject Comfort Television's actor-credit contamination; retain legitimate English food-culture programs while rejecting non-English releases.
- [ ] Complete hosted maintenance/status comparison, Chrome desktop/mobile cross-family smoke, final offline gate and 6.0.29 publication.

Full-app decoded first frames on three formerly failed Documentary Desk programs: 2.834 / 2.985 / 2.162 seconds. Separately, the following YouTube clock started in 607 ms. These are a bounded canary, not an all-device certification.
