# Durable Workflow Engines (SQLite & Cosmos)

This package provides two custom durable `WorkflowEngine` implementations for
`@effect/workflow`:

- [`WorkflowEngineSqlite.ts`](../src/WorkflowEngineSqlite.ts) — SQL-backed (4 tables).
- [`WorkflowEngineCosmos.ts`](../src/WorkflowEngineCosmos.ts) — Azure Cosmos DB
  (single container, per-execution partition key).

Both implement the low-level `WorkflowEngine.Encoded` contract from
`effect/unstable/workflow/WorkflowEngine` and wrap it with `makeUnsafe`. They are
drop-in alternatives to Effect's built-in `ClusterWorkflowEngine`, trading
cluster-grade routing for a much lighter operational footprint: they need only a
database, not the full cluster stack (ShardManager, Runners, MessageStorage).

This document explains what they provide, how they differ from
`ClusterWorkflowEngine`, and how they behave during blue/green deployments.

---

## 1. What these engines provide

Both engines persist the complete durable-execution state and recover it after a
restart. They are at **parity with `ClusterWorkflowEngine` on durability**:

| Capability                        | Provided | How                                                                      |
| --------------------------------- | -------- | ------------------------------------------------------------------------ |
| Durable execution state           | ✅       | exec / activity / deferred / clock rows, schema-encoded payloads+results |
| Restart recovery                  | ✅       | recovery poller re-drives `running` executions with an expired lease     |
| Activity replay                   | ✅       | keyed by `(executionId, name, attempt)`; completed results replay        |
| Durable clocks (`DurableClock`)   | ✅       | clock row + clock poller; survives restart                               |
| Suspend / resume                  | ✅       | deferred completions persisted, polled, re-drive on completion           |
| Idempotency / exactly-once writes | ✅       | first-writer-wins (`ON CONFLICT DO NOTHING` / batch `Create`)            |
| Multi-process safety              | ✅\*     | etag optimistic-concurrency (OCC) + worker lease                         |

\* With caveats — see [§4 split-brain](#4-concurrency--split-brain) and
[§5 blue/green](#5-bluegreen-deployment-behavior).

### Persistence layout

**SQLite** — 4 tables ([`WorkflowEngineSqlite.ts:157-203`](../src/WorkflowEngineSqlite.ts#L157-L203)):

- `*_executions` — `execution_id` PK, `workflow_name`, `payload`, `parent`,
  `status` (`running|complete|interrupted`), `suspended`, `interrupted`,
  `completed_result`, `worker`, `lease_expires_at`, `etag`.
  Index `(status, lease_expires_at)` for recovery scans.
- `*_activities` — PK `(execution_id, name, attempt)`, `result`.
- `*_deferred` — PK `(execution_id, name)`, `exit`.
- `*_clocks` — PK `(execution_id, name)`, `fire_at`. Index on `fire_at`.

**Cosmos** — single container, 4 document types, all partitioned by
`executionId` ([`WorkflowEngineCosmos.ts:69-149`](../src/WorkflowEngineCosmos.ts#L69-L149)):

- `exec` doc (the execution), `activity::<name>::<attempt>`,
  `deferred::<name>`, `clock::<name>`.
- Sharing one partition key per execution makes all writes for an execution
  TransactionalBatch-eligible.

Both encode payloads/results via schema round-tripping
(`S.fromJsonString(S.toCodecJson(...))`) so typed values (dates, branded IDs,
schema classes) survive restart — same strategy as `ClusterWorkflowEngine`.

---

## 2. Execution & recovery model

These engines use a **poll-and-claim** model, not deterministic routing:

1. **Claim via lease.** A process claims an execution by writing its `workerId`
   and `lease_expires_at = now + leaseTtl` under an etag OCC guard
   ([sqlite:455-475](../src/WorkflowEngineSqlite.ts#L455-L475)). If the lease is
   held and unexpired by another worker, the claim is skipped.
2. **Heartbeat.** While driving, a fiber renews the lease every
   `heartbeatInterval` ([sqlite:477-498](../src/WorkflowEngineSqlite.ts#L477-L498)).
3. **Recovery poller.** Every `recoveryInterval`, each process scans for
   `status = 'running'` executions with a `NULL`/expired lease and re-drives them
   locally ([sqlite:750-772](../src/WorkflowEngineSqlite.ts#L750-L772)).
4. **Clock poller.** Every `clockPollInterval`, each process scans for clocks with
   `fire_at <= now`, inserts the deferred completion (first-writer-wins), deletes
   the clock row, and re-drives ([sqlite:776-801](../src/WorkflowEngineSqlite.ts#L776-L801)).

### Default timings (both engines)

| Option              | Default | Meaning                                  |
| ------------------- | ------- | ---------------------------------------- |
| `leaseTtl`          | 30s     | how long a claim is held without renewal |
| `heartbeatInterval` | 10s     | lease renewal cadence (< `leaseTtl`)     |
| `recoveryInterval`  | 15s     | stale-execution rescan cadence           |
| `clockPollInterval` | 5s      | due-clock rescan cadence                 |

Sources: [sqlite:137-141](../src/WorkflowEngineSqlite.ts#L137-L141),
[cosmos:146-149](../src/WorkflowEngineCosmos.ts#L146-L149).

---

## 3. Comparison vs `ClusterWorkflowEngine`

Durability is matched. The gaps are about **routing efficiency, latency, and
targeting** — the things cluster sharding exists to provide.

| Aspect                       | These engines                                 | `ClusterWorkflowEngine`                                    |
| ---------------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| Work routing                 | poll-and-race; every process scans the table  | hash-ring routes each execution to one owning runner       |
| Resume / signal latency      | pull-based; up to poll interval (5–15s)       | push-based; near-instant via entity messages               |
| Interrupt across processes   | flag in storage; remote fiber sees it on poll | interrupt message to owning runner; immediate              |
| Load balancing               | none; first claimer wins, recovery herds      | even distribution by shard ownership                       |
| Node traits / host targeting | none; all processes are equal pollers         | shard groups pin workloads to specific hosts (see §3.1)    |
| Entity message ordering      | concurrent `driveById` + OCC to resolve       | serialized per-entity mailbox                              |
| Backpressure / capacity      | none                                          | mailbox capacity, termination timeout, poll intervals      |
| Failover speed               | wait lease expiry (~30s) then re-drive        | fast shard rebalance on node leave                         |
| Split-brain window           | wider (lease-expiry racing)                   | narrower (shard lock)                                      |
| Operational cost             | **just a DB**                                 | full cluster stack (ShardManager, Runners, MessageStorage) |

**Cost at scale:** with N processes, every process recovery-polls the whole
executions table (15s) and clocks table (5s). On Cosmos the recovery scan is a
**cross-partition query** (fans across all partitions, RU-expensive). Cluster
scopes reads to owned shards.

### 3.1 Node traits / shard groups

`ClusterWorkflowEngine` supports **heterogeneous nodes** via shard groups:

- A runner declares which groups it hosts (`Runner.groups`,
  `ShardingConfig.assignedShardGroups`).
- A workflow is pinned to a group with
  `Workflow.make({...}).annotate(ClusterSchema.ShardGroup, () => "workflow")`.
- A separate hash ring per group means a workflow only ever lands on a runner
  that hosts its group (e.g. "GPU workflows → GPU hosts only").

These engines have **no equivalent** — all processes are equal pollers. There is
no way to target a workflow at a subset of hosts. Note the trait granularity in
cluster is also coarse: opaque string group names, not arbitrary key/value label
selectors.

---

## 4. Concurrency & split-brain

Safety rests on two mechanisms:

- **etag OCC** on the exec doc — a losing writer gets
  `OptimisticConcurrencyException` (412/409) and backs off.
- **Worker lease** — only the lease holder drives; others skip while the lease is
  live.

**The window:** `leaseTtl` is 30s, heartbeat 10s. If a process stalls (GC pause,
network partition) for longer than `leaseTtl` but is still alive, another process
claims the execution and both can run until the next exec write triggers an OCC
conflict.

- **Persisted activity results** are protected — first-writer-wins
  (`ON CONFLICT DO NOTHING`), so the stored result is single-valued.
- **The activity _effect itself_** can still fire twice inside that window.
  → **Activities must be idempotent.** Same caveat applies to
  `ClusterWorkflowEngine` (at-least-once during rebalance), but the lease-racing
  window here is wider.

---

## 5. Blue/green deployment behavior

### 5.1 Prerequisite: shared storage

- **Cosmos** — the container is always shared; blue and green see the same
  executions. ✅
- **SQLite** — if each instance has its **own** database file, the storage is
  **not shared**: green cannot see blue's in-flight executions, and they strand on
  blue with no recovery path. **Blue/green with per-instance SQLite is broken.**
  Use a shared volume, or treat the SQLite engine as single-node only.

The rest of this section assumes shared storage.

### 5.2 Overlap window (blue + green both alive)

- In-flight executions hold blue's lease and heartbeat every 10s. Green's recovery
  poller sees the live lease and **skips** them. Blue keeps running them; green
  only takes executions it newly starts. No double-run while blue heartbeats. ✅
- Both environments poll the same tables → ~2× scan load during overlap (on Cosmos,
  2× cross-partition recovery RU). Minor, transient.

### 5.3 Cutover (blue terminated)

- Blue's leases stop renewing. After `leaseTtl` (30s) + green's `recoveryInterval`
  (15s), green detects the stale executions, claims, and re-drives.
- **Failover gap ≈ 30–45s** — in-flight executions are paused that long
  (pull-based, not instant).
- If blue is hard-killed mid-activity, the activity result was not persisted as
  `Complete`, so green **re-runs** it (at-least-once). Non-idempotent side effects
  double-fire — see [§4](#4-concurrency--split-brain).

### 5.4 Split-brain risk is elevated during deploys

Blue/green deliberately runs two versions concurrently. If blue is slow-draining
(SIGTERM grace overlapping a long activity) past `leaseTtl`, green claims and both
run. OCC + first-writer-wins protect persisted state; the activity-effect
double-fire window remains.

### 5.5 Sticky-lease — an accidental advantage

The lease model is **sticky to the starting worker**: an execution stays on the
process that started it as long as that process keeps heartbeating. With a
**graceful drain** (blue stops accepting new executions, finishes in-flight, then
terminates), in-flight workflows **complete on the version that started them** —
sidestepping cross-version replay entirely.

`ClusterWorkflowEngine` does the opposite: as soon as a blue runner deregisters,
its shards rebalance onto green (new-code) runners, so mid-flight cross-version
replay is the _default_ path during a deploy, not an edge case.

> ⚠️ **Missing drain hook.** Neither engine currently has a "stop claiming new
> executions" flag. To get the safe drain story above, this must be added (a flag
> that disables `tryClaim` for new work while letting heartbeats and in-flight
> drive continue). Until then, a graceful blue/green relies on the orchestrator
> keeping blue alive until in-flight work finishes.

### 5.6 Workflow versioning hazard (shared by both engines)

The real blue/green danger is **not** engine-specific — it is durable-execution
versioning:

- Replay must be deterministic. An execution started on v1 and replayed on v2 with
  reordered/renamed activities mismatches activity-by-name → corrupt replay.
- A payload encoded with the v1 schema and decoded with an incompatible v2 schema
  fails to decode.

Neither these engines nor `ClusterWorkflowEngine` solve this. Mitigations:

- **Additive-only schema changes** (no field removal/retype on in-flight payloads).
- **Do not reshape an in-flight workflow's step sequence**; version the workflow
  name when the shape changes (`OrderV1` / `OrderV2`).
- **Drain in-flight executions before deploying breaking changes** (see §5.5).

---

## 6. When to use which

- **These engines** — durable workflows on a single process, or a small number of
  processes over shared storage, where you want minimal ops (no cluster stack) and
  can tolerate 5–15s resume latency and ~30–45s failover. Graceful drain on
  deploy strongly recommended.
- **`ClusterWorkflowEngine`** — many processes, low-latency resume/interrupt, even
  load distribution, or host targeting (shard groups). Worth the cluster stack
  when you actually need those.

---

## 7. Summary cheat-sheet

| Dimension                       | These engines               | ClusterWorkflowEngine             |
| ------------------------------- | --------------------------- | --------------------------------- |
| Durability / restart recovery   | ✅ parity                   | ✅                                |
| Activity replay & idempotency   | ✅ parity                   | ✅                                |
| Failover speed                  | ~30–45s (poll)              | fast (push rebalance)             |
| Resume / interrupt latency      | 5–15s (pull)                | near-instant (push)               |
| Load balancing                  | ❌                          | ✅ (shard ownership)              |
| Host targeting / node traits    | ❌                          | ✅ (shard groups)                 |
| Split-brain window              | wider (lease race)          | narrower (shard lock)             |
| Activity double-fire on cutover | possible — need idempotency | possible — need idempotency       |
| Version-skew replay safety      | unsolved — discipline only  | unsolved — discipline only        |
| In-flight version stickiness    | sticky to starter (+ drain) | migrates to new code on rebalance |
| SQLite blue/green               | needs shared storage        | n/a                               |
| Operational cost                | just a DB                   | full cluster stack                |
