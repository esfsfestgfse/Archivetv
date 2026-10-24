# RealSignal 6.0.9 — Prepared Source Suite playback

The default YouTube player now opens before catalog waits and loads the chosen program through the official SDK. Compatible YouTube handoffs retain the loaded iframe; they replace only the program owner. Leaving Source Suite, selecting native media/another provider, or powering off still cleans it up.

## Reproduction and repair

A single-player Chrome control reproduced an empty `about:blank` iframe when it was created after a 600ms delay. Creating an empty official player during the click, then calling `loadVideoById` after that delay, produced decoded 1280×720 video and a playing event at 1.076s. This identifies a reproducible navigation/lifecycle failure class; it does not identify or blame a browser extension or upstream component.

The repair separates physical-player ownership from program ownership. Old program listeners are removed and cancelled callbacks cannot promote, reject or advance a new program. Playing state plus an advancing media clock is required for startup success. Readiness alone is not playback. Temporary errors preserve catalog entries and history. Natural EOF advances once; metadata duration does not truncate a program.

The asynchronous iframe remount was removed because it recreated the failed navigation pattern. Late SDK readiness clears the failed flag so a recovered player remains reusable. An ambiguous error without matching video identity does not reject another program.

## Verification

These are individual local Chrome samples, not fleet percentiles or physical-phone/Cast certification. Timing is **advancing playback-clock time**, not a fabricated first-visible-frame measurement. Video dimensions and advancing media time were inspected independently inside the actual player.

| Check | Observation |
|---|---|
| Desktop cold Source Suite | Decoded 1280×720; playback clock 1.604s |
| Desktop Next | Different program; 1.003s |
| Desktop rapid Next twice | Final selected program decoded 1280×720; 0.602s |
| Desktop Source Suite channel change | Same iframe, different channel; 0.603s clock start |
| Source Suite → IA → Source Suite | IA decoded 480×360, then YouTube decoded 1280×720 in a new player |
| Mobile build, 390×844 Chrome viewport | Decoded 1280×720; cold clock 1.202s; Next 0.602s |
| Guide during playback | Desktop open/close 244ms/11ms; mobile 304ms/16ms |
| Final reviewed mobile runtime | Cold clock 1.003s; Next 0.803s; decoded 1280×720 |
| Final default desktop, no opt-in flag | Advancing 480×324 video; clock 1.204s, tune complete 1.295s |

Rapid mobile channel up/down also returned to the selected channel. Unit tests cover natural EOF once, stale callbacks, timeouts, late recovery, SDK errors, controls, cancellation, catalog retention and Cast history. A mobile native seek-control attempt did not cause EOF; it is not counted as an end-to-end EOF certification.

Independent review found two Important issues: late readiness retaining a failure marker, and queued old-program callbacks affecting a replacement. Both were reproduced RED and fixed GREEN. No Minor findings were reported.

Full offline gate: **86 commands, zero failures**. Visible-build fixtures: **3/3**. Normal playback uses the prepared player; `youtubeSDK=0` retains an explicit client rollback. The API, catalogs, viewing history, channel numbering and AI-admission filter are unchanged.

## Next separate repair

Auto Racing admitted a newscast; Uptown Comedy's generic recovery seeds require correction; Blues needs spoken-editorial filtering based on item metadata. Playback testing additionally exposed cartoon gameplay and theme-song quizzes, which need a targeted cartoon admission rule. These content issues are not claimed fixed by this player release. No Version 7 stamp is applied.

SDK reference: https://developers.google.com/youtube/iframe_api_reference
