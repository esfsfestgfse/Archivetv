# Sports Vault repair — 6.1.9

Goal: repair channel 53's confirmed legacy fragments and missing reviewed sport banks. Spec: existing all-sport archival broadcast identity; retain depth, genre accuracy, persistent freshness and same-event recovery.

Architecture: interleave qualified existing repair banks, not another discovery service or per-tune harvest. Reuse the rolling shelf and existing ledger.

- [x] Reproduce short/unknown-runtime ready entries, ceremony/training contamination, single-sport window bias and lost member event identity. Test relay, shared API/file qualification and desktop/mobile cached playback.
- [x] Connect reviewed member file banks without duplicating their data, interleaving sports before catalog limits. Require substantial video and preserve full original broadcasts, documentaries and same-event keys. No channel renumbering, new services, Cast/rotation ownership changes or unrelated cleanup.
- [ ] Exercise repeated shelves and representative decoded frames, actual Next/guide, affected tests and release checks. Ship 6.1.9 with a new visible stamp and verify hosted behavior.

Baseline: production returned 5 ready/45 candidates. Candidates include Olympic countdown/medal/torch-relay clips, skiing home movies and training footage. New basketball, baseball, football, wrestling and other reviewed banks are absent. Existing metadata/transport evidence is reused, with a bounded fresh transport/decode canary; counts are not claims of whole-program completeness or known English audio.

## Verification before publication

Reused 1,209 reviewed file records from nine member banks (1,200 conservative event/file groups), without copying their large inline banks. Existing normal discovery remains. Interleaving occurs before the 96-item response window. This does not assert current transport/decode certification for every bank file or known English audio where language metadata is absent.

102 focused sports tests and all 96 existing CI/API command groups pass. Six final local five-item shelves returned 30 distinct event selections, 96 candidates each, zero observed repeats/rejected catalog rows. All 18 stratified samples across nine sports decoded visible landscape frames and remain admitted. Actual local tune/Next/Next reached first visible frame in 1,988/1,989/3,997 ms, with advancing playback and working current/next guide/close. One reviewer caught excluded CFL/XFL/Pancrase aliases; the real rows were covered by failing tests and restored. Live queue inspection also exposed The Basketball Diaries and The Golf Specialist; both now fail relay, API/file and saved desktop/mobile admission. Reservation failure cooldowns remain covered.

Public CI/deployment and hosted playback remain required. No new bindings, migrations, channel numbers, services or Cast transport changes. Unrelated audit/cache artifacts retained.
