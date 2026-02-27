import type * as Effect from "effect/Effect"
import * as AST from "effect/SchemaAST"
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getMetadataFromSchema } from "@effect-app/vue/form"
import { type DeepKeys, type DeepValue, type FieldAsyncValidateOrFn, type FieldValidateOrFn, type FormApi, type FormAsyncValidateOrFn, type FormOptions, type FormState, type FormValidateOrFn, type StandardSchemaV1, type VueFormApi } from "@tanstack/vue-form"
import { isObject } from "@vueuse/core"
import * as S from "effect/Schema"
import { getTransformationFrom, useIntl } from "../../utils"
import { type OmegaFieldInternalApi } from "./InputProps"
import { type OF, type OmegaFormReturn } from "./useOmegaForm"

export type FieldPath<T> = unknown extends T ? string
  // technically we cannot have primitive at the root
  : T extends string | boolean | number | null | undefined | symbol | bigint ? ""
  // technically we cannot have array at the root
  : T extends ReadonlyArray<infer U> ? FieldPath_<U, `[${number}]`>
  : {
    [K in keyof T]: FieldPath_<T[K], `${K & string}`>
  }[keyof T]

export type FieldPath_<T, Path extends string> = unknown extends T ? string
  : T extends string | boolean | number | null | undefined | symbol | bigint ? Path
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
    }) => Promise<any> | Effect.Effect<unknown, any, never>
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
  refinement?: "int"
}

export type SelectFieldMeta = BaseFieldMeta & {
  type: "select"
  members: any[] // TODO: should be non empty array?
}

export type MultipleFieldMeta = BaseFieldMeta & {
  type: "multiple"
  members: any[] // TODO: should be non empty array?
  rest: readonly AST.AST[]
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
      propertySignatures: readonly AST.PropertySignature[]
      property?: never
    }
    | {
      propertySignatures?: never
      property: AST.AST
    }
  )

const getNullableOrUndefined = (property: AST.AST) => {
  if (!AST.isUnion(property)) return false
  return property.types.find((_) => AST.isUndefined(_) || _ === S.Null.ast)
}

export const isNullableOrUndefined = (property: false | AST.AST | undefined) => {
  if (!property || !AST.isUnion(property)) return false
  if (property.types.find((_) => AST.isUndefined(_))) {
    return "undefined"
  }
  if (property.types.find((_) => _ === S.Null.ast)) return "null"
  return false
}

// Helper function to recursively unwrap nested unions (e.g., S.NullOr(S.NullOr(X)) -> X)
const unwrapNestedUnions = (types: readonly AST.AST[]): readonly AST.AST[] => {
  const result: AST.AST[] = []
  for (const type of types) {
    if (AST.isUnion(type)) {
      // Recursively unwrap nested unions
      const unwrapped = unwrapNestedUnions(type.types)
      result.push(...unwrapped)
    } else {
      result.push(type)
    }
  }
  return result
}

export const createMeta = <T = any>(
  { meta = {}, parent = "", property, propertySignatures }: CreateMeta,
  acc: Partial<MetaRecord<T>> = {}
): MetaRecord<T> | FieldMeta => {
  // unwraps class (Class are transformations)
  // this calls createMeta recursively, so wrapped transformations are also unwrapped
  // BUT: check for Int title annotation first - S.Int and branded Int have title "Int" or "int"
  // and we don't want to lose that information by unwrapping
  if (property && AST.isDeclaration(property)) {
    const titleOnTransform = property.annotations?.title ?? ""

    // only unwrap if this is NOT an Int type
    if (titleOnTransform !== "Int" && titleOnTransform !== "int") {
      // In v4, Declaration doesn't have a 'from' property
      // Just return the property as-is
      return createMeta<T>({
        parent,
        meta,
        property
      })
    }
    // if it's Int, fall through to process it with the Int type
  }

  if (property && AST.isObjects(property)) {
    return createMeta<T>({
      meta,
      propertySignatures: property.propertySignatures
    })
  }

  if (propertySignatures) {
    for (const p of propertySignatures) {
      const key = parent ? `${parent}.${p.name.toString()}` : p.name.toString()
      const nullableOrUndefined = isNullableOrUndefined(p.type)

      // Determine if this field should be required:
      // - For nullable discriminated unions, only _tag should be non-required
      // - All other fields should calculate their required status normally
      let isRequired: boolean
      if (meta._isNullableDiscriminatedUnion && p.name.toString() === "_tag") {
        // _tag in a nullable discriminated union is not required
        isRequired = false
      } else if (meta.required === false) {
        // Explicitly set to non-required (legacy behavior for backwards compatibility)
        isRequired = false
      } else {
        // Calculate from the property itself
        isRequired = !nullableOrUndefined
      }

      const typeToProcess = p.type
      if (AST.isUnion(p.type)) {
        // First unwrap any nested unions, then filter out null/undefined
        const unwrappedTypes = unwrapNestedUnions(p.type.types)
        const nonNullTypes = unwrappedTypes
          .filter(
            (t) => !AST.isUndefined(t) && t !== S.Null.ast
          )
          // unwraps class (Class are transformations)
          .map(getTransformationFrom)

        const hasStructMembers = nonNullTypes.some(
          (t) => AST.isObjects(t)
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
            if (AST.isObjects(nonNullType)) {
              // For discriminated unions (multiple branches):
              // - If the parent union is nullable, only _tag should be non-required
              // - All other fields maintain their normal required status based on their own types
              const isNullableDiscriminatedUnion = nullableOrUndefined && nonNullTypes.length > 1

              Object.assign(
                acc,
                createMeta<T>({
                  parent: key,
                  propertySignatures: nonNullType.propertySignatures,
                  meta: isNullableDiscriminatedUnion ? { _isNullableDiscriminatedUnion: true } : {}
                })
              )
            }
          }
        } else {
          // Check if any of the union types are arrays
          const arrayTypes = nonNullTypes.filter(AST.isArrays)
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
              if (AST.isObjects(restElement)) {
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
                      propMeta.type === "multiple" && AST.isArrays(prop.type) && prop
                        .type
                        .rest && prop.type.rest.length > 0
                    ) {
                      const nestedRestElement = prop.type.rest[0]
                      if (AST.isObjects(nestedRestElement)) {
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
        // Unwrap transformations (like ExtendedClass) to check for propertySignatures
        const unwrappedTypeToProcess = getTransformationFrom(typeToProcess)
        if (AST.isObjects(unwrappedTypeToProcess)) {
          Object.assign(
            acc,
            createMeta<T>({
              parent: key,
              propertySignatures: unwrappedTypeToProcess.propertySignatures,
              meta: { required: isRequired, nullableOrUndefined }
            })
          )
        } else if (AST.isArrays(p.type)) {
          // Check if it has struct elements
          const hasStructElements = p.type.rest.length > 0
            && AST.isObjects(p.type.rest[0])

          if (hasStructElements) {
            // For arrays with struct elements, only create meta for nested fields, not the array itself
            const elementType = p.type.rest[0]
            if (AST.isObjects(elementType)) {
              // Process each property in the array element
              for (const prop of elementType.propertySignatures) {
                const propKey = `${key}.${prop.name.toString()}`

                // Check if the property is another array
                if (AST.isArrays(prop.type) && prop.type.rest.length > 0) {
                  const nestedElementType = prop.type.rest[0]
                  if (AST.isObjects(nestedElementType)) {
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
              required: isRequired && (!AST.isString(p.type) || getMetadataFromSchema(p.type).minLength),
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

    if (AST.isUnion(property)) {
      // First unwrap any nested unions, then filter out null/undefined
      const unwrappedTypes = unwrapNestedUnions(property.types)
      const nonNullType = unwrappedTypes.find(
        (t) => !AST.isUndefined(t) && t !== S.Null.ast
      )!

      if (AST.isObjects(nonNullType)) {
        return createMeta<T>({
          propertySignatures: nonNullType.propertySignatures,
          parent,
          meta
        })
      }

      if (unwrappedTypes.every(AST.isLiteral)) {
        return {
          ...meta,
          type: "select",
          members: unwrappedTypes.map((t) => t.literal)
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

    if (AST.isArrays(property)) {
      return {
        ...meta,
        type: "multiple",
        members: property.elements,
        rest: property.rest
      } as FieldMeta
    }

    const JSONAnnotation = (property.annotations?.jsonSchema ?? {}) as Record<string, unknown>

    meta = { ...JSONAnnotation, ...meta }

    // check the title annotation BEFORE following "from" to detect refinements like S.Int
    const titleType = property.annotations?.title ?? "unknown"

    // if this is S.Int (a refinement), set the type and skip following "from"
    // otherwise we'd lose the "Int" information and get "number" instead
    if (titleType === "Int" || titleType === "int") {
      meta["type"] = "number"
      meta["refinement"] = "int"
      // don't follow "from" for Int refinements
    } else {
      meta["type"] = titleType
    }

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

const _schemaFromAst = (ast: AST.AST): S.Schema<any> => S.make(ast)

const metadataFromAst = <_From, To>(
  schema: any // v4 Schema type is complex, use any for now
): { meta: MetaRecord<To>; defaultValues: Record<string, any>; unionMeta: Record<string, MetaRecord<To>> } => {
  const ast = schema.ast
  const newMeta: MetaRecord<To> = {}
  const defaultValues: Record<string, any> = {}
  const unionMeta: Record<string, MetaRecord<To>> = {}

  // Handle root-level Union types (discriminated unions)
  if (AST.isUnion(ast)) {
    const types = ast.types

    // Filter out null/undefined types and unwrap transformations
    const nonNullTypes = types
      .filter((t: any) => !AST.isUndefined(t) && t !== S.Null.ast)
      .map(getTransformationFrom)

    // Check if this is a discriminated union (all members are structs)
    const allStructs = nonNullTypes.every((t: any) => AST.isObjects(t))

    if (allStructs && nonNullTypes.length > 0) {
      // Extract discriminator values from each union member
      const discriminatorValues: any[] = []

      // Store metadata for each union member by its tag value
      for (const memberType of nonNullTypes) {
        if (AST.isObjects(memberType)) {
          // Find the discriminator field (usually _tag)
          const tagProp = memberType.propertySignatures.find(
            (p: any) => p.name.toString() === "_tag"
          )

          let tagValue: string | null = null
          if (tagProp && AST.isLiteral(tagProp.type)) {
            tagValue = tagProp.type.literal as string
            discriminatorValues.push(tagValue)
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

  if (AST.isObjects(ast)) {
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

export const duplicateSchema = <From, To>(
  schema: S.Codec<To, From, never>
) => {
  return schema
}

export const generateMetaFromSchema = <_From, To>(
  schema: any // v4 Schema type is complex, use any for now
): {
  schema: any
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
  let schema: S.Schema<any>

  switch (meta.type) {
    case "string": {
      schema = S.String

      // Apply format-specific schemas
      if (meta.format === "email") {
        // v4 doesn't have S.Email, use pattern validation
        schema = S.String.check(
          S.makeFilter(
            (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || trans("validation.email.invalid"),
            { title: "email format" }
          )
        )
      }

      // Apply length validations
      if (meta.required || typeof meta.minLength === "number") {
        const minLen = meta.required ? Math.max(1, meta.minLength || 0) : (meta.minLength || 0)
        if (minLen > 0) {
          schema = schema.check(
            S.makeFilter(
              (s) => s.length >= minLen || trans("validation.string.minLength", { minLength: minLen }),
              { title: `minLength(${minLen})` }
            )
          )
        }
      }

      if (typeof meta.maxLength === "number") {
        schema = schema.check(
          S.makeFilter(
            (s) => s.length <= meta.maxLength! || trans("validation.string.maxLength", { maxLength: meta.maxLength }),
            { title: `maxLength(${meta.maxLength})` }
          )
        )
      }
      break
    }

    case "number": {
      if (meta.refinement === "int") {
        schema = S.Int
      } else {
        schema = S.Number
      }

      // Apply numeric validations
      if (typeof meta.minimum === "number") {
        schema = schema.check(
          S.makeFilter(
            (n) =>
              n >= meta.minimum! || trans(
                meta.minimum === 0 ? "validation.number.positive" : "validation.number.min",
                { minimum: meta.minimum, isExclusive: false }
              ),
            { title: `>=${meta.minimum}` }
          )
        )
      }

      if (typeof meta.maximum === "number") {
        schema = schema.check(
          S.makeFilter(
            (n) =>
              n <= meta.maximum! || trans("validation.number.max", {
                maximum: meta.maximum,
                isExclusive: false
              }),
            { title: `<=${meta.maximum}` }
          )
        )
      }

      if (typeof meta.exclusiveMinimum === "number") {
        schema = schema.check(
          S.makeFilter(
            (n) =>
              n > meta.exclusiveMinimum! || trans(
                meta.exclusiveMinimum === 0 ? "validation.number.positive" : "validation.number.min",
                { minimum: meta.exclusiveMinimum, isExclusive: true }
              ),
            { title: `>${meta.exclusiveMinimum}` }
          )
        )
      }

      if (typeof meta.exclusiveMaximum === "number") {
        schema = schema.check(
          S.makeFilter(
            (n) =>
              n < meta.exclusiveMaximum! || trans("validation.number.max", {
                maximum: meta.exclusiveMaximum,
                isExclusive: true
              }),
            { title: `<${meta.exclusiveMaximum}` }
          )
        )
      }
      break
    }

    case "select": {
      // Use Literal for select options
      if (meta.members.length === 0) {
        schema = S.Unknown
      } else if (meta.members.length === 1) {
        schema = S.Literal(meta.members[0])
      } else {
        // v4 Union accepts an array of schemas
        schema = S.Union(meta.members.map((m) => S.Literal(m)))
      }
      break
    }

    case "multiple": {
      schema = S.Array(S.String)
      break
    }

    case "boolean": {
      schema = S.Boolean
      break
    }

    case "unknown": {
      schema = S.Unknown
      break
    }

    default: {
      console.warn(`Unhandled field type: ${(meta as any).type}`)
      schema = S.Unknown
      break
    }
  }

  // Wrap in union with null/undefined if not required
  if (!meta.required) {
    // v4 Union takes an array of schemas
    schema = S.Union([schema, S.Null, S.Undefined])
  }

  return S.toStandardSchemaV1(schema as any)
}

// TODO: Fix v4 migration - nullableInput transformation needs proper type handling
// export const nullableInput = <A>(
//   schema: S.Schema<A>,
//   defaultValue: () => A
// ): S.Schema<A> =>
//   S.NullOr(schema).pipe(
//     S.decodeTo(
//       schema,
//       SchemaTransformation.transform({
//         decode: (input: A | null) => input ?? defaultValue(),
//         encode: (output: A) => output
//       })
//     )
//   )

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

// Type definitions for schemas with fields and members
type SchemaWithFields = {
  fields: Record<string, S.Top>
}

type SchemaWithMembers = {
  members: readonly S.Top[]
}

// Type guards to check schema types
function hasFields(schema: any): schema is SchemaWithFields {
  return schema && "fields" in schema && typeof schema.fields === "object"
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

  // v4: defaultValue is in ast.context?.defaultValue but complex to extract
  // Skip default value extraction for now
  // if (ast?.defaultValue) { ... }

  if (isNullableOrUndefined(schema.ast) === "null") {
    return null
  }
  if (isNullableOrUndefined(schema.ast) === "undefined") {
    return undefined
  }

  // Check if schema has fields directly
  if (hasFields(schema)) {
    // Process fields and extract default values
    const result: Record<string, any> = {}

    for (const [key, fieldSchema] of Object.entries(schema.fields)) {
      // Check if this field has a defaultValue in its AST
      const fieldAst = (fieldSchema as any)?.ast
      if (fieldAst?.defaultValue) {
        try {
          result[key] = fieldAst.defaultValue()
          continue
        } catch {
          // If defaultValue() throws, fall through to recursive processing
        }
      }

      // Recursively process the field
      const fieldValue = defaultsValueFromSchema(fieldSchema as any, record[key] || {})
      if (fieldValue !== undefined) {
        result[key] = fieldValue
      }
    }

    return { ...result, ...record }
  }

  // Check if schema has fields in from (for ExtendedClass and similar transformations)
  if ((schema as any)?.from && hasFields((schema as any).from)) {
    return defaultsValueFromSchema((schema as any).from, record)
  }

  if (hasMembers(schema)) {
    // Merge all member fields, giving precedence to fields with default values
    const mergedMembers = schema.members.reduce((acc, member) => {
      if (hasFields(member)) {
        // Check each field and give precedence to ones with default values
        Object.entries(member.fields).forEach(([key, fieldSchema]) => {
          const fieldAst: any = fieldSchema.ast
          const existingFieldAst: any = acc[key]?.ast

          // If field doesn't exist yet, or new field has default and existing doesn't, use new field
          if (!acc[key] || (fieldAst?.defaultValue && !existingFieldAst?.defaultValue)) {
            acc[key] = fieldSchema
          }
          // If both have defaults or neither have defaults, keep the first one (existing)
        })
        return acc
      }
      return acc
    }, {} as Record<string, any>)

    // Use reduce to properly accumulate the merged fields
    return Object.entries(mergedMembers).reduce((acc, [key, value]) => {
      acc[key] = defaultsValueFromSchema(value, record[key] || {})
      return acc
    }, record)
  }

  if (Object.keys(record).length === 0) {
    // Check for constructor defaults in v4's context
    if (ast.context?.defaultValue) {
      // In v4, defaultValue is an Encoding type, not directly callable
      // For now, skip complex default extraction
      // TODO: properly extract default from encoding chain
    }

    if (AST.isObjects(ast)) {
      // Process Objects fields directly to build the result object
      const result: Record<string, any> = { ...record }

      for (const prop of ast.propertySignatures) {
        const key = prop.name.toString()
        const propType = prop.type

        // Check context for constructor defaults
        if (propType.context?.defaultValue) {
          // Skip for now - complex to extract from Encoding
          continue
        }

        // Create a schema from the property type and get its defaults
        const propSchema = S.make(propType)

        // Recursively process the property
        const propValue = defaultsValueFromSchema(propSchema)

        if (propValue !== undefined) {
          result[key] = propValue
        }
      }

      return result
    }
    if (AST.isString(ast)) {
      return ""
    }
    if (AST.isBoolean(ast)) {
      return false
    }
  }
}
