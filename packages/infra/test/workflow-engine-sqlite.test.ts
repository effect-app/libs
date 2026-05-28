/* eslint-disable @typescript-eslint/no-explicit-any */
import { SqliteClient } from "@effect/sql-sqlite-node"
import { assert, describe, it } from "@effect/vitest"
import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import * as Option from "effect-app/Option"
import * as S from "effect-app/Schema"
import * as Duration from "effect/Duration"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"
import { SqlClient } from "effect/unstable/sql"
import { Activity, DurableDeferred, Workflow } from "effect/unstable/workflow"
import { layerSqlite } from "../src/WorkflowEngineSqlite.js"

// --- Shared mutable counter service -----------------------------------

class CounterRef extends Context.Service<CounterRef, { count: number }>()("CounterRef") {
  static readonly layer = Layer.effect(CounterRef, Effect.sync(() => ({ count: 0 })))
}

// --- Workflow definitions --------------------------------------------

const Increment = Workflow.make({
  name: "Sqlite/Increment",
  payload: { value: Schema.Number },
  success: Schema.Number,
  idempotencyKey: ({ value }) => `inc-${value}`
})

const IncrementHandler = Increment.toLayer(Effect.fn(function*({ value }) {
  const counter = yield* CounterRef
  yield* Activity.make({
    name: "Bump",
    success: Schema.Number,
    execute: Effect.sync(() => {
      counter.count++
      return counter.count
    })
  })
  return value + 1
}))

const TickHandler = Increment.toLayer(({ value }) => Effect.succeed(value + 1))

const EmailReceived = DurableDeferred.make("EmailReceived", { success: Schema.String })

const AwaitEmail = Workflow.make({
  name: "Sqlite/AwaitEmail",
  payload: { id: Schema.String },
  success: Schema.String,
  idempotencyKey: ({ id }) => `email-${id}`
})

const AwaitEmailHandler = AwaitEmail.toLayer(Effect.fn(function*() {
  return yield* DurableDeferred.await(EmailReceived)
}))

// Reproduces the adapter's opaque activity-result codec so tests can seed
// schema-encoded values into the activity table directly.
const ActivityResultCodec = S.fromJsonString(
  S.toCodecJson(Workflow.Result({ success: S.Union([S.Any, S.Void]), error: S.Union([S.Any, S.Void]) }))
)

// --- Layer wiring ----------------------------------------------------

type TestOpts = {
  readonly recoveryInterval?: Duration.Duration
  readonly clockPollInterval?: Duration.Duration
}

const makeBase = (opts?: TestOpts) => {
  const Sqlite = SqliteClient.layer({ filename: ":memory:" })
  const Engine = layerSqlite({
    recoveryInterval: opts?.recoveryInterval ?? Duration.millis(100),
    clockPollInterval: opts?.clockPollInterval ?? Duration.millis(100)
  })
    .pipe(Layer.provide(Sqlite))
  return { Sqlite, Engine }
}

const incrementLayer = (opts?: TestOpts) => {
  const { Sqlite, Engine } = makeBase(opts)
  return IncrementHandler.pipe(
    Layer.provideMerge(CounterRef.layer),
    Layer.provideMerge(Engine),
    Layer.provideMerge(Sqlite)
  )
}

const tickLayer = (opts?: TestOpts) => {
  const { Sqlite, Engine } = makeBase(opts)
  return TickHandler.pipe(Layer.provideMerge(Engine), Layer.provideMerge(Sqlite))
}

const awaitEmailLayer = (opts?: TestOpts) => {
  const { Sqlite, Engine } = makeBase(opts)
  return AwaitEmailHandler.pipe(Layer.provideMerge(Engine), Layer.provideMerge(Sqlite))
}

// --- Tests ------------------------------------------------------------

describe("WorkflowEngine (SQLite)", () => {
  it.live("executes a workflow and persists completion", () =>
    Effect
      .gen(function*() {
        const executionId = yield* Increment.execute({ value: 10 }, { discard: true })
        const result = yield* Increment.execute({ value: 10 })
        const polled = yield* Increment.poll(executionId)

        assert.strictEqual(result, 11)
        assert(
          Option.isSome(polled)
            && polled.value._tag === "Complete"
            && Exit.isSuccess(polled.value.exit)
        )
        assert.strictEqual(polled.value.exit.value, 11)
      })
      .pipe(Effect.provide(incrementLayer())))

  it.live("re-executing the same id is idempotent (activity runs once)", () =>
    Effect
      .gen(function*() {
        const counter = yield* CounterRef
        yield* Increment.execute({ value: 1 })
        yield* Increment.execute({ value: 1 })
        yield* Increment.execute({ value: 1 })
        assert.strictEqual(counter.count, 1)
      })
      .pipe(Effect.provide(incrementLayer())))

  it.live("persists activity results across replay", () =>
    Effect
      .gen(function*() {
        const sql = yield* SqlClient.SqlClient
        yield* Increment.execute({ value: 2 })
        const rows = yield* sql
          .unsafe(
            `SELECT execution_id, name, attempt, result FROM workflow_activity`
          )
          .pipe(Effect.orDie)
        assert.strictEqual(rows.length, 1)
        assert.strictEqual((rows[0] as any).name, "Bump")
        // Stored value is schema-encoded JSON, not a raw runtime object.
        const decoded = S.decodeSync(ActivityResultCodec)((rows[0] as any).result)
        assert.strictEqual(decoded._tag, "Complete")
      })
      .pipe(Effect.provide(incrementLayer())))

  it.live("durable deferred completion resumes a suspended workflow", () =>
    Effect
      .gen(function*() {
        const completion = Effect.gen(function*() {
          yield* Effect.sleep(Duration.millis(50))
          const token = yield* DurableDeferred.tokenFromPayload(EmailReceived, {
            workflow: AwaitEmail,
            payload: { id: "x" }
          })
          yield* DurableDeferred.done(EmailReceived, { token, exit: Exit.succeed("delivered") })
        })
        const [result] = yield* Effect.all(
          [AwaitEmail.execute({ id: "x" }), completion],
          { concurrency: "unbounded" }
        )
        assert.strictEqual(result, "delivered")
      })
      .pipe(Effect.provide(awaitEmailLayer())))

  it.live("interrupt marks the execution row", () =>
    Effect
      .gen(function*() {
        const sql = yield* SqlClient.SqlClient
        const executionId = yield* AwaitEmail.executionId({ id: "i" })
        // Start the workflow as discard (does not block) so it suspends in the
        // background; then mark it interrupted.
        yield* AwaitEmail.execute({ id: "i" }, { discard: true })
        yield* Effect.sleep(Duration.millis(50))
        yield* AwaitEmail.interrupt(executionId)
        yield* Effect.sleep(Duration.millis(50))
        const rows = yield* sql
          .unsafe(
            `SELECT interrupted FROM workflow_exec WHERE execution_id = ?`,
            [executionId] as any
          )
          .pipe(Effect.orDie)
        assert.strictEqual((rows[0] as any).interrupted, 1)
      })
      .pipe(Effect.provide(awaitEmailLayer())))

  it.live("clock poller fires past-due clocks", () =>
    Effect
      .gen(function*() {
        const sql = yield* SqlClient.SqlClient
        yield* sql
          .unsafe(
            `INSERT INTO workflow_exec (execution_id, workflow_name, payload, status, suspended, interrupted, etag)
         VALUES ('exec-clock', 'Sqlite/AwaitEmail', '{"id":"x"}', 'running', 0, 0, 'e1')`
          )
          .pipe(Effect.orDie)
        yield* sql
          .unsafe(
            `INSERT INTO workflow_clock (execution_id, name, workflow_name, deferred_name, fire_at)
         VALUES ('exec-clock', 'wake', 'Sqlite/AwaitEmail', 'EmailReceived', ?)`,
            [Date.now() - 1000] as any
          )
          .pipe(Effect.orDie)

        yield* Effect.sleep(Duration.millis(400))

        const deferred = yield* sql
          .unsafe(
            `SELECT exit FROM workflow_deferred WHERE execution_id = 'exec-clock' AND name = 'EmailReceived'`
          )
          .pipe(Effect.orDie)
        const clockGone = yield* sql
          .unsafe(
            `SELECT execution_id FROM workflow_clock WHERE execution_id = 'exec-clock' AND name = 'wake'`
          )
          .pipe(Effect.orDie)
        assert.strictEqual(deferred.length, 1)
        assert.strictEqual(clockGone.length, 0)
      })
      .pipe(Effect.provide(awaitEmailLayer())))

  it.live("recovery poller drives execs with stale leases", () =>
    Effect
      .gen(function*() {
        const sql = yield* SqlClient.SqlClient
        yield* sql
          .unsafe(
            `INSERT INTO workflow_exec (execution_id, workflow_name, payload, status, suspended, interrupted, lease_expires_at, etag)
         VALUES ('recover-1', 'Sqlite/Increment', '{"value":99}', 'running', 0, 0, 0, 'e0')`
          )
          .pipe(Effect.orDie)

        yield* Effect.sleep(Duration.millis(500))

        const rows = yield* sql
          .unsafe(
            `SELECT status, completed_result FROM workflow_exec WHERE execution_id = 'recover-1'`
          )
          .pipe(Effect.orDie)
        assert.strictEqual((rows[0] as any).status, "complete")
        const completedResult = JSON.parse((rows[0] as any).completed_result) as { _tag: string }
        assert.strictEqual(completedResult._tag, "Complete")
      })
      .pipe(Effect.provide(tickLayer())))

  it.live("activity dedup: a pre-existing persisted result wins over a fresh run", () =>
    Effect
      .gen(function*() {
        const sql = yield* SqlClient.SqlClient
        const counter = yield* CounterRef
        const executionId = yield* Increment.executionId({ value: 7 })
        yield* sql
          .unsafe(
            `INSERT INTO workflow_exec (execution_id, workflow_name, payload, status, suspended, interrupted, etag)
         VALUES (?, 'Sqlite/Increment', '{"value":7}', 'running', 0, 0, 'e0')`,
            [executionId] as any
          )
          .pipe(Effect.orDie)
        const seeded = S.encodeSync(ActivityResultCodec)(
          new Workflow.Complete({ exit: Exit.succeed(999) })
        )
        yield* sql
          .unsafe(
            `INSERT INTO workflow_activity (execution_id, name, attempt, result)
         VALUES (?, 'Bump', 1, ?)`,
            [executionId, seeded] as any
          )
          .pipe(Effect.orDie)

        const result = yield* Increment.execute({ value: 7 })
        assert.strictEqual(result, 8)
        // Bump's user effect must NOT have run — counter stays at 0.
        assert.strictEqual(counter.count, 0)
      })
      .pipe(Effect.provide(incrementLayer())))

  it.live("deferredDone is idempotent (first-writer-wins)", () =>
    Effect
      .gen(function*() {
        const completion = Effect.gen(function*() {
          yield* Effect.sleep(Duration.millis(50))
          const token = yield* DurableDeferred.tokenFromPayload(EmailReceived, {
            workflow: AwaitEmail,
            payload: { id: "dup" }
          })
          yield* DurableDeferred.done(EmailReceived, { token, exit: Exit.succeed("first") })
          yield* DurableDeferred.done(EmailReceived, { token, exit: Exit.succeed("second") })
        })
        const [result] = yield* Effect.all(
          [AwaitEmail.execute({ id: "dup" }), completion],
          { concurrency: "unbounded" }
        )
        assert.strictEqual(result, "first")
      })
      .pipe(Effect.provide(awaitEmailLayer())))
})
