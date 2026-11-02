# The Pitch 63 — targeted 6.1.12 repair

**Goal:** remove reproduced coaching/news/other-sport/simulation contamination and restore a deep rotating soccer broadcast catalog.
**Architecture:** preserve the existing API, relay, file-level repair banks, event recovery, rolling shelf and viewer freshness ledger. Reuse eligible Olympic/college soccer files and inspect additional international/club collections; no new services or per-tune discovery.
**Spec:** the approved sports repair sequence and full matches/substantial relevant documentaries requirement. English/landscape only; no fragments, fan/parody/podcasts or simulated events.

- [x] Capture production baseline: four ready, 62 candidates; coaching tapes, news, basketball, cricket and 4chan simulations admitted.
- [x] Add failing admission tests across relay, shared file/API qualification and saved desktop/mobile playback. Keep complete broadcasts with original intermissions and real soccer documentaries.
- [x] Add a lane-specific contract, enforce selected-file duration, inspect and verify deeper files, preserve competition/event identity and distinct women's/men's events. Use existing profile and D1/relay precedence patterns only where needed.
- [ ] Verify six rotations, current/next, Next and visible frames; run the existing CI/API gate, one bounded review, publish 6.1.12 and confirm production.

Review focus: same fixture with another upload; first/second-half files masquerading as full matches; shared “world cup” tags on other sports; incidental halftime news/interviews inside a genuine match; saved and stale D1 catalogs bypassing the repaired policy. Preserve reservation-owned cooldowns, all other channel identities, and unrelated untracked artifacts. Metadata/transport checks are not whole-video or physical-device certification.

Local verification: 96/96 CI/API command groups, including 135 sports tests, passed after the review fix. New transport checks: 151 files passed, one HTTP 401 excluded; 24 reused files also passed fresh checks. Combined bank: 175 files. Fourteen representative videos decoded visible frames. Six final rotations returned 30 distinct event selections from a 96-candidate window, five ready each, zero repeats or admission rejects. Local visible first frame / Next: 2,174 / 507 ms; guide current/next and close worked while playback continued. Reviewer reproduced copy-number pollution of fixture keys; a real five-copy public-API regression test now prevents replay, with reviewed event dates preserved. Publication and production verification follow this commit. Physical phone/Cast and whole-program completeness remain outside this bounded check.
