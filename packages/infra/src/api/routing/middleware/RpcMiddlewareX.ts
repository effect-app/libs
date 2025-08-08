/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Effect, Layer, type NonEmptyReadonlyArray, Unify } from "effect-app"
import { type TagUnify, type TagUnifyIgnore } from "effect/Context"
import { type Service } from "effect/Effect"
import { type RpcMiddleware, type RpcMiddlewareDynamicNormal, type RpcMiddlewareDynamicWrap, type RpcMiddlewareWrap, type RpcOptionsDynamic, type RpcOptionsOriginal, Tag, type TagClass } from "./RpcMiddleware.js"

/**
 * @deprecated - RPC groups are defined centrally and re-used between server and client,
 * so layer implementation details should not be mixed.
 */
export const TagService = <Self>() =>
<
  const Name extends string,
  const Options extends RpcOptionsOriginal | RpcOptionsDynamic<any, any>
>(
  id: Name,
  options?: Options | undefined
) =>
<
  LayerOpts extends {
    effect: Effect.Effect<
      Options extends RpcOptionsDynamic<any, any> ? TagClass.Wrap<Options> extends true ? RpcMiddlewareDynamicWrap<
            TagClass.FailureService<Options>,
            TagClass.Requires<Options>,
            { [K in Options["dynamic"]["key"]]?: Options["dynamic"]["settings"]["contextActivation"] }
          >
        : RpcMiddlewareDynamicNormal<
          TagClass.Service<Options>,
          TagClass.FailureService<Options>,
          TagClass.Requires<Options>,
          { [K in Options["dynamic"]["key"]]?: Options["dynamic"]["settings"]["contextActivation"] }
        >
        : TagClass.Wrap<Options> extends true ? RpcMiddlewareWrap<
            TagClass.Provides<Options>,
            TagClass.Failure<Options>,
            TagClass.Requires<Options>
          >
        : RpcMiddleware<
          TagClass.Service<Options>,
          TagClass.FailureService<Options>,
          TagClass.Requires<Options>
        >,
      any,
      any
    >
    // TODO: we really should only support NonEmtyReadonlyArray because ReadonlyArray fucks up once you have a Layer.empty in the list, as the whole thing resolves to never
    dependencies?: NonEmptyReadonlyArray<Layer.Layer.Any> | ReadonlyArray<Layer.Layer.Any>
  }
>(opts: LayerOpts): TagClass<Self, Name, Options> & {
  Default: Layer.Layer<
    Self,
    | (LayerOpts extends { effect: Effect<infer _A, infer _E, infer _R> } ? _E
      : never)
    | Service.MakeDepsE<LayerOpts>,
    | Exclude<
      LayerOpts extends { effect: Effect<infer _A, infer _E, infer _R> } ? _R : never,
      Service.MakeDepsOut<LayerOpts>
    >
    | Service.MakeDepsIn<LayerOpts>
  >
} =>
  class extends Tag<Self>()(id, options as any) {
    static readonly Default = Layer.scoped(this, opts.effect as any).pipe(
      Layer.provide([Layer.empty, ...opts.dependencies ?? []])
    )
    static override [Unify.typeSymbol]?: unknown
    static override [Unify.unifySymbol]?: TagUnify<typeof this>
    static override [Unify.ignoreSymbol]?: TagUnifyIgnore
  } as any
