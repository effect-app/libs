import crypto from "crypto"
import { Effect, Option } from "effect-app"
import { OptimisticConcurrencyException } from "../errors.js"
import type { PersistenceModelType, SupportedValues2 } from "./service.js"

export const makeETag = <E extends PersistenceModelType<{}>>(
  { _etag, ...e }: E
): E =>
  ({
    ...e,
    // we have to hash the JSON, as hashing the object might contain elements that won't be serialized anyway
    _etag: crypto.createHash("sha256").update(JSON.stringify(e)).digest("hex")
  }) as any

export const makeUpdateETag =
  (type: string) =>
  <IdKey extends keyof E, E extends PersistenceModelType<{}>>(e: E, idKey: IdKey, current: Option.Option<E>) =>
    Effect.gen(function*() {
      if (e._etag) {
        yield* Effect.mapError(
          current,
          () =>
            new OptimisticConcurrencyException({ type, id: e[idKey] as string, current: "", found: e._etag, code: 409 })
        )
      }
      if (Option.isSome(current) && current.value._etag !== e._etag) {
        return yield* new OptimisticConcurrencyException({
          type,
          id: current.value[idKey] as string,
          current: current.value._etag,
          found: e._etag,
          code: 412
        })
      }
      const newE = makeETag(e)
      return newE
    })

export function lowercaseIfString<T>(val: T) {
  if (typeof val === "string") {
    return val.toLowerCase()
  }
  return val
}

export function compare(valA: unknown, valB: unknown) {
  return valA === valB
}

export function lowerThan(valA: SupportedValues2, valB: SupportedValues2) {
  return valA < valB
}

export function lowerThanExclusive(valA: SupportedValues2, valB: SupportedValues2) {
  return valA <= valB
}

export function greaterThan(valA: SupportedValues2, valB: SupportedValues2) {
  return valA > valB
}

export function greaterThanExclusive(valA: SupportedValues2, valB: SupportedValues2) {
  return valA >= valB
}
