# RealSignal 6.0.4 — Local Forecast repair

Weather Watch (950) keeps Local Forecast, FOX Weather and The Weather Channel. This release rebuilds only the local forecast; Version 7 work remains paused.

## What changed

- Manual Now, Hourly, 7-Day, Radar and Alerts views replace the clipped fixed-height dashboard and optional automatic segments.
- All seven calendar days are reachable on phones, with daytime highs, nighttime lows, animated pixel conditions and expandable forecast details. Hourly excludes ended periods and uses the forecast location's timezone.
- Radar preserves the complete map, offers Local/Regional/National controls, and keeps the last image with a delayed label if a new image fails. Next changes radar layers, not live networks.
- Forecast, hourly, observations and alerts load independently. A slow station lookup no longer prevents forecast display. Requests are bounded, repeated refreshes share pending work, and departure aborts requests and releases view resources.
- Same-location saved data can appear immediately. Each field expires independently after two hours; partial success cannot renew another field or conceal its saved-data label.
- NWS observations and Open-Meteo model conditions are distinguished. Forecast highs are never presented as current observations; missing values stay missing. Open-Meteo timestamps are absolute and daily lows are retained.
- Alert failure is explicitly unavailable, never a fabricated all-clear. Local alerts include actual event type, locations/states, severity, expiry in the forecast timezone, descriptions and instructions. National counts group exact hazards rather than mixing unrelated warnings.
- FOX/TWC selection and existing audio/player/Cast handoff ownership are preserved. No Worker, credential, database, channel-lineup or provider change is included.

## How to use

Power on and tune 950 from Live channels. Local Forecast opens first. Choose a section below the location header. Scroll forecast cards on a phone; open Forecast details for the complete text. Refresh retries weather/radar. Location continues to use the existing Menu location setting. Choose either network at the top for live video, and Local Forecast to return.

## Data and limits

NWS provides US forecasts, observations, alerts and radar. Open-Meteo is the existing forecast/model fallback, not an alert provider. A failed alert request is not evidence of safety. Radar labels identify image-load time, not a guaranteed upstream scan timestamp. National summaries are separate from local warnings. External service outages remain possible.

Primary API references: [NWS services](https://www.weather.gov/documentation/services-web-api), [Open-Meteo forecast API](https://open-meteo.com/en/docs).

## Release checks

All 67 unique offline Node CI commands passed on the stamped release, including 33 scoped Weather data/network tests. Python browser-regression syntax passed. Behavioral tests cover calendar grouping, timezone handling, alert uncertainty, independent feeds, cache expiry, partial refresh, cancellation, stale owners, exact warning groups and network lifecycle. CI browser fixtures check seven reachable unclipped days, full-map selection, network return, and alert outages on both clients.

Real Chrome checks confirmed NWS observations, 24 hourly periods, seven readable unclipped days at390x844, access to the final day by scrolling, full radar maps, Next, expanded details, guide return, Refresh at844x390, and stop-on-return video cleanup. FOX decoded moving512x288 video and TWC1920x1080 with audio unmuted. These checks are not physical-phone or Cast receiver certification. Hosted CI/Pages status must pass before this release is reported as deployed.
