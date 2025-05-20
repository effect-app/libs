import { pipe, S, Option, type Record, type Effect } from "effect-app"
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  type FormAsyncValidateOrFn,
  type FormValidateOrFn,
  type StandardSchemaV1,
  type FormApi,
  type VueFormApi,
  type FieldComponent,
  type FormOptions,
  type DeepKeys,
  type FieldValidateOrFn,
  type FieldAsyncValidateOrFn,
  type FormState,
} from "@tanstack/vue-form"
import type { Component } from "vue"
import { useIntl } from "../../utils"

export type ShowErrorsOn = "onChange" | "onBlur" | "onSubmit"

export type OmegaInputProps<From, To> = {
  form: FormType<From, To> & {
    meta: MetaRecord<To>
  }
  name: NestedKeyOf<To>
  validators?: FieldValidators<From>
  label: string
  options?: { title: string; value: string }[]
  type?: TypeOverride
}

export type TypeOverride =
  | "string"
  | "text"
  | "number"
  | "select"
  | "multiple"
  | "boolean"
  | "autocomplete"
  | "autocompletemultiple"
  | "switch"

export interface OmegaError {
  label: string
  inputId: string
  errors: readonly string[]
}

const isArrayOfString = S.NonEmptyArray(S.String)

export type FormProps<To, From> = Omit<
  FormOptions<
    To,
    FormValidateOrFn<To> | undefined,
    FormValidateOrFn<To> | undefined,
    StandardSchemaV1<To, From>,
    FormValidateOrFn<To> | undefined,
    FormAsyncValidateOrFn<To> | undefined,
    FormValidateOrFn<To> | undefined,
    FormAsyncValidateOrFn<To> | undefined,
    FormAsyncValidateOrFn<To> | undefined,
    FormAsyncValidateOrFn<To> | undefined
  >,
  "onSubmit"
> & {
  onSubmit?: (props: {
    formApi: OmegaFormParams<To, From>
    meta: any
    value: From
  }) => Promise<any> | any
}

export type OmegaFormParams<To, From> = FormApi<
  To,
  FormValidateOrFn<To> | undefined,
  FormValidateOrFn<To> | undefined,
  StandardSchemaV1<To, From>,
  FormValidateOrFn<To> | undefined,
  FormAsyncValidateOrFn<To> | undefined,
  FormValidateOrFn<To> | undefined,
  FormAsyncValidateOrFn<To> | undefined,
  FormAsyncValidateOrFn<To> | undefined,
  FormAsyncValidateOrFn<To> | undefined
>

export type OmegaFormState<To, From> = FormState<
  To,
  FormValidateOrFn<To> | undefined,
  FormValidateOrFn<To> | undefined,
  StandardSchemaV1<To, From>,
  FormValidateOrFn<To> | undefined,
  FormAsyncValidateOrFn<To> | undefined,
  FormValidateOrFn<To> | undefined,
  FormAsyncValidateOrFn<To> | undefined,
  FormAsyncValidateOrFn<To> | undefined
>

export type OmegaFormApi<To, From> = OmegaFormParams<To, From> &
  VueFormApi<
    To,
    FormValidateOrFn<To> | undefined,
    FormValidateOrFn<To> | undefined,
    StandardSchemaV1<To, From>,
    FormValidateOrFn<To> | undefined,
    FormAsyncValidateOrFn<To> | undefined,
    FormValidateOrFn<To> | undefined,
    FormAsyncValidateOrFn<To> | undefined,
    FormAsyncValidateOrFn<To> | undefined,
    FormAsyncValidateOrFn<To> | undefined
  >

export type FormComponent<T, S> = FieldComponent<
  T,
  FormValidateOrFn<T> | undefined,
  FormValidateOrFn<T> | undefined,
  StandardSchemaV1<T, S>,
  FormValidateOrFn<T> | undefined,
  FormAsyncValidateOrFn<T> | undefined,
  FormValidateOrFn<T> | undefined,
  FormAsyncValidateOrFn<T> | undefined,
  FormAsyncValidateOrFn<T> | undefined,
  FormAsyncValidateOrFn<T> | undefined
> &
  Component

export type FormType<T, S = unknown> = OmegaFormApi<T, S> & {
  Field: Component
}

export type PrefixFromDepth<
  K extends string | number,
  _TDepth extends any[],
> = K

export type NestedKeyOf<T> = DeepKeys<T>

export type FieldValidators<T> = {
  onChangeAsync?: FieldAsyncValidateOrFn<T, any, any>
  onChange?: FieldValidateOrFn<T, any, any>
  onBlur?: FieldValidateOrFn<T, any, any>
  onBlurAsync?: FieldAsyncValidateOrFn<T, any, any>
}

// Field metadata type definitions
export type BaseFieldMeta = {
  required: boolean
  nullableOrUndefined?: false | "undefined" | "null"
}

export type StringFieldMeta = BaseFieldMeta & {
  type: "string"
  maxLength?: number
  minLength?: number
  format?: string
}

export type NumberFieldMeta = BaseFieldMeta & {
  type: "number"
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
}

export type SelectFieldMeta = BaseFieldMeta & {
  type: "select"
  members: any[]
}

export type MultipleFieldMeta = BaseFieldMeta & {
  type: "multiple"
  members: any[]
}

export type BooleanFieldMeta = BaseFieldMeta & {
  type: "boolean"
}

export type UnknownFieldMeta = BaseFieldMeta & {
  type: "unknown"
}

export type FieldMeta =
  | StringFieldMeta
  | NumberFieldMeta
  | SelectFieldMeta
  | MultipleFieldMeta
  | BooleanFieldMeta
  | UnknownFieldMeta

export type MetaRecord<T = string> = {
  [K in NestedKeyOf<T>]?: FieldMeta
}

export type FilterItems = {
  items: readonly [string, ...string[]]
  message:
    | string
    | Effect.Effect<string, never, never>
    | { readonly message: string | Effect.Effect<string> }
}

type CreateMeta = {
  parent?: string
  meta?: Record<string, any>
  nullableOrUndefined?: false | "undefined" | "null"
} & (
  | {
      propertySignatures: readonly S.AST.PropertySignature[]
      property?: never
    }
  | {
      propertySignatures?: never
      property: S.AST.AST
    }
)

const getNullableOrUndefined = (property: S.AST.AST) => {
  return (
    S.AST.isUnion(property) &&
    property.types.find(_ => _._tag === "UndefinedKeyword" || _ === S.Null.ast)
  )
}

const isNullableOrUndefined = (property: false | S.AST.AST | undefined) => {
  if (!property || !S.AST.isUnion(property)) return false
  if (property.types.find(_ => _._tag === "UndefinedKeyword"))
    return "undefined"
  if (property.types.find(_ => _ === S.Null.ast)) return "null"
  return false
}

const createMeta = <T = any>(
  { meta = {}, parent = "", property, propertySignatures }: CreateMeta,
  acc: Partial<MetaRecord<T>> = {},
): MetaRecord<T> | FieldMeta => {
  if (property && property._tag === "Transformation") {
    return createMeta<T>({
      parent,
      meta,
      property: property.from,
    })
  }

  if (property?._tag === "TypeLiteral" && "propertySignatures" in property) {
    return createMeta<T>({
      meta,
      propertySignatures: property.propertySignatures,
    })
  }

  if (propertySignatures) {
    for (const p of propertySignatures) {
      const key = parent ? `${parent}.${p.name.toString()}` : p.name.toString()
      const nullableOrUndefined = isNullableOrUndefined(p.type)
      const isRequired = !nullableOrUndefined

      let typeToProcess = p.type
      if (S.AST.isUnion(p.type)) {
        typeToProcess = p.type.types.find(
          t => t._tag !== "UndefinedKeyword" && t !== S.Null.ast,
        )!
      }

      if ("propertySignatures" in typeToProcess) {
        Object.assign(
          acc,
          createMeta<T>({
            parent: key,
            propertySignatures: typeToProcess.propertySignatures,
            meta: { required: isRequired, nullableOrUndefined },
          }),
        )
      } else {
        const newMeta = createMeta<T>({
          parent: key,
          property: p.type,
          meta: { required: isRequired, nullableOrUndefined },
        })
        acc[key as NestedKeyOf<T>] = newMeta as FieldMeta
      }
    }
    return acc
  }

  if (property) {
    const nullableOrUndefined = getNullableOrUndefined(property)

    if (!Object.hasOwnProperty.call(meta, "required")) {
      meta["required"] = !nullableOrUndefined
    }

    if (S.AST.isUnion(property)) {
      const nonNullType = property.types.find(
        t => t._tag !== "UndefinedKeyword" && t !== S.Null.ast,
      )!

      if ("propertySignatures" in nonNullType) {
        return createMeta<T>({
          propertySignatures: nonNullType.propertySignatures,
          parent,
          meta,
        })
      }

      if (property.types.every(S.AST.isLiteral)) {
        return {
          ...meta,
          type: "select",
          members: property.types.map(t => t.literal),
        } as FieldMeta
      }

      return {
        ...meta,
        ...createMeta<T>({
          parent,
          meta,
          property: nonNullType,
        }),
      } as FieldMeta
    }

    if (S.AST.isTupleType(property)) {
      return {
        ...meta,
        type: "multiple",
        members: property.elements,
      } as FieldMeta
    }

    const JSONAnnotation = S.AST.getAnnotation(
      property,
      S.AST.JSONSchemaAnnotationId,
    ).pipe(Option.getOrElse(() => ({}))) as Record<string, unknown>

    meta = { ...meta, ...JSONAnnotation }

    if ("from" in property) {
      return createMeta<T>({
        parent,
        meta,
        property: property.from,
      })
    } else {
      meta["type"] = S.AST.getAnnotation(
        property,
        S.AST.TitleAnnotationId,
      ).pipe(
        Option.getOrElse(() => {
          return "unknown"
        }),
      )
    }

    return meta as FieldMeta
  }

  return acc
}

const flattenMeta = <From, To>(
  schema: S.Schema<From, To, never>,
): MetaRecord<To> => {
  const ast = schema.ast
  const result: MetaRecord<To> = {}

  if (ast._tag === "Transformation" || ast._tag === "Refinement") {
    return flattenMeta(S.make(ast.from))
  }

  if ("propertySignatures" in ast) {
    const meta = createMeta<To>({
      propertySignatures: ast.propertySignatures,
    })

    if (Object.values(meta).every(value => value && "type" in value)) {
      return meta as MetaRecord<To>
    }

    const flattenObject = (
      obj: Record<string, any>,
      parentKey: string = "",
    ) => {
      for (const key in obj) {
        const newKey = parentKey ? `${parentKey}.${key}` : key
        if (obj[key] && typeof obj[key] === "object" && "type" in obj[key]) {
          result[newKey as NestedKeyOf<To>] = obj[key] as FieldMeta
        } else if (obj[key] && typeof obj[key] === "object") {
          flattenObject(obj[key], newKey)
        }
      }
    }

    flattenObject(meta)
  }

  return result
}

export const duplicateSchema = <From, To>(
  schema: S.Schema<From, To, never>,
) => {
  return S.extend(schema, S.Struct({}))
}

export const generateMetaFromSchema = <From, To>(
  schema: S.Schema<From, To, never>,
): {
  schema: S.Schema<From, To, never>
  meta: MetaRecord<To>
  filterItems?: FilterItems
} => {
  const meta = flattenMeta(schema)

  const filterItems = pipe(
    schema.ast,
    Option.liftPredicate(s => s._tag === "Refinement" && "filter" in s),
    Option.flatMap(s => S.AST.getJSONSchemaAnnotation(s)),
    Option.filter(s => "items" in s),
    Option.filterMap(({ items }) =>
      S.decodeUnknownOption(isArrayOfString)(items),
    ),
    Option.zipWith(
      S.AST.getMessageAnnotation(schema.ast),
      (items, message) => ({
        items,
        message: message("" as unknown as S.ParseResult.ParseIssue),
      }),
    ),
    Option.getOrUndefined,
  )
  return { schema, meta, filterItems }
}

export const generateInputStandardSchemaFromFieldMeta = (
  meta: FieldMeta,
): StandardSchemaV1<any, any> => {
  const { trans } = useIntl()
  let schema: S.Schema<any, any, never>
  switch (meta.type) {
    case "string":
      schema = S.String.annotations({
        message: () => trans("validation.empty"),
      })

      if (meta.format === "email") {
        schema = S.compose(
          schema,
          S.Email.annotations({
            message: () => trans("validation.email.invalid"),
          }),
        )
      }

      if (meta.required) {
        schema.annotations({
          message: () => trans("validation.empty"),
        })
      }

      if (meta.maxLength) {
        schema = schema.pipe(S.maxLength(meta.maxLength)).annotations({
          message: () =>
            trans("validation.string.maxLength", {
              maxLength: meta.maxLength,
            }),
        })
      }
      if (meta.minLength) {
        schema = schema.pipe(S.minLength(meta.minLength)).annotations({
          message: () =>
            trans("validation.string.minLength", {
              minLength: meta.minLength,
            }),
        })
      }
      break

    case "number":
      schema = S.Number.annotations({
        message: () => trans("validation.empty"),
      })

      if (meta.required) {
        schema.annotations({
          message: () => trans("validation.empty"),
        })
      }
      if (meta.minimum) {
        schema = schema.pipe(S.greaterThanOrEqualTo(meta.minimum)).annotations({
          message: () =>
            trans("validation.number.min", {
              minimum: meta.minimum,
              isExclusive: true,
            }),
        })
      }
      if (meta.maximum) {
        schema = schema.pipe(S.lessThanOrEqualTo(meta.maximum)).annotations({
          message: () =>
            trans("validation.number.max", {
              maximum: meta.maximum,
              isExclusive: true,
            }),
        })
      }
      if (meta.exclusiveMinimum) {
        schema = schema.pipe(S.greaterThan(meta.exclusiveMinimum)).annotations({
          message: () =>
            trans("validation.number.min", {
              minimum: meta.exclusiveMinimum,
              isExclusive: false,
            }),
        })
      }
      if (meta.exclusiveMaximum) {
        schema = schema.pipe(S.lessThan(meta.exclusiveMaximum)).annotations({
          message: () =>
            trans("validation.number.max", {
              maximum: meta.exclusiveMaximum,
              isExclusive: false,
            }),
        })
      }
      break
    case "select":
      schema = S.Literal(...meta.members).annotations({
        message: () => ({
          message: trans("validation.not_a_valid", {
            type: "select",
            message: meta.members.join(", "),
          }),
          override: true,
        }),
      })

      break

    case "multiple":
      schema = S.Array(S.String).annotations({
        message: () =>
          trans("validation.not_a_valid", {
            type: "multiple",
            message: meta.members.join(", "),
          }),
      })
      break

    case "boolean":
      schema = S.Boolean
      break
    // todo: switch must be exhaustive or have default case, otherwise falls through with schema undefined.

    case "unknown":
      schema = S.Unknown
      break
  }
  if (!meta.required) {
    schema = S.NullishOr(schema)
  } else {
    schema.pipe(
      S.annotations({
        message: () => trans("validation.empty"),
      }),
    )
  }
  const result = S.standardSchemaV1(schema)
  return result
}

export const nullableInput = <A, I, R>(
  schema: S.Schema<A, I, R>,
  defaultValue: () => A,
) =>
  S.NullOr(schema).pipe(
    S.transform(S.typeSchema(schema), {
      decode: input => input ?? defaultValue(),
      encode: input => input,
    }),
  )
