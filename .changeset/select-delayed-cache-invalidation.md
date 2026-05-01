---
"@effect-app/vue": minor
---

Add `select` option to `MutationOptionsBase` for delayed cache invalidation.

For long-running operations, cache invalidation now waits until the `select` effect
completes rather than firing immediately when the mutation exits.

```ts
useMutation(startExportCommand, {
  select: (result) => pollUntilDone(result.jobId)
})
```
