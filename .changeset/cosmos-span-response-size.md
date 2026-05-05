---
"@effect-app/infra": patch
---

Annotate Cosmos read spans with response size, resource count, and request charge.

`Cosmos.queryRaw`, `Cosmos.all`, `Cosmos.filter`, and `Cosmos.find` now set `db.cosmos.request_charge`, `db.cosmos.response_bytes`, and (where applicable) `db.cosmos.resource_count` on the active span. Bytes are sourced from `diagnostics.clientSideRequestStatistics.totalResponsePayloadLengthInBytes` — no payload stringification.
