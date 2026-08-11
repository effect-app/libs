/* eslint-disable @typescript-eslint/no-explicit-any */
import * as S from "effect-app/Schema"
import type * as Record from "effect/Record"
import type { FieldMeta } from "./types"

/**
 * Normalise a filter annotation into the meta shape used by field metadata
 * extractors (`{ _tag: "isMinLength", minLength: n }`, …).
 *
 * Since effect beta.91+, filters expose `annotations.representation`
 * (`{ id: "effect/schema/isMinLength", payload: { minLength } }`) instead of
 * the older `annotations.meta` bag.
 */
const metaFromFilter = (check: {
  readonly annotations?: {
    readonly meta?: unknown
    readonly representation?: { readonly id?: string; readonly payload?: unknown }
  }
}): Array<Record<string, any>> => {
  const rep = check.annotations?.representation
  if (rep && typeof rep.id === "string") {
    const tag = rep.id.replace(/^effect\/schema\//, "")
    const payload = rep.payload !== null && typeof rep.payload === "object"
      ? rep.payload as Record<string, any>
      : {}
    return [{ _tag: tag, ...payload }]
  }

  const meta = check.annotations?.meta
  return meta && typeof meta === "object" ? [meta as Record<string, any>] : []
}

export const getCheckMetas = (property: S.AST.AST): Array<Record<string, any>> => {
  const checks = property.checks ?? []

  return checks.flatMap((check) => {
    if (check._tag === "FilterGroup") {
      return check.checks.flatMap((inner) => metaFromFilter(inner))
    }
    return metaFromFilter(check)
  })
}

export const getFieldMetadataFromAst = (property: S.AST.AST) => {
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
