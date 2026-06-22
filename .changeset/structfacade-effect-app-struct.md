---
"effect-app": patch
---

Fix `StructFacade` to extend effect-app's own `Struct`, not `effect/Schema`'s.

`StructFacade` was built on `Omit<S.Struct<Fields>, ...>` where `S` is `effect/Schema` (core). Scanner / consumer models are effect-app `S.Struct`, which is a distinct type from effect core's `Struct`, so a facade built on the core `Struct` is not assignable where an effect-app struct is expected — e.g. workflow payloads (`Workflow<…, Struct<Fields & Context>>`) and other effect-app `Struct`-shaped positions failed to type-check. Switch the `Omit` base to effect-app's `Struct` (the `Fields extends S.Struct.Fields` constraint stays effect core, matching effect-app's own `Struct`).
