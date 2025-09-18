/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Record from "effect/Record"
import type * as Request from "effect/Request"
import type { Path } from "path-parser"
import qs from "query-string"
import type * as Effect from "../Effect.js"
import type * as S from "../Schema.js"
import { type Req } from "./apiClientFactory.js"

export function makePathWithQuery(
  path: Path,
  pars: Record<
    string,
    | string
    | number
    | boolean
    | readonly string[]
    | readonly number[]
    | readonly boolean[]
    | null
  >
) {
  const forQs = Record.filter(pars, (_, k) => !path.params.includes(k))
  const q = forQs // { ...forQs, _: JSON.stringify(forQs) } // TODO: drop completely individual keys from query?, sticking to json only
  return (
    path.build(pars, { ignoreSearch: true, ignoreConstraints: true })
    + (Object.keys(q).length
      ? "?" + qs.stringify(q)
      : "")
  )
}

export function makePathWithBody(
  path: Path,
  pars: Record<
    string,
    | string
    | number
    | boolean
    | readonly string[]
    | readonly number[]
    | readonly boolean[]
    | null
  >
) {
  return path.build(pars, { ignoreSearch: true, ignoreConstraints: true })
}

export type Requests<ModuleName extends string = string> = { meta: { moduleName: ModuleName } } & RequestsAny
export type RequestsAny = Record<string, any>

export type Client<M extends RequestsAny, ModuleName extends string> = RequestHandlers<
  never,
  never,
  M,
  ModuleName
>

export type ExtractResponse<T> = T extends S.Schema<any, any, any> ? S.Schema.Type<T>
  : T extends unknown ? void
  : never

export type ExtractEResponse<T> = T extends S.Schema<any, any, any> ? S.Schema.Encoded<T>
  : T extends unknown ? void
  : never

type IsEmpty<T> = keyof T extends never ? true
  : false

type Cruft = "_tag" | Request.RequestTypeId | typeof S.symbolSerializable | typeof S.symbolWithResult

export interface ClientForOptions {
  readonly skipQueryKey?: readonly string[]
}

export interface RequestHandler<A, E, R, Request extends Req, Id extends string> {
  handler: Effect.Effect<A, E, R>
  id: Id
  options?: ClientForOptions
  Request: Request
}

export interface RequestHandlerWithInput<I, A, E, R, Request extends Req, Id extends string> {
  handler: (i: I) => Effect.Effect<A, E, R>
  id: Id
  options?: ClientForOptions
  Request: Request
}

// make sure this is exported or d.ts of apiClientFactory breaks?!
export type RequestHandlers<R, E, M extends RequestsAny, ModuleName extends string> = {
  [K in keyof M as M[K] extends Req ? K : never]: IsEmpty<Omit<S.Schema.Type<M[K]>, Cruft>> extends true
    ? RequestHandler<
      S.Schema.Type<M[K]["success"]>,
      S.Schema.Type<M[K]["failure"]> | E,
      R | S.Schema.Context<M[K]["success"]> | S.Schema.Context<M[K]["failure"]>,
      M[K],
      `${ModuleName}.${K & string}`
    >
    : RequestHandlerWithInput<
      Omit<S.Schema.Type<M[K]>, Cruft>,
      S.Schema.Type<M[K]["success"]>,
      S.Schema.Type<M[K]["failure"]> | E,
      R | S.Schema.Context<M[K]["success"]> | S.Schema.Context<M[K]["failure"]>,
      M[K],
      `${ModuleName}.${K & string}`
    >
}
