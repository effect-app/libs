/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Effect from "effect-app/Effect"
import * as Option from "effect-app/Option"
import * as S from "effect-app/Schema"
import { isNullableOrUndefined, unwrapDeclaration } from "./createMeta"

const extractDefaultFromLink = (link: any): unknown | undefined => {
  if (!link?.transformation?.decode?.run) return undefined
  try {
    const result = Effect.runSync(link.transformation.decode.run(Option.none())) as Option.Option<unknown>
    return Option.isSome(result) ? result.value : undefined
  } catch {
    return undefined
  }
}

const getDefaultFromAst = (property: S.AST.AST) => {
  // 1. Check withConstructorDefault (stored in context.defaultValue)
  const constructorLink = property.context?.defaultValue?.[0]
  const constructorDefault = extractDefaultFromLink(constructorLink)
  if (constructorDefault !== undefined) return constructorDefault

  // 2. Check withDecodingDefault (stored in encoding)
  const encodingLink = property.encoding?.[0]
  if (encodingLink && property.context?.isOptional) {
    return extractDefaultFromLink(encodingLink)
  }

  return undefined
}

type SchemaWithMembers = {
  members: readonly S.Schema<any>[]
}

type UnknownRecord = Record<string, unknown>

function hasMembers(schema: any): schema is SchemaWithMembers {
  return schema && "members" in schema && Array.isArray(schema.members)
}

const isRecord = (value: unknown): value is UnknownRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const isNullishAst = (ast: S.AST.AST) => S.AST.isNull(ast) || S.AST.isUndefined(ast)

const unionMembers = (ast: S.AST.AST): readonly S.AST.AST[] => {
  const resolved = unwrapDeclaration(ast)
  return S.AST.isUnion(resolved)
    ? resolved.types.flatMap(unionMembers)
    : [resolved]
}

const literalValue = (ast: S.AST.AST): unknown => {
  const resolved = unwrapDeclaration(ast)
  if (S.AST.isLiteral(resolved)) return resolved.literal
  if (S.AST.isUnion(resolved) && resolved.types.length === 1) {
    return literalValue(resolved.types[0])
  }
}

const findTaggedObjectMember = (
  members: readonly S.AST.Objects[],
  value: unknown
): S.AST.Objects | undefined => {
  if (!isRecord(value) || value._tag === undefined) return undefined

  return members.find((member) => {
    const tagProp = member.propertySignatures.find((prop) => prop.name.toString() === "_tag")
    return tagProp ? literalValue(tagProp.type) === value._tag : false
  })
}

// Internal implementation with WeakSet tracking
export const defaultsValueFromSchema = (
  schema: S.Schema<any>,
  record: Record<string, any> = {}
): any => {
  const ast = schema.ast
  const defaultValue = getDefaultFromAst(ast)

  if (defaultValue !== undefined) {
    return defaultValue
  }

  if (isNullableOrUndefined(schema.ast) === "null") {
    return null
  }
  if (isNullableOrUndefined(schema.ast) === "undefined") {
    return undefined
  }

  // Handle structs via AST (covers plain structs, transformed schemas like decodeTo, Class, etc.)
  const objectsAst = S.AST.isObjects(ast)
    ? ast
    : S.AST.isDeclaration(ast)
    ? unwrapDeclaration(ast)
    : undefined
  if (objectsAst && S.AST.isObjects(objectsAst)) {
    const result: Record<string, any> = {}

    for (const prop of objectsAst.propertySignatures) {
      const key = prop.name.toString()
      const propType = prop.type

      const propDefault = getDefaultFromAst(propType)
      if (propDefault !== undefined) {
        result[key] = propDefault
        continue
      }

      const propSchema = S.make(propType)
      const propValue = defaultsValueFromSchema(propSchema, record[key] || {})

      if (propValue !== undefined) {
        result[key] = propValue
      } else if (isNullableOrUndefined(propType) === "undefined") {
        result[key] = undefined
      }
    }

    return { ...result, ...record }
  }

  // Handle unions via AST or schema-level .members
  const unionTypes = S.AST.isUnion(ast)
    ? ast.types
    : hasMembers(schema)
    ? schema.members.map((m) => m.ast)
    : undefined
  if (unionTypes) {
    const mergedFields: Record<string, { ast: S.AST.AST }> = {}

    for (const memberAstRaw of unionTypes) {
      const memberAst = unwrapDeclaration(memberAstRaw)
      if (!S.AST.isObjects(memberAst)) continue

      for (const prop of memberAst.propertySignatures) {
        const key = prop.name.toString()
        const fieldDefault = getDefaultFromAst(prop.type)
        const existingDefault = mergedFields[key] ? getDefaultFromAst(mergedFields[key].ast) : undefined

        if (!mergedFields[key] || (fieldDefault !== undefined && existingDefault === undefined)) {
          mergedFields[key] = { ast: prop.type }
        }
      }
    }

    if (Object.keys(mergedFields).length === 0) {
      return Object.keys(record).length > 0 ? record : undefined
    }

    return Object.entries(mergedFields).reduce((acc, [key, { ast: propAst }]) => {
      acc[key] = defaultsValueFromSchema(S.make(propAst), record[key] || {})
      return acc
    }, record)
  }

  if (Object.keys(record).length === 0) {
    if (S.AST.isString(ast)) {
      return ""
    }

    if (S.AST.isBoolean(ast)) {
      return false
    }
  }
}

/**
 * Deep-fills a partial form value with schema defaults for any nullable
 * struct that has **materialised**.
 *
 * A nullable struct (`S.NullOr(S.Struct(...))`) left `null` stays `null`, but
 * once it materialises — e.g. the user filled a single child — its untouched
 * children are filled with their schema default (or `null` when nullable).
 * Without this, strict `S.NullOr(...)` children reject the leftover
 * `undefined` with a spurious "field must not be empty" error.
 *
 * Only children of a struct reached *through a nullable union* are filled;
 * the always-present root struct keeps whatever fields it already has, so the
 * form's own default-value priority is left untouched.
 *
 * Reference-preserving: returns `value` unchanged (same reference) when there
 * is nothing to fill, so callers can detect a no-op with `===` and the result
 * is idempotent (`fill(fill(v)) === fill(v)`).
 */
export const fillNestedDefaults = (
  ast: S.AST.AST,
  value: unknown,
  fillMissing = false
): unknown => {
  const resolved = unwrapDeclaration(ast)

  switch (resolved._tag) {
    case "Union": {
      if (value === null || value === undefined) return value
      const members = unionMembers(resolved)
      const objectMembers = members.filter(S.AST.isObjects)
      if (objectMembers.length === 0) return value

      const hasNullishMember = members.some(isNullishAst)
      const taggedMember = findTaggedObjectMember(objectMembers, value)
      if (taggedMember) {
        return fillNestedDefaults(taggedMember, value, fillMissing || hasNullishMember)
      }

      if (hasNullishMember && objectMembers.length === 1) {
        return fillNestedDefaults(objectMembers[0], value, true)
      }

      return value
    }

    case "Arrays": {
      if (!Array.isArray(value)) return value
      const element = resolved.rest[0]
      if (!element) return value
      let changed = false
      const next = value.map((item) => {
        const filled = fillNestedDefaults(element, item, fillMissing)
        if (filled !== item) changed = true
        return filled
      })
      return changed ? next : value
    }

    case "Objects": {
      if (!isRecord(value)) return value
      let result: UnknownRecord = value
      let changed = false
      const set = (key: string, next: unknown) => {
        if (!changed) {
          result = { ...value }
          changed = true
        }
        result[key] = next
      }
      for (const prop of resolved.propertySignatures) {
        const key = prop.name.toString()
        const current = value[key]
        if (current !== undefined) {
          const filled = fillNestedDefaults(prop.type, current, fillMissing)
          if (filled !== current) set(key, filled)
          continue
        }
        if (!fillMissing || prop.type.context?.isOptional === true) continue
        const propDefault = getDefaultFromAst(prop.type)
        if (propDefault !== undefined) {
          set(key, propDefault)
        } else if (isNullableOrUndefined(prop.type) === "null") {
          set(key, null)
        }
      }
      return result
    }

    default:
      return value
  }
}
