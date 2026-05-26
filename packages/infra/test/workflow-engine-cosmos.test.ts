/**
 * In-memory sample / smoke test for the workflow API.
 *
 * Uses `WorkflowEngine.layerMemory` for fast local execution; the same
 * workflow definitions plug into the Cosmos adapter (`layerCosmos`) when a
 * Cosmos endpoint is available — see `WorkflowEngineCosmos.ts`.
 */
import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, Layer, Option, Schema } from "effect"
import { Workflow, WorkflowEngine } from "effect/unstable/workflow"

const IncrementWorkflow = Workflow.make({
  name: "WorkflowEngineCosmos/IncrementWorkflow",
  payload: { value: Schema.Number },
  success: Schema.Number,
  idempotencyKey: ({ value }) => String(value)
})

const IncrementHandler = IncrementWorkflow.toLayer(({ value }) => Effect.succeed(value + 1))

const TestLayer = IncrementHandler.pipe(Layer.provideMerge(WorkflowEngine.layerMemory))

describe("WorkflowEngine in-memory sample", () => {
  it.effect("executes a workflow and polls the result", () =>
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

  it.effect("re-executing the same id is idempotent", () =>
    Effect
      .gen(function*() {
        const a = yield* IncrementWorkflow.execute({ value: 7 })
        const b = yield* IncrementWorkflow.execute({ value: 7 })
        assert.strictEqual(a, b)
      })
      .pipe(Effect.provide(TestLayer)))
})
