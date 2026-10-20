# Whole-lineup IA depth and freshness implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Implement inline with one bounded final review; do not create a team of implementers.

**Goal:** Give every active IA station current, reproducible depth/freshness coverage and repair measured failures without hiding stations or replacing the backend.

**Architecture:** Reuse the app's own manifest and canonical-number functions, the existing session/skip soak, and the shared IA file contract. A standalone audit combines per-lane live catalog snapshots, rotation observations and explicit unmeasured playback fields. Runtime changes follow reproduced evidence, not audit labels alone.

**Tech Stack:** Existing JavaScript Workers, Node built-ins/test runner, Archive public metadata, existing GitHub deployments.

**Spec:** User-approved whole-IA plan in this conversation, reaffirmed by “Continue.” Baseline: commit 9730766, visible runtime 5.6.19.

## Global constraints

- Cover every active canonical IA station; list old-number aliases separately and reject missing inventory mappings.
- No new channels, renumbering, channel hiding, broad rewrite, or OK/Vimeo/FAST/Roku changes.
- Depth and freshness are distinct from a three-item ready shelf. Search hits, metadata, transport proof and decoded frames must remain distinct measurements.
- Reject known portraits, podcasts, fan/parody content, off-genre programs and inappropriate runtimes; preserve reviewed original short cartoons.
- Keep current rolling playback, fallback and history ownership. Do not pad weak channels with unsuitable content.
- Run network work at low concurrency, reuse evidence, and retry only flagged lanes. Push verified runtime changes with a new desktop/mobile/API stamp under the standing authorization.

## Review focus

1. New or aliased stations cannot silently disappear from coverage: Task 1 tests complete inventory joins and explicit unchecked rows.
2. Metadata-only candidates must not count as verified playback: Task 1 tests separate resolution, metadata and transport counts.
3. Alternate encodings must not inflate program depth; ambiguous same-title uploads must not be silently discarded: Task 1 tests logical-file deduplication and duplicate-title suspicion separately.
4. Sparse actual unseen tails must not be reported as failures merely for refusing repeat padding: Task 1 tests exhaustion-aware underfill classification.
5. Audio stations and reviewed original cartoons must not inherit an ordinary-TV runtime floor: Task 1 tests the actual shared contract in both cases.

## Task 1: Durable whole-lineup coverage tool

**Files:** Create scripts/ia-audit-coverage.mjs and scripts/test-ia-audit-coverage.mjs; update .github/workflows/ci.yml to execute the tests.

**Interfaces:** readIaLineup(htmlPath) returns {lanes, aliases, promoted, build}; summarizeIaCatalog(rules,payload) returns measured depth/quality fields; buildIaCoverage(lineup,snapshots,rotationAudit) returns every canonical lane with unchecked/tested/needs-repair status, evidence limits and repair reasons.

- [ ] Write behavioral tests for the five review-focus cases and current desktop/mobile inventory parity. Run node --test scripts/test-ia-audit-coverage.mjs; observe the missing behavior fail.
- [ ] Implement the smallest standalone tool; CLI captures one catalog snapshot per canonical lane at concurrency one and writes incremental coverage. It consumes existing rotation artifacts rather than rerunning an identical soak.
- [ ] Run the new tests and baseline CI commands; all must pass. Commit the testable tool.

## Task 2: Measure all lanes and repair confirmed failures

**Files:** Runtime only where evidence requires: afterglow_ais_relay_worker.js, ia_file_contract.js, realsignal_api_v2_worker.js, realsignal_api_rotation.js, both HTMLs; reproductions in existing IA behavioral tests. Reports under artifacts/ and docs/.

**Interfaces:** Task 1 coverage consumes the current app manifest and the existing 15-selection session/skip audit for every lane. Each runtime repair must name a failing lane/input, the owning gate and a reproducing test.

- [ ] Finish the all-IA 15-selection baseline and capture catalog snapshots for every lane. Produce a readable complete coverage table, including unresolved metadata and unmeasured first frames.
- [ ] Rank repeat-heavy, underfilled and contaminated lanes. Reproduce suspicious results serially before patching; distinguish shallow inventory, stale state and incorrect admission.
- [ ] For each confirmed shared defect or targeted profile repair, write/run its failing test, apply the minimal fix, rerun the test and full CI. Research additional Archive collection files only for demonstrated depth gaps; retain source metadata and do not claim unprobed files as playable.
- [ ] Retest affected lanes over multiple rotations and actual browser playback. Mark measured work honestly; do not call every station repaired because one shared fix passes.

## Task 3: Release and coverage handoff

**Files:** Current desktop/mobile/API stamps and test expectations, plus a human-readable all-lane report.

- [ ] Run a bounded fresh-context review of the runtime/tool diff; fix important findings with failing-then-passing tests and a green full suite.
- [ ] Commit and normally push verified changes to main. Verify all applicable deployment workflows and actual public build stamps.
- [ ] Re-run only affected canaries, preserve a complete coverage report for all lanes, and list remaining repair/depth/genre/physical-device gaps without hiding channels or overstating certification.
