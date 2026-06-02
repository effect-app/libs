# Cluster storage backends (Cosmos vs SQL)

`@effect-app/infra` now ships Cosmos-backed cluster storage:

- [`ClusterCosmos.layerMessageStorage`](../src/ClusterCosmos.ts)
- [`ClusterCosmos.layerRunnerStorage`](../src/ClusterCosmos.ts)
- [`ClusterCosmos.layer`](../src/ClusterCosmos.ts)
- [`ClusterCosmos.layerCosmos`](../src/ClusterCosmos.ts)

The closest baseline in Effect is `SqlMessageStorage` + `SqlRunnerStorage`.

## Comparison

| Aspect              | `ClusterCosmos`                                                           | `SqlMessageStorage` + `SqlRunnerStorage`                                                    |
| ------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Backend dependency  | Azure Cosmos DB                                                           | SQL database via `SqlClient`                                                                |
| Schema management   | Container-only document model (no SQL migrations)                         | Creates / migrates SQL tables (`messages`, `replies`, `runners`, `locks`, migrations table) |
| Message/reply model | JSON docs split by partition key (`message::shardId`, `reply::requestId`) | Relational rows with SQL indexes and joins                                                  |
| Locking strategy    | Optimistic concurrency (`_etag`) on lock docs                             | Dialect-aware SQL locking (including advisory locks on pg/mysql when enabled)               |
| Horizontal behavior | Throughput/cost depends on partitioning and cross-partition queries       | Throughput/cost depends on SQL indexing, query plans, and connection limits                 |
| Operational fit     | Best when Cosmos is already your system DB                                | Best when the cluster already runs on SQL infrastructure                                    |

## Practical guidance

- Pick **`ClusterCosmos`** when your platform standard is Cosmos and you want to avoid introducing SQL just for cluster storage.
- Pick **SQL storage** when you already have strong SQL ops tooling and prefer table/migration based durability.

## Parity notes

The goal is API parity with Effect SQL cluster storage, with explicit notes where backend semantics differ.

- Reply uniqueness: Cosmos enforces one terminal `WithExit` reply per request and one `Chunk` per `(request, sequence)` via deterministic reply document ids. Duplicate writes fail with `PersistenceError`, matching SQL behavior.
- OCC: Cosmos uses `_etag` + `IfMatch` for lock updates and message read claims.
- Batching: Cosmos groups operations by partition key and uses transactional batch per partition (chunked at 100 operations).
- `withTransaction`: intentionally a no-op in Cosmos storage. Unlike SQL, Cosmos does not expose a general cross-operation transaction boundary that matches cluster storage semantics across partitions and mixed operations.

### Why `withTransaction` stays a no-op

SQL storage can run arbitrary multi-step storage effects inside one DB transaction.
Cosmos only supports transactional scope in limited shapes (primarily same logical partition and explicit batch APIs).
The cluster storage API expects a broader transaction abstraction, so this adapter keeps `withTransaction` as pass-through and relies on idempotency, OCC, and partition-scoped batches.

## Current Cosmos limitations

These limitations apply to fresh Cosmos containers too; they are adapter semantics, not migration concerns.

- Multi-step writes are not atomic across partitions. `saveReply`, `clearReplies`, `clearAddress`, and chunk acknowledgements can complete one Cosmos operation and fail before the remaining state changes are applied. SQL storage wraps the equivalent flows in a database transaction.
- `saveReply` writes the reply before patching message state. If the reply write succeeds but message patching fails, a retry can hit the deterministic reply id and fail with `PersistenceError` while `lastReplyId` / `processed` are still stale.
- Runner and message lease expiry use application clocks. SQL storage mostly evaluates lock expiry, heartbeats, and read lease age with database time, while Cosmos uses `Date.now()` / caller-provided time; clock skew between runners can affect lease timing.
- Shard locks are persisted `_etag`-guarded documents, not advisory locks. They survive process death until expiry or explicit release.
- `unprocessedMessagesById` matches both Cosmos document id and request id. This is needed for keyed request docs whose document id is derived from the primary key, but it is broader than SQL's `id` lookup and should be considered when adding ack / interrupt edge cases.
- Cosmos runner `machineId` values are derived from a hash of runner address instead of a database-assigned id. This keeps re-registration stable, but collisions are possible and Snowflake still only uses the low 10 bits.
