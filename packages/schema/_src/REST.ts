/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Path } from "path-parser"

import type * as Methods from "./Methods.js"

import type { FromStruct, StructFields, ToStruct } from "@effect/schema/Schema"
import { Tag } from "effect/Context"
import type { Simplify } from "effect/Types"
import { AST, S } from "./schema.js"

export type StringRecord = Record<string, string>

export type AnyRecord = Record<string, any>

export type AnyRecordSchema = S.Schema<AnyRecord, AnyRecord>

const RequestTag = Tag<never, never>()

export { Methods }

export const reqBrand = Symbol()

// Actually GET + DELETE
export interface QueryRequest<
  M,
  Path extends StructFields | undefined,
  Query extends StructFields | undefined,
  Headers extends StructFields | undefined,
  Fields extends StructFields,
  PPath extends `/${string}`
> extends S.Class<Simplify<FromStruct<Fields>>, Simplify<ToStruct<Fields>>, Simplify<ToStruct<Fields>>, M, Fields> { // , PropsExtensions<GetClassProps<Fields>>
  Body: undefined
  Path: Path
  Query: Query
  Headers: Headers
  path: PPath
  method: Methods.ReadMethods
  Tag: Tag<M, M>
  [reqBrand]: typeof reqBrand
}

// Actually all other methods except GET + DELETE
export interface BodyRequest<
  M,
  Path extends StructFields | undefined,
  Body extends StructFields | undefined,
  Query extends StructFields | undefined,
  Headers extends StructFields | undefined,
  Fields extends StructFields,
  PPath extends `/${string}`
> extends S.Class<Simplify<FromStruct<Fields>>, Simplify<ToStruct<Fields>>, Simplify<ToStruct<Fields>>, M, Fields> { // , PropsExtensions<GetClassProps<Self>>
  Path: Path
  Body: Body
  Query: Query
  Headers: Headers
  path: PPath
  method: Methods.WriteMethods
  Tag: Tag<M, M>
  [reqBrand]: typeof reqBrand
}

type ResponseString = "Response" | `${string}Response`
type RequestString = "Request" | "default" | `${string}Request`

type FilterRequest<U> = U extends RequestString ? U : never
export type GetRequestKey<U extends Record<RequestString | "Response", any>> = FilterRequest<keyof U>
export type GetRequest<U extends Record<RequestString | "Response", any>> = FilterRequest<keyof U> extends never ? never
  : U[FilterRequest<keyof U>]

type FilterResponse<U> = U extends ResponseString ? U : never
export type GetResponseKey<U extends Record<ResponseString, any>> = FilterResponse<
  keyof U
>
export type GetResponse<U extends Record<ResponseString, any>> = FilterResponse<
  keyof U
> extends never ? typeof S.void
  : U[FilterResponse<keyof U>]

export function extractRequest<TModule extends Record<string, any>>(
  h: TModule
): GetRequest<TModule> {
  const reqKey = Object.keys(h).find((x) => x.endsWith("Request"))
    || Object.keys(h).find((x) => x === "default")
  if (!reqKey) {
    throw new Error("Module appears to have no Request: " + Object.keys(h).join(", "))
  }
  const Request = h[reqKey]
  return Request
}

export function extractResponse<TModule extends Record<string, any>>(
  h: TModule
): GetResponse<TModule> | typeof S.void {
  const resKey = Object.keys(h).find((x) => x.endsWith("Response"))
  if (!resKey) {
    return S.void
  }
  const Response = h[resKey]
  return Response
}

// export const reqId = S.makeAnnotation()

type OrAny<T> = Exclude<T, undefined>
// type OrUndefined<T> = T extends S.Schema<any, any> ? undefined : S.Schema<any, any>

// TODO: Somehow ensure that Self and M are related..
// type Ensure<M, Self extends S.Schema<any, any>> = M extends S.Schema.To<Self> ? M : never
export function QueryRequest<M>(__name?: string) {
  function a<Headers extends StructFields, PPath extends `/${string}`>(
    method: Methods.ReadMethods,
    path: PPath,
    s: StructFields,
    _: {
      headers?: Headers
    }
  ): QueryRequest<M, undefined, undefined, Headers, StructFields, PPath>
  function a<Path extends StructFields, Headers extends StructFields, PPath extends `/${string}`>(
    method: Methods.ReadMethods,
    path: PPath,
    s: StructFields,
    _: {
      headers?: Headers
      path: Path
    }
  ): QueryRequest<M, Path, undefined, Headers, Path, PPath>
  function a<Query extends StructFields, Headers extends StructFields, PPath extends `/${string}`>(
    method: Methods.ReadMethods,
    path: PPath,
    s: StructFields,
    {
      headers,
      query
    }: {
      headers?: Headers
      query: Query
    }
  ): QueryRequest<M, undefined, Query, Headers, Query, PPath>
  function a<
    QueryFields extends StructFields,
    PathFields extends StructFields,
    HeadersFields extends StructFields,
    PPath extends `/${string}`
  >(
    method: Methods.ReadMethods,
    path: PPath,
    s: StructFields,
    _: {
      headers?: HeadersFields
      path: PathFields
      query: QueryFields
    }
  ): QueryRequest<
    M,
    PathFields,
    QueryFields,
    HeadersFields,
    QueryFields,
    PPath
  >
  function a<
    PathFields extends StructFields,
    QueryFields extends StructFields,
    HeadersFields extends StructFields,
    PPath extends `/${string}`
  >(
    method: Methods.ReadMethods,
    path: PPath,
    s: StructFields,
    _: {
      headers?: HeadersFields
      path?: PathFields
      query?: QueryFields
    }
  ): QueryRequest<
    M,
    PathFields,
    QueryFields,
    HeadersFields,
    PathFields & QueryFields,
    PPath
  > {
    class Self extends S.Class<Self>()(s) {
      static Body = undefined
      static Path = _.path
      static Query = _.query
      static Headers = _.headers
      static path = path
      static method = method
      static Tag = RequestTag
      static [reqBrand] = reqBrand
      static override get ast() {
        return AST.setAnnotation(super.ast, AST.TitleAnnotationId, this.name)
      }
    }
    return Self as any
  }
  return a
}

export function BodyRequest<M>(__name?: string) {
  function a<Headers extends StructFields, PPath extends `/${string}`>(
    method: Methods.WriteMethods,
    path: PPath,
    s: StructFields,
    _: {
      headers?: Headers
    }
  ): BodyRequest<M, undefined, undefined, undefined, Headers, {}, PPath>
  function a<Path extends StructFields, Headers extends StructFields, PPath extends `/${string}`>(
    method: Methods.WriteMethods,
    path: PPath,
    s: StructFields,
    _: {
      headers?: Headers
      path: Path
    }
  ): BodyRequest<M, Path, undefined, undefined, Headers, Path, PPath>
  function a<Body extends StructFields, Headers extends StructFields, PPath extends `/${string}`>(
    method: Methods.WriteMethods,
    path: PPath,
    s: StructFields,
    _: {
      headers?: Headers
      body: Body
    }
  ): BodyRequest<M, undefined, Body, undefined, Headers, Body, PPath>
  function a<
    BodyFields extends StructFields,
    QueryFields extends StructFields,
    HeadersFields extends StructFields,
    PPath extends `/${string}`
  >(
    method: Methods.WriteMethods,
    path: PPath,
    s: StructFields,
    _: {
      headers?: HeadersFields
      body: BodyFields
      query: QueryFields
    }
  ): BodyRequest<
    M,
    undefined,
    BodyFields,
    QueryFields,
    HeadersFields,
    BodyFields & QueryFields,
    PPath
  >
  function a<
    QueryFields extends StructFields,
    PathFields extends StructFields,
    HeadersFields extends StructFields,
    PPath extends `/${string}`
  >(
    method: Methods.WriteMethods,
    path: PPath,
    s: StructFields,
    _: {
      headers?: HeadersFields
      path: PathFields
      query: QueryFields
    }
  ): BodyRequest<
    M,
    PathFields,
    QueryFields,
    undefined,
    HeadersFields,
    QueryFields,
    PPath
  >
  function a<
    BodyFields extends StructFields,
    PathFields extends StructFields,
    HeadersFields extends StructFields,
    PPath extends `/${string}`
  >(
    method: Methods.WriteMethods,
    path: PPath,
    s: StructFields,
    _: {
      headers?: HeadersFields
      path: PathFields
      body: BodyFields
    }
  ): BodyRequest<
    M,
    PathFields,
    BodyFields,
    undefined,
    HeadersFields,
    BodyFields & PathFields,
    PPath
  >
  function a<
    BodyFields extends StructFields,
    PathFields extends StructFields,
    QueryFields extends StructFields,
    HeadersFields extends StructFields,
    PPath extends `/${string}`
  >(
    method: Methods.WriteMethods,
    path: PPath,
    s: StructFields,
    _: {
      headers?: HeadersFields
      path: PathFields
      body: BodyFields
      query: QueryFields
    }
  ): BodyRequest<
    M,
    PathFields,
    BodyFields,
    QueryFields,
    HeadersFields,
    BodyFields & PathFields & QueryFields,
    PPath
  >
  function a<
    Path extends StructFields,
    Body extends StructFields,
    Query extends StructFields,
    Headers extends StructFields,
    PPath extends `/${string}`
  >(
    method: Methods.WriteMethods,
    path: PPath,
    s: StructFields,
    _: {
      headers?: Headers
      path?: Path
      body?: Body
      query?: Query
    }
  ): BodyRequest<
    M,
    Path,
    Body,
    Query,
    Headers,
    OrAny<typeof _.path & typeof _.body & typeof _.query>,
    PPath
  > {
    class Self extends S.Class<Self>()(s) {
      static Path = _.path
      static Body = _.body
      static Query = _.query
      static Headers = _.headers
      static path = path
      static method = method
      static Tag = RequestTag
      static [reqBrand] = reqBrand
      static override get ast() {
        return AST.setAnnotation(super.ast, AST.TitleAnnotationId, this.name)
      }
    }
    return Self as any
  }
  return a
}

export interface Request<
  M,
  Fields extends StructFields,
  Path extends `/${string}`,
  Method extends Methods.Rest
> extends S.Class<Simplify<FromStruct<Fields>>, Simplify<ToStruct<Fields>>, Simplify<ToStruct<Fields>>, M, Fields> {
  method: Method
  path: Path
}

type Separator = "/" | "&" | "?.js"
export type PathParams<Path extends string> = Path extends `:${infer Param}${Separator}${infer Rest}`
  ? Param | PathParams<Rest>
  : Path extends `:${infer Param}` ? Param
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  : Path extends `${infer _Prefix}:${infer Rest}` ? PathParams<`:${Rest}`>
  : never

export type IfPathPropsProvided<Path extends string, B extends StructFields, C> =
  // Must test the PathParams inside here, as when they evaluate to never, the whole type would otherwise automatically resolve to never
  PathParams<Path> extends never ? C
    : PathParams<Path> extends keyof B ? C
    : ["You must specify the properties that you expect in the path", never]

/**
 * DELETE http method.
 * Input parameters other than Path, will be sent as QueryString.
 * Path parameters (specified with `:param_name`) must be present in the provided Schema.
 */
export function Delete<Path extends `/${string}`, Config extends object = {}>(path: Path, config?: Config) {
  return MethodReqProps2_("DELETE", path, config)
}
/**
 * PUT http method.
 * Input parameters other than Path, will be sent as Body.
 * Path parameters (specified with `:param_name`) must be present in the provided Schema.
 */
export function Put<Path extends `/${string}`, Config extends object = {}>(path: Path, config?: Config) {
  return MethodReqProps2_("PUT", path, config)
}

/**
 * GET http method.
 * Input parameters other than Path, will be sent as QueryString.
 * Path parameters (specified with `:param_name`) must be present in the provided Schema.
 */
export function Get<Path extends `/${string}`, Config extends object = {}>(path: Path, config?: Config) {
  return MethodReqProps2_("GET", path, config)
}
/**
 * PATCH http method.
 * Input parameters other than Path, will be sent as Body.
 * Path parameters (specified with `:param_name`) must be present in the provided Schema.
 */
export function Patch<Path extends `/${string}`, Config extends object = {}>(path: Path, config?: Config) {
  return MethodReqProps2_("PATCH", path, config)
}
/**
 * POST http method.
 * Input parameters other than Path, will be sent as Body.
 * Path parameters (specified with `:param_name`) must be present in the provided Schema.
 */
export function Post<Path extends `/${string}`, Config extends object = {}>(path: Path, config?: Config) {
  return MethodReqProps2_("POST", path, config)
}

function MethodReqProps2_<Method extends Methods.Rest, Path extends `/${string}`, Config extends object = {}>(
  method: Method,
  path: Path,
  config?: Config
) {
  return <M>(__name?: string) => {
    function a(): BuildRequest<
      {},
      Path,
      Method,
      M,
      Config
    >
    function a<Fields extends StructFields>(
      fields: Fields
    ): BuildRequest<Fields, Path, Method, M, Config>
    function a<Fields extends StructFields>(fields?: Fields) {
      const req = Req<M>(__name)
      const r = fields ? req(method, path, fields, config) : req(method, path, {}, config)
      return r
    }

    return a
  }
}

/**
 * Automatically picks path, query and body, based on Path params and Request Method.
 */
function Req<M>(name?: string) {
  function a<
    Path extends `/${string}`,
    Method extends Methods.Rest,
    Fields extends StructFields,
    Config extends object = {}
  >(
    method: Method,
    path: Path,
    self: StructFields,
    config?: Config
  ) {
    return makeRequest<Fields, Path, Method, M, Config>(
      method,
      path,
      self,
      name,
      config
    )
  }
  return a
}

export function parsePathParams<Path extends `/${string}`>(path: Path) {
  const p = new Path(path)
  const params = p.urlParams as PathParams<Path>[]
  return params
}

type BuildRequest<
  Fields extends StructFields,
  Path extends `/${string}`,
  Method extends Methods.Rest,
  M,
  Config extends object = {}
> = IfPathPropsProvided<
  Path,
  Fields,
  Method extends "GET" | "DELETE" ?
      & QueryRequest<
        M,
        Pick<Fields, PathParams<Path>>,
        Omit<Fields, PathParams<Path>>,
        undefined,
        Fields,
        Path
      >
      & Config
    :
      & BodyRequest<
        M,
        Pick<Fields, PathParams<Path>>,
        Omit<Fields, PathParams<Path>>,
        undefined,
        undefined,
        Fields,
        Path
      >
      & Config
>

// NOTE: This ignores the original schema after building the new
export function makeRequest<
  Fields extends StructFields,
  Path extends `/${string}`,
  Method extends Methods.Rest,
  M,
  Config extends object = {}
>(
  method: Method,
  path: Path,
  s: StructFields,
  __name?: string,
  config?: Config
): BuildRequest<Fields, Path, Method, M, Config> {
  const pathParams = parsePathParams(path)
  const self = S.struct(s)
  // TODO: path struct must be parsed "from string"
  const remainSchema = pathParams.length ? self.pipe(S.omit(...pathParams as any)) : self
  const pathSchema = pathParams.length
    ? self.pipe(S.pick(...pathParams as any))
    : null

  const dest = method === "GET" || method === "DELETE" ? "query" : "body"
  const newSchema = {
    path: pathSchema ? pathSchema : undefined,
    // TODO: query fields must be parsed "from string"

    [dest]: remainSchema
  }
  if (method === "GET" || method === "DELETE") {
    return class extends Object.assign(
      QueryRequest<M>(__name)(
        method as Methods.ReadMethods,
        path,
        s,
        newSchema as any
      ),
      config ?? {}
    ) {} as any
  }
  return class extends Object.assign(
    BodyRequest<M>(__name)(
      method as Methods.WriteMethods,
      path,
      s,
      newSchema as any
    ),
    config ?? {}
  ) {} as any
}

// export function adaptRequest<
//   Fields extends StructFields,
//   Path extends `/${string}`,
//   Method extends Methods.Rest,
//   M,
//   Config extends object = {}
// >(req: Request<M, Fields, Path, Method>, config?: Config) {
//   return makeRequest<Fields, Path, Method, M, Config>(req.method, req.path, req, undefined, config)
// }

// export type Meta = { description?: string; summary?: string; openapiRef?: string }
// export const metaIdentifier = S.makeAnnotation<Meta>()
// export function meta<ParserInput, To, ConstructorInput, From, Api>(
//   meta: Meta
// ) {
//   return (self: S.Schema<ParserInput, To, ConstructorInput, From, Api>) => self.annotate(metaIdentifier, meta)
// }
// export const metaC = (m: Meta) => {
//   return function(cls: any) {
//     setSchema(cls, pipe(cls[schemaField], meta(m)) as any)
//     return cls
//   }
// }

export type ReqRes<From, To> = S.Schema<From, To>
// export type ReqResSchemed<E, A> = {
//   new(...args: any[]): any
//   encodeSync: ReturnType<typeof P.parseSync>
//   Model: ReqRes<E, A>
// }

export type RequestSchemed<E, A> = ReqRes<E, A> & { // ReqResSchemed<E, A> & {
  method: Methods.Rest
  path: string
}

/** @deprecated No-Op */
export function extractSchema<ResE, ResA>(
  Res: ReqRes<ResE, ResA> // | ReqResSchemed<ResE, ResA>
) {
  return Res
}
