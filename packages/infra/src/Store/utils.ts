import crypto from "crypto"
import * as Effect from "effect-app/Effect"
import type { FilterResult, Ops } from "effect-app/Model/filter/filterApi"
import * as Option from "effect-app/Option"
import * as S from "effect-app/Schema"
import * as SchemaAST from "effect-app/SchemaAST"
import type { PersistenceModelType, SupportedValues2 } from "effect-app/Store"
import { OptimisticConcurrencyException } from "../errors.ts"

const dateJson = S.toCodecJson(S.Date)

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  if (value instanceof Date || value instanceof Map || value instanceof Set) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const unwrapAst = (ast: SchemaAST.AST): SchemaAST.AST => SchemaAST.isSuspend(ast) ? unwrapAst(ast.thunk()) : ast

const unionAst = (hits: readonly SchemaAST.AST[]): SchemaAST.AST | undefined => {
  if (hits.length === 0) return undefined
  if (hits.length === 1) return hits[0]
  return S.Union(hits.map((hit) => S.make(hit)) as [S.Top, S.Top, ...Array<S.Top>]).ast
}

const astAtPath = (ast: SchemaAST.AST | undefined, path: readonly string[]): SchemaAST.AST | undefined => {
  if (ast === undefined) return undefined
  if (path.length === 0) return unwrapAst(ast)
  const current = unwrapAst(ast)
  const [head, ...tail] = path
  if (head === undefined) return current
  if (SchemaAST.isUnion(current)) {
    return unionAst(
      current.types.flatMap((member) => {
        const hit = astAtPath(member, path)
        return hit === undefined ? [] : [hit]
      })
    )
  }
  if (head === "-1" || /^\d+$/.test(head)) {
    if (SchemaAST.isArrays(current)) {
      const element = current.rest[0] ?? current.elements[Number(head)] ?? current.elements[0]
      return astAtPath(element, tail)
    }
    if (SchemaAST.isDeclaration(current) && current.typeParameters.length === 1) {
      return astAtPath(current.typeParameters[0], tail)
    }
    return undefined
  }
  if (SchemaAST.isObjects(current)) {
    const property = current.propertySignatures.find((p) => p.name === head)
    return property === undefined ? undefined : astAtPath(property.type, tail)
  }
  if (SchemaAST.isDeclaration(current)) {
    const encoded = S.toEncoded(S.make(current))
    const fields = "fields" in encoded ? encoded.fields : undefined
    if (fields !== null && typeof fields === "object") {
      const field = (fields as Record<string, S.Top | undefined>)[head]
      if (field !== undefined) return astAtPath(field.ast, tail)
    }
  }
  return undefined
}

const elementAst = (ast: SchemaAST.AST | undefined): SchemaAST.AST | undefined => {
  if (ast === undefined) return undefined
  const current = unwrapAst(ast)
  if (SchemaAST.isArrays(current)) return unwrapAst(current.rest[0] ?? current.elements[0] ?? current)
  if (SchemaAST.isDeclaration(current) && current.typeParameters.length === 1) {
    return unwrapAst(current.typeParameters[0]!)
  }
  return current
}

const mapKeyAst = (ast: SchemaAST.AST | undefined): SchemaAST.AST | undefined => {
  if (ast === undefined) return undefined
  const current = unwrapAst(ast)
  if (SchemaAST.isDeclaration(current) && current.typeParameters.length >= 2) {
    return unwrapAst(current.typeParameters[0]!)
  }
  return current
}

const mapValueAst = (ast: SchemaAST.AST | undefined): SchemaAST.AST | undefined => {
  if (ast === undefined) return undefined
  const current = unwrapAst(ast)
  if (SchemaAST.isDeclaration(current) && current.typeParameters.length >= 2) {
    return unwrapAst(current.typeParameters[1]!)
  }
  return current
}

const asArray = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : value instanceof Set ? [...value] : [value]

const encodeJson = (ast: SchemaAST.AST | undefined, value: unknown): unknown => {
  if (ast === undefined) return toJsonQueryValue(value)
  const current = unwrapAst(ast)
  const schema = S.make(current)
  if (S.is(schema)(value)) {
    return Effect.runSync(
      S.encodeUnknownEffect(S.toCodecJson(schema))(value) as Effect.Effect<S.Json>
    )
  }
  const unmatched: unknown = value
  if (isPlainObject(unmatched)) {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(unmatched)) {
      out[key] = encodeJson(astAtPath(current, [key]), child)
    }
    return out
  }
  if (Array.isArray(unmatched)) {
    const element = SchemaAST.isArrays(current) ? current.rest[0] ?? current.elements[0] : current
    return unmatched.map((item) => encodeJson(element, item))
  }
  if (unmatched instanceof Set) {
    return [...unmatched].map((item) => encodeJson(elementAst(current), item))
  }
  if (unmatched instanceof Map) {
    return [...unmatched.entries()].map(([k, v]) => [
      encodeJson(mapKeyAst(current), k),
      encodeJson(mapValueAst(current), v)
    ])
  }
  return toJsonQueryValue(unmatched)
}

const encodeFilterValue = (fieldAst: SchemaAST.AST | undefined, op: Ops, value: unknown): unknown => {
  if (fieldAst === undefined) return toJsonQueryValue(value)
  if (op === "in" || op === "notIn") {
    return asArray(value).map((item) => encodeJson(fieldAst, item))
  }
  if (
    op === "includes"
    || op === "notIncludes"
    || op === "includes-any"
    || op === "notIncludes-any"
    || op === "includes-all"
    || op === "notIncludes-all"
  ) {
    const element = elementAst(fieldAst)
    return op === "includes" || op === "notIncludes"
      ? encodeJson(element, value)
      : asArray(value).map((item) => encodeJson(element, item))
  }
  if (
    op === "hasKeyValue"
    || op === "notHasKeyValue"
    || op === "hasKeyValue-any"
    || op === "notHasKeyValue-any"
    || op === "hasKeyValue-all"
    || op === "notHasKeyValue-all"
  ) {
    const keyAst = mapKeyAst(fieldAst)
    const valueAst = mapValueAst(fieldAst)
    const pair = (item: unknown) =>
      Array.isArray(item) && item.length >= 2
        ? [encodeJson(keyAst, item[0]), encodeJson(valueAst, item[1])]
        : toJsonQueryValue(item)
    return op === "hasKeyValue" || op === "notHasKeyValue" ? pair(value) : asArray(value).map(pair)
  }
  if (
    op === "hasKey"
    || op === "notHasKey"
    || op === "hasKey-any"
    || op === "notHasKey-any"
    || op === "hasKey-all"
    || op === "notHasKey-all"
  ) {
    const keyAst = mapKeyAst(fieldAst)
    return op === "hasKey" || op === "notHasKey"
      ? encodeJson(keyAst, value)
      : asArray(value).map((item) => encodeJson(keyAst, item))
  }
  if (
    op === "hasValue"
    || op === "notHasValue"
    || op === "hasValue-any"
    || op === "notHasValue-any"
    || op === "hasValue-all"
    || op === "notHasValue-all"
  ) {
    const valueAst = mapValueAst(fieldAst)
    return op === "hasValue" || op === "notHasValue"
      ? encodeJson(valueAst, value)
      : asArray(value).map((item) => encodeJson(valueAst, item))
  }
  return encodeJson(fieldAst, value)
}

/**
 * Lower Date / Map / Set to JSON when no field schema is available.
 * Prefer {@link encodeWithSchema} / {@link jsonifyFilter} with the store schema.
 */
export function toJsonQueryValue(value: unknown): unknown {
  if (value instanceof Date) {
    return S.encodeSync(dateJson)(value)
  }
  if (value instanceof Map) {
    return [...value.entries()].map(([k, v]) => [toJsonQueryValue(k), toJsonQueryValue(v)])
  }
  if (value instanceof Set) {
    return [...value].map((v) => toJsonQueryValue(v))
  }
  if (Array.isArray(value)) {
    return value.map((v) => toJsonQueryValue(v))
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = toJsonQueryValue(v)
    }
    return out
  }
  if (value !== null && typeof value === "object") {
    const toJSON = (value as { toJSON?: () => unknown }).toJSON
    if (typeof toJSON === "function") {
      return toJsonQueryValue(toJSON.call(value))
    }
  }
  return value
}

export function encodeWithSchema(schema: S.Top | undefined, value: unknown): unknown {
  if (schema === undefined) return toJsonQueryValue(value)
  return encodeJson(SchemaAST.toEncoded(schema.ast), value)
}

export function jsonifyFilter(
  filter: readonly FilterResult[],
  schema?: S.Top
): FilterResult[] {
  const ast = schema === undefined ? undefined : SchemaAST.toEncoded(schema.ast)
  return filter.map((r) =>
    r.t === "and-scope" || r.t === "or-scope" || r.t === "where-scope"
      ? { ...r, result: jsonifyFilter(r.result, schema) }
      : { ...r, value: encodeFilterValue(astAtPath(ast, r.path.split(".")), r.op, r.value) }
  )
}

export type JsonLower = {
  readonly toJson: (value: unknown) => unknown
  readonly jsonifyFilter: (filter: readonly FilterResult[]) => FilterResult[]
}

export const makeJsonLower = (config?: { readonly schema?: S.Top }): JsonLower => ({
  toJson: (value) => encodeWithSchema(config?.schema, value),
  jsonifyFilter: (filter) => jsonifyFilter(filter, config?.schema)
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
