/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from "effect-app"
import { RpcMiddleware } from "./rpc.js"

export class DevMode extends Context.Reference("DevMode", { defaultValue: () => false }) {}

export class RequestCacheMiddleware extends RpcMiddleware.Tag<RequestCacheMiddleware>()("RequestCacheMiddleware") {}

export class ConfigureInterruptibilityMiddleware
  extends RpcMiddleware.Tag<ConfigureInterruptibilityMiddleware>()("ConfigureInterruptibilityMiddleware")
{}

export class LoggerMiddleware extends RpcMiddleware.Tag<LoggerMiddleware>()("LoggerMiddleware") {}

export class DevModeMiddleware extends RpcMiddleware.Tag<DevModeMiddleware>()("DevModeMiddleware") {}

/**
 * Generic middlewares attached by `makeRouter` to every request.
 *
 * Invalidation key wrap/unwrap is handled by the routing layer (server) and the
 * api client factory (client) directly — there is no middleware tag for it.
 */
export const DefaultGenericMiddlewares = [
  RequestCacheMiddleware,
  ConfigureInterruptibilityMiddleware,
  LoggerMiddleware,
  DevModeMiddleware
] as const
