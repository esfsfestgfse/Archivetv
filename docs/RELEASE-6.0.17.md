# RealSignal 6.0.17 — Source Suite player handoff

Source Suite keeps its prepared YouTube iframe stopped and hidden while attempting a direct video. If that provider fails, the selected YouTube program uses the existing player instead of navigating a replacement iframe. Power-off, Cast handoff, IA playback and non-YouTube profiles still use full local cleanup. Suspended callbacks cannot start hidden programs or advance the active native program.

## Evidence and limits

- The original failure reproduced with OpenVideo disabled. A native page without RealSignal or the YouTube SDK also failed to navigate a newly inserted iframe after a 15-second delay. An already mounted iframe survived the same delay. This identifies the failing navigation boundary in this Chrome environment; it does not establish why Chrome deferred that navigation.
- Selected-video bootstrap, waiting for iframe load before SDK binding, and earlier native-media cleanup were tested locally and did not fix the reproduction. None is included in this release.
- With the retained transport, desktop and mobile HTML both recovered from a controlled 15-second stalled direct provider into actual decoded, advancing YouTube video. Selection-to-advancing-clock times were 1.204 seconds on desktop and 0.603 seconds on mobile. A rapid desktop channel round-trip reused the same iframe and recovered in 0.602 seconds. Screenshots confirmed visible picture, separately from clock checks.
- These figures exclude the deliberate failed-provider wait. This repair removes the subsequent blank-player timeout; it does not claim an instant start for a stalled provider.
- The real Restoration Row catalog also started visible 1280x720 video. Guide and Next were exercised. Mobile Power-off removed the iframe. Physical phone and Chromecast certification were not performed in this bounded Chrome run.
- New regressions failed against the previous implementation, then passed after the repair. All 89 offline CI/API commands and three build-stamp tests passed.

Both visible builds, browser titles, asset cache keys and API release identify 6.0.17. Diagnostic fixtures, tracing and unsuccessful experiments remain local. Catalogs, source admission and viewing history are unchanged. Version 8 continuity/schedules remain deferred.
