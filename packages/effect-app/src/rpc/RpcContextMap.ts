/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { type AnyWithProps } from "@effect/rpc/Rpc"
import { Context, type Schema as S } from "effect"
import { type RpcDynamic } from "./RpcMiddleware.js"

type Values<T extends Record<any, any>> = T[keyof T]

/**
 * Middleware is inactivate by default, the Key is optional in route context, and the service is optionally provided as Effect Context.
 * Unless explicitly configured as `true`.
 */
export type RpcContextMap<Service, E> = {
  // todo; rename Provides
  service: Service
  error: E
  contextActivation: true
  inverted: false
}

export declare namespace RpcContextMap {
  /**
   * Middleware is active by default, and provides the Service at Key in route context, and the Service is provided as Effect Context.
   * Unless explicitly omitted.
   */
  export type Inverted<Service, E> = {
    service: Service
    error: E
    contextActivation: false
    inverted: true
  }

  export type Custom<Service, E, C> = {
    service: Service
    error: E
    contextActivation: C
    inverted: false
  }

  export type Any = {
    service: any
    error: S.Schema.All
    contextActivation: any
    inverted: boolean
  }
}

export type GetContextConfig<RequestContextMap extends Record<string, RpcContextMap.Any>> = {
  [K in keyof RequestContextMap]?: RequestContextMap[K]["inverted"] extends true
    ? RequestContextMap[K]["contextActivation"] extends true ? false
    : RequestContextMap[K]["contextActivation"] extends false ? true
    : RequestContextMap[K]["contextActivation"]
    : RequestContextMap[K]["contextActivation"]
}

export type GetEffectContext<RequestContextMap extends Record<string, RpcContextMap.Any>, T> = Values<
  // inverted: contextActivation is false => remove if explicitly set to true (like allowAnonymous: true disables auth and auth service and related errors)
  & {
    [
      key in keyof RequestContextMap as RequestContextMap[key]["contextActivation"] extends true ? never
        : key extends keyof T ? T[key] extends true ? never : key
        : key
    ]: // TODO: or as an Optional available?
      RequestContextMap[key]["service"]
  }
  // normal: contextActivation is true => add if explicitly set to true
  & {
    [
      key in keyof RequestContextMap as RequestContextMap[key]["contextActivation"] extends false ? never
        : key extends keyof T ? T[key] extends true ? key : never
        : never
    ]: // TODO: or as an Optional available?
      RequestContextMap[key]["service"]
  }
>

export type GetEffectError<RequestContextMap extends Record<string, RpcContextMap.Any>, T> = Values<
  // inverted: contextActivation is false => remove if explicitly set to true (like allowAnonymous: true disables auth and auth service and related errors)
  & {
    [
      key in keyof RequestContextMap as RequestContextMap[key]["contextActivation"] extends true ? never
        : key extends keyof T ? T[key] extends true ? never : key
        : key
    ]: // TODO: or as an Optional available?
      RequestContextMap[key]["error"]
  }
  // normal: contextActivation is true => add if explicitly set to true
  & {
    [
      key in keyof RequestContextMap as RequestContextMap[key]["contextActivation"] extends false ? never
        : key extends keyof T ? T[key] extends true ? key : never
        : never
    ]: // TODO: or as an Optional available?
      RequestContextMap[key]["error"]
  }
>

const tag = Context.GenericTag("RequestContextConfig")

export const makeMap = <const Config extends Record<string, RpcContextMap.Any>>(config: Config) => {
  const cls = class {
    readonly config: Config
    constructor() {
      this.config = config
    }
  }
  return Object.assign(cls, {
    config, /** Retrieves RequestContextConfig out of the Rpc annotations */
    getConfig: (rpc: AnyWithProps): GetContextConfig<Config> => {
      return Context.getOrElse(rpc.annotations, tag as any, () => ({}))
    },
    /** Adapter used when setting the dynamic prop on a middleware implementation */
    get: <
      Key extends (keyof Config) & string
    >(key: Key): RpcDynamic<Key, Config[Key]> => ({
      key,
      settings: { service: config[key]!["service"] } as Config[Key]
    })
  })
}

export const make = <Service = never>() =>
<E>(
  error: E
): RpcContextMap<Service, E> => ({
  service: null as Service,
  error,
  contextActivation: true,
  inverted: false
})

export const makeInverted = <Service = never>() =>
<E>(
  error: E
): RpcContextMap.Inverted<Service, E> => ({
  service: null as Service,
  error,
  contextActivation: false,
  inverted: true
})

export const makeCustom = <Service = never>() =>
<E, C>(
  error: E,
  contextActivation: C
): RpcContextMap.Custom<Service, E, C> => ({
  service: null as Service,
  error,
  contextActivation,
  inverted: false
})

export type RequestContextMapTagAny = { readonly config: Record<string, RpcContextMap.Any> }
