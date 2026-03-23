import { type Effect, type Yieldable } from "effect/Effect"

export namespace EffectGenUtils {
  export type Success<EG> = EG extends Effect<infer A, infer _E, infer _R> ? A
    // there could be a case where the generator function does not yield anything, so we need to handle that
    : EG extends (..._: infer _3) => Generator<never, infer A, infer _2> ? A
    // v4: generators can yield Yieldable (Effect, Service, etc.), all have asEffect()
    : EG extends (..._: infer _3) => Generator<Yieldable<any, infer _, infer _E, infer _R>, infer A, infer _2> ? A
    : never

  export type Error<EG> = EG extends Effect<infer _A, infer E, infer _R> ? E
    // there could be a case where the generator function does not yield anything, so we need to handle that
    : EG extends (..._: infer _3) => Generator<never, infer _A, infer _2> ? never
    // v4: generators can yield Yieldable (Effect, Service, etc.), all have asEffect()
    : EG extends (..._: infer _3) => Generator<Yieldable<any, infer _, infer E, infer _R>, infer _A, infer _2> ? E
    : never

  export type ServiceMap<EG> = EG extends Effect<infer _A, infer _E, infer R> ? R
    // there could be a case where the generator function does not yield anything, so we need to handle that
    : EG extends (..._: infer _3) => Generator<never, infer _A, infer _2> ? never
    // v4: generators can yield Yieldable (Effect, Service, etc.), all have asEffect()
    : EG extends (..._: infer _3) => Generator<Yieldable<any, infer _, infer _E, infer R>, infer _A, infer _2> ? R
    : never
}
