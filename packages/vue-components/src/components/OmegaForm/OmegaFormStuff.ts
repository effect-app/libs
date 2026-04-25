import { Effect, Option, type Record, S } from "effect-app"
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type DeepKeys, type DeepValue, type FieldAsyncValidateOrFn, type FieldValidateOrFn, type FormApi, type FormAsyncValidateOrFn, type FormOptions, type FormState, type FormValidateOrFn, type StandardSchemaV1, type VueFormApi } from "@tanstack/vue-form"
import { isObject } from "@vueuse/core"
import type { Fiber as EffectFiber } from "effect/Fiber"
import type { Redacted } from "effect/Redacted"
import { getTransformationFrom, useIntl } from "../../utils"
import { type OmegaFieldInternalApi } from "./InputProps"
import { type OF, type OmegaFormReturn } from "./useOmegaForm"

const legacyTagWarningEmittedFor = new Set<string>()
type GlobalThisWithOptionalProcess = typeof globalThis & {
  process?: {
    env?: {
      NODE_ENV?: string
    }
  }
}

const isDevelopmentEnvironment = () => {
  const process = (globalThis as GlobalThisWithOptionalProcess).process
  return process?.env?.NODE_ENV !== "production"
}

export type FieldPath<T> = unknown extends T ? string
  // technically we cannot have primitive at the root
  : T extends string | boolean | number | null | undefined | symbol | bigint | Redacted<any> ? ""
  // technically we cannot have array at the root
  : T extends ReadonlyArray<infer U> ? FieldPath_<U, `[${number}]`>
  : {
    [K in keyof T]: FieldPath_<T[K], `${K & string}`>
  }[keyof T]

export type FieldPath_<T, Path extends string> = unknown extends T ? string
  : T extends string | boolean | number | null | undefined | symbol | bigint | Redacted<any> ? Path
  : T extends ReadonlyArray<infer U> ? FieldPath_<U, `${Path}[${number}]`> | Path
  : {
    [K in keyof T]: FieldPath_<T[K], `${Path}.${K & string}`>
  }[keyof T]

export type BaseProps<From, TName extends FieldPath<From>> = {
  /**
   * Will fallback to i18n when not specified.
   * Can also be provided via #label slot for custom HTML labels.
   * When using the slot, it receives bindings: { required, id, label }
   */
  label?: string
  validators?: FieldValidators<From>
  // Use FlexibleArrayPath: if name contains [], just use TName; otherwise intersect with Leaves<From>
  name: TName
  /**
   * Optional class to apply to the input element.
   * - If a string is provided, it will be used instead of the general class
   * - If null is provided, no class will be applied (neither inputClass nor general class)
   * - If undefined (not provided), the general class will be used
   */
  inputClass?: string | null
}

export type TypesWithOptions = "radio" | "select" | "multiple" | "autocomplete" | "autocompletemultiple"
export type DefaultTypeProps = {
  type?: TypeOverride
  options?: undefined
} | {
  type?: TypesWithOptions
  // TODO: options should depend on `type`, but since there is auto-type, we can't currently enforce it.
  // hence we allow it also for type? (undefined) atm
  options?: {
    title: string
    value: unknown
  }[]
}

export type OmegaInputPropsBase<
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  Name extends DeepKeys<From>
> = {
  form: OF<From, To> & {
    meta: MetaRecord<From>
    i18nNamespace?: string
  }
} & BaseProps<From, Name>

export type OmegaInputProps<
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  Name extends DeepKeys<From>,
  TypeProps = DefaultTypeProps
> = {
  form: OmegaFormReturn<From, To, TypeProps> & {
    meta: MetaRecord<From>
    i18nNamespace?: string
  }
} & BaseProps<From, Name>

export type OmegaArrayProps<
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  Name extends DeepKeys<From>
> =
  & Omit<
    OmegaInputProps<From, To, Name>,
    "validators" | "options" | "label" | "type" | "items" | "name"
  >
  & {
    name: DeepKeys<From>
    defaultItems?: DeepValue<From, DeepKeys<From>>
    // deprecated items, caused bugs in state update, use defaultItems instead. It's not a simple Never, because Volar explodes
    items?: "please use `defaultItems` instead"
  }

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
  | "date"

export interface OmegaError {
  label: string
  inputId: string
  errors: readonly string[]
}

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
    }) => Promise<any> | EffectFiber<any, any> | Effect.Effect<unknown, any, never>
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

// Recursively replace Redacted<A> with its inner type so DeepKeys treats it as a leaf
type StripRedacted<T> = T extends Redacted<any> ? string
  : T extends ReadonlyArray<infer U> ? ReadonlyArray<StripRedacted<U>>
  : T extends Record<string, any> ? { [K in keyof T]: StripRedacted<T[K]> }
  : T

export type NestedKeyOf<T> = DeepKeys<StripRedacted<T>>

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
  /**
   * True when the schema property is `S.optionalKey` (AST
   * `context.isOptional`) — i.e. the key should be ABSENT from the submitted
   * object when empty, not present with `undefined`. Distinct from
   * `required: false`, which may also mean "empty string is valid" for
   * unconstrained `S.String` fields.
   */
  isOptionalKey?: boolean
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
  refinement?: "int"
}

export type SelectFieldMeta = BaseFieldMeta & {
  type: "select"
  members: any[] // TODO: should be non empty array?
}

export type MultipleFieldMeta = BaseFieldMeta & {
  type: "multiple"
  members: any[] // TODO: should be non empty array?
  rest: readonly S.AST.AST[]
}

export type BooleanFieldMeta = BaseFieldMeta & {
  type: "boolean"
}

export type DateFieldMeta = BaseFieldMeta & {
  type: "date"
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
  | DateFieldMeta
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

const unwrapDeclaration = (property: S.AST.AST): S.AST.AST => {
  let current = getTransformationFrom(property)

  while (S.AST.isDeclaration(current) && current.typeParameters.length > 0) {
    current = getTransformationFrom(current.typeParameters[0]!)
  }

  return current
}

const isNullishType = (property: S.AST.AST) => S.AST.isUndefined(property) || S.AST.isNull(property)

/**
 * Unwrap a single-element Union to its inner type if it's a Literal.
 * After AST.toType, S.Struct({ _tag: S.Literal("X") }) produces Union([Literal("X")])
 * instead of bare Literal("X") like S.TaggedStruct does.
 * TODO: remove after manual _tag deprecation
 */
const unwrapSingleLiteralUnion = (ast: S.AST.AST): S.AST.AST =>
  S.AST.isUnion(ast) && ast.types.length === 1 && S.AST.isLiteral(ast.types[0]!)
    ? ast.types[0]!
    : ast

const getNullableOrUndefined = (property: S.AST.AST) =>
  S.AST.isUnion(property)
    ? property.types.find((_) => isNullishType(_))
    : false

export const isNullableOrUndefined = (property: false | S.AST.AST | undefined) => {
  if (!property || !S.AST.isUnion(property)) return false
  if (property.types.find((_) => S.AST.isUndefined(_))) {
    return "undefined"
  }
  if (property.types.find((_) => S.AST.isNull(_))) return "null"
  return false
}

// Helper function to recursively unwrap nested unions (e.g., S.NullOr(S.NullOr(X)) -> X)
const unwrapNestedUnions = (types: readonly S.AST.AST[]): readonly S.AST.AST[] => {
  const result: S.AST.AST[] = []
  for (const type of types) {
    if (S.AST.isUnion(type)) {
      // Recursively unwrap nested unions
      const unwrapped = unwrapNestedUnions(type.types)
      result.push(...unwrapped)
    } else {
      result.push(type)
    }
  }
  return result
}

const getNonNullTypes = (types: readonly S.AST.AST[]) =>
  unwrapNestedUnions(types)
    .map(unwrapDeclaration)
    .filter((_) => !isNullishType(_))

const getJsonSchemaAnnotation = (property: S.AST.AST): Record<string, unknown> => {
  const jsonSchema = S.AST.resolve(property)?.jsonSchema
  return jsonSchema && typeof jsonSchema === "object" ? jsonSchema as Record<string, unknown> : {}
}

const extractDefaultFromLink = (link: any): unknown | undefined => {
  if (!link?.transformation?.decode?.run) return undefined
  try {
    const result = Effect.runSync(link.transformation.decode.run(Option.none())) as Option.Option<unknown>
    return Option.isSome(result) ? result.value : undefined
  } catch {
    return undefined
  }
}

const getDefaultFromAst = (property: S.AST.AST) => {
  // 1. Check withConstructorDefault (stored in context.defaultValue)
  const constructorLink = property.context?.defaultValue?.[0]
  const constructorDefault = extractDefaultFromLink(constructorLink)
  if (constructorDefault !== undefined) return constructorDefault

  // 2. Check withDecodingDefault (stored in encoding)
  const encodingLink = property.encoding?.[0]
  if (encodingLink && property.context?.isOptional) {
    return extractDefaultFromLink(encodingLink)
  }

  return undefined
}

const getCheckMetas = (property: S.AST.AST): Array<Record<string, any>> => {
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

const getFieldMetadataFromAst = (property: S.AST.AST) => {
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

    if (S.AST.resolveTitle(property) === "Email") {
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

export const createMeta = <T = any>(
  { meta = {}, parent = "", property, propertySignatures }: CreateMeta,
  acc: Partial<MetaRecord<T>> = {}
): MetaRecord<T> | FieldMeta => {
  if (property) {
    property = unwrapDeclaration(property)
  }

  if (property && S.AST.isObjects(property)) {
    return createMeta<T>({
      meta,
      propertySignatures: property.propertySignatures
    })
  }

  if (propertySignatures) {
    for (const p of propertySignatures) {
      const key = parent ? `${parent}.${p.name.toString()}` : p.name.toString()
      const nullableOrUndefined = isNullableOrUndefined(p.type)

      const isOptionalKey = (p.type as any).context?.isOptional === true

      // Determine if this field should be required:
      // - For nullable discriminated unions, only _tag should be non-required
      // - optionalKey fields are not required
      // - All other fields should calculate their required status normally
      let isRequired: boolean
      if (meta._isNullableDiscriminatedUnion && p.name.toString() === "_tag") {
        // _tag in a nullable discriminated union is not required
        isRequired = false
      } else if (meta.required === false) {
        // Explicitly set to non-required (legacy behavior for backwards compatibility)
        isRequired = false
      } else if (isOptionalKey) {
        isRequired = false
      } else {
        // Calculate from the property itself
        isRequired = !nullableOrUndefined
      }

      const typeToProcess = unwrapDeclaration(p.type)
      if (S.AST.isUnion(p.type)) {
        const nonNullTypes = getNonNullTypes(p.type.types)

        const hasStructMembers = nonNullTypes.some(S.AST.isObjects)

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
            if (S.AST.isObjects(nonNullType)) {
              // For discriminated unions (multiple branches):
              // - If the parent union is nullable, only _tag should be non-required
              // - All other fields maintain their normal required status based on their own types
              const isNullableDiscriminatedUnion = nullableOrUndefined && nonNullTypes.length > 1

              const branchMeta = createMeta<T>({
                parent: key,
                propertySignatures: nonNullType.propertySignatures,
                meta: isNullableDiscriminatedUnion ? { _isNullableDiscriminatedUnion: true } : {}
              })

              // Merge branch metadata, combining select members for shared discriminator fields
              for (const [metaKey, metaValue] of Object.entries(branchMeta)) {
                const existing = acc[metaKey as NestedKeyOf<T>] as FieldMeta | undefined
                if (
                  existing && existing.type === "select" && (metaValue as any)?.type === "select"
                ) {
                  existing.members = [
                    ...existing.members,
                    ...(metaValue as SelectFieldMeta).members.filter(
                      (m: any) => !existing.members.includes(m)
                    )
                  ]
                } else {
                  acc[metaKey as NestedKeyOf<T>] = metaValue as FieldMeta
                }
              }
            }
          }
        } else {
          const arrayTypes = nonNullTypes.filter(S.AST.isArrays)
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
              const restElement = unwrapDeclaration(arrayType.rest[0]!)
              if (S.AST.isObjects(restElement)) {
                for (const prop of restElement.propertySignatures) {
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
                      propMeta.type === "multiple" && S.AST.isArrays(prop.type) && prop
                        .type
                        .rest && prop.type.rest.length > 0
                    ) {
                      const nestedRestElement = unwrapDeclaration(prop.type.rest[0]!)
                      if (S.AST.isObjects(nestedRestElement)) {
                        for (const nestedProp of nestedRestElement.propertySignatures) {
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
      } else {
        if (S.AST.isObjects(typeToProcess)) {
          Object.assign(
            acc,
            createMeta<T>({
              parent: key,
              propertySignatures: typeToProcess.propertySignatures,
              meta: { required: isRequired, nullableOrUndefined }
            })
          )
        } else if (S.AST.isArrays(p.type)) {
          // Check if it has struct elements
          const hasStructElements = p.type.rest.length > 0
            && S.AST.isObjects(unwrapDeclaration(p.type.rest[0]!))

          if (hasStructElements) {
            // For arrays with struct elements, only create meta for nested fields, not the array itself
            const elementType = unwrapDeclaration(p.type.rest[0]!)
            if (S.AST.isObjects(elementType)) {
              // Process each property in the array element
              for (const prop of elementType.propertySignatures) {
                const propKey = `${key}.${prop.name.toString()}`

                // Check if the property is another array
                if (S.AST.isArrays(prop.type) && prop.type.rest.length > 0) {
                  const nestedElementType = unwrapDeclaration(prop.type.rest[0]!)
                  if (S.AST.isObjects(nestedElementType)) {
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
              required: isRequired
                && (!S.AST.isString(typeToProcess) || !!getFieldMetadataFromAst(typeToProcess).minLength),
              nullableOrUndefined,
              ...(isOptionalKey ? { isOptionalKey: true } : {})
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
    property = unwrapDeclaration(property)

    if (!Object.hasOwnProperty.call(meta, "required")) {
      meta["required"] = !nullableOrUndefined
    }

    if (S.AST.isUnion(property)) {
      const unwrappedTypes = unwrapNestedUnions(property.types).map(unwrapDeclaration)
      const nonNullTypes = unwrappedTypes.filter((t) => !isNullishType(t))

      // Unwrap single-element unions when the literal is a boolean
      // (effect-app's S.Literal wraps as S.Literals([x]) → Union([Literal(x)]))
      // Don't unwrap string/number literals — they may be discriminator values in a union
      if (
        nonNullTypes.length === 1
        && S.AST.isLiteral(nonNullTypes[0]!)
        && typeof nonNullTypes[0]!.literal === "boolean"
      ) {
        return createMeta<T>({ parent, meta, property: nonNullTypes[0]! })
      }

      const nonNullType = nonNullTypes[0]!

      if (S.AST.isObjects(nonNullType)) {
        return createMeta<T>({
          propertySignatures: nonNullType.propertySignatures,
          parent,
          meta
        })
      }

      // TODO: remove after manual _tag deprecation — unwrap legacy S.Struct({ _tag: S.Literal("X") }) pattern
      const resolvedTypes = unwrappedTypes.map(unwrapSingleLiteralUnion)
      if (resolvedTypes.every((_) => isNullishType(_) || S.AST.isLiteral(_))) {
        return {
          ...meta,
          type: "select",
          members: resolvedTypes.filter(S.AST.isLiteral).map((t) => t.literal)
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

    if (S.AST.isArrays(property)) {
      return {
        ...meta,
        type: "multiple",
        members: property.elements,
        rest: property.rest
      } as FieldMeta
    }

    if (S.AST.isLiteral(property)) {
      return {
        ...meta,
        type: "select",
        members: [property.literal]
      } as FieldMeta
    }

    meta = { ...getJsonSchemaAnnotation(property), ...getFieldMetadataFromAst(property), ...meta }

    return meta as FieldMeta
  }

  return acc
}

// Helper to flatten nested meta structure into dot-notation keys
const flattenMeta = <T>(meta: MetaRecord<T> | FieldMeta, parentKey: string = ""): MetaRecord<T> => {
  const result: MetaRecord<T> = {}

  for (const key in meta) {
    const value = (meta as any)[key]
    const newKey = parentKey ? `${parentKey}.${key}` : key

    if (value && typeof value === "object" && "type" in value) {
      result[newKey as DeepKeys<T>] = value as FieldMeta
    } else if (value && typeof value === "object") {
      Object.assign(result, flattenMeta<T>(value, newKey))
    }
  }

  return result
}

const metadataFromAst = <From, To>(
  schema: S.Codec<To, From, never>
): { meta: MetaRecord<To>; defaultValues: Record<string, any>; unionMeta: Record<string, MetaRecord<To>> } => {
  const ast = unwrapDeclaration(schema.ast)
  const newMeta: MetaRecord<To> = {}
  const defaultValues: Record<string, any> = {}
  const unionMeta: Record<string, MetaRecord<To>> = {}

  // Handle root-level Union types (discriminated unions)
  if (S.AST.isUnion(ast)) {
    // Filter out null/undefined types and unwrap transformations
    const nonNullTypes = getNonNullTypes(ast.types)

    // Check if this is a discriminated union (all members are structs)
    const allStructs = nonNullTypes.every(S.AST.isObjects)

    if (allStructs && nonNullTypes.length > 0) {
      // Extract discriminator values from each union member
      const discriminatorValues: any[] = []

      // Store metadata for each union member by its tag value
      for (const memberType of nonNullTypes) {
        if (S.AST.isObjects(memberType)) {
          // Find the discriminator field (usually _tag)
          const tagProp = memberType.propertySignatures.find(
            (p) => p.name.toString() === "_tag"
          )

          let tagValue: string | null = null
          // TODO: remove after manual _tag deprecation — unwrap legacy S.Struct({ _tag: S.Literal("X") }) pattern
          const resolvedTagType = tagProp ? unwrapSingleLiteralUnion(tagProp.type) : null
          if (resolvedTagType && S.AST.isLiteral(resolvedTagType)) {
            tagValue = resolvedTagType.literal as string
            discriminatorValues.push(tagValue)
            // Warn if the tag was wrapped in a single-element Union (legacy pattern)
            if (
              tagProp
              && S.AST.isUnion(tagProp.type)
              && isDevelopmentEnvironment()
              && tagValue != null
              && !legacyTagWarningEmittedFor.has(tagValue)
            ) {
              legacyTagWarningEmittedFor.add(tagValue)
              console.warn(
                `[OmegaForm] Union member with _tag "${tagValue}" uses S.Struct({ _tag: S.Literal("${tagValue}"), ... }). `
                  + `Please migrate to S.TaggedStruct("${tagValue}", { ... }) for cleaner AST handling.`
              )
            }
          }

          // Create metadata for this member's properties
          const memberMeta = createMeta<To>({
            propertySignatures: memberType.propertySignatures
          })

          // Store per-tag metadata for reactive lookup
          if (tagValue) {
            unionMeta[tagValue] = flattenMeta<To>(memberMeta)
          }

          // Merge into result (for backward compatibility)
          Object.assign(newMeta, memberMeta)
        }
      }

      // Create metadata for the discriminator field
      if (discriminatorValues.length > 0) {
        newMeta["_tag" as DeepKeys<To>] = {
          type: "select",
          members: discriminatorValues,
          required: true
        } as FieldMeta
      }

      return { meta: newMeta, defaultValues, unionMeta }
    }
  }

  if (S.AST.isObjects(ast)) {
    const meta = createMeta<To>({
      propertySignatures: ast.propertySignatures
    })

    if (Object.values(meta).every((value) => value && "type" in value)) {
      return { meta: meta as MetaRecord<To>, defaultValues, unionMeta }
    }

    const flattenObject = (
      obj: Record<string, any>,
      parentKey: string = ""
    ) => {
      for (const key in obj) {
        const newKey = parentKey ? `${parentKey}.${key}` : key
        if (obj[key] && typeof obj[key] === "object" && "type" in obj[key]) {
          newMeta[newKey as DeepKeys<To>] = obj[key] as FieldMeta
        } else if (obj[key] && typeof obj[key] === "object") {
          flattenObject(obj[key], newKey)
        }
      }
    }

    flattenObject(meta)
  }

  return { meta: newMeta, defaultValues, unionMeta }
}

/*
 * Checks if an AST node is a S.Redacted Declaration without encoding.
 * These need to be swapped to S.RedactedFromValue for form usage
 * because S.Redacted expects Redacted objects, not plain strings.
 */
const isRedactedWithoutEncoding = (ast: S.AST.AST): boolean =>
  S.AST.isDeclaration(ast)
  && (ast.annotations as any)?.typeConstructor?._tag === "effect/Redacted"
  && !ast.encoding

/*
 * Creates a form-compatible schema by replacing S.Redacted(X) with
 * S.RedactedFromValue(X). S.Redacted is a Declaration that expects
 * Redacted<A> on both encoded and type sides, so form inputs (which
 * produce plain strings) fail validation. S.RedactedFromValue accepts
 * plain values on the encoded side and wraps them in Redacted on decode.
 */
export const toFormSchema = <From, To>(
  schema: S.Codec<To, From, never>
): S.Codec<To, From, never> => {
  const ast = schema.ast
  const objAst = S.AST.isObjects(ast)
    ? ast
    : S.AST.isDeclaration(ast)
    ? S.AST.toEncoded(ast)
    : null

  if (!objAst || !("propertySignatures" in objAst)) return schema

  let hasRedacted = false
  const props: Record<string, S.Struct.Fields[string]> = {}

  for (const p of objAst.propertySignatures) {
    if (isRedactedWithoutEncoding(p.type)) {
      hasRedacted = true
      const innerSchema = S.make((p.type as S.AST.Declaration).typeParameters[0]!)
      props[p.name as string] = S.RedactedFromValue(innerSchema)
    } else if (S.AST.isUnion(p.type)) {
      const types = p.type.types
      const redactedType = types.find(isRedactedWithoutEncoding)
      if (redactedType) {
        hasRedacted = true
        const innerSchema = S.make((redactedType as S.AST.Declaration).typeParameters[0]!)
        const hasNull = types.some(S.AST.isNull)
        const hasUndefined = types.some(S.AST.isUndefined)
        const base = S.RedactedFromValue(innerSchema)
        props[p.name as string] = hasNull && hasUndefined
          ? S.NullishOr(base)
          : hasNull
          ? S.NullOr(base)
          : hasUndefined
          ? S.UndefinedOr(base)
          : base
      } else {
        props[p.name as string] = S.make(p.type)
      }
    } else {
      props[p.name as string] = S.make(p.type)
    }
  }

  return hasRedacted ? S.Struct(props) as unknown as S.Codec<To, From, never> : schema
}

export const duplicateSchema = <From, To>(
  schema: S.Codec<To, From, never>
) => {
  return schema
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

export type OmegaAutoGenMeta<
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  Name extends DeepKeys<From>
> = Omit<OmegaInputProps<From, To, Name>, "form">

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

export function deepMerge(target: any, source: any) {
  const result = { ...target }
  for (const key in source) {
    if (Array.isArray(source[key])) {
      // Arrays should be copied directly, not deep merged
      result[key] = source[key]
    } else if (source[key] && isObject(source[key])) {
      result[key] = deepMerge(result[key], source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

type SchemaWithMembers = {
  members: readonly S.Schema<any>[]
}

function hasMembers(schema: any): schema is SchemaWithMembers {
  return schema && "members" in schema && Array.isArray(schema.members)
}

// Internal implementation with WeakSet tracking
export const defaultsValueFromSchema = (
  schema: S.Schema<any>,
  record: Record<string, any> = {}
): any => {
  const ast = schema.ast
  const defaultValue = getDefaultFromAst(ast)

  if (defaultValue !== undefined) {
    return defaultValue
  }

  if (isNullableOrUndefined(schema.ast) === "null") {
    return null
  }
  if (isNullableOrUndefined(schema.ast) === "undefined") {
    return undefined
  }

  // Handle structs via AST (covers plain structs, transformed schemas like decodeTo, Class, etc.)
  const objectsAst = S.AST.isObjects(ast)
    ? ast
    : S.AST.isDeclaration(ast)
    ? unwrapDeclaration(ast)
    : undefined
  if (objectsAst && S.AST.isObjects(objectsAst)) {
    const result: Record<string, any> = {}

    for (const prop of objectsAst.propertySignatures) {
      const key = prop.name.toString()
      const propType = prop.type

      const propDefault = getDefaultFromAst(propType)
      if (propDefault !== undefined) {
        result[key] = propDefault
        continue
      }

      const propSchema = S.make(propType)
      const propValue = defaultsValueFromSchema(propSchema, record[key] || {})

      if (propValue !== undefined) {
        result[key] = propValue
      } else if (isNullableOrUndefined(propType) === "undefined") {
        result[key] = undefined
      }
    }

    return { ...result, ...record }
  }

  // Handle unions via AST or schema-level .members
  const unionTypes = S.AST.isUnion(ast)
    ? ast.types
    : hasMembers(schema)
    ? schema.members.map((m) => m.ast)
    : undefined
  if (unionTypes) {
    const mergedFields: Record<string, { ast: S.AST.AST }> = {}

    for (const memberAstRaw of unionTypes) {
      const memberAst = unwrapDeclaration(memberAstRaw)
      if (!S.AST.isObjects(memberAst)) continue

      for (const prop of memberAst.propertySignatures) {
        const key = prop.name.toString()
        const fieldDefault = getDefaultFromAst(prop.type)
        const existingDefault = mergedFields[key] ? getDefaultFromAst(mergedFields[key]!.ast) : undefined

        if (!mergedFields[key] || (fieldDefault !== undefined && existingDefault === undefined)) {
          mergedFields[key] = { ast: prop.type }
        }
      }
    }

    if (Object.keys(mergedFields).length === 0) {
      return Object.keys(record).length > 0 ? record : undefined
    }

    return Object.entries(mergedFields).reduce((acc, [key, { ast: propAst }]) => {
      acc[key] = defaultsValueFromSchema(S.make(propAst), record[key] || {})
      return acc
    }, record)
  }

  if (Object.keys(record).length === 0) {
    if (S.AST.isString(ast)) {
      return ""
    }

    if (S.AST.isBoolean(ast)) {
      return false
    }
  }
}
