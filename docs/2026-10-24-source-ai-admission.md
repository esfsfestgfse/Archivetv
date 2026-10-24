# RealSignal 6.0.8 — Source Suite AI admission

## Change

One shared policy rejects disclosed synthetic media throughout YouTube/PeerTube Source Suite discovery, D1 fallback, retained browser catalogs, active shelves and subsequent tune/Next selection. The observed EyeBible uploader and Judith upload (`0yGHkKFFvE0`) are excluded by identity, including older records without disclosure metadata.

YouTube uploader IDs and returned `status.containsSyntheticMedia` facts now survive normalization, storage compaction and D1 reconstruction. Complete provider descriptions are checked before accepted records are shortened for storage; PeerTube detail descriptions are checked too. No extra foreground provider request was introduced.

Cache pruning preserves cache age and viewing history. Existing cartoon commentary rules, runtime/orientation checks, OK/Vimeo catalogs, channel numbering, Cast paths and the opt-in player boundary remain in place. Generic mentions of AI, documentaries examining AI, and negated generation disclosures do not constitute production evidence.

## Evidence

- Regression fixtures reproduced admission and metadata loss before the fix.
- Independent review found common-disclosure misses, description truncation and false positives. Each was reproduced with a failing fixture and corrected.
- Focused admission suite: **21 passing tests**, including actual mocked discovery and D1 response paths, both client loaders, stale/active shelves, legitimate cartoons and AI subjects.
- Full offline release gate: **86 commands, zero failures**.
- Visible-build fixtures: **3 passing tests**. Desktop/mobile title, asset cache keys and visible build are **6.0.8**; API release is `6.0.8-source-ai-admission`.

## Limits and remaining work

Public metadata is not a universal AI detector. Missing/false synthetic status is not certified human authorship; undisclosed synthetic uploads may still need an evidenced uploader exclusion. Official reference: https://developers.google.com/youtube/data/reference/rest/v3/videos#status.containsSyntheticMedia

This is an admission repair, not startup certification. The separate Chrome blank-frame investigation remains open: a matched control rendered an iframe created immediately during a click, while an otherwise identical iframe created after a 600ms delay remained `about:blank`. Local Cartoon Time Machine startup also remained pending during this release's browser check. The default player and opt-in SDK promotion state were not changed to conceal that failure.

Next: finish that causal startup investigation, then the confirmed Auto Racing/Uptown Comedy/Blues editorial fixes. No Version 7 stamp is applied.
