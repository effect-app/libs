/**
 * @since 1.0.0
 */
import { Config, type Equal, type Redacted } from "effect"
import type * as Chunk from "effect/Chunk"
import * as Either from "effect/Either"
import type { SecretTypeId } from "effect/Secret"
import * as internal from "./internal/configSecretURL.js"

// /**
//  * @since 1.0.0
//  * @category symbols
//  */
// export const SecretURLTypeId: unique symbol = internal.SecretURLTypeId

// /**
//  * @since 1.0.0
//  * @category symbols
//  */
// export type SecretURLTypeId = typeof SecretURLTypeId

/**
 * @since 1.0.0
 * @category models
 */
export interface SecretURL extends Redacted.Redacted, SecretURL.Proto, Equal.Equal {
  /** @internal */
  readonly raw: Array<number>
}

export interface SecretURLOps {}

export const SecretURL: SecretURLOps = {}

/**
 * @since 1.0.0
 */
export declare namespace SecretURL {
  /**
   * @since 1.0.0
   * @category models
   * @deprecated
   */
  export interface Proto {
    readonly [SecretTypeId]: SecretTypeId
  }
}

/**
 * @since 1.0.0
 * @category refinements
 * @deprecated
 */
export const isSecretURL: (u: unknown) => u is SecretURL = internal.isSecretURL

/**
 * @since 1.0.0
 * @category constructors
 */
export const make: (bytes: Array<number>) => SecretURL = internal.make

/**
 * @since 1.0.0
 * @category constructors
 */
export const fromChunk: (chunk: Chunk.Chunk<string>) => SecretURL = internal.fromChunk

/**
 * @since 1.0.0
 * @category constructors
 */
export const fromString: (text: string) => SecretURL = internal.fromString

/**
 * @since 1.0.0
 * @category getters
 */
export const value: (self: SecretURL) => string = internal.value

/**
 * @since 1.0.0
 * @category unsafe
 */
export const unsafeWipe: (self: SecretURL) => void = internal.unsafeWipe

export const secretURL = (name?: string): Config.Config<SecretURL> => {
  const config = Config.primitive(
    "a secret property",
    (text) => Either.right(fromString(text))
  )
  return name === undefined ? config : Config.nested(config, name)
}
