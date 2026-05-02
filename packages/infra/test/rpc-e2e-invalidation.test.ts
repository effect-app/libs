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
import { Effect, Layer, Ref, Stream } from "effect"
import { S } from "effect-app"
import { InvalidationKeysFromServer, makeInvalidationKeysService } from "effect-app/client"
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
    .middleware(InvalidationMiddleware),
  // Command — fails, V2: failure should include accumulated keys
  Rpc
    .make("doAndFail", {
      success: S.Void,
      error: S.Struct({ message: S.String })
    })
    .annotate(RequestType, "command")
    .annotate(Invalidation.Invalidates, [StaticKey])
    .middleware(InvalidationMiddleware),
  // Stream — no input
  Rpc
    .make("streamTicks", {
      success: S.Number,
      stream: true
    })
    .annotate(RequestType, "query")
    .middleware(InvalidationMiddleware),
  // Stream — with input payload
  Rpc
    .make("streamCountTo", {
      payload: S.Struct({ to: S.Number }),
      success: S.Number,
      stream: true
    })
    .annotate(RequestType, "query")
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
  }),
  // V2: command that fails — middleware wraps the failure with accumulated keys
  doAndFail: Effect.fnUntraced(function*() {
    yield* Invalidation.InvalidationSet.use((_) => _.add(DynamicKey))
    return yield* Effect.fail({ message: "intentional failure" })
  }),
  streamTicks: () => Stream.fromIterable([1, 2, 3]),
  streamCountTo: ({ to }) => Stream.range(1, to)
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
  "stream RPC without input emits all values",
  Effect.fnUntraced(function*() {
    const client = yield* RpcTest.makeClient(E2eRpcs)
    const values = yield* Stream.runCollect(client.streamTicks())
    expect(values).toStrictEqual([1, 2, 3])
  }, Effect.provide(E2eTestLayer))
)

it.live(
  "stream RPC with input emits values driven by payload",
  Effect.fnUntraced(function*() {
    const client = yield* RpcTest.makeClient(E2eRpcs)
    const values = yield* Stream.runCollect(client.streamCountTo({ to: 4 }))
    expect(values).toStrictEqual([1, 2, 3, 4])
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

// ---------------------------------------------------------------------------
// Stream metadata tests (V1)
//
// These tests verify the stream chunk wrapping: the routing layer wraps each
// emitted value as `{ _tag: "value", value }` and appends a final
// `{ _tag: "done", metadata: { invalidateQueries } }` chunk.  The client
// side filters out "done" chunks (accumulating keys) and maps "value" chunks
// to extract the payload.  The tests below exercise both layers independently
// using an RPC group whose success schema is `StreamResponseChunk(S.Number)`.
// ---------------------------------------------------------------------------

const StreamMetaRpcs = RpcGroup.make(
  // Stream that emits plain numbers — the server wraps them as StreamResponseChunk items
  Rpc
    .make("streamWithMeta", {
      success: Invalidation.StreamResponseChunk(S.Number),
      stream: true
    })
    .annotate(RequestType, "query")
    .middleware(InvalidationMiddleware)
)

const StreamKey: Invalidation.InvalidationKey = ["stream", "key"]

const StreamMetaImplLayer = StreamMetaRpcs.toLayer({
  // Handler returns pre-wrapped chunks: simulates what routing.ts produces
  streamWithMeta: () =>
    Stream.fromIterable([
      { _tag: "value" as const, value: 1 },
      { _tag: "value" as const, value: 2 },
      { _tag: "value" as const, value: 3 },
      { _tag: "done" as const, metadata: { invalidateQueries: [StreamKey] } }
    ])
})

const StreamMetaTestLayer = Layer.merge(StreamMetaImplLayer, InvalidationMiddlewareLive)

it.live(
  "stream: client-side unwrapping delivers plain values and discards 'done' chunk",
  Effect.fnUntraced(function*() {
    const client = yield* RpcTest.makeClient(StreamMetaRpcs)
    const raw = yield* Stream.runCollect(client.streamWithMeta())
    // Client must filter out the "done" chunk and extract only values
    const values = raw
      .filter((item: any) => item._tag === "value")
      .map((item: any) => item.value)
    expect(values).toStrictEqual([1, 2, 3])
  }, Effect.provide(StreamMetaTestLayer))
)

it.live(
  "stream: client-side invalidation keys are collected from the 'done' chunk",
  Effect.fnUntraced(function*() {
    const keysRef = yield* Ref.make<ReadonlyArray<Invalidation.InvalidationKey>>([])
    const svc = makeInvalidationKeysService(keysRef)
    const client = yield* RpcTest.makeClient(StreamMetaRpcs)
    const raw = yield* Stream.runCollect(client.streamWithMeta())
    // Simulate what buildStream does: tap "done" items to accumulate keys
    for (const item of raw) {
      if ((item as any)._tag === "done") {
        const meta = (item as any).metadata as Invalidation.CommandMetaData
        yield* Effect.forEach(meta.invalidateQueries, svc.add, { discard: true })
      }
    }
    const keys = yield* Ref.get(keysRef)
    expect(keys).toStrictEqual([StreamKey])
  }, Effect.provide(StreamMetaTestLayer))
)

it.live(
  "stream: InvalidationKeysFromServer receives keys from 'done' chunk via buildStream-style tap",
  Effect.fnUntraced(function*() {
    const keysRef = yield* Ref.make<ReadonlyArray<Invalidation.InvalidationKey>>([])
    const invKeys = makeInvalidationKeysService(keysRef)
    const client = yield* RpcTest.makeClient(StreamMetaRpcs)
    // Replicate the buildStream processing pipeline: tap must run in the same fiber
    // context as the InvalidationKeysFromServer provider, so we use Effect.provideService
    // (fiber-level) rather than Stream.provideService (element-level) to ensure the
    // tap's Effect.use call resolves invKeys.
    const values = yield* client.streamWithMeta().pipe(
      Stream.tap((item: any) =>
        item._tag === "done"
          ? InvalidationKeysFromServer.use((s) =>
            Effect.forEach(
              (item.metadata as Invalidation.CommandMetaData).invalidateQueries,
              s.add,
              { discard: true }
            )
          )
          : Effect.void
      ),
      Stream.filter((item: any) => item._tag === "value"),
      Stream.map((item: any) => item.value),
      Stream.runCollect,
      Effect.provideService(InvalidationKeysFromServer, invKeys)
    )
    const keys = yield* Ref.get(keysRef)
    expect(values).toStrictEqual([1, 2, 3])
    expect(keys).toStrictEqual([StreamKey])
  }, Effect.provide(StreamMetaTestLayer))
)

// ---------------------------------------------------------------------------
// V2 tests — invalidation keys included in failures
// ---------------------------------------------------------------------------

it.live(
  "V2: command failure includes accumulated keys in CommandFailureWithMetaData",
  Effect.fnUntraced(function*() {
    const client = yield* RpcTest.makeClient(E2eRpcs)
    const exit = yield* Effect.exit(client.doAndFail())
    // Should fail with CommandFailureWithMetaData wrapping the original error
    if (exit._tag === "Success") throw new Error("Expected failure")
    const err = (exit.cause as any).reasons?.[0]?.error
    expect(err?._tag).toBe("CommandFailureWithMetaData")
    expect(err?.error).toStrictEqual({ message: "intentional failure" })
    expect(err?.metadata?.invalidateQueries).toStrictEqual([StaticKey, DynamicKey])
  }, Effect.provide(E2eTestLayer))
)

it.live(
  "V2: client unwraps CommandFailureWithMetaData — re-fails with original error and forwards keys",
  Effect.fnUntraced(function*() {
    const keysRef = yield* Ref.make<ReadonlyArray<Invalidation.InvalidationKey>>([])
    const svc = makeInvalidationKeysService(keysRef)
    const client = yield* RpcTest.makeClient(E2eRpcs)

    // Simulate apiClientFactory unwrapCommand: catch CommandFailureWithMetaData,
    // forward keys, re-fail with the original error.
    const exit = yield* Effect.exit(
      client.doAndFail().pipe(
        Effect.catch((err: any) =>
          err?._tag === "CommandFailureWithMetaData"
            ? Effect
              .forEach(
                (err.metadata?.invalidateQueries ?? []) as ReadonlyArray<Invalidation.InvalidationKey>,
                svc.add,
                { discard: true }
              )
              .pipe(Effect.flatMap(() => Effect.fail(err.error)))
            : Effect.fail(err)
        ),
        Effect.provideService(InvalidationKeysFromServer, svc)
      )
    )

    const keys = yield* Ref.get(keysRef)
    if (exit._tag === "Success") throw new Error("Expected failure")
    const originalErr = (exit.cause as any).reasons?.[0]?.error
    expect(originalErr).toStrictEqual({ message: "intentional failure" })
    expect(keys).toStrictEqual([StaticKey, DynamicKey])
  }, Effect.provide(E2eTestLayer))
)

const StreamMetaV2Rpcs = RpcGroup.make(
  // Stream with pre-wrapped failure chunk — simulates routing.ts V2 failure output
  Rpc
    .make("streamWithFailure", {
      success: Invalidation.StreamResponseChunk(S.Number),
      error: Invalidation.StreamFailureChunk(S.Struct({ msg: S.String })),
      stream: true
    })
    .annotate(RequestType, "query")
    .middleware(InvalidationMiddleware)
)

const StreamV2Key: Invalidation.InvalidationKey = ["stream-v2", "key"]

const StreamMetaV2ImplLayer = StreamMetaV2Rpcs.toLayer({
  // Emits two values then fails with a StreamFailureChunk — simulates routing.ts wrapping
  streamWithFailure: () =>
    Stream.concat(
      Stream.fromIterable([
        { _tag: "value" as const, value: 1 },
        { _tag: "value" as const, value: 2 }
      ]),
      Stream.fromEffect(
        Effect.fail({
          _tag: "error" as const,
          error: { msg: "stream error" },
          metadata: { invalidateQueries: [StreamV2Key] }
        })
      )
    )
})

const StreamMetaV2TestLayer = Layer.merge(StreamMetaV2ImplLayer, InvalidationMiddlewareLive)

it.live(
  "V2: stream failure chunk carries accumulated keys and original error",
  Effect.fnUntraced(function*() {
    const client = yield* RpcTest.makeClient(StreamMetaV2Rpcs)
    const chunks: Array<any> = []
    const exit = yield* Effect.exit(
      Stream.runForEach(client.streamWithFailure(), (item) =>
        Effect.sync(() => {
          chunks.push(item)
        }))
    )
    // Two value chunks should have been seen before the failure
    expect(chunks.map((c: any) => c.value)).toStrictEqual([1, 2])
    // The stream should fail with the StreamFailureChunk
    if (exit._tag === "Success") throw new Error("Expected failure")
    const err = (exit.cause as any).reasons?.[0]?.error
    expect(err?._tag).toBe("error")
    expect(err?.error).toStrictEqual({ msg: "stream error" })
    expect(err?.metadata?.invalidateQueries).toStrictEqual([StreamV2Key])
  }, Effect.provide(StreamMetaV2TestLayer))
)
