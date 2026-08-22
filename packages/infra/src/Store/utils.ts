import crypto from "crypto"
import * as Effect from "effect-app/Effect"
import type { FilterResult } from "effect-app/Model/filter/filterApi"
import * as Option from "effect-app/Option"
import * as S from "effect-app/Schema"
import type { PersistenceModelType, SupportedValues2 } from "effect-app/Store"
import { OptimisticConcurrencyException } from "../errors.ts"

const dateJson = S.toCodecJson(S.Date)

/**
 * Lower Date / Map / Set query and document values to JSON, matching
 * `Schema.toCodecJson` of those declarations so document-DB adapters can bind
 * native Encoded values as JSON parameters.
 */
export function toJsonQueryValue(value: unknown): unknown {
  if (value instanceof Date) {
    return S.encodeSync(dateJson)(value)
  }
  if (value instanceof Map) {
    return [...value.entries()].map(([k, v]) => [toJsonQueryValue(k), toJsonQueryValue(v)])
  }
  if (value instanceof Set) {
    return [...value].map(toJsonQueryValue)
  }
  if (Array.isArray(value)) {
    return value.map(toJsonQueryValue)
  }
  if (value !== null && typeof value === "object") {
    const proto = Object.getPrototypeOf(value)
    if (proto === Object.prototype || proto === null) {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value)) {
        out[k] = toJsonQueryValue(v)
      }
      return out
    }
    const toJSON = (value as { toJSON?: () => unknown }).toJSON
    if (typeof toJSON === "function") {
      return toJsonQueryValue(toJSON.call(value))
    }
  }
  return value
}

export function jsonifyFilter(filter: readonly FilterResult[]): FilterResult[] {
  return filter.map((r) =>
    r.t === "and-scope" || r.t === "or-scope" || r.t === "where-scope"
      ? { ...r, result: jsonifyFilter(r.result) }
      : { ...r, value: toJsonQueryValue(r.value) }
  )
}

/** Traverse an object by a dot-separated path string, e.g. `"a.b.c"`. */
export function get(obj: any, path: string): any {
  return path.split(".").reduce((res: any, key: string) => (res != null ? res[key] : res), obj)
}

export const makeETag = <E extends PersistenceModelType<{}>>(
  { _etag, ...e }: E
): E =>
  ({
    ...e,
    // we have to hash the JSON, as hashing the object might contain elements that won't be serialized anyway
    _etag: crypto.createHash("sha256").update(JSON.stringify(e)).digest("hex")
  }) as any

export const makeUpdateETag = (type: string) =>
  Effect.fnUntraced(function*<IdKey extends keyof E, E extends PersistenceModelType<{}>>(
    e: E,
    idKey: IdKey,
    current: Option.Option<E>
  ) {
    if (e._etag) {
      if (Option.isNone(current)) {
        return yield* new OptimisticConcurrencyException({
          type,
          id: e[idKey] as string,
          current: "",
          found: e._etag,
          code: 409
        })
      }
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
    return makeETag(e)
  })

export function lowercaseIfString<T>(val: T) {
  if (typeof val === "string") {
    return val.toLowerCase()
  }
  return val
}

export function compare(valA: unknown, valB: unknown) {
  return toJsonQueryValue(valA) === toJsonQueryValue(valB)
}

export function lowerThan(valA: SupportedValues2, valB: SupportedValues2) {
  return (toJsonQueryValue(valA) as SupportedValues2) < (toJsonQueryValue(valB) as SupportedValues2)
}

export function lowerThanExclusive(valA: SupportedValues2, valB: SupportedValues2) {
  return (toJsonQueryValue(valA) as SupportedValues2) <= (toJsonQueryValue(valB) as SupportedValues2)
}

export function greaterThan(valA: SupportedValues2, valB: SupportedValues2) {
  return (toJsonQueryValue(valA) as SupportedValues2) > (toJsonQueryValue(valB) as SupportedValues2)
}

export function greaterThanExclusive(valA: SupportedValues2, valB: SupportedValues2) {
  return (toJsonQueryValue(valA) as SupportedValues2) >= (toJsonQueryValue(valB) as SupportedValues2)
}
