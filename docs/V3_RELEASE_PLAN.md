# RealSignal 3.0 — Adaptive Live Television

Version 3 is a measured rollout, not a cosmetic version bump. The current
public build remains `RealSignal 2.2.2 — Channel Health Repairs` until the
release gates below pass.

## Architecture now under the V3 gate

`Desktop / Mobile / Cast → /api/v3 → relay + D1 catalog + Durable Object rotation`

- The relay remains the provider adapter and last-good playback fallback.
- D1 stores verified programs, channel membership, source health, and V3
  playback aggregates.
- Durable Objects keep per-session/channel rotation isolated between viewers.
- The public shelf is rolling: one active item, two hot replacements, and a
  deeper background candidate catalog. A full five-item warmup is never a
  channel-change prerequisite.
- Source failures use a temporary cooldown. They do not create permanent bans.
- The V3 API exposes `/api/v3/health`, `/api/v3/telemetry`,
  `/api/v3/health/channels`, and `/api/v3/guide` while `/api/v2` remains a
  rollback-compatible route.

## Release stages

1. **Baseline freeze** — run the full IA soak, Source Suite qualification,
   FAST, radio, guide, desktop, mobile, and Cast regression. Save the reports
   as release artifacts.
2. **Shadow mode** — enable `?v3Telemetry=1` only for canary sessions. The
   bridge sends bounded playback measurements; it never sends titles, URLs,
   account data, or media content.
3. **Canary** — exercise IA, Source Suite, FAST, radio, live data, guide,
   Next, rapid channel changes, and cast handoff on desktop and mobile.
4. **Full soak** — require zero dead-signal regressions, zero HTTP failures,
   no audio-only starts, no guide lockups, and no reproducible channel-change
   stalls. Freshness is measured across repeated rotations, not merely queue
   readiness.
5. **Broad release** — deploy with rollback ready, then stamp the clients as
   `RealSignal 3.0 — Adaptive Live Television`.

## Gate metrics

- First visible frame: p50 and p95 by channel and surface.
- Channel-switch and guide open/close latency.
- Verified queue depth and candidate depth.
- Repeat, skip, stall, timeout, and source recovery counts.
- Mobile/Cast status and audio-only playback failures.
- Source health cooldowns and recovery rate.
- Genre/source-suite qualification: YouTube and PeerTube only, 15-minute
  minimum, landscape, no Shorts/vertical/how-to contamination.

## Rollback

Keep `/api/v2` and the prior client build available until the full V3 gate is
green. A failed canary disables the V3 telemetry flag and returns clients to
the V2 queue path; it does not delete catalog rows or reset freshness history.
