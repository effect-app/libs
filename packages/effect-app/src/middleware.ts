/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from "effect-app"
import { Middleware } from "./rpc.js"

export class DevMode extends Context.Reference<DevMode>()("DevMode", { defaultValue: () => false }) {}

export class RequestCacheMiddleware extends Middleware.Tag<RequestCacheMiddleware>()("RequestCacheMiddleware") {}

export class ConfigureInterruptibilityMiddleware
  extends Middleware.Tag<ConfigureInterruptibilityMiddleware>()("ConfigureInterruptibilityMiddleware")
{}

export class LoggerMiddleware extends Middleware.Tag<LoggerMiddleware>()("LoggerMiddleware") {}

export const DefaultGenericMiddlewares = [
  RequestCacheMiddleware,
  ConfigureInterruptibilityMiddleware,
  LoggerMiddleware
] as const
