import type { FieldValues } from "effect-app/Model/filter/types"
import * as Option from "effect-app/Option"
import * as S from "effect-app/Schema"
import type { PersistenceModelType, StoreConfig } from "effect-app/Store"
import * as Result from "effect/Result"
import { toJsonQueryValue } from "./utils.ts"

export interface JsonDocumentCodec<E extends FieldValues> {
  readonly encode: (doc: PersistenceModelType<E>) => PersistenceModelType<E>
  readonly decode: (doc: PersistenceModelType<E>) => PersistenceModelType<E>
}

/**
 * The store *read* boundary decode: a stored JSON document in, either the
 * Encoded document or the `S.SchemaError` saying why it is not one.
 *
 * Synchronous on purpose: it runs once per document over whole result sets, so
 * it must not allocate an Effect per row. Adapters lift the `Result` into their
 * Effect channel once per operation (see {@link decodeStoredMany}).
 */
export type StoredDecode<E extends FieldValues> = (
  doc: PersistenceModelType<E>
) => Result.Result<PersistenceModelType<E>, S.SchemaError>

const splitEtag = <E extends FieldValues>(doc: PersistenceModelType<E>) => {
  const { _etag, ...rest } = doc
  return { rest: rest as E, _etag }
}

const joinEtag = <E extends FieldValues>(
  rest: E,
  _etag: string | undefined
): PersistenceModelType<E> => (_etag === undefined ? rest : { ...rest, _etag })

/** JSON document ↔ Encoded document codec for a store's domain schema. */
const jsonCodec = <E extends FieldValues>(schema: S.Top) => S.toCodecJson(S.toEncoded(schema)) as S.Codec<E, S.Json>

/**
 * Encoded document ↔ JSON document. Prefer `Schema.toCodecJson(toEncoded(schema))`
 * when the store has a schema; otherwise lower Date/Map/Set structurally.
 *
 * Both directions are **strict**: they run the whole-document codec, so a
 * document that does not match the Encoded shape fails loudly rather than being
 * read back half-decoded.
 *
 * This is the **write** path codec: `encode` on the way to the database, and
 * `decode` to hand the just-written document back. The read path uses
 * {@link makeStoredDecode}, which applies `jitM` first and reports a document it
 * does not repair as a typed `S.SchemaError` instead of throwing.
 *
 * `_etag` is infrastructure metadata rather than part of the domain document,
 * so it is split off before the codec runs and re-attached afterwards.
 */
export const makeJsonDocumentCodec = <E extends FieldValues>(schema?: S.Top): JsonDocumentCodec<E> => {
  if (schema) {
    const codec = jsonCodec<E>(schema)
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
 * with the strict `Schema.toCodecJson(Schema.toEncoded(schema))` codec.
 *
 * This is the one place a legacy-shaped document can be repaired, and why
 * `jitM` can fix things no schema decode could - an explicit `null` where a
 * `Date` is expected, a key added after the document was written. It runs
 * before any schema decode sees the document.
 *
 * Nothing here is lenient: a document `jitM` does not repair still fails. It
 * fails as a typed `S.SchemaError` in a `Result` (via `S.decodeUnknownResult`)
 * rather than by throwing, so adapters can turn it into `Effect.fail` and
 * callers - `Repository.validateSample` in particular - can inspect it per
 * document instead of losing the whole run to a defect.
 *
 * `_etag` is infrastructure metadata rather than part of the domain document,
 * so it is split off first and `jitM` never sees it.
 */
export const makeStoredDecode = <E extends FieldValues>(
  schema: StoreConfig<E>["schema"],
  jitM: StoreConfig<E>["jitM"]
): StoredDecode<E> => {
  if (schema === undefined) {
    // schemaless store: the stored document is already the Encoded document,
    // so there is nothing to decode - only `jitM` to apply.
    if (jitM === undefined) return Result.succeed
    return (doc) => {
      const { rest, _etag } = splitEtag(doc)
      return Result.succeed(joinEtag(jitM(rest) as unknown as E, _etag))
    }
  }
  const decode = S.decodeUnknownResult(jsonCodec<E>(schema))
  return (doc) => {
    const { rest, _etag } = splitEtag(doc)
    // adapters type the stored document as the Encoded persistence model, but
    // at this point it is still the raw JSON document that `jitM` is written
    // against - and `jitM` returns JSON, which is what the codec consumes.
    const json = jitM === undefined ? rest : jitM(rest) as unknown as E
    return Result.map(decode(json), (decoded) => joinEtag(decoded, _etag))
  }
}

/**
 * Decode a whole result set, failing fast on the first bad document.
 *
 * One synchronous loop and one `Result` for the batch: no Effect per document,
 * and no allocation beyond the decoded array (plus a `Result` wrapper) on the
 * happy path. Adapters lift the returned `Result` with `Effect.fromResult`
 * once, at the end.
 */
export const decodeStoredMany = <A, B>(
  docs: readonly A[],
  decode: (doc: A) => Result.Result<B, S.SchemaError>
): Result.Result<B[], S.SchemaError> => {
  const decoded: B[] = []
  for (const doc of docs) {
    const result = decode(doc)
    if (Result.isFailure(result)) return Result.fail(result.failure)
    decoded.push(result.success)
  }
  return Result.succeed(decoded)
}

/** Decode an optional stored document; `None` short-circuits without decoding. */
export const decodeStoredOption = <A, B>(
  doc: Option.Option<A>,
  decode: (doc: A) => Result.Result<B, S.SchemaError>
): Result.Result<Option.Option<B>, S.SchemaError> =>
  Option.isNone(doc) ? Result.succeed(Option.none()) : Result.map(decode(doc.value), Option.some)
