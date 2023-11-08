import type { Option } from "effect/Option"

export type _R<T extends Effect<any, any, any>> = [T] extends [
  Effect<infer R, any, any>
] ? R
  : never

export type _E<T extends Effect<any, any, any>> = [T] extends [
  Effect<any, infer E, any>
] ? E
  : never

/**
 * @tsplus fluent effect/data/Option encaseInEffect
 */
export function encaseMaybeInEffect_<E, A>(
  o: Option<A>,
  onError: LazyArg<E>
): Effect<never, E, A> {
  return o.match({ onNone: () => Effect.fail(onError()), onSome: Effect.succeed })
}

/**
 * @tsplus fluent effect/data/Option encaseInEither
 */
export function encaseMaybeEither_<E, A>(
  o: Option<A>,
  onError: LazyArg<E>
): Either<E, A> {
  return o.match({ onNone: () => Either.left(onError()), onSome: Either.right })
}

/**
 * @tsplus getter effect/io/Effect toNullable
 */
export function toNullable<R, E, A>(
  self: Effect<R, E, Option<A>>
) {
  return self.map((_) => _.getOrNull)
}

/**
 * @tsplus fluent effect/io/Effect scope
 */
export function scope<R, E, A, R2, E2, A2>(
  scopedEffect: Effect<R | Scope, E, A>,
  effect: Effect<R2, E2, A2>
): Effect<Exclude<R | R2, Scope>, E | E2, A2> {
  return scopedEffect.zipRight(effect).scoped
}

/**
 * @tsplus fluent effect/io/Effect flatMapScoped
 */
export function flatMapScoped<R, E, A, R2, E2, A2>(
  scopedEffect: Effect<R | Scope, E, A>,
  effect: (a: A) => Effect<R2, E2, A2>
): Effect<Exclude<R | R2, Scope>, E | E2, A2> {
  return scopedEffect.flatMap(effect).scoped
}

// /**
//  * @tsplus fluent effect/io/Effect withScoped
//  */
// export function withScoped<R, E, A, R2, E2, A2>(
//   effect: Effect<R2, E2, A2>,
//   scopedEffect: Effect<R | Scope, E, A>
// ): Effect<Exclude<R | R2, Scope>, E | E2, A2> {
//   return scopedEffect.zipRight(effect).scoped
// }

// /**
//  * @tsplus fluent effect/io/Effect withScoped
//  */
// export function withScopedFlatMap<R, E, A, R2, E2, A2>(
//   effect: (a: A) => Effect<R2, E2, A2>,
//   scopedEffect: Effect<R | Scope, E, A>
// ): Effect<Exclude<R | R2, Scope>, E | E2, A2> {
//   return scopedEffect.flatMap(effect).scoped
// }

/**
 * Recovers from all errors.
 *
 * @tsplus static effect/io/Effect.Ops catchAllMap
 * @tsplus pipeable effect/io/Effect catchAllMap
 */
export function catchAllMap<E, A2>(f: (e: E) => A2) {
  return <R, A>(self: Effect<R, E, A>): Effect<R, never, A2 | A> => self.catchAll((err) => Effect.sync(() => f(err)))
}

/**
 * Annotates each log in this effect with the specified log annotations.
 * @tsplus static effect/io/Effect.Ops annotateLogs
 */
export function annotateLogs(kvps: Record<string, string>) {
  return <R, E, A>(effect: Effect<R, E, A>): Effect<R, E, A> =>
    FiberRef
      .currentLogAnnotations
      .get
      .flatMap((annotations) =>
        Effect.suspend(() =>
          pipe(
            effect,
            FiberRef.currentLogAnnotations.locally(
              HashMap.fromIterable([...annotations, ...kvps.$$.entries])
            )
          )
        )
      )
}

/**
 * Annotates each log in this scope with the specified log annotation.
 *
 * @tsplus static effect/io/Effect.Ops annotateLogscoped
 */
export function annotateLogscoped(key: string, value: string) {
  return FiberRef
    .currentLogAnnotations
    .get
    .flatMap((annotations) =>
      Effect.suspend(() => FiberRef.currentLogAnnotations.locallyScoped(annotations.set(key, value)))
    )
}

/**
 * Annotates each log in this scope with the specified log annotations.
 *
 * @tsplus static effect/io/Effect.Ops annotateLogsScoped
 */
export function annotateLogsScoped(kvps: Record<string, string>) {
  return FiberRef
    .currentLogAnnotations
    .get
    .flatMap((annotations) =>
      Effect.suspend(() =>
        FiberRef.currentLogAnnotations.locallyScoped(HashMap.fromIterable([...annotations, ...kvps.$$.entries]))
      )
    )
}

/**
 * @tsplus fluent function flow
 */
export function flow<Args extends readonly any[], B, C>(f: (...args: Args) => B, g: (b: B) => C): (...args: Args) => C {
  return (...args) => g(f(...args))
}

/** @tsplus fluent effect/platform/Http/Client request */
export const client: {
  <A, B, C, R, E>(
    client: HttpClient<A, B, C>,
    req: Effect<R, E, ClientRequest>
  ): Effect<A | R, B | E, C>
  <A, B, C>(client: HttpClient<A, B, C>, req: ClientRequest): Effect<A, B, C>
} = (client: HttpClient<any, any, any>, req: Effect<any, any, ClientRequest> | ClientRequest) =>
  Effect.isEffect(req)
    ? req.flatMap(client)
    : client(req)
