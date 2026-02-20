import { Rpc } from "effect/unstable/rpc"
import { type GetContextConfig, type GetEffectError, type RequestContextMapTagAny } from "../rpc/RpcContextMap.js"
import * as S from "../Schema.js"
import { AST } from "../Schema.js"

// TODO: Fix error types... (?)
type JoinSchema<T> = T extends ReadonlyArray<S.Top> ? S.Union<T> : typeof S.Never

const merge = (a: any, b: Array<any>) =>
  a !== undefined && b.length ? S.Union([a, ...b] as any) : a !== undefined ? a : b.length ? S.Union(b as any) : S.Never

/**
 * Converts struct fields to TypeLiteral schema, or returns existing schema.
 *
 * @example
 * ```typescript
 * type Fields = { name: S.String; age: S.Number }
 * type Schema = SchemaOrFields<Fields>
 * // Result: S.Struct<Fields>
 *
 * type Existing = S.String
 * type Same = SchemaOrFields<Existing>
 * // Result: S.String
 * ```
 */
type SchemaOrFields<T> = T extends S.Struct.Fields ? S.Struct<T> : T extends S.Top ? T : never

/**
 * Whatever the input, we will only decode or encode to void
 */
const ForceVoid: S.Schema<void> = S.transformTo(S.Any, S.Void, () => void 0) as any

export const makeRpcClient = <
  RequestContextMap extends RequestContextMapTagAny,
  GeneralErrors extends S.Top = never
>(rcs: RequestContextMap, generalErrors?: GeneralErrors) => {
  // Long way around Context/C extends etc to support actual jsdoc from passed in RequestConfig etc... (??)
  type Context = {
    success: S.Top | S.Struct.Fields // SchemaOrFields will make a Schema type out of Struct.Fields
    failure: S.Top | S.Struct.Fields // SchemaOrFields will make a Schema type out of Struct.Fields
  }

  type RequestConfig = GetContextConfig<RequestContextMap["config"]>

  function rpc<Tag extends string, Payload extends S.Struct.Fields, C extends Context>(
    tag: Tag,
    fields: Payload,
    config: RequestConfig & C
  ):
    & Rpc.Rpc<
      Tag,
      S.Struct<{ readonly _tag: S.tag<Tag> } & Payload>,
      SchemaOrFields<typeof config["success"]>,
      JoinSchema<
        [SchemaOrFields<typeof config["failure"]> | GetEffectError<RequestContextMap["config"], C> | GeneralErrors]
      >
    >
    & {
      config: Omit<C, "success" | "failure">
      fields: Payload
      success: SchemaOrFields<typeof config["success"]>
      failure: JoinSchema<
        [SchemaOrFields<typeof config["failure"]> | GetEffectError<RequestContextMap["config"], C> | GeneralErrors]
      >
    }
  function rpc<Tag extends string, Payload extends S.Struct.Fields, C extends Pick<Context, "success">>(
    tag: Tag,
    fields: Payload,
    config: RequestConfig & C
  ):
    & Rpc.Rpc<
      Tag,
      S.Struct<{ readonly _tag: S.tag<Tag> } & Payload>,
      SchemaOrFields<typeof config["success"]>,
      JoinSchema<[GetEffectError<RequestContextMap["config"], C> | GeneralErrors]>
    >
    & {
      config: Omit<C, "success" | "failure">
      fields: Payload
      success: SchemaOrFields<typeof config["success"]>
      failure: JoinSchema<[GetEffectError<RequestContextMap["config"], C> | GeneralErrors]>
    }
  function rpc<Tag extends string, Payload extends S.Struct.Fields, C extends Pick<Context, "failure">>(
    tag: Tag,
    fields: Payload,
    config: RequestConfig & C
  ):
    & Rpc.Rpc<
      Tag,
      S.Struct<{ readonly _tag: S.tag<Tag> } & Payload>,
      typeof S.Void,
      JoinSchema<
        [SchemaOrFields<typeof config["failure"]> | GetEffectError<RequestContextMap["config"], C> | GeneralErrors]
      >
    >
    & {
      config: Omit<C, "success" | "failure">
      fields: Payload
      success: typeof S.Void
      failure: JoinSchema<
        [SchemaOrFields<typeof config["failure"]> | GetEffectError<RequestContextMap["config"], C> | GeneralErrors]
      >
    }
  function rpc<Tag extends string, Payload extends S.Struct.Fields, C extends Record<string, any>>(
    tag: Tag,
    fields: Payload,
    config: C & RequestConfig
  ):
    & Rpc.Rpc<
      Tag,
      S.Struct<{ readonly _tag: S.tag<Tag> } & Payload>,
      typeof S.Void,
      JoinSchema<[GetEffectError<RequestContextMap["config"], C> | GeneralErrors]>
    >
    & {
      config: Omit<C, "success" | "failure">
      fields: Payload
      success: typeof S.Void
      failure: JoinSchema<[GetEffectError<RequestContextMap["config"], C> | GeneralErrors]>
    }
  function rpc<Tag extends string, Payload extends S.Struct.Fields>(
    tag: Tag,
    fields: Payload
  ):
    & Rpc.Rpc<
      Tag,
      S.Struct<{ readonly _tag: S.tag<Tag> } & Payload>,
      typeof S.Void,
      GeneralErrors extends never ? typeof S.Never : GeneralErrors
    >
    & {
      // eslint-disable-next-line @typescript-eslint/no-empty-object-type
      config: {}
      fields: Payload
      success: typeof S.Void
      failure: GeneralErrors extends never ? typeof S.Never : GeneralErrors
    }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function rpc(tag: any, fields: any, config?: any): any {
    // TODO: filter errors based on config + take care of inversion
    const errorSchemas = Object.values(rcs.config).map((_: any) => (_ as any).error)
    const errorSchema = merge(
      config?.failure ? S.isSchema(config.failure) ? config.failure : S.Struct(config.failure) : undefined,
      [...errorSchemas, generalErrors].filter(Boolean)
    )
    const successSchema = config?.success
      ? S.isSchema(config.success)
        ? AST.isVoid(config.success.ast) ? ForceVoid : config.success
        : S.Struct(config.success)
      : ForceVoid
    // S.Rpc.make is a factory function that creates an Rpc
    const rpcDef = Rpc.make(tag, {
      payload: S.Struct({ _tag: S.tag(tag), ...fields }),
      error: errorSchema,
      success: successSchema
    })
    return Object.assign(rpcDef, { config, fields, success: successSchema, failure: errorSchema })
  }

  return {
    rpc
  }
}
