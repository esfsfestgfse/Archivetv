# IA Canonical Station Contract

This is a guarded pilot for three existing Internet Archive lanes:

| Profile | Channel | Editorial contract | Minimum verified catalog |
| --- | ---: | --- | ---: |
| `classic-tv` | 10 | 1950–1989 television episodes and series files, 15+ minutes | 12 |
| `classic-cartoons` | 150 | 1930–1979 cartoons and animated episodes, 3+ minutes | 15 |
| `game-shows` | 12 | 1940–2026 game, quiz, and panel shows, 15+ minutes | 12 |

## Canonical item schema

Every verified row has the `ia-canonical-1` schema and includes:

- `programId`: stable `ia:{identifier}::{file}` identity;
- `archiveId`, `file`, `sourceUrl`, and `mediaUrl` for provenance and playback;
- `canonicalTitle`, `seriesTitle`, `year`, `decade`, and `familyKey`;
- `runtimeSeconds`, `collection`, `subject`, `tags`, `genres`, `creator`, and `rights`;
- `provider: Internet Archive`, `playability: header-verified`, and `profileKey`.

Collection files are individual catalog rows. A complete-series item is therefore expanded into episode/file candidates instead of being represented by only its first file.

## Station profile contract

Each profile owns its own era bounds, minimum and maximum runtime, inclusion terms, deny terms, collection seeds, decade targets, family/collection caps, target depth, and minimum depth. A row must pass all of the following before it enters a manifest:

1. It has a stable Archive identifier and a direct media URL.
2. The media URL passes a header-level playability check.
3. Runtime and year fall inside the profile contract.
4. The title/description/subject/collection vocabulary matches the profile.
5. No profile deny term is present.
6. Collection, family, and decade balancing rules accept it.

## Queue and guide behavior

The canonical queue is a rolling shelf: one selected item, up to two immediately ready items, and the remaining verified candidates available for background rotation. The persistent freshness ledger excludes recently served program IDs until the verified catalog is exhausted. The guide reads the same verified manifest, so current/next cannot describe an item that the queue rejected.

## Safety and rollout

The Worker flag is off unless `IA_CANONICAL_PILOT` is set to `on`, `true`, `1`, or `pilot`. `IA_CANONICAL_PILOT_CHANNELS` can further restrict the pilot to a comma-separated channel list. A manifest is eligible only when `verified: true` and its `catalogDepth` meets the profile minimum. If either condition fails, the existing relay/D1 path is used unchanged.

The pilot sequence is:

1. Generate and inspect the three manifests.
2. Compare catalog depth, genre accuracy, runtime, repeats, and queue latency.
3. Measure decoded first-frame speed in the browser/device canary; server-side comparison cannot prove a rendered frame.
4. Enable only the passing profile(s) with the channel allow-list.
5. Expand to additional IA profiles only after the same gate passes.
6. Add M3U/XMLTV exports after queue and guide behavior are stable.

The generated comparison report is `ia-canonical-pilot-comparison.json`. It marks unavailable baseline metadata and first-frame measurements as unscored rather than converting missing data into a false pass.
