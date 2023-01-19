/* eslint-disable @typescript-eslint/no-explicit-any */
import type { _E, _R } from "@effect-app/prelude/_ext/Prelude.ext"
import type { GetRequest, GetResponse } from "@effect-app/prelude/schema"
import { extractSchema, SchemaNamed } from "@effect-app/prelude/schema"
import * as MO from "@effect-app/prelude/schema"
import { pretty } from "@effect-app/prelude/utils"
import * as Ex from "@effect-app/infra-adapters/express/index"
import type {
  Encode,
  RequestHandler,
  RequestHandlerOptRes,
  RequestParsers
} from "@effect-app/infra-adapters/express/schema/requestHandler"
import { parseRequestParams } from "@effect-app/infra-adapters/express/schema/requestHandler"
import type { RouteDescriptorAny } from "@effect-app/infra-adapters/express/schema/routing"
import { makeRouteDescriptor } from "@effect-app/infra-adapters/express/schema/routing"
import type express from "express"
import type { ValidationError } from "../../errors.js"
import { RequestContext, RequestId } from "../../lib/RequestContext.js"
import type { SupportedErrors } from "./defaultErrorHandler.js"
import { defaultBasicErrorHandler } from "./defaultErrorHandler.js"
import { reportRequestError } from "./reportError.js"
import { snipString, snipValue } from "./util.js"

export function makeRequestParsers<
  R,
  PathA,
  CookieA,
  QueryA,
  BodyA,
  HeaderA,
  ReqA extends PathA & QueryA & BodyA,
  ResA,
  Errors
>(
  Request: RequestHandler<
    R,
    PathA,
    CookieA,
    QueryA,
    BodyA,
    HeaderA,
    ReqA,
    ResA,
    Errors
  >["Request"]
): RequestParsers<PathA, CookieA, QueryA, BodyA, HeaderA> {
  const ph = Effect(
    Opt.fromNullable(Request.Headers)
      .map(s => s)
      .map(Parser.for)
      .map(MO.condemnFail)
  )
  const parseHeaders = (u: unknown) => ph.flatMapOpt(d => d(u))

  const pq = Effect(
    Opt.fromNullable(Request.Query)
      .map(s => s)
      .map(Parser.for)
      .map(MO.condemnFail)
  )
  const parseQuery = (u: unknown) => pq.flatMapOpt(d => d(u))

  const pb = Effect(
    Opt.fromNullable(Request.Body)
      .map(s => s)
      .map(Parser.for)
      .map(MO.condemnFail)
  )
  const parseBody = (u: unknown) => pb.flatMapOpt(d => d(u))

  const pp = Effect(
    Opt.fromNullable(Request.Path)
      .map(s => s)
      .map(Parser.for)
      .map(MO.condemnFail)
  )
  const parsePath = (u: unknown) => pp.flatMapOpt(d => d(u))

  const pc = Effect(
    Opt.fromNullable(Request.Cookie)
      .map(s => s)
      .map(Parser.for)
      .map(MO.condemnFail)
  )
  const parseCookie = (u: unknown) => pc.flatMapOpt(d => d(u))

  return {
    parseBody,
    parseCookie,
    parseHeaders,
    parsePath,
    parseQuery
  }
}

export type MakeMiddlewareContext<ResE, R2 = never, PR = never> = (
  req: express.Request,
  res: express.Response,
  context: RequestContext
) => Effect<R2, ResE, Context<PR>>

export type Middleware<
  R,
  PathA,
  CookieA,
  QueryA,
  BodyA,
  HeaderA,
  ReqA extends PathA & QueryA & BodyA,
  ResA,
  ResE,
  R2 = never,
  PR = never
> = (
  handler: RequestHandler<R, PathA, CookieA, QueryA, BodyA, HeaderA, ReqA, ResA, ResE>
) => {
  handler: typeof handler
  makeContext: MakeMiddlewareContext<ResE, R2, PR>
}

export function match<
  R,
  E,
  PathA,
  CookieA,
  QueryA,
  BodyA,
  HeaderA,
  ReqA extends PathA & QueryA & BodyA,
  ResA,
  R2 = never,
  PR = never,
  RErr = never
>(
  requestHandler: RequestHandler<
    R,
    PathA,
    CookieA,
    QueryA,
    BodyA,
    HeaderA,
    ReqA,
    ResA,
    E
  >,
  errorHandler: <R>(
    req: express.Request,
    res: express.Response,
    requestContext: RequestContext,
    r2: Effect<R, E | ValidationError, void>
  ) => Effect<RErr, never, void>,
  middleware?: Middleware<
    R,
    PathA,
    CookieA,
    QueryA,
    BodyA,
    HeaderA,
    ReqA,
    ResA,
    E,
    R2,
    PR
  >
) {
  let makeMiddlewareContext = undefined
  if (middleware) {
    const { handler, makeContext } = middleware(requestHandler)
    requestHandler = handler
    makeMiddlewareContext = makeContext
  }
  return Ex.match(requestHandler.Request.method.toLowerCase() as any)(
    requestHandler.Request.path.split("?")[0],
    makeRequestHandler<R, E, PathA, CookieA, QueryA, BodyA, HeaderA, ReqA, ResA, R2, PR, RErr>(
      requestHandler,
      errorHandler,
      makeMiddlewareContext
    )
  ).zipRight(
    Effect(() =>
      makeRouteDescriptor(
        requestHandler.Request.path,
        requestHandler.Request.method,
        requestHandler
      )
    )
  )
}

export function respondSuccess<ReqA, A, E>(
  encodeResponse: (req: ReqA) => Encode<A, E>
) {
  return (req: ReqA, res: express.Response, a: A) =>
    Effect(() => encodeResponse(req)(a))
      .flatMap(r =>
        Effect(() => {
          r === undefined
            ? res.status(204).send()
            : res.status(200)
              .send(JSON.stringify(r))
        })
      )
}

export function makeRequestHandler<
  R,
  E,
  PathA,
  CookieA,
  QueryA,
  BodyA,
  HeaderA,
  ReqA extends PathA & QueryA & BodyA,
  ResA = void,
  R2 = never,
  PR = never,
  RErr = never
>(
  handler: RequestHandlerOptRes<
    R | PR,
    PathA,
    CookieA,
    QueryA,
    BodyA,
    HeaderA,
    ReqA,
    ResA,
    E
  >,
  errorHandler: <R>(
    req: express.Request,
    res: express.Response,
    requestContext: RequestContext,
    r2: Effect<R, E | ValidationError, void>
  ) => Effect<RErr | R, never, void>,
  makeMiddlewareContext?: MakeMiddlewareContext<E, R2, PR>
): (req: express.Request, res: express.Response) => Effect<RErr | R | R2, never, void> {
  const { Request, Response, adaptResponse, h: handle } = handler
  const response = Response ? extractSchema(Response as any) : Void
  const encoder = Encoder.for(response)
  const encodeResponse = adaptResponse
    ? (req: ReqA) => Encoder.for(adaptResponse(req))
    : () => encoder

  const requestParsers = makeRequestParsers(Request)
  const parseRequest = parseRequestParams(requestParsers)
  const respond = respondSuccess(encodeResponse)

  function getParams(req: express.Request) {
    return Effect(() => ({
      path: req.params,
      query: req.query,
      body: req.body,
      headers: req.headers
        ? Object.entries(req.headers).reduce((prev, [key, value]) => {
          prev[key] = snipValue(value)
          return prev
        }, {} as Record<string, any>)
        : req.headers,
      cookies: req.cookies
        ? Object.entries(req.cookies).reduce((prev, [key, value]) => {
          prev[key] = typeof value === "string" || Array.isArray(value)
            ? snipValue(value)
            : value
          return prev
        }, {} as Record<string, any>)
        : req.cookies
    }))
  }

  function makeContext(req: express.Request) {
    const start = new Date()
    const supported = ["en", "de"] as const
    const desiredLocale = req.headers["x-locale"]
    const locale = desiredLocale && supported.includes(desiredLocale as any)
      ? (desiredLocale as typeof supported[number])
      : ("en" as const)

    // const context = getAppInsightsContext()
    // if (!context) {
    //   throw new Error("AI Context missing")
    // }

    const requestId = req.headers["request-id"]
    const rootId = requestId ? RequestId.parseUnsafe(requestId) : RequestId.make()

    const requestContext = new RequestContext({
      rootId,
      name: ReasonableString(
        Request.Model instanceof SchemaNamed ? Request.Model.name : Request.name
      ),
      locale,
      createdAt: start
      // ...(context.operation.parentId
      //   ? {
      //     parent: new RequestContextParent({
      //       id: RequestId(context.operation.parentId),
      //       locale,
      //       name: ReasonableString("API Request")
      //     })
      //   }
      //   : {})
    })
    // context.requestContext = requestContext
    return requestContext
  }

  return (req: express.Request, res: express.Response) => {
    return Effect.struct({
      requestContext: Effect(() => {
        const requestContext = makeContext(req)
        if (req.method === "GET") {
          res.setHeader("Cache-Control", "no-store")
        }
        res.setHeader("Content-Language", requestContext.locale)
        return requestContext
      }),
      pars: getParams(req)
    })
      .flatMap(({ pars, requestContext }) =>
        Effect.logInfo("Processing request").apply(Effect.logAnnotates({
          method: req.method,
          path: req.originalUrl,
          reqPath: pars.path.$$.pretty,
          reqQuery: pars.query.$$.pretty,
          reqBody: pretty(pars.body),
          reqCookies: pretty(pars.cookies),
          reqHeaders: pars.headers.$$.pretty
        })).zipRight(
          Effect.suspendSucceed(() => {
            const handleRequest = parseRequest(req)
              .map(({ body, path, query }) => {
                const hn = {
                  ...body.value,
                  ...query.value,
                  ...path.value
                } as unknown as ReqA
                return hn
              })
              .flatMap(parsedReq =>
                handle(parsedReq as any)
                  .flatMap(r => respond(parsedReq, res, r))
              )
            // Commands should not be interruptable.
            const r = (
              req.method !== "GET" ? handleRequest.uninterruptible : handleRequest
            ) // .instrument("Performance.RequestResponse")
            // the first log entry should be of the request start.
            const r2 = makeMiddlewareContext
              ? r.provideSomeEnvironmentEffect(makeMiddlewareContext(req, res, requestContext))
              : // PR is not relevant here
                r as Effect<R, E | ValidationError, void>
            return errorHandler(
              req,
              res,
              requestContext,
              r2
            )
          })
        )
          .tapErrorCause(cause =>
            Effect.suspendSucceed(() => {
              res.status(500).send()
              return reportRequestError(cause, {
                requestContext,
                path: req.originalUrl,
                method: req.method
              })
            }).zipRight(
              Effect.suspendSucceed(() => {
                const headers = res.getHeaders()
                return Effect.logErrorCauseMessage(
                  "Processed request",
                  cause
                ).apply(Effect.logAnnotates({
                  method: req.method,
                  path: req.originalUrl,
                  statusCode: res.statusCode.toString(),
                  resHeaders: Object.entries(headers).reduce((prev, [key, value]) => {
                    prev[key] = value && typeof value === "string" ? snipString(value) : value
                    return prev
                  }, {} as Record<string, any>)
                    .$$.pretty
                }))
              })
            )
              .tapErrorCause(cause => Effect(() => console.error("Error occurred while reporting error", cause)))
          )
          .tap(() =>
            Effect.suspendSucceed(() => {
              const headers = res.getHeaders()
              return Effect.logInfo("Processed request").apply(Effect.logAnnotates({
                method: req.method,
                path: req.originalUrl,
                statusCode: res.statusCode.toString(),
                resHeaders: Object.entries(headers).reduce((prev, [key, value]) => {
                  prev[key] = value && typeof value === "string" ? snipString(value) : value
                  return prev
                }, {} as Record<string, any>)
                  .$$.pretty
              }))
            })
          )
          .provideService(RequestContext.Tag, requestContext) // otherwise external error reporter breaks.
          .setupRequest(requestContext)
      )
  }
}

export type RequestHandlers = { [key: string]: BasicRequestHandler }
export type BasicRequestHandler = RequestHandler<any, any, any, any, any, any, any, any, ValidationError>

export type AnyRequestHandler = RequestHandler<any, any, any, any, any, any, any, any, any>

type RouteAll<T extends RequestHandlers> = {
  [K in keyof T]: T[K] extends RequestHandler<
    infer R,
    any, // infer PathA,
    any, // infer CookieA,
    any, // infer QueryA,
    any, // infer BodyA,
    any, // infer HeaderA,
    any, // infer ReqA,
    any, // infer ResA,
    ValidationError // infer ResE
  > ? RouteMatch<R, never>
    : never
}

export type RouteMatch<
  R,
  // PathA,
  // CookieA,
  // QueryA,
  // BodyA,
  // HeaderA,
  // ReqA extends PathA & QueryA & BodyA,
  // ResA,
  PR = never
> = Effect<
  | Ex.ExpressAppConfig
  | Ex.ExpressApp
  | Exclude<
    R,
    PR
  >,
  never,
  RouteDescriptorAny // RouteDescriptor<R, PathA, CookieA, QueryA, BodyA, HeaderA, ReqA, ResA, SupportedErrors, Methods>
>

/**
 * Gather all handlers of a module and attach them to the Server.
 * Requires no login.
 */
export function matchAll<T extends RequestHandlers>(handlers: T) {
  const mapped = handlers.$$.keys.reduce((prev, cur) => {
    prev[cur] = match(handlers[cur] as AnyRequestHandler, defaultBasicErrorHandler)
    return prev
  }, {} as any) as RouteAll<typeof handlers>

  return mapped
}

/**
 * Gather all handlers of a module and attach them to the Server.
 * Requires no login.
 */
export function matchAllAlt<T extends RequestHandlersTest>(handlers: T) {
  const mapped = handlers.$$.keys.reduce((prev, cur) => {
    const matches = matchAll(handlers[cur])
    matches.$$.keys.forEach(key => prev[`${cur as string}.${key as string}`] = matches[key])
    return prev
  }, {} as any) as Flatten<RouteAllTest<typeof handlers>>

  return mapped
}

export type RequestHandlersTest = {
  [key: string]: Record<string, BasicRequestHandler>
}

export type RouteAllTest<T extends RequestHandlersTest> = {
  [K in keyof T]: RouteAll<T[K]>
}

// type JoinObjects<T extends Record<string, Record<string, any>> = { [`${K in keyof T }`]: RouteAll<T[K]> }

export type Flatten<T extends object> = object extends T ? object : {
  [K in keyof T]-?: (
    x: NonNullable<T[K]> extends infer V ? V extends object ? V extends readonly any[] ? Pick<T, K>
    : FlattenLVL1<V> extends infer FV ? ({
      [P in keyof FV as `${Extract<K, string | number>}.${Extract<P, string | number>}`]: FV[P]
    })
    : never
    : Pick<T, K>
      : never
  ) => void
} extends Record<keyof T, (y: infer O) => void> ? O extends unknown /* infer U */ ? { [K in keyof O]: O[K] } : never
: never

type FlattenLVL1<T extends object> = object extends T ? object : {
  [K in keyof T]-?: (
    x: NonNullable<T[K]> extends infer V ? V extends object ? V extends readonly any[] ? Pick<T, K>
    : /*: Flatten<V> extends infer FV ? ({
      [P in keyof FV as `${Extract<K, string | number>}.${Extract<P, string | number>}`]: FV[P]
    })
    : never
    */ Pick<T, K>
    : never
      : never
  ) => void
} extends Record<keyof T, (y: infer O) => void> ? O extends unknown /* infer U */ ? { [K in keyof O]: O[K] } : never
: never

export function handle<
  TModule extends Record<
    string,
    any // { Model: MO.SchemaAny; new (...args: any[]): any } | MO.SchemaAny
  >
>(
  _: TModule & { ResponseOpenApi?: any },
  adaptResponse?: any
) {
  // TODO: Prevent over providing // no strict/shrink yet.
  const Request = MO.extractRequest(_)
  const Response = MO.extractResponse(_)

  type ReqSchema = MO.GetRequest<TModule>
  type ResSchema = MO.GetResponse<TModule>
  type Req = InstanceType<
    ReqSchema extends { new(...args: any[]): any } ? ReqSchema
      : never
  >
  type Res = MO.ParsedShapeOf<Extr<ResSchema>>

  return <R, E>(
    h: (r: Req) => Effect<R, E, Res>
  ) => ({
    adaptResponse,
    h,
    Request,
    Response,
    ResponseOpenApi: _.ResponseOpenApi ?? Response
  } as ReqHandler<
    Req,
    R,
    E,
    Res,
    ReqSchema,
    ResSchema
  >)
}

export type Extr<T> = T extends { Model: MO.SchemaAny } ? T["Model"]
  : T extends MO.SchemaAny ? T
  : never

export interface ReqHandler<
  Req,
  R,
  E,
  Res,
  ReqSchema extends MO.SchemaAny,
  ResSchema extends MO.SchemaAny,
  CTX = any
> {
  h: (r: Req, ctx: CTX) => Effect<R, E, Res>
  Request: ReqSchema
  Response: ResSchema
  ResponseOpenApi: any
}

/**
 * Provided a module with resources, and provided an Object with resource handlers, will prepare route handlers to be attached to server.
 * @param mod The module with Resources you want to match.
 * @returns A function that must be called with an Object with a handler "Request -> Effect<R, E, Response>" for each resource defined in the Module.
 *
 * Example:
 * ```
 * class SayHelloRequest extends Get("/say-hello")<SayHelloRequest>()({ name: prop(ReasonableString) }) {}
 * class SayHelloResponse extends Model<SayHelloRequest>()({ message: prop(LongString) }) {}
 *
 * export const SayHelloControllers = matchResource({ SayHello: { SayHelloRequest, SayHelloResponse } })({
 *   SayHello: (req) => Effect({ message: `Hi ${req.name}` })
 * })
 * ```
 */
export function matchResource<TModules extends Record<string, Record<string, any>>>(mod: TModules) {
  type Keys = keyof TModules
  return <
    THandlers extends {
      [K in Keys]: (
        req: ReqFromSchema<GetRequest<TModules[K]>>
      ) => Effect<any, SupportedErrors, ResFromSchema<GetResponse<TModules[K]>>>
    }
  >(
    handlers: THandlers
  ) => {
    const handler = mod.$$.keys.reduce((prev, cur) => {
      prev[cur] = handle(mod[cur])(handlers[cur] as any)
      return prev
    }, {} as any)
    type HNDLRS = typeof handlers
    return handler as {
      [K in Keys]: ReqHandler<
        ReqFromSchema<GetRequest<TModules[K]>>,
        _R<ReturnType<HNDLRS[K]>>,
        _E<ReturnType<HNDLRS[K]>>,
        ResFromSchema<GetResponse<TModules[K]>>,
        GetRequest<TModules[K]>,
        GetResponse<TModules[K]>
      >
    }
  }
}

export type ReqFromSchema<ReqSchema> = InstanceType<
  ReqSchema extends { new(...args: any[]): any } ? ReqSchema
    : never
>

export type ResFromSchema<ResSchema> = ParsedShapeOf<Extr<ResSchema>>
