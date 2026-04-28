/* eslint-disable @typescript-eslint/no-explicit-any */
import type { StandardSchemaV1 } from "@tanstack/vue-form"
import { Option, S } from "effect-app"
import type { useIntl } from "../../../utils"

export type TransFn = ReturnType<typeof useIntl>["trans"]

type FilterMeta =
  | { readonly _tag: "isMinLength"; readonly minLength: number }
  | { readonly _tag: "isMaxLength"; readonly maxLength: number }
  | { readonly _tag: "isInt" }
  | { readonly _tag: "isGreaterThanOrEqualTo"; readonly minimum: number }
  | { readonly _tag: "isGreaterThan"; readonly exclusiveMinimum: number }
  | { readonly _tag: "isLessThanOrEqualTo"; readonly maximum: number }
  | { readonly _tag: "isLessThan"; readonly exclusiveMaximum: number }
  | { readonly _tag?: undefined }

export const makeStandardSchemaV1Hooks = (
  trans: TransFn
): {
  leafHook: S.SchemaIssue.LeafHook
  checkHook: S.SchemaIssue.CheckHook
} => {
  const leafHook: S.SchemaIssue.LeafHook = (issue) => {
    const override = (issue as { annotations?: { message?: unknown } }).annotations?.message
    if (override !== undefined) return String(override)
    switch (issue._tag) {
      case "MissingKey":
        return trans("validation.empty")
      case "InvalidType": {
        const ast = issue.ast
        // Detect undefined/missing actual values across required leaves and return a uniform empty message.
        const actualUndefined = Option.isNone(issue.actual)
          || (Option.isSome(issue.actual) && issue.actual.value === undefined)
        if (actualUndefined) return trans("validation.empty")
        if (S.AST.isString(ast)) return trans("validation.empty")
        if (S.AST.isBoolean(ast)) return trans("validation.not_a_valid", { type: "boolean" })
        if (S.AST.isNumber(ast)) return trans("validation.number.expected", { actualValue: "NaN" })
        return trans("validation.not_a_valid")
      }
      default:
        return trans("validation.not_a_valid")
    }
  }

  const checkHook: S.SchemaIssue.CheckHook = (issue) => {
    const meta = (issue.filter.annotations?.meta ?? {}) as FilterMeta
    switch (meta._tag) {
      case "isMinLength":
        return meta.minLength === 1
          ? trans("validation.empty")
          : trans("validation.string.minLength", { minLength: meta.minLength })
      case "isMaxLength":
        return trans("validation.string.maxLength", { maxLength: meta.maxLength })
      case "isInt":
        return trans("validation.integer.expected", { actualValue: "NaN" })
      case "isGreaterThanOrEqualTo":
        return trans(
          meta.minimum === 0 ? "validation.number.positive" : "validation.number.min",
          { minimum: meta.minimum, isExclusive: true }
        )
      case "isGreaterThan":
        return trans(
          meta.exclusiveMinimum === 0 ? "validation.number.positive" : "validation.number.min",
          { minimum: meta.exclusiveMinimum, isExclusive: false }
        )
      case "isLessThanOrEqualTo":
        return trans("validation.number.max", { maximum: meta.maximum, isExclusive: true })
      case "isLessThan":
        return trans("validation.number.max", { maximum: meta.exclusiveMaximum, isExclusive: false })
      default:
        // Fall back to the default check hook so custom S.makeFilter messages
        // (which surface as InvalidValue.annotations.message on issue.issue)
        // are returned verbatim instead of getting the generic
        // "Expected <filter>, got <actual>" formatter output.
        return S.SchemaIssue.defaultCheckHook(issue)
    }
  }

  return { leafHook, checkHook }
}

export const toLocalizedStandardSchemaV1 = <To, From>(
  schema: S.Codec<To, From, never, never>,
  trans: TransFn
): StandardSchemaV1<From, To> => {
  const { checkHook, leafHook } = makeStandardSchemaV1Hooks(trans)
  return S.toStandardSchemaV1(schema, { leafHook, checkHook })
}
