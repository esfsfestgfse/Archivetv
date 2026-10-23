# Weather Watch network selector implementation plan

> **For agentic workers:** Use superpowers:executing-plans for this small, single-feature change.

**Goal:** Play FOX Weather and The Weather Channel inside Weather Watch without replacing local weather.

**Architecture:** A shared selector controller and stylesheet retain the forecast DOM and use the existing guarded Live TV player for one selected network. No new discovery service, account, Worker, or unrelated UI redesign.

**Tech Stack:** Existing HTML clients, plain JavaScript, HLS.js, Node tests, Chrome visual checks.

**Spec:** User request: “wire up fox weather and weather channel into the live weather app.”

## Global constraints

- Local Forecast remains the default. No automatic network rotation or unrelated substitute networks.
- Preserve radar, alerts, forecast state, existing channel number 950, and local NEXT radar behavior.
- One active player; no jazz over network audio; stop on return, channel change, and power off.
- Use publicly listed, currently playable feeds; no credential, DRM, or subscription bypass. Network availability is upstream-dependent.
- Ship matching desktop/mobile assets and a new 6.0.3 build stamp only after video validation.

## Review focus

- Rapid selections and stale callbacks must not leave a second player or restart music after departure.
- Hidden local data refresh must not replace the network's current guide listing.
- Re-selecting the active network must not restart playback.
- Portrait/compact browser controls must remain readable and inside the viewing area.
- A failed network must leave forecast navigation usable, with no automatic unrelated-channel hop.

### Task 1: Shared controller and both client integrations

**Files:** `assets/weather-networks.js`, `assets/weather-networks.css`, both HTML clients, `scripts/test-weather-networks.js`, `.github/workflows/ci.yml`.

**Interfaces:** `RealSignalWeather.mount(root, {isCurrent, onSelect, stop})` returns `{current, dispose}`; `RealSignalWeather.feeds` contains exact network rows for existing `playTV`.

- [x] Write and observe failing behavioral tests for default/panel visibility, network identity, one-selection ownership, teardown, and departed-screen guards.
- [x] Implement controller and wire both existing Weather functions to shared media/guide/music lifecycle.
- [x] Run focused tests and existing offline CI commands; inspect actual Chrome video, return-to-forecast, rapid switching, and mobile file.
- [ ] Review the change, update stamps, commit and push named files, verify hosted CI/Pages and public network video.
