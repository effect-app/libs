import * as Ref from "effect/Ref"
import { Rpc, RpcSchema } from "effect/unstable/rpc"
import * as Context from "../Context.js"
import * as Effect from "../Effect.js"
import * as S from "../Schema.js"

/**
 * A single segment within an `InvalidationKey` array.
 * Accepts any JSON-compatible value: string, number, boolean, null,
 * arrays and objects recursively — matching TanStack Query's `queryKey` element type.
 */
export const InvalidationKeySegment = S.Json
export type InvalidationKeySegment = S.Schema.Type<typeof InvalidationKeySegment>

/** Schema for a single invalidation key – an array of segments compatible with TanStack Query `queryKey`. */
export const InvalidationKey = S.Array(InvalidationKeySegment)
export type InvalidationKey = S.Schema.Type<typeof InvalidationKey>

/** Schema for the full set of invalidation keys – an array of `InvalidationKey`. */
export const InvalidationKeys = S.Array(InvalidationKey)
export type InvalidationKeys = S.Schema.Type<typeof InvalidationKeys>

/** Metadata included in every command response for server-driven cache invalidation. */
export const CommandMetaData = S.Struct({ invalidateQueries: InvalidationKeys })
export type CommandMetaData = S.Schema.Type<typeof CommandMetaData>

/**
 * Wraps a command's success schema so that the wire format carries both the `payload`
 * (the handler's actual return value) and `metadata` (server-driven cache invalidation keys).
 * Transparent to users: the server handler returns the plain payload and the client receives
 * the plain payload — wrapping/unwrapping is handled internally by the routing layer.
 */
export const CommandResponseWithMetaData = <S extends S.Top>(success: S) =>
  S.Struct({ payload: success, metadata: CommandMetaData })

/**
 * Wraps a command's failure schema so that the wire format carries both the `error`
 * (the handler's actual failure value) and `metadata` (server-driven cache invalidation keys
 * accumulated thus far before the failure occurred).
 * Transparent to users: the server handler fails with the plain error and the client receives
 * the plain error — wrapping/unwrapping is handled internally by the routing layer.
 */
export const CommandFailureWithMetaData = <E extends S.Top>(error: E) =>
  S.Struct({ _tag: S.Literal("CommandFailureWithMetaData"), error, metadata: CommandMetaData })

/**
 * Stream chunk schema for stream responses with metadata.
 * Each item is either a data value, an intermediate "metadata" signal carrying cache
 * invalidation keys accumulated since the previous drain, or a final "done" signal.
 * Transparent to users: stream handlers return plain values and clients receive plain values —
 * wrapping/unwrapping is handled internally by the routing layer.
 *
 * The "done" chunk is always the last item in the stream and carries any remaining invalidation
 * keys. An optional "metadata" chunk may appear after any "value" chunk and carries keys
 * accumulated since the last drain (V3: mid-stream invalidation).
 */
export const StreamResponseChunk = <S extends S.Top>(success: S) =>
  S.Union([
    S.Struct({ _tag: S.Literal("value"), value: success }),
    S.Struct({ _tag: S.Literal("metadata"), metadata: CommandMetaData }),
    S.Struct({ _tag: S.Literal("done"), metadata: CommandMetaData })
  ])

export type StreamResponseChunk<A> =
  | { readonly _tag: "value"; readonly value: A }
  | { readonly _tag: "metadata"; readonly metadata: CommandMetaData }
  | { readonly _tag: "done"; readonly metadata: CommandMetaData }

/**
 * Stream chunk schema for stream failures with metadata.
 * Used to signal a stream failure while still carrying cache invalidation keys
 * accumulated thus far.
 */
export const StreamFailureChunk = <E extends S.Top>(error: E) =>
  S.Struct({ _tag: S.Literal("error"), error, metadata: CommandMetaData })

export type StreamFailureChunk<E> = { readonly _tag: "error"; readonly error: E; readonly metadata: CommandMetaData }

/**
 * Context annotation for declaring static cache invalidation keys on a low-level `Rpc` definition.
 * These keys are always included in the command response metadata, regardless of the handler logic.
 *
 * Prefer using `makeQueryKey` over raw string arrays to stay in sync with the actual query
 * definitions without manual string maintenance:
 *
 * ```ts
 * import { makeQueryKey } from "effect-app/client"
 * import { Invalidation } from "effect-app/rpc"
 * import * as UserRsc from "../User/index.js"  // separate module to avoid circular deps
 *
 * class UpdateProfile extends Rpc.make("UpdateProfile", { ... })
 *   .annotate(Invalidation.Invalidates, [makeQueryKey(UserRsc.GetMe), makeQueryKey(UserRsc.GetProfile)]) {}
 * ```
 *
 * **Circular dependency note:** if mutations and queries live in the same file you may hit a
 * circular reference at evaluation time. The idiomatic fix is to move mutations into their own
 * module (e.g. `User/mutations.ts`) that directly imports the relevant query classes rather than
 * re-exporting them through a barrel.
 *
 * For the higher-level `Command`/`Query` builders from `makeRpcClient`, use the
 * `invalidatesQueries` callback argument instead (it receives the same query keys at runtime).
 */
export const Invalidates = Context.Reference<ReadonlyArray<InvalidationKey>>(
  "effect-app/rpc/Invalidates",
  { defaultValue: () => [] }
)
export type Invalidates = typeof Invalidates

/** The shape of the per-request service that accumulates invalidation keys. */
export interface InvalidationSetService {
  readonly add: (key: InvalidationKey) => Effect.Effect<void>
  readonly get: Effect.Effect<ReadonlyArray<InvalidationKey>>
  /**
   * V3: Reads all currently accumulated keys and resets the bucket to empty.
   * Used by the stream routing layer to emit intermediate "metadata" chunks
   * without re-sending keys that have already been forwarded to the client.
   */
  readonly drain: Effect.Effect<ReadonlyArray<InvalidationKey>>
}

/**
 * Request-scoped service for accumulating invalidation keys dynamically inside a handler.
 * Provided by `InvalidationMiddlewareLive` for every RPC call; has a no-op default so it is
 * safe to use even when the HTTP middleware is absent (tests, workers, etc.).
 *
 * Use `InvalidationSet.use(_ => _.add(key))` (or `.useSync` for non-Effect callbacks) as a
 * shorthand instead of yielding the service manually.
 *
 * Prefer `makeQueryKey` over raw string arrays so invalidation keys stay in sync with the
 * actual query definitions automatically:
 *
 * ```ts
 * import { makeQueryKey } from "effect-app/client"
 * import { Effect } from "effect"
 * import { Invalidation } from "effect-app/rpc"
 * import * as CartRsc from "../Cart/queries.js"
 * import * as UserRsc from "../User/queries.js"
 *
 * const handler = Effect.fnUntraced(function*(req: UpdateCartRequest) {
 *   const cart = yield* CartRepo.save(req.cart)
 *
 *   // Stage 1 – unconditional: always invalidate after saving
 *   yield* Invalidation.InvalidationSet.use(_ => _.add(makeQueryKey(UserRsc.GetMe)))
 *
 *   // Stage 2 – conditional: only if the cart changed state
 *   if (cart.isCheckedOut) {
 *     yield* Invalidation.InvalidationSet.use(_ => _.add(makeQueryKey(CartRsc.GetCartStats)))
 *   }
 *
 *   return cart
 * })
 * ```
 *
 * You can combine static (`Invalidates` annotation) and dynamic (`InvalidationSet.use`) keys:
 * the annotation pre-populates the set before the handler runs; dynamic additions accumulate
 * throughout the handler. All keys are included in the command response metadata.
 */
export const InvalidationSet = Context.Reference<InvalidationSetService>(
  "effect-app/rpc/InvalidationSet",
  {
    defaultValue: () => ({
      add: (_key: InvalidationKey) => Effect.void,
      get: Effect.succeed([] as ReadonlyArray<InvalidationKey>),
      drain: Effect.succeed([] as ReadonlyArray<InvalidationKey>)
    })
  }
)
export type InvalidationSet = typeof InvalidationSet

/** Creates a fresh `InvalidationSet` implementation backed by a `Ref`. */
export const makeInvalidationSet = (ref: Ref.Ref<ReadonlyArray<InvalidationKey>>): InvalidationSetService => ({
  add: (key) => Ref.update(ref, (keys) => [...keys, key]),
  get: Ref.get(ref),
  drain: Ref.getAndSet(ref, [])
})

/**
 * `Rpc.Custom` definition for command RPCs that wrap the success/error schemas
 * with `CommandResponseWithMetaData` / `CommandFailureWithMetaData`.
 */
// eslint-disable-next-line import/namespace
export interface CommandRpc extends Rpc.Custom {
  readonly out: Rpc.Custom.Out<
    ReturnType<typeof CommandResponseWithMetaData<this["success"] & S.Top>>,
    ReturnType<typeof CommandFailureWithMetaData<this["error"] & S.Top>>
  >
}

/**
 * Custom Rpc constructor for command RPCs.
 * Wraps the success schema with `CommandResponseWithMetaData` and
 * the error schema with `CommandFailureWithMetaData`.
 */
export const makeCommandRpc = Rpc.custom<CommandRpc>(({ defect, error, success }) => ({
  success: CommandResponseWithMetaData(success),
  error: CommandFailureWithMetaData(error),
  defect
}))

/**
 * `Rpc.Custom` definition for stream RPCs that wrap the success/error schemas
 * with `StreamResponseChunk` / `StreamFailureChunk`.
 *
 * The success schema is wrapped in `RpcSchema.Stream` so the RPC framework
 * recognises it as a streaming endpoint. The error schema is kept as the raw
 * user-provided error (not `Schema.Never`) so that outer failures — in
 * particular middleware failures that happen before the stream starts — can
 * still be encoded on the server and decoded on the client.  Stream-level
 * failures are embedded as `StreamFailureChunk` items inside the stream.
 */
// eslint-disable-next-line import/namespace
export interface StreamRpc extends Rpc.Custom {
  readonly out: Rpc.Custom.Out<
    // eslint-disable-next-line import/namespace
    RpcSchema.Stream<
      ReturnType<typeof StreamResponseChunk<this["success"] & S.Top>>,
      ReturnType<typeof StreamFailureChunk<this["error"] & S.Top>>
    >,
    this["error"] & S.Top
  >
}

/**
 * Custom Rpc constructor for stream RPCs.
 * Wraps the success schema in `RpcSchema.Stream(StreamResponseChunk, StreamFailureChunk)`.
 * Keeps the error schema as the raw user-provided error so middleware failures
 * (outer Effect failures) are encodeable/decodeable alongside stream failures.
 */
export const makeStreamRpc = Rpc.custom<StreamRpc>(({ defect, error, success }) => ({
  success: RpcSchema.Stream(StreamResponseChunk(success), StreamFailureChunk(error)),
  error,
  defect
}))
