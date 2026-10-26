# RealSignal 6.0.32 — Canonical Source catalog ownership

Full-browser verification found a late compatibility bridge still intercepted the `server` provider call. It returned only `items` and discarded `candidateItems`, silently restoring a five-item catalog even after the canonical adapter was fixed. The bridge now delegates the canonical `server` call to its original adapter. Legacy provider calls keep their existing behavior, and the browser continues to enforce runtime, landscape and editorial rules.

A second late playback-recovery wrapper overwrote Black Stage's corrected format rule. Its stage/performance branch now honors the canonical long-form relaxed-format contract with topic identity. Runtime tests load both the actual late recovery wrapper and the actual provider bridge. The combined adapter regression reproduced 5 items versus 140, then passed. Named stage productions failed through the late wrapper until that conflict was corrected. Existing audio/podcast/competition-clip negatives still pass.

Local Chrome mobile proof now shows Black Stage's first playable catalog arriving at 473 ms and the deeper 31-item working catalog at 817 ms; a YouTube player clock started at 1,476 ms. One previously rejected item remains excluded. This is the actual installed viewer catalog, not just the status endpoint. Opt-in source phase diagnostics distinguish these milestones from native compositor first frames.

This includes the preceding four-profile discovery/editorial repairs and PeerTube playlist playback fix. The initial 3/7/10/9 profile windows became 32/45/33/17 items through the measured viewer gates, with strict metadata rules retained. Documentary Desk's three previously failed native videos show compositor-confirmed starts in 2.162–2.985 seconds. Catalog/history are preserved; no lineup changes or data migration are required.

Version 7 remains a separate release gate. Desktop/mobile browser smoke is not a physical-phone or Cast soak, and metadata-qualified depth is not a claim that every provider video decoded.
