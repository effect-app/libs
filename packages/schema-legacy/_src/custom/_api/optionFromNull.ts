import { pipe } from "@effect-app/core/Function"

import * as S from "../_schema.js"
import * as Arbitrary from "../Arbitrary.js"
import * as Constructor from "../Constructor.js"
import * as Encoder from "../Encoder.js"
import * as Guard from "../Guard.js"
import * as Parser from "../Parser.js"
import * as Th from "../These.js"
import type { DefaultSchema } from "./withDefaults.js"
import { withDefaults } from "./withDefaults.js"

export const optionFromNullIdentifier = S.makeAnnotation<{ self: S.SchemaAny }>()

export function optionFromNull<
  ParserInput,
  To,
  ConstructorInput,
  From,
  Api
>(
  self: S.Schema<ParserInput, To, ConstructorInput, From, Api>
): DefaultSchema<
  ParserInput | null,
  Option<To>,
  Option<ConstructorInput>,
  From | null,
  Api
> {
  const guard = Guard.is(self)
  const arb = Arbitrary.for(self)
  const create = Constructor.for(self)
  const parse = Parser.for(self)
  const refinement = (u: unknown): u is Option<To> =>
    typeof u === "object"
    && u !== null
    && ["None", "Some"].indexOf(u["_tag"]) !== -1
    && ((u["_tag"] === "Some" && guard(u["value"])) || u["_tag"] === "None")
  const encode = Encoder.for(self)

  return pipe(
    S.identity(refinement),
    S.arbitrary((_) => _.option(arb(_)).map(Option.fromNullable)),
    S.parser((i: ParserInput | null, env) =>
      i === null
        ? Th.succeed(Option.none)
        : Th.map_((env?.cache ? env.cache.getOrSetParser(parse) : parse)(i), Option.some)
    ),
    S.constructor((x: Option<ConstructorInput>) =>
      x.match(
        { onNone: () => Th.succeed(Option.none), onSome: (v) => Th.map_(create(v), Option.some) }
      )
    ),
    S.encoder((_) => _.map(encode).value ?? null),
    S.mapApi(() => self.Api),
    withDefaults,
    S.annotate(optionFromNullIdentifier, { self })
  )
}
