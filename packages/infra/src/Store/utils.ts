import crypto from "crypto"
import * as Effect from "effect-app/Effect"
import type { FilterResult } from "effect-app/Model/filter/filterApi"
import * as Option from "effect-app/Option"
import * as S from "effect-app/Schema"
import type { PersistenceModelType, SupportedValues2 } from "effect-app/Store"
import { OptimisticConcurrencyException } from "../errors.ts"
import { jsonHandlersFromSchemas, type JsonValueHandler, jsonValueHandlers, JsonValues } from "./jsonValues.ts"

const dateJson = S.toCodecJson(S.Date)

const applyHandlers = (value: unknown, extra: readonly JsonValueHandler[]): unknown => {
  for (const h of extra) {
    if (h.is(value)) return toJsonQueryValue(h.toJson(value), extra)
  }
  for (const h of jsonValueHandlers()) {
    if (h.is(value)) return toJsonQueryValue(h.toJson(value), extra)
  }
  return undefined
}

/**
 * Lower Date / Map / Set (and app-registered native Encoded values) to JSON,
 * matching `Schema.toCodecJson` so document-DB adapters can bind them as
 * JSON parameters. App schemas register via `registerJsonSchema` /
 * `JsonValues` / `StoreConfig.jsonValues` instead of being special-cased here.
 */
export function toJsonQueryValue(value: unknown, extra: readonly JsonValueHandler[] = []): unknown {
  const handled = applyHandlers(value, extra)
  if (handled !== undefined) return handled
  if (value instanceof Date) {
    return S.encodeSync(dateJson)(value)
  }
  if (value instanceof Map) {
    return [...value.entries()].map(([k, v]) => [toJsonQueryValue(k, extra), toJsonQueryValue(v, extra)])
  }
  if (value instanceof Set) {
    return [...value].map((v) => toJsonQueryValue(v, extra))
  }
  if (Array.isArray(value)) {
    return value.map((v) => toJsonQueryValue(v, extra))
  }
  if (value !== null && typeof value === "object") {
    const proto = Object.getPrototypeOf(value)
    if (proto === Object.prototype || proto === null) {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value)) {
        out[k] = toJsonQueryValue(v, extra)
      }
      return out
    }
    const toJSON = (value as { toJSON?: () => unknown }).toJSON
    if (typeof toJSON === "function") {
      return toJsonQueryValue(toJSON.call(value), extra)
    }
  }
  return value
}

export function jsonifyFilter(
  filter: readonly FilterResult[],
  extra: readonly JsonValueHandler[] = []
): FilterResult[] {
  return filter.map((r) =>
    r.t === "and-scope" || r.t === "or-scope" || r.t === "where-scope"
      ? { ...r, result: jsonifyFilter(r.result, extra) }
      : { ...r, value: toJsonQueryValue(r.value, extra) }
  )
}

export type JsonLower = {
  readonly toJson: (value: unknown) => unknown
  readonly jsonifyFilter: (filter: readonly FilterResult[]) => FilterResult[]
}

export const makeJsonLower = Effect.fnUntraced(function*(config?: {
  readonly jsonValues?: readonly S.Top[]
}) {
  const provided = yield* Effect.serviceOption(JsonValues)
  const extra = jsonHandlersFromSchemas([
    ...(Option.isSome(provided) ? provided.value.schemas : []),
    ...(config?.jsonValues ?? [])
  ])
  return {
    toJson: (value: unknown) => toJsonQueryValue(value, extra),
    jsonifyFilter: (filter: readonly FilterResult[]) => jsonifyFilter(filter, extra)
  } satisfies JsonLower
})

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
