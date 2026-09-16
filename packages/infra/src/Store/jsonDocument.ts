import type { FieldValues } from "effect-app/Model/filter/types"
import * as S from "effect-app/Schema"
import type { PersistenceModelType, StoreConfig } from "effect-app/Store"
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

/**
 * The store *read* boundary: apply `jitM` to the raw JSON document - after the
 * adapter merged `defaultValues` into it - and only then decode JSON→Encoded.
 *
 * This is what makes `jitM` able to repair legacy shapes, including explicit
 * `null`s: it runs before any schema decode sees the document.
 *
 * `_etag` is infrastructure metadata rather than part of the domain document,
 * so it is split off first and `jitM` never sees it.
 *
 * Returns `codec.decode` unchanged when there is no `jitM`; the write path,
 * which must not run migrations, keeps using `codec.decode` directly.
 */
export const makeStoredDecode = <E extends FieldValues>(
  codec: JsonDocumentCodec<E>,
  jitM: StoreConfig<E>["jitM"]
): JsonDocumentCodec<E>["decode"] => {
  if (jitM === undefined) return codec.decode
  return (doc) => {
    const { rest, _etag } = splitEtag(doc)
    // adapters type the stored document as the Encoded persistence model, but
    // at this point it is still the raw JSON document that `jitM` is written
    // against - and `jitM` returns JSON, which is what `codec.decode` consumes.
    const migrated = jitM(rest) as unknown as E
    return codec.decode(joinEtag(migrated, _etag))
  }
}
