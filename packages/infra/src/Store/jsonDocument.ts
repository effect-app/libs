import type { FieldValues } from "effect-app/Model/filter/types"
import * as S from "effect-app/Schema"
import type { PersistenceModelType } from "effect-app/Store"
import { decodeWithSchema, toJsonQueryValue } from "./utils.ts"

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
 * Encoded document ↔ JSON document.
 *
 * Writes always carry a complete document, so `encode` uses the strict
 * whole-document codec `Schema.toCodecJson(toEncoded(schema))`.
 *
 * `decode` is deliberately lenient (see {@link decodeWithSchema}): it only
 * lifts the keys that are present back to native Encoded values (Date/Map/Set
 * and app-native declarations). It enforces neither required keys, nor
 * refinements, nor checks, because the store boundary runs *before* the
 * repository's `jitM` migration — an older-shaped document must still reach
 * `jitM`, which fills it in before the repository's own (strict) decode.
 *
 * Without a schema, Date/Map/Set are lowered structurally on write and
 * documents are read back as stored.
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
        return joinEtag(decodeWithSchema(schema, rest) as E, _etag)
      }
    }
  }
  return {
    encode: (doc) => toJsonQueryValue(doc) as PersistenceModelType<E>,
    decode: (doc) => doc
  }
}
