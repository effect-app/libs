---
"@effect-app/infra": patch
"effect-app": patch
---

Remove obsolete queue machinery left unused after the move to cluster entities: the SB/SQLite/mem `QueueMaker` implementations (`QueueMaker/{SQLQueue,memQueue,sbqueue}.ts`), their `ServiceBus.ts`/`memQueue.ts` transports, and `RequestFiberSet.ts` (its `setRootParentSpan` helper is inlined into `MainFiberSet`). `effect-app/QueueMaker` keeps only `QueueMeta`; the `QueueBase` interface and empty `QueueMaker` ops object are dropped.
