/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context, Effect, type Layer, type NonEmptyReadonlyArray, Option } from "effect-app"
import { InfraLogger } from "../logger.js"

// TODO: These LayerUtils are flaky, like in dependencies as a readonly array, it breaks when there are two entries
// we should look at Service.MakeDeps[E/RIn/ROut] etc.
// and in general make sure `dependencies` are NonEmptyReadonlyArrays, so they infer to consts.

export namespace LayerUtils {
  export type GetLayersSuccess<Layers extends ReadonlyArray<Layer.Layer.Any>> = Layers extends
    NonEmptyReadonlyArray<Layer.Layer.Any> ? {
      [k in keyof Layers]: Layer.Layer.Success<Layers[k]>
    }[number]
    : Layer.Layer.Success<Layers[number]>

  export type GetLayersContext<Layers extends ReadonlyArray<Layer.Layer.Any>> = Layers extends
    NonEmptyReadonlyArray<Layer.Layer.Any> ? {
      [k in keyof Layers]: Layer.Layer.Context<Layers[k]>
    }[number]
    : Layer.Layer.Context<Layers[number]>

  export type GetLayersError<Layers extends ReadonlyArray<Layer.Layer.Any>> = Layers extends
    NonEmptyReadonlyArray<Layer.Layer.Any> ? {
      [k in keyof Layers]: Layer.Layer.Error<Layers[k]>
    }[number]
    : Layer.Layer.Error<Layers[number]>
}

export type ContextTagWithDefault<Id, A, LayerE, LayerR> =
  & Context.Tag<Id, A>
  & {
    Default: Layer.Layer<Id, LayerE, LayerR>
  }

export namespace ContextTagWithDefault {
  export type Base<A> = ContextTagWithDefault<any, A, any, any>
}

export type GetContext<T> = T extends Context.Context<infer Y> ? Y : never

export const mergeContexts = Effect.fnUntraced(
  function*<
    T extends readonly {
      maker: any
      handle: Effect.Effect<Context.Context<any> | Option.Option<Context.Context<any>>>
    }[]
  >(
    makers: T
  ) {
    let context = Context.empty()
    for (const mw of makers) {
      const ctx = yield* mw.handle.pipe(Effect.provide(context))
      const moreContext = Context.isContext(ctx) ? Option.some(ctx) : ctx
      yield* InfraLogger.logDebug(
        "Built dynamic context for middleware" + (mw.maker.key ?? mw.maker),
        Option.map(moreContext, (c) => (c as any).toJSON().services)
      )
      if (moreContext.value) {
        context = Context.merge(context, moreContext.value)
      }
    }
    return context as Context.Context<Effect.Effect.Success<T[number]["handle"]>>
  }
)
