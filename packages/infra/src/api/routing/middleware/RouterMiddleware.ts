/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type RpcMiddleware } from "@effect/rpc"
import { type Context, type Layer } from "effect-app"
import type { GetContextConfig, RPCContextMap } from "effect-app/client/req"
import { type MiddlewareMakerId } from "./middleware-api.js"
// module:
//

export type RouterMiddleware<
  RequestContextMap extends Record<string, RPCContextMap.Any>, // what services will the middlware provide dynamically to the next, or raise errors.
  MakeMiddlewareE, // what the middleware construction can fail with
  MakeMiddlewareR, // what the middlware requires to be constructed
  ContextProviderA, // what the context provider provides
  ContextProviderE, // what the context provider may fail with
  _ContextProviderR // what the context provider requires
> =
  & RpcMiddleware.TagClass<
    MiddlewareMakerId,
    "MiddlewareMaker",
    {
      wrap: true
      // provides: [Context.Tag<ContextProviderA, ContextProviderA>] // ContextProviderA extends never ? never : [Context.Tag<ContextProviderA, ContextProviderA>] // TODO: Tag<A>, Tag<B>
      provides: Context.Tag<ContextProviderA, ContextProviderA>
      // requires: [Context.Tag<ContextProviderR, ContextProviderR>] // ContextProviderE extends never ? never : [Context.Tag<ContextProviderR, ContextProviderR>] // TODO: Tag<A>, Tag<B>
      failure: ContextProviderE
    }
  >
  & {
    readonly Default: Layer.Layer<MiddlewareMakerId, MakeMiddlewareE, MakeMiddlewareR>
    readonly requestContext: Context.Tag<"RequestContextConfig", GetContextConfig<RequestContextMap>>
    readonly requestContextMap: RequestContextMap
  }
