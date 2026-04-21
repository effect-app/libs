---
"effect-app": minor
"@effect-app/eslint-codegen-model": minor
---

Add `TaggedRequestFor` helper to `makeRpcClient` that curries a `moduleName`, producing request classes with static `id` and `moduleName` properties. This enables passing request classes directly to `makeQueryKey` without going through `clientFor` first. The `clientFor` function no longer requires a `meta` property on the module when requests carry `moduleName`. The meta codegen preset now generates `Req = TaggedRequestFor(moduleName)`. Original `TaggedRequest` remains for backwards compatibility.
