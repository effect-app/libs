import { S } from "effect-app"
import { NonNegativeInt } from "effect-app/Schema"

/**
 * Represents a single validation error when decoding a repository item.
 * Contains full context for debugging: raw data, jitM result, and decode error.
 */
export class ValidationError extends S.Opaque<ValidationError>()(S.Struct({
  /** the id of the item that failed validation */
  id: S.Unknown,
  /** the raw data from the database before jitM */
  rawData: S.Unknown,
  /** the data after applying jitM transformation */
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
