# IA audit repair implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. All five phases were approved on October 9; execute inline to conserve tokens.

**Goal:** Restore durable depth, honest qualification, freshness, and consistent playback across all current IA stations without disrupting other providers.

**Architecture:** Repair the existing relay, API, D1 catalog, session rotation object, and clients. Keep discovery asynchronous and gate changed behavior behind an IA-only canary contract until certification supports promotion.

**Tech Stack:** JavaScript Workers, KV, D1, Durable Objects, Cloudflare Queues, HTML clients, Node behavioral tests.

**Spec:** `C:/Users/tdy19/Documents/Codex/2026-08-14/can/artifacts/ia-audit-2026-10-09/IA-suite-audit-and-plan.md`

## Global Constraints

- All 169 canonical IA stations, including 28 audio stations, remain in scope; no hiding/removal to pass tests.
- OK/Vimeo development is paused; their existing behavior must not regress.
- One playing + two verified-ready replacements + larger background catalog. Queue preparation is not viewing.
- Ordinary TV minimum 15 minutes; feature movies minimum 60 minutes; no new maximum runtime. Preserve explicit short-form/audio/international contracts.
- No portraits, podcasts on TV, fan productions, parodies, reactions, or unrelated title matches.
- Persistent freshness and catalog union; unknown metadata is not verified success.
- Reuse audit evidence, bounded background load, low-concurrency certification, canary first, rollback available.
- Increment the visible build only when releasing verified changes. Do not claim physical mobile/Cast certification from desktop tests.

## Review Focus

- Worker eviction and overlapping writes must not erase a deep bank or watched history.
- Repeated guide/preload requests and retries must preserve reservations without consuming watched items.
- Missing/changed file metadata must not substitute another episode under the requested identity.
- Dedicated series, audio, music/serial/short-form and international profiles retain their programming purpose.
- Rapid tune changes and media failure after first frame must not revive stale channels or strand playback.

### Task 1: History and catalog integrity

**Files:** Modify `afterglow_ais_relay_worker.js`, `realsignal_api_rotation.js`, `realsignal_api_v2_worker.js`; create `scripts/test-ia-audit-integrity.js`; update `.github/workflows/ci.yml`.

**Interfaces:** Relay `recordIaPlayed(request, env, ctx)` produces normalized played records. `mergeIaCatalogCandidates(previous, payload, options)` preserves identity order while enriching fields. Rotation POST accepts an IA-specific `mode: "reserve" | "commit" | "release"`, `id`, `diversity`, `recentIds`; legacy callers retain their existing protocol. Reservations are distinct from watched `seen`.

- [ ] Write behavioral tests: played survives restart; hydrated record enriches old record; shallow cold write preserves 30-item bank; reserve is idempotent and leaves seen empty; commit consumes only its ID; recent A loses to fresh B/C; family cap rejects AAA when alternatives exist.
- [ ] Run `node scripts/test-ia-audit-integrity.js`; observe expected assertion failures against the baseline.
- [ ] Implement the proven integrity repairs, pass the diversity contract at the API boundary, and wire the canary-only played/rotation event path.
- [ ] Run the new tests plus existing rotation/API/OK contract tests; expected all pass.
- [ ] Commit the tested integrity repair with exact file staging.

### Task 2: File-level qualification

**Files:** Modify `afterglow_ais_relay_worker.js`, `ia_canonical_station.mjs`, `realsignal_api_v2_worker.js`; create `scripts/test-ia-file-qualification.js`.

**Interfaces:** Selected media carries file runtime, width/height, language, source parent/file, logical identity, source URL and verification provenance. Consumers distinguish candidate metadata from qualified media.

- [ ] Test child 120s vs parent 1800s, requested missing file, original/derivative dedup, portrait/unknown geometry, expired/failed verification, and the audit's five confirmed contamination samples.
- [ ] Observe expected failures, then implement exact-file resolution, metadata preservation and explicit format contracts without globally starving legacy banks.
- [ ] Verify strict canary hot-shelf admission and existing canonical/title/audio/international tests; expected all pass.
- [ ] Commit the tested file contract.

### Task 3: Resumable all-channel discovery

**Files:** Modify `afterglow_ais_relay_worker.js` and existing ingestion jobs; create `scripts/test-ia-resumable-discovery.js`.

**Interfaces:** Durable discovery state records per-channel query/page, parent/file progress, failures and refresh time. Catalog union from Task 1 stores complete admitted inventory; selection applies balancing, not admission.

- [ ] Test all twelve rails progress beyond page one, restart resumes, file batches cover multiple parents, duplicate variants do not inflate depth, and fallback success still schedules refill.
- [ ] Observe failures, implement independent background cursors and bounded checkpointed batches using existing Queue/KV bindings.
- [ ] Run behavioral discovery and existing harvest/collection/fallback tests; expected all pass.
- [ ] Commit the resumable discovery repair.

### Task 4: One playback order and recovery

**Files:** Modify `the_dial_desktop.html`, `the_dial_mobile.html`, existing guide client; create `scripts/test-ia-playback-order.js`.

**Interfaces:** Task 1's reservations feed client shelf order. Guide, preload, Next, EOF consume the same pending item; actual start commits history, failures release/cool items.

- [ ] Test preload A plus queue B: Next/EOF must play A and guide must advertise A; rapid tuning rejects stale completion; errors after start recover; startup watchdog cannot cancel healthy in-flight media preparation.
- [ ] Observe failures, implement shared reservation access and coordinated timers in desktop/mobile with IA canary flag.
- [ ] Run playback-order, HTML/parity/guide/Cast regression tests and browser visible-frame checks; expected all pass, record limits of device evidence.
- [ ] Commit the verified client repair.

### Task 5: Certification and guarded release

**Files:** Update telemetry correlation and behavioral measurements, CI gate, release stamps; add repair/canary evidence to `docs/`.

**Interfaces:** Task 1–4 produce versioned IA-only canary behavior. Measurements distinguish transport, qualification, reservations, actual first frame and physical device evidence.

- [ ] Add a regression test for stale tune timestamps/missing data; observe failure then fix event correlation and unknown-state reporting.
- [ ] Run complete local CI tests; compare primary/retry low-concurrency all-169 certification against saved baseline, multiple reservations and real playback sample.
- [ ] Obtain one fresh whole-change review, address important reproducible findings with regression tests.
- [ ] Promote only gates that actually pass; preserve baseline and canary toggle if physical/cross-family or full freshness evidence remains incomplete. Push tested commits under existing authorization without claiming an unverified production fix.
- [ ] Record exact shipped/canary version, results, remaining constrained lanes, and rollback procedure.
