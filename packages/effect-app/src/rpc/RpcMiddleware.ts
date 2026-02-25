/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Effect, type Schema, type Schema as S, type Scope, type ServiceMap, type Stream } from "effect"
import { type NonEmptyReadonlyArray } from "effect/Array"
import { type Rpc, RpcMiddleware } from "effect/unstable/rpc"
import { type TypeId } from "effect/unstable/rpc/RpcMiddleware"
import { type GetEffectContext, type RpcContextMap } from "./RpcContextMap.js"

export type RpcMiddlewareV4<Provides, E, Requires> = RpcMiddleware.RpcMiddleware<Provides, E, Requires>

export type RpcOptionsOriginal = {
  readonly optional?: boolean
  readonly failure?: Schema.Top
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

export interface RpcMiddlewareDynamic<E, R, _Config> extends RpcMiddleware.RpcMiddleware<never, E, R> {}

export interface TagClassAny extends RpcMiddleware.AnyService {
  readonly optional: boolean
  readonly provides: any
  readonly requires: any
  readonly failure: Schema.Top
  readonly wrap: true
  readonly dynamic?: RpcDynamic<any, any> | undefined
  readonly dependsOn?: NonEmptyReadonlyArray<AnyDynamic> | undefined
}

export declare namespace TagClass {
  /**
   * @since 1.0.0
   * @category models
   */
  export type FailureSchema<Options> = Options extends { readonly failure: Schema.Top; readonly optional?: false }
    ? Options["failure"]
    // actually not, the Failure depends on Dynamic Middleware Configuration!
    // : Options extends { readonly dynamic: RpcDynamic<any, infer A> } ? A["error"]
    : typeof Schema.Never

  /**
   * @since 1.0.0
   * @category models
   */
  export type Failure<Options> = Options extends
    { readonly failure: Schema.Schema<infer _A>; readonly optional?: false } ? _A
    // actually not, the Failure depends on Dynamic Middleware Configuration!
    : Options extends { readonly dynamic: RpcDynamic<any, infer A> } ? S.Schema.Type<A["error"]>
    : never

  /**
   * @since 1.0.0
   * @category models
   */
  export type FailureContext<Options> = Schema.Codec.DecodingServices<FailureSchema<Options>>

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
  > extends ServiceMap.Service<Self, Service> {
    new(_: never): ServiceMap.ServiceClass.Shape<Name, Service>
    readonly [TypeId]: TypeId
    readonly optional: Optional<Options>
    readonly failure: FailureSchema<Options>
    readonly error: FailureSchema<Options>
    readonly "~ClientError": Options extends { readonly clientError: infer CE } ? CE : never
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
  const Options extends RpcOptionsOriginal | RpcOptionsDynamic<any, any> = {}
>(
  id: Name,
  options?: Options
): TagClass<Self, Name, Options, Config> =>
  class extends RpcMiddleware.Service<Self>()(id, options as any) {
    static readonly requires: "requires" extends keyof Config ? Config["requires"] : never
    static readonly provides: "provides" extends keyof Config ? Config["provides"] : never
    static readonly dynamic = options && "dynamic" in options ? options.dynamic : undefined
    static readonly dependsOn = options && "dependsOn" in options ? options.dependsOn : undefined
  } as any

// not needed if there's official support in Rpc.Rpc.
export type AddMiddleware<R extends Rpc.Any, Middleware extends RpcMiddleware.AnyServiceWithProps> = R extends Rpc.Rpc<
  infer _Tag,
  infer _Payload,
  infer _Success,
  infer _Error,
  infer _Middleware
> ?
    & Rpc.Rpc<
      _Tag,
      _Payload,
      _Success,
      _Error,
      _Middleware | Middleware
    >
    & { readonly config: R extends { readonly config: infer _C } ? _C : never }
  : never

// customized versions to handle dynamically eliminated context.
export type HandlersContext<Rpcs extends Rpc.Any, Handlers> = keyof Handlers extends infer K
  ? K extends keyof Handlers & string ? HandlerContext<Rpcs, K, Handlers[K]> : never
  : never

export type HandlerContext<Rpcs extends Rpc.Any, K extends Rpcs["_tag"], Handler> = [Rpc.IsStream<Rpcs, K>] extends
  [true] ? Handler extends (...args: any) =>
    | Stream.Stream<infer _A, infer _E, infer _R>
    | Rpc.Wrapper<Stream.Stream<infer _A, infer _E, infer _R>>
    | Effect.Effect<
      infer _A,
      infer _EX,
      infer _R
    >
    | Rpc.Wrapper<
      Effect.Effect<
        infer _A,
        infer _EX,
        infer _R
      >
    > ? Exclude<ExcludeProvides<_R, Rpcs, K>, Scope.Scope>
  : never
  : Handler extends (
    ...args: any
  ) => Effect.Effect<infer _A, infer _E, infer _R> | Rpc.Wrapper<Effect.Effect<infer _A, infer _E, infer _R>>
    ? ExcludeProvides<_R, Rpcs, K>
  : never

// new
export type ExtractDynamicallyProvides<R extends Rpc.Any, Tag extends string> = R extends
  Rpc.Rpc<Tag, infer _Payload, infer _Success, infer _Error, infer _Middleware, infer _Requires> ? _Middleware extends {
    readonly requestContextMap: infer _RC
  } ? _RC extends Record<string, RpcContextMap.Any> // ? GetEffectContext<_RC, { allowAnonymous: false }>
      ? R extends { readonly config: infer _C } ? GetEffectContext<_RC, _C>
      : GetEffectContext<_RC, {}>
    : never
  : never
  : never

export type ExtractProvides<R extends Rpc.Any, Tag extends string> = R extends
  Rpc.Rpc<Tag, infer _Payload, infer _Success, infer _Error, infer _Middleware, infer _Requires> ? _Middleware extends {
    readonly provides: infer _P
  } ? [_P] extends [never] ? never
    : _P extends ServiceMap.Service<infer _I, infer _S> ? _I
    : never
  : never
  : never

export type ExcludeProvides<Env, R extends Rpc.Any, Tag extends string> = Exclude<
  Env,
  // customisation is down here.
  ExtractProvides<R, Tag> | ExtractDynamicallyProvides<R, Tag>
>
