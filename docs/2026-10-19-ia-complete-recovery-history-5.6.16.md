# RealSignal 5.6.16 — complete recovery history

## What ships

Includes the 5.6.15 partial-shelf freshness, saved-cache/first-tune title, asynchronous metadata, and Modern Rerun English-cache repairs described in `2026-10-19-ia-recovery-freshness-5.6.15.md`.

An extended hosted run deliberately went beyond the original 40 clean selections. At rotations 45–57 it exposed a legacy identity mismatch: `first-time-out-1995` was reported as played, but the catalog's identity also contained a concrete filename. Canonical-only exclusion did not recognize the actual reported ID. Channel 11 selected 53 unique IDs in 64 requests, with 11 repeats, despite unseen D1 candidates.

The recovery selector now checks both exact reported playback IDs and canonical file identities. It does not treat playing a parent record as a ban on its unplayed child episodes. This adds no source request or shared state mutation.

## Verification

- Legacy parent-ID regression observed failing, then passing, including an unseen-sibling control.
- Focused suite: 117/117 passed. Full workflow CI: 79/79 commands passed on this final version. Title contract and whitespace checks also passed.
- Prior 5.6.15 deploy: all four applicable workflows passed; API and public desktop/mobile stamps were verified. The relay source/config did not change, so its path-filtered deploy was not triggered.
- 5.6.16 runtime commit: `2f4694f8c24e225b58e10dd7c8c1b747ebb8a7ed`. All four applicable workflows passed: API deployment (39369412866), Publish (39369412914), Pages (39369413102), and CI (39369412851). Relay source/config unchanged; its path-filtered workflow is not triggered.
- Actual public desktop/mobile titles and visible build strings: 5.6.16; API health: `5.6.16-complete-recovery-history`, ready.
- Final hosted channel 11 extended trace: 64 selections, 64 unique playback identifiers, zero repeats/request failures. At rotation 28, 51 unseen candidates remained; at rotation 63, 16 remained. The original early and later identity failures did not recur.
- Eight-lane hosted control run (10, 11, 12, 22, 118, 150, 153, 705), forty selections each: 320 selections, 315 per-lane unique, no request failures. Seven lanes were 40/40 unique. Channel 705 returned 35 unique and five later repeats; a serial 40-selection retry reproduced 35 unique/five repeats. This is an outstanding lane-specific freshness defect, not a clean universal freshness certification.
- Low-concurrency full canonical IA readiness snapshot: 170/170 lanes returned three resolved media URLs, no empty responses, unresolved entries, or request errors, and all reported catalogs at least five deep. This checks URL availability, not 170 decoded video starts or catalog quality.
- Public browser: Blighty first tune decoded Keeping Up Appearances S04 E05 at 464×352, readyState 4, advancing time, correct episode label. Next decoded S04 E07 at 464×352. Guide tuned channel 11, which decoded The End of the F***ing World S02E01 at 854×480 with its episode title/year. Guide reopened/closed without stopping the advancing video. Screenshot capture timed out; evidence is DOM media dimensions, readiness, advancing time and visible UI text, not a screenshot certification.
- No physical mobile/Cast certification is claimed. Next targeted repair is channel 705's reproducible later-rotation repeats; no new architecture rewrite is justified by this run.

Raw local evidence: `artifacts/ci-5616-final.json`, `artifacts/deploy-5616.json`, `artifacts/public-stamps-5616.json`, `artifacts/ia-trace-5615-final-5616.json`, `artifacts/ia-session-rotations-569-5616-hosted.json`, `artifacts/ia-session-rotations-569-5616-705-retry.json`, and `artifacts/ia-ready-5616-summary.json`. Audit artifacts are retained locally, not bulk-added to Git.

## Scope decisions

The one scope ruling remains the channel 11 cached/direct English-policy parity fix: a reproducible saved record bypassed its existing API contract. Cost if wrong: a valid English-labelled channel 11 cache matching the existing exclusion signals could be rejected. No other station's language rules were changed. Review findings were fixed, not deferred; the extended identity defect was then reproduced and patched with its own regression test.
