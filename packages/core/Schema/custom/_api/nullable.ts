import { pipe } from "@effect-ts/core/Function"

import * as S from "../_schema"
import * as Arbitrary from "../Arbitrary"
import * as Constructor from "../Constructor"
import * as Encoder from "../Encoder"
import * as Guard from "../Guard"
import * as Parser from "../Parser"
import * as Th from "../These"
import type { DefaultSchema } from "./withDefaults"
import { withDefaults } from "./withDefaults"

export const nullableIdentifier = S.makeAnnotation<{ self: S.SchemaAny }>()

export type Nullable<A> = A | null

export function nullable<ParserInput, ParsedShape, ConstructorInput, Encoded, Api>(
  self: S.Schema<ParserInput, ParsedShape, ConstructorInput, Encoded, Api>
): DefaultSchema<
  Nullable<ParserInput>,
  Nullable<ParsedShape>,
  Nullable<ConstructorInput>,
  Nullable<Encoded>,
  Api
> {
  const guard = Guard.for(self)
  const arb = Arbitrary.for(self)
  const create = Constructor.for(self)
  const parse = Parser.for(self)
  const refinement = (u: unknown): u is Nullable<ParsedShape> => u === null || guard(u)
  const encode = Encoder.for(self)

  return pipe(
    S.identity(refinement),
    S.arbitrary((_) => _.option(arb(_))),
    S.parser((i: Nullable<ParserInput>) => (i === null ? Th.succeed(null) : parse(i))),
    S.constructor((x: Nullable<ConstructorInput>) =>
      x === null ? Th.succeed(null) : create(x)
    ),
    S.encoder((_) => (_ === null ? null : encode(_))),
    S.mapApi(() => self.Api as Api),
    withDefaults,
    S.annotate(nullableIdentifier, { self })
  )
}
