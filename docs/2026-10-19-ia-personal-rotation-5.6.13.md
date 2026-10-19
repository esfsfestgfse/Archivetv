# RealSignal 5.6.13 — personal rotation follow-up

## Why a second increment

The 5.6.12 hosted run improved Modern Rerun TV and Blighty from their prior 6/12 and 9/12 unique selections to 17/18 each, but each still repeated once. All 170 canonical IA lanes remained available. The remaining repeat was not declared fixed.

Shared played history was still being merged into every viewer's hard exclusions. If viewers collectively watched a small catalog, the relay could treat it as exhausted for someone who had only watched a few programs. A real-route regression with a globally watched 24-item catalog reproduced a second-rotation repeat on Blighty.

## Minimal repair

For standard IA requests with explicit, nonempty `viewerRecentIds`, only that viewer's history is a hard exclusion. Matching shared records may supply existing family/era metadata; other viewers' records cannot consume personal unseen inventory. Empty viewer histories and legacy clients retain shared initial-selection behavior. Guarded reservations, catalogs, filters, source adapters and storage bindings are unchanged.

The fix is request-local. It does not erase shared viewing history, permanently ban media, or personalize a shared cache. True personal catalog exhaustion still permits repeats. The 256-entry local-history bound remains explicit.

## Verification

- 92 focused tests passed after the fix, including the reproduced shared-exhaustion failure and preserved client, exact-cache, file-identity and collection-depth cases.
- All 79 repository CI commands passed after the 5.6.13 stamp. Deployment, hosted rotations and availability will be recorded after the final normal push.
- 5.6.12's real local/browser decode and 170-lane URL-availability evidence remains documented separately; it is not mislabeled as 5.6.13 physical-device certification.
