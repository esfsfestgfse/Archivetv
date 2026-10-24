# RealSignal 6.0.11 — production sample correction

6.0.10 deployed successfully: CI, Pages, client publishing, API and IA relay jobs all passed. The subsequent production queue check exposed additional keyword collisions beyond the original reported items.

- Auto Racing 54: reject the observed reaction/watch-along stream and Gone in Sixty Seconds / Halicki movie family. Preserve racing broadcasts and reviews.
- Uptown Comedy 225: reject the observed Black Baseball / Negro Leagues documentary, Prince tape containing Oprah/Today Show compilations, and the specifically titled Chris Rock / Will Smith commentary. Preserve actual Chris Rock Show episodes and stand-up specials.
- Apply the rules to the shared IA contract, both client gates and relay gate; persisted API catalogs use the same contract. Keep channel numbers, watched history, freshness ledger and catalogs intact.

All five observed bad records are rejected by the final admission policy. In the saved production candidate samples, 298 media-bearing racing candidates and 31 Uptown candidates remain admitted. These are candidate-policy counts, not newly transport-verified or semantically certified programs. Queue requests alone do not simulate watched-item feedback or prove viewer freshness.

Regression fixtures failed against 6.0.10 and pass with the follow-up rules. The original 6.0.10 playback evidence and limitations still apply: no further player change in this follow-up. The regular-Chrome-profile delayed control remains an open compatibility investigation; the isolated browser plays that control. Physical mobile and Cast certification are not claimed.

Visible desktop/mobile title/stamp, asset cache keys and API release identifier advance to 6.0.11. Rollback is a normal commit revert; no data migration is required.
