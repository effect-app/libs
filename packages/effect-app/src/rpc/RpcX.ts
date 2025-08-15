// customised version of Rpc.AddMiddleware, so that we don't loose the `config`...

import { type Rpc, type RpcMiddleware } from "@effect/rpc"
import { type Context, type Effect, type Scope, type Stream } from "effect"
import { type ReadonlyMailbox } from "effect/Mailbox"
import { type GetEffectContext, type RpcContextMap } from "./RpcContextMap.js"

// not needed if there's official support in Rpc.Rpc.
export type AddMiddleware<R extends Rpc.Any, Middleware extends RpcMiddleware.TagClassAny> = R extends Rpc.Rpc<
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
    | Rpc.Fork<Stream.Stream<infer _A, infer _E, infer _R>>
    | Effect.Effect<
      ReadonlyMailbox<infer _A, infer _E>,
      infer _EX,
      infer _R
    >
    | Rpc.Fork<
      Effect.Effect<
        ReadonlyMailbox<infer _A, infer _E>,
        infer _EX,
        infer _R
      >
    > ? Exclude<ExcludeProvides<_R, Rpcs, K>, Scope.Scope>
  : never
  : Handler extends (
    ...args: any
  ) => Effect.Effect<infer _A, infer _E, infer _R> | Rpc.Fork<Effect.Effect<infer _A, infer _E, infer _R>>
    ? ExcludeProvides<_R, Rpcs, K>
  : never

// new
export type ExtractDynamicallyProvides<R extends Rpc.Any, Tag extends string> = R extends
  Rpc.Rpc<Tag, infer _Payload, infer _Success, infer _Error, infer _Middleware> ? _Middleware extends {
    readonly requestContextMap: infer _RC
  } ? _RC extends Record<string, RpcContextMap.Any> // ? GetEffectContext<_RC, { allowAnonymous: false }>
      ? R extends { readonly config: infer _C } ? GetEffectContext<_RC, _C>
      : GetEffectContext<_RC, {}>
    : never
  : never
  : never

export type ExtractProvides<R extends Rpc.Any, Tag extends string> = R extends
  Rpc.Rpc<Tag, infer _Payload, infer _Success, infer _Error, infer _Middleware> ? _Middleware extends {
    readonly provides: Context.Tag<infer _I, infer _S>
  } ? _I
  : never
  : never

export type ExcludeProvides<Env, R extends Rpc.Any, Tag extends string> = Exclude<
  Env,
  // customisation is down here.
  ExtractProvides<R, Tag> | ExtractDynamicallyProvides<R, Tag>
>
