# RealSignal 2.0 reliability checkpoint — September 4, 2026

## Deployment and scope

Desktop .068 was confirmed on GitHub Pages; its publishing jobs succeeded.
This pass measured IA queue responses, not decoded first frames or physical Cast playback.
Eight historically weak channels were tested with five requested items, two rotations,
rotation base 43, concurrency two, a 22-second overall budget and six-second refill window.

| Channel | First pass depths | Same-rotation recheck depths | Recheck repeated identifiers across rotations |
|---|---|---|---|
| 51 Hard Count | 5 / 5 | 5 / 5 | 0 |
| 66 Surf / Skate / Snow | 5 / 5 | 5 / 5 | 0 |
| 150 Classic Cartoons | 5 / 1 | 5 / 5 | 0 |
| 10 Classic Rerun TV | 3 / 5 | 5 / 5 | 2 |
| 12 Game Show Channel | 1 / 1 | 5 / 5 | 0 |
| 19 Old Nick | 5 / 5 | 5 / 5 | 1 |
| 121 The Beeb | 0 / 0 | 5 / 1 | 0 |
| 153 Modern Cartoons | 5 / 5 | 5 / 5 | 3 |

The first pass returned at least one ready item in both rotations on seven of eight
channels; the recheck did so on eight of eight. The mean first successful queue-response
latency per channel was 3,040 ms initially and 244 ms on recheck. This is NOT a measured
video-start latency. Rechecking warmed the same rotations and used corrected refill
measurement logic, so the difference must not be attributed to an app performance fix.

## Changes prepared for .069

- When a queue request fails, a nonempty local fallback now schedules up to three
  background recovery attempts, spaced 5, 10 and 20 seconds. Previously this fallback
  could remain underfilled without scheduling another attempt. Existing playable
  items stay available, and scheduled attempts do not run while powered off.
- A successful queue response resets the fallback backoff.
- The audit measures its refill window from first readiness, capped by the overall
  deadline, and never counts items from an HTTP error response as available.
- The nightly queue probe runs even if an earlier source probe fails, unless canceled.
- Regression tests cover both app variants and the audit measurement rules.

## Next evidence-driven work

1. Trace The Beeb's slow/partial fresh rotations through discovery and media validation.
2. Reduce overlap in Modern Cartoons, Classic Rerun TV and Old Nick without relaxing genres.
3. Measure actual first-frame and channel-switch latency separately from queue readiness.
4. Verify .069 with a receiver/phone session; local mock CAF tests do not certify TV playback.

No channel was broadened, no new content source was added, and no Worker was deployed in this pass.
