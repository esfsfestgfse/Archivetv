# RealSignal 2.0 readiness

Build under test: `1.9.7-desktop.120-release2-reliability` and `1.9.7-mobile.120-release2-reliability`.

## What is covered

- IA queue rotation, fallback refill, episode expansion, title identity, and genre locks.
- Source Suite five-item ready buffer, catalog retention, YouTube/PeerTube language and aspect-ratio rules, and fast-start hydration.
- Guide incremental rendering, stable row identity, open/close behavior, and Next/channel ordering.
- Commercial video-only rules, seven-day freshness history, and long-program ad budgeting.
- Radio, live-data lifecycle guards, cast race/standby handling, media resolution, and desktop/mobile parity.
- Local-only Release 2 telemetry for tune latency, first visible frame, stalls, media errors, repeats, and source recovery.

## Measured results in this pass

The deterministic regression suite passed across desktop and mobile. Source Suite hydration measured:

| Surface | First program | Full catalog |
| --- | ---: | ---: |
| Desktop | 34 ms | 102 ms |
| Mobile | 10 ms | 98 ms |

Guide open/close completed in under 30 ms in the visible-playback harness for the sampled lanes.

The headless visible-frame probe did not receive provider-backed media in this environment. IA and Source Suite returned zero playable items, and Source Suite reported zero results from both PeerTube and YouTube. That is recorded as an external provider/network gate, not treated as a code fix without a real provider response.

## Release gates

Before calling 2.0 production-ready, run the telemetry-enabled build in a normal browser/network session:

1. Tune representative IA, Source Suite, sports, radio, and live-data channels.
2. Exercise Next, rapid channel changes, and guide open/close.
3. Capture `window.__rsRelease2Telemetry.summary()` after each lane rotation.
4. Confirm every sampled TV lane gets a visible video frame, Source Suite reaches five distinct queued items, and no lane produces a dead signal after recovery.
5. Confirm commercials remain visible video on TV channels and audio-only on radio.
6. Record provider failures separately from application failures; patch only failures that reproduce with a valid provider response.

## 2.0 structure

- `release2-runtime.js`: opt-in local telemetry and online/visibility recovery hook.
- `the_dial_desktop.html` / `the_dial_mobile.html`: shared playback, guide, catalog, ad, and cast behavior with aligned build stamps.
- `scripts/`: deterministic contracts plus the visible-frame probe.
- `docs/`: deployment and operational runbooks.

The next engineering action is a real-network telemetry capture. If provider results remain empty there, investigate relay credentials, upstream availability, and browser/network policy before changing channel ranking or queue logic.
