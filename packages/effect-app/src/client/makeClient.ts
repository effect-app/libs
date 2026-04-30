import { SchemaTransformation } from "effect"
import type * as Exit from "effect/Exit"
import { type GetContextConfig, type GetEffectError, type RequestContextMapTagAny } from "../rpc/RpcContextMap.js"
import * as S from "../Schema.js"
import { AST } from "../Schema.js"

const merge = (a: any, b: Array<any>) =>
  a !== undefined && b.length ? S.Union([a, ...b]) : a !== undefined ? a : b.length ? S.Union(b) : S.Never

/**
 * Whatever the input, we will only decode or encode to void
 */
export const ForceVoid = S
  .declare((_: unknown): _ is unknown => true)
  .pipe(
    S.decodeTo(S.Any, SchemaTransformation.transform<unknown, unknown>({ decode: () => void 0, encode: () => void 0 }))
  )

type SchemaOrFields<T> = T extends S.Top ? T : T extends S.Struct.Fields ? S.Struct<T> : S.Void

type TaggedRequestSchema<Tag extends string, Payload extends S.Struct.Fields> = S.Struct<
  { readonly _tag: S.tag<Tag> } & Payload
>

type QueryOnlyRequests<Resource> = {
  [K in keyof Resource as Resource[K] extends { readonly type: "query" } ? K : never]: Resource[K]
}

type QueryOnlyResources<Resources> = {
  [K in keyof Resources]: QueryOnlyRequests<Resources[K]>
}

type InputFromPayload<Payload extends S.Struct.Fields> = keyof Payload extends never ? void
  : S.Schema.Type<S.Struct<Payload>>

type OutputFromSuccess<Success extends S.Top> = Success extends typeof ForceVoid ? void : S.Schema.Type<Success>

export type InvalidateQueryInstruction = {
  readonly filters?: Record<string, unknown>
  readonly options?: Record<string, unknown>
}

export type InvalidationCallback<Resources, Input = unknown, Success = unknown, Failure = unknown> = (
  queryKey: readonly string[],
  resources: QueryOnlyResources<Resources>,
  ...args: [Input] extends [void] ? [exit: Exit.Exit<Success, Failure>]
    : [input: Input, exit: Exit.Exit<Success, Failure>]
) => ReadonlyArray<InvalidateQueryInstruction>

export type InvalidationConfig<Resources, Input = unknown, Success = unknown, Failure = unknown> = {
  readonly invalidatesQueries: InvalidationCallback<Resources, Input, Success, Failure>
  readonly invalidationResources?: Resources
}

type InvalidationConfigForCommand<
  Resources,
  Payload extends S.Struct.Fields,
  Success extends S.Top,
  Error extends S.Top
> = InvalidationConfig<
  Resources,
  InputFromPayload<Payload>,
  OutputFromSuccess<Success>,
  S.Schema.Type<Error>
>

export const configureInvalidation = <Resources>() =>
<Input = unknown, Success = unknown, Failure = unknown>(
  invalidatesQueries: InvalidationCallback<Resources, Input, Success, Failure>
): InvalidationConfig<Resources, Input, Success, Failure> =>
  ({ invalidatesQueries }) as InvalidationConfig<
    Resources,
    Input,
    Success,
    Failure
  >

export const configureInvalidationCallback = <Resources>() =>
<Input = unknown, Success = unknown, Failure = unknown>(
  invalidatesQueries: InvalidationCallback<Resources, Input, Success, Failure>
): InvalidationCallback<Resources, Input, Success, Failure> => invalidatesQueries

type TaggedRequestForResult<
  Self,
  Tag extends string,
  Payload extends S.Struct.Fields,
  Success extends S.Top,
  Error extends S.Top,
  Config,
  ModuleName extends string,
  Type extends "command" | "query"
> =
  & S.EnhancedClass<Self, TaggedRequestSchema<Tag, Payload>, {}>
  & {
    readonly _tag: Tag
    readonly success: Success
    readonly error: Error
    readonly config: Config
    readonly "~decodingServices": S.Codec.DecodingServices<Success> | S.Codec.DecodingServices<Error>
    readonly "~encodingServices": S.Codec.EncodingServices<Success> | S.Codec.EncodingServices<Error>
    readonly id: `${ModuleName}.${Tag}`
    readonly moduleName: ModuleName
    readonly type: Type
  }

export const makeRpcClient = <
  RequestContextMap extends RequestContextMapTagAny,
  GeneralErrors extends S.Top = never
>(rcs: RequestContextMap, generalErrors?: GeneralErrors) => {
  // Long way around Context/C extends etc to support actual jsdoc from passed in RequestConfig etc... (??)
  type ServiceMap = {
    success: S.Top | S.Struct.Fields // SchemaOrFields will make a Schema type out of Struct.Fields
    error: S.Top | S.Struct.Fields // SchemaOrFields will make a Schema type out of Struct.Fields
  }

  type RequestConfig = GetContextConfig<RequestContextMap["config"]>

  type MergeError<E> = [GeneralErrors] extends [never] ? SchemaOrFields<E> : S.Union<[SchemaOrFields<E>, GeneralErrors]>
  type ErrorResult<C> = C extends { error: infer E } ? MergeError<E>
    : [GeneralErrors] extends [never] ? GetEffectError<RequestContextMap["config"], C>
    : MergeError<GetEffectError<RequestContextMap["config"], C>>

  // TODO: filter errors based on config + take care of inversion
  const errorSchemas = Object.values(rcs.config).map((_) => _.error)

  function makeRequestClass<Tag extends string, Fields extends S.Struct.Fields, C extends ServiceMap>(
    tag: Tag,
    fields: Fields,
    config?: C
  ) {
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
  }

  function makeTaggedRequestWithMeta<ModuleName extends string, Type extends "command" | "query">(
    moduleName: ModuleName,
    type: Type
  ) {
    function TaggedRequestWithMeta<Self>(): {
      <
        Tag extends string,
        Payload extends S.Struct.Fields,
        Success extends S.Top | S.Struct.Fields,
        Error extends S.Top | S.Struct.Fields,
        C extends RequestConfig & Record<string, any>,
        Resources extends Record<string, unknown> = Record<string, any>
      >(
        tag: Tag,
        fields: Payload,
        config:
          & C
          & { success: Success; error: Error }
          & Partial<
            InvalidationConfigForCommand<
              Resources,
              Payload,
              SchemaOrFields<Success>,
              ErrorResult<C & { success: Success; error: Error }>
            >
          >
      ): TaggedRequestForResult<
        Self,
        Tag,
        Payload,
        SchemaOrFields<Success>,
        ErrorResult<C & { success: Success; error: Error }>,
        Omit<
          & C
          & { success: Success; error: Error }
          & Partial<
            InvalidationConfigForCommand<
              Resources,
              Payload,
              SchemaOrFields<Success>,
              ErrorResult<C & { success: Success; error: Error }>
            >
          >,
          "success" | "error"
        >,
        ModuleName,
        Type
      >
      <
        Tag extends string,
        Payload extends S.Struct.Fields,
        Success extends S.Top | S.Struct.Fields,
        C extends RequestConfig & Record<string, any> & { error?: never },
        Resources extends Record<string, unknown> = Record<string, any>
      >(
        tag: Tag,
        fields: Payload,
        config:
          & C
          & { success: Success }
          & Partial<
            InvalidationConfigForCommand<
              Resources,
              Payload,
              SchemaOrFields<Success>,
              ErrorResult<C & { success: Success }>
            >
          >
      ): TaggedRequestForResult<
        Self,
        Tag,
        Payload,
        SchemaOrFields<Success>,
        ErrorResult<C & { success: Success }>,
        Omit<
          & C
          & { success: Success }
          & Partial<
            InvalidationConfigForCommand<
              Resources,
              Payload,
              SchemaOrFields<Success>,
              ErrorResult<C & { success: Success }>
            >
          >,
          "success" | "error"
        >,
        ModuleName,
        Type
      >
      <
        Tag extends string,
        Payload extends S.Struct.Fields,
        Error extends S.Top | S.Struct.Fields,
        C extends RequestConfig & Record<string, any> & { success?: never },
        Resources extends Record<string, unknown> = Record<string, any>
      >(
        tag: Tag,
        fields: Payload,
        config:
          & C
          & { error: Error }
          & Partial<
            InvalidationConfigForCommand<
              Resources,
              Payload,
              typeof ForceVoid,
              ErrorResult<C & { error: Error }>
            >
          >
      ): TaggedRequestForResult<
        Self,
        Tag,
        Payload,
        typeof ForceVoid,
        ErrorResult<C & { error: Error }>,
        Omit<
          & C
          & { error: Error }
          & Partial<
            InvalidationConfigForCommand<
              Resources,
              Payload,
              typeof ForceVoid,
              ErrorResult<C & { error: Error }>
            >
          >,
          "success" | "error"
        >,
        ModuleName,
        Type
      >
      <
        Tag extends string,
        Payload extends S.Struct.Fields,
        C extends RequestConfig & Record<string, any> & { success?: never; error?: never },
        Resources extends Record<string, unknown> = Record<string, any>
      >(
        tag: Tag,
        fields: Payload,
        config: C & Partial<InvalidationConfigForCommand<Resources, Payload, typeof ForceVoid, ErrorResult<C>>>
      ): TaggedRequestForResult<
        Self,
        Tag,
        Payload,
        typeof ForceVoid,
        ErrorResult<C>,
        Omit<
          C & Partial<InvalidationConfigForCommand<Resources, Payload, typeof ForceVoid, ErrorResult<C>>>,
          "success" | "error"
        >,
        ModuleName,
        Type
      >
      <Tag extends string, Payload extends S.Struct.Fields>(
        tag: Tag,
        fields: Payload
      ): TaggedRequestForResult<
        Self,
        Tag,
        Payload,
        typeof ForceVoid,
        ErrorResult<{}>,
        Record<string, never>,
        ModuleName,
        Type
      >
    } {
      return (<Tag extends string, Fields extends S.Struct.Fields, C extends ServiceMap>(
        tag: Tag,
        fields: Fields,
        config?: C
      ) => {
        const cls = makeRequestClass(tag, fields, config)
        Object.assign(cls, { id: `${moduleName}.${tag}`, moduleName, type })
        return cls
      }) as any
    }
    return Object.assign(TaggedRequestWithMeta, { moduleName, type } as const)
  }

  function TaggedRequestFor<ModuleName extends string>(moduleName: ModuleName) {
    const Query = makeTaggedRequestWithMeta(moduleName, "query")
    const Command = makeTaggedRequestWithMeta(moduleName, "command")

    return {
      moduleName,
      /**
       * Create query request classes for this module.
       * Queries read state and should not mutate server state.
       */
      Query,
      /**
       * Create command request classes for this module.
       * Commands mutate state and should avoid returning complex read models.
       */
      Command
    } as const
  }

  return {
    TaggedRequestFor
  }
}
