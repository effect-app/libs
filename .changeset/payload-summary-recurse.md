---
"@effect-app/infra": patch
---

Capture more of the rpc request payload in the `rpc.request.payload` span
attribute.

The summarizer was one level deep: top-level scalars were kept, but any nested
object collapsed to `Object[N]` and any array to `Array[N]`, hiding useful
inputs (carrier, packageType, dimensions, ids, per-item amounts, …).

It now recurses into nested objects up to `PAYLOAD_MAX_DEPTH` (4) and samples
arrays to their first `PAYLOAD_ARRAY_HEAD` (20) elements, appending a `…N more`
marker when longer — so item arrays stay diagnosable without dumping the whole
tail on high-frequency commands. Long strings are still snipped at 256 chars,
and `password`/`secret`/`token` keys are redacted at any depth (previously only
a top-level `password`).
