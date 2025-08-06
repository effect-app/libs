/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Rpc, RpcMiddleware } from "@effect/rpc"
import { type SuccessValue, type TypeId } from "@effect/rpc/RpcMiddleware"
import { type Context, type Effect, Layer, type NonEmptyReadonlyArray, type Option, type S, type Schema, type Scope, Unify } from "effect-app"
import type { AnyService, ContextTagArray, RPCContextMap } from "effect-app/client/req"
import { type HttpHeaders } from "effect-app/http"
import { type TagUnify, type TagUnifyIgnore } from "effect/Context"
import { type LayerUtils } from "../../layerUtils.js"

// updated to support Scope.Scope and Requires
export interface RpcMiddleware<Provides, E, Requires> {
  (options: {
    readonly clientId: number
    readonly rpc: Rpc.AnyWithProps
    readonly payload: unknown
    readonly headers: HttpHeaders.Headers
  }): Effect.Effect<Provides, E, Scope.Scope | Requires>
}
export interface RpcMiddlewareWrap<Provides, E, Requires> {
  (options: {
    readonly clientId: number
    readonly rpc: Rpc.AnyWithProps
    readonly payload: unknown
    readonly headers: HttpHeaders.Headers
    readonly next: Effect.Effect<SuccessValue, E, Provides | Scope.Scope | Requires>
  }): Effect.Effect<SuccessValue, E, Scope.Scope | Requires>
}

type RpcOptionsOriginal = {
  readonly wrap?: boolean
  readonly optional?: boolean
  readonly failure?: Schema.Schema.All
  readonly provides?: AnyService
  readonly requiredForClient?: boolean
}

export type RpcDynamic<Key extends string, A extends RPCContextMap.Any> = {
  key: Key
  settings: A
}

export type AnyDynamic = { dynamic: RpcDynamic<any, any> }

export type DependsOn = {
  readonly dependsOn: NonEmptyReadonlyArray<AnyDynamic> | undefined
}

interface RpcOptionsDynamic<Key extends string, A extends RPCContextMap.Any> extends RpcOptionsOriginal {
  readonly dynamic: RpcDynamic<Key, A>
  readonly dependsOn?: NonEmptyReadonlyArray<AnyDynamic> | undefined
}

export type Dynamic<Options> = Options extends RpcOptionsDynamic<any, any> ? true : false

export interface RpcMiddlewareDynamicWrap<E, R, _Config> {
  (options: {
    readonly next: Effect.Effect<SuccessValue, E, Scope.Scope | R>
    readonly clientId: number
    readonly rpc: Rpc.AnyWithProps // TODO & { annotations: Context.Context<RequestContextMap<Config>> }
    readonly payload: unknown
    readonly headers: HttpHeaders.Headers
  }): Effect.Effect<
    SuccessValue,
    E,
    Scope.Scope | R
  >
}

export interface RpcMiddlewareDynamicNormal<A, E, R, _Config> {
  (options: {
    readonly clientId: number
    readonly rpc: Rpc.AnyWithProps // TODO & { annotations: Context.Context<RequestContextMap<Config>> }
    readonly payload: unknown
    readonly headers: HttpHeaders.Headers
  }): Effect.Effect<
    Option.Option<A>,
    E,
    Scope.Scope | R
  >
}

export interface TagClassAny extends Context.Tag<any, any> {
  readonly [TypeId]: TypeId
  readonly optional: boolean
  readonly provides?: Context.Tag<any, any> | ContextTagArray | undefined
  readonly requires?: Context.Tag<any, any> | ContextTagArray | undefined
  readonly failure: Schema.Schema.All
  readonly requiredForClient: boolean
  readonly wrap: boolean
  readonly dynamic?: RpcDynamic<any, any> | undefined
  readonly dependsOn?: NonEmptyReadonlyArray<AnyDynamic> | undefined
}

export declare namespace TagClass {
  /**
   * @since 1.0.0
   * @category models
   */
  export type Provides<Options> = Options extends {
    readonly provides: Context.Tag<any, any>
    readonly optional?: false
  } ? Context.Tag.Identifier<Options["provides"]>
    : Options extends {
      readonly provides: ContextTagArray
      readonly optional?: false
    } ? ContextTagArray.Identifier<Options["provides"]>
    : never

  /**
   * @since 1.0.0
   * @category models
   */
  export type Requires<Options> = Options extends {
    readonly requires: Context.Tag<any, any>
  } ? Context.Tag.Identifier<Options["requires"]>
    : Options extends {
      readonly requires: ContextTagArray
    } ? ContextTagArray.Identifier<Options["requires"]>
    : never

  /**
   * @since 1.0.0
   * @category models
   */
  export type Service<Options> = Options extends { readonly provides: Context.Tag<any, any> }
    ? Context.Tag.Service<Options["provides"]>
    : Options extends { readonly dynamic: RpcDynamic<any, infer A> }
      ? Options extends { wrap: true } ? void : AnyService.Bla<A["service"]>
    : Options extends { readonly provides: ContextTagArray }
      ? Context.Context<ContextTagArray.Identifier<Options["provides"]>>
    : void

  /**
   * @since 1.0.0
   * @category models
   */
  export type FailureSchema<Options> = Options extends
    { readonly failure: Schema.Schema.All; readonly optional?: false } ? Options["failure"]
    : Options extends { readonly dynamic: RpcDynamic<any, infer A> } ? A["error"]
    : typeof Schema.Never

  /**
   * @since 1.0.0
   * @category models
   */
  export type Failure<Options> = Options extends
    { readonly failure: Schema.Schema<infer _A, infer _I, infer _R>; readonly optional?: false } ? _A
    : Options extends { readonly dynamic: RpcDynamic<any, infer A> } ? S.Schema.Type<A["error"]>
    : never

  /**
   * @since 1.0.0
   * @category models
   */
  export type FailureContext<Options> = Schema.Schema.Context<FailureSchema<Options>>

  /**
   * @since 1.0.0
   * @category models
   */
  export type FailureService<Options> = Optional<Options> extends true ? unknown : Failure<Options>

  /**
   * @since 1.0.0
   * @category models
   */
  export type Optional<Options> = Options extends { readonly optional: true } ? true : false

  /**
   * @since 1.0.0
   * @category models
   */
  export type RequiredForClient<Options> = Options extends { readonly requiredForClient: true } ? true : false

  /**
   * @since 1.0.0
   * @category models
   */
  export type Wrap<Options> = Options extends { readonly wrap: true } ? true : false

  /**
   * @since 1.0.0
   * @category models
   */
  export interface Base<Self, Name extends string, Options, Service> extends Context.Tag<Self, Service> {
    new(_: never): Context.TagClassShape<Name, Service>
    readonly [TypeId]: TypeId
    readonly optional: Optional<Options>
    readonly failure: FailureSchema<Options>
    readonly provides: Options extends { readonly provides: Context.Tag<any, any> } ? Options["provides"]
      : Options extends { readonly provides: ContextTagArray } ? Options["provides"]
      : undefined
    readonly requires: Options extends { readonly requires: Context.Tag<any, any> } ? Options["requires"]
      : Options extends { readonly requires: ContextTagArray } ? Options["requires"]
      : undefined
    readonly dynamic: Options extends RpcOptionsDynamic<any, any> ? Options["dynamic"]
      : undefined
    readonly dependsOn: Options extends DependsOn ? Options["dependsOn"] : undefined
    readonly requiredForClient: RequiredForClient<Options>
    readonly wrap: Wrap<Options>
  }
}

export interface TagClass<
  Self,
  Name extends string,
  Options
> extends
  TagClass.Base<
    Self,
    Name,
    Options,
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
      >
  >
{}

export const Tag = <Self>() =>
<
  const Name extends string,
  const Options extends RpcOptionsOriginal | RpcOptionsDynamic<any, any>
>(
  id: Name,
  options?: Options | undefined
) =>
<E, R, L extends ReadonlyArray<Layer.Layer.Any>>(opts: {
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
    E,
    R
  >
  dependencies?: L
}): TagClass<Self, Name, Options> & {
  Default: Layer.Layer<
    Self,
    E | LayerUtils.GetLayersError<L>,
    Exclude<R, LayerUtils.GetLayersSuccess<L>> | LayerUtils.GetLayersContext<L>
  >
} =>
  class extends RpcMiddleware.Tag<Self>()(id, options as any) {
    static readonly dynamic = options && "dynamic" in options ? options.dynamic : undefined
    static readonly dependsOn = options && "dependsOn" in options ? options.dependsOn : undefined
    static readonly Default = Layer.scoped(this, opts.effect as any).pipe(
      Layer.provide([Layer.empty, ...opts.dependencies ?? []])
    )
    static override [Unify.typeSymbol]?: unknown
    static override [Unify.unifySymbol]?: TagUnify<typeof this>
    static override [Unify.ignoreSymbol]?: TagUnifyIgnore
  } as any
