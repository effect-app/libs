---
"effect-app": minor
"@effect-app/vue": patch
---

Move `makeQueryKey` into `effect-app/client` and update Vue source and tests to import it from the shared client module. Vue still re-exports `makeQueryKey` from `src/lib` for compatibility.
