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
