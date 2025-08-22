/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Record from "effect/Record"
import type * as Request from "effect/Request"
import type { Path } from "path-parser"
import qs from "query-string"
import type * as Effect from "../Effect.js"
import type * as S from "../Schema.js"

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

export type Requests = Record<string, any>

export type Client<M extends Requests> = RequestHandlers<
  never,
  never,
  M
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

export type TaggedRequestClassAny = S.Schema.Any & {
  readonly _tag: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly success: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly failure: any
}

export interface ClientForOptions {
  readonly skipQueryKey?: readonly string[]
}

export interface RequestHandler<A, E, R, Request extends TaggedRequestClassAny> {
  handler: Effect.Effect<A, E, R>
  name: string
  options?: ClientForOptions
  Request: Request
}

export interface RequestHandlerWithInput<I, A, E, R, Request extends TaggedRequestClassAny> {
  handler: (i: I) => Effect.Effect<A, E, R>
  name: string
  options?: ClientForOptions
  Request: Request
}

// make sure this is exported or d.ts of apiClientFactory breaks?!
export type RequestHandlers<R, E, M extends Requests> = {
  [K in keyof M]: IsEmpty<Omit<S.Schema.Type<M[K]>, Cruft>> extends true
    ? RequestHandler<S.Schema.Type<M[K]["success"]>, S.Schema.Type<M[K]["failure"]> | E, R, M[K]> & {
      raw: RequestHandler<S.Schema.Type<M[K]["success"]>, S.Schema.Type<M[K]["failure"]> | E, R, M[K]>
    }
    :
      & RequestHandlerWithInput<
        Omit<S.Schema.Type<M[K]>, Cruft>,
        S.Schema.Type<M[K]["success"]>,
        S.Schema.Type<M[K]["failure"]> | E,
        R,
        M[K]
      >
      & {
        raw: RequestHandlerWithInput<
          Omit<S.Schema.Type<M[K]>, Cruft>,
          S.Schema.Encoded<M[K]["success"]>,
          S.Schema.Type<M[K]["failure"]> | E,
          R,
          M[K]
        >
      }
}
