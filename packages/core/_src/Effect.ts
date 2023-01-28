/* eslint-disable prefer-destructuring */
// eslint-disable-next-line @typescript-eslint/no-unused-vars

import * as Def from "@effect/io/Deferred"
import * as Eff from "@effect/io/Effect"
import * as Exit from "@effect/io/Exit"
import * as Fiber from "@effect/io/Fiber"
import * as Layer from "@effect/io/Layer"
import type { Option } from "@fp-ts/core/Option"
import { curry, flow, pipe } from "./Function.js"

export * from "@effect/io/Effect"

/**
 * @tsplus static effect/io/Deferred.Ops await
 * @tsplus getter effect/io/Deferred await
 */
export const await_ = Def.await

/**
 * @tsplus static effect/io/Effect.Ops unit
 */
export const unit = Eff.unit()

/**
 * @tsplus static effect/io/Exit.Ops unit
 */
export const ex_unit = Exit.unit()

/**
 * @tsplus static effect/io/Fiber.Ops unit
 */
export const fb_unit = Fiber.unit()

/**
 * @tsplus static effect/io/Effect.Ops flatMapEither
 */
export const flatMapEither = <E, A, A2>(ei: (a: A2) => Either<E, A>) => Eff.flatMap((a: A2) => Effect.fromEither(ei(a)))

/**
 * @macro traced
 * @tsplus fluent effect/io/Effect flatMapOpt
 */
export function flatMapOpt<R, E, A, R2, E2, A2>(
  self: Effect<R, E, Option<A>>,
  fm: (a: A) => Effect<R2, E2, A2>
): Effect<R | R2, E | E2, Option<A2>> {
  return self.flatMap(d =>
    d.match(
      () => Effect(Opt.none),
      _ => fm(_).map(Opt.some)
    )
  )
}

/**
 * @macro traced
 * @tsplus fluent effect/io/Effect tapOpt
 */
export function tapOpt<R, E, A, R2, E2, A2>(
  self: Effect<R, E, Option<A>>,
  fm: (a: A) => Effect<R2, E2, A2>
): Effect<R | R2, E | E2, Option<A>> {
  return self.flatMap(d =>
    d.match(
      () => Effect(Opt.none),
      _ => fm(_).map(() => Opt(_))
    )
  )
}

/**
 * @macro traced
 * @tsplus fluent effect/io/Effect zipRightOpt
 */
export function zipRightOpt<R, E, A, R2, E2, A2>(
  self: Effect<R, E, Option<A>>,
  fm: Effect<R2, E2, A2>
) {
  return self.flatMap(d =>
    d.match(
      () => Effect(Opt.none),
      _ => fm.map(() => Opt(_))
    )
  )
}

/**
 * @macro traced
 * @tsplus fluent effect/io/Effect mapOpt
 */
export function mapOpt<R, E, A, A2>(
  self: Effect<R, E, Option<A>>,
  fm: (a: A) => A2
): Effect<R, E, Option<A2>> {
  return self.map(d =>
    d.match(
      () => Opt.none,
      _ => Opt(fm(_))
    )
  )
}

export type Erase<R, K> = R & K extends K & infer R1 ? R1 : R

/**
 * @tsplus static effect/io/Effect.Ops tryCatchPromiseWithInterrupt
 */
export function tryCatchPromiseWithInterrupt<E, A>(
  promise: LazyArg<Promise<A>>,
  onReject: (reason: unknown) => E,
  canceller: () => void
): Effect<never, E, A> {
  return Effect.asyncInterruptEither(resolve => {
    promise()
      .then(x => pipe(x, Effect.succeed, resolve))
      .catch(x => pipe(x, onReject, Effect.fail, resolve))
    return Either.left(Effect(canceller))
  })
}

/**
 * @macro traced
 * @tsplus fluent effect/io/Effect tapBoth
 */
export const tapBoth_ = <R, E, A, R2, R3, E3>(
  self: Effect<R, E, A>,
  // official tapBoth has E2 instead of never
  f: (e: E) => Effect<R2, never, any>,
  g: (a: A) => Effect<R3, E3, any>
) => self.tapError(f).tap(g)
export const tapBoth = <E, A, R2, R3, E3>(
  // official tapBoth has E2 instead of never
  f: (e: E) => Effect<R2, never, any>,
  g: (a: A) => Effect<R3, E3, any>
) =>
<R>(self: Effect<R, E, A>) => tapBoth_(self, f, g)

/**
 * @macro traced
 * @tsplus fluent effect/io/Effect tapBothInclAbort
 */
export const tapBothInclAbort_ = <R, E, A, ER, EE, EA, SR, SE, SA>(
  self: Effect<R, E, A>,
  onError: (err: unknown) => Effect<ER, EE, EA>,
  onSuccess: (a: A) => Effect<SR, SE, SA>
) =>
  self.exit.flatMap(_ =>
    _.matchEffect(cause => {
      const firstError = getFirstError(cause)
      if (firstError) {
        return onError(firstError).flatMap(() => Effect.failCauseSync(() => cause))
      }
      return Effect.failCauseSync(() => cause)
    }, _ => Effect(_).tap(onSuccess))
  )

export function getFirstError<E>(cause: Cause<E>) {
  if (cause.isDie()) {
    const defects = cause.defects
    return defects.unsafeHead
  }
  if (cause.isFailure()) {
    const failures = cause.failures
    return failures.unsafeHead
  }
  return null
}

/**
 * @macro traced
 * @tsplus fluent effect/io/Effect tapErrorInclAbort
 */
export const tapErrorInclAbort_ = <R, E, A, ER, EE, EA>(
  self: Effect<R, E, A>,
  onError: (err: unknown) => Effect<ER, EE, EA>
) =>
  self.exit.flatMap(_ =>
    _.matchEffect(cause => {
      const firstError = getFirstError(cause)
      if (firstError) {
        return onError(firstError)
          .flatMap(() => Effect.failCauseSync(() => cause))
      }
      return Effect.failCauseSync(() => cause)
    }, Effect.succeed)
  )
export function encaseOpt_<E, A>(
  o: Option<A>,
  onError: LazyArg<E>
): Effect<never, E, A> {
  return o.match(() => Effect.fail(onError()), Effect.succeed)
}

export function encaseOpt<E>(onError: LazyArg<E>) {
  return <A>(o: Option<A>) => encaseOpt_<E, A>(o, onError)
}

export function liftM<A, B>(a: (a: A) => B) {
  return flow(a, Effect.succeed)
}

/**
 * Takes [A, B], applies it to a curried Effect function,
 * taps the Effect, returning A.
 */
export function tupleTap<A, B, R, E, C>(
  f: (b: B) => (a: A) => Effect<R, E, C>
) {
  return (t: readonly [A, B]) => Effect(t[0]).tap(f(t[1]))
}

/**
 * Takes [A, B], applies it to an Effect function,
 * taps the Effect, returning A.
 */
export function tupleTap_<A, B, R, E, C>(f: (a: A, b: B) => Effect<R, E, C>) {
  return tupleTap(curry(f))
}

export function ifDiffR<I, R, E, A>(f: (i: I) => Effect<R, E, A>) {
  return (n: I, orig: I) => ifDiff_(n, orig, f)
}

export function ifDiff_<I, R, E, A>(
  n: I,
  orig: I,
  f: (i: I) => Effect<R, E, A>
) {
  return n !== orig ? f(n) : Effect.unit
}

export const tapBothInclAbort = <A, ER, EE, EA, SR, SE, SA>(
  onError: (err: unknown) => Effect<ER, EE, EA>,
  onSuccess: (a: A) => Effect<SR, SE, SA>
) =>
<R, E>(eff: Effect<R, E, A>) => tapBothInclAbort_(eff, onError, onSuccess)

export const tapErrorInclAbort =
  <A, ER, EE, EA>(onError: (err: unknown) => Effect<ER, EE, EA>) => <R, E>(eff: Effect<R, E, A>) =>
    tapErrorInclAbort_(eff, onError)

export function ifDiff<I, R, E, A>(n: I, orig: I) {
  return (f: (i: I) => Effect<R, E, A>) => ifDiff_(n, orig, f)
}

/**
 * @tsplus static effect/io/Layer.Ops effect
 */
export const LayerFromEffect = Layer.effect

/**
 * @tsplus pipeable effect/io/Effect provideSomeContextReal
 */
export const provideSomeContextReal = <A2>(
  ctx: Context<A2>
) =>
<R, E, A>(self: Effect<R | A2, E, A>): Effect<Exclude<R, A2>, E, A> =>
  (self as Effect<A2, E, A>).contramapContext((_: Context<never>) => _.merge(ctx))

/**
 * @tsplus pipeable effect/io/Effect provideSomeContextEffect
 */
export const provideSomeContextEffect = <R2, E2, A2>(
  makeCtx: Effect<R2, E2, Context<A2>>
) =>
<R, E, A>(self: Effect<R | A2, E, A>): Effect<R2 | Exclude<R, A2>, E2 | E, A> =>
  makeCtx.flatMap(ctx => (self as Effect<A2, E, A>).contramapContext((_: Context<never>) => _.merge(ctx)))

/**
 * @tsplus fluent effect/io/Effect toLayer
 */
export function toLayer<R, E, A>(self: Effect<R, E, A>, tag: Tag<A>) {
  return Layer.effect(tag, self)
}

/**
 * @tsplus fluent effect/io/Effect toScopedLayer
 */
export function toScopedLayer<R, E, A>(self: Effect<R, E, A>, tag: Tag<A>) {
  return Layer.scoped(tag, self)
}

/**
 * @tsplus getter effect/io/Effect toScopedDiscardLayer
 */
export function toScopedDiscardLayer<R, E, A>(self: Effect<R, E, A>) {
  return Layer.scopedDiscard(self)
}

/**
 * @tsplus pipeable-operator effect/io/Effect >
 */
export const EffectZipRight: <R2, E2, A2>(
  that: Effect<R2, E2, A2>
) => <R, E, A>(self: Effect<R, E, A>) => Effect<R2 | R, E2 | E, A2> = Eff.zipRight

/**
 * @tsplus pipeable-operator effect/io/Effect <
 */
export const EffectZipLeft: <R2, E2, A2>(
  that: Eff.Effect<R2, E2, A2>
) => <R, E, A>(self: Eff.Effect<R, E, A>) => Eff.Effect<R2 | R, E2 | E, A> = Eff.zipLeft

/**
 * @tsplus pipeable-operator effect/io/Effect &
 */
export const EffectZipPar: <R2, E2, A2>(
  that: Eff.Effect<R2, E2, A2>
) => <R, E, A>(self: Eff.Effect<R, E, A>) => Eff.Effect<R2 | R, E2 | E, readonly [A, A2]> = Eff.zipPar

/**
 * @tsplus pipeable-operator effect/io/Effect +
 */
export const EffectZip: <R2, E2, A2>(
  that: Eff.Effect<R2, E2, A2>
) => <R, E, A>(self: Eff.Effect<R, E, A>) => Eff.Effect<R2 | R, E2 | E, readonly [A, A2]> = Eff.zip

/**
 * @tsplus pipeable-operator effect/io/Effect |
 */
export const EffectOrElse: <R2, E2, A2>(
  that: LazyArg<Eff.Effect<R2, E2, A2>>
) => <R, E, A>(self: Eff.Effect<R, E, A>) => Eff.Effect<R2 | R, E2, A2 | A> = Eff.orElse

/**
 * @tsplus pipeable-operator effect/io/Layer |
 */
export const LayerOrElse: <R2, E2, A2>(
  that: LazyArg<Layer.Layer<R2, E2, A2>>
) => <R, E, A>(self: Layer.Layer<R, E, A>) => Layer.Layer<R2 | R, E2 | E, A & A2> = Layer.orElse

/**
 * @tsplus pipeable-operator effect/io/Layer +
 */
export const LayerMerge: <RIn2, E2, ROut2>(
  that: Layer.Layer<RIn2, E2, ROut2>
) => <RIn, E, ROut>(self: Layer.Layer<RIn, E, ROut>) => Layer.Layer<RIn2 | RIn, E2 | E, ROut2 | ROut> = Layer.merge

/**
 * @tsplus pipeable-operator effect/io/Layer >>
 */
export const LayerProvide: <RIn2, E2, ROut2>(
  that: Layer.Layer<RIn2, E2, ROut2>
) => <RIn, E, ROut>(
  self: Layer.Layer<RIn, E, ROut>
) => Layer.Layer<RIn | globalThis.Exclude<RIn2, ROut>, E2 | E, ROut2> = Layer.provide

/**
 * @tsplus pipeable-operator effect/io/Layer >
 */
export const LayerProvideMerge: <RIn2, E2, ROut2>(
  that: Layer.Layer<RIn2, E2, ROut2>
) => <RIn, E, ROut>(self: Layer.Layer<RIn, E, ROut>) => Layer.Layer<RIn | Exclude<RIn2, ROut>, E2 | E, ROut2 | ROut> =
  Layer.provideMerge

/**
 * Ref has atomic modify support if synchronous, for Effect we need a Semaphore.
 * @tsplus fluent effect/io/Ref modifyWithEffect
 */
export function modifyWithPermitWithEffect<A>(ref: Ref<A>, semaphore: Semaphore) {
  const withPermit = semaphore.withPermits(1)
  return <R, E, A2>(mod: (a: A) => Effect<R, E, readonly [A2, A]>) =>
    withPermit(
      ref.get
        .flatMap(mod)
        .tap(([, _]) => ref.set(_))
        .map(([_]) => _)
    )
}
