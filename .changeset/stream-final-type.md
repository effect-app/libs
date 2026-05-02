---
"@effect-app/vue": minor
"effect-app": minor
---

Stream requests now support an optional `final` schema that models the final success type of the stream. When declared, `mutateStream`'s execute effect resolves with the last emitted value typed as `Final` instead of `void`.

```ts
class MyStream extends SomethingStream<MyStream>()("MyStream", { id: S.String }, {
  success: S.Union([OperationProgress, ExportComplete]),
  final: ExportComplete,   // execute now resolves with ExportComplete
}) {}
```
