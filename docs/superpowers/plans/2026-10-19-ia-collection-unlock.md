# IA Collection Unlock Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. Steps use checkboxes for tracking.

**Goal:** Let existing genre-approved IA collection starters grow into deeper, varied catalogs without changing playback architecture.

**Architecture:** Repair background collection eligibility and reuse the existing bounded expansion, cache, and queue pipeline. Prefer healthy accumulated family catalogs over small emergency banks. Reuse the existing family balancer for standard IA selection only.

**Tech Stack:** JavaScript Workers, existing Queues/KV/D1/rotation bindings, Node behavioral tests.

**Spec:** The user's approved six-point IA depth/freshness agenda immediately preceding this request. No additional feature design or channel changes are authorized by this plan.

## Global Constraints

- Preserve the rolling 1 playing + 2 ready shelf and all existing durable catalogs.
- No foreground Archive discovery for these repairs; collection reads occur in background work.
- No genre/runtime/language/portrait/fan-parody/podcast gate relaxation. Reviewed complete short cartoons retain their exception.
- No OK/Vimeo/Source Suite/Cast changes, hiding, renumbering, or broad rewrite.
- Reuse existing bindings and bounded background budgets; do not add services.
- Ship only tested changes with a new visible version stamp under the user's standing push authorization.

## Review Focus

- Single-program emergency files must not cause arbitrary background metadata scans.
- A playable collection file must not prevent sibling discovery.
- A stale or contaminated cached family must not override editorial gates.
- Thin collections must still provide partial/full shelves without invented programs.
- Generic Source Suite rotation must retain its previous behavior.

### Task 1: Unlock bounded collection expansion and deep cold recovery

**Files:** `afterglow_ais_relay_worker.js`, `scripts/test-ia-broad-station-depth.js`.

**Interfaces:** Consume existing `expandSeedArchiveContainers`, `queuePlayable`, `strictRecoveryQueue`, `scheduleIaExpansion`; retain signatures and public payload contract.

- [x] Add failing behavioral tests using the real relay and controlled Archive metadata: reviewed ready collection children expand; metadata-proven unlabelled collections expand outside repair mode; ordinary single files do not; wrong-genre children stay excluded.
- [x] Run the tests and observe the specific failures.
- [x] Preserve source-program-count facts for video metadata and allow explicitly proven containers through bounded background expansion, independent of recovery provenance.
- [x] Add a failing route test showing a standard cold tune ignores a deeper family cache; prefer the family only after the same genre/runtime/deny gates.
- [x] Run behavioral tests and existing relay contracts. Expected: green, no Archive work awaited by cold family recovery.

### Task 2: Preserve show variety on standard IA shelves

**Files:** `realsignal_api_rotation.js`, `realsignal_api_v2_worker.js`, `scripts/test-ia-review-regressions.js`.

**Interfaces:** Extend the existing internal standard IA rotation request with its existing channel diversity policy; keep Source Suite requests unchanged.

- [x] Write and observe failing tests for multiple series on a ready shelf and for generic rotation compatibility.
- [x] Reuse the existing family balancer only for standard resolved IA media, filling from the same eligible catalog when fewer families exist.
- [x] Run the IA and V2 contracts. Expected: correct shelf count, no early program repeats, resolved media only.

### Task 3: Measure, review, and release

**Files:** Client/API version stamps, release contract, evidence report; untracked research artifacts.

- [x] Inspect real Archive manifests from identified blocked collections at low concurrency; count deduplicated, landscape, runtime-qualified children by channel and parent.
- [x] Exercise actual expansion against captured manifests, probe representative media, and compare old/new counts.
- [ ] Run all repository CI commands and one bounded independent whole-change review; fix Important findings with RED/GREEN tests.
- [ ] Canary real browser playback/Next/guide and perform low-concurrency hosted rotation checks after deployment.
- [ ] Commit, push, and verify deployment of 5.6.11; publish evidence with remaining depth/genre limitations.
