/* eslint-disable @typescript-eslint/no-explicit-any */
import { Effect, type Record, S } from "effect-app"
import { type DeepKeys, type StandardSchemaV1 } from "@tanstack/vue-form"
import { getTransformationFrom } from "../../../utils"
import type {
  FieldMeta,
  MetaRecord,
  NestedKeyOf,
  SelectFieldMeta
} from "./types"
import { warnLegacyTag } from "./legacyWarning"

export type FilterItems = {
  items: readonly [string, ...string[]]
  message:
    | string
    | Effect.Effect<string, never, never>
    | { readonly message: string | Effect.Effect<string> }
}

export type CreateMeta =
  & {
    parent?: string
    meta?: Record<string, any>
    nullableOrUndefined?: false | "undefined" | "null"
  }
  & (
    | {
      propertySignatures: readonly S.AST.PropertySignature[]
      property?: never
    }
    | {
      propertySignatures?: never
      property: S.AST.AST
    }
  )

export const unwrapDeclaration = (property: S.AST.AST): S.AST.AST => {
  let current = getTransformationFrom(property)

  while (S.AST.isDeclaration(current) && current.typeParameters.length > 0) {
    current = getTransformationFrom(current.typeParameters[0]!)
  }

  return current
}

const isNullishType = (property: S.AST.AST) => S.AST.isUndefined(property) || S.AST.isNull(property)

/**
 * Unwrap a single-element Union to its inner type if it's a Literal.
 * After AST.toType, S.Struct({ _tag: S.Literal("X") }) produces Union([Literal("X")])
 * instead of bare Literal("X") like S.TaggedStruct does.
 * TODO: remove after manual _tag deprecation
 */
const unwrapSingleLiteralUnion = (ast: S.AST.AST): S.AST.AST =>
  S.AST.isUnion(ast) && ast.types.length === 1 && S.AST.isLiteral(ast.types[0]!)
    ? ast.types[0]!
    : ast

const getNullableOrUndefined = (property: S.AST.AST) =>
  S.AST.isUnion(property)
    ? property.types.find((_) => isNullishType(_))
    : false

export const isNullableOrUndefined = (property: false | S.AST.AST | undefined) => {
  if (!property || !S.AST.isUnion(property)) return false
  if (property.types.find((_) => S.AST.isUndefined(_))) {
    return "undefined"
  }
  if (property.types.find((_) => S.AST.isNull(_))) return "null"
  return false
}

// Helper function to recursively unwrap nested unions (e.g., S.NullOr(S.NullOr(X)) -> X)
const unwrapNestedUnions = (types: readonly S.AST.AST[]): readonly S.AST.AST[] => {
  const result: S.AST.AST[] = []
  for (const type of types) {
    if (S.AST.isUnion(type)) {
      // Recursively unwrap nested unions
      const unwrapped = unwrapNestedUnions(type.types)
      result.push(...unwrapped)
    } else {
      result.push(type)
    }
  }
  return result
}

const getNonNullTypes = (types: readonly S.AST.AST[]) =>
  unwrapNestedUnions(types)
    .map(unwrapDeclaration)
    .filter((_) => !isNullishType(_))

const getCheckMetas = (property: S.AST.AST): Array<Record<string, any>> => {
  const checks = property.checks ?? []

  return checks.flatMap((check) => {
    if (check._tag === "FilterGroup") {
      return check.checks.flatMap((inner) => {
        const meta = inner.annotations?.meta
        return meta && typeof meta === "object" ? [meta as Record<string, any>] : []
      })
    }

    const meta = check.annotations?.meta
    return meta && typeof meta === "object" ? [meta as Record<string, any>] : []
  })
}

const getFieldMetadataFromAst = (property: S.AST.AST) => {
  const base: Partial<FieldMeta> & Record<string, unknown> = {
    description: S.AST.resolveDescription(property)
  }
  const checks = getCheckMetas(property)

  if (S.AST.isString(property)) {
    base.type = "string"
    for (const check of checks) {
      switch (check._tag) {
        case "isMinLength":
          base.minLength = check.minLength
          break
        case "isMaxLength":
          base.maxLength = check.maxLength
          break
      }
    }

    const format = property.annotations?.["format"]
    if (format === "email") {
      base.format = "email"
    }
  } else if (S.AST.isNumber(property)) {
    base.type = "number"
    for (const check of checks) {
      switch (check._tag) {
        case "isInt":
          base.refinement = "int"
          break
        case "isGreaterThanOrEqualTo":
          base.minimum = check.minimum
          break
        case "isLessThanOrEqualTo":
          base.maximum = check.maximum
          break
        case "isBetween":
          base.minimum = check.minimum
          base.maximum = check.maximum
          break
        case "isGreaterThan":
          base.exclusiveMinimum = check.exclusiveMinimum
          break
        case "isLessThan":
          base.exclusiveMaximum = check.exclusiveMaximum
          break
      }
    }
  } else if (S.AST.isBoolean(property)) {
    base.type = "boolean"
  } else if (
    S.AST.isDeclaration(property)
    && (property.annotations as any)?.typeConstructor?._tag === "Date"
  ) {
    base.type = "date"
  } else {
    base.type = "unknown"
  }

  return base
}

export const createMeta = <T = any>(
  { meta = {}, parent = "", property, propertySignatures }: CreateMeta,
  acc: Partial<MetaRecord<T>> = {},
  fieldAstByPath?: Record<string, S.AST.AST>
): MetaRecord<T> | FieldMeta => {
  if (property) {
    property = unwrapDeclaration(property)
  }

  if (property && S.AST.isObjects(property)) {
    return createMeta<T>({
      meta,
      propertySignatures: property.propertySignatures
    })
  }

  if (propertySignatures) {
    for (const p of propertySignatures) {
      const key = parent ? `${parent}.${p.name.toString()}` : p.name.toString()
      const nullableOrUndefined = isNullableOrUndefined(p.type)

      const isOptionalKey = (p.type as any).context?.isOptional === true

      // Determine if this field should be required:
      // - For nullable discriminated unions, only _tag should be non-required
      // - optionalKey fields are not required
      // - All other fields should calculate their required status normally
      let isRequired: boolean
      if (meta._isNullableDiscriminatedUnion && p.name.toString() === "_tag") {
        // _tag in a nullable discriminated union is not required
        isRequired = false
      } else if (meta.required === false) {
        // Explicitly set to non-required (legacy behavior for backwards compatibility)
        isRequired = false
      } else if (isOptionalKey) {
        isRequired = false
      } else {
        // Calculate from the property itself
        isRequired = !nullableOrUndefined
      }

      const typeToProcess = unwrapDeclaration(p.type)
      if (S.AST.isUnion(p.type)) {
        const nonNullTypes = getNonNullTypes(p.type.types)

        const hasStructMembers = nonNullTypes.some(S.AST.isObjects)

        if (hasStructMembers) {
          // Only create parent meta for non-NullOr unions to avoid duplicates
          if (!nullableOrUndefined) {
            const parentMeta = createMeta<T>({
              parent: key,
              property: p.type,
              meta: { required: isRequired, nullableOrUndefined }
            })
            acc[key as NestedKeyOf<T>] = parentMeta as FieldMeta
          }

          // Process each non-null type and merge their metadata
          for (const nonNullType of nonNullTypes) {
            if (S.AST.isObjects(nonNullType)) {
              // For discriminated unions (multiple branches):
              // - If the parent union is nullable, only _tag should be non-required
              // - All other fields maintain their normal required status based on their own types
              const isNullableDiscriminatedUnion = nullableOrUndefined && nonNullTypes.length > 1

              const branchMeta = createMeta<T>({
                parent: key,
                propertySignatures: nonNullType.propertySignatures,
                meta: isNullableDiscriminatedUnion ? { _isNullableDiscriminatedUnion: true } : {}
              })

              // Merge branch metadata, combining select members for shared discriminator fields
              for (const [metaKey, metaValue] of Object.entries(branchMeta)) {
                const existing = acc[metaKey as NestedKeyOf<T>] as FieldMeta | undefined
                if (
                  existing && existing.type === "select" && (metaValue as any)?.type === "select"
                ) {
                  existing.members = [
                    ...existing.members,
                    ...(metaValue as SelectFieldMeta).members.filter(
                      (m: any) => !existing.members.includes(m)
                    )
                  ]
                } else {
                  acc[metaKey as NestedKeyOf<T>] = metaValue as FieldMeta
                }
              }
            }
          }
        } else {
          const arrayTypes = nonNullTypes.filter(S.AST.isArrays)
          if (arrayTypes.length > 0) {
            const arrayType = arrayTypes[0] // Take the first array type

            acc[key as NestedKeyOf<T>] = {
              type: "multiple",
              members: arrayType.elements,
              rest: arrayType.rest,
              required: isRequired,
              nullableOrUndefined
            } as FieldMeta
            if (fieldAstByPath) {
              fieldAstByPath[key] = p.type
            }

            // If the array has struct elements, also create metadata for their properties
            if (arrayType.rest && arrayType.rest.length > 0) {
              const restElement = unwrapDeclaration(arrayType.rest[0]!)
              if (S.AST.isObjects(restElement)) {
                for (const prop of restElement.propertySignatures) {
                  const propKey = `${key}.${prop.name.toString()}`

                  const propMeta = createMeta<T>({
                    parent: propKey,
                    property: prop.type,
                    meta: {
                      required: !isNullableOrUndefined(prop.type),
                      nullableOrUndefined: isNullableOrUndefined(prop.type)
                    }
                  })

                  // add to accumulator if valid
                  if (propMeta && typeof propMeta === "object" && "type" in propMeta) {
                    acc[propKey as NestedKeyOf<T>] = propMeta as FieldMeta
                    if (fieldAstByPath) {
                      fieldAstByPath[propKey] = prop.type
                    }

                    if (
                      propMeta.type === "multiple" && S.AST.isArrays(prop.type) && prop
                        .type
                        .rest && prop.type.rest.length > 0
                    ) {
                      const nestedRestElement = unwrapDeclaration(prop.type.rest[0]!)
                      if (S.AST.isObjects(nestedRestElement)) {
                        for (const nestedProp of nestedRestElement.propertySignatures) {
                          const nestedPropKey = `${propKey}.${nestedProp.name.toString()}`

                          const nestedPropMeta = createMeta<T>({
                            parent: nestedPropKey,
                            property: nestedProp.type,
                            meta: {
                              required: !isNullableOrUndefined(nestedProp.type),
                              nullableOrUndefined: isNullableOrUndefined(nestedProp.type)
                            }
                          })

                          // add to accumulator if valid
                          if (nestedPropMeta && typeof nestedPropMeta === "object" && "type" in nestedPropMeta) {
                            acc[nestedPropKey as NestedKeyOf<T>] = nestedPropMeta as FieldMeta
                            if (fieldAstByPath) {
                              fieldAstByPath[nestedPropKey] = nestedProp.type
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          } else {
            // If no struct members and no arrays, process as regular union
            const newMeta = createMeta<T>({
              parent: key,
              property: p.type,
              meta: { required: isRequired, nullableOrUndefined }
            })
            acc[key as NestedKeyOf<T>] = newMeta as FieldMeta
            if (fieldAstByPath) {
              fieldAstByPath[key] = p.type
            }
          }
        }
      } else {
        if (S.AST.isObjects(typeToProcess)) {
          Object.assign(
            acc,
            createMeta<T>(
              {
                parent: key,
                propertySignatures: typeToProcess.propertySignatures,
                meta: { required: isRequired, nullableOrUndefined }
              },
              {},
              fieldAstByPath
            )
          )
        } else if (S.AST.isArrays(p.type)) {
          // Check if it has struct elements
          const hasStructElements = p.type.rest.length > 0
            && S.AST.isObjects(unwrapDeclaration(p.type.rest[0]!))

          if (hasStructElements) {
            // For arrays with struct elements, only create meta for nested fields, not the array itself
            const elementType = unwrapDeclaration(p.type.rest[0]!)
            if (S.AST.isObjects(elementType)) {
              // Process each property in the array element
              for (const prop of elementType.propertySignatures) {
                const propKey = `${key}.${prop.name.toString()}`

                // Check if the property is another array
                if (S.AST.isArrays(prop.type) && prop.type.rest.length > 0) {
                  const nestedElementType = unwrapDeclaration(prop.type.rest[0]!)
                  if (S.AST.isObjects(nestedElementType)) {
                    // Array with struct elements - process nested fields
                    for (const nestedProp of nestedElementType.propertySignatures) {
                      const nestedKey = `${propKey}.${nestedProp.name.toString()}`
                      const nestedMeta = createMeta<T>({
                        parent: nestedKey,
                        property: nestedProp.type,
                        meta: {
                          required: !isNullableOrUndefined(nestedProp.type),
                          nullableOrUndefined: isNullableOrUndefined(nestedProp.type)
                        }
                      })
                      acc[nestedKey as NestedKeyOf<T>] = nestedMeta as FieldMeta
                      if (fieldAstByPath) {
                        fieldAstByPath[nestedKey] = nestedProp.type
                      }
                    }
                  } else {
                    // Array with primitive elements - create meta for the array itself
                    acc[propKey as NestedKeyOf<T>] = {
                      type: "multiple",
                      members: prop.type.elements,
                      rest: prop.type.rest,
                      required: !isNullableOrUndefined(prop.type),
                      nullableOrUndefined: isNullableOrUndefined(prop.type)
                    } as FieldMeta
                    if (fieldAstByPath) {
                      fieldAstByPath[propKey] = prop.type
                    }
                  }
                } else {
                  const fieldMeta = createMeta<T>({
                    parent: propKey,
                    property: prop.type,
                    meta: {
                      required: !isNullableOrUndefined(prop.type),
                      nullableOrUndefined: isNullableOrUndefined(prop.type)
                    }
                  })
                  acc[propKey as NestedKeyOf<T>] = fieldMeta as FieldMeta
                  if (fieldAstByPath) {
                    fieldAstByPath[propKey] = prop.type
                  }
                }
              }
            }
          } else {
            // For arrays with primitive elements, create the array meta
            acc[key as NestedKeyOf<T>] = {
              type: "multiple",
              members: p.type.elements,
              rest: p.type.rest,
              required: isRequired,
              nullableOrUndefined
            } as FieldMeta
            if (fieldAstByPath) {
              fieldAstByPath[key] = p.type
            }
          }
        } else {
          const newMeta = createMeta<T>({
            parent: key,
            property: p.type,
            meta: {
              // an empty string is valid for a S.String field, so we should not mark it as required
              // TODO: handle this better via the createMeta minLength parsing
              required: isRequired
                && (!S.AST.isString(typeToProcess) || !!getFieldMetadataFromAst(typeToProcess).minLength),
              nullableOrUndefined,
              ...(isOptionalKey ? { isOptionalKey: true } : {})
            }
          })

          acc[key as NestedKeyOf<T>] = newMeta as FieldMeta
          if (fieldAstByPath) {
            fieldAstByPath[key] = p.type
          }
        }
      }
    }
    return acc
  }

  if (property) {
    const nullableOrUndefined = getNullableOrUndefined(property)
    property = unwrapDeclaration(property)

    if (!Object.hasOwnProperty.call(meta, "required")) {
      meta["required"] = !nullableOrUndefined
    }

    if (S.AST.isUnion(property)) {
      const unwrappedTypes = unwrapNestedUnions(property.types).map(unwrapDeclaration)
      const nonNullTypes = unwrappedTypes.filter((t) => !isNullishType(t))

      // Unwrap single-element unions when the literal is a boolean
      // (effect-app's S.Literal wraps as S.Literals([x]) → Union([Literal(x)]))
      // Don't unwrap string/number literals — they may be discriminator values in a union
      if (
        nonNullTypes.length === 1
        && S.AST.isLiteral(nonNullTypes[0]!)
        && typeof nonNullTypes[0]!.literal === "boolean"
      ) {
        return createMeta<T>({ parent, meta, property: nonNullTypes[0]! })
      }

      const nonNullType = nonNullTypes[0]!

      if (S.AST.isObjects(nonNullType)) {
        return createMeta<T>({
          propertySignatures: nonNullType.propertySignatures,
          parent,
          meta
        })
      }

      // TODO: remove after manual _tag deprecation — unwrap legacy S.Struct({ _tag: S.Literal("X") }) pattern
      const resolvedTypes = unwrappedTypes.map(unwrapSingleLiteralUnion)
      if (resolvedTypes.every((_) => isNullishType(_) || S.AST.isLiteral(_))) {
        return {
          ...meta,
          type: "select",
          members: resolvedTypes.filter(S.AST.isLiteral).map((t) => t.literal)
        } as FieldMeta
      }

      return {
        ...meta,
        ...createMeta<T>({
          parent,
          meta,
          property: nonNullType
        })
      } as FieldMeta
    }

    if (S.AST.isArrays(property)) {
      return {
        ...meta,
        type: "multiple",
        members: property.elements,
        rest: property.rest
      } as FieldMeta
    }

    if (S.AST.isLiteral(property)) {
      return {
        ...meta,
        type: "select",
        members: [property.literal]
      } as FieldMeta
    }

    meta = { ...getFieldMetadataFromAst(property), ...meta }

    return meta as FieldMeta
  }

  return acc
}

// Helper to flatten nested meta structure into dot-notation keys
const flattenMeta = <T>(meta: MetaRecord<T> | FieldMeta, parentKey: string = ""): MetaRecord<T> => {
  const result: MetaRecord<T> = {}

  for (const key in meta) {
    const value = (meta as any)[key]
    const newKey = parentKey ? `${parentKey}.${key}` : key

    if (value && typeof value === "object" && "type" in value) {
      result[newKey as DeepKeys<T>] = value as FieldMeta
    } else if (value && typeof value === "object") {
      Object.assign(result, flattenMeta<T>(value, newKey))
    }
  }

  return result
}

export const metadataFromAst = <From, To>(
  schema: S.Codec<To, From, never>
): {
  meta: MetaRecord<To>
  defaultValues: Record<string, any>
  unionMeta: Record<string, MetaRecord<To>>
} => {
  const ast = unwrapDeclaration(schema.ast)
  const newMeta: MetaRecord<To> = {}
  const defaultValues: Record<string, any> = {}
  const unionMeta: Record<string, MetaRecord<To>> = {}
  const fieldAstByPath: Record<string, S.AST.AST> = {}

  const toFieldStandardSchema = (
    propertyAst: S.AST.AST,
    required: boolean
  ): StandardSchemaV1<any, any> => {
    const base = S.make(propertyAst)
    const fieldSchema = required ? base : S.NullishOr(base)
    return S.toStandardSchemaV1(fieldSchema as any)
  }

  const attachOriginalSchemas = (metaRecord: MetaRecord<To>) => {
    for (const [key, fieldAst] of Object.entries(fieldAstByPath)) {
      const fieldMeta = metaRecord[key as NestedKeyOf<To>]
      if (!fieldMeta) {
        continue
      }
      try {
        const required = fieldMeta.required ?? true
        Object.defineProperty(fieldMeta, "originalSchema", {
          value: toFieldStandardSchema(fieldAst, required),
          enumerable: false,
          configurable: true,
          writable: true
        })
      } catch {
        Object.defineProperty(fieldMeta, "originalSchema", {
          value: S.toStandardSchemaV1(S.Unknown),
          enumerable: false,
          configurable: true,
          writable: true
        })
      }
    }
  }

  // Handle root-level Union types (discriminated unions)
  if (S.AST.isUnion(ast)) {
    // Filter out null/undefined types and unwrap transformations
    const nonNullTypes = getNonNullTypes(ast.types)

    // Check if this is a discriminated union (all members are structs)
    const allStructs = nonNullTypes.every(S.AST.isObjects)

    if (allStructs && nonNullTypes.length > 0) {
      // Extract discriminator values from each union member
      const discriminatorValues: any[] = []

      // Store metadata for each union member by its tag value
      for (const memberType of nonNullTypes) {
        if (S.AST.isObjects(memberType)) {
          // Find the discriminator field (usually _tag)
          const tagProp = memberType.propertySignatures.find(
            (p) => p.name.toString() === "_tag"
          )

          let tagValue: string | null = null
          // TODO: remove after manual _tag deprecation — unwrap legacy S.Struct({ _tag: S.Literal("X") }) pattern
          const resolvedTagType = tagProp ? unwrapSingleLiteralUnion(tagProp.type) : null
          if (resolvedTagType && S.AST.isLiteral(resolvedTagType)) {
            tagValue = resolvedTagType.literal as string
            discriminatorValues.push(tagValue)
            // Warn if the tag was wrapped in a single-element Union (legacy pattern)
            if (tagProp && S.AST.isUnion(tagProp.type) && tagValue != null) {
              warnLegacyTag(tagValue)
            }
          }

          // Create metadata for this member's properties
          const memberMeta = createMeta<To>(
            {
              propertySignatures: memberType.propertySignatures
            },
            {},
            fieldAstByPath
          )

          // Store per-tag metadata for reactive lookup
          if (tagValue) {
            unionMeta[tagValue] = flattenMeta<To>(memberMeta)
          }

          // Merge into result (for backward compatibility)
          Object.assign(newMeta, memberMeta)
        }
      }

      // Create metadata for the discriminator field
      if (discriminatorValues.length > 0) {
        newMeta["_tag" as DeepKeys<To>] = {
          type: "select",
          members: discriminatorValues,
          required: true
        } as FieldMeta
      }

      attachOriginalSchemas(newMeta)
      return { meta: newMeta, defaultValues, unionMeta }
    }
  }

  if (S.AST.isObjects(ast)) {
    const meta = createMeta<To>(
      {
        propertySignatures: ast.propertySignatures
      },
      {},
      fieldAstByPath
    )

    if (Object.values(meta).every((value) => value && "type" in value)) {
      const typedMeta = meta as MetaRecord<To>
      attachOriginalSchemas(typedMeta)
      return {
        meta: typedMeta,
        defaultValues,
        unionMeta
      }
    }

    const flattenObject = (
      obj: Record<string, any>,
      parentKey: string = ""
    ) => {
      for (const key in obj) {
        const newKey = parentKey ? `${parentKey}.${key}` : key
        if (obj[key] && typeof obj[key] === "object" && "type" in obj[key]) {
          newMeta[newKey as DeepKeys<To>] = obj[key] as FieldMeta
        } else if (obj[key] && typeof obj[key] === "object") {
          flattenObject(obj[key], newKey)
        }
      }
    }

    flattenObject(meta)
  }

  attachOriginalSchemas(newMeta)
  return { meta: newMeta, defaultValues, unionMeta }
}

export const generateMetaFromSchema = <From, To>(
  schema: S.Codec<To, From, never>
): {
  schema: S.Codec<To, From, never>
  meta: MetaRecord<To>
  unionMeta: Record<string, MetaRecord<To>>
} => {
  const { meta, unionMeta } = metadataFromAst(schema)

  return { schema, meta, unionMeta }
}
