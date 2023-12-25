import { pipe } from "@effect-app/core/Function"

import * as S from "../_schema.js"
import * as Th from "../These.js"
import { string } from "./string.js"
import type { DefaultSchema } from "./withDefaults.js"
import { withDefaults } from "./withDefaults.js"

export const jsonFromStringIdentifier = S.makeAnnotation<{}>()

export class JsonDecodingE
  extends Data.TaggedError("NotJsonString")<{ readonly actual: string; readonly error: unknown }>
  implements S.Actual<string>, S.HasDefaultLeafE
{
  readonly [S.defaultLeafSymbol] = S.defaultLeafSymbol
  get [S.toTreeSymbol](): S.Tree<string> {
    return S.tree(
      `cannot decode JSON from ${this.actual}, expected a valid JSON string`
    )
  }
}

export const jsonString: DefaultSchema<string, unknown, unknown, string, {}> = pipe(
  S.identity((u): u is string => typeof u === "string"),
  S.constructor((n) => Th.succeed(n)),
  S.arbitrary((_) => _.anything()),
  S.encoder((_) => JSON.stringify(_)),
  S.parser((p: string) => {
    try {
      return Th.succeed(JSON.parse(p as any))
    } catch (err) {
      return Th.fail(S.leafE(new JsonDecodingE({ actual: p, error: err })))
    }
  }),
  withDefaults,
  S.annotate(jsonFromStringIdentifier, {})
)

export const jsonIdentifier = S.makeAnnotation<{}>()

export const json: DefaultSchema<unknown, unknown, unknown, string, {}> = pipe(
  string[">>>"](jsonString),
  withDefaults,
  S.annotate(jsonIdentifier, {})
)
