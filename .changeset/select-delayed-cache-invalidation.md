---
"@effect-app/vue": minor
---

Add `select` option to `MutationOptionsBase` for a second cache invalidation after long-running operations.

When `select` is provided, cache invalidation fires twice:

1. Immediately when the mutation completes (existing behaviour).
2. Again after the `select` effect finishes — useful for polling or waiting for a background job before refreshing data.

```ts
useMutation(startExportCommand, {
  select: (result) => pollUntilDone(result.jobId)
})
```
