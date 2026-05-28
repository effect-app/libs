/**
 * SQLite backed {@link WorkflowEngine} implementation.
 *
 * Persists workflow state across four tables:
 *   - `workflow_exec`     — one row per execution; tracks status, lease, etag
 *   - `workflow_activity` — recorded activity results keyed by (exec, name, attempt)
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
 * Durability — everything that crosses the storage boundary is round-tripped
 * through schema codecs (`S.fromJsonString(S.toCodecJson(...))`), exactly like
 * the cluster engine:
 *
 * - The workflow payload and the top-level `Workflow.Result` are encoded with
 *   the workflow's own `payloadSchema` / `successSchema` / `errorSchema`, so
 *   typed values (dates, branded ids, schema classes) survive a restart.
 * - Activity results flow through the engine already encoded, so they are
 *   persisted with an opaque `Workflow.Result({ success: AnyOrVoid, error:
 *   AnyOrVoid })` codec — same trick the cluster `ActivityRpc` uses.
 * - Durable-deferred exits use an opaque `Exit` codec.
 *
 * Crash recovery: each driver holds a time-bound lease on the exec row,
 * renewed by a heartbeat fiber. A scope-bound recovery poller re-drives any
 * exec whose lease has lapsed. A clock poller fires due clocks even when
 * the in-process timer is missing (e.g. after a restart).
 */
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import * as Option from "effect-app/Option"
import * as S from "effect-app/Schema"
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
  /** Schema-encoded (JSON string) workflow payload. */
  readonly payload: string
  readonly parent: string | null
  readonly status: ExecStatus
  readonly suspended: number
  readonly interrupted: number
  /** Schema-encoded (JSON string) top-level `Workflow.Result`, set on completion. */
  readonly completed_result: string | null
  readonly worker: string | null
  readonly lease_expires_at: number | null
  readonly etag: string
}

interface ExecState {
  readonly executionId: string
  readonly workflowName: string
  readonly payload: string
  readonly parent: string | undefined
  readonly status: ExecStatus
  readonly suspended: boolean
  readonly interrupted: boolean
  readonly completedResult: string | undefined
  readonly worker: string | undefined
  readonly leaseExpiresAt: number | undefined
  readonly etag: string
}

const parseExec = (row: ExecRow): ExecState => ({
  executionId: row.execution_id,
  workflowName: row.workflow_name,
  payload: row.payload,
  parent: row.parent ?? undefined,
  status: row.status,
  suspended: row.suspended !== 0,
  interrupted: row.interrupted !== 0,
  completedResult: row.completed_result ?? undefined,
  worker: row.worker ?? undefined,
  leaseExpiresAt: row.lease_expires_at ?? undefined,
  etag: row.etag
})

// --- Storage codecs ---------------------------------------------------------
// Values flowing through the engine's activity / deferred boundary are already
// schema-encoded, so the structure is round-tripped while the payload stays
// opaque (mirrors the cluster engine's `AnyOrVoid` usage).
const AnyOrVoid = S.Union([S.Any, S.Void])
const ActivityResultCodec = S.fromJsonString(S.toCodecJson(Workflow.Result({ success: AnyOrVoid, error: AnyOrVoid })))
const DeferredExitCodec = S.fromJsonString(S.toCodecJson(S.Exit(AnyOrVoid, AnyOrVoid, S.Defect)))

const encodeActivityResult = (r: Workflow.Result<unknown, unknown>) =>
  Effect.orDie(S.encodeEffect(ActivityResultCodec)(r))
const decodeActivityResult = (s: string) => Effect.orDie(S.decodeEffect(ActivityResultCodec)(s))
const encodeDeferredExit = (e: Exit.Exit<unknown, unknown>) => Effect.orDie(S.encodeEffect(DeferredExitCodec)(e))
const decodeDeferredExit = (s: string) => Effect.orDie(S.decodeEffect(DeferredExitCodec)(s))

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
       completed_result TEXT,
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
       result TEXT NOT NULL,
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

  // Per-workflow codecs for the typed payload + top-level result. Cached by
  // workflow name; derived from the workflow's own schemas so typed values
  // (dates, branded ids, schema classes) survive the storage round-trip.
  const makePayloadCodec = (workflow: Workflow.Any) => S.fromJsonString(S.toCodecJson(workflow.payloadSchema))
  const payloadCodecCache = new Map<string, ReturnType<typeof makePayloadCodec>>()
  const payloadCodecFor = (workflow: Workflow.Any) => {
    let c = payloadCodecCache.get(workflow.name)
    if (!c) {
      c = makePayloadCodec(workflow)
      payloadCodecCache.set(workflow.name, c)
    }
    return c
  }

  const makeResultCodec = (workflow: Workflow.Any) =>
    S.fromJsonString(S.toCodecJson(Workflow.Result({ success: workflow.successSchema, error: workflow.errorSchema })))
  const resultCodecCache = new Map<string, ReturnType<typeof makeResultCodec>>()
  const resultCodecFor = (workflow: Workflow.Any) => {
    let c = resultCodecCache.get(workflow.name)
    if (!c) {
      c = makeResultCodec(workflow)
      resultCodecCache.set(workflow.name, c)
    }
    return c
  }

  const encodePayload = (workflow: Workflow.Any, payload: object) =>
    Effect.orDie(S.encodeEffect(payloadCodecFor(workflow))(payload)) as Effect.Effect<string>
  const decodePayload = (workflow: Workflow.Any, s: string) =>
    Effect.orDie(S.decodeEffect(payloadCodecFor(workflow))(s)) as Effect.Effect<object>
  const encodeResult = (workflow: Workflow.Any, r: Workflow.Result<unknown, unknown>) =>
    Effect.orDie(S.encodeEffect(resultCodecFor(workflow))(r)) as Effect.Effect<string>
  const decodeResult = (workflow: Workflow.Any, s: string) =>
    Effect.orDie(S.decodeEffect(resultCodecFor(workflow))(s)) as Effect.Effect<Workflow.Result<unknown, unknown>>

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
               completed_result = ?,
               worker = ?,
               lease_expires_at = ?,
               etag = ?
         WHERE execution_id = ? AND etag = ?
         RETURNING etag`,
          [
            merged.status,
            merged.suspended ? 1 : 0,
            merged.interrupted ? 1 : 0,
            merged.completedResult ?? null,
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
        initial.payload,
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

  // First-writer-wins persistence of an activity result; returns true if this
  // call won, false if another writer beat us to the (exec, name, attempt) row.
  const createActivity = (
    executionId: string,
    name: string,
    attempt: number,
    encoded: string
  ): Effect.Effect<boolean> =>
    exec(
      `INSERT INTO "${activityTable}" (execution_id, name, attempt, result)
       VALUES (?, ?, ?, ?)
       ON CONFLICT DO NOTHING
       RETURNING execution_id`,
      [executionId, name, attempt, encoded]
    )
      .pipe(Effect.map((rows) => (rows as ReadonlyArray<unknown>).length > 0))

  // Overwrites a previously persisted *suspended* activity result so the next
  // attempt can record its real outcome.
  const upsertActivity = (
    executionId: string,
    name: string,
    attempt: number,
    encoded: string
  ): Effect.Effect<void> =>
    exec(
      `INSERT INTO "${activityTable}" (execution_id, name, attempt, result)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(execution_id, name, attempt) DO UPDATE SET result = excluded.result`,
      [executionId, name, attempt, encoded]
    )
      .pipe(Effect.asVoid)

  const readActivity = (
    executionId: string,
    name: string,
    attempt: number
  ): Effect.Effect<Option.Option<string>> =>
    exec(
      `SELECT result FROM "${activityTable}" WHERE execution_id = ? AND name = ? AND attempt = ?`,
      [executionId, name, attempt]
    )
      .pipe(
        Effect.map((rows) => {
          const r = (rows as ReadonlyArray<{ result: string }>)[0]
          return r ? Option.some(r.result) : Option.none<string>()
        })
      )

  const createDeferred = (
    executionId: string,
    name: string,
    encoded: string
  ): Effect.Effect<boolean> =>
    exec(
      `INSERT INTO "${deferredTable}" (execution_id, name, exit)
       VALUES (?, ?, ?)
       ON CONFLICT DO NOTHING
       RETURNING execution_id`,
      [executionId, name, encoded]
    )
      .pipe(Effect.map((rows) => (rows as ReadonlyArray<unknown>).length > 0))

  const readDeferred = (
    executionId: string,
    name: string
  ): Effect.Effect<Option.Option<string>> =>
    exec(
      `SELECT exit FROM "${deferredTable}" WHERE execution_id = ? AND name = ?`,
      [executionId, name]
    )
      .pipe(
        Effect.map((rows) => {
          const r = (rows as ReadonlyArray<{ exit: string }>)[0]
          return r ? Option.some(r.exit) : Option.none<string>()
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

  // --- Workflow result helpers ------------------------------------------

  const completeResult = (
    workflow: Workflow.Any,
    state: ExecState
  ): Effect.Effect<Option.Option<Workflow.Result<unknown, unknown>>> =>
    state.status === "complete" && state.completedResult
      ? Effect.map(decodeResult(workflow, state.completedResult), Option.some)
      : Effect.succeedNone

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
        const completedResult = isComplete ? yield* encodeResult(entry.workflow, result) : undefined
        yield* replaceExec(current.value, {
          status: isComplete ? "complete" : current.value.status,
          suspended: result._tag === "Suspended",
          interrupted: instance.interrupted,
          completedResult,
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
      const payload = yield* decodePayload(entry.workflow, state.payload)
      yield* drive(executionId, payload, state.parent, entry)
    })

  // --- Clock firing -----------------------------------------------------

  const fireClock = (
    executionId: string,
    name: string,
    deferredName: string
  ): Effect.Effect<void> =>
    Effect
      .gen(function*() {
        const encoded = yield* encodeDeferredExit(Exit.void)
        const inserted = yield* sql
          .withTransaction(Effect.gen(function*() {
            const got = yield* createDeferred(executionId, deferredName, encoded)
            yield* deleteClock(executionId, name)
            return got
          }))
          .pipe(Effect.orDie)
        if (inserted) yield* driveById(executionId)
      })
      .pipe(annotate("clockFire", executionId))

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
        payload: yield* encodePayload(workflow, options.payload),
        parent: options.parent?.executionId,
        status: "running",
        suspended: false,
        interrupted: false,
        completedResult: undefined,
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
      // Foreign-driver fallback: poll the persisted result until completion.
      while (true) {
        const cur = yield* readExec(options.executionId)
        if (Option.isSome(cur)) {
          const r = yield* completeResult(workflow, cur.value)
          if (Option.isSome(r)) return r.value as any
        }
        yield* Effect.sleep(Duration.millis(500))
      }
    }),
    poll: (workflow, executionId) =>
      Effect.gen(function*() {
        const local = locals.get(executionId)
        if (local?.fiber) {
          const exitVal = local.fiber.pollUnsafe()
          if (!exitVal) return Option.none<Workflow.Result<unknown, unknown>>()
          if (exitVal._tag !== "Success") return yield* Effect.die(exitVal.cause)
          return Option.some(exitVal.value)
        }
        const state = yield* readExec(executionId)
        if (Option.isNone(state)) return Option.none<Workflow.Result<unknown, unknown>>()
        return yield* completeResult(workflow, state.value)
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
      if (Option.isSome(existing)) {
        const prev = yield* decodeActivityResult(existing.value)
        // A completed activity is replayed from its persisted result; a
        // suspended one must re-run (it parked on a clock/deferred).
        if (prev._tag === "Complete") return prev
      }

      const activityInstance = WorkflowInstance.initial(instance.workflow, instance.executionId)
      activityInstance.interrupted = instance.interrupted

      const result = yield* activity.executeEncoded.pipe(
        Workflow.intoResult,
        Effect.provideService(WorkflowInstance, activityInstance)
      )
      const encodedResult = yield* encodeActivityResult(result)

      if (Option.isSome(existing)) {
        // Overwrite the previously persisted *suspended* result.
        yield* upsertActivity(instance.executionId, activity.name, attempt, encodedResult)
        return result
      }
      // First-writer-wins: if persistence loses the race, use the persisted result.
      const persisted = yield* createActivity(instance.executionId, activity.name, attempt, encodedResult)
      if (persisted) return result
      const winner = yield* readActivity(instance.executionId, activity.name, attempt)
      if (Option.isSome(winner)) {
        const w = yield* decodeActivityResult(winner.value)
        if (w._tag === "Complete") return w
      }
      return result
    }),
    deferredResult: Effect.fnUntraced(function*(deferred) {
      const instance = yield* WorkflowInstance
      const got = yield* readDeferred(instance.executionId, deferred.name)
      if (Option.isNone(got)) return Option.none<Exit.Exit<unknown, unknown>>()
      return Option.some(yield* decodeDeferredExit(got.value))
    }),
    deferredDone: Effect.fnUntraced(function*(options) {
      const encoded = yield* encodeDeferredExit(options.exit)
      const inserted = yield* createDeferred(options.executionId, options.deferredName, encoded)
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
