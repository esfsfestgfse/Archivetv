# RealSignal Version 2 API migration

## Current slice

`realsignal_api_v2_worker.js` is the first usable Version 2 service. The
previous `realsignal_api_worker.js` remains as a v1 rollback reference. The V2
service exposes a versioned contract and is now used by the IA queue callers in
both browser builds:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/v2/health` | GET | API health and binding capability probe |
| `/api/v2/ia/search` | GET | IA discovery search through the relay |
| `/api/v2/ia/metadata/:id` | GET | IA metadata and file resolution |
| `/api/v2/ia/queue` | POST | Relay shelf plus per-session repeat suppression |
| `/api/v2/ia/program` | POST | Program-director queue compatibility route |
| `/api/v2/catalog?channel=...` | GET | Read normalized D1 catalog records |

The API Worker calls `ais-relay` through the `RELAY` Service Binding. It does
not call the public relay URL. Each session+channel is routed to its own
Durable Object, which persists the offered identifier history and prevents
rapid Next actions from replaying the same shelf. The request returns without
waiting for catalog persistence: a compact shelf job is sent to the
`realsignal-catalog-refresh` Queue and written to the `realsignal-catalog` D1
database by the consumer.

## Safe cutover order

1. Deploy the API and apply the D1 migration in the same Cloudflare account.
2. Probe `/api/v2/health` and verify all four bindings.
3. Keep the browser's bounded direct-relay fallback during the canary.
4. Confirm queue writes and D1 catalog reads after the first live IA requests.
5. Add scheduled source health/refresh workflows only after measured traffic
   justifies them; do not turn every viewer request into discovery work.
6. Remove the direct fallback only after a full desktop/mobile/Cast soak passes.

## Next backend slice

The D1 migration in `migrations/0001_realsignal_catalog.sql` provides
normalized programs, channel membership/rules, source health, and indexes.
The API contract remains stable while relay-backed discovery is gradually
replaced by D1-backed reads; clients do not need to know which adapter served
an item.
