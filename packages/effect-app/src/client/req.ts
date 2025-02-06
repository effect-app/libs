/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { S } from "../internal/lib.js"

/**
 * Middleware is inactivate by default, the Key is optional in route context, and the service is optionally provided as Effect Context.
 * Unless configured as `true`
 */
export type RPCContextMap<Key, Service, E> = [Key, Service, E, true]

export declare namespace RPCContextMap {
  export type Custom<Key, Service, E, Custom> = [Key, Service, E, Custom]

  /**
   * Middleware is active by default, and provides the Service at Key in route context, and the Service is provided as Effect Context.
   * Unless omitted
   */
  export type Inverted<Key, Service, E> = [Key, Service, E, false]

  export type Any = [string, any, S.Schema.All, any]
}

type Values<T extends Record<any, any>> = T[keyof T]

export type GetEffectContext<CTXMap extends Record<string, RPCContextMap.Any>, T> = Values<
  // inverted
  & {
    [
      key in keyof CTXMap as CTXMap[key][3] extends true ? never
        : key extends keyof T ? T[key] extends true ? never : CTXMap[key][0]
        : CTXMap[key][0]
    ]: // TODO: or as an Optional available?
      CTXMap[key][1]
  }
  // normal
  & {
    [
      key in keyof CTXMap as CTXMap[key][3] extends false ? never
        : key extends keyof T ? T[key] extends true ? CTXMap[key][0] : never
        : never
    ]: // TODO: or as an Optional available?
      CTXMap[key][1]
  }
>
export type ValuesOrNeverSchema<T extends Record<any, any>> = Values<T> extends never ? typeof S.Never : Values<T>
export type GetEffectError<CTXMap extends Record<string, RPCContextMap.Any>, T> = Values<
  // inverted
  & {
    [
      key in keyof CTXMap as CTXMap[key][3] extends true ? never
        : key extends keyof T ? T[key] extends true ? never : CTXMap[key][0]
        : CTXMap[key][0]
    ]: // TODO: or as an Optional available?
      CTXMap[key][2]
  }
  // normal
  & {
    [
      key in keyof CTXMap as CTXMap[key][3] extends false ? never
        : key extends keyof T ? T[key] extends true ? CTXMap[key][0] : never
        : never
    ]: // TODO: or as an Optional available?
      CTXMap[key][2]
  }
>

// TODO: Fix error types...
type JoinSchema<T> = T extends ReadonlyArray<S.Schema.All> ? S.Union<T> : typeof S.Never
type ExcludeFromTuple<T extends readonly any[], E> = T extends [infer F, ...infer R]
  ? [F] extends [E] ? ExcludeFromTuple<R, E>
  : [F, ...ExcludeFromTuple<R, E>]
  : []

const merge = (a: any, b: Array<any>) =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  a !== undefined && b.length ? S.Union(a, ...b) : a !== undefined ? a : b.length ? S.Union(...b) : S.Never

type SchemaOrFields<T> = T extends S.Struct.Fields ? S.TypeLiteral<T, []> : T extends S.Schema.Any ? T : never

/**
 * Whatever the input, we will only decode or encode to void
 */
const ForceVoid: S.Schema<void> = S.transform(S.Any, S.Void, { decode: () => void 0, encode: () => void 0 })

export const makeRpcClient = <
  RequestConfig extends object,
  CTXMap extends Record<string, RPCContextMap.Any>,
  GeneralErrors extends S.Schema.All = never
>(
  errors: { [K in keyof CTXMap]: CTXMap[K][2] },
  generalErrors?: GeneralErrors
) => {
  // Long way around Context/C extends etc to support actual jsdoc from passed in RequestConfig etc...
  type Context = { success: S.Schema.Any | S.Struct.Fields; failure: S.Schema.Any | S.Struct.Fields }
  function TaggedRequest<Self>(): {
    <Tag extends string, Payload extends S.Struct.Fields, C extends Context>(
      tag: Tag,
      fields: Payload,
      config: RequestConfig & C
    ):
      & S.TaggedRequestClass<
        Self,
        Tag,
        { readonly _tag: S.tag<Tag> } & Payload,
        SchemaOrFields<typeof config["success"]>,
        JoinSchema<
          ExcludeFromTuple<
            [SchemaOrFields<typeof config["failure"]> | GetEffectError<CTXMap, C> | GeneralErrors],
            never
          >
        >
      >
      & { config: Omit<C, "success" | "failure"> }
    <Tag extends string, Payload extends S.Struct.Fields, C extends { success: S.Schema.Any | S.Struct.Fields }>(
      tag: Tag,
      fields: Payload,
      config: RequestConfig & C
    ):
      & S.TaggedRequestClass<
        Self,
        Tag,
        { readonly _tag: S.tag<Tag> } & Payload,
        SchemaOrFields<typeof config["success"]>,
        JoinSchema<ExcludeFromTuple<[GetEffectError<CTXMap, C> | GeneralErrors], never>>
      >
      & { config: Omit<C, "success" | "failure"> }
    <Tag extends string, Payload extends S.Struct.Fields, C extends { failure: S.Schema.Any | S.Struct.Fields }>(
      tag: Tag,
      fields: Payload,
      config: RequestConfig & C
    ):
      & S.TaggedRequestClass<
        Self,
        Tag,
        { readonly _tag: S.tag<Tag> } & Payload,
        typeof S.Void,
        JoinSchema<
          ExcludeFromTuple<
            [SchemaOrFields<typeof config["failure"]> | GetEffectError<CTXMap, C> | GeneralErrors],
            never
          >
        >
      >
      & { config: Omit<C, "success" | "failure"> }
    <Tag extends string, Payload extends S.Struct.Fields, C extends Record<string, any>>(
      tag: Tag,
      fields: Payload,
      config: C & RequestConfig
    ):
      & S.TaggedRequestClass<
        Self,
        Tag,
        { readonly _tag: S.tag<Tag> } & Payload,
        typeof S.Void,
        JoinSchema<ExcludeFromTuple<[GetEffectError<CTXMap, C> | GeneralErrors], never>>
      >
      & { config: Omit<C, "success" | "failure"> }
    <Tag extends string, Payload extends S.Struct.Fields>(
      tag: Tag,
      fields: Payload
    ):
      & S.TaggedRequestClass<
        Self,
        Tag,
        { readonly _tag: S.tag<Tag> } & Payload,
        typeof S.Void,
        GeneralErrors extends never ? typeof S.Never : GeneralErrors
      >
      // eslint-disable-next-line @typescript-eslint/no-empty-object-type
      & { config: {} }
  } {
    // TODO: filter errors based on config + take care of inversion
    const errorSchemas = Object.values(errors)
    return (<Tag extends string, Fields extends S.Struct.Fields, C extends Context>(
      tag: Tag,
      fields: Fields,
      config?: C
    ) => {
      const req = S.TaggedRequest<Self>()(tag, {
        payload: fields,
        failure: merge(
          config?.failure ? S.isSchema(config.failure) ? config.failure : S.Struct(config.failure) : undefined,
          [...errorSchemas, generalErrors].filter(Boolean)
        ),
        success: config?.success
          ? S.isSchema(config.success)
            ? S.AST.isVoidKeyword(config.success.ast) ? ForceVoid : config.success
            : S.Struct(config.success)
          : ForceVoid
      })
      return class extends (Object.assign(req, { config }) as any) {
        constructor(a: any, b: any = true) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          super(a, b)
        }
      }
    }) as any
  }

  return {
    TaggedRequest
  }
}
