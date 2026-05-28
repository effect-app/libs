/**
 * SQLite backed {@link WorkflowEngine} implementation.
 *
 * Persists workflow state across four tables:
 *   - `workflow_exec`     — one row per execution; tracks status, lease, etag
 *   - `workflow_activity` — recorded activity exits keyed by (exec, name, attempt)
 *   - `workflow_deferred` — durable deferred completions keyed by (exec, name)
 *   - `workflow_clock`    — scheduled clocks with `fire_at`
 *
 * Atomicity: multi-statement operations are wrapped in `sql.withTransaction`
 * (BEGIN/COMMIT) so concurrent writers do not observe partial state.
 *
 * Optimistic concurrency:
 *   - exec state transitions use `UPDATE ... WHERE etag = ? RETURNING etag`;
 *     a zero-row result is an `OptimisticConcurrencyException`.
 *   - activity / deferred / clock inserts use `INSERT ... ON CONFLICT DO
 *     NOTHING RETURNING ...` for first-writer-wins semantics across drivers.
 *
 * Crash recovery: each driver holds a time-bound lease on the exec row,
 * renewed by a heartbeat fiber. A scope-bound recovery poller re-drives any
 * exec whose lease has lapsed. A clock poller fires due clocks even when
 * the in-process timer is missing (e.g. after a restart).
 */
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import * as Option from "effect-app/Option"
import * as Cause from "effect/Cause"
import * as Duration from "effect/Duration"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as FiberMap from "effect/FiberMap"
import * as Schedule from "effect/Schedule"
import type * as Scope from "effect/Scope"
import { SqlClient } from "effect/unstable/sql"
import * as Workflow from "effect/unstable/workflow/Workflow"
import { type Encoded, makeUnsafe, WorkflowEngine, WorkflowInstance } from "effect/unstable/workflow/WorkflowEngine"
import { randomUUID } from "node:crypto"
import { OptimisticConcurrencyException } from "./errors.js"
import { annotateDb } from "./otel.js"

export interface WorkflowEngineSqliteConfig {
  /** Optional prefix for table names (e.g. `tenant_`). */
  readonly prefix?: string
  /** Lease duration before a claim is considered stale. Default 30s. */
  readonly leaseTtl?: Duration.Duration
  /** Renewal cadence — should be < leaseTtl. Default 10s. */
  readonly heartbeatInterval?: Duration.Duration
  /** Cadence for scanning stale leases. Default 15s. Set to `Duration.zero` to disable. */
  readonly recoveryInterval?: Duration.Duration
  /** Cadence for scanning due clocks. Default 5s. Set to `Duration.zero` to disable. */
  readonly clockPollInterval?: Duration.Duration
  /** Stable worker identity; defaults to a random UUID per process. */
  readonly workerId?: string
}

type ExecStatus = "running" | "complete" | "interrupted"

interface ExecRow {
  readonly execution_id: string
  readonly workflow_name: string
  readonly payload: string
  readonly parent: string | null
  readonly status: ExecStatus
  readonly suspended: number
  readonly interrupted: number
  readonly completed_exit: string | null
  readonly worker: string | null
  readonly lease_expires_at: number | null
  readonly etag: string
}

interface ExecState {
  readonly executionId: string
  readonly workflowName: string
  readonly payload: object
  readonly parent: string | undefined
  readonly status: ExecStatus
  readonly suspended: boolean
  readonly interrupted: boolean
  readonly completedExit: Workflow.Result<unknown, unknown> | undefined
  readonly worker: string | undefined
  readonly leaseExpiresAt: number | undefined
  readonly etag: string
}

// --- JSON revival of Exit / Cause / Workflow.Result ------------------
// SQLite stores these as JSON, which loses class prototypes. The engine
// wrapper code in `effect/unstable/workflow/WorkflowEngine` relies on real
// `Exit` values (e.g. `yield* exit`, `Exit.map`), so we reconstruct them
// before returning to the wrapper.

const reviveCause = (c: unknown): Cause.Cause<unknown> => {
  if (Cause.isCause(c)) return c
  const reasons = (c as { reasons?: ReadonlyArray<any> })?.reasons ?? []
  if (reasons.length === 0) return Cause.empty
  return Cause.fromReasons(reasons.map((r) => {
    if (r._tag === "Fail") return Cause.fail(r.error).reasons[0]!
    if (r._tag === "Die") return Cause.die(r.defect).reasons[0]!
    if (r._tag === "Interrupt") return Cause.interrupt(r.fiberId).reasons[0]!
    return Cause.die(r).reasons[0]!
  }))
}

const reviveExit = <A, E>(j: unknown): Exit.Exit<A, E> => {
  if (Exit.isExit(j)) return j as Exit.Exit<A, E>
  const v = j as { _tag: string; value?: unknown; cause?: unknown }
  if (v?._tag === "Success") return Exit.succeed(v.value) as Exit.Exit<A, E>
  return Exit.failCause(reviveCause(v?.cause)) as Exit.Exit<A, E>
}

const reviveResult = (
  r: unknown
): Workflow.Result<unknown, unknown> => {
  const v = r as { _tag: string; exit?: unknown }
  if (v?._tag === "Suspended") return v as unknown as Workflow.Result<unknown, unknown>
  return { ...(v as object), exit: reviveExit(v.exit) } as unknown as Workflow.Result<unknown, unknown>
}

const parseExec = (row: ExecRow): ExecState => ({
  executionId: row.execution_id,
  workflowName: row.workflow_name,
  payload: JSON.parse(row.payload) as object,
  parent: row.parent ?? undefined,
  status: row.status,
  suspended: row.suspended !== 0,
  interrupted: row.interrupted !== 0,
  completedExit: row.completed_exit
    ? reviveResult(JSON.parse(row.completed_exit))
    : undefined,
  worker: row.worker ?? undefined,
  leaseExpiresAt: row.lease_expires_at ?? undefined,
  etag: row.etag
})

const makeSqliteWorkflowEngine = Effect.fnUntraced(function*(cfg: WorkflowEngineSqliteConfig) {
  const sql = yield* SqlClient.SqlClient
  const scope = yield* Effect.scope
  const prefix = cfg.prefix ?? ""
  const execTable = `${prefix}workflow_exec`
  const activityTable = `${prefix}workflow_activity`
  const deferredTable = `${prefix}workflow_deferred`
  const clockTable = `${prefix}workflow_clock`

  const workerId = cfg.workerId ?? randomUUID()
  const leaseTtl = cfg.leaseTtl ?? Duration.seconds(30)
  const heartbeatInterval = cfg.heartbeatInterval ?? Duration.seconds(10)
  const recoveryInterval = cfg.recoveryInterval ?? Duration.seconds(15)
  const clockPollInterval = cfg.clockPollInterval ?? Duration.seconds(5)

  const annotate = (operation: string, executionId?: string) =>
    annotateDb({
      operation,
      system: "sqlite",
      collection: execTable,
      entity: "workflow",
      extra: executionId !== undefined ? { "app.entity.id": executionId } : undefined
    })

  const exec = (query: string, params: ReadonlyArray<unknown> = []) =>
    sql.unsafe(query, params as Array<any>).pipe(Effect.orDie)

  // --- Schema -----------------------------------------------------------

  yield* exec(
    `CREATE TABLE IF NOT EXISTS "${execTable}" (
       execution_id TEXT PRIMARY KEY,
       workflow_name TEXT NOT NULL,
       payload TEXT NOT NULL,
       parent TEXT,
       status TEXT NOT NULL,
       suspended INTEGER NOT NULL DEFAULT 0,
       interrupted INTEGER NOT NULL DEFAULT 0,
       completed_exit TEXT,
       worker TEXT,
       lease_expires_at INTEGER,
       etag TEXT NOT NULL
     )`
  )
  yield* exec(
    `CREATE INDEX IF NOT EXISTS "${execTable}_recovery" ON "${execTable}" (status, lease_expires_at)`
  )
  yield* exec(
    `CREATE TABLE IF NOT EXISTS "${activityTable}" (
       execution_id TEXT NOT NULL,
       name TEXT NOT NULL,
       attempt INTEGER NOT NULL,
       exit TEXT NOT NULL,
       PRIMARY KEY (execution_id, name, attempt)
     )`
  )
  yield* exec(
    `CREATE TABLE IF NOT EXISTS "${deferredTable}" (
       execution_id TEXT NOT NULL,
       name TEXT NOT NULL,
       exit TEXT NOT NULL,
       PRIMARY KEY (execution_id, name)
     )`
  )
  yield* exec(
    `CREATE TABLE IF NOT EXISTS "${clockTable}" (
       execution_id TEXT NOT NULL,
       name TEXT NOT NULL,
       workflow_name TEXT NOT NULL,
       deferred_name TEXT NOT NULL,
       fire_at INTEGER NOT NULL,
       PRIMARY KEY (execution_id, name)
     )`
  )
  yield* exec(
    `CREATE INDEX IF NOT EXISTS "${clockTable}_due" ON "${clockTable}" (fire_at)`
  )

  // --- In-process bookkeeping -------------------------------------------

  type Registered = {
    readonly workflow: Workflow.Any
    readonly execute: (
      payload: object,
      executionId: string
    ) => Effect.Effect<unknown, unknown, WorkflowInstance | WorkflowEngine>
    readonly scope: Scope.Scope
  }
  const workflows = new Map<string, Registered>()

  type LocalExec = {
    instance: WorkflowInstance["Service"]
    fiber: Fiber.Fiber<Workflow.Result<unknown, unknown>> | undefined
    parent: string | undefined
  }
  const locals = new Map<string, LocalExec>()
  const clocks = yield* FiberMap.make<string>()

  // --- Core SQL operations ----------------------------------------------

  const readExec = (executionId: string): Effect.Effect<Option.Option<ExecState>> =>
    exec(
      `SELECT * FROM "${execTable}" WHERE execution_id = ?`,
      [executionId]
    )
      .pipe(
        Effect.map((rows) => {
          const r = (rows as ReadonlyArray<ExecRow>)[0]
          return r ? Option.some(parseExec(r)) : Option.none<ExecState>()
        }),
        annotate("readExec", executionId)
      )

  /**
   * OCC-guarded write. Generates a fresh etag on success; returns
   * `OptimisticConcurrencyException` when no row matches the prior etag.
   */
  const replaceExec = (
    state: ExecState,
    next: Partial<Omit<ExecState, "executionId" | "etag" | "workflowName" | "payload" | "parent">>
  ) =>
    Effect
      .gen(function*() {
        const newEtag = randomUUID()
        const merged = { ...state, ...next, etag: newEtag }
        const rows = yield* exec(
          `UPDATE "${execTable}"
           SET status = ?,
               suspended = ?,
               interrupted = ?,
               completed_exit = ?,
               worker = ?,
               lease_expires_at = ?,
               etag = ?
         WHERE execution_id = ? AND etag = ?
         RETURNING etag`,
          [
            merged.status,
            merged.suspended ? 1 : 0,
            merged.interrupted ? 1 : 0,
            merged.completedExit ? JSON.stringify(merged.completedExit) : null,
            merged.worker ?? null,
            merged.leaseExpiresAt ?? null,
            newEtag,
            state.executionId,
            state.etag
          ]
        )
        if ((rows as ReadonlyArray<unknown>).length === 0) {
          return yield* new OptimisticConcurrencyException({
            type: "workflow.exec",
            id: state.executionId,
            code: 412
          })
        }
        return merged
      })
      .pipe(annotate("replaceExec", state.executionId))

  const createExec = (initial: ExecState): Effect.Effect<boolean> =>
    exec(
      `INSERT INTO "${execTable}"
         (execution_id, workflow_name, payload, parent, status, suspended, interrupted, etag)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT DO NOTHING
       RETURNING execution_id`,
      [
        initial.executionId,
        initial.workflowName,
        JSON.stringify(initial.payload),
        initial.parent ?? null,
        initial.status,
        initial.suspended ? 1 : 0,
        initial.interrupted ? 1 : 0,
        initial.etag
      ]
    )
      .pipe(
        Effect.map((rows) => (rows as ReadonlyArray<unknown>).length > 0),
        annotate("createExec", initial.executionId)
      )

  type ActivityResult = Workflow.Result<unknown, unknown>

  const insertActivity = (
    executionId: string,
    name: string,
    attempt: number,
    result: ActivityResult
  ): Effect.Effect<boolean> =>
    exec(
      `INSERT INTO "${activityTable}" (execution_id, name, attempt, exit)
       VALUES (?, ?, ?, ?)
       ON CONFLICT DO NOTHING
       RETURNING execution_id`,
      [executionId, name, attempt, JSON.stringify(result)]
    )
      .pipe(Effect.map((rows) => (rows as ReadonlyArray<unknown>).length > 0))

  const readActivity = (
    executionId: string,
    name: string,
    attempt: number
  ): Effect.Effect<Option.Option<ActivityResult>> =>
    exec(
      `SELECT exit FROM "${activityTable}" WHERE execution_id = ? AND name = ? AND attempt = ?`,
      [executionId, name, attempt]
    )
      .pipe(
        Effect.map((rows) => {
          const r = (rows as ReadonlyArray<{ exit: string }>)[0]
          return r ? Option.some(reviveResult(JSON.parse(r.exit))) : Option.none()
        })
      )

  const insertDeferred = (
    executionId: string,
    name: string,
    exitValue: Exit.Exit<unknown, unknown>
  ): Effect.Effect<boolean> =>
    exec(
      `INSERT INTO "${deferredTable}" (execution_id, name, exit)
       VALUES (?, ?, ?)
       ON CONFLICT DO NOTHING
       RETURNING execution_id`,
      [executionId, name, JSON.stringify(exitValue)]
    )
      .pipe(Effect.map((rows) => (rows as ReadonlyArray<unknown>).length > 0))

  const readDeferred = (
    executionId: string,
    name: string
  ): Effect.Effect<Option.Option<Exit.Exit<unknown, unknown>>> =>
    exec(
      `SELECT exit FROM "${deferredTable}" WHERE execution_id = ? AND name = ?`,
      [executionId, name]
    )
      .pipe(
        Effect.map((rows) => {
          const r = (rows as ReadonlyArray<{ exit: string }>)[0]
          return r ? Option.some(reviveExit(JSON.parse(r.exit))) : Option.none()
        })
      )

  const insertClock = (
    executionId: string,
    name: string,
    workflowName: string,
    deferredName: string,
    fireAt: number
  ): Effect.Effect<boolean> =>
    exec(
      `INSERT INTO "${clockTable}" (execution_id, name, workflow_name, deferred_name, fire_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT DO NOTHING
       RETURNING execution_id`,
      [executionId, name, workflowName, deferredName, fireAt]
    )
      .pipe(Effect.map((rows) => (rows as ReadonlyArray<unknown>).length > 0))

  const deleteClock = (executionId: string, name: string) =>
    exec(
      `DELETE FROM "${clockTable}" WHERE execution_id = ? AND name = ?`,
      [executionId, name]
    )

  // --- Lease / claim ----------------------------------------------------

  const leaseActive = (state: ExecState, now: number): boolean =>
    state.worker !== undefined
    && state.worker !== workerId
    && state.leaseExpiresAt !== undefined
    && state.leaseExpiresAt > now

  const tryClaim = (state: ExecState): Effect.Effect<Option.Option<ExecState>> =>
    Effect.gen(function*() {
      const now = Date.now()
      if (leaseActive(state, now)) return Option.none<ExecState>()
      return yield* replaceExec(state, {
        worker: workerId,
        leaseExpiresAt: now + Duration.toMillis(leaseTtl)
      })
        .pipe(
          Effect.map(Option.some),
          Effect.catchTag("OptimisticConcurrencyException", () => Effect.succeed(Option.none<ExecState>()))
        )
    })

  const heartbeat = (executionId: string): Effect.Effect<void> =>
    Effect.gen(function*() {
      while (true) {
        yield* Effect.sleep(heartbeatInterval)
        const local = locals.get(executionId)
        const polled = local?.fiber?.pollUnsafe()
        if (!local?.fiber || polled) return
        const cur = yield* readExec(executionId).pipe(
          Effect.catchCause(() => Effect.succeed(Option.none<ExecState>()))
        )
        if (Option.isNone(cur)) continue
        const state = cur.value
        if (state.status === "complete" || state.worker !== workerId) return
        yield* replaceExec(state, {
          leaseExpiresAt: Date.now() + Duration.toMillis(leaseTtl)
        })
          .pipe(
            Effect.catchTag("OptimisticConcurrencyException", () => Effect.void),
            Effect.catchCause(() => Effect.void)
          )
      }
    })

  // --- Drive logic ------------------------------------------------------

  const drive = (
    executionId: string,
    payload: object,
    parent: string | undefined,
    entry: Registered
  ): Effect.Effect<void> =>
    Effect.gen(function*() {
      let local = locals.get(executionId)
      if (local?.fiber) {
        const polled = local.fiber.pollUnsafe()
        const stillRunning = !polled
        const completedNotResume = polled && polled._tag === "Success" && polled.value._tag === "Complete"
        if (stillRunning || completedNotResume) return
      }

      const stateOpt = yield* readExec(executionId)
      if (Option.isNone(stateOpt) || stateOpt.value.status === "complete") return

      const claimed = yield* tryClaim(stateOpt.value)
      const state = Option.isSome(claimed) ? claimed.value : stateOpt.value

      const instance = WorkflowInstance.initial(entry.workflow, executionId)
      instance.interrupted = state.interrupted
      if (!local) {
        local = { instance, fiber: undefined, parent }
        locals.set(executionId, local)
      } else {
        local.instance = instance
      }

      const onComplete = Effect.fnUntraced(function*(result: Workflow.Result<unknown, unknown>) {
        const current = yield* readExec(executionId)
        if (Option.isNone(current) || current.value.status === "complete") return
        const isComplete = result._tag === "Complete"
        yield* replaceExec(current.value, {
          status: isComplete ? "complete" : current.value.status,
          suspended: result._tag === "Suspended",
          interrupted: instance.interrupted,
          completedExit: isComplete ? result : undefined,
          worker: isComplete ? undefined : current.value.worker,
          leaseExpiresAt: isComplete ? undefined : current.value.leaseExpiresAt
        })
          .pipe(Effect.catchTag("OptimisticConcurrencyException", () => Effect.void))
        if (parent && isComplete) {
          yield* Effect.forkIn(driveById(parent), scope)
        }
      })

      local.fiber = yield* entry.execute(payload, executionId).pipe(
        Effect.onExit(() => {
          if (!instance.interrupted) return Effect.void
          instance.suspended = false
          return Effect.withFiber((fiber) => Effect.interruptible(Fiber.interrupt(fiber)))
        }),
        Workflow.intoResult,
        Effect.provideService(WorkflowInstance, instance),
        Effect.provideService(WorkflowEngine, engine),
        Effect.tap(onComplete),
        Effect.forkIn(entry.scope)
      )

      if (Option.isSome(claimed)) {
        yield* Effect.forkIn(heartbeat(executionId), scope)
      }
    })

  const driveById = (executionId: string): Effect.Effect<void> =>
    Effect.gen(function*() {
      const stateOpt = yield* readExec(executionId)
      if (Option.isNone(stateOpt)) return
      const state = stateOpt.value
      const entry = workflows.get(state.workflowName)
      if (!entry) return
      yield* drive(executionId, state.payload, state.parent, entry)
    })

  // --- Clock firing -----------------------------------------------------

  const fireClock = (
    executionId: string,
    name: string,
    deferredName: string
  ): Effect.Effect<void> =>
    sql
      .withTransaction(Effect.gen(function*() {
        const inserted = yield* insertDeferred(executionId, deferredName, Exit.void)
        yield* deleteClock(executionId, name)
        return inserted
      }))
      .pipe(
        Effect.orDie,
        Effect.flatMap((inserted) => inserted ? driveById(executionId) : Effect.void),
        annotate("clockFire", executionId)
      )

  // --- Encoded engine ---------------------------------------------------

  const encoded: Encoded = {
    register: Effect.fnUntraced(function*(workflow, execute) {
      workflows.set(workflow.name, {
        workflow,
        execute,
        scope: yield* Effect.scope
      })
    }),
    execute: Effect.fnUntraced(function*(workflow, options) {
      const entry = workflows.get(workflow.name)
      if (!entry) {
        return yield* Effect.orDie(Effect.fail(`Workflow ${workflow.name} is not registered`))
      }
      const initial: ExecState = {
        executionId: options.executionId,
        workflowName: workflow.name,
        payload: options.payload,
        parent: options.parent?.executionId,
        status: "running",
        suspended: false,
        interrupted: false,
        completedExit: undefined,
        worker: undefined,
        leaseExpiresAt: undefined,
        etag: randomUUID()
      }
      yield* createExec(initial)
      yield* drive(options.executionId, options.payload, options.parent?.executionId, entry)
      if (options.discard) return undefined as any
      const local = locals.get(options.executionId)
      if (local?.fiber) {
        return (yield* Fiber.join(local.fiber)) as any
      }
      while (true) {
        const cur = yield* readExec(options.executionId)
        if (Option.isSome(cur) && cur.value.status === "complete" && cur.value.completedExit) {
          return cur.value.completedExit as any
        }
        yield* Effect.sleep(Duration.millis(500))
      }
    }),
    poll: (_workflow, executionId) =>
      Effect.gen(function*() {
        const local = locals.get(executionId)
        if (local?.fiber) {
          const exitVal = local.fiber.pollUnsafe()
          if (!exitVal) return Option.none<Workflow.Result<unknown, unknown>>()
          if (exitVal._tag !== "Success") return yield* Effect.die(exitVal.cause)
          return Option.some(exitVal.value)
        }
        const state = yield* readExec(executionId)
        if (Option.isNone(state) || state.value.status !== "complete" || !state.value.completedExit) {
          return Option.none<Workflow.Result<unknown, unknown>>()
        }
        return Option.some(state.value.completedExit)
      }),
    interrupt: Effect.fnUntraced(function*(_workflow, executionId) {
      const local = locals.get(executionId)
      if (local) local.instance.interrupted = true
      const current = yield* readExec(executionId)
      if (Option.isNone(current) || current.value.status === "complete") return
      yield* replaceExec(current.value, { interrupted: true }).pipe(
        Effect.catchTag("OptimisticConcurrencyException", () => Effect.void)
      )
      yield* driveById(executionId)
    }),
    interruptUnsafe: Effect.fnUntraced(function*(_workflow, executionId) {
      const local = locals.get(executionId)
      if (local) local.instance.interrupted = true
      const current = yield* readExec(executionId)
      if (Option.isSome(current) && current.value.status !== "complete") {
        yield* replaceExec(current.value, { interrupted: true }).pipe(
          Effect.catchTag("OptimisticConcurrencyException", () => Effect.void)
        )
      }
      if (local?.fiber) yield* Fiber.interrupt(local.fiber)
    }),
    resume: (_workflow, executionId) => driveById(executionId),
    activityExecute: Effect.fnUntraced(function*(activity, attempt) {
      const instance = yield* WorkflowInstance
      const existing = yield* readActivity(instance.executionId, activity.name, attempt)
      if (Option.isSome(existing) && existing.value._tag !== "Suspended") {
        return existing.value
      }
      const activityInstance = WorkflowInstance.initial(instance.workflow, instance.executionId)
      activityInstance.interrupted = instance.interrupted

      const result = yield* activity.executeEncoded.pipe(
        Workflow.intoResult,
        Effect.provideService(WorkflowInstance, activityInstance)
      )

      const persisted = yield* insertActivity(instance.executionId, activity.name, attempt, result)
      if (persisted) return result
      const winner = yield* readActivity(instance.executionId, activity.name, attempt)
      return Option.isSome(winner) ? winner.value : result
    }),
    deferredResult: Effect.fnUntraced(function*(deferred) {
      const instance = yield* WorkflowInstance
      return yield* readDeferred(instance.executionId, deferred.name)
    }),
    deferredDone: Effect.fnUntraced(function*(options) {
      const inserted = yield* insertDeferred(options.executionId, options.deferredName, options.exit)
      if (!inserted) return
      yield* driveById(options.executionId)
    }),
    scheduleClock: (workflow, options) => {
      const fireAt = Date.now() + Duration.toMillis(options.clock.duration)
      return Effect.gen(function*() {
        yield* insertClock(
          options.executionId,
          options.clock.name,
          workflow.name,
          options.clock.deferred.name,
          fireAt
        )
        yield* fireClock(options.executionId, options.clock.name, options.clock.deferred.name).pipe(
          Effect.delay(options.clock.duration),
          FiberMap.run(clocks, `${options.executionId}/${options.clock.name}`, { onlyIfMissing: true }),
          Effect.asVoid
        )
      })
    }
  }

  const engine = makeUnsafe(encoded)

  // --- Recovery poller --------------------------------------------------

  if (Duration.toMillis(recoveryInterval) > 0) {
    const recoverStep = Effect
      .gen(function*() {
        const rows = yield* exec(
          `SELECT execution_id, workflow_name FROM "${execTable}"
         WHERE status = 'running' AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
         LIMIT 100`,
          [Date.now()]
        )
        for (const row of rows as ReadonlyArray<{ execution_id: string; workflow_name: string }>) {
          if (!workflows.has(row.workflow_name)) continue
          const local = locals.get(row.execution_id)
          if (local?.fiber && !local.fiber.pollUnsafe()) continue
          yield* Effect.forkIn(driveById(row.execution_id), scope)
        }
      })
      .pipe(annotate("recoveryScan"), Effect.catchCause(() => Effect.void))

    yield* recoverStep.pipe(
      Effect.repeat(Schedule.spaced(recoveryInterval)),
      Effect.forkIn(scope)
    )
  }

  // --- Clock poller -----------------------------------------------------

  if (Duration.toMillis(clockPollInterval) > 0) {
    const clockStep = Effect
      .gen(function*() {
        const rows = yield* exec(
          `SELECT execution_id, name, deferred_name FROM "${clockTable}"
         WHERE fire_at <= ?
         LIMIT 100`,
          [Date.now()]
        )
        for (
          const row of rows as ReadonlyArray<{
            execution_id: string
            name: string
            deferred_name: string
          }>
        ) {
          yield* Effect.forkIn(fireClock(row.execution_id, row.name, row.deferred_name), scope)
        }
      })
      .pipe(annotate("clockScan"), Effect.catchCause(() => Effect.void))

    yield* clockStep.pipe(
      Effect.repeat(Schedule.spaced(clockPollInterval)),
      Effect.forkIn(scope)
    )
  }

  return engine
})

/**
 * SQLite backed `WorkflowEngine` layer. Requires an ambient `SqlClient`
 * (`@effect/sql-sqlite-node` or a compatible client).
 */
export const layerSqlite = (
  cfg: WorkflowEngineSqliteConfig = {}
): Layer.Layer<WorkflowEngine, never, SqlClient.SqlClient> =>
  Layer.effect(WorkflowEngine)(makeSqliteWorkflowEngine(cfg))
