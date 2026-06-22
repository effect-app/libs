---
"effect-app": minor
---

Schema/Class facades: add `StructFacade` and carry `identifier` on the class facades.

- Add `StructFacade<Self, Encoded, MakeIn, DecodingServices, EncodingServices, Fields>` = `Omit<S.Struct<Fields>, "Type" | "Encoded" | "~type.make.in" | "DecodingServices" | "EncodingServices"> & { pinned type-level members }`. A top-level `const X = S.Struct(...)` / `S.TaggedStruct(...)` model faceted by the `.d.ts`-emit compiler is retyped to it: still a real `S.Struct<Fields>` (so `Workflow.AnyStructSchema`, the `Struct<Fields & Context>` reconstruction, `Union`, `.fields.x` keep working) while `Type`/`Encoded`/make/services resolve to the named namespace interfaces.
- Add `readonly identifier: string` to `OpaqueClassFacade` and `OpaqueErrorFacadeClass` (an `S.Class` static lost from the bare emitted interface, which the compiler otherwise had to hand-emit per model). `OpaqueFacade` is intentionally left untouched — `S.Opaque` and requests build on `S.Bottom`, not `S.Class`, so they have no `identifier`.
