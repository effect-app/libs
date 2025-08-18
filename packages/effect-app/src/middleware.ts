/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from "effect-app"
import { RpcX } from "./rpc.js"

export class DevMode extends Context.Reference<DevMode>()("DevMode", { defaultValue: () => false }) {}

export class RequestCacheMiddleware
  extends RpcX.RpcMiddleware.Tag<RequestCacheMiddleware>()("RequestCacheMiddleware")
{}

export class ConfigureInterruptibilityMiddleware
  extends RpcX.RpcMiddleware.Tag<ConfigureInterruptibilityMiddleware>()("ConfigureInterruptibilityMiddleware")
{}

export class LoggerMiddleware extends RpcX.RpcMiddleware.Tag<LoggerMiddleware>()("LoggerMiddleware") {}

export class DevModeMiddleware extends RpcX.RpcMiddleware.Tag<DevModeMiddleware>()("DevModeMiddleware") {}

export const DefaultGenericMiddlewares = [
  RequestCacheMiddleware,
  ConfigureInterruptibilityMiddleware,
  LoggerMiddleware,
  DevModeMiddleware
] as const
