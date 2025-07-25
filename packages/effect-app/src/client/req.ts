/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { S } from "../internal/lib.js"
import { type Values } from "../utils.js"

/**
 * Middleware is inactivate by default, the Key is optional in route context, and the service is optionally provided as Effect Context.
 * Unless explicitly configured as `true`.
 */
export type RPCContextMap<Key, Service, E> = {
  key: Key
  service: Service
  error: E
  idkWhatIsThis: true
}

export declare namespace RPCContextMap {
  export type Custom<Key, Service, E, Custom extends boolean> = {
    key: Key
    service: Service
    error: E
    idkWhatIsThis: Custom
  }

  /**
   * Middleware is active by default, and provides the Service at Key in route context, and the Service is provided as Effect Context.
   * Unless explicitly omitted.
   */
  export type Inverted<Key, Service, E> = {
    key: Key
    service: Service
    error: E
    idkWhatIsThis: false
  }

  export type Any = {
    key: string
    service: any
    error: S.Schema.All
    idkWhatIsThis: any
  }
}

export type GetEffectContext<CTXMap extends Record<string, RPCContextMap.Any>, T> = Values<
  // inverted: idkWhatIsThis is false => remove if explicitly set to true (that's confusing ??)
  & {
    [
      key in keyof CTXMap as CTXMap[key]["idkWhatIsThis"] extends true ? never
        : key extends keyof T ? T[key] extends true ? never : CTXMap[key]["key"]
        : CTXMap[key]["key"]
    ]: // TODO: or as an Optional available?
      CTXMap[key]["service"]
  }
  // normal: idkWhatIsThis is true => add if explicitly set to true
  & {
    [
      key in keyof CTXMap as CTXMap[key]["idkWhatIsThis"] extends false ? never
        : key extends keyof T ? T[key] extends true ? CTXMap[key]["key"] : never
        : never
    ]: // TODO: or as an Optional available?
      CTXMap[key]["service"]
  }
>

export type GetEffectError<CTXMap extends Record<string, RPCContextMap.Any>, T> = Values<
  // inverted: idkWhatIsThis is false => remove if explicitly set to true (that's confusing ??)
  & {
    [
      key in keyof CTXMap as CTXMap[key]["idkWhatIsThis"] extends true ? never
        : key extends keyof T ? T[key] extends true ? never : CTXMap[key]["key"]
        : CTXMap[key]["key"]
    ]: // TODO: or as an Optional available?
      CTXMap[key]["error"]
  }
  // normal: idkWhatIsThis is true => add if explicitly set to true
  & {
    [
      key in keyof CTXMap as CTXMap[key]["idkWhatIsThis"] extends false ? never
        : key extends keyof T ? T[key] extends true ? CTXMap[key]["key"] : never
        : never
    ]: // TODO: or as an Optional available?
      CTXMap[key]["error"]
  }
>

// TODO: Fix error types... (?)
type JoinSchema<T> = T extends ReadonlyArray<S.Schema.All> ? S.Union<T> : typeof S.Never

const merge = (a: any, b: Array<any>) =>
  a !== undefined && b.length ? S.Union(a, ...b) : a !== undefined ? a : b.length ? S.Union(...b) : S.Never

/**
 * Converts struct fields to TypeLiteral schema, or returns existing schema.
 *
 * @example
 * ```typescript
 * type Fields = { name: S.String; age: S.Number }
 * type Schema = SchemaOrFields<Fields>
 * // Result: S.TypeLiteral<Fields, []>
 *
 * type Existing = S.String
 * type Same = SchemaOrFields<Existing>
 * // Result: S.String
 * ```
 */
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
  errors: { [K in keyof CTXMap]: CTXMap[K]["error"] },
  generalErrors?: GeneralErrors
) => {
  // Long way around Context/C extends etc to support actual jsdoc from passed in RequestConfig etc... (??)
  type Context = {
    success: S.Schema.Any | S.Struct.Fields // SchemaOrFields will make a Schema type out of Struct.Fields
    failure: S.Schema.Any | S.Struct.Fields // SchemaOrFields will make a Schema type out of Struct.Fields
  }

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
          [SchemaOrFields<typeof config["failure"]> | GetEffectError<CTXMap, C> | GeneralErrors]
        >
      >
      & { config: Omit<C, "success" | "failure"> }
    <Tag extends string, Payload extends S.Struct.Fields, C extends Pick<Context, "success">>(
      tag: Tag,
      fields: Payload,
      config: RequestConfig & C
    ):
      & S.TaggedRequestClass<
        Self,
        Tag,
        { readonly _tag: S.tag<Tag> } & Payload,
        SchemaOrFields<typeof config["success"]>,
        JoinSchema<[GetEffectError<CTXMap, C> | GeneralErrors]>
      >
      & { config: Omit<C, "success" | "failure"> }
    <Tag extends string, Payload extends S.Struct.Fields, C extends Pick<Context, "failure">>(
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
          [SchemaOrFields<typeof config["failure"]> | GetEffectError<CTXMap, C> | GeneralErrors]
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
        JoinSchema<[GetEffectError<CTXMap, C> | GeneralErrors]>
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
      // S.TaggedRequest is a factory function that creates a TaggedRequest class
      const req = S.TaggedRequest<Self>()(tag, {
        payload: fields,
        // ensure both failure and success are schemas
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
        constructor(payload: any, disableValidation: any = true) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          super(payload, disableValidation)
        }
      }
    }) as any
  }

  return {
    TaggedRequest
  }
}
