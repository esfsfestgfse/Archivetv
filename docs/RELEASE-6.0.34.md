# RealSignal 6.0.34 — Comfort Television program boundaries

A hosted 6.0.33 smoke test reproduced a cast-retrospective upload in Comfort Television: yt:kBiuwdqHyvA, "Home Improvement Then and Now 2026 | Who’s Still Alive After 35 Years?" The video played correctly, but it was not the channel’s craft, gardening or home-project programming.

A Comfort-only shared title-format rule rejects cast then-and-now, where-are-they-now and who-is-still-alive retrospectives. It applies to discovery, retained D1/fallback rows, guide results and both client cache pruners. Real painting/woodworking/home-renovation episodes and gardening history remain admitted. Other profiles, catalogs, freshness history, lineup and playback mechanisms are preserved; no schema migration or history reset is required. The no-picture guards from 6.0.33 remain in force.

The exact observed title first failed its regression, then passed after repair; all 24 editorial-boundary tests passed. All 94 existing offline gate commands passed and the scoped review found no blocking issue. Hosted results are recorded separately after deployment. This narrow editorial repair does not certify all catalog content. User-reported real-phone controls passed on 6.0.32; that is not a claim of physical testing of later builds. Version 7 remains unstamped while latency and final release criteria remain open.

Rollback: revert the release commit through a new commit and normal deployment workflows. No catalog purge or database downgrade is required.
