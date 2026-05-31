import { SqliteClient } from "@effect/sql-sqlite-node"
import { assert, describe, it } from "@effect/vitest"
import { Context, Duration, Effect, Exit, Fiber, Layer, Option, Schema } from "effect"
import { ClusterSchema, ClusterWorkflowEngine, RunnerAddress, RunnerHealth, Runners, Sharding, ShardingConfig, SqlMessageStorage, SqlRunnerStorage } from "effect/unstable/cluster"
import { DurableDeferred, Workflow } from "effect/unstable/workflow"

const testRunId = `${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}`
const runnerPortBase = 10000 + Date.now() % 40000

describe("ClusterSqlite Workflow", () => {
  it.live("resumes a running workflow suspended on a durable deferred", () =>
    Effect
      .gen(function*() {
        const sharding = yield* Sharding.Sharding
        const payload = { id: `deferred-${testRunId}` }
        const executionId = yield* SqliteDeferredWorkflow.executionId(payload)

        const fiber = yield* SqliteDeferredWorkflow.execute(payload).pipe(Effect.forkScoped)
        yield* waitForDeferredWorkflowSuspended(executionId)

        const token = yield* DurableDeferred.tokenFromPayload(SqliteDeferred, {
          workflow: SqliteDeferredWorkflow,
          payload
        })
        yield* DurableDeferred.done(SqliteDeferred, { token, exit: Exit.succeed("resolved") })
        yield* sharding.pollStorage

        const value = yield* Fiber.join(fiber).pipe(Effect.timeout(Duration.seconds(15)))
        assert.strictEqual(value, `${payload.id}:resolved`)
        assert.strictEqual(yield* waitForDeferredWorkflowComplete(executionId), `${payload.id}:resolved`)
      })
      .pipe(Effect.provide(clusterWorkflowLayer())), 30000)

  it.live("progresses through sequential durable deferred steps", () =>
    Effect
      .gen(function*() {
        const log = yield* StepLog
        const sharding = yield* Sharding.Sharding
        const payload = { id: `steps-${testRunId}` }
        const executionId = yield* SequentialDeferredWorkflow.executionId(payload)

        const fiber = yield* SequentialDeferredWorkflow.execute(payload).pipe(Effect.forkScoped)
        yield* waitForSequentialWorkflowSuspended(executionId)

        yield* completeStep(SequentialStep1, payload, "one")
        yield* sharding.pollStorage
        yield* waitForStep(log, "step-1")

        yield* completeStep(SequentialStep2, payload, "two")
        yield* sharding.pollStorage
        yield* waitForStep(log, "step-2")

        yield* completeStep(SequentialStep3, payload, "three")
        yield* sharding.pollStorage

        const value = yield* Fiber.join(fiber).pipe(Effect.timeout(Duration.seconds(15)))
        assert.strictEqual(value, "one:two:three")
        assert(log.steps.includes("step-3"))
      })
      .pipe(Effect.provide(clusterWorkflowLayer())), 30000)
})

class StepLog extends Context.Service<StepLog, { readonly steps: Array<string> }>()("StepLog") {
  static readonly layer = Layer.effect(StepLog, Effect.sync(() => ({ steps: [] })))
}

const SqliteDeferred = DurableDeferred.make("ClusterSqlite/Deferred", { success: Schema.String })

const SqliteDeferredWorkflow = Workflow
  .make({
    name: "ClusterSqlite/DeferredWorkflow",
    payload: { id: Schema.String },
    success: Schema.String,
    idempotencyKey: ({ id }) => id
  })
  .annotate(ClusterSchema.ShardGroup, () => testShardGroup("workflow"))

const SqliteDeferredWorkflowLayer = SqliteDeferredWorkflow.toLayer(Effect.fnUntraced(function*({ id }) {
  const value = yield* DurableDeferred.await(SqliteDeferred)
  return `${id}:${value}`
}))

const SequentialStep1 = DurableDeferred.make("ClusterSqlite/SequentialStep1", { success: Schema.String })
const SequentialStep2 = DurableDeferred.make("ClusterSqlite/SequentialStep2", { success: Schema.String })
const SequentialStep3 = DurableDeferred.make("ClusterSqlite/SequentialStep3", { success: Schema.String })

const SequentialDeferredWorkflow = Workflow
  .make({
    name: "ClusterSqlite/SequentialDeferredWorkflow",
    payload: { id: Schema.String },
    success: Schema.String,
    idempotencyKey: ({ id }) => id
  })
  .annotate(ClusterSchema.ShardGroup, () => testShardGroup("workflow"))

const SequentialDeferredWorkflowLayer = SequentialDeferredWorkflow.toLayer(Effect.fnUntraced(function*() {
  const log = yield* StepLog
  const step1 = yield* DurableDeferred.await(SequentialStep1)
  log.steps.push("step-1")
  const step2 = yield* DurableDeferred.await(SequentialStep2)
  log.steps.push("step-2")
  const step3 = yield* DurableDeferred.await(SequentialStep3)
  log.steps.push("step-3")
  return `${step1}:${step2}:${step3}`
}))

const clusterWorkflowLayer = () => {
  const prefix = "test_cluster_sqlite"
  const config = ShardingConfig.layer({
    runnerAddress: Option.some(testRunnerAddress(20)),
    shardsPerGroup: 1,
    availableShardGroups: [testShardGroup("workflow")],
    assignedShardGroups: [testShardGroup("workflow")],
    entityTerminationTimeout: 0,
    entityMessagePollInterval: 50,
    entityReplyPollInterval: 50,
    refreshAssignmentsInterval: 0,
    sendRetryInterval: 50
  })
  const storage = Layer
    .merge(
      SqlMessageStorage.layerWith({ prefix }),
      Layer.orDie(SqlRunnerStorage.layerWith({ prefix }))
    )
    .pipe(Layer.provide(SqliteClient.layer({ filename: ":memory:" })))

  return Layer
    .merge(SqliteDeferredWorkflowLayer, SequentialDeferredWorkflowLayer)
    .pipe(
      Layer.provideMerge(StepLog.layer),
      Layer.provideMerge(
        ClusterWorkflowEngine.layer.pipe(
          Layer.provideMerge(Sharding.layer),
          Layer.provide(Runners.layerNoop),
          Layer.provide(RunnerHealth.layerNoop),
          Layer.provide(storage),
          Layer.provide(config)
        )
      )
    )
}

const completeStep = <Success extends Schema.Top>(
  deferred: DurableDeferred.DurableDeferred<Success, Schema.Never>,
  payload: { readonly id: string },
  value: Success["Type"]
) =>
  Effect.gen(function*() {
    const token = yield* DurableDeferred.tokenFromPayload(deferred, {
      workflow: SequentialDeferredWorkflow,
      payload
    })
    yield* DurableDeferred.done(deferred, { token, exit: Exit.succeed(value) })
  })

const waitForDeferredWorkflowSuspended = (executionId: string) => waitForSuspended(SqliteDeferredWorkflow, executionId)

const waitForSequentialWorkflowSuspended = (executionId: string) =>
  waitForSuspended(SequentialDeferredWorkflow, executionId)

const waitForSuspended = <A, E, R>(
  workflow: {
    readonly poll: (
      executionId: string
    ) => Effect.Effect<Option.Option<Workflow.Result<A, E>>, never, R>
  },
  executionId: string
) =>
  Effect.gen(function*() {
    const sharding = yield* Sharding.Sharding
    for (let i = 0; i < 100; i++) {
      yield* sharding.pollStorage
      const polled = yield* workflow.poll(executionId)
      if (Option.isSome(polled) && polled.value._tag === "Suspended") return
      yield* Effect.sleep(Duration.millis(100))
    }
    return yield* Effect.fail(new Error(`Workflow ${executionId} did not suspend`))
  })

const waitForDeferredWorkflowComplete = (executionId: string) =>
  Effect.gen(function*() {
    const sharding = yield* Sharding.Sharding
    for (let i = 0; i < 100; i++) {
      yield* sharding.pollStorage
      const polled = yield* SqliteDeferredWorkflow.poll(executionId)
      if (Option.isSome(polled) && polled.value._tag === "Complete") {
        const exit = polled.value.exit
        assert(Exit.isSuccess(exit))
        return exit.value
      }
      yield* Effect.sleep(Duration.millis(100))
    }
    return yield* Effect.fail(new Error(`Workflow ${executionId} did not complete`))
  })

const waitForStep = (log: StepLog["Service"], step: string) =>
  Effect.gen(function*() {
    for (let i = 0; i < 100; i++) {
      if (log.steps.includes(step)) return
      yield* Effect.sleep(Duration.millis(100))
    }
    return yield* Effect.fail(new Error(`Workflow did not reach ${step}`))
  })

const testShardGroup = (label: string) => `cluster-sqlite-${testRunId}-${label}`

const testRunnerAddress = (offset: number) => RunnerAddress.make("localhost", runnerPortBase + offset)
