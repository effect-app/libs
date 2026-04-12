---
"effect-app": minor
"@effect-app/infra": patch
"@effect-app/vue": patch
---

Remove `TaggedRequest` from `makeRpcClient`, now only `TaggedRequestFor` is returned. Remove all legacy `meta.moduleName` support — `id` and `moduleName` are now required on `Req` type. Remove `makeRpcGroup` (use `makeRpcGroupFromRequestsAndModuleName` instead).
