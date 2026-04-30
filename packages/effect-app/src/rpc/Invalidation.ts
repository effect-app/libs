import * as Ref from "effect/Ref"
import * as Context from "../Context.js"
import * as Effect from "../Effect.js"
import * as S from "../Schema.js"

/** Schema for a single invalidation key – an array of strings matching the shape returned by `makeQueryKey`. */
export const InvalidationKey = S.Array(S.String)
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
 * Context annotation for declaring static cache invalidation keys on an Rpc definition.
 * These keys are always included in the command response metadata, regardless of the handler logic.
 *
 * @example
 * ```ts
 * import { Rpc } from "effect/unstable/rpc"
 * import { Invalidation } from "effect-app/rpc"
 *
 * // Statically declare which queries to invalidate whenever this command runs:
 * class UpdateProfile extends Rpc.make("UpdateProfile", { ... })
 *   .annotate(Invalidation.Invalidates, [["$User", "GetMe"], ["$User", "GetProfile"]]) {}
 * ```
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
}

/**
 * Request-scoped service for accumulating invalidation keys dynamically inside a handler.
 * Provided by `InvalidationMiddlewareLive` for every RPC call; has a no-op default so it is
 * safe to use even when the HTTP middleware is absent (tests, workers, etc.).
 *
 * @example
 * ```ts
 * import { Effect } from "effect"
 * import { Invalidation } from "effect-app/rpc"
 *
 * // In a controller, add invalidation keys based on runtime logic:
 * const handler = Effect.fnUntraced(function*(req: UpdateCartRequest) {
 *   // ... perform the command ...
 *   const updatedCart = yield* CartRepo.save(req.cart)
 *
 *   // Stage 1 – add a key after a specific operation:
 *   const invalidation = yield* Invalidation.InvalidationSet
 *   yield* invalidation.add(["$Cart", "GetCart", req.userId])
 *
 *   // Stage 2 – conditionally add more keys:
 *   if (updatedCart.isCheckedOut) {
 *     yield* invalidation.add(["$Cart", "GetCartStats"])
 *   }
 *
 *   return updatedCart
 * })
 * ```
 *
 * You can combine static (`Invalidates` annotation) and dynamic (`InvalidationSet.add`) keys:
 * the annotation pre-populates the set before the handler runs; dynamic additions accumulate
 * throughout the handler. All keys are included in the command response metadata.
 */
export const InvalidationSet = Context.Reference<InvalidationSetService>(
  "effect-app/rpc/InvalidationSet",
  {
    defaultValue: () => ({
      add: (_key: InvalidationKey) => Effect.void,
      get: Effect.succeed([] as ReadonlyArray<InvalidationKey>)
    })
  }
)
export type InvalidationSet = typeof InvalidationSet

/** Creates a fresh `InvalidationSet` implementation backed by a `Ref`. */
export const makeInvalidationSet = (ref: Ref.Ref<ReadonlyArray<InvalidationKey>>): InvalidationSetService => ({
  add: (key) => Ref.update(ref, (keys) => [...keys, key]),
  get: Ref.get(ref)
})
