/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Effect, type Record, S } from "effect-app"
import { getTransformationFrom } from "../../../utils"
import type { FieldMeta, MetaRecord } from "./types"
import { classifyAndWalkUnion, leafMetaForAst, type ParentMeta, type WalkerContext, walkStruct } from "./walker"

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

export const isNullableOrUndefined = (property: false | S.AST.AST | undefined) => {
  if (!property || !S.AST.isUnion(property)) return false
  if (property.types.find((_) => S.AST.isUndefined(_))) {
    return "undefined"
  }
  if (property.types.find((_) => S.AST.isNull(_))) return "null"
  return false
}

export const createMeta = <T = any>(
  { meta = {}, parent = "", property, propertySignatures }: CreateMeta,
  acc: Partial<MetaRecord<T>> = {}
): MetaRecord<T> | FieldMeta => {
  const ctx: WalkerContext<T> = { acc, unionMeta: {} }

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
      const leafCtx: WalkerContext<T> = { acc: {}, unionMeta: {} }
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

  const ctx: WalkerContext<To> = { acc: newMeta, unionMeta }

  if (S.AST.isUnion(ast)) {
    // Root-level discriminated union
    classifyAndWalkUnion(ast, "", { required: true, nullableOrUndefined: false }, ctx)

    return { meta: newMeta as MetaRecord<To>, defaultValues, unionMeta }
  }

  if (S.AST.isObjects(ast)) {
    walkStruct(ast.propertySignatures, "", { required: true, nullableOrUndefined: false }, ctx)

    return { meta: newMeta as MetaRecord<To>, defaultValues, unionMeta }
  }

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
