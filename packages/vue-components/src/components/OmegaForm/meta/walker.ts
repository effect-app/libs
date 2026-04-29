/* eslint-disable @typescript-eslint/no-explicit-any -- AST walker interops with Effect Schema generics */
/* eslint-disable @typescript-eslint/no-use-before-define -- mutual recursion between walk and helpers (handleStruct/handleUnion/etc.) */
import { S } from "effect-app"
import { getFieldMetadataFromAst } from "./checks"
import { isNullableOrUndefined, unwrapDeclaration } from "./createMeta"
import type { FieldMeta, MetaRecord, NestedKeyOf, SelectFieldMeta } from "./types"

const isNullishType = (property: S.AST.AST) => S.AST.isUndefined(property) || S.AST.isNull(property)

// TODO: remove after manual _tag deprecation — S.Struct({ _tag: S.Literal("X") }) wraps as Union([Literal("X")])
const unwrapSingleLiteralUnion = (ast: S.AST.AST): S.AST.AST =>
  S.AST.isUnion(ast) && ast.types.length === 1 && S.AST.isLiteral(ast.types[0])
    ? ast.types[0]
    : ast

const unwrapNestedUnions = (types: readonly S.AST.AST[]): readonly S.AST.AST[] =>
  types.flatMap((type) => S.AST.isUnion(type) ? unwrapNestedUnions(type.types) : [type])

export type WalkerContext<T> = {
  acc: Partial<MetaRecord<T>>
  unionMeta: Record<string, MetaRecord<T>>
}

export type ParentMeta = {
  required: boolean
  nullableOrUndefined: false | "null" | "undefined"
  /** Set when iterating the members of a nullable discriminated union */
  isNullableDiscriminatedUnion?: boolean
  /** Set when this property was declared with S.optionalKey */
  isOptionalKey?: boolean
}

export const leafMetaForAst = (
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

export const walkStruct = <T>(
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
    } else if (!parentMeta.required) {
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

export const classifyAndWalkUnion = <T>(
  unionAst: S.AST.Union,
  key: string,
  parentMeta: ParentMeta,
  ctx: WalkerContext<T>
): void => {
  const { acc } = ctx
  const unwrappedTypes = unwrapNestedUnions(unionAst.types).map(unwrapDeclaration)
  const nonNullTypes = unwrappedTypes.filter((t) => !isNullishType(t))

  // Boolean literal shortcut (single-value union wrapping a boolean literal)
  if (nonNullTypes.length === 1 && S.AST.isLiteral(nonNullTypes[0]) && typeof nonNullTypes[0].literal === "boolean") {
    acc[key as NestedKeyOf<T>] = leafMetaForAst(nonNullTypes[0], parentMeta)
    return
  }

  if (nonNullTypes.some(S.AST.isObjects)) {
    const isNullableDiscriminatedUnion = !!parentMeta.nullableOrUndefined && nonNullTypes.length > 1

    // Mixed union: also create a parent leaf entry from the first non-struct member
    if (!parentMeta.nullableOrUndefined && key) {
      const firstNonStruct = nonNullTypes.find((t) => !S.AST.isObjects(t))
      if (firstNonStruct) {
        acc[key as NestedKeyOf<T>] = leafMetaForAst(firstNonStruct, parentMeta)
      }
    }

    const discriminatorValues: any[] = []
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
      }

      const branchCtx: WalkerContext<T> = { acc: {}, unionMeta: ctx.unionMeta }
      walkStruct(memberType.propertySignatures, key, branchParentMeta, branchCtx)

      if (tagValue) {
        const existing = ctx.unionMeta[tagValue]
        if (existing) Object.assign(existing, branchCtx.acc as MetaRecord<T>)
        else ctx.unionMeta[tagValue] = branchCtx.acc as MetaRecord<T>
      }

      for (const [metaKey, metaValue] of Object.entries(branchCtx.acc)) {
        const existing = acc[metaKey as NestedKeyOf<T>]
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
      const existing = acc[tagKey as NestedKeyOf<T>]
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
    }
    return
  }

  if (nonNullTypes.some(S.AST.isArrays)) {
    walk(nonNullTypes.find(S.AST.isArrays)!, key, parentMeta, ctx)
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
    return
  }

  // Fallback: recurse into first non-null type
  const nonNullType = nonNullTypes[0]
  if (nonNullType) walk(nonNullType, key, parentMeta, ctx)
}

export const walk = <T>(
  ast: S.AST.AST,
  key: string,
  parentMeta: ParentMeta,
  ctx: WalkerContext<T>
): void => {
  ast = unwrapDeclaration(ast)
  const { acc } = ctx

  if (S.AST.isObjects(ast)) {
    walkStruct(ast.propertySignatures, key, parentMeta, ctx)
    return
  }

  if (S.AST.isUnion(ast)) {
    classifyAndWalkUnion(ast, key, parentMeta, ctx)
    return
  }

  if (S.AST.isArrays(ast)) {
    const restElement = ast.rest.length > 0 ? unwrapDeclaration(ast.rest[0]) : null
    if (restElement && S.AST.isObjects(restElement)) {
      // Array-of-struct: skip creating a meta entry for the array itself,
      // recurse into the element struct's properties instead
      walkStruct(restElement.propertySignatures, key, { required: true, nullableOrUndefined: false }, ctx)
      return
    }

    // Primitive or tuple array
    acc[key as NestedKeyOf<T>] = leafMetaForAst(ast, parentMeta)
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
}
