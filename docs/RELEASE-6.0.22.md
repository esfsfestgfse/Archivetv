# RealSignal 6.0.22 — Classic TV catalog recovery and episode admission

The hosted 6.0.21 test reached visible playback for all 11 selections, but six selections were Benson and one was a discussion about Mary Tyler Moore. A clean canary did not reproduce the old production catalog state.

## Targeted repairs

- While Classic TV has fewer than the existing 96-item catalog target, active requests can import another repaired relay batch after 30 seconds instead of waiting five minutes. Rapid skips remain coalesced. Once the verified catalog is deep, the existing five-minute interval resumes. Other channels keep their existing cadence.
- The confirmed American TV with Mitchell Hadley discussion format, and explicitly labeled television-history discussions/video essays, are rejected from Classic Rerun TV. The gate runs on catalog reads, durable reservations, relay admission, local caches, and guide admission. Episode titles such as The Interview and incidental plot descriptions remain allowed. The rule does not remove these programs from appropriate documentary channels.
- Catalogs, pending reservations, viewing history, source verification, the small ready shelf, and channel numbering are preserved.

## Regression coverage

The new API regression first failed on the five-minute import delay. It exercises the actual API, durable rotation and catalog-write code with simulated external storage/relay boundaries. It proves that a blocked background relay does not delay the ready response, rapid requests share a repair, the next repaired series is imported on a later active request, and deep catalogs retain the conservative cadence.

Editorial regressions first reproduced the observed commentary admission. They cover the shared API contract and the actual desktop, mobile and relay predicates, including positive episode examples and channel scoping.

Hosted playback, production series balance, guide controls and release stamps are verified after deployment. This focused change does not certify every IA channel or physical mobile/Cast devices.
