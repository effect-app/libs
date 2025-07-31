import { type Layer, type NonEmptyReadonlyArray } from "effect-app"

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
