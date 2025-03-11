// /**
//  * Executes the specified effect, acquiring the specified number of permits
//  * immediately before the effect begins execution and releasing them
//  * delayed by duration after the effect completes execution, whether by success,
//  * failure, or interruption.
//  */
// export function withPermitsDuration(permits: number, duration: Duration) {
//   return (self: TSemaphore): <R, E, A>(effect: Effect<R, E, A>) => Effect<R, E, A> => {
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
import type { Semaphore } from "effect-app/Effect"

/**
 * Executes the specified effect, acquiring the specified number of permits
 * immediately before the effect begins execution and releasing them
 * delayed by duration after the effect completes execution, whether by success,
 * failure, or interruption.
 */
export function SEM_withPermitsDuration(permits: number, duration: Duration) {
  return (self: Semaphore): <R, E, A>(effect: Effect<A, E, R>) => Effect<A, E, R> => {
    return (effect) =>
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

export function batchPar<R, E, A, R2, E2, A2, T>(
  n: number,
  forEachItem: (item: T, iWithinBatch: number, batchI: number) => Effect<A, E, R>,
  forEachBatch: (a: NonEmptyArray<A>, i: number) => Effect<A2, E2, R2>
) {
  return (items: Iterable<T>) =>
    Effect.forEach(
      Array.chunk_(items, n),
      (_, i) =>
        Effect
          .forEach(_, (_, j) => forEachItem(_, j, i), { concurrency: "inherit" })
          .pipe(Effect.flatMap((_) => forEachBatch(_ as NonEmptyArray<A>, i))),
      { concurrency: "inherit" }
    )
}

export function batch<R, E, A, R2, E2, A2, T>(
  n: number,
  forEachItem: (item: T, iWithinBatch: number, batchI: number) => Effect<A, E, R>,
  forEachBatch: (a: NonEmptyArray<A>, i: number) => Effect<A2, E2, R2>
) {
  return (items: Iterable<T>) =>
    Effect.forEach(
      Array.chunk_(items, n),
      (_, i) =>
        Effect
          .forEach(_, (_, j) => forEachItem(_, j, i), { concurrency: "inherit" })
          .pipe(Effect.flatMap((_) => forEachBatch(_ as NonEmptyArray<A>, i)))
    )
}

// export function rateLimit(
//   n: number,
//   d: DUR
// ) {
//   return <T>(items: Iterable<T>) =>
//     <R, E, A, R2, E2, A2>(
//       forEachItem: (i: T) => Effect<R, E, A>,
//       forEachBatch: (a: Chunk<A>) => Effect<R2, E2, A2>
//     ) =>
//       Stream.fromCollection(items)
//         .rechunk(n)
//         .throttleShape(n, d, () => n)
//         .mapChunksEffect(_ => _.forEachEffectPar(forEachItem).tap(forEachBatch))
//         .runCollect
// }

export function naiveRateLimit(
  n: number,
  d: Duration
) {
  return <T>(items: Iterable<T>) => (<R, E, A, R2, E2, A2>(
    forEachItem: (i: T) => Effect<A, E, R>,
    forEachBatch: (a: A[]) => Effect<A2, E2, R2>
  ) =>
    Effect.forEach(
      Array.chunk_(items, n),
      (batch, i) =>
        ((i === 0)
          ? Effect.void
          : Effect.sleep(d))
          .pipe(Effect.zipRight(
            Effect
              .forEach(batch, forEachItem, { concurrency: n })
              .pipe(Effect.flatMap(forEachBatch))
          ))
    ))
}
