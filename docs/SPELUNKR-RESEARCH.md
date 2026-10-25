# Spelunkr TV comparison — 2026-10-25

Scope: public product, directory and the creator's public technical explanation. No private backend, repository or complete source-code audit was available. No Spelunkr-inspired product changes are included in this repair.

## Observed

- The live site has a compact retro timeline guide, programme durations/year, current/next listings and a small curated lineup. The directory displays tape counts and hours per station.
- Clicking Watch started a direct `archive.org` MP4 in an HTML video element. It joined midway through a long Disney broadcast recording. Some guide rows still displayed an antenna/loading state.
- The creator describes shared list/start-time schedules, year/shuffle/block ordering, versioned schedule swaps between programmes, bumpers/music breaks and a limited DVR window. These are the creator's claims; backend performance was not independently measured.
- It uses Internet Archive too. It does not provide RealSignal with another catalog source or a guarantee that Archive outages disappear.

## Best fits for RealSignal, pending discussion

1. One versioned, verified station snapshot shared by playback and guide; promote and roll back atomically between programmes. Keep our rolling playback shelf and freshness ledger.
2. Honest station depth: distinct programmes, series and playable hours, with last-check time. Separate stored candidates, editorial admission, transport checks and actual visible playback.
3. Marathon blocks assembled from legitimate original cartoon shorts. Keep each child's identity, title and viewing history; do not mislabel a short as a feature-length file.
4. Small station bumpers and natural programme breaks. Reviewed recordings already containing commercials should not receive another stacked break.
5. A simpler timeline with readable current/next, progress, duration, year and source. Prototype before replacing the guide.

Do not force shared schedules, mid-programme joins or time-of-day programming on the current personal rotation. The user has rejected time-of-day restrictions and wants fresh openings and reliable Next. Chat/reaction overlays are not a priority.

## Sources

- https://spelunkr.tv/
- https://spelunkr.tv/directory
- Creator's firsthand description: https://www.reddit.com/r/sideprojects/comments/1x3muyr/i_built_a_fake_live_cable_tv_network_out_of_the/
