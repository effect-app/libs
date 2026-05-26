/**
 * Cosmos DB backed {@link WorkflowEngine} implementation.
 *
 * Persists workflow state in a single container partitioned by `executionId`
 * so per-execution writes can be issued through Cosmos TransactionalBatch
 * (atomic for ops sharing the same partition key). Optimistic concurrency
 * is enforced with `_etag` + `IfMatch` on Replace operations and with
 * create-only ops in batches for first-writer-wins semantics on activity
 * results and durable-deferred completions.
 *
 * Crash recovery: each driver holds a time-bound lease (`worker` +
 * `leaseExpiresAt`) on the exec doc and renews it via a heartbeat fiber.
 * A scope-bound recovery poller queries for exec docs whose lease has
 * lapsed and re-drives them in the local process, picking up persisted
 * activity results from where the crashed driver left off.
 *
 * Durable clocks: `scheduleClock` writes a clock doc (`fireAt`,
 * `deferredName`) and arms an in-process timer. A cross-partition clock
 * poller fires any clock whose `fireAt` is due, completing the deferred
 * idempotently (via create-only) and deleting the doc. Survives restarts.
 */
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import * as Option from "effect-app/Option"
import { dropUndefinedT } from "effect-app/utils"
import * as Duration from "effect/Duration"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as FiberMap from "effect/FiberMap"
import * as Redacted from "effect/Redacted"
import * as Schedule from "effect/Schedule"
import type * as Scope from "effect/Scope"
import * as Workflow from "effect/unstable/workflow/Workflow"
import { type Encoded, makeUnsafe, WorkflowEngine, WorkflowInstance } from "effect/unstable/workflow/WorkflowEngine"
import { randomUUID } from "node:crypto"
import { CosmosClient, CosmosClientLayer } from "./cosmos-client.js"
import { OptimisticConcurrencyException } from "./errors.js"
import { annotateCosmosResponse, annotateDb } from "./otel.js"

export interface WorkflowEngineCosmosConfig {
  readonly url: Redacted.Redacted<string>
  readonly dbName: string
  readonly prefix?: string
  /** Lease duration before claim considered stale. Default 30s. */
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

interface ExecDoc {
  readonly id: "exec"
  readonly _partitionKey: string
  readonly type: "exec"
  readonly workflowName: string
  readonly payload: object
  readonly parent: string | undefined
  status: ExecStatus
  suspended: boolean
  interrupted: boolean
  completedExit?: Workflow.Result<unknown, unknown> | undefined
  worker?: string | undefined
  leaseExpiresAt?: string | undefined
  readonly _etag?: string
}

interface ActivityDoc {
  readonly id: string
  readonly _partitionKey: string
  readonly type: "activity"
  readonly exit: Exit.Exit<Workflow.Result<unknown, unknown>>
}

interface DeferredDoc {
  readonly id: string
  readonly _partitionKey: string
  readonly type: "deferred"
  readonly exit: Exit.Exit<unknown, unknown>
}

interface ClockDoc {
  readonly id: string
  readonly _partitionKey: string
  readonly type: "clock"
  readonly workflowName: string
  readonly deferredName: string
  readonly fireAt: string
}

const execId = "exec" as const
const activityKey = (name: string, attempt: number) => `activity::${name}::${attempt}`
const deferredKey = (name: string) => `deferred::${name}`
const clockKey = (name: string) => `clock::${name}`

const isOptimisticStatus = (code: number) => code === 409 || code === 412 || code === 404

const makeCosmosWorkflowEngine = Effect.fnUntraced(function*(cfg: WorkflowEngineCosmosConfig) {
  const { db } = yield* CosmosClient
  const containerId = `${cfg.prefix ?? ""}workflow-engine`
  yield* Effect.promise(() =>
    db.containers.createIfNotExists({
      id: containerId,
      partitionKey: { paths: ["/_partitionKey"], version: 2 }
    })
  )
  const container = db.container(containerId)
  const scope = yield* Effect.scope

  const workerId = cfg.workerId ?? randomUUID()
  const leaseTtl = cfg.leaseTtl ?? Duration.seconds(30)
  const heartbeatInterval = cfg.heartbeatInterval ?? Duration.seconds(10)
  const recoveryInterval = cfg.recoveryInterval ?? Duration.seconds(15)
  const clockPollInterval = cfg.clockPollInterval ?? Duration.seconds(5)

  const annotate = (operation: string, executionId?: string) =>
    annotateDb({
      operation,
      system: "cosmosdb",
      collection: containerId,
      entity: "workflow",
      extra: executionId !== undefined
        ? { "azure.cosmosdb.operation.partition_key": executionId, "app.entity.id": executionId }
        : undefined
    })

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

  // --- Cosmos primitives -------------------------------------------------

  const readExec = (executionId: string) =>
    Effect
      .gen(function*() {
        const resp = yield* Effect.promise(() => container.item(execId, executionId).read<ExecDoc>())
        yield* annotateCosmosResponse({ requestCharge: resp.requestCharge, statusCode: resp.statusCode })
        return Option.fromNullishOr(resp.resource).pipe(
          Option.map((r) => ({ ...r, _etag: resp.etag }))
        )
      })
      .pipe(annotate("readExec", executionId))

  const replaceExec = (doc: ExecDoc) =>
    Effect
      .gen(function*() {
        const resp = yield* Effect.promise(() =>
          container.item(execId, doc._partitionKey).replace<ExecDoc>(doc, {
            accessCondition: { type: "IfMatch", condition: doc._etag ?? "" }
          })
        )
        yield* annotateCosmosResponse({ requestCharge: resp.requestCharge, statusCode: resp.statusCode })
        if (isOptimisticStatus(resp.statusCode)) {
          return yield* new OptimisticConcurrencyException({
            type: "workflow.exec",
            id: doc._partitionKey,
            code: resp.statusCode
          })
        }
        return { ...doc, _etag: resp.etag }
      })
      .pipe(annotate("replaceExec", doc._partitionKey))

  // Atomic create-or-noop using a single-op batch — returns true if created.
  const createIfMissing = <T extends { readonly id: string; readonly _partitionKey: string }>(
    body: T
  ): Effect.Effect<boolean> =>
    Effect.gen(function*() {
      const resp = yield* Effect.promise(() =>
        container.items.batch(
          [{ operationType: "Create" as const, resourceBody: body }],
          body._partitionKey
        )
      )
      const r = resp.result?.[0]
      const code = r?.statusCode ?? 0
      if (code === 201) return true
      if (code === 409) return false
      return yield* Effect.die(
        new Error(`workflow-engine cosmos createIfMissing for ${body.id} failed: ${code}`)
      )
    })

  const readPoint = <T extends { id: string }>(id: string, executionId: string) =>
    Effect.promise(() => container.item(id, executionId).read<T>()).pipe(
      Effect.map((r) => Option.fromNullishOr(r.resource))
    )

  // --- Workflow result helpers ------------------------------------------

  const completeExit = (state: ExecDoc): Option.Option<Workflow.Result<unknown, unknown>> =>
    state.status === "complete" && state.completedExit
      ? Option.some(state.completedExit)
      : Option.none()

  // --- Lease / claim ----------------------------------------------------

  const leaseActive = (state: ExecDoc, now: number): boolean =>
    state.worker !== undefined
    && state.worker !== workerId
    && state.leaseExpiresAt !== undefined
    && Date.parse(state.leaseExpiresAt) > now

  /**
   * Try to claim a lease on `state`. Returns the updated doc on success, `None`
   * if another worker holds an active lease, or on OCC conflict (caller may
   * retry by re-reading).
   */
  const tryClaim = (state: ExecDoc): Effect.Effect<Option.Option<ExecDoc>> =>
    Effect.gen(function*() {
      const now = Date.now()
      if (leaseActive(state, now)) return Option.none<ExecDoc>()
      const updated: ExecDoc = {
        ...state,
        worker: workerId,
        leaseExpiresAt: new Date(now + Duration.toMillis(leaseTtl)).toISOString()
      }
      return yield* replaceExec(updated).pipe(
        Effect.map(Option.some),
        Effect.catchTag("OptimisticConcurrencyException", () => Effect.succeed(Option.none<ExecDoc>()))
      )
    })

  /**
   * Renew lease until the local fiber stops or another worker takes the claim.
   * Best-effort: failures are swallowed; loop simply retries on next tick.
   */
  const heartbeat = (executionId: string): Effect.Effect<void> =>
    Effect.gen(function*() {
      while (true) {
        yield* Effect.sleep(heartbeatInterval)
        const local = locals.get(executionId)
        const polled = local?.fiber?.pollUnsafe()
        if (!local?.fiber || polled) return
        const cur = yield* readExec(executionId).pipe(
          Effect.catchCause(() => Effect.succeed(Option.none<ExecDoc>()))
        )
        if (Option.isNone(cur)) continue
        const state = cur.value
        if (state.status === "complete" || state.worker !== workerId) return
        yield* replaceExec({
          ...state,
          leaseExpiresAt: new Date(Date.now() + Duration.toMillis(leaseTtl)).toISOString()
        })
          .pipe(
            Effect.catchTag("OptimisticConcurrencyException", () => Effect.void),
            Effect.catchCause(() => Effect.void)
          )
      }
    })

  // --- Drive logic -------------------------------------------------------

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

      // Best-effort claim: takes lease so recovery poller leaves us alone.
      // Failure is tolerated — local fiber still drives; OCC guards persisted
      // state so split-brain stays correct.
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
        yield* replaceExec({
          ...current.value,
          status: isComplete ? "complete" : current.value.status,
          suspended: result._tag === "Suspended",
          interrupted: instance.interrupted,
          completedExit: isComplete ? result : undefined,
          // Release lease on completion so the doc isn't seen as orphaned.
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
  // Persist deferred completion (first-writer-wins via createIfMissing),
  // resume the workflow, then clean up the clock doc.
  const fireClock = (doc: ClockDoc): Effect.Effect<void> =>
    Effect.gen(function*() {
      const created = yield* createIfMissing<DeferredDoc>({
        id: deferredKey(doc.deferredName),
        _partitionKey: doc._partitionKey,
        type: "deferred",
        exit: Exit.void
      })
        .pipe(annotate("clockFire", doc._partitionKey))
      if (created) yield* driveById(doc._partitionKey)
      yield* Effect.promise(() => container.item(doc.id, doc._partitionKey).delete()).pipe(
        Effect.catchCause(() => Effect.void)
      )
    })

  // --- Encoded engine ----------------------------------------------------

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

      const initial: ExecDoc = {
        id: execId,
        _partitionKey: options.executionId,
        type: "exec",
        workflowName: workflow.name,
        payload: options.payload,
        parent: options.parent?.executionId,
        status: "running",
        suspended: false,
        interrupted: false
      }
      const created = yield* createIfMissing(initial).pipe(annotate("execute.claim", options.executionId))

      if (created || !locals.has(options.executionId)) {
        yield* drive(options.executionId, options.payload, options.parent?.executionId, entry)
      }

      if (options.discard) return undefined as any

      const local = locals.get(options.executionId)
      if (local?.fiber) {
        return (yield* Fiber.join(local.fiber)) as any
      }

      // Foreign-owned execution: poll until exec doc reports complete.
      while (true) {
        const cur = yield* readExec(options.executionId)
        if (Option.isSome(cur)) {
          const c = completeExit(cur.value)
          if (Option.isSome(c)) return c.value as any
        }
        yield* Effect.sleep(Duration.millis(500))
      }
    }),
    poll: (_workflow, executionId) =>
      Effect.gen(function*() {
        const local = locals.get(executionId)
        if (local?.fiber) {
          const exit = local.fiber.pollUnsafe()
          if (!exit) return Option.none<Workflow.Result<unknown, unknown>>()
          if (exit._tag !== "Success") return yield* Effect.die(exit.cause)
          return Option.some(exit.value)
        }
        const state = yield* readExec(executionId)
        if (Option.isNone(state)) return Option.none<Workflow.Result<unknown, unknown>>()
        return completeExit(state.value)
      }),
    interrupt: Effect.fnUntraced(function*(_workflow, executionId) {
      const local = locals.get(executionId)
      if (local) local.instance.interrupted = true
      const current = yield* readExec(executionId)
      if (Option.isNone(current) || current.value.status === "complete") return
      yield* replaceExec({ ...current.value, interrupted: true }).pipe(
        Effect.catchTag("OptimisticConcurrencyException", () => Effect.void)
      )
      yield* driveById(executionId)
    }),
    interruptUnsafe: Effect.fnUntraced(function*(_workflow, executionId) {
      const local = locals.get(executionId)
      if (local) local.instance.interrupted = true
      const current = yield* readExec(executionId)
      if (Option.isSome(current) && current.value.status !== "complete") {
        yield* replaceExec({ ...current.value, interrupted: true }).pipe(
          Effect.catchTag("OptimisticConcurrencyException", () => Effect.void)
        )
      }
      if (local?.fiber) yield* Fiber.interrupt(local.fiber)
    }),
    resume: (_workflow, executionId) => driveById(executionId),
    activityExecute: Effect.fnUntraced(function*(activity, attempt) {
      const instance = yield* WorkflowInstance
      const id = activityKey(activity.name, attempt)
      const existing = yield* readPoint<ActivityDoc>(id, instance.executionId).pipe(
        annotate("activityRead", instance.executionId)
      )
      if (Option.isSome(existing)) {
        const exit = existing.value.exit
        if (!(exit._tag === "Success" && (exit.value as any)._tag === "Suspended")) {
          return yield* exit
        }
      }

      const activityInstance = WorkflowInstance.initial(instance.workflow, instance.executionId)
      activityInstance.interrupted = instance.interrupted

      const exit = yield* activity.executeEncoded.pipe(
        Workflow.intoResult,
        Effect.provideService(WorkflowInstance, activityInstance),
        Effect.exit
      )

      // First-writer-wins: if persistence loses the race, read back and use the persisted exit.
      const persisted = yield* createIfMissing<ActivityDoc>(
        dropUndefinedT({
          id,
          _partitionKey: instance.executionId,
          type: "activity" as const,
          exit
        })
      )
        .pipe(annotate("activityPersist", instance.executionId))
      if (persisted) return yield* exit
      const winner = yield* readPoint<ActivityDoc>(id, instance.executionId)
      return Option.isSome(winner) ? yield* winner.value.exit : yield* exit
    }),
    deferredResult: Effect.fnUntraced(function*(deferred) {
      const instance = yield* WorkflowInstance
      const got = yield* readPoint<DeferredDoc>(deferredKey(deferred.name), instance.executionId).pipe(
        annotate("deferredRead", instance.executionId)
      )
      return Option.map(got, (d) => d.exit)
    }),
    deferredDone: Effect.fnUntraced(function*(options) {
      const created = yield* createIfMissing<DeferredDoc>({
        id: deferredKey(options.deferredName),
        _partitionKey: options.executionId,
        type: "deferred",
        exit: options.exit
      })
        .pipe(annotate("deferredPersist", options.executionId))
      if (!created) return
      yield* driveById(options.executionId)
    }),
    scheduleClock: (workflow, options) => {
      const fireAt = new Date(Date.now() + Duration.toMillis(options.clock.duration)).toISOString()
      const clockDoc: ClockDoc = {
        id: clockKey(options.clock.name),
        _partitionKey: options.executionId,
        type: "clock",
        workflowName: workflow.name,
        deferredName: options.clock.deferred.name,
        fireAt
      }
      return Effect.gen(function*() {
        yield* createIfMissing(clockDoc).pipe(annotate("clockPersist", options.executionId))
        // Fast-path in-process timer. If this process dies, the clock poller
        // picks up the persisted doc and fires the deferred.
        yield* fireClock(clockDoc).pipe(
          Effect.delay(options.clock.duration),
          FiberMap.run(clocks, `${options.executionId}/${options.clock.name}`, { onlyIfMissing: true }),
          Effect.asVoid
        )
      })
    }
  }

  const engine = makeUnsafe(encoded)

  // --- Recovery poller --------------------------------------------------
  // Scan for executions whose lease has lapsed (or was never set) and
  // re-drive them locally. driveById will go through claim → fork fiber,
  // resuming activities from persisted results.
  if (Duration.toMillis(recoveryInterval) > 0) {
    type StaleRow = { readonly _partitionKey: string; readonly workflowName: string }
    const recoverStep = Effect
      .gen(function*() {
        const nowIso = new Date().toISOString()
        const stale = yield* Effect.promise(() =>
          container
            .items
            .query<StaleRow>({
              query:
                "SELECT c._partitionKey, c.workflowName FROM c WHERE c.type = 'exec' AND c.status = 'running' AND (NOT IS_DEFINED(c.leaseExpiresAt) OR c.leaseExpiresAt <= @now)",
              parameters: [{ name: "@now", value: nowIso }]
            })
            .fetchAll()
        )
        for (const row of stale.resources) {
          if (!workflows.has(row.workflowName)) continue
          const local = locals.get(row._partitionKey)
          if (local?.fiber && !local.fiber.pollUnsafe()) continue
          yield* Effect.forkIn(driveById(row._partitionKey), scope)
        }
      })
      .pipe(annotate("recoveryScan"), Effect.catchCause(() => Effect.void))

    yield* recoverStep.pipe(
      Effect.repeat(Schedule.spaced(recoveryInterval)),
      Effect.forkIn(scope)
    )
  }

  // --- Clock poller -----------------------------------------------------
  // Cross-partition scan for clocks whose fireAt is due. Fires the deferred
  // via createIfMissing (idempotent) so multiple pollers across processes
  // converge. Also acts as the restart recovery path for clocks scheduled
  // before a crash.
  if (Duration.toMillis(clockPollInterval) > 0) {
    type DueClock = {
      readonly id: string
      readonly _partitionKey: string
      readonly workflowName: string
      readonly deferredName: string
    }
    const clockStep = Effect
      .gen(function*() {
        const nowIso = new Date().toISOString()
        const due = yield* Effect.promise(() =>
          container
            .items
            .query<DueClock>({
              query:
                "SELECT c.id, c._partitionKey, c.workflowName, c.deferredName FROM c WHERE c.type = 'clock' AND c.fireAt <= @now",
              parameters: [{ name: "@now", value: nowIso }]
            })
            .fetchAll()
        )
        for (const row of due.resources) {
          yield* Effect.forkIn(
            fireClock({
              id: row.id,
              _partitionKey: row._partitionKey,
              type: "clock",
              workflowName: row.workflowName,
              deferredName: row.deferredName,
              fireAt: nowIso
            }),
            scope
          )
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
 * Cosmos DB backed `WorkflowEngine` layer.
 *
 * Per-execution writes use TransactionalBatch (same partition key) and OCC
 * via `_etag`/IfMatch, giving first-writer-wins semantics for activity
 * results, durable-deferred completions, and exec-state transitions.
 */
export const layerCosmos = (cfg: WorkflowEngineCosmosConfig): Layer.Layer<WorkflowEngine> =>
  Layer
    .effect(WorkflowEngine)(makeCosmosWorkflowEngine(cfg))
    .pipe(Layer.provide(CosmosClientLayer(Redacted.value(cfg.url), cfg.dbName)))
