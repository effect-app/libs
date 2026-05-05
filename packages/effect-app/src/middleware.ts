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

/** RPC middleware that reads the `Invalidates` annotation and populates `InvalidationSet` before the handler runs. */
export class InvalidationMiddleware extends RpcMiddleware.Tag<InvalidationMiddleware>()("InvalidationMiddleware") {}

/**
 * Generic middlewares attached by `makeRouter` to every request.
 *
 * `InvalidationMiddleware` is intentionally NOT included: the routing layer applies the
 * `CommandResponseWithMetaData` / `CommandFailureWithMetaData` wrap directly so that
 * middleware-thrown errors stay raw on the Cause (decoded via the
 * `rpc.middlewares[*].error` failure-union channel of `Rpc.exitSchema`). Callers wiring
 * `Rpc.make(...).middleware(...)` by hand can still attach `InvalidationMiddleware`
 * explicitly to get equivalent wrap behavior.
 */
export const DefaultGenericMiddlewares = [
  RequestCacheMiddleware,
  ConfigureInterruptibilityMiddleware,
  LoggerMiddleware,
  DevModeMiddleware
] as const
