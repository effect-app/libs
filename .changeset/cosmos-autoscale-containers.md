---
"effect-app": minor
"@effect-app/infra": minor
---

Add opt-in `autoscaleMaxThroughput` for Cosmos containers created on demand (`StorageConfig`, `ClusterCosmosConfig`, `WorkflowEngineCosmosConfig`). When set, a missing container is created with autoscale at that max RU/s, unless its database has shared throughput (then it keeps sharing the database pool). Existing containers are untouched; unset keeps the Cosmos default of manual 400 RU/s per container.
