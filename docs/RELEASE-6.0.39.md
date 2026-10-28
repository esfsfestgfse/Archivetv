# RealSignal 6.0.39 — preserve ready-media facts

The bounded hosted gate found that 6.0.38's unknown-duration restriction also reached freshly resolved playback through the shared admission function. That made Aviation Next slower, so this patch narrows the restriction to the saved instant-play cache itself.

Fast-tune cache writes and reads now preserve runtime and picture dimensions. Inline ready-media records retain the same facts instead of dropping them while creating the browser playable object. A saved Aviation item with unknown duration still cannot claim to be instantly ready, while a fresh candidate can reach the existing metadata/decoder qualification. Short-runtime, portrait, file-identity and channel-topic checks remain in force.

Tests exercise actual cache writes/reads, distinguish saved versus fresh boundaries, and verify inline runtime/dimensions alongside episode titles. Existing history and catalogs are retained. The Version 7 stamp remains withheld: Comedy Circuit's cold-start wait and two unresolved provider-language checks still need a passing result. Successful recovery via Next is not a clean cold-start certification.
