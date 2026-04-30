/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Record from "effect/Record"
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

export type Requests = RequestsAny
export type RequestsAny = Record<string, any>

export type ExtractModuleName<M extends RequestsAny> =
  { [K in keyof M]: M[K] extends { moduleName: infer N extends string } ? N : never }[keyof M] extends
    infer R extends string ? R
    : string

export type Client<M extends RequestsAny, ModuleName extends string> = RequestHandlers<
  never,
  never,
  M,
  ModuleName
>

export type ExtractResponse<T> = T extends S.Codec<any> ? S.Schema.Type<T>
  : T extends unknown ? void
  : never

export type ExtractEResponse<T> = T extends S.Codec<any> ? S.Codec.Encoded<T>
  : T extends unknown ? void
  : never

export interface ClientForOptions {
  readonly skipQueryKey?: readonly string[]
}

// $Project/$Configuration.Index
// -> "$Project", "$Configuration", "Index"
export const makeQueryKey = ({ id, options }: { id: string; options?: ClientForOptions }) =>
  id
    .split("/")
    .filter((segment: string) => !options || !options.skipQueryKey?.includes(segment))
    .map((segment: string) => "$" + segment)
    .join(".")
    .split(".")

export interface RequestHandler<A, E, R, Request extends Req, Id extends string> {
  handler: Effect.Effect<A, E, R>
  id: Id
  options?: ClientForOptions
  Request: Request
}

export interface RequestHandlerWithInput<I, A, E, R, Request extends Req, Id extends string> {
  handler: undefined extends I ? (i?: Exclude<I, undefined>) => Effect.Effect<A, E, R>
    : (i: I) => Effect.Effect<A, E, R>
  id: Id
  options?: ClientForOptions
  Request: Request
}

// make sure this is exported or d.ts of apiClientFactory breaks?!
type ReqDecodingServices<M> = M extends { readonly "~decodingServices": infer DS } ? DS : never

type RequestFields<I> = I extends { readonly fields: infer F extends S.Struct.Fields } ? F : never

type RequestInputFromFields<I> = [RequestFields<I>] extends [never] ? never
  : keyof RequestFields<I> extends never ? void
  : S.Schema.Type<S.Struct<RequestFields<I>>>

type RequestInputFromOverloadedMake<I extends { readonly make: (...args: any[]) => any }> =
  Parameters<I["make"]> extends [] ? void
    : Parameters<I["make"]>[0]

export type RequestInputFromMake<I extends { readonly make: (...args: any[]) => any }> =
  [RequestInputFromFields<I>] extends [never] ? RequestInputFromOverloadedMake<I>
    : RequestInputFromFields<I>

type NormalizedRequestInput<T> = Omit<Exclude<T, undefined>, "_tag">

// If make's first param has only an optional _tag property, treat as no-input handler.
type IsTagOnly<T> = [Exclude<T, undefined>] extends [never] ? true
  : [keyof NormalizedRequestInput<T>] extends [never] ? true
  : false

type RequestInput<I extends { readonly make: (...args: any[]) => any }> = NormalizedRequestInput<
  RequestInputFromMake<I>
>

export type RequestHandlers<R, E, M extends RequestsAny, ModuleName extends string> = {
  [K in keyof M as M[K] extends Req ? K : never]: IsTagOnly<RequestInputFromMake<M[K]>> extends true ? RequestHandler<
      S.Schema.Type<M[K]["success"]>,
      S.Schema.Type<M[K]["error"]> | E,
      R | ReqDecodingServices<M[K]>,
      M[K],
      `${ModuleName}.${K & string}`
    >
    : RequestHandlerWithInput<
      RequestInput<M[K]>,
      S.Schema.Type<M[K]["success"]>,
      S.Schema.Type<M[K]["error"]> | E,
      R | ReqDecodingServices<M[K]>,
      M[K],
      `${ModuleName}.${K & string}`
    >
}
