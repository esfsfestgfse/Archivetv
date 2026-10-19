# RealSignal 5.6.13 — personal rotation follow-up

## Why a second increment

The 5.6.12 hosted run improved Modern Rerun TV and Blighty from their prior 6/12 and 9/12 unique selections to 17/18 each, but each still repeated once. All 170 canonical IA lanes remained available. The remaining repeat was not declared fixed.

Shared played history was still being merged into every viewer's hard exclusions. If viewers collectively watched a small catalog, the relay could treat it as exhausted for someone who had only watched a few programs. A real-route regression with a globally watched 24-item catalog reproduced a second-rotation repeat on Blighty.

## Minimal repair

For standard IA requests with explicit, nonempty `viewerRecentIds`, only that viewer's history is a hard exclusion. Matching shared records may supply existing family/era metadata; other viewers' records cannot consume personal unseen inventory. Empty viewer histories and legacy clients retain shared initial-selection behavior. Guarded reservations, catalogs, filters, source adapters and storage bindings are unchanged.

The fix is request-local. It does not erase shared viewing history, permanently ban media, or personalize a shared cache. True personal catalog exhaustion still permits repeats. The 256-entry local-history bound remains explicit.

## Verification

- 92 focused tests passed after the fix, including the reproduced shared-exhaustion failure and preserved client, exact-cache, file-identity and collection-depth cases.
- All 79 repository CI commands passed after the 5.6.13 stamp.
- Commit `fcc49aea3f8c92dcf6dcc57702678757bae4c254` reached main through a normal fast-forward push. GitHub CI, Relay deployment, API deployment, Publish RealSignal, and Pages deployment all succeeded. An unrelated scheduled Vimeo workflow was excluded from these five release gates.
- The API health release and actual desktop/mobile HTML titles and visible build constants report 5.6.13. Both public HTML requests returned HTTP 200.
- All 170 canonical IA channels returned three resolved media URLs in a fresh concurrency-two snapshot: zero request errors, empty responses, unresolved shelf entries, or reported catalogs below five. This is availability evidence, not 170 decoded videos or a full-lineup freshness certification.
- The eight-lane hosted run completed 24 acknowledged skip rotations each: **192 selections, 192 per-channel unique selections, zero repeats and zero request errors**. Every response retained at least two resolved items; one Halloween Cartoons response had two rather than three.
- 5.6.12's real local/browser decode and 170-lane URL-availability evidence remains documented separately; it is not mislabeled as 5.6.13 physical-device certification.

| Channel | Distinct selections | Repeats | Smallest reported catalog | Slowest queue response |
| --- | ---: | ---: | ---: | ---: |
| 10 Classic Rerun TV | 24 | 0 | 485 | 1,621 ms |
| 11 Modern Rerun TV | 24 | 0 | 41 | 223 ms |
| 12 Classic Game Shows | 24 | 0 | 350 | 830 ms |
| 22 Modern Game Shows | 24 | 0 | 153 | 904 ms |
| 118 Blighty | 24 | 0 | 28 | 157 ms |
| 150 Classic Cartoons | 24 | 0 | 512 | 3,255 ms |
| 153 Modern Cartoons | 24 | 0 | 96 | 599 ms |
| 705 Halloween Cartoons | 24 | 0 | 65 | 370 ms |

Catalog numbers above are the reported window/depth in those requests, not a count of every Archive file available or a claim that every file was decoded. Queue-response latency is not first-visible-frame latency.

The actual public 5.6.13 desktop player was reloaded and powered on, then decoded a different Modern Cartoons episode (712×540, readyState 4, playback time advancing). The prior 5.6.12 hosted Next smoke also decoded a different file after a skip. Physical mobile and Cast were not tested in this run. Screenshot capture remained unavailable.

## Remaining measured work

- Blighty's 28-item reported catalog remains smaller than the other tested TV lanes. Deepen its verified collection/episode catalog without changing this working handoff.
- Freshness was measured on eight lanes, not all 170. Expand targeted rotation coverage; do not present one-request availability as a full freshness soak.
- A Modern Cartoons on-screen title repeated filename/title fragments even though the video file advanced correctly. That is a display-metadata cleanup target, not evidence of repeated media, and it was not mixed into this release.
- Continue precise first-frame measurement. The 3.255-second worst cartoon queue response also means universal instantaneous starts are not proven.

The one bounded code review found the exact-cache response defect documented in the 5.6.12 report; it was fixed RED/GREEN. This follow-up was driven by hosted failures and a new failing shared-exhaustion route test, with no second agent fan-out or broader rewrite. Both tasks' final checkpoint tests passed. Unrelated audit/research artifacts and the managed checkout were preserved.
