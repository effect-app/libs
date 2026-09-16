import type { FieldValues } from "effect-app/Model/filter/types"
import * as S from "effect-app/Schema"
import type { PersistenceModelType, StoreConfig } from "effect-app/Store"
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
 *
 * Both directions are **strict**: they run the whole-document codec, so a
 * document that does not match the Encoded shape fails loudly rather than being
 * read back half-decoded.
 *
 * Migrating a legacy-shaped document is therefore not this codec's job: the
 * store applies `StoreConfig.jitM` to the raw JSON document *before* calling
 * `decode` (see {@link makeStoredDecode}), which is the only place where a
 * document can be repaired. A document `jitM` does not repair is a genuine
 * failure and throws here.
 *
 * `_etag` is infrastructure metadata rather than part of the domain document,
 * so it is split off before the codec runs and re-attached afterwards.
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

/**
 * The store *read* boundary: apply `jitM` to the raw JSON document - after the
 * adapter merged `defaultValues` into it - and only then decode JSON→Encoded
 * with the strict {@link makeJsonDocumentCodec} codec.
 *
 * This is the one place a legacy-shaped document can be repaired, and why
 * `jitM` can fix things no schema decode could - an explicit `null` where a
 * `Date` is expected, a key added after the document was written. It runs
 * before any schema decode sees the document; a document it does not repair
 * still fails loudly in `codec.decode`.
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
