# RealSignal 6.0.23 — Balance series before relaxing the ready shelf

Hosted testing of 6.0.22 caught three Jack Benny episodes in succession despite a deep catalog with other available series. The reservation selector applied its diversity relaxation separately inside each priority pool. When the only completely unseen series was Jack Benny, that pool filled the entire shelf before fresh episodes from previously watched series were considered.

Reservations now try all priority pools with the series cap enforced, then relax only if the complete eligible catalog cannot fill the shelf. Existing promised reservations and viewing history remain intact; truly single-series shelves still fill and explicitly report constrained diversity. The standard Source Suite/OK rotation path retains its previous behavior.

A regression first reproduced a shelf of three Benson episodes while unseen Beaver and Munsters episodes were eligible. The corrected path returns three series and leaves preparation out of watched history. A companion case protects full shelves for genuinely constrained channels.

This release includes the 6.0.22 Classic TV shallow-catalog import and commentary-admission repairs. Full offline regression, production first frames, live skip variety and guide behavior are checked before completion. Physical mobile/Cast and full-lineup certification are outside this focused repair.
