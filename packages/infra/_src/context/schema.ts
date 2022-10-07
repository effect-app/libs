import * as Map from "@effect-ts/core/Collections/Immutable/Map"
import * as MO from "@effect-ts-app/schema"
import { Encoder, Parser } from "@effect-ts-app/schema"
import { ParserEnv } from "@effect-ts-app/schema/custom/Parser"

export function makeCodec<
  ParsedShape extends { id: Id },
  ConstructorInput,
  Encoded,
  Api,
  Id
>(self: MO.Schema<unknown, ParsedShape, ConstructorInput, Encoded, Api>) {
  const parse = Parser.for(self) >= MO.condemnDie
  // TODO: strict
  const decode = (e: Encoded, env?: ParserEnv) => parse(e, env)
  const enc = Encoder.for(self)

  const encode = (u: ParsedShape) => Sync.succeedWith(() => enc(u))
  const encodeToMap = toMap(encode)
  return [decode, encode, encodeToMap] as const
}

function toMap<E, A extends { id: Id }, Id>(encode: (a: A) => Sync.UIO<E>) {
  return (a: ROArray<A>) =>
    ROArray.map_(a, (task) =>
      Sync.tuple(Sync.succeed(task.id as A["id"]), encode(task))
    )
      .collectAllSync()
      .map(Map.make)
}
