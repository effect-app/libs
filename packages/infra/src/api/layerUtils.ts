import { type Context, type Layer, type NonEmptyReadonlyArray } from "effect-app"

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
