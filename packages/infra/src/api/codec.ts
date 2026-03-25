import * as S from "effect-app/Schema"

export function makeCodec<
  From,
  To extends { id: Id },
  Id
>(self: S.Codec<To, From>) {
  return [S.decodeSync(self), S.encodeSync(self)] as const
}
