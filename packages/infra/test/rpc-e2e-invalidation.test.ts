/**
 * E2E tests for commands and queries using in-memory RPC transport.
 *
 * These tests exercise the full server-side pipeline:
 *   - `InvalidationMiddlewareLive` — reads the `Invalidates` annotation, pre-populates the
 *     `InvalidationSet`, and wraps command results in `{ payload, metadata }`.
 *   - `RequestType` annotation — decides whether to wrap (command) or not (query).
 *   - `InvalidationSet.use()` — dynamic key accumulation inside a handler.
 *
 * Transport is in-memory via `RpcTest.makeClient`, so no HTTP server is needed.
 */
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Ref } from "effect"
import { S } from "effect-app"
import { makeInvalidationKeysService } from "effect-app/client"
import { InvalidationMiddleware } from "effect-app/middleware"
import { Invalidation } from "effect-app/rpc"
import { Rpc, RpcGroup, RpcTest } from "effect/unstable/rpc"
import { InvalidationMiddlewareLive, RequestType } from "../src/api/routing/middleware.js"

// ---------------------------------------------------------------------------
// Shared test keys
// ---------------------------------------------------------------------------

const StaticKey: Invalidation.InvalidationKey = ["static", "key"]
const DynamicKey: Invalidation.InvalidationKey = ["dynamic", "key"]

// ---------------------------------------------------------------------------
// RPC group definition
//
// The success schema for commands is defined as the PLAIN type. At runtime,
// `InvalidationMiddlewareLive` wraps command results into
// `{ payload: <plain>, metadata: { invalidateQueries: [...] } }`.
// `RpcTest.makeClient` uses no-serialization transport, so the wrapped runtime
// value is what the test receives — no codec is applied to coerce it back.
// ---------------------------------------------------------------------------

const E2eRpcs = RpcGroup.make(
  // Plain query — result is not wrapped
  Rpc
    .make("getGreeting", {
      payload: S.Struct({ name: S.String }),
      success: S.String
    })
    .annotate(RequestType, "query")
    .middleware(InvalidationMiddleware),
  // Command — no invalidation keys
  Rpc
    .make("doNothing", { success: S.Void })
    .annotate(RequestType, "command")
    .middleware(InvalidationMiddleware),
  // Command — static `Invalidates` annotation
  Rpc
    .make("doWithStaticKey", {
      success: S.Struct({ count: S.Number })
    })
    .annotate(RequestType, "command")
    .annotate(Invalidation.Invalidates, [StaticKey])
    .middleware(InvalidationMiddleware),
  // Command — dynamic key added via `InvalidationSet.use`
  Rpc
    .make("doWithDynamicKey", { success: S.String })
    .annotate(RequestType, "command")
    .middleware(InvalidationMiddleware),
  // Command — static annotation + dynamic key combined
  Rpc
    .make("doWithBothKeys", { success: S.Number })
    .annotate(RequestType, "command")
    .annotate(Invalidation.Invalidates, [StaticKey])
    .middleware(InvalidationMiddleware)
)

// ---------------------------------------------------------------------------
// Server implementation layer
//
// Handlers return the PLAIN success value. `InvalidationMiddlewareLive`
// intercepts every command call and wraps the result into
// `{ payload, metadata: { invalidateQueries } }` before it reaches the client.
// ---------------------------------------------------------------------------

const E2eImplLayer = E2eRpcs.toLayer({
  getGreeting: ({ name }) => Effect.succeed(`Hello, ${name}!`),
  doNothing: () => Effect.void,
  doWithStaticKey: () => Effect.succeed({ count: 42 }),
  doWithDynamicKey: Effect.fnUntraced(function*() {
    yield* Invalidation.InvalidationSet.use((_) => _.add(DynamicKey))
    return "done"
  }),
  doWithBothKeys: Effect.fnUntraced(function*() {
    yield* Invalidation.InvalidationSet.use((_) => _.add(DynamicKey))
    return 99
  })
})

const E2eTestLayer = Layer.merge(E2eImplLayer, InvalidationMiddlewareLive)

// Helper: validates that the runtime-wrapped command result has the expected shape.
// `RpcTest` skips codec encoding/decoding, so the value in the client IS the
// wrapped object produced by `InvalidationMiddlewareLive`, even when the declared
// schema is the plain type.
type CommandResult = { payload: unknown; metadata: { invalidateQueries: ReadonlyArray<Invalidation.InvalidationKey> } }

const isCommandResult = (value: unknown): value is CommandResult =>
  typeof value === "object"
  && value !== null
  && "payload" in value
  && "metadata" in value
  && typeof (value as Record<string, unknown>)["metadata"] === "object"
  && (value as Record<string, unknown>)["metadata"] !== null
  && "invalidateQueries" in ((value as Record<string, unknown>)["metadata"] as object)

const asCommand = (value: unknown): CommandResult => {
  if (!isCommandResult(value)) throw new Error(`Expected a wrapped command result, got: ${JSON.stringify(value)}`)
  return value
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

it.live(
  "query returns the correct value",
  Effect.fnUntraced(function*() {
    const client = yield* RpcTest.makeClient(E2eRpcs)
    const result = yield* client.getGreeting({ name: "World" })
    expect(result).toBe("Hello, World!")
  }, Effect.provide(E2eTestLayer))
)

it.live(
  "query result is NOT wrapped in CommandResponseWithMetaData",
  Effect.fnUntraced(function*() {
    const client = yield* RpcTest.makeClient(E2eRpcs)
    const result = yield* client.getGreeting({ name: "Check" })
    expect(typeof result).toBe("string")
    expect(isCommandResult(result)).toBe(false)
  }, Effect.provide(E2eTestLayer))
)

it.live(
  "command with no invalidation keys has empty invalidateQueries in metadata",
  Effect.fnUntraced(function*() {
    const client = yield* RpcTest.makeClient(E2eRpcs)
    const result = asCommand(yield* client.doNothing())
    expect(result.metadata.invalidateQueries).toStrictEqual([])
  }, Effect.provide(E2eTestLayer))
)

it.live(
  "command with static Invalidates annotation propagates key to metadata",
  Effect.fnUntraced(function*() {
    const client = yield* RpcTest.makeClient(E2eRpcs)
    const result = asCommand(yield* client.doWithStaticKey())
    expect(result.payload).toStrictEqual({ count: 42 })
    expect(result.metadata.invalidateQueries).toStrictEqual([StaticKey])
  }, Effect.provide(E2eTestLayer))
)

it.live(
  "command with dynamic InvalidationSet.use propagates key to metadata",
  Effect.fnUntraced(function*() {
    const client = yield* RpcTest.makeClient(E2eRpcs)
    const result = asCommand(yield* client.doWithDynamicKey())
    expect(result.payload).toBe("done")
    expect(result.metadata.invalidateQueries).toStrictEqual([DynamicKey])
  }, Effect.provide(E2eTestLayer))
)

it.live(
  "command combining static annotation + dynamic key merges all into metadata",
  Effect.fnUntraced(function*() {
    const client = yield* RpcTest.makeClient(E2eRpcs)
    const result = asCommand(yield* client.doWithBothKeys())
    expect(result.payload).toBe(99)
    expect(result.metadata.invalidateQueries).toStrictEqual([StaticKey, DynamicKey])
  }, Effect.provide(E2eTestLayer))
)

it.live(
  "per-request isolation: each command call has a fresh InvalidationSet",
  Effect.fnUntraced(function*() {
    const client = yield* RpcTest.makeClient(E2eRpcs)
    const r1 = asCommand(yield* client.doWithDynamicKey())
    const r2 = asCommand(yield* client.doWithDynamicKey())
    // Each call must have exactly one key — no accumulation from prior calls
    expect(r1.metadata.invalidateQueries).toStrictEqual([DynamicKey])
    expect(r2.metadata.invalidateQueries).toStrictEqual([DynamicKey])
  }, Effect.provide(E2eTestLayer))
)

// ---------------------------------------------------------------------------
// Client-side consumption tests
//
// These tests verify the full roundtrip for cache invalidation:
//   1. The server wraps command results in `{ payload, metadata: { invalidateQueries } }`.
//   2. The client-side `unwrapCommand` logic (as implemented in `apiClientFactory`) extracts
//      the payload and forwards each key to `InvalidationKeysFromServer.add()`.
//
// `runAndCapture` replicates that logic using a fresh `Ref`-backed service so the test
// can inspect which keys the client received after the command completes.
// ---------------------------------------------------------------------------

/**
 * Replicates `apiClientFactory`'s `unwrapCommand` + `InvalidationKeysFromServer` pattern:
 *   - Unwraps the `CommandResponseWithMetaData` result
 *   - Calls `svc.add(key)` for every key in `metadata.invalidateQueries`
 *   - Returns `{ payload, keys }` for assertion
 */
const runAndCapture = <A, E, R>(eff: Effect.Effect<A, E, R>) =>
  Effect.gen(function*() {
    const keysRef = yield* Ref.make<ReadonlyArray<Invalidation.InvalidationKey>>([])
    const svc = makeInvalidationKeysService(keysRef)
    const cmd = asCommand(yield* eff)
    yield* Effect.forEach(cmd.metadata.invalidateQueries, svc.add, { discard: true })
    return { payload: cmd.payload, keys: yield* Ref.get(keysRef) }
  })

it.live(
  "client consumes static key: payload unwrapped and key forwarded to InvalidationKeysFromServer",
  Effect.fnUntraced(function*() {
    const client = yield* RpcTest.makeClient(E2eRpcs)
    const { payload, keys } = yield* runAndCapture(client.doWithStaticKey())
    expect(payload).toStrictEqual({ count: 42 })
    expect(keys).toStrictEqual([StaticKey])
  }, Effect.provide(E2eTestLayer))
)

it.live(
  "client consumes dynamic key: payload unwrapped and key forwarded to InvalidationKeysFromServer",
  Effect.fnUntraced(function*() {
    const client = yield* RpcTest.makeClient(E2eRpcs)
    const { payload, keys } = yield* runAndCapture(client.doWithDynamicKey())
    expect(payload).toBe("done")
    expect(keys).toStrictEqual([DynamicKey])
  }, Effect.provide(E2eTestLayer))
)

it.live(
  "client consumes combined static+dynamic keys: all keys forwarded to InvalidationKeysFromServer",
  Effect.fnUntraced(function*() {
    const client = yield* RpcTest.makeClient(E2eRpcs)
    const { payload, keys } = yield* runAndCapture(client.doWithBothKeys())
    expect(payload).toBe(99)
    expect(keys).toStrictEqual([StaticKey, DynamicKey])
  }, Effect.provide(E2eTestLayer))
)
