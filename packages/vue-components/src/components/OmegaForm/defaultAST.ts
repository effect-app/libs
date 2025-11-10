import { isObject } from "@vueuse/core"
import { S } from "effect-app"
import { isNullableOrUndefined } from "./OmegaFormStuff"

export function deepMerge(target: any, source: any) {
  for (const key in source) {
    if (Array.isArray(source[key])) {
      // Arrays should be copied directly, not deep merged
      target[key] = source[key]
    } else if (source[key] && isObject(source[key])) {
      if (!target[key]) {
        target[key] = {}
      }
      deepMerge(target[key], source[key])
    } else {
      target[key] = source[key]
    }
  }
  return target
}

/**
 * Recursively makes all properties in a schema optional, including nested objects.
 * Unlike S.partial which only makes top-level properties optional, this utility
 * traverses the schema tree and applies partial transformation at every level.
 *
 * Handles:
 * - TypeLiteral (structs): Makes all properties optional and recursively processes nested types
 * - Union types: Recursively applies partial to each union member
 * - Transformation types: Applies partial to both 'from' and 'to' sides
 */
const partialRecursive = <A, I, R>(schema: S.Schema<A, I, R>): S.Schema<Partial<A>, Partial<I>, R> => {
  const ast = schema.ast

  // Handle Refinement types (e.g., NonEmptyArray, filters on ExtendedClass)
  if (ast._tag === "Refinement") {
    const refinementAst = ast as any
    // For refinements, bypass the filter and recursively apply partial to the underlying type
    const fromSchema = S.make(refinementAst.from)
    return partialRecursive(fromSchema as any)
  }

  // Handle Union types - recursively apply partial to each member
  if (ast._tag === "Union") {
    const partialMembers = (ast as any).types.map((memberAst: any) => {
      const memberSchema = S.make(memberAst)
      const partialMember = partialRecursive(memberSchema as any)
      return partialMember.ast
    })

    const newAst = {
      ...ast,
      types: partialMembers
    }

    return S.make(newAst as any)
  }

  // Handle Transformation types (e.g., withDefaultConstructor, ExtendedClass)
  if (ast._tag === "Transformation") {
    const transformAst = ast as any

    // Special handling for ExtendedClass (Declaration in 'to' side)
    if (transformAst.to._tag === "Declaration") {
      // For ExtendedClass, extract the TypeLiteral from the 'from' side
      // and make that partial, bypassing the Declaration entirely
      const fromSchema = S.make(transformAst.from)
      return partialRecursive(fromSchema as any)
    }

    // For other transformations, apply partial to both sides
    const fromSchema = S.make(transformAst.from)
    const toSchema = S.make(transformAst.to)
    const partialFrom = partialRecursive(fromSchema as any)
    const partialTo = partialRecursive(toSchema as any)

    const newAst = {
      ...ast,
      from: partialFrom.ast,
      to: partialTo.ast
    }

    return S.make(newAst as any)
  }

  // If this is a TypeLiteral (struct), recursively apply partial to nested fields
  if (ast._tag === "TypeLiteral") {
    const fields = ast.propertySignatures.map((prop: any) => {
      const propType = prop.type
      let newType = propType

      // Recursively handle nested complex types (structs, unions, transformations, refinements)
      if (
        propType._tag === "TypeLiteral" || propType._tag === "Union" || propType
            ._tag === "Transformation" || propType
            ._tag === "Refinement"
      ) {
        const nestedSchema = S.make(propType)
        const recursivePartial = partialRecursive(nestedSchema as any)
        newType = recursivePartial.ast
      }

      // Create a new property signature with isOptional: true
      return {
        ...prop,
        type: newType,
        isOptional: true
      }
    })

    const newAst = {
      ...ast,
      propertySignatures: fields
    }

    return S.make(newAst as any)
  }

  // For other schema types (primitives, refinements, etc.), return as-is
  // These types don't need to be made partial, and S.partial doesn't support them anyway
  return schema as any
}

// Helper function to recursively extract default values from schema AST swag ast
export const extractDefaultsFromAST = (schemaObj: any): any => {
  const result: Record<string, any> = {}

  // Check if this schema has fields (struct)
  if (schemaObj?.fields && typeof schemaObj.fields === "object") {
    for (const [key, fieldSchema] of Object.entries(schemaObj.fields)) {
      // Check if this field has a default value in its AST
      if ((fieldSchema as any)?.ast?.defaultValue) {
        try {
          const defaultValue = (fieldSchema as any).ast.defaultValue()
          result[key] = defaultValue
        } catch {
          // Silently ignore if defaultValue() throws
        }
      } else {
        // TODO Should we put to null/undefined only leaves?
        const ast = (fieldSchema as any)?.ast
        const nullableOrUndefined = isNullableOrUndefined(ast)
        switch (nullableOrUndefined) {
          case "null":
            result[key] = null
            break
          case "undefined":
            result[key] = undefined
            break
        }
      }

      // Recursively check nested fields for structs and unions
      const nestedDefaults = extractDefaultsFromAST(fieldSchema as any)
      if (Object.keys(nestedDefaults).length > 0) {
        // If we already have a default value for this key, merge with nested
        if (result[key] && typeof result[key] === "object") {
          Object.assign(result[key], nestedDefaults)
        } else if (!result[key]) {
          // Only set nested defaults if we don't have a default value
          result[key] = nestedDefaults
        }
      }
    }
  } else {
    if (schemaObj?.from?.fields && typeof schemaObj?.from?.fields === "object") {
      return extractDefaultsFromAST(schemaObj.from)
    }
  }

  return result
}

// Extract default values from schema constructors (e.g., withDefaultConstructor) swag schema defaults
export const extractSchemaDefaults = <From, To>(
  schema: S.Schema<To, From, never>,
  defaultValues: Partial<From> = {}
) => {
  let result: Partial<From> = {}

  try {
    const astDefaults = extractDefaultsFromAST(schema)
    result = S.encodeSync(partialRecursive(schema))(astDefaults)
  } catch (astError) {
    if (window.location.hostname === "localhost") {
      console.warn("Could not extract defaults from AST:", astError)
    }
  }

  return deepMerge(result, defaultValues)
}
