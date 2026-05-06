---
"effect-app": patch
"@effect-app/infra": patch
---

Update to effect 4.0.0-beta.60 and use native `Rpc.custom` constructors (`makeCommandRpc`, `makeStreamRpc`) for metadata-wrapped RPC schemas instead of manually wrapping/unwrapping schemas inline.
