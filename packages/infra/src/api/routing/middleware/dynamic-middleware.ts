/* eslint-disable @typescript-eslint/no-explicit-any */
import { Array, Context, Effect, Option, type S } from "effect-app"
import { type GetEffectContext, type RPCContextMap } from "effect-app/client"
import { type Tag } from "effect-app/Context"
import { typedValuesOf } from "effect-app/utils"
import { InfraLogger } from "../../../logger.js"
import { type ContextTagWithDefault } from "../../layerUtils.js"
import { sort } from "../tsort.js"

export type ContextWithLayer<
  Config,
  Id,
  Service,
  E,
  R,
  MakeE,
  MakeR,
  Tag extends string,
  Args extends [config: Config, headers: Record<string, string>],
  Dependencies extends any[]
> =
  & ContextTagWithDefault<
    Id,
    { handle: (...args: Args) => Effect<Option<Context<Service>>, E, R>; _tag: Tag },
    MakeE,
    MakeR
  >
  & {
    dependsOn?: Dependencies
  }

export type AnyContextWithLayer<Config, Service, Error> =
  | ContextWithLayer<
    Config,
    any,
    Service,
    Error,
    any,
    any,
    any,
    string,
    any,
    any
  >
  | ContextWithLayer<
    Config,
    any,
    Service,
    Error,
    never,
    any,
    never,
    any,
    any,
    any
  >
  | ContextWithLayer<
    Config,
    any,
    Service,
    Error,
    any,
    any,
    never,
    any,
    any,
    any
  >
  | ContextWithLayer<
    Config,
    any,
    Service,
    Error,
    never,
    any,
    any,
    any,
    any,
    any
  >

export const mergeContexts = Effect.fnUntraced(
  function*<T extends readonly { maker: any; handle: Effect<Context<any>> }[]>(makers: T) {
    let context = Context.empty()
    for (const mw of makers) {
      yield* InfraLogger.logDebug("Building context for middleware", mw.maker.key ?? mw.maker)
      const moreContext = yield* mw.handle.pipe(Effect.provide(context))
      yield* InfraLogger.logDebug(
        "Built context for middleware",
        mw.maker.key ?? mw.maker,
        (moreContext as any).toJSON().services
      )
      context = Context.merge(context, moreContext)
    }
    return context as Context.Context<Effect.Success<T[number]["handle"]>>
  }
)

export const mergeOptionContexts = Effect.fnUntraced(
  function*<T extends readonly { maker: any; handle: Effect<Option<Context<any>>> }[]>(makers: T) {
    let context = Context.empty()
    for (const mw of makers) {
      yield* InfraLogger.logDebug("Building context for middleware", mw.maker.key ?? mw.maker)
      const moreContext = yield* mw.handle.pipe(Effect.provide(context))
      yield* InfraLogger.logDebug(
        "Built context for middleware",
        mw.maker.key ?? mw.maker,
        Option.map(moreContext, (c) => (c as any).toJSON().services)
      )
      if (moreContext.value) {
        context = Context.merge(context, moreContext.value)
      }
    }
    return context
  }
)

export const implementMiddleware = <T extends Record<string, RPCContextMap.Any>>() =>
<
  TI extends {
    [K in keyof T]: AnyContextWithLayer<
      { [K in keyof T]?: T[K]["contextActivation"] },
      T[K]["service"],
      S.Schema.Type<T[K]["error"]>
    >
  }
>(implementations: TI) => ({
  dependencies: typedValuesOf(implementations).map((_) => _.Default) as {
    [K in keyof TI]: TI[K]["Default"]
  }[keyof TI][],
  effect: Effect.gen(function*() {
    const sorted = sort(typedValuesOf(implementations))

    const makers = yield* Effect.all(sorted)
    return Effect.fnUntraced(
      function*(config: { [K in keyof T]?: T[K]["contextActivation"] }, headers: Record<string, string>) {
        const ctx = yield* mergeOptionContexts(
          Array.map(
            makers,
            (_, i) => ({ maker: sorted[i], handle: (_ as any).handle(config, headers) as any }) as any
          )
        )
        return ctx as Context.Context<
          GetEffectContext<T, typeof config>
        >
      }
    ) as (
      config: { [K in keyof T]?: T[K]["contextActivation"] },
      headers: Record<string, string>
    ) => Effect.Effect<
      Context.Context<GetEffectContext<T, typeof config>>,
      Effect.Error<ReturnType<Tag.Service<TI[keyof TI]>["handle"]>>,
      Effect.Context<ReturnType<Tag.Service<TI[keyof TI]>["handle"]>>
    >
  })
})
