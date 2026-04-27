/* eslint-disable @typescript-eslint/no-explicit-any */
import { type StandardSchemaV1 } from "@tanstack/vue-form"
import { type Effect, type Record, S } from "effect-app"
import { getTransformationFrom } from "../../../utils"
import { getFieldMetadataFromAst } from "./checks"
import { warnLegacyTag } from "./legacyWarning"
import type { FieldMeta, MetaRecord, NestedKeyOf, SelectFieldMeta } from "./types"

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

// TODO: remove after manual _tag deprecation — S.Struct({ _tag: S.Literal("X") }) wraps as Union([Literal("X")])
const unwrapSingleLiteralUnion = (ast: S.AST.AST): S.AST.AST =>
  S.AST.isUnion(ast) && ast.types.length === 1 && S.AST.isLiteral(ast.types[0]!)
    ? ast.types[0]!
    : ast

export const isNullableOrUndefined = (property: false | S.AST.AST | undefined) => {
  if (!property || !S.AST.isUnion(property)) return false
  if (property.types.find((_) => S.AST.isUndefined(_))) {
    return "undefined"
  }
  if (property.types.find((_) => S.AST.isNull(_))) return "null"
  return false
}

const unwrapNestedUnions = (types: readonly S.AST.AST[]): readonly S.AST.AST[] =>
  types.flatMap((type) => S.AST.isUnion(type) ? unwrapNestedUnions(type.types) : [type])

type WalkerContext<T> = {
  acc: Partial<MetaRecord<T>>
  unionMeta: Record<string, MetaRecord<T>>
  fieldAstByPath?: Record<string, S.AST.AST>
}

type ParentMeta = {
  required: boolean
  nullableOrUndefined: false | "null" | "undefined"
  /** Set when iterating the members of a nullable discriminated union */
  isNullableDiscriminatedUnion?: boolean
  /** Set when this property was declared with S.optionalKey */
  isOptionalKey?: boolean
}

const leafMetaForAst = (
  ast: S.AST.AST,
  parentMeta: ParentMeta
): FieldMeta => {
  const { nullableOrUndefined, required } = parentMeta

  if (S.AST.isArrays(ast)) {
    return {
      required,
      nullableOrUndefined,
      type: "multiple",
      members: ast.elements,
      rest: ast.rest
    } as FieldMeta
  }

  if (S.AST.isLiteral(ast)) {
    return {
      required,
      nullableOrUndefined,
      type: "select",
      members: [ast.literal]
    } as FieldMeta
  }

  return {
    ...getFieldMetadataFromAst(ast),
    required,
    nullableOrUndefined
  } as FieldMeta
}

const walkStruct = <T>(
  propertySignatures: readonly S.AST.PropertySignature[],
  parent: string,
  parentMeta: ParentMeta,
  ctx: WalkerContext<T>
): void => {
  for (const p of propertySignatures) {
    const key = parent ? `${parent}.${p.name.toString()}` : p.name.toString()
    const nullableOrUndefined = isNullableOrUndefined(p.type)
    const isOptionalKey = (p.type as any).context?.isOptional === true

    let isRequired: boolean
    if (parentMeta.isNullableDiscriminatedUnion && p.name.toString() === "_tag") {
      isRequired = false
    } else if (parentMeta.required === false) {
      isRequired = false
    } else if (isOptionalKey) {
      isRequired = false
    } else {
      isRequired = !nullableOrUndefined
    }

    walk(
      p.type,
      key,
      { required: isRequired, nullableOrUndefined, isOptionalKey },
      ctx
    )
  }
}

const classifyAndWalkUnion = <T>(
  unionAst: S.AST.Union,
  key: string,
  parentMeta: ParentMeta,
  ctx: WalkerContext<T>
): void => {
  const { acc, fieldAstByPath } = ctx
  const unwrappedTypes = unwrapNestedUnions(unionAst.types).map(unwrapDeclaration)
  const nonNullTypes = unwrappedTypes.filter((t) => !isNullishType(t))

  // Boolean literal shortcut (single-value union wrapping a boolean literal)
  if (nonNullTypes.length === 1 && S.AST.isLiteral(nonNullTypes[0]!) && typeof nonNullTypes[0]!.literal === "boolean") {
    acc[key as NestedKeyOf<T>] = leafMetaForAst(nonNullTypes[0]!, parentMeta)
    if (fieldAstByPath) fieldAstByPath[key] = unionAst
    return
  }

  if (nonNullTypes.some(S.AST.isObjects)) {
    const isNullableDiscriminatedUnion = !!parentMeta.nullableOrUndefined && nonNullTypes.length > 1

    // Mixed union: also create a parent leaf entry from the first non-struct member
    if (!parentMeta.nullableOrUndefined && key) {
      const firstNonStruct = nonNullTypes.find((t) => !S.AST.isObjects(t))
      if (firstNonStruct) {
        acc[key as NestedKeyOf<T>] = leafMetaForAst(firstNonStruct, parentMeta)
        if (fieldAstByPath) fieldAstByPath[key] = unionAst
      }
    }

    const discriminatorValues: any[] = []
    const tagLiteralAsts: S.AST.AST[] = []
    const branchParentMeta: ParentMeta = isNullableDiscriminatedUnion
      ? { required: true, nullableOrUndefined: false, isNullableDiscriminatedUnion: true }
      : { required: true, nullableOrUndefined: false }

    for (const memberType of nonNullTypes) {
      if (!S.AST.isObjects(memberType)) continue

      const tagProp = memberType.propertySignatures.find((p) => p.name.toString() === "_tag")
      const resolvedTagType = tagProp ? unwrapSingleLiteralUnion(tagProp.type) : null
      let tagValue: string | null = null

      if (resolvedTagType && S.AST.isLiteral(resolvedTagType)) {
        tagValue = resolvedTagType.literal as string
        if (!discriminatorValues.includes(tagValue)) discriminatorValues.push(tagValue)
        if (!tagLiteralAsts.some((t) => S.AST.isLiteral(t) && t.literal === tagValue)) {
          tagLiteralAsts.push(resolvedTagType)
        }
        if (tagProp && S.AST.isUnion(tagProp.type)) warnLegacyTag(tagValue)
      }

      const branchCtx: WalkerContext<T> = { acc: {}, unionMeta: ctx.unionMeta, fieldAstByPath }
      walkStruct(memberType.propertySignatures, key, branchParentMeta, branchCtx)

      if (tagValue) {
        const existing = ctx.unionMeta[tagValue]
        if (existing) Object.assign(existing, branchCtx.acc as MetaRecord<T>)
        else ctx.unionMeta[tagValue] = branchCtx.acc as MetaRecord<T>
      }

      for (const [metaKey, metaValue] of Object.entries(branchCtx.acc)) {
        const existing = acc[metaKey as NestedKeyOf<T>] as FieldMeta | undefined
        if (existing && existing.type === "select" && (metaValue as any)?.type === "select") {
          existing.members = [
            ...existing.members,
            ...(metaValue as SelectFieldMeta).members.filter((m: any) => !existing.members.includes(m))
          ]
        } else {
          acc[metaKey as NestedKeyOf<T>] = metaValue as FieldMeta
        }
      }
    }

    if (discriminatorValues.length > 0) {
      const tagKey = key ? `${key}._tag` : "_tag"
      const existing = acc[tagKey as NestedKeyOf<T>] as FieldMeta | undefined
      if (existing && existing.type === "select") {
        for (const v of discriminatorValues) {
          if (!existing.members.includes(v)) existing.members.push(v)
        }
      } else {
        acc[tagKey as NestedKeyOf<T>] = {
          type: "select",
          members: discriminatorValues,
          required: !isNullableDiscriminatedUnion
        } as FieldMeta
      }
      if (fieldAstByPath && tagLiteralAsts.length > 0) {
        fieldAstByPath[tagKey] = tagLiteralAsts.length === 1
          ? tagLiteralAsts[0]!
          : new S.AST.Union(tagLiteralAsts, "anyOf")
      }
    }
    return
  }

  if (nonNullTypes.some(S.AST.isArrays)) {
    walk(nonNullTypes.find(S.AST.isArrays)!, key, parentMeta, ctx)
    if (fieldAstByPath) fieldAstByPath[key] = unionAst
    return
  }

  // Literal / primitive union (e.g. legacy _tag pattern)
  const resolvedTypes = unwrappedTypes.map(unwrapSingleLiteralUnion)
  if (resolvedTypes.every((_) => isNullishType(_) || S.AST.isLiteral(_))) {
    const { isOptionalKey, nullableOrUndefined, required } = parentMeta
    const leaf: FieldMeta = {
      required,
      nullableOrUndefined,
      type: "select",
      members: resolvedTypes.filter(S.AST.isLiteral).map((t) => t.literal)
    } as FieldMeta
    if (isOptionalKey) leaf.isOptionalKey = true
    acc[key as NestedKeyOf<T>] = leaf
    if (fieldAstByPath) fieldAstByPath[key] = unionAst
    return
  }

  // Fallback: recurse into first non-null type
  const nonNullType = nonNullTypes[0]
  if (nonNullType) walk(nonNullType, key, parentMeta, ctx)
}

const walk = <T>(
  ast: S.AST.AST,
  key: string,
  parentMeta: ParentMeta,
  ctx: WalkerContext<T>
): void => {
  ast = unwrapDeclaration(ast)
  const { acc, fieldAstByPath } = ctx

  if (S.AST.isObjects(ast)) {
    walkStruct(ast.propertySignatures, key, parentMeta, ctx)
    return
  }

  if (S.AST.isUnion(ast)) {
    classifyAndWalkUnion(ast, key, parentMeta, ctx)
    return
  }

  if (S.AST.isArrays(ast)) {
    const restElement = ast.rest.length > 0 ? unwrapDeclaration(ast.rest[0]!) : null
    if (restElement && S.AST.isObjects(restElement)) {
      // Array-of-struct: skip creating a meta entry for the array itself,
      // recurse into the element struct's properties instead
      walkStruct(restElement.propertySignatures, key, { required: true, nullableOrUndefined: false }, ctx)
      return
    }

    // Primitive or tuple array
    acc[key as NestedKeyOf<T>] = leafMetaForAst(ast, parentMeta)
    if (fieldAstByPath) fieldAstByPath[key] = ast
    return
  }

  // Leaf primitive / literal / unknown
  const { isOptionalKey, nullableOrUndefined, required } = parentMeta
  const adjusted: ParentMeta = {
    required: required && (!S.AST.isString(ast) || !!getFieldMetadataFromAst(ast).minLength),
    nullableOrUndefined
  }
  const leaf = leafMetaForAst(ast, adjusted)
  if (isOptionalKey) leaf.isOptionalKey = true
  acc[key as NestedKeyOf<T>] = leaf
  if (fieldAstByPath) fieldAstByPath[key] = ast
}

export const createMeta = <T = any>(
  { meta = {}, parent = "", property, propertySignatures }: CreateMeta,
  acc: Partial<MetaRecord<T>> = {},
  fieldAstByPath?: Record<string, S.AST.AST>
): MetaRecord<T> | FieldMeta => {
  const ctx: WalkerContext<T> = { acc, unionMeta: {}, fieldAstByPath }

  if (propertySignatures) {
    const parentMeta: ParentMeta = {
      required: meta.required !== false,
      nullableOrUndefined: meta.nullableOrUndefined ?? false
    }
    walkStruct(propertySignatures, parent, parentMeta, ctx)
    return acc
  }

  if (property) {
    const nullableOrUndefined = isNullableOrUndefined(property)
    const unwrapped = unwrapDeclaration(property)
    const required = !Object.hasOwnProperty.call(meta, "required")
      ? !nullableOrUndefined
      : (meta.required as boolean)

    const parentMeta: ParentMeta = {
      required,
      nullableOrUndefined: (meta.nullableOrUndefined ?? nullableOrUndefined) as false | "null" | "undefined"
    }

    if (S.AST.isObjects(unwrapped)) {
      walkStruct(unwrapped.propertySignatures, parent, parentMeta, ctx)
      return acc
    }

    if (S.AST.isUnion(unwrapped)) {
      // For property-mode, return a FieldMeta by running through classifyAndWalkUnion
      // and then pulling out the result at `parent` key
      const leafCtx: WalkerContext<T> = { acc: {}, unionMeta: {}, fieldAstByPath }
      classifyAndWalkUnion(unwrapped, parent, parentMeta, leafCtx)
      const result = (leafCtx.acc as any)[parent]
      if (result) return result as FieldMeta
    }

    return leafMetaForAst(unwrapped, parentMeta)
  }

  return acc
}

export const metadataFromAst = <From, To>(
  schema: S.Codec<To, From, never>
): {
  meta: MetaRecord<To>
  defaultValues: Record<string, any>
  unionMeta: Record<string, MetaRecord<To>>
} => {
  const ast = unwrapDeclaration(schema.ast)
  const newMeta: Partial<MetaRecord<To>> = {}
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

  const ctx: WalkerContext<To> = { acc: newMeta, unionMeta, fieldAstByPath }

  if (S.AST.isUnion(ast)) {
    // Root-level discriminated union
    classifyAndWalkUnion(ast, "", { required: true, nullableOrUndefined: false }, ctx)

    attachOriginalSchemas(newMeta as MetaRecord<To>)
    return { meta: newMeta as MetaRecord<To>, defaultValues, unionMeta }
  }

  if (S.AST.isObjects(ast)) {
    walkStruct(ast.propertySignatures, "", { required: true, nullableOrUndefined: false }, ctx)

    const typedMeta = newMeta as MetaRecord<To>
    attachOriginalSchemas(typedMeta)
    return { meta: typedMeta, defaultValues, unionMeta }
  }

  attachOriginalSchemas(newMeta as MetaRecord<To>)
  return { meta: newMeta as MetaRecord<To>, defaultValues, unionMeta }
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
