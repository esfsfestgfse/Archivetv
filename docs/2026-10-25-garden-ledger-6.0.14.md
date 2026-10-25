# RealSignal 6.0.14 — Garden Ledger depth

Garden Ledger (545) retains its existing YouTube/PeerTube pipeline and freshness ledger. The repair replaces quota-sensitive general YouTube searching with rotating upload feeds from **Growing a Greener World (@ggwtv)** and **GardenSMARTTV (@GardenSMARTTV)**, both linked by their original program publishers. The bounded maintenance pass reads three upload pages per feed and interleaves them before the 150-video detail limit, preventing one series from consuming every candidate slot.

The profile now recognizes real series identity as well as physical gardening topics. PeerTube discovery emphasizes garden tours, horticulture, community/vegetable gardens and plant cultivation rather than broad agricultural history. A gardening upload must still pass the runtime, landscape, language, synthetic-production and genre checks. Two Corbett Episode 299 podcast variants and an unrelated livestock/grain program are rejected rather than counted as depth.

Garden-specific title rules distinguish the actual program from promotional footer links. Mentioning a companion podcast or affiliate links does not turn a full gardening TV episode into a podcast or commercial. Cached API reads use the same qualifier as fresh discovery; both clients receive the updated profile and enforce the shared gardening policy. Other channels' description rules are unchanged. YouTube detail metadata retains the declared audio language.

The existing five-item active shelf, 96-item candidate window, persistent viewed history, channel number and player runtime are preserved. No credentials, schema migrations, provider additions, Chrome extension changes or catalog resets are required.

## Verification and rollout

- Focused admission tests cover named full episodes, valid promotional footers, known podcast variants, unrelated livestock, runtime/portrait/declared-language/AI rejection, two-feed candidate balance, client parity and missing-policy behavior.
- Independent review found description-only exclusions and an initialized-client cache mismatch. Both were reproduced and fixed. The candidate-budget test now exercises oversubscribed maintenance discovery; a mutation confirms that old lane flattening fails its balanced 150-ID check. All 42 focused tests pass.
- The complete established 86-command offline gate passes; visible stamp tests pass three cases.
- Both public source examples were visually decoded before release: GGW Episode 1202 at 25:26 and GardenSMART at Gibbs Gardens at 26:34.
- Deployment is followed by bounded existing maintenance ingestion, catalog-depth/source checks, actual playback and consecutive rotation verification. The 20+ program goal is a production gate, not inferred from mocked test data. Record the observed production result in the final verification report.

## Primary source references

- GGW's official episode archive links its past seasons and YouTube channel: https://www.growingagreenerworld.com/episodes/
- Source episode and uploader link: https://www.growingagreenerworld.com/episode-1202-in-susans-garden/
- GardenSMART's official full-episode page supplies the YouTube embeds: https://www.gardensmart.tv/?p=full_episodes
- The excluded Corbett program is explicitly published as a podcast: https://corbettreport.com/episode-299-solutions-guerrilla-gardening/

Rollback is a normal release-commit revert; viewed history remains intact. The separate Chrome/OpenVideo comparison remains unresolved and is not changed by this release.
