import { flow } from "effect"
import { Option, S } from "effect-app"
import type { Schema } from "effect-app/Schema"
import { typedKeysOf } from "effect-app/utils"
import type { ParsedQuery } from "query-string"

export function getQueryParam(search: ParsedQuery, param: string) {
  const v = search[param]
  if (Array.isArray(v)) {
    return v[0]
  }
  return v ?? null
}

export const getQueryParamO = flow(getQueryParam, Option.fromNullishOr)

export function parseRouteParamsOption<NER extends Record<string, S.Codec<any, any>>>(query: Record<string, any>, t: NER // enforce non empty
): {
  [K in keyof NER]: Option.Option<Schema.Type<NER[K]>>
} {
  return typedKeysOf(t).reduce(
    (prev, cur) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      prev[cur] = getQueryParamO(query, cur as string).pipe(
        Option.flatMap(S.decodeUnknownOption(t[cur]!))
      )

      return prev
    },
    {} as {
      [K in keyof NER]: Option.Option<Schema.Type<NER[K]>>
    }
  )
}

export function parseRouteParams<NER extends Record<string, S.Codec<any, any>>>(
  query: Record<string, any>,
  t: NER // enforce non empty
): {
  [K in keyof NER]: Schema.Type<NER[K]>
} {
  return typedKeysOf(t).reduce(
    (prev, cur) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      prev[cur] = S.decodeUnknownSync(t[cur]!)(
        (query as any)[cur]
      )

      return prev
    },
    {} as {
      [K in keyof NER]: Schema.Type<NER[K]>
    }
  )
}
