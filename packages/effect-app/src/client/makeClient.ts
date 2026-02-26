import { type GetContextConfig, type RequestContextMapTagAny } from "../rpc/RpcContextMap.js"
import * as S from "../Schema.js"
import { AST } from "../Schema.js"

const merge = (a: any, b: Array<any>) =>
  a !== undefined && b.length ? S.Union([a, ...b]) : a !== undefined ? a : b.length ? S.Union(b) : S.Never

/**
 * Whatever the input, we will only decode or encode to void
 */
const ForceVoid: S.Schema<void> = S.Void as any

export const makeRpcClient = <
  RequestContextMap extends RequestContextMapTagAny,
  GeneralErrors extends S.Top = never
>(rcs: RequestContextMap, generalErrors?: GeneralErrors) => {
  // Long way around Context/C extends etc to support actual jsdoc from passed in RequestConfig etc... (??)
  type Context = {
    success: S.Top | S.Struct.Fields // SchemaOrFields will make a Schema type out of Struct.Fields
    error: S.Top | S.Struct.Fields // SchemaOrFields will make a Schema type out of Struct.Fields
  }

  type RequestConfig = GetContextConfig<RequestContextMap["config"]>

  // TODO: S.TaggedRequestClass and S.TaggedRequest removed in v4 — return types use `any` for now
  function TaggedRequest<_Self>(): {
    <Tag extends string, Payload extends S.Struct.Fields, C extends Context>(
      tag: Tag,
      fields: Payload,
      config: RequestConfig & C
    ):
      & any
      & { config: Omit<C, "success" | "error"> }
    <Tag extends string, Payload extends S.Struct.Fields, C extends Pick<Context, "success">>(
      tag: Tag,
      fields: Payload,
      config: RequestConfig & C
    ):
      & any
      & { config: Omit<C, "success" | "error"> }
    <Tag extends string, Payload extends S.Struct.Fields, C extends Pick<Context, "error">>(
      tag: Tag,
      fields: Payload,
      config: RequestConfig & C
    ):
      & any
      & { config: Omit<C, "success" | "error"> }
    <Tag extends string, Payload extends S.Struct.Fields, C extends Record<string, any>>(
      tag: Tag,
      fields: Payload,
      config: C & RequestConfig
    ):
      & any
      & { config: Omit<C, "success" | "error"> }
    <Tag extends string, Payload extends S.Struct.Fields>(
      tag: Tag,
      fields: Payload
    ):
      & any
      // eslint-disable-next-line @typescript-eslint/no-empty-object-type
      & { config: {} }
  } {
    // TODO: filter errors based on config + take care of inversion
    const errorSchemas = Object.values(rcs.config).map((_) => _.error)
    return (<Tag extends string, Fields extends S.Struct.Fields, C extends Context>(
      tag: Tag,
      fields: Fields,
      config?: C
    ) => {
      // TODO: S.TaggedRequest removed in v4 — needs rework to use Rpc.make or Request.TaggedClass
      // For now, creating a simple tagged struct class with success/failure properties
      const failureSchema = merge(
        config?.error ? S.isSchema(config.error) ? config.error : S.Struct(config.error) : undefined,
        [...errorSchemas, generalErrors].filter(Boolean)
      )
      const successSchema = config?.success
        ? S.isSchema(config.success)
          ? AST.isVoid(config.success.ast) ? ForceVoid : config.success
          : S.Struct(config.success)
        : ForceVoid

      const payloadSchema = S.Struct({ _tag: S.tag(tag), ...fields })

      const taggedFields = { _tag: S.tag(tag), ...fields }

      const RequestClass = class {
        constructor(payload?: any) {
          if (payload) {
            Object.assign(this, payload)
          }
          ;(this as any)._tag = tag
        }
      }

      Object.assign(RequestClass, payloadSchema, {
        _tag: tag,
        fields: taggedFields,
        success: successSchema,
        error: failureSchema,
        config
      })

      return RequestClass
    }) as any
  }

  return {
    TaggedRequest
  }
}
