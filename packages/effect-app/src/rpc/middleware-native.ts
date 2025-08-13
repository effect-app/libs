/* eslint-disable @typescript-eslint/no-explicit-any */
import { RpcMiddleware } from "@effect/rpc"
import { Context } from "effect-app"

export class DevMode extends Context.Reference<DevMode>()("DevMode", { defaultValue: () => false }) {}

export class RequestCacheMiddleware
  extends RpcMiddleware.Tag<RequestCacheMiddleware>()("RequestCacheMiddleware", { wrap: true })
{}

export class ConfigureInterruptibilityMiddleware
  extends RpcMiddleware.Tag<ConfigureInterruptibilityMiddleware>()("ConfigureInterruptibilityMiddleware", {
    wrap: true
  })
{}

export class LoggerMiddleware extends RpcMiddleware.Tag<LoggerMiddleware>()("LoggerMiddleware", { wrap: true }) {}

export const DefaultGenericMiddlewares = [
  RequestCacheMiddleware,
  ConfigureInterruptibilityMiddleware,
  LoggerMiddleware
] as const
