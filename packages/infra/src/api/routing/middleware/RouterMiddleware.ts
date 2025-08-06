/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Context, type Effect, type Request, type S, type Scope } from "effect-app"
import type { GetContextConfig, GetEffectContext, RPCContextMap } from "effect-app/client/req"
import type * as EffectRequest from "effect/Request"
import { type ContextTagWithDefault } from "../../layerUtils.js"
import { type MiddlewareMaker, type MiddlewareMakerId } from "./middleware-api.js"
import { type RpcMiddlewareWrap, type TagClassAny } from "./RpcMiddleware.js"

// module:
//

export type RPCHandlerFactory<
  RequestContextMap extends Record<string, RPCContextMap.Any>,
  ContextProviderA
> = <
  T extends {
    config?: Partial<Record<keyof RequestContextMap, any>>
  },
  Req extends S.TaggedRequest.All,
  HandlerR
>(
  schema: T & S.Schema<Req, any, never>,
  handler: (
    request: Req,
    headers: any
  ) => Effect.Effect<
    EffectRequest.Request.Success<Req>,
    EffectRequest.Request.Error<Req>,
    HandlerR
  >
) => (
  req: Req,
  headers: any
) => Effect.Effect<
  Request.Request.Success<Req>,
  | Request.Request.Error<Req>
  | RequestContextMapErrors<RequestContextMap>,
  | Scope.Scope // the context provider may require Scope to run
  | Exclude<
    // the middleware will remove from HandlerR the dynamic context
    Exclude<HandlerR, GetEffectContext<RequestContextMap, (T & S.Schema<Req, any, never>)["config"]>>,
    // the context provider provides additional stuff both to the middleware and the handler
    ContextProviderA
  >
>

export type RouterMiddleware<
  RequestContextMap extends Record<string, RPCContextMap.Any>, // what services will the middlware provide dynamically to the next, or raise errors.
  MakeMiddlewareE, // what the middleware construction can fail with
  MakeMiddlewareR, // what the middlware requires to be constructed
  ContextProviderA // what the context provider provides
> =
  & ContextTagWithDefault<
    MiddlewareMakerId,
    MiddlewareMaker<RpcMiddlewareWrap<ContextProviderA, never, never>>, // TODO: Provides/Requires, whatever/errors
    MakeMiddlewareE,
    MakeMiddlewareR
  >
  & TagClassAny
  & { requestContext: Context.Tag<"RequestContext", GetContextConfig<RequestContextMap>> }

export type RequestContextMapErrors<RequestContextMap extends Record<string, RPCContextMap.Any>> = S.Schema.Type<
  RequestContextMap[keyof RequestContextMap]["error"]
>

// it just provides the right types without cluttering the implementation with them
export function makeRpcEffect<
  RequestContextMap extends Record<string, RPCContextMap.Any>,
  ContextProviderA
>() {
  return (cb: RPCHandlerFactory<RequestContextMap, ContextProviderA>) => cb
}
