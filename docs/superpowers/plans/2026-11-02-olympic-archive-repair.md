# Olympic Archive 61 — 6.1.10 repair

Goal: replace the confirmed 24-candidate/4-ready contaminated opening with deep, substantial Olympic programming. Preserve Summer and Winter competition sessions, substantial ceremonies and athlete documentaries.

Architecture: use existing Archive collection/file expansion and transport checks, rolling shelf, persistent freshness and same-event recovery. No new services or per-tune discovery.

- [x] Reproduce generic news/hearings/late-night matches, short torch/clock/medal videos, simulation/fiction, non-English disclosures, unknown-ready runtimes, and wrong session grouping. Tests cover relay, shared qualification/API and desktop/mobile caches.
- [x] Expand real Olympic collection files; retain 15-minute minimum, landscape geometry, exact-file backups, edition/discipline/gender/session identity. Interleave editions/disciplines before catalog caps. Keep legitimately unknown language/event identity explicit rather than invented. Reuse current catalog/ledger path and cooldown owner.
- [ ] Verify multiple rotations, representative visible decoded frames, actual playback/Next/guide, focused sports tests, existing CI/API gate, one bounded review. Push/deploy 6.1.10 and verify hosted release.

Baseline evidence: `output/sports-6110/baseline.json`; metadata/discovery saved beside it. Observed generic BBC news, CSPAN hearings, Jimmy Fallon/Seth Meyers, Olympic countdown/medals/torch clips and foreign-language snippets. Existing normal discovery must remain; the issue is admission, missing file-level depth and stale catalog masking. Keep unrelated channels, Cast ownership, numbers, services, bindings and old artifacts intact.

## Verified before publication

Final bank: 1,640 MP4 range/header-checked landscape files from 49 Archive parents and 83 edition/discipline families; retain normal discovery. Known dates span 1948–2024; four file records have no established year. Transport checks are not whole-program playback or language certification.

113 focused sports tests and 96/96 CI/API command groups pass. Six final local five-item shelves return 30 distinct selections, no repeats/rejected candidates, with 96-item catalogs spanning multiple Games rather than the earliest two. All 26 stratified files decoded visible landscape video and remain admitted. Final actual local startup/Next: 1,978/1,985 ms with advancing playback, matching guide current/next and working guide closure; the earlier first tune was 4,002 ms.

One review found a parenthesized Spanish disclosure and lost parent disciplines in coded children. Both were reproduced in failing tests and corrected, including compaction. A real API canary exposed the 96-item truncation skew; a lane-specific edition/discipline interleave before the cap now preserves later Games. Reservation cooldown ownership remains tested. No broad selector rewrite, new service, binding, migration, number or Cast transport change.

Public deployment and hosted playback checks remain required.
