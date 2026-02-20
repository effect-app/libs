import { Redacted } from "effect"
import * as Chunk from "effect/Chunk"
import type * as SecretURL from "../SecretURL.js"

// SecretTypeId was previously from "effect/Secret" which was removed in v4.
// Define it locally with the same symbol key for backwards compatibility.
export const SecretTypeId: unique symbol = Symbol.for("effect/Secret")
export type SecretTypeId = typeof SecretTypeId

/** @internal */
export const isSecretURL = (u: unknown): u is SecretURL.SecretURL => {
  return typeof u === "object" && u != null && SecretTypeId in u
}

/** @internal */
export const make = (bytes: Array<number>): SecretURL.SecretURL => {
  const secret = Object.assign(
    Redacted.make(bytes.map((byte) => String.fromCharCode(byte)).join("")),
    { [SecretTypeId]: SecretTypeId, raw: undefined as any } as const
  )
  let protocol = "unknown"
  try {
    const url = new URL(bytes.map((byte) => String.fromCharCode(byte)).join(""))
    protocol = url.protocol.substring(0, url.protocol.length - 1)
  } catch {
    const matches = protocol.match(/^([^:]+):\/\//)
    if (matches !== null) {
      protocol = matches[1]!
    }
  }
  Object.defineProperty(secret, "toJSON", {
    enumerable: false,
    value() {
      return ({
        _tag: "SecretURL",
        protocol
      })
    }
  })
  Object.defineProperty(secret, "toString", {
    enumerable: false,
    value() {
      return `SecretURL(${protocol}://<redacted>)`
    }
  })
  Object.defineProperty(secret, "raw", {
    enumerable: false,
    value: bytes
  })
  return secret
}

/** @internal */
export const fromChunk = (chunk: Chunk.Chunk<string>): SecretURL.SecretURL => {
  return make(Chunk.toReadonlyArray(chunk).map((char) => char.charCodeAt(0)))
}

/** @internal */
export const fromString = (text: string): SecretURL.SecretURL => {
  return make(text.split("").map((char) => char.charCodeAt(0)))
}

/** @internal */
export const value = (self: SecretURL.SecretURL): string => {
  return self.raw.map((byte) => String.fromCharCode(byte)).join("")
}

/** @internal */
export const unsafeWipe = (self: SecretURL.SecretURL): void => {
  for (let i = 0; i < self.raw.length; i++) {
    self.raw[i] = 0
  }
}
