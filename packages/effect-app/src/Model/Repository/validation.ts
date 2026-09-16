import * as S from "../../Schema.ts"
import { NonNegativeInt } from "../../Schema.ts"

/**
 * Represents a single validation error when decoding a repository item.
 * Contains full context for debugging: the stored data and the decode error.
 */
export class ValidationError extends S.Opaque<ValidationError>()(S.Struct({
  /** the id of the item that failed validation */
  id: S.Unknown,
  /**
   * the data as returned by the store: `defaultValues` merged, `jitM` applied
   * to the raw JSON document, and JSON decoded to the Encoded shape
   */
  rawData: S.Unknown,
  /**
   * @deprecated identical to {@link rawData}. `jitM` now runs inside the store,
   * before the JSON→Encoded decode, so the repository never sees the document
   * as it was before the migration.
   */
  jitMResult: S.Unknown,
  /** the S.SchemaError from schema decode */
  error: S.Unknown
})) {}

/**
 * Result of validating a sample of repository items.
 */
export class ValidationResult extends S.Opaque<ValidationResult>()(S.Struct({
  /** total number of items in the repository */
  total: NonNegativeInt,
  /** number of items that were sampled for validation */
  sampled: NonNegativeInt,
  /** number of items that passed validation */
  valid: NonNegativeInt,
  /** list of validation errors with full context */
  errors: S.Array(ValidationError)
})) {}
