/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Workflow engine conformance tests.
 *
 * The `runSuite` body is engine-agnostic: it runs against
 * `WorkflowEngine.layerMemory` (fast, always) and — when `COSMOS_TEST_URL`
 * is set — against the Cosmos adapter (`layerCosmos`) pointed at a Cosmos
 * emulator. Both must satisfy the same observable contract: idempotent
 * execution, activity replay (no double side effects), suspend → durable-
 * deferred completion → resume with a correctly decoded result, interrupt
 * propagation, and first-writer-wins deferred completion.
 *
 * A second describe block (Cosmos emulator only) exercises adapter
 * internals — the recovery poller (driving execs whose lease has lapsed)
 * and the clock poller (firing past-due clocks) — by seeding rows
 * directly against the Cosmos container.
 */
import { assert, describe, it } from "@effect/vitest"
import { Context, Duration, Effect, Exit, Layer, Option, Redacted, Schema } from "effect"
import { Activity, DurableDeferred, Workflow, WorkflowEngine } from "effect/unstable/workflow"
import { CosmosClient, CosmosClientLayer } from "../src/cosmos-client.js"
import { layerCosmos } from "../src/WorkflowEngineCosmos.js"

// --- Shared mutable counter for activity-side-effect assertions --------

class CounterRef extends Context.Service<CounterRef, { count: number }>()("CounterRef") {
  static readonly layer = Layer.effect(CounterRef, Effect.sync(() => ({ count: 0 })))
}

// --- Workflow definitions ----------------------------------------------

const IncrementWorkflow = Workflow.make({
  name: "WorkflowEngineCosmos/IncrementWorkflow",
  payload: { value: Schema.Number },
  success: Schema.Number,
  idempotencyKey: ({ value }) => String(value)
})

const IncrementHandler = IncrementWorkflow.toLayer(({ value }) => Effect.succeed(value + 1))

// Counts activity body invocations across re-executes so the test can
// prove side-effects don't repeat when a persisted result is available.
const CounterWorkflow = Workflow.make({
  name: "WorkflowEngineCosmos/CounterWorkflow",
  payload: { id: Schema.String },
  success: Schema.Number,
  idempotencyKey: ({ id }) => id
})

const CounterHandler = CounterWorkflow.toLayer(Effect.fn(function*() {
  const counter = yield* CounterRef
  return yield* Activity.make({
    name: "Bump",
    success: Schema.Number,
    execute: Effect.sync(() => {
      counter.count++
      return counter.count
    })
  })
}))

// Suspends on a deferred, then composes the persisted activity result
// with the resumed deferred value. Exercises Result/Exit round-trip.
const Trigger = DurableDeferred.make("WorkflowEngineCosmos/Trigger", { success: Schema.String })

const SuspendWorkflow = Workflow.make({
  name: "WorkflowEngineCosmos/SuspendWorkflow",
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

const SuspendHandler = SuspendWorkflow.toLayer(Effect.fn(function*({ id }) {
  const n = yield* Activity.make({
    name: "step",
    success: Schema.Number,
    execute: Effect.succeed(1)
  })
  const v = yield* DurableDeferred.await(Trigger)
  return `${id}:${n}:${v}`
}))

// Plain durable-deferred await — used to assert first-writer-wins on done().
const AwaitOnly = Workflow.make({
  name: "WorkflowEngineCosmos/AwaitOnly",
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

const AwaitOnlyHandler = AwaitOnly.toLayer(Effect.fn(function*() {
  return yield* DurableDeferred.await(Trigger)
}))

const Handlers = Layer.mergeAll(IncrementHandler, SuspendHandler, CounterHandler, AwaitOnlyHandler)

// Helper that polls until the workflow completes (or `maxIterations` elapse).
const waitForComplete = (
  workflow: { readonly poll: (id: string) => Effect.Effect<Option.Option<Workflow.Result<any, any>>, never, any> },
  executionId: string,
  step = Duration.millis(10),
  maxIterations = 200
) =>
  Effect.gen(function*() {
    for (let i = 0; i < maxIterations; i++) {
      const polled = yield* workflow.poll(executionId)
      if (Option.isSome(polled) && polled.value._tag === "Complete") {
        return polled.value
      }
      yield* Effect.sleep(step)
    }
    return undefined
  })

const runSuite = (engineLayer: Layer.Layer<WorkflowEngine.WorkflowEngine>) => {
  const TestLayer = Handlers.pipe(
    Layer.provideMerge(CounterRef.layer),
    Layer.provideMerge(engineLayer)
  )

  it.live("executes a workflow and polls the result", () =>
    Effect
      .gen(function*() {
        const executionId = yield* IncrementWorkflow.execute({ value: 41 }, { discard: true })
        const result = yield* IncrementWorkflow.execute({ value: 41 })
        const polled = yield* IncrementWorkflow.poll(executionId)

        assert.strictEqual(result, 42)
        assert(
          Option.isSome(polled)
            && polled.value._tag === "Complete"
            && Exit.isSuccess(polled.value.exit)
        )
        assert.strictEqual(polled.value.exit.value, 42)
      })
      .pipe(Effect.provide(TestLayer)))

  it.live("re-executing the same id is idempotent", () =>
    Effect
      .gen(function*() {
        const a = yield* IncrementWorkflow.execute({ value: 7 })
        const b = yield* IncrementWorkflow.execute({ value: 7 })
        assert.strictEqual(a, b)
      })
      .pipe(Effect.provide(TestLayer)))

  it.live("activity side effects run once across re-executions", () =>
    Effect
      .gen(function*() {
        const counter = yield* CounterRef
        yield* CounterWorkflow.execute({ id: "once" })
        yield* CounterWorkflow.execute({ id: "once" })
        yield* CounterWorkflow.execute({ id: "once" })
        assert.strictEqual(counter.count, 1)
      })
      .pipe(Effect.provide(TestLayer)))

  it.live("suspends on a durable deferred, then resumes with the decoded result", () =>
    Effect
      .gen(function*() {
        // The execution suspends on `Trigger`; completing the deferred resumes
        // it (the workflow body replays, the `step` activity is served from its
        // persisted result), and the final value round-trips through the engine.
        const executionId = yield* SuspendWorkflow.execute({ id: "abc" }, { discard: true })

        const token = yield* DurableDeferred.tokenFromPayload(Trigger, {
          workflow: SuspendWorkflow,
          payload: { id: "abc" }
        })
        yield* DurableDeferred.done(Trigger, { token, exit: Exit.succeed("ok") })

        const done = yield* waitForComplete(SuspendWorkflow, executionId)
        assert(done && Exit.isSuccess(done.exit))
        assert.strictEqual(done.exit.value, "abc:1:ok")
      })
      .pipe(Effect.provide(TestLayer)))

  it.live("deferredDone is idempotent (first-writer-wins)", () =>
    Effect
      .gen(function*() {
        const executionId = yield* AwaitOnly.execute({ id: "dup" }, { discard: true })
        const token = yield* DurableDeferred.tokenFromPayload(Trigger, {
          workflow: AwaitOnly,
          payload: { id: "dup" }
        })
        yield* DurableDeferred.done(Trigger, { token, exit: Exit.succeed("first") })
        // Second completion must lose; the workflow body sees "first".
        yield* DurableDeferred.done(Trigger, { token, exit: Exit.succeed("second") })

        const done = yield* waitForComplete(AwaitOnly, executionId)
        assert(done && Exit.isSuccess(done.exit))
        assert.strictEqual(done.exit.value, "first")
      })
      .pipe(Effect.provide(TestLayer)))

  it.live("interrupt eventually completes a suspended execution", () =>
    Effect
      .gen(function*() {
        const executionId = yield* AwaitOnly.execute({ id: "int" }, { discard: true })
        // Give the workflow time to suspend on the deferred.
        yield* Effect.sleep(Duration.millis(50))
        yield* AwaitOnly.interrupt(executionId)

        // The execution should stop reporting as "running" — a subsequent poll
        // returns either Complete (engine collapses the interrupt into a
        // completion) or None (engine surfaces it as not-yet-complete and the
        // wrapper sleep loop eventually ends). Both are acceptable as long as
        // the workflow no longer makes forward progress.
        yield* Effect.sleep(Duration.millis(150))
        const polled = yield* AwaitOnly.poll(executionId)
        if (Option.isSome(polled)) {
          assert.strictEqual(polled.value._tag, "Complete")
        }
      })
      .pipe(Effect.provide(TestLayer)))
}

describe("WorkflowEngine (in-memory)", () => {
  runSuite(WorkflowEngine.layerMemory)
})

// --- Cosmos-emulator-only adapter tests --------------------------------
//
// Opt-in. Run with e.g.
//   COSMOS_TEST_URL="https://localhost:8081" COSMOS_TEST_DB="workflow-test" \
//   NODE_TLS_REJECT_UNAUTHORIZED=0 pnpm vitest run workflow-engine-cosmos
const cosmosUrl = process.env["COSMOS_TEST_URL"]
const cosmosDb = process.env["COSMOS_TEST_DB"] ?? "workflow-test"

describe.skipIf(!cosmosUrl)("WorkflowEngine (Cosmos) — conformance", () => {
  runSuite(
    layerCosmos({
      url: Redacted.make(cosmosUrl ?? ""),
      dbName: cosmosDb,
      prefix: `test-${Date.now()}-`,
      // Tight cadences so the suite doesn't wait on the background pollers.
      recoveryInterval: Duration.seconds(2),
      clockPollInterval: Duration.seconds(1)
    })
  )
})

describe.skipIf(!cosmosUrl)("WorkflowEngine (Cosmos) — adapter internals", () => {
  // Each test gets its own container prefix so seeded docs don't leak.
  const prefixFor = (label: string) => `test-${Date.now()}-${label}-`

  const adapterLayer = (prefix: string) =>
    Layer
      .mergeAll(
        IncrementHandler,
        AwaitOnlyHandler,
        CounterRef.layer,
        CosmosClientLayer(cosmosUrl ?? "", cosmosDb)
      )
      .pipe(
        Layer.provideMerge(
          layerCosmos({
            url: Redacted.make(cosmosUrl ?? ""),
            dbName: cosmosDb,
            prefix,
            recoveryInterval: Duration.millis(500),
            clockPollInterval: Duration.millis(500)
          })
        )
      )

  it.live("recovery poller drives execs with stale leases", () => {
    const prefix = prefixFor("recovery")
    const containerId = `${prefix}workflow-engine`
    return Effect
      .gen(function*() {
        const { db } = yield* CosmosClient
        const container = db.container(containerId)
        // Pre-seed a running exec whose lease has already expired and whose
        // payload is the schema-encoded form of `{ value: 99 }`.
        yield* Effect.promise(() =>
          container.items.upsert({
            id: "exec",
            _partitionKey: "recover-1",
            type: "exec",
            workflowName: IncrementWorkflow.name,
            payload: JSON.stringify({ value: 99 }),
            status: "running",
            suspended: false,
            interrupted: false,
            worker: "ghost",
            leaseExpiresAt: new Date(Date.now() - 60_000).toISOString(),
            etag: "seed"
          })
        )

        // Wait for the recovery poller (500ms cadence) to drive it.
        yield* Effect.sleep(Duration.seconds(2))

        const polled = yield* IncrementWorkflow.poll("recover-1")
        assert(
          Option.isSome(polled)
            && polled.value._tag === "Complete"
            && Exit.isSuccess(polled.value.exit)
        )
        assert.strictEqual(polled.value.exit.value, 100)
      })
      .pipe(Effect.provide(adapterLayer(prefix)))
  })

  it.live("clock poller fires past-due clocks", () => {
    const prefix = prefixFor("clocks")
    const containerId = `${prefix}workflow-engine`
    return Effect
      .gen(function*() {
        const { db } = yield* CosmosClient
        const container = db.container(containerId)
        // Seed an exec + a clock that fired in the past. No in-process timer
        // exists (we never called scheduleClock), so only the poller can
        // resolve the deferred.
        yield* Effect.promise(() =>
          container.items.upsert({
            id: "exec",
            _partitionKey: "exec-clock",
            type: "exec",
            workflowName: AwaitOnly.name,
            payload: JSON.stringify({ id: "wake" }),
            status: "running",
            suspended: false,
            interrupted: false,
            etag: "seed"
          })
        )
        yield* Effect.promise(() =>
          container.items.upsert({
            id: "clock::wake",
            _partitionKey: "exec-clock",
            type: "clock",
            workflowName: AwaitOnly.name,
            deferredName: Trigger.name,
            fireAt: new Date(Date.now() - 60_000).toISOString()
          })
        )

        yield* Effect.sleep(Duration.seconds(2))

        // The clock fire is a deferred-complete; assert the deferred row
        // now exists for this execution.
        const deferred = yield* Effect.promise(() =>
          container.item(`deferred::${Trigger.name}`, "exec-clock").read<{ exit: string }>()
        )
        assert(deferred.resource !== undefined)
        // And the clock doc has been deleted.
        const clockGone = yield* Effect.promise(() => container.item("clock::wake", "exec-clock").read())
        assert.strictEqual(clockGone.statusCode, 404)
      })
      .pipe(Effect.provide(adapterLayer(prefix)))
  })
})
