# RealSignal 5.5.77: OK animation and Vimeo playback

New Source Suite channels:

| Number | Channel | Programming |
| --- | --- | --- |
| 588 | OKCartoon Kids | Non-anime children's cartoon episodes |
| 589 | OKCartoon Adult Animation | Non-anime adult animated series |
| 590 | OK Anime | Anime episodes explicitly labeled English dubbed |

Use the guide search or enter the channel number. Next selects another program.
All three lanes require landscape video and at least 15 minutes. Fan edits,
parodies, podcasts, trailers, gameplay, and short clips are rejected.

Discovery uses OK's public title-search pages and official embedded player,
with exact show identity checks, persistent search offsets, a durable catalog,
episode deduplication, series balancing, and freshness history. The saved
bootstrap is an outage fallback, not a limit on what discovery can find.
The anime lane currently has fewer verified show families; background paging
continues to expand it without substituting unrelated cartoons.

Vimeo channels 586/587 now use Vimeo's official Player SDK. Next/EOF, pause,
volume, cleanup, public embedding permission, runtime, and identity have
dedicated regression tests. The public-read Vimeo credential stays encrypted
in Cloudflare. Serial ingestion runs every six hours, separate from viewing.

Metadata admission is not a guarantee of a provider's future availability,
upload audio language, or copyright ownership. Physical Cast playback is not
certified by browser-only tests; existing Cast behavior is unchanged.
