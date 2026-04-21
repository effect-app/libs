---
"effect-app": minor
---

Add `concurrency: "unbounded"` parseOptions annotation to Schema constructors (Struct, Array, NonEmptyArray, Record, TaggedStruct, ReadonlySet, ReadonlyMap, Class, TaggedClass) so all encode/decode operations automatically run with unbounded concurrency. Also override `mapFields` on Struct and Class/TaggedClass to preserve the annotation.
