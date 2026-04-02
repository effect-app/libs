/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Context, type Layer } from "effect-app"
import { type GetContextConfig, type RpcContextMap } from "effect-app/rpc/RpcContextMap"
import { type RpcMiddlewareV4 } from "effect-app/rpc/RpcMiddleware"
// module:
//

// v4: middleware tags are Context.Service (not Effect) — they carry the RpcMiddlewareV4 as their service Shape
export type RouterMiddleware<
  Self,
  RequestContextMap extends Record<string, RpcContextMap.Any>, // what services will the middlware provide dynamically to the next, or raise errors.
  MakeMiddlewareE, // what the middleware construction can fail with
  MakeMiddlewareR, // what the middlware requires to be constructed
  ContextProviderA, // what the context provider provides
  ContextProviderE, // what the context provider may fail with
  _ContextProviderR, // what the context provider requires
  RequestContextId
> =
  & Context.Service<Self, RpcMiddlewareV4<ContextProviderA, ContextProviderE, never>>
  & {
    readonly Default: Layer.Layer<Self, MakeMiddlewareE, MakeMiddlewareR>
    readonly requestContext: Context.Service<RequestContextId, GetContextConfig<RequestContextMap>>
    readonly requestContextMap: RequestContextMap
  }
