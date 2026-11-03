# Sporting Life 65 — 6.1.16 Implementation Plan

> Execute inline using superpowers:executing-plans; use one bounded fresh review at the end.

**Goal:** Replace the reproduced 27-candidate, fishing-heavy shelf with a deeper, balanced catalog of substantial outdoor programming while preserving the shared rolling shelf, freshness and recovery architecture.

**Architecture:** Interleave existing reviewed 65/80/81/83 file banks, requalify each for the target channel, and let the existing API/session owner select and rotate. Prefer repaired relay inventory over old D1 snapshots. No new source service, bindings, migrations, synchronous discovery or broad refactor.

**Spec:** Approved sports repair sequence; existing Sporting Life identity: fishing, field sport, hunting and old-school outdoor competition.

**Constraints:** Landscape; substantial English-focused programs; no podcasts, fan/parody, games, politics or unrelated material. Ready video must have selected-file runtime >=900 seconds. Known originals and full broadcasts retain their intermissions. Preserve unrelated artifacts. Browser-only automation, no native desktop control. Increment the visible build and push verified changes normally.

- [x] Capture production baseline: five ready / 27 candidates; the opening five are all fishing. Only 23 reviewed files are connected despite 60 already eligible files across existing outdoor banks.
- [x] Add behavioral regressions for ready runtime, target genre, reused file depth, client admission and topic-balanced API selection.
- [x] Requalify/interleave reviewed outdoor banks; recognize demonstrated program identities without broad subject-tag admission.
- [x] Route 65 to repaired catalog ownership and balance selected-program topics (not inherited subject tags); preserve reservations/cooldowns.
- [x] Fresh transport probes and representative decoded video; repeated API and actual browser Next/guide checks.
- [x] Run affected checks plus existing CI/API gate; one bounded review and fix any reproduced finding.
- [x] Commit/push/deploy 6.1.16 (a409b59); production CI and all deployments passed, all 63 candidates connected.

Review focus: field-sport copies from mixed Olympic parents must retain their actual sport; outdoor brand names must not approve politics, fiction or tags-only matches; source-language and selected-file duration survive cache/API paths; outdoor topic balancing does not weaken current freshness/cooldown safeguards; an older D1 shelf cannot mask the connected inventory.

Evidence: the connected bank has 63 reviewed files from 51 Archive parents: 15 fishing, 29 hunting, 19 field-sport programs. All 63 passed fresh MP4 range/signature probes on their primary origins. Six representative recordings decoded landscape video. Six API rotations returned five ready items each and 30 distinct selections with no policy rejection or repeats. Actual local app start was 1040 ms, then two visible Next starts at 1323/741 ms; guide current/next and close retained playback.

The single fresh review reproduced an older-history bug: recentCatalogIds truncated viewer exclusions to 48, allowing watched field programs back into a balanced shelf. Added a failing 60-watched/30-unseen API test, then preserved the full sanitized 256-entry client ledger. Topic scoring remains bounded by the existing selector. Reviewer closed after reporting.

Final local verification: all 96 CI/API commands pass, including 165 sports tests. The older Sporting Life genre fixture had URL-only ready records; updated positive and negative fixtures with known 1800-second landscape media so the test continues to exercise genre admission, while separate tests explicitly reject unknown/short selected runtimes. Physical phone/Cast and whole-video completeness are outside this bounded check.

Production-driven quality follow-up (6.1.17): the fifth Next reached a 16-minute rifle-buying listicle from live discovery. Added a failing observed-title admission fixture and reject equipment-buying clickbait across relay/API/file/cache boundaries. Do not assert that undisclosed AI has been universally detected; the observed defect is program identity.

Also measured an upscaled In-Fisherman file at 7.402 seconds to visible video. Metadata inspection confirmed its only MP4 is a 7.82 GB original; the other inspected fishing original is 8.08 GB. No smaller Archive derivative exists for either. Preserve all 63 distinct files, but apply a channel-65 ready-selection preference for available standard-resolution programs. A failing selector fixture proves large originals remain playable when they are the unseen inventory. Local 6.1.17 opened a normal-resolution In-Fisherman program in 1.541 seconds and advanced to Best of Buckmasters. This is a preference, not a guarantee of constant upstream latency.

Final affected verification: 166 sports tests, 99 broad depth tests, playback/guide/API/HTML checks pass. Reuse the unchanged checks from the full 96-command baseline; GitHub runs the complete gate again for the shipped commit.
- [x] Publish 6.1.17 (e9a560f); use further visible skips to catch remaining genre bleed.

The next actual public skip exposed a conservation lecture titled Balancing Outdoor Recreation with Wildlife Conservation in Protected Lands. Root cause: the positive identity vocabulary accepted generic outdoors/outdoor recreation as program identity. Tighten positive identity to specific fishing/hunting/field-sport terms and recognized outdoor programs; explicit seminar/webinar formats are excluded. All 63 reviewed files still pass. Added a failing observed-title fixture at every API/file/relay/cache boundary before the change. Final follow-up is 6.1.18; no service or discovery rewrite.
- [x] Publish 6.1.18 (efac881); full CI/deployments passed. Further actual saved-cache skipping reproduced the shared identity defect below.

Shared ready-shelf root cause (6.1.19): iaReadyShelfRestore assigned the bare media object to iaProgramMedia, losing the containing program identifier and editorial metadata. Playback then had no item ID; Next skipped its history write, and the same warmed URL could return repeatedly even though the API selected fresh programs. Added failing desktop/mobile tests of the actual restore function and sports playback facade (undefined ID), then restore a complete playable object with id/title/year/meta. Preserve file identity, source facts and same-event recovery copies.

Actual existing-shelf local playback now uses full parent::filename IDs and advanced from Bowhunting for Whitetail Deer to Bill Dance, Archery Strategies, and Gary Borger; no repeats. The fresh full 96-command local gate is green. This is a source fix shared by legacy IA saved-shelf playback, not a catalog reset or a source ban.
- [x] Publish 6.1.19 (491a267); full CI/deployments passed, restored production playback retained an actual program ID and subsequent programs advanced.

Final observed cache cleanup (6.1.20): Archive parent 098909 is a general 1956 Midwest/Florida home movie with incidental fishing, not an outdoor show. Exclude home-movie format and that known legacy parent even if old cached titles were relabeled. Preserve genuine professionally published Realtree Home Videos. Failing actual-title and relabeled-parent fixtures now pass at relay/API/file and both cached-client boundaries. All 63 reviewed programs remain admitted.
- [ ] Confirm the final 6.1.20 deployment, actual five-skip saved-cache path and guide; save final evidence.
