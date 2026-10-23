# RealSignal 6.0.3 — Weather Watch live networks

Channel950 now has Local Forecast, FOX Weather, and The Weather Channel buttons. Local Forecast remains the default and keeps current observations, forecasts, radar layers, local alerts, and the national watchboard.

The two networks use public entries listed in [iptv-org's US directory](https://github.com/iptv-org/iptv/blob/master/streams/us.m3u) through the existing guarded HLS player and relay. No new account, credential, subscription, Worker, or access-control bypass was added. Feeds remain upstream-controlled and may become unavailable or region-restricted. The Weather Channel's own consumer app has separate subscription/provider requirements; this is not a subscription entitlement or official distribution agreement.

## Usage

Open Weather Watch (950), then choose a network at the top. Choose Local Forecast to return immediately without reloading the weather data. NEXT continues to change radar layers in local mode and does not rotate live networks.

## Lifecycle and regressions

- Network selection stops local music and spoken forecasts.
- Returning to local mode, changing channels, or powering off releases the video player.
- Same-selection clicks do not restart the stream; late old-player callbacks remain guarded.
- Hidden weather refreshes cannot overwrite the selected network's guide listing or narrate over its audio.
- Selected network media is retained for the existing Cast handoff. Physical receiver testing was not performed.
- Weather feeds honor app volume/mute; browser audio restrictions fall back to muted video with the existing sound prompt.
- The Weather view overrides the legacy46vh player cap without changing Live TV or Sports layouts.

## Verification

Chrome decoded moving FOX Weather video and1920x1080 Weather Channel video in both HTML clients. At412x915, all buttons fit, video filled the available stage, forecast return retained81°F and stopped media, and NEXT changed local to regional radar. Desktop player measured736px inside its736px network host after correction.

Behavioral tests cover selector ownership, identity, default state, teardown, Cast sync payload, speech exclusion, audio preferences/autoplay fallback, and the existing FAST recovery paths. CI's browser regression now checks Weather default, full-stage sizing, mobile control bounds, and return cleanup with external feeds mocked. Actual feed availability is tested manually, not inferred from those mocks.
