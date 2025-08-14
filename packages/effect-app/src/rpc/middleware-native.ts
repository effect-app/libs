/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from "effect-app"
import { Tag } from "./RpcMiddleware.js"

export class DevMode extends Context.Reference<DevMode>()("DevMode", { defaultValue: () => false }) {}

export class RequestCacheMiddleware extends Tag<RequestCacheMiddleware>()("RequestCacheMiddleware", {}) {}

export class ConfigureInterruptibilityMiddleware
  extends Tag<ConfigureInterruptibilityMiddleware>()("ConfigureInterruptibilityMiddleware", {})
{}

export class LoggerMiddleware extends Tag<LoggerMiddleware>()("LoggerMiddleware", {}) {}

export const DefaultGenericMiddlewares = [
  RequestCacheMiddleware,
  ConfigureInterruptibilityMiddleware,
  LoggerMiddleware
] as const
