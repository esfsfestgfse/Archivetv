# Local Weather repair and rebuild

> **For agentic workers:** Use superpowers:executing-plans, with one final independent review.

**Goal:** Repair Weather Watch's local forecast on PCs and phones while leaving the working network player intact.

**Architecture:** Extract only the local forecast into a shared, guarded client module and responsive stylesheet. Continue using NWS plus the existing Open-Meteo fallback; no Worker/schema migration or Version7 feature work.

**Spec/design:** User requested enhance/fix/rebuild of the broken local forecast before Version7. Reproduced: mobile day cards49px tall with85px content, hidden later days; radar object-fit:cover cuts away geography; stale hourly periods shown; station lookup blocks all forecast paint; failed alerts become false all-clear. Chosen design: manual Now/Hourly/7-Day/Radar/Alerts views in the existing retro shell, pixel icons retained, full radar image, explicit refresh and honest partial/stale/unavailable states. A CSS-only patch cannot fix the data failures; an all-channel/backend rewrite is unnecessary. Proceed inline under user's standing preference to complete the repair without repeated planning questions.

## Constraints and review focus

- Local Forecast default and channel950 preserved; FOX Weather/TWC, volume, Cast handoff remain supported.
- Every forecast day must be reachable on phones; no clipping/hidden later days or automatic view rotation.
- Expired hours excluded; use the forecast location timezone; distinguish real observations from forecast values.
- Alert failure is unknown/unavailable, never a fabricated all-clear; expired alerts excluded, details readable.
- Independent request completion paints promptly; bounded requests, no overlapping refresh, no stale-owner callbacks.
- Last-good cache must match location, be age-bounded, and clearly marked while refreshing.
- Radar layer selection owns its callbacks, full map remains visible, unavailable radar retains the last scan with a truthful status.
- Preserve other channels and unrelated artifacts; publish only after tests, browser checks, review and hosted CI.

### Task1: shared local Weather implementation

**Files:** assets/weather-local.js/css; both HTML clients; scripts/test-weather-local.js; existing Weather/network/CI browser tests; release docs and stamps.

**Interface:** RealSignalWeatherLocal exposes hourly(), daily(), alerts(), createLoader(), markup(), mount(). Existing network selector remains unchanged.

- [x] Add failing pure-data and asynchronous loader tests, observe RED.
- [x] Implement normalized daily/hourly/alerts and independent guarded loader, observe GREEN.
- [x] Replace local forecast markup/rendering with shared manual views and scoped CSS; retain network integration.
- [x] Validate real browser PC/phone layouts, actual NWS/radar, view switching, return from networks, Next, refresh and departure. Fallback/timezone/outage behavior covered by deterministic tests; not a physical device certification.
- [ ] Run all offline CI commands, final review/fixes, bump6.0.4, commit/push, verify hosted CI/Pages and public app.
