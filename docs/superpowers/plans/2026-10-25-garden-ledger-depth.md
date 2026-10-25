# Garden Ledger depth repair

> Use superpowers:executing-plans inline, test-driven-development for code, and one bounded final independent review.

**Goal:** Replace channel 545's four-item, partly off-format catalog with 20+ distinct eligible English gardening programs, then verify playback and rotation and release 6.0.14.

**Spec:** User-approved four-step Garden Ledger request in chat. No separate design document.

**Architecture:** Keep existing YouTube/PeerTube adapters, D1 catalog, five-item active shelf and persistent freshness. Add researched gardening-show upload feeds and rotate their uploads. Apply gardening-specific evidence at the shared admission boundary and retain client/server parity. No new provider, credentials, schema or player architecture.

## Constraints and review focus

- English, landscape, minimum 900 seconds; reject disclosed synthetic programs, podcasts/commentary and unrelated farming. Preserve the existing no-Shorts/how-to/fan rules.
- Program identity and content determine acceptance; search query words and promotional footer text are not sufficient genre evidence.
- Do not reset catalogs/history, hide channels, change channel numbers, or touch the pending Chrome/OpenVideo comparison.
- Catalog admission and SDK-ready states do not prove decoded playback. Browser layout tests are not physical mobile/Cast certification.
- Test valid series titles without generic gardening keywords, wrong-topic uploads from gardening accounts, podcast/footer ambiguity, metadata/runtime boundaries, and multi-source rotation before hydration truncation.

## Task 1 — repair catalog discovery and qualification

Files: `source_suite_profile_registry.js`, `assets/source-program-policy.js`, `realsignal_source_catalog.js`, `realsignal_api_v2_worker.js`, both HTML profile descriptors/topic overrides and focused source admission tests.

- [ ] Verify primary-source uploader identities for Growing a Greener World and GardenSMART; add only genuine program feeds.
- [ ] Add RED tests for seeded upload discovery, balanced candidates, named gardening episodes, stale podcast/unrelated farming rejection and client/stored-row parity.
- [ ] Implement the smallest Garden Ledger changes; retain the existing framework and all other profiles' behavior.
- [ ] Run focused/full regression gates and one independent review; fix Important findings with RED/GREEN regressions.

## Task 2 — production proof and release

- [ ] Stamp 6.0.14, commit/push through the authorized normal workflow; keep rollback as a commit revert without migration.
- [ ] Use bounded existing maintenance calls to ingest program metadata with the authorized server-side key. No secret extraction or search burst.
- [ ] Confirm 20+ distinct admitted programs, duration/genre/source facts and repeated rotations with played-item feedback.
- [ ] Visually verify decoded channel 545 playback and Next, guide, and mobile layout; verify deployed stamps and CI/API/Pages.
- [ ] Publish precise counts and remaining limits. If a genuine blocker prevents the 20-program target, report it rather than padding the catalog.
