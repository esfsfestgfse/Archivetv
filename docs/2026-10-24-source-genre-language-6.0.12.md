# RealSignal 6.0.12 — source genre and language repair

## Confirmed repairs

- PeerTube discovery now retains the provider's declared language from search and detailed metadata. The shared Source Suite guard rejects declared non-English records on fresh, stored, and client-cache reads. Three stale French gardening records are excluded by their verified provider identities because their old rows lost language. Undeclared language is not fabricated as English, and empty language objects do not become false foreign-language codes.
- All four Source Suite cartoon-family profiles share the existing actual-cartoon rules. The observed fireplace/jazz ambience and episode-analysis uploads cannot stand in for Halloween specials.
- Game Show Archive rejects the observed timelapse/video-game fan-event collisions. Documentary Desk rejects the observed episodic commentary framing.
- Explicit self-disclosures such as “This video contains AI-generated content” and “created as a cinematic AI-generated…” are rejected. The actual sampled restoration videos supplied those disclosures. Original animation, AI as a documentary subject, negated disclosures, and ordinary restoration/upscaling remain distinct from generated programs.
- Self-described podcasts cannot enter through a normal-looking program title. Documentary footer links to unrelated podcast networks do not establish podcast format.
- Catalogs, viewing history, channel numbers and the player runtime are preserved. Desktop/mobile title/stamp/cache keys and API release identifier advance to 6.0.12.

## Scope and evidence

Twelve read-only Source Suite catalog samples contained 630 records; the final policy retains 616 and rejects 14 observed wrong-format, language, synthetic-production or podcast records. This is an admission sample, not a semantic certification of every remaining program. Game Show Archive retains 80, Halloween Cartoon & TV 85, Gearhead Garage 40. The sampled movie, general-cartoon, cooking and military catalogs retain their prior counts.

Eight serial IA queue samples covered Classic Rerun TV, both Game Show eras, Classic Cartoons, Documentary Hour, The Hunt, Sci-Fi Theater and Halloween Cartoons. Seven initially returned five ready programs with fitting identities; Sci-Fi Theater returned four, then five on its serial retry. No IA catalog or admission rule was changed without a new reproduced IA genre error. Garden Ledger retains only four in this sample after excluding foreign-language material; do not count unrelated content as healthy depth.

The independent review caught a false positive where an English PeerTube program about Japanese gardening would be rejected by a broad language-word blacklist. The check was narrowed to declared language codes; a positive regression preserves that program. A supplemental review of the later disclosure/podcast delta caught companion-podcast promotion being mistaken for program identity. Podcast self-identification now uses the opening sentence, preserving the demonstrated documentary footer. Both findings were reproduced RED and fixed GREEN; the reviewer was closed.

## Candidate playback checks

Regular Chrome desktop decoded 854×480 Source Suite cartoons and Game Show Archive's actual Newlywed Game episode. Rapid skips settled on the final selection in 611 ms; guide open/close was 116.6 ms / 1.8 ms. Halloween Source Suite played an actual Casper special at 854×480; switching to IA Classic TV played a Get Smart episode at 576×432. Mobile HTML at 390×844 decoded 640×360, started in 1.288 s, advanced Next in 906 ms and opened/closed the guide in 171.2 ms / 24.6 ms. These are individual advancing-clock/tune samples with decoded media inspected separately, not percentile first-frame SLOs or physical-device certification.

The established 86-command offline gate and 29 focused source admission tests pass. Build-stamp and fixture-network unit checks each pass three cases. Hosted/deployment verification follows the normal push; record its result separately rather than inferring success from these local checks.

## Chrome investigation and limitations

A fresh-document immediate official YouTube control plays in the affected Chrome profile. A plain iframe created after 600 ms stays blank there even without any SDK owner or RealSignal code; the identical isolated-browser control loads at ~1.0 s and decodes 1280×720. Attaching the SDK only after load does not repair the failed navigation. This excludes the application SDK owner as the sole cause.

The affected profile injects OpenVideo scripts. Its official listing describes automatic player embedding: https://chromewebstore.google.com/detail/openvideo-%E2%80%93-ad-free-strea/dadggmdmhmfkpglkfpkjdmlendbkehoh?hl=en . This is correlation, not causal proof. A user-assisted single-extension comparison was requested because browser tooling blocks internal extension settings; no extensions or settings were changed. The remaining profile-specific failure is not claimed solved.

This release does not certify physical phones/Cast or all channels. Browser-layout playback and advancing media clocks are checked separately from decoded video dimensions. No universal first-frame, AI-detection or genre guarantee is asserted.

Rollback: revert the release commit through the existing workflows; no schema migration, history reset or catalog wipe.
