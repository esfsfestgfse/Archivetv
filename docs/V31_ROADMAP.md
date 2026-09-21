# RealSignal 3.1 roadmap

3.1 begins as a measured, backward-compatible layer on top of the public 3.0 playback build. The public build stamp stays `3.0.0` until the 3.1 canary and regression gates pass together.

## Delivered in the first slice

- A read-only `/api/v3/health/summary` endpoint aggregates channel health, source health, surface/Cast totals, first-frame failures, repeats, stalls, and recoveries from the existing D1 telemetry tables.
- Server channel scores classify lanes as `healthy`, `watch`, or `repair` without changing playback selection.
- Source Suite now maintains a bounded per-profile freshness ledger in the browser and sends recent item IDs to the Worker. The Worker excludes recent items when new candidates exist, serves a single fresh last-good item immediately when necessary, and refills in the background.
- Durable Object rotation accepts the same recent-ID hint, preserving session isolation while preventing a client shelf from being shown again immediately.
- The existing diagnostics view gains a remote scorecard and a live-data freshness panel. It is read-only and manual-refresh; it never sits on the tune or media-start path.

## 3.1 follow-up gates

1. Collect a real 24-hour telemetry window across IA, Source Suite, FAST, radio, desktop, mobile, and Cast.
2. Patch only lanes whose scorecard shows repeat, stall, failure, or first-frame regressions.
3. Confirm Source Suite freshness with repeated rotations while preserving the 15-minute minimum and no-Shorts/no-vertical rules.
4. Add live-data source-specific recovery metrics for maps, Ship Tracker, sports, and weather feeds.
5. Run the full cross-surface canary and soak. Only then move the public stamp to `RealSignal 3.1 — Adaptive Freshness & Live Data`.

## Safety rules

- No permanent bans are introduced by freshness filtering.
- A fresh item is preferred; the last-good playable item remains an emergency fallback.
- Telemetry failures are non-blocking and may not prevent playback.
- Existing 3.0 endpoints and clients remain compatible.
