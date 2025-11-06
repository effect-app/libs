/* eslint-disable @typescript-eslint/consistent-type-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as api from "@opentelemetry/api"
import { type DeepKeys, DeepValue, type FormAsyncValidateOrFn, type FormValidateOrFn, type StandardSchemaV1, StandardSchemaV1Issue, useForm, ValidationError, ValidationErrorMap } from "@tanstack/vue-form"
import { Array, Data, Effect, Fiber, Option, Order, S } from "effect-app"
import { runtimeFiberAsPromise } from "effect-app/utils"
import { isObject } from "effect/Predicate"
import { Component, computed, ComputedRef, ConcreteComponent, h, type InjectionKey, onBeforeUnmount, onMounted, onUnmounted, Ref, ref, watch } from "vue"
import { MergedInputProps } from "./InputProps"
import OmegaArray from "./OmegaArray.vue"
import OmegaAutoGen from "./OmegaAutoGen.vue"
import OmegaErrorsInternal from "./OmegaErrorsInternal.vue"
import { BaseProps, DefaultTypeProps, FieldPath, type FormProps, generateMetaFromSchema, type MetaRecord, type NestedKeyOf, OmegaArrayProps, OmegaAutoGenMeta, OmegaError, type OmegaFormApi, OmegaFormState } from "./OmegaFormStuff"
import OmegaInput from "./OmegaInput.vue"
import OmegaTaggedUnion from "./OmegaTaggedUnion.vue"
import OmegaForm from "./OmegaWrapper.vue"

/**
 * Recursively makes all properties in a schema optional, including nested objects.
 * Unlike S.partial which only makes top-level properties optional, this utility
 * traverses the schema tree and applies partial transformation at every level.
 *
 * Handles:
 * - TypeLiteral (structs): Makes all properties optional and recursively processes nested types
 * - Union types: Recursively applies partial to each union member
 * - Transformation types: Applies partial to both 'from' and 'to' sides
 */
const partialRecursive = <A, I, R>(schema: S.Schema<A, I, R>): S.Schema<Partial<A>, Partial<I>, R> => {
  const ast = schema.ast

  // Handle Union types - recursively apply partial to each member
  if (ast._tag === "Union") {
    const partialMembers = (ast as any).types.map((memberAst: any) => {
      const memberSchema = S.make(memberAst)
      const partialMember = partialRecursive(memberSchema as any)
      return partialMember.ast
    })

    const newAst = {
      ...ast,
      types: partialMembers
    }

    return S.make(newAst as any)
  }

  // Handle Transformation types (e.g., withDefaultConstructor)
  if (ast._tag === "Transformation") {
    // For transformations, apply partial to both the 'from' and 'to' sides
    const fromSchema = S.make((ast as any).from)
    const toSchema = S.make((ast as any).to)
    const partialFrom = partialRecursive(fromSchema as any)
    const partialTo = partialRecursive(toSchema as any)

    const newAst = {
      ...ast,
      from: partialFrom.ast,
      to: partialTo.ast
    }

    return S.make(newAst as any)
  }

  // If this is a TypeLiteral (struct), recursively apply partial to nested fields
  if (ast._tag === "TypeLiteral") {
    const fields = ast.propertySignatures.map((prop: any) => {
      const propType = prop.type
      let newType = propType

      // Recursively handle nested complex types (structs, unions, transformations)
      if (propType._tag === "TypeLiteral" || propType._tag === "Union" || propType._tag === "Transformation") {
        const nestedSchema = S.make(propType)
        const recursivePartial = partialRecursive(nestedSchema as any)
        newType = recursivePartial.ast
      }

      // Create a new property signature with isOptional: true
      return {
        ...prop,
        type: newType,
        isOptional: true
      }
    })

    const newAst = {
      ...ast,
      propertySignatures: fields
    }

    return S.make(newAst as any)
  }

  // For other schema types (primitives, refinements, etc.), return as-is
  // These types don't need to be made partial, and S.partial doesn't support them anyway
  return schema as any
}

type keysRule<T> =
  | {
    keys?: NestedKeyOf<T>[]
    banKeys?: "You should only use one of banKeys or keys, not both, moron"
  }
  | {
    keys?: "You should only use one of banKeys or keys, not both, moron"
    banKeys?: NestedKeyOf<T>[]
  }

export class FormErrors<From> extends Data.TaggedError("FormErrors")<{
  form: {
    // TODO: error shapes seem off, with `undefined` etc..
    errors: (Record<string, StandardSchemaV1Issue[]> | undefined)[]
    errorMap: ValidationErrorMap<
      undefined,
      undefined,
      Record<string, StandardSchemaV1Issue[]>,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    >
  }
  fields: Record<DeepKeys<From>, {
    errors: ValidationError[]
    errorMap: ValidationErrorMap
  }>
}> {}

const fHoc = (form: OF<any, any>) => {
  return function FormHoc<P>(
    WrappedComponent: Component<P>
  ): ConcreteComponent<P> {
    return {
      render() {
        return h(WrappedComponent, {
          form,
          ...this.$attrs
        } as any, this.$slots)
      }
    }
  }
}

const eHoc = (errorProps: {
  form: OF<any, any>
  fieldMap: Ref<Map<string, { id: string; label: string }>>
}) => {
  return function FormHoc<P>(
    WrappedComponent: Component<P>
  ): ConcreteComponent<P> {
    return {
      setup() {
        const { fieldMap, form } = errorProps
        const generalErrors = form.useStore((state) => state.errors)
        const fieldMeta = form.useStore((state) => state.fieldMeta)
        const errorMap = form.useStore((state) => state.errorMap)

        const errors = computed(() => {
          // Collect errors from fieldMeta (field-level errors for registered fields)
          const fieldErrors = Array.filterMap(
            Object
              .entries(fieldMeta.value),
            ([key, m]): Option.Option<OmegaError> => {
              const fieldErrors = (m as any).errors ?? []
              if (!fieldErrors.length) return Option.none()

              const fieldInfo = fieldMap.value.get(key)
              // Only show errors for fields that are currently mounted (registered in fieldMap)
              if (!fieldInfo) return Option.none()

              return Option.some({
                label: fieldInfo.label,
                inputId: fieldInfo.id,
                // Only show the first error
                errors: [fieldErrors[0]?.message].filter(Boolean)
              })
            }
          )

          // Collect errors from errorMap.onSubmit ONLY for fields that are NOT registered
          // (registered fields already have their errors in fieldMeta)
          const submitErrors: OmegaError[] = []
          if (errorMap.value.onSubmit) {
            for (const [_, issues] of Object.entries(errorMap.value.onSubmit)) {
              if (Array.isArray(issues) && issues.length) {
                for (const issue of issues) {
                  const issAny: any = issue
                  if (issAny?.path && Array.isArray(issAny.path) && issAny.path.length) {
                    // Use the path from the issue to identify the field
                    const fieldPath = issAny.path.join(".")
                    // Only add errors for fields that are NOT registered (not in fieldMap)
                    // Registered fields will already have their errors from fieldMeta
                    if (!fieldMap.value.has(fieldPath)) {
                      submitErrors.push({
                        label: fieldPath,
                        inputId: fieldPath,
                        errors: [issAny.message].filter(Boolean)
                      })
                      // Only show first error per field, so break after adding
                      break
                    }
                  }
                }
              }
            }
          }

          // Combine both error sources (no need to check for duplicates since they're mutually exclusive)
          return [...fieldErrors, ...submitErrors]
        })

        return {
          generalErrors,
          errors
        }
      },
      render({ errors, generalErrors }: any) {
        return h(WrappedComponent, {
          errors,
          generalErrors,
          ...this.$attrs
        } as any, this.$slots)
      }
    }
  }
}

export type OmegaConfig<T> = {
  i18nNamespace?: string

  persistency?: {
    /** Order of importance:
     * - "querystring": Highest priority when persisting
     * - "local" and then "session": Lower priority storage options
     */
    policies?: ("local" | "session" | "querystring")[]
    overrideDefaultValues?: boolean
    id?: string
  } & keysRule<T>

  ignorePreventCloseEvents?: boolean

  /**
   * Prevents browser window/tab exit when form has unsaved changes.
   * Shows native browser "Leave site?" dialog.
   *
   * @remarks
   * - Opt-in only: Must explicitly enable
   * - Independent from data persistence feature
   */
  preventWindowExit?: "prevent" | "prevent-and-reset" | "nope"

  input?: any
}

export interface OF<From, To> extends OmegaFormApi<From, To> {
  meta: MetaRecord<From>
  clear: () => void
  i18nNamespace?: string
  ignorePreventCloseEvents?: boolean
  registerField: (
    field: ComputedRef<{
      name: string
      label: string
      id: string
    }>
  ) => void
  /** @experimental */
  handleSubmitEffect: {
    /**
     * when `checkErrors` is true, the Effect will fail with `FormErrors<From>` when there are validation errors
     * @experimental */
    (options: { checkErrors: true; meta?: Record<string, any> }): Effect.Effect<void, FormErrors<From>>
    /** @experimental */
    (options?: { meta?: Record<string, any> }): Effect.Effect<void>
  }
}

export const OmegaFormKey = Symbol("OmegaForm") as InjectionKey<OF<any, any>>

type __VLS_PrettifyLocal<T> =
  & {
    [K in keyof T]: T[K]
  }
  & {}

// Type aliases for Array component slots - using cached types for performance
type CachedFieldApi<From, To, TypeProps = DefaultTypeProps> = import("@tanstack/vue-form").FieldApi<
  From,
  OmegaFormReturn<From, To, TypeProps>["_keys"],
  DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>,
  | import("@tanstack/vue-form").FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").StandardSchemaV1<From, To>,
  import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
  Record<string, any> | undefined
>

type CachedFieldState<From, To, TypeProps = DefaultTypeProps> = import("@tanstack/vue-form").FieldState<
  From,
  OmegaFormReturn<From, To, TypeProps>["_keys"],
  DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>,
  | import("@tanstack/vue-form").FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  | import("@tanstack/vue-form").FieldAsyncValidateOrFn<
    From,
    OmegaFormReturn<From, To, TypeProps>["_keys"],
    DeepValue<From, OmegaFormReturn<From, To, TypeProps>["_keys"]>
  >
  | undefined,
  import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").StandardSchemaV1<From, To>,
  import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormValidateOrFn<From> | undefined,
  import("@tanstack/vue-form").FormAsyncValidateOrFn<From> | undefined
>

export interface OmegaFormReturn<
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  TypeProps = DefaultTypeProps
> extends OF<From, To> {
  // Pre-computed type aliases - computed ONCE for performance
  _paths: FieldPath<From>
  _keys: DeepKeys<From>

  // this crazy thing here is copied from the OmegaFormInput.vue.d.ts, with `From` removed as Generic, instead closed over from the From generic above..
  Input: <Name extends OmegaFormReturn<From, To, TypeProps>["_paths"]>(
    __VLS_props: NonNullable<Awaited<typeof __VLS_setup>>["props"],
    __VLS_ctx?: __VLS_PrettifyLocal<Pick<NonNullable<Awaited<typeof __VLS_setup>>, "attrs" | "emit" | "slots">>,
    __VLS_expose?: NonNullable<Awaited<typeof __VLS_setup>>["expose"],
    __VLS_setup?: Promise<{
      props:
        & __VLS_PrettifyLocal<
          & Pick<
            & Partial<{}>
            & Omit<
              {} & import("vue").VNodeProps & import("vue").AllowedComponentProps & import("vue").ComponentCustomProps,
              never
            >,
            never
          >
          & TypeProps
          & Partial<{}>
        >
        & BaseProps<From, Name>
        & import("vue").PublicProps
      expose(exposed: import("vue").ShallowUnwrapRef<{}>): void
      attrs: any
      slots: {
        default?(props: MergedInputProps<From, Name>): void
        label?: (props: { required: boolean; id: string; label: string }) => void
      }
      emit: {}
    }>
  ) => import("vue").VNode & {
    __ctx?: Awaited<typeof __VLS_setup>
  }
  Errors: (
    __VLS_props: NonNullable<Awaited<typeof __VLS_setup>>["props"],
    __VLS_ctx?: __VLS_PrettifyLocal<Pick<NonNullable<Awaited<typeof __VLS_setup>>, "attrs" | "emit" | "slots">>,
    __VLS_expose?: NonNullable<Awaited<typeof __VLS_setup>>["expose"],
    __VLS_setup?: Promise<{
      props:
        & __VLS_PrettifyLocal<
          & Pick<
            & Partial<{}>
            & Omit<
              {} & import("vue").VNodeProps & import("vue").AllowedComponentProps & import("vue").ComponentCustomProps,
              never
            >,
            never
          >
          & Partial<{}>
        >
        & import("vue").PublicProps
      expose(exposed: import("vue").ShallowUnwrapRef<{}>): void
      attrs: any
      slots: {
        default: (props: { errors: readonly OmegaError[]; showedGeneralErrors: string[] }) => void
      }
      emit: {}
    }>
  ) => import("vue").VNode & {
    __ctx?: Awaited<typeof __VLS_setup>
  }
  TaggedUnion: <Name extends OmegaFormReturn<From, To, TypeProps>["_keys"]>(
    __VLS_props: NonNullable<Awaited<typeof __VLS_setup>>["props"],
    __VLS_ctx?: __VLS_PrettifyLocal<Pick<NonNullable<Awaited<typeof __VLS_setup>>, "attrs" | "emit" | "slots">>,
    __VLS_expose?: NonNullable<Awaited<typeof __VLS_setup>>["expose"],
    __VLS_setup?: Promise<{
      props:
        & __VLS_PrettifyLocal<
          & Pick<
            & Partial<{}>
            & Omit<
              {} & import("vue").VNodeProps & import("vue").AllowedComponentProps & import("vue").ComponentCustomProps,
              never
            >,
            never
          >
          & {
            name?: Name
            type?: "select" | "radio"
            options: import("./InputProps").TaggedUnionOptionsArray<From, Name>
            _debugName?: [NoInfer<Name>]
            label?: string
          }
          & {}
        >
        & import("vue").PublicProps
      expose(exposed: import("vue").ShallowUnwrapRef<{}>): void
      attrs: any
      slots: Record<
        string,
        (props: {
          field: import("@tanstack/vue-form").FieldApi<
            From,
            Name,
            DeepValue<From, Name>,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any
          >
          state: import("@tanstack/vue-form").FieldState<
            From,
            Name,
            DeepValue<From, Name>,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any
          >
        }) => any
      >
      emit: {}
    }>
  ) => import("vue").VNode & {
    __ctx?: Awaited<typeof __VLS_setup>
  }
  Array: <Name extends OmegaFormReturn<From, To, TypeProps>["_keys"]>(
    __VLS_props: NonNullable<Awaited<typeof __VLS_setup>>["props"],
    __VLS_ctx?: __VLS_PrettifyLocal<Pick<NonNullable<Awaited<typeof __VLS_setup>>, "attrs" | "emit" | "slots">>,
    __VLS_expose?: NonNullable<Awaited<typeof __VLS_setup>>["expose"],
    __VLS_setup?: Promise<{
      props:
        & __VLS_PrettifyLocal<
          & Pick<
            & Partial<{}>
            & Omit<
              {} & import("vue").VNodeProps & import("vue").AllowedComponentProps & import("vue").ComponentCustomProps,
              never
            >,
            never
          >
          & (Omit<OmegaArrayProps<From, To, Name>, "form">)
          & {}
        >
        & import("vue").PublicProps
      expose(exposed: import("vue").ShallowUnwrapRef<{}>): void
      attrs: any
      slots: {
        "pre-array"?: (props: {
          field: CachedFieldApi<From, To, TypeProps>
          state: CachedFieldState<From, To, TypeProps>
        }) => any
      } & {
        default?: (props: {
          subField: CachedFieldApi<From, To, TypeProps>
          subState: CachedFieldState<From, To, TypeProps>
          index: number
          field: CachedFieldApi<From, To, TypeProps>
        }) => any
      } & {
        "post-array"?: (props: {
          field: CachedFieldApi<From, To, TypeProps>
          state: CachedFieldState<From, To, TypeProps>
        }) => any
      } & {
        field?: (props: {
          field: CachedFieldApi<From, To, TypeProps>
        }) => any
      }
      emit: {}
    }>
  ) => import("vue").VNode & {
    __ctx?: Awaited<typeof __VLS_setup>
  }

  AutoGen: <Name extends OmegaFormReturn<From, To, TypeProps>["_keys"]>(
    __VLS_props: NonNullable<Awaited<typeof __VLS_setup>>["props"],
    __VLS_ctx?: __VLS_PrettifyLocal<Pick<NonNullable<Awaited<typeof __VLS_setup>>, "attrs" | "emit" | "slots">>,
    __VLS_expose?: NonNullable<Awaited<typeof __VLS_setup>>["expose"],
    __VLS_setup?: Promise<{
      props:
        & __VLS_PrettifyLocal<
          Pick<
            & Partial<{}>
            & Omit<
              {} & import("vue").VNodeProps & import("vue").AllowedComponentProps & import("vue").ComponentCustomProps,
              never
            >,
            never
          > & {
            // form: OmegaInputProps<From, To>["form"]
            pick?: OmegaFormReturn<From, To, TypeProps>["_keys"][]
            omit?: OmegaFormReturn<From, To, TypeProps>["_keys"][]
            labelMap?: (key: OmegaFormReturn<From, To, TypeProps>["_keys"]) => string | undefined
            filterMap?: <M extends OmegaAutoGenMeta<From, To, Name>>(
              key: OmegaFormReturn<From, To, TypeProps>["_keys"],
              meta: M
            ) => boolean | M
            order?: OmegaFormReturn<From, To, TypeProps>["_keys"][]
            sort?: Order.Order<OmegaAutoGenMeta<From, To, Name>>
          } & {}
        >
        & import("vue").PublicProps
      expose(exposed: import("vue").ShallowUnwrapRef<{}>): void
      attrs: any
      slots: {
        default(props: {
          child: OmegaAutoGenMeta<From, To, Name>
        }): void
      }
      emit: {}
    }>
  ) => import("vue").VNode & {
    __ctx?: Awaited<typeof __VLS_setup>
  }

  Form: <K extends keyof OmegaFormState<To, From>>(
    __VLS_props: NonNullable<Awaited<typeof __VLS_setup>>["props"],
    __VLS_ctx?: __VLS_PrettifyLocal<Pick<NonNullable<Awaited<typeof __VLS_setup>>, "attrs" | "emit" | "slots">>,
    __VLS_expose?: NonNullable<Awaited<typeof __VLS_setup>>["expose"],
    __VLS_setup?: Promise<{
      props:
        & __VLS_PrettifyLocal<
          Pick<
            & Partial<{}>
            & Omit<
              {} & import("vue").VNodeProps & import("vue").AllowedComponentProps & import("vue").ComponentCustomProps,
              never
            >,
            never
          > & {
            // form: OmegaFormReturn<From, To, Props>
            disabled?: boolean
            subscribe?: K[]
          } & {}
        >
        & import("vue").PublicProps
      expose(exposed: import("vue").ShallowUnwrapRef<{}>): void
      attrs: any
      slots: {
        default(props: {
          subscribedValues: K[] extends undefined[] ? Record<string, never> : Pick<OmegaFormState<From, To>, K>
        }): void
      }
      emit: {}
    }>
  ) => import("vue").VNode & {
    __ctx?: Awaited<typeof __VLS_setup>
  }
}

export const useOmegaForm = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  From extends Record<PropertyKey, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  To extends Record<PropertyKey, any>,
  TypeProps = DefaultTypeProps
>(
  schema: S.Schema<To, From, never>,
  tanstackFormOptions?: NoInfer<FormProps<From, To>>,
  omegaConfig?: OmegaConfig<To>
): OmegaFormReturn<From, To, TypeProps> => {
  if (!schema) throw new Error("Schema is required")
  const standardSchema = S.standardSchemaV1(schema)
  const decode = S.decode(schema)

  const { meta } = generateMetaFromSchema(schema)

  const persistencyKey = computed(() => {
    if (omegaConfig?.persistency?.id) {
      return omegaConfig.persistency.id
    }
    const path = window.location.pathname
    const keys = Object.keys(meta)
    return `${path}-${keys.join("-")}`
  })

  const clearUrlParams = () => {
    const params = new URLSearchParams(window.location.search)
    params.delete(persistencyKey.value)
    const url = new URL(window.location.href)
    url.search = params.toString()
    window.history.replaceState({}, "", url.toString())
  }

  function deepMerge(target: any, source: any) {
    for (const key in source) {
      if (Array.isArray(source[key])) {
        // Arrays should be copied directly, not deep merged
        target[key] = source[key]
      } else if (source[key] && isObject(source[key])) {
        if (!target[key]) {
          target[key] = {}
        }
        deepMerge(target[key], source[key])
      } else {
        target[key] = source[key]
      }
    }
    return target
  }

  // Helper function to recursively extract default values from schema AST
  const extractDefaultsFromAST = (schemaObj: any): any => {
    const result: Record<string, any> = {}

    // If this schema has a .make() method (like ExtendedClass), use it to get complete defaults
    // This is more reliable than manually extracting fields, especially for classes
    if (typeof schemaObj?.make === "function") {
      try {
        const instance = schemaObj.make({})
        // For ExtendedClass, the instance is already in the correct encoded format
        return instance
      } catch {
        // If make() fails, fall through to manual extraction
      }
    }

    // Check if this schema is a union - check both direct property and AST
    const unionMembers = schemaObj?.members
      || (schemaObj?.ast?._tag === "Union" && schemaObj.ast.types
        ? schemaObj.ast.types.map((t: any) => S.make(t))
        : null)
    if (unionMembers && Array.isArray(unionMembers)) {
      // For unions, we try to find the first member that has a complete set of defaults
      // Priority is given to members with default values for discriminator fields
      for (const member of unionMembers as any[]) {
        const memberDefaults = extractDefaultsFromAST(member)
        if (Object.keys(memberDefaults).length > 0) {
          // Check if this member has a default value for a discriminator field (like _tag)
          // If it does, use this member's defaults
          const hasDiscriminatorDefault = member?.fields && Object.entries(member.fields).some(
            ([key, fieldSchema]: [string, any]) => {
              // Common discriminator field names
              if (key === "_tag" || key === "type" || key === "kind") {
                return fieldSchema?.ast?.defaultValue !== undefined
              }
              return false
            }
          )

          if (hasDiscriminatorDefault) {
            return memberDefaults
          }
        }
      }
      // If no member has a discriminator default, return empty
      return {}
    }

    // Check if this schema has fields (struct)
    if (schemaObj?.fields && typeof schemaObj.fields === "object") {
      for (const [key, fieldSchema] of Object.entries(schemaObj.fields)) {
        // Check if this field has a default value in its AST
        if ((fieldSchema as any)?.ast?.defaultValue) {
          try {
            const defaultValue = (fieldSchema as any).ast.defaultValue()
            if (defaultValue !== undefined) {
              result[key] = defaultValue
            }
          } catch {
            // Silently ignore if defaultValue() throws
          }
        }

        // Recursively check nested fields for structs and unions
        const nestedDefaults = extractDefaultsFromAST(fieldSchema as any)
        if (Object.keys(nestedDefaults).length > 0) {
          // If we already have a default value for this key, merge with nested
          if (result[key] && typeof result[key] === "object") {
            Object.assign(result[key], nestedDefaults)
          } else if (!result[key]) {
            // Only set nested defaults if we don't have a default value
            result[key] = nestedDefaults
          }
        }
      }
    }

    return result
  }

  // Extract default values from schema constructors (e.g., withDefaultConstructor)
  const extractSchemaDefaults = (defaultValues: Partial<From> = {}) => {
    let result: Partial<From> = {}

    try {
      // First try to use schema.make() if available
      // First try to use schema.make() if available
      // Note: Partial schemas don't have .make() method yet (https://github.com/Effect-TS/effect/issues/4222)
      const decoded = (schema as any).make(defaultValues)
      result = S.encodeSync(partialRecursive(schema))(decoded)
    } catch (error) {
      // If make() fails, try to extract defaults from AST
      if (window.location.hostname === "localhost") {
        console.warn("schema.make() failed, extracting defaults from AST:", error)
      }
      try {
        const astDefaults = extractDefaultsFromAST(schema)
        result = S.encodeSync(partialRecursive(schema))(astDefaults)
      } catch (astError) {
        if (window.location.hostname === "localhost") {
          console.warn("Could not extract defaults from AST:", astError)
        }
      }
    }
    return deepMerge(result, defaultValues)
  }

  const defaultValues = computed(() => {
    // will contain what we get from querystring or local/session storage
    let defValuesPatch

    const persistency = omegaConfig?.persistency

    if (
      // query string has higher priority than local/session storage
      persistency?.policies
      && !defValuesPatch
      && (persistency.policies.includes("local")
        || persistency.policies.includes("session"))
    ) {
      const storage = persistency.policies.includes("local")
        ? localStorage
        : sessionStorage
      if (storage) {
        try {
          const value = JSON.parse(
            storage.getItem(persistencyKey.value) || "{}"
          )
          storage.removeItem(persistencyKey.value)
          defValuesPatch = value
        } catch (error) {
          console.error(error)
        }
      }
    }
    if (persistency?.policies && persistency.policies.includes("querystring")) {
      try {
        const params = new URLSearchParams(window.location.search)
        const value = params.get(persistencyKey.value)
        clearUrlParams()
        if (value) {
          defValuesPatch = deepMerge(defValuesPatch || {}, JSON.parse(value))
        }
      } catch (error) {
        console.error(error)
      }
    }

    // to be sure we have a valid object at the end of the gathering process
    defValuesPatch ??= {}

    // we just return what we gathered from the query/storage
    return extractSchemaDefaults(
      omegaConfig?.persistency?.overrideDefaultValues
        ? deepMerge(tanstackFormOptions?.defaultValues || {}, defValuesPatch)
        : deepMerge(defValuesPatch, tanstackFormOptions?.defaultValues || {})
    )
  })

  const wrapWithSpan = (span: api.Span | undefined, toWrap: () => any) => {
    return span ? api.context.with(api.trace.setSpan(api.context.active(), span), toWrap) : toWrap()
  }

  const form = useForm<
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
  >({
    ...tanstackFormOptions,
    validators: {
      onSubmit: standardSchema,
      ...(tanstackFormOptions?.validators || {})
    },
    onSubmit: tanstackFormOptions?.onSubmit
      ? ({ formApi, meta, value }) =>
        wrapWithSpan(meta?.currentSpan, async () => {
          // validators only validate, they don't actually transform, so we have to do that manually here.
          const parsedValue = await Effect.runPromise(decode(value))
          const r = tanstackFormOptions.onSubmit!({
            formApi: formApi as OmegaFormApi<From, To>,
            meta,
            value: parsedValue
          })
          if (Fiber.isFiber(r) && Fiber.isRuntimeFiber(r)) {
            return await runtimeFiberAsPromise(r)
          }
          if (Effect.isEffect(r)) {
            return await Effect.runPromise(
              r.pipe(
                // meta?.currentSpan
                //   ? Effect.withParentSpan(meta.currentSpan)
                //   : (_) => _,
                Effect.flatMap((_) => Fiber.join(_))
              )
            )
          }
          return r
        })
      : undefined,
    defaultValues: defaultValues.value as any
  }) satisfies OmegaFormApi<To, From>

  const clear = () => {
    Object.keys(meta).forEach((key: any) => {
      form.setFieldValue(key, undefined as any)
    })
  }

  const createNestedObjectFromPaths = (paths: string[]) =>
    paths.reduce((result, path) => {
      const parts = path.split(".")
      parts.reduce((acc, part, i) => {
        if (i === parts.length - 1) {
          acc[part] = form.getFieldValue(path as any)
        } else {
          acc[part] = acc[part] ?? {}
        }
        return acc[part]
      }, result)
      return result
    }, {} as Record<string, any>)

  const persistFilter = (persistency: OmegaConfig<From>["persistency"]) => {
    if (!persistency) return
    if (Array.isArray(persistency.keys)) {
      return createNestedObjectFromPaths(persistency.keys)
    }
    if (Array.isArray(persistency.banKeys)) {
      const subs = Object.keys(meta).filter((metakey) => persistency.banKeys?.includes(metakey as any))
      return createNestedObjectFromPaths(subs)
    }
    return form.store.state.values
  }

  const persistData = () => {
    const persistency = omegaConfig?.persistency
    if (!persistency?.policies || persistency.policies.length === 0) {
      return
    }
    if (
      persistency.policies.includes("local")
      || persistency.policies.includes("session")
    ) {
      const storage = persistency.policies.includes("local")
        ? localStorage
        : sessionStorage
      if (!storage) return
      const values = persistFilter(persistency)
      return storage.setItem(persistencyKey.value, JSON.stringify(values))
    }
  }

  const saveDataInUrl = () => {
    const persistency = omegaConfig?.persistency
    if (!persistency?.policies || persistency.policies.length === 0) {
      return
    }
    if (persistency.policies.includes("querystring")) {
      const values = persistFilter(persistency)
      const searchParams = new URLSearchParams(window.location.search)
      searchParams.set(persistencyKey.value, JSON.stringify(values))
      const url = new URL(window.location.href)
      url.search = searchParams.toString()
      window.history.replaceState({}, "", url.toString())
    }
  }

  const preventWindowExit = (e: BeforeUnloadEvent) => {
    if (form.store.state.isDirty) {
      e.preventDefault()
    }
  }

  onUnmounted(persistData)

  onMounted(() => {
    window.addEventListener("beforeunload", persistData)
    window.addEventListener("blur", saveDataInUrl)
    if (omegaConfig?.preventWindowExit && omegaConfig.preventWindowExit !== "nope") {
      window.addEventListener("beforeunload", preventWindowExit)
    }
  })
  onBeforeUnmount(() => {
    window.removeEventListener("beforeunload", persistData)
    window.removeEventListener("blur", saveDataInUrl)
    if (omegaConfig?.preventWindowExit && omegaConfig.preventWindowExit !== "nope") {
      window.removeEventListener("beforeunload", preventWindowExit)
    }
  })

  // Watch for successful form submissions and auto-reset if prevent-and-reset is enabled
  // We put it as a side effect, so we don't overwhelm submit handler and we can support
  // effects submission more freely
  if (omegaConfig?.preventWindowExit === "prevent-and-reset") {
    const isSubmitting = form.useStore((state) => state.isSubmitting)
    const submissionAttempts = form.useStore((state) => state.submissionAttempts)
    const canSubmit = form.useStore((state) => state.canSubmit)
    const values = form.useStore((state) => state.values)

    watch([isSubmitting, submissionAttempts], ([currentlySubmitting, attempts], [wasSubmitting]) => {
      // Detect successful submission: was submitting, now not submitting, and submission count increased
      if (wasSubmitting && !currentlySubmitting && attempts > 0 && canSubmit.value) {
        // Reset with current values to mark them as the new baseline
        form.reset(values.value)
      }
    })
  }

  const handleSubmitEffect_ = (meta?: Record<string, any>) =>
    Effect.currentSpan.pipe(
      Effect.option,
      Effect
        .flatMap((span) =>
          Effect.promise(() => form.handleSubmit(Option.isSome(span) ? { currentSpan: span.value, ...meta } : meta))
        )
    )

  const handleSubmitEffect: {
    (options: { checkErrors: true; meta?: Record<string, any> }): Effect.Effect<void, FormErrors<From>>
    (options?: { meta?: Record<string, any> }): Effect.Effect<void>
  } = (
    options?: { meta?: Record<string, any>; checkErrors?: true }
  ): any =>
    options?.checkErrors
      ? handleSubmitEffect_(options?.meta).pipe(Effect.flatMap(Effect.fnUntraced(function*() {
        const errors = form.getAllErrors()
        if (Object.keys(errors.fields).length || errors.form.errors.length) {
          return yield* new FormErrors({ form: errors.form, fields: errors.fields })
        }
      })))
      : handleSubmitEffect_(options?.meta)

  const handleSubmit = form.handleSubmit

  const fieldMap = ref(new Map<string, { label: string; id: string }>())

  const formWithExtras: OF<From, To> = Object.assign(form, {
    i18nNamespace: omegaConfig?.i18nNamespace,
    ignorePreventCloseEvents: omegaConfig?.ignorePreventCloseEvents,
    meta,
    clear,
    handleSubmit: (meta?: Record<string, any>) => {
      const span = api.trace.getSpan(api.context.active())
      return handleSubmit({ currentSpan: span, ...meta })
    },
    // /** @experimental */
    handleSubmitEffect,
    registerField: (field: ComputedRef<{ name: string; label: string; id: string }>) => {
      watch(field, (f) => fieldMap.value.set(f.name, { label: f.label, id: f.id }), { immediate: true })
      onUnmounted(() => fieldMap.value.delete(field.value.name)) // todo; perhap only when owned (id match)
    }
  })

  const errorContext = { form: formWithExtras, fieldMap }

  return Object.assign(formWithExtras, {
    // Type-level properties for performance optimization (not used at runtime)
    _paths: undefined as any,
    _keys: undefined as any,
    errorContext,
    Form: fHoc(formWithExtras)(OmegaForm as any) as any,
    Input: fHoc(formWithExtras)(omegaConfig?.input ?? OmegaInput) as any,
    TaggedUnion: fHoc(formWithExtras)(OmegaTaggedUnion) as any,
    Field: form.Field,
    Errors: eHoc(errorContext)(OmegaErrorsInternal) as any,
    Array: fHoc(formWithExtras)(OmegaArray) as any,
    AutoGen: fHoc(formWithExtras)(OmegaAutoGen as any) as any
  })
}
