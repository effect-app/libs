/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  ConstructorInputOf,
  From,
  GetResponse,
  Methods,
  QueryRequest,
  RequestSchemed,
  To
} from "@effect-app/prelude/schema"
import { condemnCustom, Constructor, SchemaNamed, unsafeCstr } from "@effect-app/prelude/schema"
import * as utils from "@effect-app/prelude/utils"
import { Path } from "path-parser"
import type { ApiConfig } from "./config.js"
import type { FetchError, FetchResponse } from "./fetch.js"
import {
  fetchApi,
  fetchApi3S,
  fetchApi3SE,
  makePathWithBody,
  makePathWithQuery,
  mapResponseM,
  ResponseError
} from "./fetch.js"

export * from "./config.js"

type Requests = Record<string, Record<string, any>>
type AnyRequest = Omit<QueryRequest<any, any, any, any, any, any>, "method"> & {
  method: Methods.Rest
} & RequestSchemed<any, any>

const cache = new Map<any, Client<any>>()

export type Client<M extends Requests> =
  & RequestHandlers<ApiConfig | HttpClient.Default, FetchError | ResponseError, M>
  & RequestHandlersE<ApiConfig | HttpClient.Default, FetchError | ResponseError, M>

export function clientFor<M extends Requests>(models: M): Client<M> {
  const found = cache.get(models)
  if (found) {
    return found
  }
  const m = clientFor_(models)
  cache.set(models, m)
  return m
}

function clientFor_<M extends Requests>(models: M) {
  return (
    models
      .$$
      .keys
      // ignore module interop with automatic default exports..
      .filter((x) => x !== "default")
      .reduce(
        (prev, cur) => {
          const h = models[cur]

          const Request = Schema.extractRequest(h) as AnyRequest
          const Response = Schema.extractResponse(h)

          const b = Object.assign({}, h, { Request, Response })

          const meta = {
            Request,
            Response,
            mapPath: Request.path
          }

          const wm = new WeakMap()

          const cstri = Constructor.for(Request.Model).pipe(unsafeCstr)

          // we need to have the same constructed value for fetch aswell as mapPath
          const cstr = (req: any) => {
            const e = wm.get(req)
            if (e) return e
            const v = cstri(req)
            wm.set(req, v)
            return v
          }

          const parseResponse = flow(
            Schema.Parser.for(Response).pipe(condemnCustom),
            (_) => _.mapError((err) => new ResponseError(err))
          )

          const parseResponseE = flow(parseResponse, (x) => x.map(Response.encodeSync))

          const path = new Path(Request.path)

          // @ts-expect-error doc
          const actionName = utils.uncapitalize(cur)
          const requestName = NonEmptyString255(
            Request.Model instanceof SchemaNamed ? Request.Model.name : Request.name
          )

          // if we don't need fields, then also dont require an argument.
          const fields = [Request.Body, Request.Query, Request.Path]
            .filter((x) => x)
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            .flatMap((x) => Object.keys(x.Api.fields))
          // @ts-expect-error doc
          prev[actionName] = Request.method === "GET"
            ? fields.length === 0
              ? Object.assign(
                fetchApi(Request.method, Request.path)
                  .flatMap(
                    mapResponseM(parseResponse)
                  )
                  .withSpan("client.request", { attributes: { "request.name": requestName } }),
                meta
              )
              : Object.assign(
                (req: any) =>
                  fetchApi(Request.method, makePathWithQuery(path, cstr(req)))
                    .flatMap(mapResponseM(parseResponse))
                    .withSpan("client.request", { attributes: { "request.name": requestName } }),
                {
                  ...meta,
                  mapPath: (req: any) => req ? makePathWithQuery(path, cstr(req)) : Request.path
                }
              )
            : fields.length === 0
            ? Object.assign(
              fetchApi3S(b)({}).withSpan("client.request", { attributes: { "request.name": requestName } }),
              meta
            )
            : Object.assign(
              (req: any) =>
                fetchApi3S(b)(cstr(req)).withSpan("client.request", { attributes: { "request.name": requestName } }),
              {
                ...meta,
                mapPath: (req: any) =>
                  req
                    ? Request.method === "DELETE"
                      ? makePathWithQuery(path, cstr(req))
                      : makePathWithBody(path, cstr(req))
                    : Request.path
              }
            )
          // generate handler

          // @ts-expect-error doc
          prev[`${actionName}E`] = Request.method === "GET"
            ? fields.length === 0
              ? Object.assign(
                fetchApi(Request.method, Request.path)
                  .flatMap(
                    mapResponseM(parseResponseE)
                  )
                  .withSpan("client.request", { attributes: { "request.name": requestName } }),
                meta
              )
              : Object.assign(
                (req: any) =>
                  fetchApi(Request.method, makePathWithQuery(path, cstr(req)))
                    .flatMap(
                      mapResponseM(parseResponseE)
                    )
                    .withSpan("client.request", { attributes: { "request.name": requestName } }),
                {
                  ...meta,
                  mapPath: (req: any) => req ? makePathWithQuery(path, cstr(req)) : Request.path
                }
              )
            : fields.length === 0
            ? Object.assign(
              fetchApi3SE(b)({}).withSpan("client.request", { attributes: { "request.name": requestName } }),
              meta
            )
            : Object.assign(
              (req: any) =>
                fetchApi3SE(b)(cstr(req)).withSpan("client.request", { attributes: { "request.name": requestName } }),
              {
                ...meta,
                mapPath: (req: any) =>
                  req
                    ? Request.method === "DELETE"
                      ? makePathWithQuery(path, cstr(req))
                      : makePathWithBody(path, cstr(req))
                    : Request.path
              }
            ) // generate handler

          return prev
        },
        {} as Client<M>
      )
  )
}

export type ExtractResponse<T> = T extends { Model: Schema.SchemaAny } ? To<T["Model"]>
  : T extends Schema.SchemaAny ? To<T>
  : T extends unknown ? void
  : never

export type ExtractEResponse<T> = T extends { Model: Schema.SchemaAny } ? From<T["Model"]>
  : T extends Schema.SchemaAny ? From<T>
  : T extends unknown ? void
  : never

type RequestHandlers<R, E, M extends Requests> = {
  [K in keyof M & string as Uncapitalize<K>]: keyof Schema.GetRequest<
    M[K]
  >[Schema.schemaField]["Api"]["fields"] extends never
    ? Effect<R, E, FetchResponse<ExtractResponse<GetResponse<M[K]>>>> & {
      Request: Schema.GetRequest<M[K]>
      Reponse: ExtractResponse<GetResponse<M[K]>>
      mapPath: string
    }
    : keyof Schema.GetRequest<
      M[K]
    >[Schema.schemaField]["Api"]["fields"] extends Record<any, never>
      ? Effect<R, E, FetchResponse<ExtractResponse<GetResponse<M[K]>>>> & {
        Request: Schema.GetRequest<M[K]>
        Reponse: ExtractResponse<GetResponse<M[K]>>
        mapPath: string
      }
    :
      & ((
        req: ConstructorInputOf<Schema.GetRequest<M[K]>>
      ) => Effect<R, E, FetchResponse<ExtractResponse<GetResponse<M[K]>>>>)
      & {
        Request: Schema.GetRequest<M[K]>
        Reponse: ExtractResponse<GetResponse<M[K]>>
        // we use a weakmap as cache for converting constructor input to constructed.
        mapPath: (req?: ConstructorInputOf<Schema.GetRequest<M[K]>>) => string
      }
}

type RequestHandlersE<R, E, M extends Requests> = {
  [K in keyof M & string as `${Uncapitalize<K>}E`]: keyof Schema.GetRequest<
    M[K]
  >[Schema.schemaField]["Api"]["fields"] extends never
    ? Effect<R, E, FetchResponse<ExtractEResponse<GetResponse<M[K]>>>> & {
      Request: Schema.GetRequest<M[K]>
      Reponse: ExtractResponse<GetResponse<M[K]>>
      mapPath: string
    }
    : keyof Schema.GetRequest<
      M[K]
    >[Schema.schemaField]["Api"]["fields"] extends Record<any, never>
      ? Effect<R, E, FetchResponse<ExtractEResponse<GetResponse<M[K]>>>> & {
        Request: Schema.GetRequest<M[K]>
        Reponse: ExtractResponse<GetResponse<M[K]>>
        mapPath: string
      }
    :
      & ((
        req: ConstructorInputOf<Schema.GetRequest<M[K]>>
      ) => Effect<R, E, FetchResponse<ExtractEResponse<GetResponse<M[K]>>>>)
      & {
        Request: Schema.GetRequest<M[K]>
        Reponse: ExtractResponse<GetResponse<M[K]>>
        // we use a weakmap as cache for converting constructor input to constructed.
        mapPath: (req?: ConstructorInputOf<Schema.GetRequest<M[K]>>) => string
      }
}
