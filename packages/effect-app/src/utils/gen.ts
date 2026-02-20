import { type Effect } from "effect/Effect"
import { type YieldWrap } from "effect/Utils"

export namespace EffectGenUtils {
  export type Success<EG> = EG extends Effect<infer A, infer _E, infer _R> ? A
    // there could be a case where the generator function does not yield anything, so we need to handle that
    : EG extends (..._: infer _3) => Generator<never, infer A, infer _2> ? A
    : EG extends (..._: infer _3) => Generator<YieldWrap<Effect<infer _, infer _E, infer _R>>, infer A, infer _2> ? A
    : never

  export type Error<EG> = EG extends Effect<infer _A, infer E, infer _R> ? E
    // there could be a case where the generator function does not yield anything, so we need to handle that
    : EG extends (..._: infer _3) => Generator<never, infer _A, infer _2> ? never
    : EG extends (..._: infer _3) => Generator<YieldWrap<Effect<infer _, infer E, infer _R>>, infer _A, infer _2> ? E
    : never

  export type Context<EG> = EG extends Effect<infer _A, infer _E, infer R> ? R
    // there could be a case where the generator function does not yield anything, so we need to handle that
    : EG extends (..._: infer _3) => Generator<never, infer _A, infer _2> ? never
    : EG extends (..._: infer _3) => Generator<YieldWrap<Effect<infer _, infer _E, infer R>>, infer _A, infer _2> ? R
    : never
}
