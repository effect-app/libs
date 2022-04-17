import * as A from "@effect-ts/core/Collections/Immutable/Array"
import * as Map from "@effect-ts/core/Collections/Immutable/Map"
import { pipe } from "@effect-ts/core/Function"
import * as Sy from "@effect-ts/core/Sync"
import * as MO from "@effect-ts-app/core/Schema"
import { Encoder, Parser } from "@effect-ts-app/core/Schema"
import { ParserEnv } from "@effect-ts-app/core/Schema/custom/Parser"

export function makeCodec<
  ParsedShape extends { id: Id },
  ConstructorInput,
  Encoded,
  Api,
  Id
>(self: MO.Schema<unknown, ParsedShape, ConstructorInput, Encoded, Api>) {
  const parse = Parser.for(self)["|>"](MO.condemnDie)
  // TODO: strict
  const decode = (e: Encoded, env?: ParserEnv) => parse(e, env)
  const enc = Encoder.for(self)

  const encode = (u: ParsedShape) => Sy.succeedWith(() => enc(u))
  const encodeToMap = toMap(encode)
  return [decode, encode, encodeToMap] as const
}

function toMap<E, A extends { id: Id }, Id>(encode: (a: A) => Sy.UIO<E>) {
  return (a: A.Array<A>) =>
    pipe(
      A.map_(a, (task) => Sy.tuple(Sy.succeed(task.id as A["id"]), encode(task))),
      Sy.collectAll,
      Sy.map(Map.make)
    )
}
