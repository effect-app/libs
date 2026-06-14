---
"@effect-app/infra": patch
---

Fix correctness bugs in the Cosmos `WorkflowEngine`, found by running the adapter against a real Cosmos account. The Cosmos workflow engine now passes the same conformance suite as the in-memory and SQLite engines.

- **OCC conflicts were fatal.** `replaceExec` used `Effect.promise` + a `statusCode` check, but single-item Cosmos `replace` *throws* on 409/412/404 (only `read` and batch ops surface the code), so every conflict became an unrecoverable defect and the `OptimisticConcurrencyException` catch was dead code. It now uses `Effect.tryPromise` and matches the thrown error (mirrors `ClusterCosmos`), so lease claims, completions, and interrupts lose gracefully under contention.
- **Illegal resource ids.** Activity/deferred/clock doc ids embedded workflow/deferred names containing `/`, which Cosmos rejects. Ids are now URI-encoded via `cosmosId` (mirrors `ClusterCosmos`).
- **Interrupt could be lost under Cosmos latency.** A concurrent `interrupt` racing a suspending driver's `onComplete` could have its `interrupted` flag swallowed (OCC) or downgraded, leaving the re-drive unable to collapse the suspension. `interrupt`/`interruptUnsafe` now persist the flag with OCC retry (`markInterrupted`), and `onComplete` never downgrades a persisted `interrupted: true`.
- **`execute` now drives unconditionally** (matching SQLite), letting `drive`'s own guard short-circuit a running/completed fiber and re-drive a suspended one, instead of skipping re-drive when a stale local entry existed.
