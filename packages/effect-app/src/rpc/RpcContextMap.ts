/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { type AnyWithProps } from "@effect/rpc/Rpc"
import { Context, type Schema as S } from "effect"
import { type NonEmptyReadonlyArray } from "effect/Array"
import { type Tag } from "effect/Context"
import { type RpcDynamic } from "./RpcMiddleware.js"

/** Adapter used when setting the dynamic prop on a middleware implementation */
export const contextMap = <
  RequestContextMap extends Record<string, RpcContextMap.Any>,
  Key extends (keyof RequestContextMap) & string
>(rcm: RequestContextMap, key: Key): RpcDynamic<Key, RequestContextMap[Key]> => ({
  key,
  settings: { service: rcm[key]!["service"] } as RequestContextMap[Key]
})

const tag = Context.GenericTag("RequestContextConfig")
/** Retrieves RequestContextConfig out of the Rpc annotations */
export const getConfig = <
  RequestContextMap extends Record<string, RpcContextMap.Any>
>() =>
(rpc: AnyWithProps): GetContextConfig<RequestContextMap> => {
  return Context.getOrElse(rpc.annotations, tag as any, () => ({}))
}

type Values<T extends Record<any, any>> = T[keyof T]

/** @deprecated just use Service Identifier Union */
export type ContextTagArray = NonEmptyReadonlyArray<Context.Tag<any, any>>

/** @deprecated just use Service Identifier Union */
export namespace ContextTagArray {
  export type Identifier<A> = A extends ContextTagArray ? Tag.Identifier<A[number]> : never
  export type Service<A> = A extends ContextTagArray ? Tag.Service<A[number]> : never
}

/** @deprecated just use Service Identifier Union */
export type AnyService = Context.Tag<any, any> | ContextTagArray
/** @deprecated just use Service Identifier Union */
export namespace AnyService {
  export type Bla<A> = A extends ContextTagArray ? Context.Context<ContextTagArray.Identifier<A>>
    : A extends Context.Tag<any, any> ? Tag.Service<A>
    : never
  export type Identifier<A> = A extends ContextTagArray ? ContextTagArray.Identifier<A>
    : A extends Context.Tag<any, any> ? Tag.Identifier<A>
    : never
  export type Service<A> = A extends ContextTagArray ? ContextTagArray.Service<A>
    : A extends Context.Tag<any, any> ? Tag.Service<A>
    : never
}

export namespace RpcContextMap {
  /**
   * Middleware is inactivate by default, the Key is optional in route context, and the service is optionally provided as Effect Context.
   * Unless explicitly configured as `true`.
   */
  export type RpcContextMap<Service, E> = {
    service: Service
    error: E
    contextActivation: true
  }

  /**
   * Middleware is active by default, and provides the Service at Key in route context, and the Service is provided as Effect Context.
   * Unless explicitly omitted.
   */
  export type Inverted<Service extends AnyService, E> = {
    service: Service
    error: E
    contextActivation: false
  }

  export type Custom<Service extends AnyService, E, C> = {
    service: Service
    error: E
    contextActivation: C
  }

  export type Any = {
    service: AnyService
    error: S.Schema.All
    contextActivation: any
  }

  export const make = <Service extends AnyService, E>(
    service: Service,
    error: E
  ): RpcContextMap<Service, E> => ({
    service,
    error,
    contextActivation: true
  })

  export const makeInverted = <Service extends AnyService, E>(
    service: Service,
    error: E
  ): Inverted<Service, E> => ({
    service,
    error,
    contextActivation: false
  })

  export const makeCustom = <Service extends AnyService, E, C>(
    service: Service,
    error: E,
    contextActivation: C
  ): Custom<Service, E, C> => ({
    service,
    error,
    contextActivation
  })
}

export type GetContextConfig<RequestContextMap extends Record<string, RpcContextMap.Any>> = {
  [K in keyof RequestContextMap]?: RequestContextMap[K]["contextActivation"] extends true ? false
    : RequestContextMap[K]["contextActivation"] extends false ? true
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
      AnyService.Identifier<RequestContextMap[key]["service"]>
  }
  // normal: contextActivation is true => add if explicitly set to true
  & {
    [
      key in keyof RequestContextMap as RequestContextMap[key]["contextActivation"] extends false ? never
        : key extends keyof T ? T[key] extends true ? key : never
        : never
    ]: // TODO: or as an Optional available?
      AnyService.Identifier<RequestContextMap[key]["service"]>
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
