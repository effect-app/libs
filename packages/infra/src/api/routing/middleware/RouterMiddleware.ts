/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Context, type S } from "effect-app"
import type { GetContextConfig, RPCContextMap } from "effect-app/client/req"
import { type ContextTagWithDefault } from "../../layerUtils.js"
import { type MiddlewareMaker, type MiddlewareMakerId } from "./middleware-api.js"
import { type RpcMiddlewareWrap, type TagClassAny } from "./RpcMiddleware.js"

// module:
//

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
