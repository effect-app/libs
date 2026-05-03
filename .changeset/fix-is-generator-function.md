---
"effect-app": patch
"@effect-app/vue": patch
---

Fix `isGeneratorFunction` using `isObject` instead of `isFunction`: generator functions have `typeof === "function"`, not `"object"`, so the check always returned `false`. This caused `Command.streamFn` generator-form handlers to silently pass a raw `Generator` object rather than an `Effect<Stream>`, meaning the mutation was never executed.
