---
"@effect-app/vue": minor
---

Remove legacy `mutateToResult` stream mutation factory, `wrapStream` command builder, and standard command progress reporting (`running`/`progress` from the old stream factory path). Keep only the `mutate` path for use with `streamFn` combinators. Remove obsolete types (`StreamMutationWithExtensions`, `StreamCommandWithExtensions`, `StreamFnExtension`, `MutateStreamCallOptions`) and the internal `makeStreamMutation` function. Rename `mutate.wrapStream` shorthand to `mutate.wrap` to match the non-stream convention.
