# IA recovery history and first-tune labels

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the reproducible channel 11 repeat at rotation 28 and missing first-tune episode labels without changing catalog admission or playback ownership.

**Architecture:** The relay's played-only personal history remains authoritative. When API qualification removes a relay slot and D1 recovery fills it, reorder only that recovery shelf against the same viewer history, retaining unseen programs before repeated emergency fallback. Carry queue title/year into the already-resolved client media record, as the asynchronous resolver already does.

**Tech Stack:** JavaScript Workers, two HTML clients, Node behavioral tests, existing CI/deploy workflows.

**Spec:** User's standing depth/freshness requirements and the 5.6.14 report (`docs/2026-10-19-blighty-depth-and-titles-5.6.14.md`). Reproduced baseline: `artifacts/ia-trace-5615-baseline.json`: rotation 28 repeats Baywatch despite 51 unseen resolved D1 candidates; direct relay still supplies unseen episodes.

## Global Constraints

- No portrait, short, foreign-language, parody, podcast, or genre-gate relaxation.
- No new foreground Archive discovery, database schema, binding, queue ownership, or shared viewing history mutations.
- Keep guarded IA reservations, Source Suite, OK, FAST, radio, mobile, and Cast behavior intact.
- Ship a new visible stamp only after tests/review, then verify hosted playback and rotation. The first candidate was 5.6.15; extended hosted validation requires final 5.6.16.

## Review Focus

1. D1 enrichment must not crowd out explicit private history with other viewers' served rows.
2. Partial relay qualification must not promote a recently skipped episode ahead of unseen candidates.
3. An exhausted catalog must keep playable fallback rather than produce a dead signal.
4. Queued or background candidates must never be recorded as actually watched.
5. Both resolved-inline and asynchronous client warm paths must retain accurate labels without altering valid editorial titles.

### Task 1: Preserve viewer history and labels through recovery

**Files:** `realsignal_api_v2_worker.js`, both `the_dial_*.html`, `scripts/test-ia-review-regressions.js`, `scripts/test-ia-broad-station-depth.js`, stamp contract, release report.

**Interfaces:** Consumes existing `viewerRecentIds`, `recentIds`, `queueItemIdentity`, `uniqueQueueItems`, `warmIAQueue`, `iaDisplayTitle`, and the relay-owned response. Produces the same public item/media schema with an unseen-first recovery shelf and title/year retained. No new endpoint or persistent state.

- [ ] Add API behavioral tests for a relay shelf reduced by policy, with D1 recovery and private recent IDs; assert no repeated first item while unseen files exist. Include exhausted, legacy, canonical-ID, and guarded controls.
- [ ] Add desktop/mobile VM tests for actual inline warm-media title/year, with proper editorial and generic file-derived labels.
- [ ] Run focused suite; expected new tests fail for missing labels and repeated recovery selection, old 99 pass.
- [ ] Apply minimal request-local recovery ordering and inline-media metadata changes; run focused suite green.
- [ ] Run all workflow CI commands, title/deep-harvest contracts and whitespace checks. Use one bounded final reviewer; address important findings RED→GREEN in one pass.
- [ ] Commit explicit files and push normally to main with visible 5.6.16 stamps. Verify all applicable deploy/CI jobs, public stamp/API health, channel 11 extended rotations and control lanes, and browser decoded playback/title/Next. The unchanged relay's path-filtered job is not expected to redeploy.
- [ ] Record measured evidence and limits, complete checkpoint, preserve unrelated artifacts.
