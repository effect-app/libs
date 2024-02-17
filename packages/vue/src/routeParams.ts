import { flow } from "effect"
import { Option, S } from "effect-app"
import type { REST, Schema } from "effect-app/schema"
import { typedKeysOf } from "effect-app/utils"
import type { ParsedQuery } from "query-string"

export function getQueryParam(search: ParsedQuery, param: string) {
  const v = search[param]
  if (Array.isArray(v)) {
    return v[0]
  }
  return v ?? null
}

export const getQueryParamO = flow(getQueryParam, Option.fromNullable)

export const parseOpt = <E, A>(t: REST.ReqRes<A, E, never>) => {
  const dec = flow(S.decodeUnknownEither(t), (x) =>
    x._tag === "Right"
      ? Option.some(x.right)
      : Option.none())
  return dec
}

export const parseOptUnknown = <E, A>(t: REST.ReqRes<A, E, never>) => {
  const dec = flow(S.decodeUnknownEither(t), (x) =>
    x._tag === "Right"
      ? Option.some(x.right)
      : Option.none())
  return dec
}

export function parseRouteParamsOption<NER extends Record<string, Schema<any, any, never>>>(
  query: Record<string, any>,
  t: NER // enforce non empty
): {
  [K in keyof NER]: Option<Schema.To<NER[K]>>
} {
  return typedKeysOf(t).reduce(
    (prev, cur) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      prev[cur] = getQueryParamO(query, cur as string).flatMap(parseOpt(t[cur]!))

      return prev
    },
    {} as {
      [K in keyof NER]: Option<Schema.To<NER[K]>>
    }
  )
}

export function parseRouteParams<NER extends Record<string, Schema<any, any, never>>>(
  query: Record<string, any>,
  t: NER // enforce non empty
): {
  [K in keyof NER]: Schema.To<NER[K]>
} {
  return typedKeysOf(t).reduce(
    (prev, cur) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      prev[cur] = S.decodeUnknownSync(t[cur]!)((query as any)[cur])

      return prev
    },
    {} as {
      [K in keyof NER]: Schema.To<NER[K]>
    }
  )
}
