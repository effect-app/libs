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

export const DefaultGenericMiddlewares = [
  RequestCacheMiddleware,
  ConfigureInterruptibilityMiddleware,
  LoggerMiddleware,
  DevModeMiddleware
] as const
