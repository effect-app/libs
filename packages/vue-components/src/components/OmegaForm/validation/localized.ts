/* eslint-disable @typescript-eslint/no-explicit-any */
import type { StandardSchemaV1 } from "@tanstack/vue-form"
import { S } from "effect-app"
import { useIntl } from "../../../utils"
import type { FieldMeta } from "../meta/types"

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
        return undefined
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

export const generateInputStandardSchemaFromFieldMeta = (
  meta: FieldMeta,
  trans?: ReturnType<typeof useIntl>["trans"]
): StandardSchemaV1<any, any> => {
  if (!trans) {
    trans = useIntl().trans
  }
  let schema: any
  switch (meta.type) {
    case "string":
      schema = meta.format === "email"
        ? S.Email.annotate({
          message: trans("validation.email.invalid")
        })
        : S.String.annotate({
          message: trans("validation.empty")
        })

      if (meta.required) {
        schema = schema.check(S.isMinLength(1, {
          message: trans("validation.empty")
        }))
      }

      if (typeof meta.maxLength === "number") {
        schema = schema.check(S.isMaxLength(meta.maxLength, {
          message: trans("validation.string.maxLength", {
            maxLength: meta.maxLength
          })
        }))
      }
      if (typeof meta.minLength === "number") {
        schema = schema.check(S.isMinLength(meta.minLength, {
          message: trans("validation.string.minLength", {
            minLength: meta.minLength
          })
        }))
      }
      break

    case "number":
      if (meta.refinement === "int") {
        schema = S
          .Number
          .annotate({
            message: trans("validation.empty")
          })
          .check(S.isInt({
            message: trans("validation.integer.expected", { actualValue: "NaN" })
          }))
      } else {
        schema = S.Finite.annotate({
          message: trans("validation.number.expected", { actualValue: "NaN" })
        })

        if (meta.required) {
          schema = schema.annotate({
            message: trans("validation.empty")
          })
        }
      }

      if (typeof meta.minimum === "number") {
        schema = schema.check(S.isGreaterThanOrEqualTo(meta.minimum, {
          message: trans(meta.minimum === 0 ? "validation.number.positive" : "validation.number.min", {
            minimum: meta.minimum,
            isExclusive: true
          })
        }))
      }
      if (typeof meta.maximum === "number") {
        schema = schema.check(S.isLessThanOrEqualTo(meta.maximum, {
          message: trans("validation.number.max", {
            maximum: meta.maximum,
            isExclusive: true
          })
        }))
      }
      if (typeof meta.exclusiveMinimum === "number") {
        schema = schema.check(S.isGreaterThan(meta.exclusiveMinimum, {
          message: trans(meta.exclusiveMinimum === 0 ? "validation.number.positive" : "validation.number.min", {
            minimum: meta.exclusiveMinimum,
            isExclusive: false
          })
        }))
      }
      if (typeof meta.exclusiveMaximum === "number") {
        schema = schema.check(S.isLessThan(meta.exclusiveMaximum, {
          message: trans("validation.number.max", {
            maximum: meta.exclusiveMaximum,
            isExclusive: false
          })
        }))
      }
      break
    case "select":
      schema = S.Literals(meta.members as [any, ...any[]]).annotate({
        message: trans("validation.not_a_valid", {
          type: "select",
          message: meta.members.join(", ")
        })
      })

      break

    case "multiple":
      schema = S.Array(S.String).annotate({
        message: trans("validation.not_a_valid", {
          type: "multiple",
          message: meta.members.join(", ")
        })
      })
      break

    case "boolean":
      schema = S.Boolean
      break

    case "date":
      schema = S.Date
      break

    case "unknown":
      schema = S.Unknown
      break

    default:
      // For any unhandled types, use Unknown schema to prevent undefined errors
      console.warn(`Unhandled field type: ${meta}`)
      schema = S.Unknown
      break
  }
  if (!meta.required) {
    schema = S.NullishOr(schema)
  }
  const result = S.toStandardSchemaV1(schema as any)
  return result
}
