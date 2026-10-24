# Beta baseline and targeted cartoon admission repair

> Execute inline with superpowers:executing-plans and one final independent review.

**Goal:** Record an honest6.0.4 PC/phone baseline, repair the worst confirmed programming failure, and ship a6.0.x patch without calling it Version7.

**Spec:** User request to establish the beta baseline and fix the worst reproducible failure; existing docs/2026-10-23-v6-release-and-roadmap.md. User explicitly requested continuous implementation. This is a targeted repair, not a new feature design.

**Architecture:** Preserve existing catalog IDs, playback, freshness and source adapters. A small shared title-policy module guards Cartoon Time Machine on server admission, stored-row reuse, client caches and fresh shelf installation. Following review, retain the existing broad profile rather than activating new description-based intent exclusions. No discovery on the playback path.

## Constraints / review focus

- Preserve viewer history, catalog keys,15-minute Source Suite floor, landscape/language rules and valid episodes/compilations.
- No channel additions/removals/renumbering, broad rewire, paid dependencies, migrations or revived Roku/Vimeo work.
- Commentary naming a cartoon is not a cartoon; preserve actual cartoons even if their descriptions contain unrelated boilerplate.
- Reject old contaminated rows as well as newly discovered rows; guard asynchronous first-publish and final-publish paths.
- Do not apply cartoon-only editorial exclusions to legitimate documentary/education channels.
- Record queue readiness separately from actual compositor frames. Missing standard telemetry and uninstrumented embeds must remain explicit unknowns.
- Compare matched samples; a few browser samples are not a four-user or all-channel p95 certification.

### Task1: baseline and one repair

Files: assets/source-program-policy.js; source_suite_profile_registry.js; realsignal_source_catalog.js; realsignal_api_v2_worker.js; both HTML clients; scripts/test-cartoon-program-admission.mjs; CI/API workflow validation; baseline/release report.

Interfaces: shared `RealSignalSourcePrograms.allow(profileKey,item)` / CommonJS export; pure boolean, no I/O or state. Existing sourceProfile(), qualifySourceItem(), catalogFallbackAllowed() and v2LoadProfile() remain the integration boundaries.

- [x] Sample real IA150/10/12, Source Suite555, Live TV300 and Radio924 with existing local diagnostics; collect phone sample. Identify commentary admission and missing ordinary first-frame metrics separately.
- [x] Add failing tests for actual observed facts/explainer titles, retained bad rows and fresh/onFirst shelf publication; positive full episodes, marathons and unrelated documentary lanes must survive.
- [x] Run new test with Node `--test`; admission assertions failed before repair.
- [x] Implement the shared scoped title gate, stored-row requalification and client shelf requalification; withdraw the new registry restrictions after review exposed depth regressions.
- [x] Re-run12 targeted tests and83 offline API/catalog/rotation/validation commands: zero failures.
- [x] Validate locally in Chrome and compare real program selection, guide return and startup; record slow starts as failures, not fabricated frame times.
- [x] Obtain one read-only review and fix Important findings with RED→GREEN tests; syntax/stamps/diff checks pass.
- [x] Ship6.0.5 as13cea55; public API/CI/Pages pass. Public PC/phone-size samples documented, including stalled Chrome samples. No physical-device/p95/Version7 certification claim.
