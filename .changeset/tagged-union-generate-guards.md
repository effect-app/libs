---
"effect-app": minor
---

Add `generateGuards` and `generateGuardsFor` to `TaggedUnion` / `ExtendTaggedUnion` for property-scoped type guards.

- `generateGuards("key")` — generic per-guard, no need to specify the container type
- `generateGuardsFor<A>()("key")` — curried, fixes `A` for concrete guard signatures

Both return `{ is{Tag}, isAnyOf }` guards that narrow the container type by its tagged union property.
