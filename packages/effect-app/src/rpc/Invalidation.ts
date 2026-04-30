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
