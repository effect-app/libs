---
"@effect-app/infra": patch
---

Replace `(...) => Effect.gen` with `Effect.fnUntraced` and convert select multi-step `pipe` chains to `Effect.gen` across infra.
