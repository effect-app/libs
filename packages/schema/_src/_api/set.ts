// tracing: off

import { every_, fromArray, Set, toArray } from "@effect-ts/core/Collections/Immutable/Set"

import * as MO from "../custom.js"
import * as Arbitrary from "../custom/Arbitrary.js"
import * as Encoder from "../custom/Encoder.js"
import * as Guard from "../custom/Guard.js"
import * as Th from "../custom/These.js"

export const setIdentifier = MO.makeAnnotation<{ self: MO.SchemaUPI }>()

export function set<ParsedShape, ConstructorInput, Encoded, Api>(
  self: MO.Schema<unknown, ParsedShape, ConstructorInput, Encoded, Api>,
  ord: Ord<ParsedShape>,
  eq_?: Equal<ParsedShape>
): MO.DefaultSchema<
  unknown,
  Set<ParsedShape>,
  Set<ParsedShape>,
  readonly Encoded[],
  { self: Api; eq: Equal<ParsedShape>; ord: Ord<ParsedShape> }
> {
  const refinement = (_: unknown): _ is Set<ParsedShape> => _ instanceof Set && every_(_, guardSelf)

  const guardSelf = Guard.for(self)
  const arbitrarySelf = Arbitrary.for(self)
  const encodeSelf = Encoder.for(self)

  const eq = eq_ ?? <Equal<ParsedShape>> { equals: (x, y) => ord.compare(x, y) === 0 }

  const fromArray_ = fromArray(eq)
  const toArray_ = toArray(ord)

  const fromChunk = pipe(
    MO.identity(refinement),
    MO.parser((u: Chunk<ParsedShape>) => Th.succeed(fromArray_(u.toArray))),
    MO.encoder((u): Chunk<ParsedShape> => Chunk.fromIterable(u)),
    MO.arbitrary(_ => _.uniqueArray(arbitrarySelf(_)).map(fromArray_))
  )

  return pipe(
    MO.chunk(self)[">>>"](fromChunk),
    MO.mapParserError(_ => ((_ as any).errors as Chunk<any>).unsafeHead.error),
    MO.constructor((_: Set<ParsedShape>) => Th.succeed(_)),
    MO.encoder(u => toArray_(u).map(encodeSelf)),
    MO.mapApi(() => ({ self: self.Api, eq, ord })),
    MO.withDefaults,
    MO.annotate(setIdentifier, { self })
  )
}
