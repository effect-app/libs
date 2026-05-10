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

function hasMembers(schema: any): schema is SchemaWithMembers {
  return schema && "members" in schema && Array.isArray(schema.members)
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
