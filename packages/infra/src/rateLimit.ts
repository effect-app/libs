// /**
//  * Executes the specified effect, acquiring the specified number of permits
//  * immediately before the effect begins execution and releasing them
//  * delayed by duration after the effect completes execution, whether by success,
//  * failure, or interruption.
//  */
// export function withPermitsDuration(permits: number, duration: Duration) {
//   return (self: TSemaphore): <R, E, A>(effect: Effect.Effect<R, E, A>) => Effect.Effect<R, E, A> => {
//     return effect =>
//       Effect.uninterruptibleMask(
//         restore =>
//           restore(self.acquireN(permits).commit)
//             > restore(effect)
//               .ensuring(
//                 self.releaseN(permits)
//                   .commit
//                   .delay(duration)
//               )
//       )
//   }
// }

import { Array, type Duration, Effect, type NonEmptyArray } from "effect-app"
import { dual } from "effect-app/Function"
import type { Semaphore } from "effect/Semaphore"
import type { Concurrency } from "effect/Types"

/**
 * Executes the specified effect, acquiring the specified number of permits
 * immediately before the effect begins execution and releasing them
 * delayed by duration after the effect completes execution, whether by success,
 * failure, or interruption.
 */
export function SEM_withPermitsDuration(permits: number, duration: Duration.Duration) {
  return (self: Semaphore): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R> => {
    return <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.uninterruptibleMask(
        (restore) =>
          restore(self.take(permits))
            .pipe(Effect.andThen(
              restore(effect)
                .pipe(Effect.ensuring(
                  Effect.delay(self.release(permits), duration)
                ))
            ))
      )
  }
}

export interface BatchOptions {
  readonly concurrency?: Concurrency | undefined
}

export const batch: {
  <T, A, E, R, A2, E2, R2>(
    n: number,
    forEachItem: (item: T, iWithinBatch: number, batchI: number) => Effect.Effect<A, E, R>,
    forEachBatch: (a: NonEmptyArray<A>, i: number) => Effect.Effect<A2, E2, R2>,
    options?: BatchOptions
  ): (items: Iterable<T>) => Effect.Effect<Array<A2>, E | E2, R | R2>
  <T, A, E, R, A2, E2, R2>(
    items: Iterable<T>,
    n: number,
    forEachItem: (item: T, iWithinBatch: number, batchI: number) => Effect.Effect<A, E, R>,
    forEachBatch: (a: NonEmptyArray<A>, i: number) => Effect.Effect<A2, E2, R2>,
    options?: BatchOptions
  ): Effect.Effect<Array<A2>, E | E2, R | R2>
} = dual(
  (args) => typeof args[0] !== "number",
  <T, A, E, R, A2, E2, R2>(
    items: Iterable<T>,
    n: number,
    forEachItem: (item: T, iWithinBatch: number, batchI: number) => Effect.Effect<A, E, R>,
    forEachBatch: (a: NonEmptyArray<A>, i: number) => Effect.Effect<A2, E2, R2>,
    options?: BatchOptions
  ) =>
    Effect.forEach(
      Array.chunksOf(items, n),
      (_, i) =>
        Effect
          .forEach(_, (_, j) => forEachItem(_, j, i), { concurrency: "inherit" })
          .pipe(Effect.flatMap((_) => forEachBatch(_, i))),
      { concurrency: options?.concurrency }
    )
)

// export function rateLimit(
//   n: number,
//   d: DUR
// ) {
//   return <T>(items: Iterable<T>) =>
//     <R, E, A, R2, E2, A2>(
//       forEachItem: (i: T) => Effect.Effect<R, E, A>,
//       forEachBatch: (a: Chunk<A>) => Effect.Effect<R2, E2, A2>
//     ) =>
//       Stream.fromCollection(items)
//         .rechunk(n)
//         .throttleShape(n, d, () => n)
//         .mapChunksEffect(_ => _.forEachEffectPar(forEachItem).tap(forEachBatch))
//         .runCollect
// }

export function naiveRateLimit(
  n: number,
  d: Duration.Duration
) {
  return <T>(items: Iterable<T>) => (<R, E, A, R2, E2, A2>(
    forEachItem: (i: T) => Effect.Effect<A, E, R>,
    forEachBatch: (a: A[]) => Effect.Effect<A2, E2, R2>
  ) =>
    Effect.forEach(
      Array.chunksOf(items, n),
      (batch, i) =>
        ((i === 0)
          ? Effect.void
          : Effect.sleep(d))
          .pipe(Effect.andThen(
            Effect
              .forEach(batch, forEachItem, { concurrency: n })
              .pipe(Effect.flatMap(forEachBatch))
          ))
    ))
}
