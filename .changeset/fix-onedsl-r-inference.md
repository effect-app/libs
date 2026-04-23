---
"@effect-app/infra": patch
---

Fix `R` inference in `OneDSL`, `OneDSLExt.modify` and `OneDSLExt.update`. The callback's effect type was annotated as `Effect<…, E, FixEnv<R, Evt, S1, S2>>`, which deadlocked inference of `R` (TS6 fell back to `never`, tsgo to `unknown`, leaking `unknown` into yielded effects in generator handlers). Now matches the existing `AllDSLExt` pattern: bare `R` in the callback, `FixEnv<R, …>` only in the return type.
