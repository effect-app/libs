/* eslint-disable @typescript-eslint/no-explicit-any */
import { type ContextTagWithDefault } from "../../layerUtils.js"
import { type RpcMiddlewareDynamicNormal, type RpcMiddlewareDynamicWrap } from "./DynamicMiddleware.js"

export type RpcMiddlewareDynamic<A, E, R, Config> = [A] extends [void] ? RpcMiddlewareDynamicWrap<E, R, Config>
  : RpcMiddlewareDynamicNormal<A, E, R, Config>

export type ContextWithLayer<
  Config,
  Service,
  Error,
  Dependencies,
  Id,
  LayerE,
  LayerR
> =
  & (
    | ContextTagWithDefault<
      Id,
      // todo
      RpcMiddlewareDynamic<Service, Error, any, Config>,
      LayerE,
      LayerR
    >
    | ContextTagWithDefault<
      Id,
      // todo
      RpcMiddlewareDynamic<Service, Error, never, Config>,
      LayerE,
      LayerR
    >
  )
  & {
    dependsOn?: Dependencies
  }

export namespace ContextWithLayer {
  export type Base<Config, Service, Error> = ContextWithLayer<
    Config,
    Service,
    Error,
    any,
    any,
    any,
    any
  >
}
