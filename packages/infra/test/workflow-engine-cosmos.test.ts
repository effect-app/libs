/**
 * Workflow engine conformance tests.
 *
 * The `runSuite` body is engine-agnostic: it runs against `WorkflowEngine.
 * layerMemory` (fast, always) and — when `COSMOS_TEST_URL` is set — against the
 * Cosmos adapter (`layerCosmos`) pointed at a Cosmos emulator. Both must satisfy
 * the same observable contract: idempotent execution, activity replay, and
 * suspend → durable-deferred completion → resume with a correctly decoded result.
 */
import { assert, describe, it } from "@effect/vitest"
import { Duration, Effect, Exit, Layer, Option, Redacted, Schema } from "effect"
import { Activity, DurableDeferred, Workflow, WorkflowEngine } from "effect/unstable/workflow"
import { layerCosmos } from "../src/WorkflowEngineCosmos.js"

const IncrementWorkflow = Workflow.make({
  name: "WorkflowEngineCosmos/IncrementWorkflow",
  payload: { value: Schema.Number },
  success: Schema.Number,
  idempotencyKey: ({ value }) => String(value)
})

const IncrementHandler = IncrementWorkflow.toLayer(({ value }) => Effect.succeed(value + 1))

// A workflow that records an activity result, then suspends on a durable
// deferred until it is completed externally — exercises the persisted
// activity-result replay and the result/exit serialization round-trip.
const Trigger = DurableDeferred.make("WorkflowEngineCosmos/Trigger", { success: Schema.String })

const SuspendWorkflow = Workflow.make({
  name: "WorkflowEngineCosmos/SuspendWorkflow",
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => id
})

const SuspendHandler = SuspendWorkflow.toLayer(Effect.fnUntraced(function*({ id }) {
  const n = yield* Activity.make({
    name: "step",
    success: Schema.Number,
    execute: Effect.succeed(1)
  })
  const v = yield* DurableDeferred.await(Trigger)
  return `${id}:${n}:${v}`
}))

const Handlers = Layer.mergeAll(IncrementHandler, SuspendHandler)

const runSuite = (engineLayer: Layer.Layer<WorkflowEngine.WorkflowEngine>) => {
  const TestLayer = Handlers.pipe(Layer.provideMerge(engineLayer))

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

        let done: Workflow.Result<string, never> | undefined
        for (let i = 0; i < 200 && !done; i++) {
          const polled = yield* SuspendWorkflow.poll(executionId)
          if (Option.isSome(polled) && polled.value._tag === "Complete") {
            done = polled.value
          } else {
            yield* Effect.sleep(Duration.millis(10))
          }
        }

        assert(done && done._tag === "Complete" && Exit.isSuccess(done.exit))
        assert.strictEqual(done.exit.value, "abc:1:ok")
      })
      .pipe(Effect.provide(TestLayer)))
}

describe("WorkflowEngine (in-memory)", () => {
  runSuite(WorkflowEngine.layerMemory)
})

// Opt-in integration suite against a Cosmos emulator. Run with e.g.
//   COSMOS_TEST_URL="https://localhost:8081" COSMOS_TEST_DB="workflow-test" \
//   NODE_TLS_REJECT_UNAUTHORIZED=0 pnpm vitest run workflow-engine-cosmos
const cosmosUrl = process.env["COSMOS_TEST_URL"]
describe.skipIf(!cosmosUrl)("WorkflowEngine (Cosmos)", () => {
  runSuite(
    layerCosmos({
      url: Redacted.make(cosmosUrl ?? ""),
      dbName: process.env["COSMOS_TEST_DB"] ?? "workflow-test",
      prefix: `test-${Date.now()}-`,
      // Tight cadences so the suite doesn't wait on the background pollers.
      recoveryInterval: Duration.seconds(2),
      clockPollInterval: Duration.seconds(1)
    })
  )
})
