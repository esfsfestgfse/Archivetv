# RealSignal 6.0.7 — Source player canary

## Status

This is an opt-in player canary, **not a declaration that Source Suite startup is fixed**. Normal viewers retain the exact 6.0.6 YouTube player implementation. No Worker, migration, catalog reset, channel hiding, or provider changes.

Enable on either client with `?build=6.0.7&youtubeSDK=1`. Remove `youtubeSDK=1` to return to the normal production player; no stored setting is changed.

## Canary behavior

- Uses Google's official IFrame API instead of a hand-built postMessage lifecycle.
- Requires playing state plus an advancing media clock. SDK ready and iframe load are not successful playback, and clock evidence is not reported as a visible compositor frame.
- Startup/player transport failures preserve catalog entries and viewing history instead of draining eight candidates into a six-hour rejection list.
- One bounded remount is allowed before an uninitialized player is left with native Play/Next controls. The remount did not resolve every observed blank-frame case; it is not claimed as a cure.
- Natural player EOF advances once. Metadata duration and wall time no longer cut off a canary program.
- Mute, volume, pause and sound-unblock gestures use the active SDK owner. Pre-ready volume intent survives initialization and remounts.
- Errors 100/101/150 may reject a genuinely unavailable/embedding-disabled item. Temporary playback/referrer/SDK errors do not permanently reject it. A definite error arriving after pending still notifies the client.
- Local decoded starts enter freshness history; Cast retains its separate existing history path.

## Actual observations

Individual local samples, not fleet percentiles or physical-phone/Cast certification:

- Actual Chrome application decoded and advanced several different cartoon programs. Recorded successful clock starts included 1.205s, 1.204s and 1.405s. Guide open/close in one sample took 31.2ms/1.8ms.
- Other diagnostic-app Chrome attempts remained an uninitialized `about:blank` iframe until timeout, including after a bounded remount. Matched minimal controls played the same IDs in Chrome and a clean in-app browser at roughly 1.3s. The cause remains unproven; no extension or browser setting was changed or blamed.
- Clean 390×844 mobile-layout playback and Next produced decoded 1280×720 video with an advancing clock. This is layout/browser coverage, not an Android hardware certification.
- This evidence supports isolated canary use, not default promotion. The opt-in switch is required even though the code's focused tests pass.

## Review and tests

Three independently reviewed issues were reproduced RED and fixed GREEN: pre-ready volume loss, permanent errors after pending, and lost Cast freshness history. A hung-test completion guard was also verified: suppressing settlement previously exited zero; the guarded fixture exits one.

Two old static gates initially failed because they recognized only inline YouTube EOF syntax. The gate now also recognizes the shared callback contract; the new lifecycle fixture exercises actual EOF deduplication and stale-owner behavior.

Final offline gate: **86 commands, zero failures**. Visible-version fixtures: **3/3**. Whitespace validation is clean. Both default-player function bodies were compared byte-for-byte with the 6.0.6 baseline after accounting only for the helper's name. Hosted CI/Pages remain separate checks on the pushed commit.

## Still next

1. Resolve the intermittent Chrome blank-frame case before removing the canary switch.
2. Fix Auto Racing's news admission, Uptown Comedy's generic-comedy recovery rails, and Blues editorial/language accuracy.
3. Repair Source Suite cartoon contamination: tests also exposed AI Bible animation and a public-domain VHS essay. These are catalog-admission defects; this player canary does not claim to fix them.
4. Recheck real device playback, guide, Next, freshness and recovery before any Version 7 stamp.

The linked win3zz gist is a list of credential-exposure searches, not a media source or player improvement. Its defensive ideas may inform a separate own-repository secret audit. No external credentials were searched for, tested or used.
