/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from "effect-app"
import { Tag } from "./RpcMiddleware.js"

export class DevMode extends Context.Reference<DevMode>()("DevMode", { defaultValue: () => false }) {}

export class RequestCacheMiddleware extends Tag<RequestCacheMiddleware>()("RequestCacheMiddleware", { wrap: true }) {}

export class ConfigureInterruptibilityMiddleware
  extends Tag<ConfigureInterruptibilityMiddleware>()("ConfigureInterruptibilityMiddleware", { wrap: true })
{}

export class LoggerMiddleware extends Tag<LoggerMiddleware>()("LoggerMiddleware", { wrap: true }) {}
