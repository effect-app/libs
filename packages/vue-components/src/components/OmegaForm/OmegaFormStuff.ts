import { type Effect, Option, pipe, type Record, S } from "effect-app"
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getMetadataFromSchema } from "@effect-app/vue/form"
import { type DeepKeys, type FieldAsyncValidateOrFn, type FieldValidateOrFn, type FormApi, type FormAsyncValidateOrFn, type FormOptions, type FormState, type FormValidateOrFn, type StandardSchemaV1, type VueFormApi } from "@tanstack/vue-form"
import { type RuntimeFiber } from "effect/Fiber"
import { getTransformationFrom, useIntl } from "../../utils"
import { type OmegaFieldInternalApi } from "./InputProps"
import { type OF, type OmegaFormReturn } from "./useOmegaForm"

export type ShowErrorsOn = "onChange" | "onBlur" | "onSubmit"

export type DefaultInputProps<From> = {
  label?: string
  validators?: FieldValidators<From>
  options?: {
    title: string
    value: string
  }[]
  type?: TypeOverride
}

export type OmegaInputPropsBase<
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>
> = {
  form: OF<From, To> & {
    meta: MetaRecord<From>
    i18nNamespace?: string
  }
  name: NestedKeyOf<From>
} & DefaultInputProps<From>

export type OmegaInputProps<
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  InputProps = DefaultInputProps<From>
> = {
  form: OmegaFormReturn<From, To, InputProps> & {
    meta: MetaRecord<From>
    i18nNamespace?: string
  }
  name: NestedKeyOf<From>
} & DefaultInputProps<From> // InputProps // TODO

export type TypeOverride =
  | "string"
  | "text"
  | "number"
  | "select"
  | "multiple"
  | "boolean"
  | "radio"
  | "autocomplete"
  | "autocompletemultiple"
  | "switch"
  | "range"
  | "password"
  | "email"

export interface OmegaError {
  label: string
  inputId: string
  errors: readonly string[]
}

const isArrayOfString = S.NonEmptyArray(S.String)

export type FormProps<From, To> =
  & Omit<
    FormOptions<
      From,
      FormValidateOrFn<From> | undefined,
      FormValidateOrFn<From> | undefined,
      StandardSchemaV1<From, To>,
      FormValidateOrFn<From> | undefined,
      FormAsyncValidateOrFn<From> | undefined,
      FormValidateOrFn<From> | undefined,
      FormAsyncValidateOrFn<From> | undefined,
      FormValidateOrFn<From> | undefined,
      FormAsyncValidateOrFn<From> | undefined,
      FormAsyncValidateOrFn<From> | undefined,
      Record<string, any> | undefined // TODO
    >,
    | "onSubmit"
    | "defaultValues"
  >
  & {
    // when defaultValues are allowed to be undefined, then they should also be allowed to be partial
    // this fixes validator issues where a defaultValue of "" leads to "requires at least 1 character", while manually emptying the field changes it to "is required"
    defaultValues?: Partial<From>
    onSubmit?: (props: {
      formApi: OmegaFormParams<From, To>
      meta: any
      value: To
    }) => Promise<any> | RuntimeFiber<any, any> | Effect.Effect<RuntimeFiber<any, any>, any, never>
  }

export type OmegaFormParams<From, To> = FormApi<
  From,
  FormValidateOrFn<From> | undefined,
  FormValidateOrFn<From> | undefined,
  StandardSchemaV1<From, To>,
  FormValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  FormValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  FormValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  Record<string, any> | undefined
>

export type OmegaFormState<From, To> = FormState<
  From,
  FormValidateOrFn<From> | undefined,
  FormValidateOrFn<From> | undefined,
  StandardSchemaV1<From, To>,
  FormValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  FormValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  FormValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined,
  FormAsyncValidateOrFn<From> | undefined
>

// TODO: stitch TSubmitMeta somehow
export type OmegaFormApi<From, To, TSubmitMeta = Record<string, any> | undefined> =
  & OmegaFormParams<From, To>
  & VueFormApi<
    From,
    FormValidateOrFn<From> | undefined,
    FormValidateOrFn<From> | undefined,
    StandardSchemaV1<From, To>,
    FormValidateOrFn<From> | undefined,
    FormAsyncValidateOrFn<From> | undefined,
    FormValidateOrFn<From> | undefined,
    FormAsyncValidateOrFn<From> | undefined,
    FormValidateOrFn<From> | undefined,
    FormAsyncValidateOrFn<From> | undefined,
    FormAsyncValidateOrFn<From> | undefined,
    TSubmitMeta
  >

export type FormComponent<T, S> = VueFormApi<
  T,
  FormValidateOrFn<T> | undefined,
  FormValidateOrFn<T> | undefined,
  StandardSchemaV1<T, S>,
  FormValidateOrFn<T> | undefined,
  FormAsyncValidateOrFn<T> | undefined,
  FormValidateOrFn<T> | undefined,
  FormAsyncValidateOrFn<T> | undefined,
  FormValidateOrFn<T> | undefined,
  FormAsyncValidateOrFn<T> | undefined,
  FormAsyncValidateOrFn<T> | undefined,
  Record<string, any> | undefined
>

export type FormType<
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  Name extends DeepKeys<From>
> = OmegaFormApi<From, To> & {
  Field: OmegaFieldInternalApi<From, Name>
}

export type PrefixFromDepth<
  K extends string | number,
  _TDepth extends any[]
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
  members: any[] // TODO: should be non empty array?
}

export type MultipleFieldMeta = BaseFieldMeta & {
  type: "multiple"
  members: any[] // TODO: should be non empty array?
  rest: S.AST.Type[]
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

const getNullableOrUndefined = (property: S.AST.AST) => {
  return (
    S.AST.isUnion(property)
    && property.types.find((_) => _._tag === "UndefinedKeyword" || _ === S.Null.ast)
  )
}

const isNullableOrUndefined = (property: false | S.AST.AST | undefined) => {
  if (!property || !S.AST.isUnion(property)) return false
  if (property.types.find((_) => _._tag === "UndefinedKeyword")) {
    return "undefined"
  }
  if (property.types.find((_) => _ === S.Null.ast)) return "null"
  return false
}

export const createMeta = <T = any>(
  { meta = {}, parent = "", property, propertySignatures }: CreateMeta,
  acc: Partial<MetaRecord<T>> = {}
): MetaRecord<T> | FieldMeta => {
  // unwraps class (Class are transformations)
  // this calls createMeta recursively, so wrapped transformations are also unwrapped
  if (property && property._tag === "Transformation") {
    return createMeta<T>({
      parent,
      meta,
      property: property.from
    })
  }

  if (property?._tag === "TypeLiteral" && "propertySignatures" in property) {
    return createMeta<T>({
      meta,
      propertySignatures: property.propertySignatures
    })
  }

  if (propertySignatures) {
    for (const p of propertySignatures) {
      const key = parent ? `${parent}.${p.name.toString()}` : p.name.toString()
      const nullableOrUndefined = isNullableOrUndefined(p.type)
      const isRequired = !nullableOrUndefined

      const typeToProcess = p.type
      if (S.AST.isUnion(p.type)) {
        const nonNullTypes = p
          .type
          .types
          .filter(
            (t) => t._tag !== "UndefinedKeyword" && t !== S.Null.ast
          )
          // unwraps class (Class are transformations)
          .map(getTransformationFrom)

        const hasStructMembers = nonNullTypes.some(
          (t) => "propertySignatures" in t
        )

        if (hasStructMembers) {
          // Only create parent meta for non-NullOr unions to avoid duplicates
          if (!nullableOrUndefined) {
            const parentMeta = createMeta<T>({
              parent: key,
              property: p.type,
              meta: { required: isRequired, nullableOrUndefined }
            })
            acc[key as NestedKeyOf<T>] = parentMeta as FieldMeta
          }

          // Process each non-null type and merge their metadata
          for (const nonNullType of nonNullTypes) {
            if ("propertySignatures" in nonNullType) {
              Object.assign(
                acc,
                createMeta<T>({
                  parent: key,
                  propertySignatures: nonNullType.propertySignatures,
                  meta: { required: isRequired, nullableOrUndefined }
                })
              )
            }
          }
        } else {
          // Check if any of the union types are arrays (TupleType)
          const arrayTypes = nonNullTypes.filter(S.AST.isTupleType)
          if (arrayTypes.length > 0) {
            const arrayType = arrayTypes[0] // Take the first array type

            acc[key as NestedKeyOf<T>] = {
              type: "multiple",
              members: arrayType.elements,
              rest: arrayType.rest,
              required: isRequired,
              nullableOrUndefined
            } as FieldMeta

            // If the array has struct elements, also create metadata for their properties
            if (arrayType.rest && arrayType.rest.length > 0) {
              const restElement = arrayType.rest[0]
              if (restElement.type._tag === "TypeLiteral" && "propertySignatures" in restElement.type) {
                for (const prop of restElement.type.propertySignatures) {
                  const propKey = `${key}.${prop.name.toString()}`

                  const propMeta = createMeta<T>({
                    parent: propKey,
                    property: prop.type,
                    meta: {
                      required: !isNullableOrUndefined(prop.type),
                      nullableOrUndefined: isNullableOrUndefined(prop.type)
                    }
                  })

                  // add to accumulator if valid
                  if (propMeta && typeof propMeta === "object" && "type" in propMeta) {
                    acc[propKey as NestedKeyOf<T>] = propMeta as FieldMeta

                    if (
                      propMeta.type === "multiple" && S.AST.isTupleType(prop.type) && prop
                        .type
                        .rest && prop.type.rest.length > 0
                    ) {
                      const nestedRestElement = prop.type.rest[0]
                      if (
                        nestedRestElement.type._tag === "TypeLiteral" && "propertySignatures" in nestedRestElement.type
                      ) {
                        for (const nestedProp of nestedRestElement.type.propertySignatures) {
                          const nestedPropKey = `${propKey}.${nestedProp.name.toString()}`

                          const nestedPropMeta = createMeta<T>({
                            parent: nestedPropKey,
                            property: nestedProp.type,
                            meta: {
                              required: !isNullableOrUndefined(nestedProp.type),
                              nullableOrUndefined: isNullableOrUndefined(nestedProp.type)
                            }
                          })

                          // add to accumulator if valid
                          if (nestedPropMeta && typeof nestedPropMeta === "object" && "type" in nestedPropMeta) {
                            acc[nestedPropKey as NestedKeyOf<T>] = nestedPropMeta as FieldMeta
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          } else {
            // If no struct members and no arrays, process as regular union
            const newMeta = createMeta<T>({
              parent: key,
              property: p.type,
              meta: { required: isRequired, nullableOrUndefined }
            })
            acc[key as NestedKeyOf<T>] = newMeta as FieldMeta
          }
        }
      } else if ("propertySignatures" in typeToProcess) {
        Object.assign(
          acc,
          createMeta<T>({
            parent: key,
            propertySignatures: typeToProcess.propertySignatures,
            meta: { required: isRequired, nullableOrUndefined }
          })
        )
      } else {
        // Check if this is an array type
        if (S.AST.isTupleType(p.type)) {
          // Check if it has struct elements
          const hasStructElements = p.type.rest.length > 0
            && p.type.rest[0].type._tag === "TypeLiteral"
            && "propertySignatures" in p.type.rest[0].type

          if (hasStructElements) {
            // For arrays with struct elements, only create meta for nested fields, not the array itself
            const elementType = p.type.rest[0].type
            if (elementType._tag === "TypeLiteral" && "propertySignatures" in elementType) {
              // Process each property in the array element
              for (const prop of elementType.propertySignatures) {
                const propKey = `${key}.${prop.name.toString()}`

                // Check if the property is another array
                if (S.AST.isTupleType(prop.type) && prop.type.rest.length > 0) {
                  const nestedElementType = prop.type.rest[0].type
                  if (nestedElementType._tag === "TypeLiteral" && "propertySignatures" in nestedElementType) {
                    // Array with struct elements - process nested fields
                    for (const nestedProp of nestedElementType.propertySignatures) {
                      const nestedKey = `${propKey}.${nestedProp.name.toString()}`
                      const nestedMeta = createMeta<T>({
                        parent: nestedKey,
                        property: nestedProp.type,
                        meta: {
                          required: !isNullableOrUndefined(nestedProp.type),
                          nullableOrUndefined: isNullableOrUndefined(nestedProp.type)
                        }
                      })
                      acc[nestedKey as NestedKeyOf<T>] = nestedMeta as FieldMeta
                    }
                  } else {
                    // Array with primitive elements - create meta for the array itself
                    acc[propKey as NestedKeyOf<T>] = {
                      type: "multiple",
                      members: prop.type.elements,
                      rest: prop.type.rest,
                      required: !isNullableOrUndefined(prop.type),
                      nullableOrUndefined: isNullableOrUndefined(prop.type)
                    } as FieldMeta
                  }
                } else {
                  const fieldMeta = createMeta<T>({
                    parent: propKey,
                    property: prop.type,
                    meta: {
                      required: !isNullableOrUndefined(prop.type),
                      nullableOrUndefined: isNullableOrUndefined(prop.type)
                    }
                  })
                  acc[propKey as NestedKeyOf<T>] = fieldMeta as FieldMeta
                }
              }
            }
          } else {
            // For arrays with primitive elements, create the array meta
            acc[key as NestedKeyOf<T>] = {
              type: "multiple",
              members: p.type.elements,
              rest: p.type.rest,
              required: isRequired,
              nullableOrUndefined
            } as FieldMeta
          }
        } else {
          const newMeta = createMeta<T>({
            parent: key,
            property: p.type,
            meta: {
              // an empty string is valid for a S.String field, so we should not mark it as required
              // TODO: handle this better via the createMeta minLength parsing
              required: isRequired && (p.type._tag !== "StringKeyword" || getMetadataFromSchema(p.type).minLength),
              nullableOrUndefined
            }
          })

          acc[key as NestedKeyOf<T>] = newMeta as FieldMeta
        }
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
        (t) => t._tag !== "UndefinedKeyword" && t !== S.Null.ast
      )!

      if ("propertySignatures" in nonNullType) {
        return createMeta<T>({
          propertySignatures: nonNullType.propertySignatures,
          parent,
          meta
        })
      }

      if (property.types.every(S.AST.isLiteral)) {
        return {
          ...meta,
          type: "select",
          members: property.types.map((t) => t.literal)
        } as FieldMeta
      }

      return {
        ...meta,
        ...createMeta<T>({
          parent,
          meta,
          property: nonNullType
        })
      } as FieldMeta
    }

    if (S.AST.isTupleType(property)) {
      return {
        ...meta,
        type: "multiple",
        members: property.elements,
        rest: property.rest
      } as FieldMeta
    }

    const JSONAnnotation = S
      .AST
      .getAnnotation(
        property,
        S.AST.JSONSchemaAnnotationId
      )
      .pipe(Option.getOrElse(() => ({}))) as Record<string, unknown>

    meta = { ...meta, ...JSONAnnotation }

    if ("from" in property) {
      return createMeta<T>({
        parent,
        meta,
        property: property.from
      })
    } else {
      meta["type"] = S
        .AST
        .getAnnotation(
          property,
          S.AST.TitleAnnotationId
        )
        .pipe(
          Option.getOrElse(() => {
            return "unknown"
          })
        )
    }

    return meta as FieldMeta
  }

  return acc
}

const flattenMeta = <From, To>(
  schema: S.Schema<To, From, never>
): MetaRecord<To> => {
  const ast = schema.ast
  const result: MetaRecord<To> = {}

  if (ast._tag === "Transformation" || ast._tag === "Refinement") {
    return flattenMeta(S.make(ast.from))
  }

  if ("propertySignatures" in ast) {
    const meta = createMeta<To>({
      propertySignatures: ast.propertySignatures
    })

    if (Object.values(meta).every((value) => value && "type" in value)) {
      return meta as MetaRecord<To>
    }

    const flattenObject = (
      obj: Record<string, any>,
      parentKey: string = ""
    ) => {
      for (const key in obj) {
        const newKey = parentKey ? `${parentKey}.${key}` : key
        if (obj[key] && typeof obj[key] === "object" && "type" in obj[key]) {
          result[newKey as DeepKeys<To>] = obj[key] as FieldMeta
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
  schema: S.Schema<To, From, never>
) => {
  return S.extend(schema, S.Struct({}))
}

export const generateMetaFromSchema = <From, To>(
  schema: S.Schema<To, From, never>
): {
  schema: S.Schema<To, From, never>
  meta: MetaRecord<To>
  filterItems?: FilterItems
} => {
  const meta = flattenMeta(schema)

  const filterItems = pipe(
    schema.ast,
    Option.liftPredicate((s) => s._tag === "Refinement" && "filter" in s),
    Option.flatMap((s) => S.AST.getJSONSchemaAnnotation(s)),
    Option.filter((s) => "items" in s),
    Option.filterMap(({ items }) => S.decodeUnknownOption(isArrayOfString)(items)),
    Option.zipWith(
      S.AST.getMessageAnnotation(schema.ast),
      (items, message) => ({
        items,
        message: message("" as unknown as S.ParseResult.ParseIssue)
      })
    ),
    Option.getOrUndefined
  )

  return { schema, meta, filterItems }
}

export const generateInputStandardSchemaFromFieldMeta = (
  meta: FieldMeta
): StandardSchemaV1<any, any> => {
  const { trans } = useIntl()
  let schema: S.Schema<any, any, never>
  switch (meta.type) {
    case "string":
      schema = S.String.annotations({
        message: () => trans("validation.empty")
      })

      if (meta.format === "email") {
        schema = S.compose(
          schema,
          S.Email.annotations({
            message: () => trans("validation.email.invalid")
          })
        )
      }

      if (meta.required) {
        schema.annotations({
          message: () => trans("validation.empty")
        })
      }

      if (meta.maxLength) {
        schema = schema.pipe(S.maxLength(meta.maxLength)).annotations({
          message: () =>
            trans("validation.string.maxLength", {
              maxLength: meta.maxLength
            })
        })
      }
      if (meta.minLength) {
        schema = schema.pipe(S.minLength(meta.minLength)).annotations({
          message: () =>
            trans("validation.string.minLength", {
              minLength: meta.minLength
            })
        })
      }
      break

    case "number":
      schema = S.Number.annotations({
        message: () => trans("validation.empty")
      })

      if (meta.required) {
        schema.annotations({
          message: () => trans("validation.empty")
        })
      }
      if (meta.minimum) {
        schema = schema.pipe(S.greaterThanOrEqualTo(meta.minimum)).annotations({
          message: () =>
            trans("validation.number.min", {
              minimum: meta.minimum,
              isExclusive: true
            })
        })
      }
      if (meta.maximum) {
        schema = schema.pipe(S.lessThanOrEqualTo(meta.maximum)).annotations({
          message: () =>
            trans("validation.number.max", {
              maximum: meta.maximum,
              isExclusive: true
            })
        })
      }
      if (meta.exclusiveMinimum) {
        schema = schema.pipe(S.greaterThan(meta.exclusiveMinimum)).annotations({
          message: () =>
            trans("validation.number.min", {
              minimum: meta.exclusiveMinimum,
              isExclusive: false
            })
        })
      }
      if (meta.exclusiveMaximum) {
        schema = schema.pipe(S.lessThan(meta.exclusiveMaximum)).annotations({
          message: () =>
            trans("validation.number.max", {
              maximum: meta.exclusiveMaximum,
              isExclusive: false
            })
        })
      }
      break
    case "select":
      schema = S.Literal(...meta.members as [any]).annotations({
        message: () => ({
          message: trans("validation.not_a_valid", {
            type: "select",
            message: meta.members.join(", ")
          }),
          override: true
        })
      })

      break

    case "multiple":
      schema = S.Array(S.String).annotations({
        message: () =>
          trans("validation.not_a_valid", {
            type: "multiple",
            message: meta.members.join(", ")
          })
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
        message: () => trans("validation.empty")
      })
    )
  }
  const result = S.standardSchemaV1(schema)
  return result
}

export const nullableInput = <A, I, R>(
  schema: S.Schema<A, I, R>,
  defaultValue: () => A
) =>
  S.NullOr(schema).pipe(
    S.transform(S.typeSchema(schema), {
      decode: (input) => input ?? defaultValue(),
      encode: (input) => input
    })
  )

export type OmegaAutoGenMeta<
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>
> = Omit<OmegaInputProps<From, To>, "form">

const supportedInputs = [
  "button",
  "checkbox",
  "color",
  "date",
  "email",
  "number",
  "password",
  "radio",
  "range",
  "search",
  "submit",
  "tel",
  "text",
  "time",
  "url"
] as const
export type SupportedInputs = typeof supportedInputs[number]
export const getInputType = (input: string): SupportedInputs =>
  (supportedInputs as readonly string[]).includes(input) ? input as SupportedInputs : "text"
