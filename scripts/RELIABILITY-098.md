# Build 098 playback evidence

## Browser playback checks

The isolated Chrome probe observed a decoded media start and a completed break transition in each requested media class:

| lane | program start | commercial result |
| --- | ---: | --- |
| Modern Cartoons | 843ms | 1985 cartoon commercial, decoded video, 734ms handoff |
| Sports Vault | 818ms | Pontiac Firebird spot, decoded video, 434ms handoff |
| Tight Lines | 642ms | Chevrolet Leader News, decoded video, 546ms handoff |
| Classic Rerun TV | 822ms | 1960 Ken-L Dog Food spot, decoded video, 541ms handoff |
| Fallout Radio | 831ms | audio-only PSA, decoded audio, 561ms handoff |

The probe waits for actual media decoding for Archive video/audio. It treats an embedded YouTube player separately because it is cross-origin and cannot expose a top-level video element.

## Changes

- A channel warms a media-type-correct commercial while the program is on air.
- A TV commercial must expose video dimensions before it can be accepted. Audio-only MP4s fall through to bounded alternates.
- Radio still accepts only audio commercial media.
- Source Suite now takes air from a retained, verified two-item catalog and refreshes toward its five-item target in the background.
- Source Suite recognizes width/height embedded in YouTube player markup when qualifying landscape orientation.

## Source Suite observation

Cartoon Time Machine started a qualified YouTube embed in 2.1–5.6 seconds in the test environment. Its provider result was only two to three qualified items (PeerTube 0, YouTube 2–3), so the five-show target was not met on that cold pull. The app now plays that verified shelf immediately and keeps refreshing rather than presenting a blank channel. More catalog depth still depends on provider availability and strictly eligible, embeddable landscape results.
