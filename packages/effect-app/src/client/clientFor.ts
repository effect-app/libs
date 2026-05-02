/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Record from "effect/Record"
import type * as Stream from "effect/Stream"
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
  handler: (i: I) => Effect.Effect<A, E, R>
  id: Id
  options?: ClientForOptions
  Request: Request
}

export interface RequestStreamHandler<A, E, R, Request extends Req, Id extends string, Final = A> {
  handler: Stream.Stream<A, E, R>
  id: Id
  options?: ClientForOptions
  Request: Request
  /**
   * Phantom type property (never set at runtime) that carries the `Final` type to
   * `StreamMutationWithExtensions`. The tilde prefix follows the Effect convention for
   * phantom/virtual properties and prevents accidental runtime access.
   * When the stream fails, the execute effect still resolves (with `undefined`);
   * check the reactive `AsyncResult` ref to distinguish success from failure.
   */
  readonly "~final"?: Final
}

export interface RequestStreamHandlerWithInput<I, A, E, R, Request extends Req, Id extends string, Final = A> {
  handler: (i: I) => Stream.Stream<A, E, R>
  id: Id
  options?: ClientForOptions
  Request: Request
  /**
   * Phantom type property (never set at runtime) that carries the `Final` type to
   * `StreamMutationWithExtensions`. The tilde prefix follows the Effect convention for
   * phantom/virtual properties and prevents accidental runtime access.
   * When the stream fails, the execute effect still resolves (with `undefined`);
   * check the reactive `AsyncResult` ref to distinguish success from failure.
   */
  readonly "~final"?: Final
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

/** Extracts the final-value type from a stream request. Defaults to the success type when no `final` schema is set. */
type FinalTypeOf<T extends Req> = T extends { readonly final: infer F extends S.Top } ? S.Schema.Type<F>
  : S.Schema.Type<T["success"]>

type RequestHandlerFor<R, E, T extends Req, Id extends string> = T["type"] extends "stream"
  ? IsTagOnly<RequestInputFromMake<T>> extends true ? RequestStreamHandler<
      S.Schema.Type<T["success"]>,
      S.Schema.Type<T["error"]> | E,
      R | ReqDecodingServices<T>,
      T,
      Id,
      FinalTypeOf<T>
    >
  : RequestStreamHandlerWithInput<
    RequestInput<T>,
    S.Schema.Type<T["success"]>,
    S.Schema.Type<T["error"]> | E,
    R | ReqDecodingServices<T>,
    T,
    Id,
    FinalTypeOf<T>
  >
  : IsTagOnly<RequestInputFromMake<T>> extends true ? RequestHandler<
      S.Schema.Type<T["success"]>,
      S.Schema.Type<T["error"]> | E,
      R | ReqDecodingServices<T>,
      T,
      Id
    >
  : RequestHandlerWithInput<
    RequestInput<T>,
    S.Schema.Type<T["success"]>,
    S.Schema.Type<T["error"]> | E,
    R | ReqDecodingServices<T>,
    T,
    Id
  >

export type RequestHandlers<R, E, M extends RequestsAny, ModuleName extends string> = {
  [K in keyof M as M[K] extends Req ? K : never]: Extract<M[K], Req> extends infer T extends Req
    ? RequestHandlerFor<R, E, T, `${ModuleName}.${K & string}`>
    : never
}
