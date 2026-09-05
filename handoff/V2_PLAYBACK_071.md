# Playback and guide stability — build .071

This release adds a local-only playback audit and removes a real guide race.

## Measured local desktop run

| Action | First visible frame / paint |
| --- | ---: |
| Channel 2 archive playback | 1,998 ms |
| Channel 12 Game Show playback | 1,827 ms |
| Next on Game Show | 205 ms |
| Rapid tune: Channel 13 | 872 ms |
| Rapid tune: Channel 14 | 993 ms |
| Guide open | 1,466 ms |
| Guide close | 421 ms |

The observed sequence had no stall, audio-only, or repeated-program event.
These are local browser results, not a claim about a Chromecast or a particular
internet connection.

## Fixed failure

While the guide was open, background queue warming rebuilt every channel row.
That could disconnect a row between pointer-down and click, so selecting a
channel intermittently failed. Queue updates now refresh the row text in place,
preserving the active click target, keyboard focus, and scroll position.

## Diagnostic mode

Open either app with `?playbackAudit=1` to collect a local in-page report at
`#rs-playback-audit`. It records tune start, first visible compositor frame,
media events, stalls, repeat identifiers, and guide control paint time. It
sends no telemetry and does not change playback.

## Regression guard

`scripts/test-guide-row-stability.js` runs in CI to prevent background queue
warming from returning to destructive guide-list rebuilds.
