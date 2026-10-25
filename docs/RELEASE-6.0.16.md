# RealSignal 6.0.16 — Restoration Row genre repair

Version 7 reliability work continues. Channel continuity and continuously advancing guide schedules are explicitly deferred to Version 8; no schedule changes are included.

## Verified repair

Restoration Row matched the word restoration in unrelated programmes. The shared editorial policy now rejects software-game restoration, medical sight/organ-donation films, academic/team presentations and home movies whose upload credit merely says restoration by someone. The same rule applies to fresh discovery, persisted source catalogs, browser caches and guide admission.

The captured 92-profile replay removes exactly four unrelated entries from Restoration Row (83 to 79 admitted candidates). The other 91 Source profiles are unchanged. No catalog records or viewing history were deleted. Tests retain actual aircraft, car, art, furniture, building/church, film, vintage computer and arcade-cabinet restoration. OK/Vimeo admission and the IA player are unchanged.

## Verification

- 63 focused admission/editorial tests pass, including six new Restoration Row regressions. The previously admitted wrong titles failed before the fix.
- All 88 offline CI/API commands and three build-stamp tests pass. Independent review found no blockers.
- An instrumented copy of the existing YouTube runtime recorded seven distinct program starts on desktop/mobile entry points with no pending/timeout events: 0.601–1.003 seconds from selection to advancing media clock. Browser DOM checks also confirmed playing 1280x720 video. Guide open/close and Next operated. These are a bounded Chrome run, not physical phone/Cast certification or proof that intermittent failures are eliminated.
- Production YouTube runtime remains unchanged: the historical blank-start problem did not reproduce in this run, and no speculative player patch was made. Diagnostic tracing remains local and is not shipped.
- Both visible builds, tab titles, API release and current asset cache keys are 6.0.16.

## Next

Keep the intermittent startup fault open until causal evidence reproduces. Continue profile-specific genre repairs from measured failures; do not reset catalogs, add channels, hide channels or begin the deferred Version 8 continuity work.
