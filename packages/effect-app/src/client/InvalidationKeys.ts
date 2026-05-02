import * as Ref from "effect/Ref"
import * as Context from "../Context.js"
import * as Effect from "../Effect.js"
import type { InvalidationKey } from "../rpc/Invalidation.js"

export type { InvalidationKey }
/** Shape of the per-mutation service that accumulates server-provided invalidation keys. */
export interface InvalidationKeysService {
  readonly add: (key: InvalidationKey) => Effect.Effect<void>
  readonly get: Effect.Effect<ReadonlyArray<InvalidationKey>>
}

/**
 * Context.Reference that accumulates invalidation keys received from the server via the
 * `x-invalidate` HTTP response header.
 *
 * The default is a no-op: when not explicitly provided (e.g. outside a mutation wrapper)
 * all calls are ignored. The mutation wrapper in `@effect-app/vue` provides a real
 * implementation backed by a `Ref`.
 */
export const InvalidationKeysFromServer = Context.Reference<InvalidationKeysService>(
  "effect-app/client/InvalidationKeysFromServer",
  {
    defaultValue: () => ({
      add: (_key: InvalidationKey) => Effect.void,
      get: Effect.succeed([] as ReadonlyArray<InvalidationKey>)
    })
  }
)
export type InvalidationKeysFromServer = typeof InvalidationKeysFromServer

/**
 * Creates a fresh `InvalidationKeysService` implementation backed by a `Ref`.
 *
 * @param ref - The `Ref` that stores the accumulated keys.
 * @param onAdded - V3: Optional Effect run after a key is added. Use to trigger mid-stream
 *   query invalidation without waiting for the stream to complete.
 */
export const makeInvalidationKeysService = (
  ref: Ref.Ref<ReadonlyArray<InvalidationKey>>,
  onAdded?: (key: InvalidationKey) => Effect.Effect<void>
): InvalidationKeysService => ({
  // When onAdded is set, fire it immediately without accumulating in the ref —
  // the key is handled on arrival and must not be re-processed at stream end.
  add: (key) =>
    onAdded
      ? onAdded(key)
      : Ref.update(ref, (keys) => [...keys, key]),
  get: Ref.get(ref)
})
