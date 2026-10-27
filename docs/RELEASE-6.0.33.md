# RealSignal 6.0.33 — Source Suite picture admission

A sustained public 6.0.32 session rotated Comfort Television into a six-hour upload explicitly titled "Black Screen Bob Ross The Joy of Painting Season 3" (yt:rH0pfX6gXFc). The embedded landscape video clock advanced with audio/captions but no program picture. This was an admitted no-picture edition, not a decoder stall.

The shared Source Suite program policy now rejects explicit black/blank-screen, screen-off, no-video/picture and audio-only title labels. It applies to discovery, retained D1/fallback rows, guide data and desktop/mobile cache pruning. Normal painting programs remain admitted. Existing catalogs, program IDs, freshness history, lineup, OK/Vimeo and IA playback remain unchanged; no database migration or history reset is needed. Desktop/mobile asset queries and visible stamps move to 6.0.33; API release is 6.0.33-source-no-picture-admission.

Five new regressions reproduced the admission, cached-client and guide failures before the guard was added. Review added an exact-phrase subject/negation regression, also observed failing before repair. All 23 editorial-boundary tests passed, including separate format labels on documentary titles. All 94 existing offline gate commands then passed, and the scoped review found no remaining blocking issue. Production catalog and browser results are recorded separately after execution. Version 7 remains unstamped pending its latency and device criteria; this narrow repair is not universal decoded-video certification or automatic detection of undisclosed black frames.

Rollback: revert the release commit through a new commit and the normal deployment workflows. No schema downgrade or catalog purge is required.
