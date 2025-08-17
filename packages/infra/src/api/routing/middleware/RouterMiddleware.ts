/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type RpcMiddlewareWrap } from "@effect/rpc/RpcMiddleware"
import { type Context, type Effect, type Layer } from "effect-app"
import { type GetContextConfig, type RpcContextMap } from "effect-app/rpc/RpcContextMap"
// module:
//

export type RouterMiddleware<
  Self,
  RequestContextMap extends Record<string, RpcContextMap.Any>, // what services will the middlware provide dynamically to the next, or raise errors.
  MakeMiddlewareE, // what the middleware construction can fail with
  MakeMiddlewareR, // what the middlware requires to be constructed
  ContextProviderA, // what the context provider provides
  ContextProviderE, // what the context provider may fail with
  _ContextProviderR // what the context provider requires
> =
  & Effect<RpcMiddlewareWrap<ContextProviderA, ContextProviderE>, never, Self>
  // makes error because of TagUnify :/
  // Context.Tag<Self, RpcMiddlewareWrap<ContextProviderA, ContextProviderE>>
  & {
    readonly Default: Layer.Layer<Self, MakeMiddlewareE, MakeMiddlewareR>
    readonly requestContext: Context.Tag<"RequestContextConfig", GetContextConfig<RequestContextMap>>
    readonly requestContextMap: RequestContextMap
  }
