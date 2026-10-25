# RealSignal 6.0.15 — Genre and guide admission repair

The cached-catalog audit covered 170 canonical IA lanes and 92 registered Source profiles, observing 23,128 stored records without triggering provider discovery or consuming viewing history. This is metadata/admission evidence, not fleet-wide decoded-playback certification.

## Changes

- Reject explicitly podcast-labelled Source video programmes across discovery, stored playback and browser caches. Preserve documentary subjects about podcast history, real-programme promotional footers, and the unchanged OK/Vimeo admission paths.
- Reject plural podcast/vodcast labels in the shared IA file gate and desktop/mobile cached-video gate. Preserve the dedicated audio lane and reviewed original cartoon shorts.
- Qualify ordinary IA and Source guide rows with their persisted metadata instead of treating all active D1 rows as eligible. AI disclosures, uploader identity, language, runtime and geometry survive the Source check.
- Refill underfilled guide listings from at most four bounded D1 pages. This never initiates discovery or writes freshness. Eight requested listings remain eight rather than a five-item playback-shelf cap.
- Distinguish stored depth from fully qualified depth. Partial scans expose `qualifiedCatalogDepth: null`; an empty rejected window is pending and cannot authorize repeats.
- Update both visible builds, tab titles, API release and asset cache keys to 6.0.15. No catalog deletion, history reset, channel hiding, renumbering or provider changes.

## Measured admission delta

| Source profile | Captured eligible before | After | Removed |
| --- | ---: | ---: | ---: |
| Restoration Row | 84 | 83 | 1 podcast |
| Public Works | 57 | 56 | 1 podcast |
| Green Culture | 72 | 71 | 1 podcast |
| Christmas Cartoon & TV | 56 | 55 | 1 podcast |

The other 88 captured Source profiles are unchanged under the new shared rule. Recreation Room's raw IA candidate set includes one plural-labelled podcast record now rejected by the video gate; raw storage does not establish that it previously played.

## Validation and remaining work

- Existing offline CI/API commands: 87 passing. The changed guide/API/admission checks were rerun after review corrections.
- Focused editorial tests: 15 passing, alongside 42 existing admission tests. These cover the observed four podcasts, AI metadata, plural IA formats, audio/cartoon preservation, metadata-dependent gardening identity, real pagination limits, deep stored totals and exhausted/rejected guides.
- Visible build-stamp fixtures: 3 passing. An initial Windows temporary-folder rename restriction was resolved by using a writable test folder, without changing production code.
- Chrome tab checks: desktop/mobile entry points show 6.0.15; guide search/selection/open/close operated. Restoration Row showed a real restoration video after Next. Its initial YouTube attempt stalled, so this release does not claim the historical Chrome startup problem is solved. Physical phone/Cast certification was not performed.

Next: isolate that remaining YouTube startup stall with a controlled comparison, then address remaining profile-specific genre mismatches from the audit. No Version 7 certification is implied.

Spelunkr research and proposed ideas are recorded separately in [SPELUNKR-RESEARCH.md](SPELUNKR-RESEARCH.md); none of those new features was implemented here.
