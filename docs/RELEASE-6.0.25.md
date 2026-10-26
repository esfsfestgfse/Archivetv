# RealSignal 6.0.25 — Whole-IA genre and identity audit

The audit covered all 170 canonical IA channel profiles and their 13 legacy aliases, with matching desktop/mobile inventories. It read at most 96 stored catalog rows per channel, using two concurrent read-only requests. Every catalog endpoint responded successfully and returned records. This is observed catalog coverage, not certification of every video or total Archive depth.

Twenty-four channels had potential series-identity splits in those samples. Manual review separated legitimate mixed-show, multi-film and artist collections from six reproducible single-series label inconsistencies: Pokémon Indigo League, American Experience, Blackadder, Ghost Stories for Christmas, Quatermass, and FreakyLinks. Reviewed source-parent identities now unify those label variants for both ordinary and guarded IA rotation. Explicitly different editorial series and genuine mixed-show holiday cartoon collections remain distinct. Catalogs and watched IDs are unchanged.

Disaster Desk also admitted three promotional on-set interviews for the fictional movie Greenland through its stored-catalog fallback rules. The same scoped admission gate now rejects movie publicity, trailers, reviews and recaps on that station across server, relay, desktop/mobile caches and guide admission. Real Greenland documentaries, historical disaster programs and eyewitness interviews remain eligible. No blanket interview ban was introduced.

The regressions first failed on the observed identity pairs and Greenland examples, then passed with the repairs. Offline selection simulations use captured catalog windows; they are not decoded playback proof. Browser testing is reserved for flagged stations after deployment, with source availability and actual visible frames recorded separately. No whole-lineup or physical mobile/Cast certification is claimed.

No lineup changes, history resets, runtime relaxations, new sources, recurring tasks or broad backend rewrite were introduced. Source Suite provider work remains a separate subsequent phase.
