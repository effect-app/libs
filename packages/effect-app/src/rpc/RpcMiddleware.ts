/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Rpc, RpcMiddleware } from "@effect/rpc"
import { type SuccessValue, type TypeId } from "@effect/rpc/RpcMiddleware"
import { type Context, type Effect, type Schema, type Schema as S, type Scope, Unify } from "effect"
import { type HttpHeaders } from "effect-app/http"
import { type NonEmptyReadonlyArray } from "effect/Array"
import { type TagUnify, type TagUnifyIgnore } from "effect/Context"
import { type RpcContextMap } from "./RpcContextMap.js"

// updated to support Scope.Scope and follow V4: Provides/Requires as Identifiers instead of Tag, wrap is default
export interface RpcMiddlewareV4<Provides, E, Requires> {
  (effect: Effect.Effect<SuccessValue, E, Provides | Scope.Scope | Requires>, options: {
    readonly clientId: number
    readonly rpc: Rpc.AnyWithProps
    readonly payload: unknown
    readonly headers: HttpHeaders.Headers
  }): Effect.Effect<SuccessValue, E, Scope.Scope | Requires>
}

export type RpcOptionsOriginal = {
  readonly optional?: boolean
  readonly failure?: Schema.Schema.All
  readonly requiredForClient?: boolean
}

export type RpcDynamic<Key extends string, A extends RpcContextMap.Any> = {
  key: Key
  settings: A
}

export type AnyDynamic = { dynamic: RpcDynamic<any, any> }

export type DependsOn = {
  readonly dependsOn: NonEmptyReadonlyArray<AnyDynamic> | undefined
}

export interface RpcOptionsDynamic<Key extends string, A extends RpcContextMap.Any> extends RpcOptionsOriginal {
  readonly dynamic: RpcDynamic<Key, A>
  readonly dependsOn?: NonEmptyReadonlyArray<AnyDynamic> | undefined
}

export type Dynamic<Options> = Options extends RpcOptionsDynamic<any, any> ? true : false

export interface RpcMiddlewareDynamic<E, R, _Config> {
  (effect: Effect.Effect<SuccessValue, E, Scope.Scope | R>, options: {
    readonly clientId: number
    readonly rpc: Rpc.AnyWithProps
    readonly payload: unknown
    readonly headers: HttpHeaders.Headers
  }): Effect.Effect<
    SuccessValue,
    E,
    Scope.Scope | R
  >
}

export interface TagClassAny extends Context.Tag<any, any> {
  readonly [TypeId]: TypeId
  readonly optional: boolean
  readonly provides: any
  readonly requires: any
  readonly failure: Schema.Schema.All
  readonly requiredForClient: boolean
  readonly wrap: true
  readonly dynamic?: RpcDynamic<any, any> | undefined
  readonly dependsOn?: NonEmptyReadonlyArray<AnyDynamic> | undefined
}

export declare namespace TagClass {
  /**
   * @since 1.0.0
   * @category models
   */
  export type FailureSchema<Options> = Options extends
    { readonly failure: Schema.Schema.All; readonly optional?: false } ? Options["failure"]
    // actually not, the Failure depends on Dynamic Middleware Configuration!
    // : Options extends { readonly dynamic: RpcDynamic<any, infer A> } ? A["error"]
    : typeof Schema.Never

  /**
   * @since 1.0.0
   * @category models
   */
  export type Failure<Options> = Options extends
    { readonly failure: Schema.Schema<infer _A, infer _I, infer _R>; readonly optional?: false } ? _A
    // actually not, the Failure depends on Dynamic Middleware Configuration!
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
  export interface Base<
    Self,
    Name extends string,
    Options,
    Service,
    Config extends {
      requires?: any
      provides?: any
    }
  > extends Context.Tag<Self, Service> {
    new(_: never): Context.TagClassShape<Name, Service>
    readonly [TypeId]: TypeId
    readonly optional: Optional<Options>
    readonly failure: FailureSchema<Options>
    readonly provides: "provides" extends keyof Config ? Config["provides"] : never
    readonly requires: "requires" extends keyof Config ? Config["requires"] : never
    readonly dynamic: Options extends RpcOptionsDynamic<any, any> ? Options["dynamic"]
      : undefined
    readonly dependsOn: Options extends DependsOn ? Options["dependsOn"] : undefined
    readonly requiredForClient: RequiredForClient<Options>
    readonly wrap: true
  }
}

export interface TagClass<
  Self,
  Name extends string,
  Options,
  Config extends {
    requires?: any
    provides?: any
  } = { requires: never; provides: never }
> extends
  TagClass.Base<
    Self,
    Name,
    Options,
    Options extends RpcOptionsDynamic<any, any> ? RpcMiddlewareDynamic<
        TagClass.FailureService<Options>,
        "requires" extends keyof Config ? Config["requires"] : never,
        { [K in Options["dynamic"]["key"]]?: Options["dynamic"]["settings"]["contextActivation"] }
      >
      : RpcMiddlewareV4<
        "provides" extends keyof Config ? Config["provides"] : never,
        TagClass.Failure<Options>,
        "requires" extends keyof Config ? Config["requires"] : never
      >,
    Config
  >
{}

export const Tag = <
  Self,
  Config extends {
    requires?: any
    provides?: any
  } = { requires: never; provides: never }
>() =>
<
  const Name extends string,
  const Options extends RpcOptionsOriginal | RpcOptionsDynamic<any, any>
>(
  id: Name,
  options?: Options | undefined
): TagClass<Self, Name, Options, Config> =>
  class extends RpcMiddleware.Tag<Self>()(id, options) {
    static readonly requires: "requires" extends keyof Config ? Config["requires"] : never
    static override readonly provides: "provides" extends keyof Config ? Config["provides"] : never
    static readonly dynamic = options && "dynamic" in options ? options.dynamic : undefined
    static readonly dependsOn = options && "dependsOn" in options ? options.dependsOn : undefined
    static override [Unify.typeSymbol]?: unknown
    static override [Unify.unifySymbol]?: TagUnify<typeof this>
    static override [Unify.ignoreSymbol]?: TagUnifyIgnore
  } as any
