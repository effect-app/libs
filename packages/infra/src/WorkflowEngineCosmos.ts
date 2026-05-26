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
 * Limitations:
 *   - Workflow handler code lives in process; the process that calls
 *     `execute` first owns the in-process fiber. Other callers observing
 *     the same `executionId` poll Cosmos until completion.
 *   - Clocks are scheduled in-process via `FiberMap`. The clock record is
 *     persisted so a restart-aware poller can rearm; that poller is not
 *     included here.
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
import type * as Scope from "effect/Scope"
import * as Workflow from "effect/unstable/workflow/Workflow"
import { type Encoded, makeUnsafe, WorkflowEngine, WorkflowInstance } from "effect/unstable/workflow/WorkflowEngine"
import { CosmosClient, CosmosClientLayer } from "./cosmos-client.js"
import { OptimisticConcurrencyException } from "./errors.js"
import { annotateCosmosResponse, annotateDb } from "./otel.js"

export interface WorkflowEngineCosmosConfig {
  readonly url: Redacted.Redacted<string>
  readonly dbName: string
  readonly prefix?: string
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

      const state = stateOpt.value
      const instance = WorkflowInstance.initial(entry.workflow, executionId)
      instance.interrupted = state.interrupted
      if (!local) {
        local = { instance, fiber: undefined, parent }
        locals.set(executionId, local)
      } else {
        local.instance = instance
      }

      const onComplete = Effect.fnUntraced(function*(result: Workflow.Result<unknown, unknown>) {
        // Persist completion with OCC: only the first to mark it complete wins.
        const current = yield* readExec(executionId)
        if (Option.isNone(current) || current.value.status === "complete") return
        yield* replaceExec({
          ...current.value,
          status: result._tag === "Complete" ? "complete" : current.value.status,
          suspended: result._tag === "Suspended",
          interrupted: instance.interrupted,
          completedExit: result._tag === "Complete" ? result : undefined
        })
          .pipe(
            Effect.catchTag("OptimisticConcurrencyException", () => Effect.void)
          )
        if (parent && result._tag === "Complete") {
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
        deferredName: options.clock.deferred.name,
        fireAt
      }
      return Effect.gen(function*() {
        yield* createIfMissing(clockDoc).pipe(annotate("clockPersist", options.executionId))
        yield* engine
          .deferredDone(options.clock.deferred, {
            workflowName: workflow.name,
            executionId: options.executionId,
            deferredName: options.clock.deferred.name,
            exit: Exit.void
          })
          .pipe(
            Effect.delay(options.clock.duration),
            FiberMap.run(clocks, `${options.executionId}/${options.clock.name}`, { onlyIfMissing: true }),
            Effect.asVoid
          )
      })
    }
  }

  const engine = makeUnsafe(encoded)
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
