/* eslint-disable @typescript-eslint/ban-types */
// tracing: off

import { Map } from "@effect-ts/core/Collections/Immutable/Map"
import { pipe } from "@effect-ts/core/Function"

import * as MO from "../custom"
import * as Arbitrary from "../custom/Arbitrary"
import * as Encoder from "../custom/Encoder"
import * as Guard from "../custom/Guard"
import * as Parser from "../custom/Parser"
import * as Th from "../custom/These"
import { tuple } from "./tuple"

export const mapIdentifier = MO.makeAnnotation<{}>()

export function map<
  KeyParsedShape,
  KeyConstructorInput,
  KeyEncoded,
  KeyApi,
  ParsedShape,
  ConstructorInput,
  Encoded,
  Api
>(
  key: MO.Schema<unknown, KeyParsedShape, KeyConstructorInput, KeyEncoded, KeyApi>,
  self: MO.Schema<unknown, ParsedShape, ConstructorInput, Encoded, Api>
): MO.DefaultSchema<
  unknown,
  Map<KeyParsedShape, ParsedShape>,
  Map<KeyParsedShape, ParsedShape>,
  readonly (readonly [KeyEncoded, Encoded])[],
  {}
> {
  const keyGuard = Guard.for(key)

  const guard = Guard.for(self)

  const maparr = MO.array(tuple(key, self))
  const mapParse = Parser.for(maparr)
  const mapEncode = Encoder.for(maparr)
  const mapArb = Arbitrary.for(maparr)

  const refinement = (_: unknown): _ is Map<KeyParsedShape, ParsedShape> =>
    _ instanceof Map &&
    Array.from(_.entries()).every(([key, value]) => keyGuard(key) && guard(value))

  return pipe(
    MO.identity(refinement),
    MO.constructor((s: Map<KeyParsedShape, ParsedShape>) => Th.succeed(s)),
    MO.arbitrary((_) => mapArb(_).map((x) => new Map(x))),
    MO.parser((i: unknown) =>
      mapParse(i)["|>"](Th.map((x) => new Map(x) as Map<KeyParsedShape, ParsedShape>))
    ),
    MO.encoder((_) => Array.from(_.entries())["|>"](mapEncode)),
    MO.mapApi(() => ({})),
    MO.withDefaults,
    MO.annotate(mapIdentifier, {})
  )
}
