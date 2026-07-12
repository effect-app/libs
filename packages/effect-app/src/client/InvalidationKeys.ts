import * as Equal from "effect/Equal"
import * as Ref from "effect/Ref"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import type { InvalidationKey } from "../rpc/Invalidation.ts"

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
 * @param onAdded - V3: Optional Effect run after a distinct key is added. Use to trigger
 *   mid-stream query invalidation without waiting for the stream to complete. Repeated keys
 *   stay accumulated for the final refresh but do not retrigger the callback.
 */
export const makeInvalidationKeysService = (
  ref: Ref.Ref<ReadonlyArray<InvalidationKey>>,
  onAdded?: (key: InvalidationKey) => Effect.Effect<void>
): InvalidationKeysService => ({
  add: (key) =>
    Ref
      .modify(ref, (keys) => {
        if (keys.some((existing) => Equal.equals(existing, key))) return [false, keys]
        return [true, [...keys, key]]
      })
      .pipe(
        Effect.flatMap((added) => added && onAdded ? onAdded(key) : Effect.void)
      ),
  get: Ref.get(ref)
})
