/* eslint-disable @typescript-eslint/no-explicit-any */
import * as S from "effect-app/Schema"
import type * as Record from "effect/Record"
import type { FieldMeta } from "./types"

export const getCheckMetas = (property: S.AST.AST): Array<Record<string, any>> => {
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
