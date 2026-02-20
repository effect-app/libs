/* eslint-disable @typescript-eslint/no-explicit-any */
import { Chunk, Effect, Either, Layer } from "effect"
import * as Context from "./Context.js"
import { tuple } from "./Function.js"

const S1 = Symbol()
const S2 = Symbol()
const W = Symbol()

export interface PureState<S, S2 = S> {
  readonly [S1]: (_: S) => void
  readonly [S2]: () => S2

  state: S2
}

export interface PureLog<W> {
  readonly [W]: () => W
  log: Chunk.Chunk<W>
}

export interface PureEnv<W, S, S2 = S> extends PureState<S, S2>, PureLog<W> {}

export interface PureEnvTest extends PureState<any>, PureLog<any> {}

class PureEnvBase<W, S, S2 = S> implements PureEnv<W, S, S2> {
  readonly [W]!: () => W
  readonly [S1]!: (_: S) => void
  readonly [S2]!: () => S2
  readonly state: S2
  readonly log: Chunk.Chunk<W>

  constructor(s: S2) {
    this.state = s
    this.log = Chunk.empty<W>()
  }
}

export function makePureEnv<W, S, S2 = S>(s: S2): PureEnv<W, S, S2> {
  return new PureEnvBase<W, S, S2>(s)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function unifyPureEnv<X extends PureEnv<any, any, any>>(
  self: X
): PureEnv<
  [X] extends [{ [W]: () => infer W }] ? W : never,
  [X] extends [{ [S1]: (_: infer S) => void }] ? S : never,
  [X] extends [{ [S2]: () => infer S2 }] ? S2 : never
> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return self
}

export type Pure<W, S, S2, R, E, A> = Effect.Effect<A, E, PureEnvEnv<W, S, S2> | R>

// type dsl<W, S, S2> = ProgramDSL<W, S, S2>

export function GMUA_<W, S, S2, GR, GE, GA, MR, ME, MA, UR, UE, UA>(
  get: Pure<W, S, S2, GR, GE, GA>,
  modify: (i: GA) => Pure<W, S, S2, MR, ME, readonly [GA, MA]>,
  update: (i: GA) => Pure<W, S, S2, UR, UE, UA>
): Pure<W, S, S2, GR | MR | UR, GE | ME | UE, MA> {
  return Effect.flatMap(get, modify).pipe(Effect.flatMap(([s, a]) => Effect.map(update(s), () => a)))
}

export function GMUA<W, S, S2, GA, MR, ME, MA>(modify: (i: GA) => Pure<W, S, S2, MR, ME, readonly [GA, MA]>) {
  return <GR, GE, UR, UE, UA>(
    get: Pure<W, S, S2, GR, GE, GA>,
    update: (i: GA) => Pure<W, S, S2, UR, UE, UA>
  ) => GMUA_(get, modify, update)
}

export function GMU_<W, S, S2, GR, GE, GA, MR, ME, UR, UE, UA>(
  get: Pure<W, S, S2, GR, GE, GA>,
  modify: (i: GA) => Pure<W, S, S2, MR, ME, GA>,
  update: (i: GA) => Pure<W, S, S2, UR, UE, UA>
): Pure<W, S, S2, GR | MR | UR, GE | ME | UE, UA> {
  return Effect.flatMap(get, modify).pipe(Effect.flatMap(update))
}

export function GMU<W, S, S2, GA, MR, ME>(modify: (i: GA) => Pure<W, S, S2, MR, ME, GA>) {
  return <GR, GE, UR, UE, UA>(
    get: Pure<W, S, S2, GR, GE, GA>,
    update: (i: GA) => Pure<W, S, S2, UR, UE, UA>
  ) => GMU_(get, modify, update)
}

const tagg = Context.GenericTag<{ env: PureEnv<never, unknown, never> }>("PureEnv")
function castTag<W, S, S2>() {
  return tagg as any as Context.Tag<PureEnvEnv<W, S, S2>, PureEnvEnv<W, S, S2>>
}

export const PureEnvEnv = Symbol()
export interface PureEnvEnv<W, S, S2> extends Context.ServiceTagged<typeof PureEnvEnv> {
  env: PureEnv<W, S, S2>
}

export function get<S>(): Pure<never, S, S, never, never, S> {
  return Effect.map(castTag<never, S, S>(), (_) => _.env.state)
}

export function set<S>(s: S): Pure<never, S, S, never, never, void> {
  return Effect.map(castTag<never, S, S>(), (_) => _.env.state = s)
}

export type PureLogT<W> = Pure<W, unknown, never, never, never, void>

export function log<W>(w: W): PureLogT<W> {
  return Effect.map(castTag<W, unknown, never>(), (_) => _.env.log = Chunk.append(_.env.log, w))
}

export function logMany<W>(w: Iterable<W>): PureLogT<W> {
  return Effect.map(castTag<W, unknown, never>(), (_) => _.env.log = Chunk.appendAll(_.env.log, Chunk.fromIterable(w)))
}

export function runAll<R, E, A, W3, S1, S3, S4 extends S1>(
  self: Effect.Effect<A, E, FixEnv<R, W3, S1, S3>>,
  s: S4
): Effect.Effect<
  readonly [Chunk.Chunk<W3>, Either.Either<readonly [S3, A], E>],
  never,
  Exclude<R, { env: PureEnv<W3, S1, S3> }>
> {
  const a = Effect
    .flatMap(self, (x) =>
      castTag<W3, S1, S3>()
        .pipe(
          Effect.flatMap(
            ({ env: _ }) => Effect.sync(() => ({ log: _.log, state: _.state })) //            Ref.get(_.log).flatMap(log => Ref.get(_.state).map(state => ({ log, state })))
          ),
          Effect.map(
            ({ log, state }) => tuple(log, Either.right(tuple(state, x)))
          )
        ))
    .pipe(Effect.catchAll((err) => Effect.map(tagg, (env) => tuple(env.env.log, Either.left(err)))))
  return Effect.provide(a, Layer.succeed(tagg, { env: makePureEnv<W3, S3, S4>(s) as any }) as any) as any
}

export function runResult<R, E, A, W3, S1, S3, S4 extends S1>(
  self: Effect.Effect<A, E, FixEnv<R, W3, S1, S3>>,
  s: S4
) {
  return Effect.map(runAll(self, s), ([log, r]) => tuple(log, Effect.map(r, ([s]) => s)))
}

export function runTerm<R, E, A, W3, S1, S3, S4 extends S1>(
  self: Effect.Effect<A, E, FixEnv<R, W3, S1, S3>>,
  s: S4
) {
  return Effect.flatMap(runAll(self, s), ([evts, r]) => Effect.map(r, ([s3, a]) => tuple(s3, Chunk.toArray(evts), a)))
}

export function runTermDiscard<R, E, A, W3, S1, S3, S4 extends S1>(
  self: Effect.Effect<A, E, FixEnv<R, W3, S1, S3>>,
  s: S4
) {
  return Effect.map(runTerm(self, s), ([s3, w3]) => tuple(s3, w3))
}

export function runA<R, E, A, W3, S1, S3, S4 extends S1>(
  self: Effect.Effect<A, E, FixEnv<R, W3, S1, S3>>,
  s: S4
) {
  return Effect.map(runAll(self, s), ([log, r]) => tuple(log, Effect.map(r, ([, a]) => a)))
}

export function modify<S2, A, S3>(
  mod: (s: S2) => readonly [S3, A]
): Effect.Effect<A, never, { env: PureEnv<never, S2, S3> }> {
  return Effect.map(castTag<never, S3, S2>(), (_) =>
    Effect.map(Effect.sync(() => mod(_.env.state)), ([s, a]) => {
      _.env.state = s as any
      return a
    })) as any
}

export function modifyM<W, R, E, A, S2, S3>(
  mod: (s: S2) => Effect.Effect<readonly [S3, A], E, FixEnv<R, W, S2, S3>>
): Effect.Effect<A, E, FixEnv<R, W, S2, S3>> {
  // return serviceWithEffect(_ => Ref.modifyM_(_.state, mod))
  return Effect.flatMap(
    castTag<W, S3, S2>(),
    (_) => Effect.map(mod(_.env.state), ([s, a]) => Effect.map(Effect.sync(() => _.env.state = s as any), () => a))
  ) as any
}

export function updateWith<S2, S3>(upd: (s: S2) => S3) {
  return modify((_: S2) => {
    const r = upd(_)
    return tuple(r, r)
  })
}

export function updateWithEffect<W, R, E, S2, S3>(
  upd: (s: S2, log: (evt: W) => PureLogT<W>) => Effect.Effect<S3, E, FixEnv<R, W, S2, S3>>
): Effect.Effect<S3, E, FixEnv<R, W, S2, S3>> {
  return modifyM((_: S2) => Effect.map(upd(_, log), (_) => tuple(_, _)))
}

export type FixEnv<R, W, S, S2> =
  | Exclude<R, PureEnvEnv<any, any, any>>
  | PureEnvEnv<W, S, S2>

// export function getMA<W, S, A>(self: (s: S) => A): Pure<W, S, never, never, A> {
//   return Effect.accessM((_: PureState<S>) => Ref.get(_.state).map(self))
// }

// export function getM<W, S, R, E, A>(self: (s: S) => Pure<W, S, R, E, A>): Pure<W, S, R, E, A> {
//   return Effect.accessM((_: PureState<S>) => Ref.get(_.state).flatMap(self))
// }

// export function getTM__<W, S, R, E, A>(self: (s: S) => Pure<W, S, R, E, A>) {
//   return (tag: Tag<PureEnv<W, S>>) => Effect.accessServiceM(tag)(_ => Ref.get(_.state).flatMap(self))
// }

// export function getTM_<W, S, R, E, A>(tag: Tag<PureEnv<W, S>>, self: (s: S) => Pure<W, S, R, E, A>) {
//   return Effect.accessServiceM(tag)(_ => Ref.get(_.state).flatMap(self))
// }

// export function getTM<W, S, R, E, A>(tag: Tag<PureEnv<W, S>>) {
//   const access = Effect.accessServiceM(tag)
//   return (self: (s: S) => Pure<W, S, R, E, A>) => access(_ => Ref.get(_.state).flatMap(self))
// }

// export function makeProgramDSL<W, S, S2 = S>(): ProgramDSL<W, S, S2> {
//   return makeDSL_<W,S, S2>()
// }

// function makeDSL_<W, S, S2 = S>() {
//   const tag = tagg as unknown as Tag<PureEnvEnv<W, S, S2>>
//   const get = Effect.serviceWithEffect(tag, _ => _.env.state.get)
//   function getM<R, E, A>(self: (s: S2) => Effect.Effect<R, E, A>) { return get.flatMap(self) }
//   function get_<A>(self: (s: S2) => A) { return get.map(self)}
//   function set(s: S2) {
//     return Effect.serviceWithEffect(tag, _ => _.env.state.set(s))
//   }
//   function log<W2>(w: W2): Effect.Effect<{
//     env: PureEnv<W | W2, never, never>;
// }, never, void> {
//     return Effect.serviceWithEffect(tag, _ => _.env.log.update(l => l.append(w as any))) as any
//   }

//   const baseDSL = {
//     get,
//     log,
//     set
//   }

//   function modify<A, S3>(mod: (s: S2) => readonly [S3, A]): Effect.Effect<{
//     env: PureEnv<W, S, S3>;
// }, never, A> {
//     return Effect.serviceWithEffect(tag, _ =>
//       _.env.state.get.map(_ => mod(_)).flatMap(([s, a]) => _.env.state.set(s as any ).map(() => a))
//     ) as any
//   }

//   function modifyM<R, E, A, S3>(mod: (s: S2) => Effect.Effect<R, E, readonly [S3, A]>): Effect.Effect<{
//     env: PureEnv<W, S, S3>;
// } | R, E, A> {
//     // return serviceWithEffect(_ => Ref.modifyM_(_.state, mod))
//     return Effect.serviceWithEffect(tag, _ =>
//       _.env.state.get.flatMap(_ => mod(_ as unknown as S2)).flatMap(([s, a]) => _.env.state.set(s as any).map(() => a))
//     ) as any
//   }

//   function update<S3>(upd: (s: S2) => S3) {
//     return modify(_ => tuple(upd(_), void 0 as void))
//   }

//   function updateM<R, E, S3>(upd: (s: S2) => Effect.Effect<R, E, S3>) {
//     return modifyM(_ => upd(_).map(_ => tuple(_, void 0 as void)))
//   }

//   const accessLog = Effect.serviceWithEffect(tag, _ => _.env.log.get)

//   function runAll<R, E, A, W3, S1, S3, S4 extends S1>(
//     self: Effect.Effect<FixEnv<R, W3, S1, S3>, E, A>,
//     s: S4
//   ): Effect.Effect<Exclude<R, { env: PureEnv<W3, S1, S3>}>, never, readonly [Chunk<W3>, Either.Either<E, readonly [S3, A]>]> {
//     return self.flatMap(x =>
//       Effect.serviceWithEffect(tag, ({ env: _ }) =>
//         Effect.all({ log: _.log.get, state: _.state.get })
//         //            Ref.get(_.log).flatMap(log => Ref.get(_.state).map(state => ({ log, state })))
//       ).map(
//         (
//           { log, state }
//         ) => tuple(log, Either.right(tuple(state, x)) as Either.Either<E, readonly [S3, A]>)
//       )
//     ).catchAll(
//       err =>
//         accessLog.map(log =>
//           tuple(log, Either.left(err) as Either.Either<E, readonly [S3, A]>)
//         )
//     ).provideService(tag, { env: makePureEnv<W3, S3, S4>(s) as any }) as any
//   }

//   function runResult<R, E, A, W3, S1, S3, S4 extends S1>(
//     self: Effect.Effect<FixEnv<R, W3, S1, S3>, E, A>,
//     s: S4
//   ) {
//     return runAll(self, s).map(([log, r]) => tuple(log, r.map(([s]) => s)))
//   }

//   function runA<R, E, A, W3, S1, S3, S4 extends S1>(
//     self: Effect.Effect<FixEnv<R, W3, S1, S3>, E, A>,
//     s: S4
//   ) {
//     return runAll(self, s).map(([log, r]) => tuple(log, r.map(([, a]) => a)))
//   }

//   return {
//     ...baseDSL,

//     getM,
//     get_,
//     accessLog,
//     runAll,
//     runA,
//     runResult,

//     modify,
//     modifyM,
//     update,
//     updateM
//   }
// }

// type dsl_<W,S, S2 = S> = ReturnType<typeof makeDSL_<W, S, S2>>

// export interface ProgramDSL<W, S, S2 = S> extends dsl_<W, S, S2> { }

// export function dslmodifyM<W, S, R, E, A>(dsl: ProgramDSL<W, S>, mod: (s: S, dsl: ProgramDSL<W, S>) => Effect.Effect<R, E, readonly [S, A]>) {
//     return dsl.modifyM(_ => mod(_, dsl))
// }

// export function dslmodify<W, S, A>(dsl: ProgramDSL<W, S>, mod: (s: S, dsl: ProgramDSL<W, S>) => readonly [S, A]) {
//     return dsl.modify(_ => mod(_, dsl))
// }

// export function dslupdateM<W, S, R, E, S2, S3>(dsl: ProgramDSL<W, S, S2>, upd: (s: S2, dsl: ProgramDSL<W, S, S2>) => Effect.Effect<R, E, S3>) {
//     return dsl.updateM(_ => upd(_, dsl))
// }

// export function dslupdate<W, S>(dsl: ProgramDSL<W, S>, upd: (s: S, dsl: ProgramDSL<W, S>) => S) {
//     return dsl.update(_ => upd(_, dsl))
// }

// export interface ZPure<out W, in S1, out S2, in R, out E, out A> {}

// export class ZPureImpl<out W, in S1, out S2, in R, out E, out A> implements ZPure<W, S1, S2, R, E, A> {
//   zipRight<W1, S3, R1, E1, B>(
//     f: ZPure<W1, S2, S3, R1, E1, B>
//   ): ZPure<W1 | W, S1, S3, R1 | R, E | E1, B> {
//     throw new Error("not implemented")
//   }

//   flatMap<W1, S3, R1, E1, B>(
//     f: (a: A) => ZPure<W1, S2, S3, R1, E1, B>
//   ): ZPure<W1 | W, S1, S3, R1 | R, E | E1, B> {
//     throw new Error("not implemented")

//   }
// }

// declare type Eff1 = Effect.Effect<PureEnv2<string, PrintingPickItem, PickItem>, never, void>

// function flatMap<R, R2, E, E2, A, A2, W, S, S2>(self: Effect.Effect<R| PureEnv2<W, S, S2>, E, A>, (s: S) => Effect.Effect<R2 | PureEnv2>) {
// }

// export interface PureEnv2<W, S, S2> extends PureState2<S, S2>, PureLog<W> {}

// const S1 = Symbol()
// const S2 = Symbol()
// const W = Symbol()
// export interface PureState2<S, S2> {
//   readonly [S1]: () => S
//   readonly [S2]: () => S2

//   readonly state: Ref<S>
// }

// const abc = Do($ => {
//   const s = $(Pure.get<{ a: 1 }>())
//   console.log(s)
//   // const a = $(Pure.log("hello"))
//   $(Pure.log("hallo" as const))
//   $(Pure.log("hello" as const))
//   $(Pure.log<"hallo" | "hello" | 5>(5))
// })

// declare const a: Effect.Effect<
//   | {
//     env: PureEnv<never, never, {
//       a: 1
//     }>
//   }
//   | { env: PureEnv<string, never, never> }
//   | { env: PureEnv<number, never, never> },
//   never,
//   never
// >
// type R = _R<typeof a>
// type Env<T> = T extends { env: infer rr } ? rr : never

// type RRRR = Env<R>

// const abcc = unifyPureEnv(
//   undefined as any as RRRR
// )
// const test = Pure.runAll(
//   abc,
//   { a: 1 }
// )
