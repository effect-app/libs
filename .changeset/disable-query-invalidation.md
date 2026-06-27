---
"effect-app": minor
"@effect-app/vue": minor
---

Add `disableQueryInvalidation` flag to Command config for background saves.

Set `disableQueryInvalidation: true` in a `Req.Command` config (3rd argument)
to suppress all client-side query invalidation for that command — client
`invalidatesQueries` callbacks, server-returned `metadata.invalidateQueries`,
and repository-derived write-dependency matching are all skipped. Use for
background saves (e.g. debounced auto-save) whose writes should not trigger
query refetches.

- `InvalidationConfig` gains `disableQueryInvalidation?: boolean`.
- `RequestHandlerWithInput` gains `disableQueryInvalidation?: boolean`,
  propagated from `Request.config` by `ApiClientFactory.makeFor`.
- `invalidateCache` early-returns `Effect.void` when the flag is set,
  applying to both regular and stream mutations.
