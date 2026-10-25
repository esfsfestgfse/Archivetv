# IA / Source Suite genre-admission repair

> Execute inline with superpowers:executing-plans, failing regressions before changes, and one bounded independent review before release.

**Goal:** Repair confirmed editorial-admission failures found in the full cached-catalog scan; release 6.0.15 only after regression and live checks.

**Spec:** User-approved suite-wide scan and targeted repair, preserving depth/freshness, legitimate short formats, and browser-only testing. No additional approval is needed for the already-authorized scope.

**Architecture:** Reuse existing shared admission and persisted catalog boundaries. Do not rebuild the backend or change providers. The current read-only audit covers 170 canonical IA lanes (13 aliases excluded) and 92 Source profiles; 23,128 records were observed without discovery requests.

## Constraints and review focus

- Treat stored candidates, requalified shelves, guide listings and decoded playback as distinct evidence.
- Reject programs explicitly identified as podcasts, including plural spelling; retain valid audio/podcast channels and real-program promotional footers.
- Preserve original cartoon shorts, music-video runtimes, official TV satire, viewing history and on-topic catalog depth.
- Keep OK/Vimeo admission unchanged during this scoped repair. Do not reset catalogs, renumber or hide channels.
- Apply shared Source editorial evidence to guide rows with their persisted identity/language metadata; avoid rejecting GardenSMART episodes merely because their generic titles need their uploader identity.
- No native-window/desktop/mouse/system-keyboard control. Chrome tab automation only.

## Task 1 — reproduce and repair confirmed boundary gaps

Files: existing `assets/source-program-policy.js`, `ia_file_contract.js`, `realsignal_api_v2_worker.js`, mirrored client IA guard as needed, focused admission/API tests.

- [ ] Add failing fixtures from the admitted Restoration Row, Public Works, Green Culture and Christmas Cartoon & TV podcasts; retain valid publisher-program footers and podcast-history documentaries.
- [ ] Add IA regressions for explicitly podcast-labelled video including plural spelling, retaining audio-contract and legitimate original cartoon exceptions.
- [ ] Add a guide fixture showing stale podcast rows cannot be advertised as verified programming; retain valid metadata-dependent gardening identity and clean current/next entries.
- [ ] Implement only confirmed shared-policy / cached-guide boundary repairs. Measure requalification deltas against every captured Source profile before broadening any checks.

## Task 2 — verification and release

- [ ] Rescan all captured records under the new rules, report stored suspects separately from actual eligible programs, and flag rather than silently erase unknown metadata.
- [ ] Run relevant admission, guide, runtime, client parity and existing offline regression gates; review once and correct material findings.
- [ ] Verify affected channels' actual playback, Next and guide through Chrome tabs; no extrapolated fleet certification.
- [ ] Bump both visible builds/API release to 6.0.15 for the verified repair, commit/push explicit files and verify CI/API/Pages through the normal authorized workflow.
- [ ] Report counts and limitations. Keep Chrome's historical intermittent timeout unresolved unless it reproduces with causal evidence.
