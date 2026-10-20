# Blighty depth and episode title repair

> **For agentic workers:** Use superpowers:executing-plans inline, TDD, and one bounded final reviewer. The user approved this targeted follow-up and normal releases; do not request a new planning/push approval.

**Goal:** Deliver deeper, balanced British episode playback and stable, correct episode labels without weakening the 5.6.13 personal freshness repair.

**Architecture:** Reuse the existing metadata-derived collection seed index and background expansion pipeline. Keep series/container identity distinct from each episode title. No new sources, services, bindings or broad rewrite.

**Tech Stack:** Existing JavaScript IA relay, desktop/mobile clients, Node behavioral tests and current GitHub deployment workflows.

**Spec:** Approved chat continuation: deepen Blighty (118), fix the duplicated program-title fragments reproduced on Modern Cartoons, retain genre/landscape/runtime/language gates, personal viewing history, original short cartoons and all other working channels. Deliver a tested version increment.

## Global Constraints

- Preserve unrelated untracked artifacts, paused OK/Vimeo/Roku work and the existing managed checkout.
- Discovery/metadata work stays off the first-play path; no source calls awaited by a ready queue.
- New indexed entries come from actual public Archive file metadata, with real filenames, runtime and landscape geometry. Do not label metadata as transport or decoded-video verification.
- Classic/modern/game-show/holiday filters and 256-item viewer history remain intact.
- Bump desktop/mobile/API visible release to 5.6.14 and push normally only after tests/review.

## Review Focus

- Re-expanding an episode cannot retain the prior episode's title or grow duplicate suffixes.
- A human editorial title with no trustworthy file/parent metadata remains unchanged.
- No missing-geometry, foreign-dub, short-extra or off-genre entries enter the new British bank.
- One large series cannot fill the whole opening shelf; source IDs and file-level freshness stay intact.
- Empty/degraded caches still return existing playable recovery while background work is coalesced and bounded.

### Task 1: Repair collection identity and expose deeper Blighty episodes

**Files:** `afterglow_ais_relay_worker.js`, `the_dial_desktop.html`, `the_dial_mobile.html`, existing IA behavioral/title tests; version stamp in API/contract test; release evidence document.

**Interfaces:** `expandArchiveContainer(doc, ...)` and `archiveEpisodeTitle(file, parentTitle)` produce stable series/file identity; `iaDisplayTitle(item, channel)` renders that identity without recursive suffixes; `orderedIaEmergencySeeds`, `iaRepairCollectionSeeds` and `getIaQueue` retain existing payload/cache/rotation contracts.

- [ ] Capture/review Archive manifests for existing and additional British series; record qualified episode counts separately from transport probes.
- [ ] Add failing real-route/expansion tests for skipped background growth, repeated title expansion, stable per-file labels, and balanced deeper British episodes. Expected: the current implementation fails these assertions for the reproduced reasons.
- [ ] Make minimal title/identity changes and register metadata-qualified British collection episodes in the existing index. Schedule background growth on the measured British recovery path; retain an immediate playable response. Expected: no Archive fetch awaited on a ready queue; old 28-file ceiling removed.
- [ ] Run focused tests, the complete CI command list, standalone depth contracts and representative actual media probes. Expected: no test failures, valid video range responses, no lowered gates.
- [ ] Have one fresh reviewer examine the bounded diff; reproduce/fix Important findings in one RED/GREEN pass. Commit/push 5.6.14; verify API/public stamps and deployment gates.
- [ ] Run hosted repeated rotations on 118 and representative TV/cartoon/game-show/holiday controls; verify actual decoded playback and stable titles where the browser is available. Publish exact limits, not universal claims.
