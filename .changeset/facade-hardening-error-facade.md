---
"effect-app": patch
"@effect-app/eslint-codegen-model": patch
---

Harden model facades and add `OpaqueErrorFacadeClass`.

- `OpaqueErrorFacadeClass`: facade `TaggedErrorClass`/`ErrorClass` while keeping
  `Cause.YieldableError` on the constructed instance (so `yield* new Err()`,
  `Effect.fail`, and `instanceof` keep working through the facade).
- `OpaqueFacadeInput` relaxed to require only the codec service channels, so
  transformed schemas (`.pipe(encodeKeys/annotate/filter/...)`) can be facaded;
  `fields`/`copy`/`mapFields` flow through `OpaqueFacadeStatics` when present, and
  `to` is carried so models that compose via `X.to.fields` keep working.
- Dropped the wide `fields`/`mapFields` overrides on the facade interfaces so the
  precise statics win (keeps `Q.project(X.mapFields(...))` typed).
- Codegen (`eslint-codegen-model`): resolver prefers the private `_X` over the
  self-referential facade; converges static service types in one run; per-model
  classification (facade Opaque models, leave `Class` standard in mixed files);
  `Make` emitted as `type X = {...} | void` when the make-input is voidable;
  `readonly`-prefixed array/tuple elements parenthesized; value self-references in
  the moved `_X` body rewritten to `_X`; instance getters surface on `Self`.
