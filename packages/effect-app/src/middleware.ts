/* eslint-disable @typescript-eslint/no-explicit-any */
import { ServiceMap } from "effect"
import { RpcX } from "./rpc.js"

export const DevMode = ServiceMap.Reference<boolean>("DevMode", { defaultValue: () => false })

export class RequestCacheMiddleware
  extends RpcX.RpcMiddleware.Service<RequestCacheMiddleware>()("RequestCacheMiddleware")
{}

export class ConfigureInterruptibilityMiddleware
  extends RpcX.RpcMiddleware.Service<ConfigureInterruptibilityMiddleware>()("ConfigureInterruptibilityMiddleware")
{}

export class LoggerMiddleware extends RpcX.RpcMiddleware.Service<LoggerMiddleware>()("LoggerMiddleware") {}

export class DevModeMiddleware extends RpcX.RpcMiddleware.Service<DevModeMiddleware>()("DevModeMiddleware") {}

export const DefaultGenericMiddlewares = [
  RequestCacheMiddleware,
  ConfigureInterruptibilityMiddleware,
  LoggerMiddleware,
  DevModeMiddleware
] as const
