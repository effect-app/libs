import { SchemaGetter, SchemaTransformation } from "effect"
import { Link } from "effect/SchemaAST"
import { Transformation } from "effect/SchemaTransformation"
import { type GetContextConfig, type GetEffectError, type RequestContextMapTagAny } from "../rpc/RpcContextMap.js"
import * as S from "../Schema.js"
import { AST } from "../Schema.js"

const merge = (a: any, b: Array<any>) =>
  a !== undefined && b.length ? S.Union([a, ...b]) : a !== undefined ? a : b.length ? S.Union(b) : S.Never

const undefinedToNull = new Link(
  S.AST.null,
  new Transformation(
    SchemaGetter.transform(() => undefined),
    SchemaGetter.transform(() => null)
  )
)

/**
 * Whatever the input, we will only decode or encode to void
 */
export const ForceVoid = S
  .Any
  .pipe(
    S.decodeTo(S.Any, SchemaTransformation.transform({ decode: () => void 0 as void, encode: () => void 0 }))
  )
  .annotate({
    toCodecJson: () => undefinedToNull
  })

type SchemaOrFields<T> = T extends S.Top ? T : T extends S.Struct.Fields ? S.Struct<T> : S.Void

type TaggedRequestResult<
  Tag extends string,
  Payload extends S.Struct.Fields,
  Success extends S.Top,
  Error extends S.Top,
  Config = Record<string, never>
> =
  & S.TaggedStruct<Tag, Payload>
  & {
    new(...args: any[]): any
    readonly _tag: Tag
    readonly fields: { readonly _tag: S.tag<Tag> } & Payload
    readonly success: Success
    readonly error: Error
    readonly config: Config
    readonly "~decodingServices": S.Codec.DecodingServices<Success> | S.Codec.DecodingServices<Error>
  }

export const makeRpcClient = <
  RequestContextMap extends RequestContextMapTagAny,
  GeneralErrors extends S.Top = never
>(rcs: RequestContextMap, generalErrors?: GeneralErrors) => {
  // Long way around ServiceMap/C extends etc to support actual jsdoc from passed in RequestConfig etc... (??)
  type ServiceMap = {
    success: S.Top | S.Struct.Fields // SchemaOrFields will make a Schema type out of Struct.Fields
    error: S.Top | S.Struct.Fields // SchemaOrFields will make a Schema type out of Struct.Fields
  }

  type RequestConfig = GetContextConfig<RequestContextMap["config"]>

  type MergeError<E> = [GeneralErrors] extends [never] ? SchemaOrFields<E> : S.Union<[SchemaOrFields<E>, GeneralErrors]>
  type ErrorResult<C> = C extends { error: infer E } ? MergeError<E>
    : [GeneralErrors] extends [never] ? GetEffectError<RequestContextMap["config"], C>
    : MergeError<GetEffectError<RequestContextMap["config"], C>>

  function TaggedRequest<_Self>(): {
    <Tag extends string, Payload extends S.Struct.Fields, C extends ServiceMap>(
      tag: Tag,
      fields: Payload,
      config: RequestConfig & C
    ): TaggedRequestResult<Tag, Payload, SchemaOrFields<C["success"]>, ErrorResult<C>, Omit<C, "success" | "error">>
    <Tag extends string, Payload extends S.Struct.Fields, C extends Pick<ServiceMap, "success">>(
      tag: Tag,
      fields: Payload,
      config: RequestConfig & C
    ): TaggedRequestResult<Tag, Payload, SchemaOrFields<C["success"]>, ErrorResult<C>, Omit<C, "success" | "error">>
    <Tag extends string, Payload extends S.Struct.Fields, C extends Pick<ServiceMap, "error">>(
      tag: Tag,
      fields: Payload,
      config: RequestConfig & C
    ): TaggedRequestResult<Tag, Payload, typeof ForceVoid, ErrorResult<C>, Omit<C, "success" | "error">>
    <Tag extends string, Payload extends S.Struct.Fields, C extends Record<string, any>>(
      tag: Tag,
      fields: Payload,
      config: C & RequestConfig
    ): TaggedRequestResult<Tag, Payload, typeof ForceVoid, ErrorResult<C>, Omit<C, "success" | "error">>
    <Tag extends string, Payload extends S.Struct.Fields>(
      tag: Tag,
      fields: Payload
    ): TaggedRequestResult<Tag, Payload, typeof ForceVoid, ErrorResult<{}>, Record<string, never>>
  } {
    // TODO: filter errors based on config + take care of inversion
    const errorSchemas = Object.values(rcs.config).map((_) => _.error)
    return (<Tag extends string, Fields extends S.Struct.Fields, C extends ServiceMap>(
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

      const RequestClass = S.TaggedClass<any>()(tag, fields)
      Object.assign(RequestClass, {
        _tag: tag,
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
