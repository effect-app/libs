---
"effect-app": minor
---

Add `generateGuards` to `TaggedUnion` / `ExtendTaggedUnion` for generating property-scoped type guards.

Usage: `MyUnion.generateGuards<MyType>()("propertyKey")` returns `{ is{Tag}, isAnyOf }` guards that narrow the container type by its tagged union property.
