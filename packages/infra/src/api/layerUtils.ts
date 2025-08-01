import { Context, Effect, type Layer, type NonEmptyReadonlyArray, Option } from "effect-app"
import { InfraLogger } from "../logger.js"

export namespace LayerUtils {
  export type GetLayersSuccess<Layers extends ReadonlyArray<Layer.Layer.Any>> = Layers extends
    NonEmptyReadonlyArray<Layer.Layer.Any> ? {
      [k in keyof Layers]: Layer.Layer.Success<Layers[k]>
    }[number]
    : never

  export type GetLayersContext<Layers extends ReadonlyArray<Layer.Layer.Any>> = Layers extends
    NonEmptyReadonlyArray<Layer.Layer.Any> ? {
      [k in keyof Layers]: Layer.Layer.Context<Layers[k]>
    }[number]
    : never

  export type GetLayersError<Layers extends ReadonlyArray<Layer.Layer.Any>> = Layers extends
    NonEmptyReadonlyArray<Layer.Layer.Any> ? {
      [k in keyof Layers]: Layer.Layer.Error<Layers[k]>
    }[number]
    : never
}

export type ContextTagWithDefault<Id, A, LayerE, LayerR, Tag = unknown> =
  & (Tag extends string ? Context.Tag<Id, { _tag: Tag } & A> : Context.Tag<Id, A>)
  & {
    Default: Layer.Layer<Id, LayerE, LayerR>
  }

export namespace ContextTagWithDefault {
  export type Base<A> = ContextTagWithDefault<any, any, A, any, any>
}

export type GetContext<T> = T extends Context.Context<infer Y> ? Y : never

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
