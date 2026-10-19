# RealSignal 5.6.10 — IA ready-shelf and rotation repair

## Why this change matters

The deep catalog and the small playing shelf are different things. A discovery record can describe a program before its playback URL is resolved. It must remain available for background discovery, but it must not replace resolved media on the playing shelf or be counted as a successful watch.

The production trace demonstrated the problem on Rodeo Roundup (70): its relay supplied three media URLs, and its API catalog contained 52 resolved records, but API session rotation selected three unresolved records and still reported `ready: 3`.

## Repairs

- Standard IA rotation selects resolved HTTP(S) media only. Unresolved discovery records remain in the catalog and do not enter its seen ledger.
- Ready counts describe the actual returned shelf. Partial shelves are reported honestly instead of padded with metadata.
- Standard IA D1 windows rank older resolved media ahead of newer unresolved metadata. Full metadata windows no longer suppress shallow-catalog background refresh.
- A separate upstream ready shelf is preserved when the candidate list contains only unresolved records. This does not change the guarded Classic TV, Classic Cartoons, or Game Show reservation order.
- At the bounded rotation-window limit, unresolved records cannot crowd out newly resolved programs. This is a session window, not a deletion from the durable D1 index.
- Large standard IA session records use the existing transactional chunked-storage helper instead of exceeding the 128 KB per-value limit. Small records and legacy state remain supported.
- During a rotation-service outage, freshness is applied to the resolved pool first. A recent playable item is preferable to an empty shelf containing only unseen metadata.
- The API exposes resolved/pending window counts and labels exhaustion as `resolved-session-window`, not exhaustion of everything available on Internet Archive.

No channels were hidden, removed, merged, or renumbered. No genre, runtime, portrait, language, or contamination filters were relaxed. OK, Vimeo, Source Suite discovery, and Cast protocols are unchanged.

## Verification before release

| Check | Evidence |
| --- | --- |
| Production catalog capture | All 170 canonical IA lanes, concurrency 2, zero request errors. Eighteen returned at least one unresolved shelf item. |
| Identical-catalog replay | 12 selections per lane through the real old/new rotation implementation and bounded storage: 2,040 selections per implementation. |
| Unresolved shelf selections in replay | Old path affected 27 lanes; repaired path affected zero. |
| Oversized storage records | Old path failed on 13 captured catalogs; repaired path had zero storage errors. |
| Repaired replay availability | No empty shelves, no unresolved selected media, and no captured catalog-window shrinkage. |
| Behavioral regressions | 37 tests passed, including real SQLite, legacy state, pending-to-resolved promotion, overflow, partial shelves, outage freshness, and guarded reservation order. |
| Full CI command set | All 79 commands from the repository CI workflow passed locally. |
| Independent review | Two concrete findings reproduced and repaired with regression tests; final review found no remaining Important findings in the scoped diff. |
| Local browser | Classic Cartoons decoded Clutch Cargo at 480×360; Next decoded a different Pink Panther episode at 640×480, with advancing playback time. Guide showed the real current title and next Top Cat episode and closed while video continued. |

The visible desktop/mobile titles and build stamps, asset cache versions, and API health release are bumped to **5.6.10**.

## Hosted release verification

Runtime release commit: `20523f19a5360a5129801e40f9045b489dae4813`.

- Archive TV CI, API deployment, Publish RealSignal, and Pages build/deployment all completed successfully.
- Public API health reports `5.6.10-ia-resolved-shelf-rotation`; both hosted client titles/stamps report 5.6.10.
- A fresh low-concurrency capture of all **170** hosted IA shelves returned **zero request errors and zero unresolved shelf items**, compared with 18 affected lanes before release.
- Hosted rotations on 10, 12, 22, 70, 78, 110, 150, 152, 156, 208, and 701 completed all **132** selections and skip acknowledgements, with **132 unique selections, zero repeats, and zero queue errors**. This is a targeted 12-rotation result, not a claim of permanent global freshness.
- In the deployed browser, Classic Film decoded a 1196×720 feature with an advancing playback clock. Screenshot capture through the browser tool timed out, so no screenshot proof is claimed.

Post-release evidence: `artifacts/ia-ready-catalogs-570-hosted.json`, `artifacts/ia-session-rotations-569-hosted-5610.json`, and `artifacts/release-5610-status.json`. All remain untracked local audit artifacts.

## Limits and next work

A media URL is not proof of a successful network transfer or visible frame. The 170-lane capture and replay are catalog/rotation checks, not a physical-device playback certification. They do not prove all catalog genres are correct or that every long-tail channel has sufficient show-family variety.

Some legacy catalogs still contain genre contamination, and genuinely small resolved windows still exhaust. The next depth work should target those measured channel families, expand complete-series/collection files, and verify actual multi-show playback. Do not widen genres or manufacture readiness just to meet a shelf count.

Working evidence remains in the local, untracked `artifacts/` directory: `ia-ready-boundary-570.json`, `ia-ready-catalogs-570.json`, `ia-ready-replay-570.json`, and `ci-570-final.json`. The `570` suffix is an internal audit identifier, not the public app version.
