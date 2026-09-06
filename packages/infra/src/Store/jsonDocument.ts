import type { FieldValues } from "effect-app/Model/filter/types"
import * as S from "effect-app/Schema"
import type { PersistenceModelType } from "effect-app/Store"
import { toJsonQueryValue } from "./utils.ts"

export interface JsonDocumentCodec<E extends FieldValues> {
  readonly encode: (doc: PersistenceModelType<E>) => PersistenceModelType<E>
  readonly decode: (doc: PersistenceModelType<E>) => PersistenceModelType<E>
}

const splitEtag = <E extends FieldValues>(doc: PersistenceModelType<E>) => {
  const { _etag, ...rest } = doc
  return { rest: rest as E, _etag }
}

const joinEtag = <E extends FieldValues>(
  rest: E,
  _etag: string | undefined
): PersistenceModelType<E> => (_etag === undefined ? rest : { ...rest, _etag })

/**
 * Encoded document ↔ JSON document. Prefer `Schema.toCodecJson(toEncoded(schema))`
 * when the store has a schema; otherwise lower Date/Map/Set structurally.
 */
export const makeJsonDocumentCodec = <E extends FieldValues>(schema?: S.Top): JsonDocumentCodec<E> => {
  if (schema) {
    const codec = S.toCodecJson(S.toEncoded(schema)) as S.Codec<E, S.Json>
    return {
      encode: (doc) => {
        const { rest, _etag } = splitEtag(doc)
        return joinEtag(S.encodeSync(codec)(rest) as E, _etag)
      },
      decode: (doc) => {
        const { rest, _etag } = splitEtag(doc)
        return joinEtag(S.decodeSync(codec)(rest as S.Json), _etag)
      }
    }
  }
  return {
    encode: (doc) => toJsonQueryValue(doc) as PersistenceModelType<E>,
    decode: (doc) => doc
  }
}
