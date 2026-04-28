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
        if (S.AST.isNumber(ast)) {
          const actual = Option.isSome(issue.actual) ? String(issue.actual.value) : "NaN"
          return trans("validation.number.expected", { actualValue: actual })
        }
        return trans("validation.not_a_valid")
      }
      default:
        return trans("validation.not_a_valid")
    }
  }

  const checkHook: S.SchemaIssue.CheckHook = (issue) => {
    // S.Email's `refine(isValidEmail, ...)` has no `meta._tag` but carries
    // `identifier: "Email"`. Localize it explicitly — otherwise the
    // formatter falls back to the generic "Expected <filter>, got <actual>".
    if (issue.filter.annotations?.identifier === "Email") {
      return trans("validation.email.invalid")
    }
    const meta = (issue.filter.annotations?.meta ?? {}) as FilterMeta
    switch (meta._tag) {
      case "isMinLength":
        return meta.minLength === 1
          ? trans("validation.empty")
          : trans("validation.string.minLength", { minLength: meta.minLength })
      case "isMaxLength":
        return trans("validation.string.maxLength", { maxLength: meta.maxLength })
      case "isInt": {
        const actual = issue.actual !== undefined ? String(issue.actual) : "NaN"
        return trans("validation.integer.expected", { actualValue: actual })
      }
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

/*
 * Effect's Standard Schema formatter handles `AnyOf` issues (produced by
 * `S.Literals(...)` failures and by `S.Array` of literal unions when the
 * top-level value isn't an array) by generating the message directly via
 * `getExpectedMessage(...)` — *without* invoking `leafHook` / `checkHook`.
 * The only override path is `findMessage(issue)`, which reads the AST's
 * `message` annotation. So we walk the schema AST once at form setup and
 * stamp a localized `message` annotation on:
 *   - Union AST whose every member is a Literal      → "select"
 *   - Arrays AST whose `rest` is a Union of Literals → "multiple"
 * Existing `message` annotations are preserved.
 */
const isLiteralUnion = (ast: S.AST.AST): ast is S.AST.Union<S.AST.Literal> =>
  S.AST.isUnion(ast) && ast.types.every(S.AST.isLiteral)

const walkAst = (ast: S.AST.AST, trans: TransFn): S.AST.AST => {
  if (isLiteralUnion(ast)) {
    if (ast.annotations?.message !== undefined) return ast
    const members = ast.types.map((t) => (t as S.AST.Literal).literal)
    return new S.AST.Union(
      ast.types,
      ast.mode,
      {
        ...ast.annotations,
        message: trans("validation.not_a_valid", { type: "select", message: members.join(", ") })
      },
      ast.checks,
      ast.encoding,
      ast.context
    )
  }
  // Mixed unions (e.g. `S.NullOr(S.Literals(...))` → Union<Null, Union<Literals>>)
  // need recursion so the inner literal-union still gets annotated. We don't
  // touch the outer mixed Union's own annotations.
  if (S.AST.isUnion(ast)) {
    const newTypes = ast.types.map((t) => walkAst(t, trans))
    const changed = newTypes.some((t, i) => t !== ast.types[i])
    if (!changed) return ast
    return new S.AST.Union(
      newTypes,
      ast.mode,
      ast.annotations,
      ast.checks,
      ast.encoding,
      ast.context
    )
  }
  if (S.AST.isArrays(ast)) {
    const newRest = ast.rest.map((e) => walkAst(e, trans))
    const newElements = ast.elements.map((e) => walkAst(e, trans))
    let annotations = ast.annotations
    if (
      ast.annotations?.message === undefined
      && ast.rest.length === 1
      && isLiteralUnion(ast.rest[0]!)
    ) {
      const members = (ast.rest[0]! as S.AST.Union<S.AST.Literal>).types.map((t) => t.literal)
      annotations = {
        ...ast.annotations,
        message: trans("validation.not_a_valid", { type: "multiple", message: members.join(", ") })
      }
    }
    const restChanged = newRest.some((r, i) => r !== ast.rest[i])
    const elemsChanged = newElements.some((e, i) => e !== ast.elements[i])
    if (!restChanged && !elemsChanged && annotations === ast.annotations) return ast
    return new S.AST.Arrays(
      ast.isMutable,
      newElements,
      newRest,
      annotations,
      ast.checks,
      ast.encoding,
      ast.context
    )
  }
  if (S.AST.isObjects(ast)) {
    const newProps = ast.propertySignatures.map((p) => {
      const newType = walkAst(p.type, trans)
      return newType === p.type ? p : new S.AST.PropertySignature(p.name, newType)
    })
    const changed = newProps.some((p, i) => p !== ast.propertySignatures[i])
    if (!changed) return ast
    return new S.AST.Objects(
      newProps,
      ast.indexSignatures,
      ast.annotations,
      ast.checks,
      ast.encoding,
      ast.context
    )
  }
  return ast
}

export const annotateLiteralUnionMessages = <To, From>(
  schema: S.Codec<To, From, never, never>,
  trans: TransFn
): S.Codec<To, From, never, never> => {
  const newAst = walkAst(schema.ast, trans)
  return newAst === schema.ast ? schema : S.make(newAst) as S.Codec<To, From, never, never>
}
