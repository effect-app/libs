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

export type ExtractResponse<T> = T extends S.Codec<any> ? T["Type"]
  : T extends unknown ? void
  : never

export type ExtractEResponse<T> = T extends S.Codec<any> ? T["Encoded"]
  : T extends unknown ? void
  : never

export interface ClientForOptions {
  readonly skipQueryKey?: readonly string[]
  /**
   * Middleware tag to attach to every rpc on the client. Schema-only — the
   * client never invokes the middleware (no Live impl required), but its
   * declared `error` schema joins the rpc failure union via
   * `Rpc.exitSchema`'s `rpc.middlewares[*].error` walk. Required when
   * middleware can throw errors that aren't part of the resource's declared
   * error union (e.g. auth middleware throwing `NotLoggedInError`); without
   * it the client decode would fail with a `SchemaError` for stream rpcs.
   */
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

export interface RequestHandlerWithInput<I, A, E, R, Request extends Req, Id extends string> {
  handler: (i: I) => Effect.Effect<A, E, R>
  id: Id
  options?: ClientForOptions
  Request: Request
}

/** Type alias: a no-input handler is simply `RequestHandlerWithInput<void, …>`. */
export type RequestHandler<A, E, R, Request extends Req, Id extends string> = RequestHandlerWithInput<
  void,
  A,
  E,
  R,
  Request,
  Id
>

export interface RequestStreamHandlerWithInput<I, A, E, R, Request extends Req, Id extends string, Final = A> {
  handler: (i: I) => Stream.Stream<A, E, R>
  id: Id
  options?: ClientForOptions
  Request: Request
  /**
   * Phantom type property (never set at runtime) that carries the `Final` type to
   * `StreamMutationWithExtensions`. The tilde prefix follows the Effect convention for
   * phantom/virtual properties and prevents accidental runtime access.
   * Stream failures bubble through the execute effect's typed error channel `E`;
   * the reactive `AsyncResult` ref also mirrors the failure for live progress UI.
   */
  readonly "~final"?: Final
}

/** Type alias: a no-input stream handler is simply `RequestStreamHandlerWithInput<void, …>`. */
export type RequestStreamHandler<A, E, R, Request extends Req, Id extends string, Final = A> =
  RequestStreamHandlerWithInput<void, A, E, R, Request, Id, Final>

// make sure this is exported or d.ts of apiClientFactory breaks?!
export type RequestInputFromMake<I extends { readonly make: (...args: any[]) => any }> = Parameters<I["make"]> extends
  [] ? void : Parameters<I["make"]>[0]

// Has no input only when the request schema declares no payload fields (the auto-added
// `_tag` field is ignored). Any payload fields (even all-optional) produce a function handler.
type HasNoFields<I> = I extends { readonly fields: infer F extends S.Struct.Fields }
  ? [Exclude<keyof F, "_tag">] extends [never] ? true : false
  : false

type RequestInput<I extends { readonly make: (...args: any[]) => any }> = Parameters<I["make"]>[0]

/**
 * Caller-facing input type for a request. `void` when the request schema has no fields;
 * otherwise `make`'s first param type.
 */
export type HandlerInput<I extends { readonly make: (...args: any[]) => any }> = HasNoFields<I> extends true ? void
  : RequestInput<I>

/** Extracts the final-value type from a stream request. Defaults to the success type when no `final` schema is set. */
type FinalTypeOf<T extends Req> = T extends { readonly final: infer F extends S.Top } ? F["Type"]
  : T["success"]["Type"]

// `T["success"]` / `T["error"]` are constrained to `S.Top` via `Req`, so we
// can read `["DecodingServices"]` directly. Avoids the conditional in
// `S.Codec.DecodingServices<X> = X extends Top ? X["DecodingServices"] : never`,
// which tsgo (native) fails to reduce in this generic position and leaves as
// `unknown`, polluting the `R` channel of every client handler.
type RequestHandlerFor<R, E, T extends Req, Id extends string> = T["stream"] extends true
  ? RequestStreamHandlerWithInput<
    HandlerInput<T>,
    T["success"]["Type"],
    T["error"]["Type"] | E,
    R | T["success"]["DecodingServices"] | T["error"]["DecodingServices"],
    T,
    Id,
    FinalTypeOf<T>
  >
  : RequestHandlerWithInput<
    HandlerInput<T>,
    T["success"]["Type"],
    T["error"]["Type"] | E,
    R | T["success"]["DecodingServices"] | T["error"]["DecodingServices"],
    T,
    Id
  >

export type RequestHandlers<R, E, M extends RequestsAny, ModuleName extends string> = {
  [K in keyof M as M[K] extends Req ? K : never]: Extract<M[K], Req> extends infer T extends Req
    ? RequestHandlerFor<R, E, T, `${ModuleName}.${K & string}`>
    : never
}
