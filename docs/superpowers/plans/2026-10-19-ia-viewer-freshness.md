# IA Viewer Freshness Repair Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. One bounded final review; no implementer fan-out.

**Goal:** Stop repeated openings on Modern Rerun TV and Blighty during rapid skips without discarding the deep catalog or putting discovery on the viewer's path.

**Architecture:** Send this viewer's actual watched/skipped IDs through the existing queue request. Merge those IDs into request-local relay freshness decisions while retaining shared caches and played-only durable history. Do not mark ready or preloaded programs watched.

**Tech Stack:** Existing JavaScript clients, API adapter, IA relay, Node behavioral tests.

**Spec:** User's approved continuation: repair reproduced repeats on channels 11 and 118, then verify slow Next recovery; preserve 5.6.11's collection depth and ship a tested version increment.

## Global Constraints

- No new sources, channels, services, bindings, renumbering, or broad rewrite.
- Retain genre/runtime/landscape/language gates, original short-cartoon exception, and rolling three-ready shelf.
- Viewer exclusions are not permanent bans or writes to another viewer's freshness state.
- Preserve current provider work and unrelated untracked artifacts.
- Use normal push to main under existing authorization only after verification; bump to 5.6.12.

## Review Focus

- A delayed/shared ledger cannot override viewer-specific recent IDs.
- Watching/skipping one collection file must not suppress every sibling episode.
- Another viewer still receives a valid shelf; no personal history enters shared durable caches.
- Constrained catalogs remain playable after exhaustion; no fake readiness.
- Guarded IA reservations and Source Suite behavior stay unchanged.

### Task 1: Repair the existing history handoff

**Files:** `afterglow_ais_relay_worker.js`, desktop/mobile HTML; existing broad IA and API regression tests.
**Interfaces:** Existing `iaQueueFetch`, `iaReportPlayed`, `getIaQueue`, and `applyIaFreshness`; additional request-local `viewerRecentIds` stays separate from shared catalog keys.

- [ ] Add failing real-route tests for repeated cached openings, sibling-file identity, viewer isolation, long IDs, and constrained exhaustion.
- [ ] Add failing client tests: actual playback/skip records history; queue/preload does not; both clients send history even when playback-report networking fails.
- [ ] Make the minimal handoff fix using the existing stores and queue payload; verify the API preserves the private request field through shared-ledger enrichment.
- [ ] Run focused tests and all repository CI commands; investigate any remaining slow Next with actual browser playback before proposing another change.
- [ ] Perform one bounded whole-diff review, fix Important findings with RED/GREEN tests, bump/commit/push 5.6.12, and verify deployments and hosted rotations.
- [ ] Publish exact availability, rotation and visible-playback evidence, including any limits or unfinished bottleneck.
