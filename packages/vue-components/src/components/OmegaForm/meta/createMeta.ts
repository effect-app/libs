/* eslint-disable @typescript-eslint/no-explicit-any */
import { type StandardSchemaV1 } from "@tanstack/vue-form"
import { type Effect, type Record, S } from "effect-app"
import { getTransformationFrom } from "../../../utils"
import type { FieldMeta, MetaRecord, NestedKeyOf } from "./types"
import {
  classifyAndWalkUnion,
  leafMetaForAst,
  type ParentMeta,
  walkStruct,
  type WalkerContext
} from "./walker"

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
